"""Install/verify two scoped recovery units. No credentials or live restore."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path('/root/alterward-ops/recovery-lifecycle')
UNITS = Path('/etc/systemd/system')
SOURCES = {'lifecycle.py', 'managed.py', 'expiry.py', 'local.py', 'legacy.py', 'catalog.mjs'}


def units():
    return {'alterward-recovery.service': '''[Unit]
Description=Alterward encrypted managed recovery lifecycle
After=docker.service network-online.target
Requires=docker.service
[Service]
Type=oneshot
User=root
Group=root
UMask=0077
Environment=PYTHONDONTWRITEBYTECODE=1
RuntimeDirectory=alterward-recovery-work
RuntimeDirectoryMode=0700
RuntimeDirectoryPreserve=yes
ExecStart=/usr/bin/python3 -I /root/alterward-ops/recovery-lifecycle/scripts/lifecycle.py
TimeoutStartSec=420
TimeoutStopSec=30
MemoryMax=768M
CPUQuota=100%
Nice=10
IOSchedulingClass=idle
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/root/alterward-ops/recovery-lifecycle /root/alterward-ops/managed-recovery /root/alterward-ops/legacy-retention /root/alterward-ops/backups /root/alterward-ops/daily/job.lock /root/alterward-ops/owner/activation.lock /run/alterward-recovery-work
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
StandardOutput=journal
StandardError=journal
''', 'alterward-recovery.timer': '''[Unit]
Description=Alterward recovery capture and expiry check
[Timer]
OnCalendar=*-*-* *:07/15:00 UTC
Persistent=true
RandomizedDelaySec=30
AccuracySec=15
Unit=alterward-recovery.service
[Install]
WantedBy=timers.target
'''}


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    sys.modules[name] = value
    spec.loader.exec_module(value)
    return value


def run(args, timeout=60):
    result = subprocess.run(args, capture_output=True, timeout=timeout)
    if result.returncode:
        raise ValueError('Scoped recovery setup failed')
    return result.stdout


def local_attestation(request, config, daily, expiry, legacy):
    required = {'action', 'ok', 'sourceCommit', 'observedAt', 'managedArchives', 'legacyPolicyDigest'}
    if (set(request) != required or request['action'] != 'record-local' or type(request['ok']) is not bool or
            not re.fullmatch(r'[a-f0-9]{40}', request['sourceCommit']) or
            not re.fullmatch(r'[a-f0-9]{64}', request['legacyPolicyDigest']) or
            type(request['managedArchives']) is not int or not 0 <= request['managedArchives'] <= 100):
        raise ValueError('Bounded original local attestation required')
    now = daily.utcnow()
    if abs((now - dt_time(request['observedAt'])).total_seconds()) > 300:
        raise ValueError('Fresh local UTC attestation required')
    if request['ok']:
        catalog = expiry.catalog(expiry.ROOT, config['projectBinding'], now)
        original = legacy.expire(Path('/root/alterward-ops/legacy-retention'), Path('/root/alterward-ops/backups'), now)
        if (request['managedArchives'] < 1 or request['managedArchives'] != len(catalog['freshRuns']) or
                request['legacyPolicyDigest'] != original['policyDigest']):
            raise ValueError('Current server/local metadata relationship required')
    return {'ok': request['ok'], 'capturedAt': now.isoformat(),
        'installedSourceCommit': config['sourceCommit'], 'localSourceCommit': request['sourceCommit'],
        'managedArchives': request['managedArchives'], 'operatorAttestation': True}


def local_expiry_preconditions(config, daily, expiry):
    now = daily.utcnow()
    catalog = expiry.catalog(expiry.ROOT, config['projectBinding'], now)
    captures = [dt_time(catalog['expectedManifests'][run]['capturedAt']) for run in catalog['freshRuns']]
    if not captures or not 0 <= (now - max(captures)).total_seconds() <= 26 * 3600:
        raise ValueError('Fresh managed capture required before local historical expiry')
    daily_config = daily.config()
    backup = daily.status_snapshot(daily_config)['backup']
    if backup.get('ok') is not True or not daily.current_proof(backup, daily_config, 26 * 3600):
        raise ValueError('Fresh application backup required before local historical expiry')
    return {'localExpiryPreconditionsVerified': True, 'observedAt': now.isoformat(),
            'managedCapturedAt': max(captures).isoformat(), 'applicationCapturedAt': backup['capturedAt'],
            'installedSourceCommit': config['sourceCommit']}


# Retention and expiry policy sources are never replaced by an update; changing
# them stays a separate reviewed installation decision.
UPDATABLE = {'lifecycle.py', 'managed.py', 'catalog.mjs'}


def update_sources(request, config, root=ROOT):
    """Replace only reviewed capture sources of an existing installation.

    Compare-and-swap on the installed commit; units, project binding and the
    retention/expiry sources stay byte-identical. The previous sources and
    capture evidence are kept beside the new ones, never deleted.
    """
    if (set(request) != {'action', 'sourceCommit', 'previousSourceCommit', 'scripts'} or
            not re.fullmatch(r'[a-f0-9]{40}', request['sourceCommit']) or
            request['previousSourceCommit'] != config['sourceCommit'] or
            request['sourceCommit'] == config['sourceCommit'] or
            not isinstance(request['scripts'], dict) or set(request['scripts']) != SOURCES):
        raise ValueError('Exact compare-and-swap source update required')
    scripts = {k: base64.b64decode(v, validate=True) for k, v in request['scripts'].items()}
    if any(len(v) > 256 * 1024 for v in scripts.values()):
        raise ValueError('Bounded reviewed sources required')
    hashes = {k: hashlib.sha256(v).hexdigest() for k, v in scripts.items()}
    changed = sorted(k for k in SOURCES if hashes[k] != config['scriptHashes'][k])
    if not changed or set(changed) - UPDATABLE:
        raise ValueError('Only reviewed capture sources may change in an update')
    if config['unitHashes'] != {k: hashlib.sha256(v.encode()).hexdigest() for k, v in units().items()}:
        raise ValueError('Unit change requires separate reviewed installation')
    stage = root / ('.update-' + request['sourceCommit'])
    keep = root / ('scripts-' + config['sourceCommit'])
    kept_capture = root / ('capture-' + config['sourceCommit'] + '.json')
    if any(p.exists() or p.is_symlink() for p in (stage, keep, kept_capture)):
        raise ValueError('Existing update evidence refused')
    new_config = {**config, 'sourceCommit': request['sourceCommit'], 'scriptHashes': hashes}
    capture_path = root / 'capture.json'
    capture = json.loads(capture_path.read_bytes()) if capture_path.exists() else None
    return {'stage': stage, 'keep': keep, 'scripts': scripts, 'config': new_config,
            'capture': capture, 'changed': changed}


def apply_update(plan, config, daily, root=ROOT):
    stage, keep = plan['stage'], plan['keep']
    stage.mkdir(mode=0o700)
    for name, content in plan['scripts'].items():
        daily.durable_file(stage / name, content)
    daily.expiry_sync(stage)
    if plan['capture'] is not None:
        daily.durable_file(root / ('capture-' + config['sourceCommit'] + '.json'),
                           json.dumps(plan['capture'], sort_keys=True).encode())
    os.rename(root / 'scripts', keep)
    try:
        os.rename(stage, root / 'scripts')
        if plan['capture'] is not None:
            # The capture facts stay; only their source binding moves forward.
            daily.atomic(root / 'capture.json', {**plan['capture'],
                **{k: plan['config'][k] for k in ['sourceCommit', 'scriptHashes', 'unitHashes']}})
        daily.atomic(root / 'config.json', plan['config'])
        daily.expiry_sync(root)
    except Exception:
        # Restore the complete previous binding: sources, capture, config.
        if (root / 'scripts').exists():
            os.rename(root / 'scripts', stage)
        os.rename(keep, root / 'scripts')
        if plan['capture'] is not None:
            daily.atomic(root / 'capture.json', plan['capture'])
            (root / ('capture-' + config['sourceCommit'] + '.json')).unlink()
        daily.atomic(root / 'config.json', config)
        # Only the unused copies of the new sources are removed, so a retry can start clean.
        for name in plan['scripts']:
            (stage / name).unlink()
        stage.rmdir()
        raise
    return {'updated': True, 'previousSourceCommit': config['sourceCommit'],
            'sourceCommit': plan['config']['sourceCommit'], 'changedScripts': plan['changed'],
            'previousSourcesKept': True, 'unitsChanged': False, 'timerChanged': False, 'paidAiCalls': 0}


def main(request):
    os.umask(0o077);sys.dont_write_bytecode = True
    if os.geteuid() != 0:
        raise ValueError('Root-only recovery setup')
    load('alterward_backup', Path('/root/alterward-ops/daily/scripts/backup_lib.py'))
    daily = load('alterward_daily', Path('/root/alterward-ops/daily/scripts/contabo-daily.py'))
    daily.config()
    action = request.get('action')
    if action == 'install':
        if set(request) != {'action', 'sourceCommit', 'scripts', 'projectBinding', 'legacyPolicyDigest'}:
            raise ValueError('Exact approved installation request')
        if ROOT.exists() or ROOT.is_symlink() or any((UNITS / name).exists() or (UNITS / name).is_symlink() for name in units()):
            raise ValueError('Existing recovery installation requires separate reviewed update')
        if (not re.fullmatch(r'[a-f0-9]{40}', request['sourceCommit']) or
                not re.fullmatch(r'[a-f0-9]{64}', request['projectBinding']) or
                not re.fullmatch(r'[a-f0-9]{64}', request['legacyPolicyDigest']) or
                set(request['scripts']) != SOURCES):
            raise ValueError('Committed finite recovery binding required')
        scripts = {k: base64.b64decode(v, validate=True) for k, v in request['scripts'].items()}
        if any(len(v) > 256 * 1024 for v in scripts.values()):
            raise ValueError('Bounded reviewed sources required')
        with daily.exclusive(daily.ROOT / 'job.lock'), daily.exclusive(daily.OWNER / 'activation.lock'):
            daily.owner_runtime()
            before = daily.stable_state()
            daily.private_dir(Path('/root/alterward-ops/managed-recovery'))
            daily.private_dir(Path('/root/alterward-ops/legacy-retention'))
            # Validate the existing finite enrollment before publishing units.
            expiry_path = Path('/run/alterward-recovery-install')
            if expiry_path.exists() or expiry_path.is_symlink():
                raise ValueError('Existing installation fixture refused')
            expiry_path.mkdir(mode=0o700)
            try:
                for name in ['expiry.py', 'local.py', 'legacy.py']:
                    daily.durable_file(expiry_path / name, scripts[name])
                load('alterward_managed_expiry', expiry_path / 'expiry.py')
                load('alterward_managed_local', expiry_path / 'local.py')
                legacy = load('alterward_legacy', expiry_path / 'legacy.py')
                proof = legacy.expire(Path('/root/alterward-ops/legacy-retention'), Path('/root/alterward-ops/backups'), daily.utcnow())
                if proof['policyDigest'] != request['legacyPolicyDigest'] or proof['knownRuns'] != 3:
                    raise ValueError('Original three-run policy must match')
            finally:
                for name in ['expiry.py', 'local.py', 'legacy.py']:
                    path = expiry_path / name
                    if path.exists():
                        daily.regular(path);path.unlink()
                expiry_path.rmdir()
            ROOT.mkdir(mode=0o700);(ROOT / 'scripts').mkdir(mode=0o700)
            for name, content in scripts.items():
                daily.durable_file(ROOT / 'scripts' / name, content)
            config = {'schemaVersion': 'alterward-recovery-lifecycle-1', 'sourceCommit': request['sourceCommit'],
                'projectBinding': request['projectBinding'],
                'scriptHashes': {k: hashlib.sha256(v).hexdigest() for k, v in scripts.items()},
                'unitHashes': {k: hashlib.sha256(v.encode()).hexdigest() for k, v in units().items()}}
            daily.durable_file(ROOT / 'config.json', json.dumps(config, sort_keys=True).encode())
            for name, content in units().items():
                daily.durable_file(UNITS / name, content.encode())
            run(['systemd-analyze', 'verify', *[str(UNITS / name) for name in units()]])
            run(['systemctl', 'daemon-reload'])
            if daily.stable_state() != before:
                raise ValueError('Existing containers changed')
        return {'installed': True, 'timerActivated': False, 'sourceCommit': config['sourceCommit'],
                'decryptionIdentityInstalled': False, 'credentialsCopied': False, 'paidAiCalls': 0}
    if action == 'update':
        lifecycle = load('alterward_recovery_lifecycle', ROOT / 'scripts/lifecycle.py')
        config, daily, _, _, _ = lifecycle.load()  # Verifies the installed binding first.
        with daily.exclusive(daily.ROOT / 'job.lock'), daily.exclusive(daily.OWNER / 'activation.lock'):
            plan = update_sources(request, config)
            before = daily.stable_state()
            result = apply_update(plan, config, daily)
            lifecycle.load()  # The new sources must match the new binding exactly.
            if daily.stable_state() != before:
                raise ValueError('Existing containers changed')
        return result
    if action == 'record-local':
        lifecycle = load('alterward_recovery_lifecycle', ROOT / 'scripts/lifecycle.py')
        config, daily, expiry, legacy, _ = lifecycle.load()
        with daily.exclusive(daily.ROOT / 'job.lock'), daily.exclusive(daily.OWNER / 'activation.lock'):
            value = local_attestation(request, config, daily, expiry, legacy)
            daily.atomic(ROOT / 'local-sync.json', value)
        return {'localAttestationRecorded': True, 'ok': request['ok'], 'privateDataReceived': False}
    if action == 'local-preconditions' and set(request) == {'action'}:
        lifecycle = load('alterward_recovery_lifecycle', ROOT / 'scripts/lifecycle.py')
        config, daily, expiry, _, _ = lifecycle.load()
        with daily.exclusive(daily.ROOT / 'job.lock'), daily.exclusive(daily.OWNER / 'activation.lock'):
            return local_expiry_preconditions(config, daily, expiry)
    if action not in {'run', 'status', 'activate', 'disable'} or set(request) != {'action'}:
        raise ValueError('Explicit scoped lifecycle action required')
    lifecycle = load('alterward_recovery_lifecycle', ROOT / 'scripts/lifecycle.py')
    config, daily, _, _, _ = lifecycle.load()
    if action == 'run':
        started = daily.utcnow()
        run(['systemctl', 'start', 'alterward-recovery.service'], timeout=450)
        value = json.loads(daily.regular(ROOT / 'status.json'))
        if (not value.get('ok') or dt_time(value['capturedAt']) < started or
                any(value.get(k) != config[k] for k in ['sourceCommit', 'scriptHashes', 'unitHashes'])):
            raise ValueError('Actual new source-bound service proof required')
        return value
    if action == 'status':
        return json.loads(daily.regular(ROOT / 'status.json'))
    if action == 'activate':
        value = json.loads(daily.regular(ROOT / 'status.json'))
        now = daily.utcnow()
        if (not value.get('ok') or not value.get('databaseTlsVerified') or
                not value.get('independentClockVerified') or
                not value.get('existingContainersUnchanged') or
                not 0 <= (now - dt_time(value['capturedAt'])).total_seconds() <= 3600 or
                not 0 <= (now - dt_time(value['lastCaptureAt'])).total_seconds() <= 3600 or
                any(value.get(k) != config[k] for k in ['sourceCommit', 'scriptHashes', 'unitHashes'])):
            raise ValueError('Fresh actual managed capture/service proof required')
        local = json.loads(daily.regular(ROOT / 'local-sync.json'))
        if (local.get('ok') is not True or local.get('installedSourceCommit') != config['sourceCommit'] or
                not 0 <= (now - dt_time(local['capturedAt'])).total_seconds() <= 3600):
            raise ValueError('Fresh original local-copy attestation required')
        marker = Path('/root/alterward-ops/external-health/require-recovery.json')
        required = {'schemaVersion': 'alterward-recovery-required-1', 'required': True}
        if marker.exists() or marker.is_symlink():
            if json.loads(daily.regular(marker)) != required:
                raise ValueError('Original recovery-required marker only')
        else:
            daily.durable_file(marker, json.dumps(required, sort_keys=True).encode())
            daily.expiry_sync(marker.parent)
        run(['systemctl', 'enable', '--now', 'alterward-recovery.timer'])
        return {'timerActivated': True, 'checkMinutes': 15, 'captureIntervalHours': 23,
                'sourceCommit': config['sourceCommit'], 'paidAiCalls': 0, 'automaticRestoreAllowed': False}
    run(['systemctl', 'disable', '--now', 'alterward-recovery.timer'])
    return {'timerActivated': False, 'archivesDeleted': False}


def dt_time(value):
    import datetime as dt
    parsed = dt.datetime.fromisoformat(value)
    if parsed.utcoffset() != dt.timedelta(0):
        raise ValueError('UTC proof required')
    return parsed


if __name__ == '__main__':
    try:
        print(json.dumps({'ok': True, 'result': main(json.load(sys.stdin))}))
    except Exception:
        print('{"ok":false,"phase":"recovery-install"}')
        sys.exit(1)
