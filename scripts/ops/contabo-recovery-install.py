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
                not value.get('independentClockVerified') or not value.get('capturedThisRun') or
                not value.get('existingContainersUnchanged') or
                not 0 <= (now - dt_time(value['capturedAt'])).total_seconds() <= 3600 or
                not 0 <= (now - dt_time(value['lastCaptureAt'])).total_seconds() <= 3600 or
                any(value.get(k) != config[k] for k in ['sourceCommit', 'scriptHashes', 'unitHashes'])):
            raise ValueError('Fresh actual managed capture/service proof required')
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
