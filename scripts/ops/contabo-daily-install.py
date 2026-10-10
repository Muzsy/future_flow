"""Install and operate four dedicated units, never restarting application units."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys

sys.dont_write_bytecode = True
ROOT = Path('/root/alterward-ops/daily')
UNIT_ROOT = Path('/etc/systemd/system')
UNITS = ['alterward-backup.service', 'alterward-backup.timer',
         'alterward-monitor.service', 'alterward-monitor.timer']


def service(action):
    return f'''[Unit]
Description=Alterward private {action}
After=docker.service network-online.target
Requires=docker.service
[Service]
Type=oneshot
User=root
Group=root
UMask=0077
Environment=PYTHONDONTWRITEBYTECODE=1
RuntimeDirectory=alterward-daily-work
RuntimeDirectoryMode=0700
RuntimeDirectoryPreserve=yes
ExecStart=/usr/bin/python3 /root/alterward-ops/daily/scripts/daily_entry.py --{action}
TimeoutStartSec={'360' if action == 'backup' else '120'}
TimeoutStopSec=30
MemoryMax=768M
CPUQuota=100%
Nice=10
IOSchedulingClass=idle
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/root/alterward-ops/daily /root/alterward-ops/owner/activation.lock /run/alterward-daily-work
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
StandardOutput=journal
StandardError=journal
'''


def unit_files():
    timer = '''[Unit]
Description=Alterward private {action} schedule
[Timer]
OnCalendar={calendar}
Persistent=true
RandomizedDelaySec=60
AccuracySec=30
Unit=alterward-{action}.service
[Install]
WantedBy=timers.target
'''
    return {'alterward-backup.service': service('backup'),
            'alterward-monitor.service': service('monitor'),
            'alterward-backup.timer': timer.format(action='backup', calendar='*-*-* 03:15:00 UTC'),
            'alterward-monitor.timer': timer.format(action='monitor', calendar='*-*-* *:00/15:00 UTC')}


def run(args, *, input=None, timeout=60):
    result = subprocess.run(args, input=input, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError('Scoped operation failed')
    return result.stdout


def install(request):
    config = {**request['config'], 'unitHashes': {name: hashlib.sha256(text.encode()).hexdigest() for name, text in unit_files().items()}}
    scripts = {name: base64.b64decode(value, validate=True) for name, value in request['scripts'].items()}
    if set(scripts) != {'backup_lib.py', 'contabo-daily.py', 'daily_entry.py'}:
        raise ValueError('Exact script set required')
    if {name: hashlib.sha256(value).hexdigest() for name, value in scripts.items()} != config['scriptHashes']:
        raise ValueError('Source hash mismatch')
    if ROOT.exists() or ROOT.is_symlink() or any((UNIT_ROOT / name).exists() or (UNIT_ROOT / name).is_symlink() for name in UNITS):
        raise ValueError('Existing installation requires a separate reviewed update')
    if config['retentionSeconds'] != 7 * 86400 or not re.fullmatch(r'age1[0-9a-z]{58}', config['recipient']):
        raise ValueError('Approved retention and public recipient required')
    ROOT.mkdir(mode=0o700)
    for name in ['scripts', 'backups', 'status']:
        (ROOT / name).mkdir(mode=0o700)
    work = Path('/run/alterward-daily-work')
    if work.exists() or work.is_symlink():
        raise ValueError('Existing daily shared-memory workspace')
    work.mkdir(mode=0o700)
    for name, data in scripts.items():
        (ROOT / 'scripts' / name).write_bytes(data)
    (ROOT / 'config.json').write_text(json.dumps(config, sort_keys=True))
    for name, text in unit_files().items():
        (UNIT_ROOT / name).write_text(text)
    run(['systemd-analyze', 'verify', *[str(UNIT_ROOT / n) for n in UNITS]])
    run(['systemctl', 'daemon-reload'])
    return {'installed': True, 'timersActivated': False, 'retentionDays': 7,
            'decryptionIdentityInstalled': False, 'applicationRestarted': False,
            'paidAiCalls': 0, 'sourceCommit': config['sourceCommit'], 'scriptHashes': config['scriptHashes'], 'unitHashes': config['unitHashes']}


def installed_daily():
    spec = importlib.util.spec_from_file_location('alterward_backup', ROOT / 'scripts/backup_lib.py')
    library = importlib.util.module_from_spec(spec)
    sys.modules['alterward_backup'] = library
    spec.loader.exec_module(library)
    spec = importlib.util.spec_from_file_location('alterward_daily', ROOT / 'scripts/contabo-daily.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.config()
    return module


def update_scripts(request, daily):
    previous = daily.config()
    candidate = {**request['config'], 'unitHashes': {name: hashlib.sha256(text.encode()).hexdigest() for name, text in unit_files().items()}}
    if request['previousScriptHashes'] != previous['scriptHashes']:
        raise ValueError('Exact previous source hashes required')
    if {k: v for k, v in previous.items() if k not in ['scriptHashes', 'sourceCommit', 'unitHashes']} != {
            k: v for k, v in candidate.items() if k not in ['scriptHashes', 'sourceCommit', 'unitHashes']}:
        raise ValueError('Daily update may change only code and its source commit')
    scripts = {n: base64.b64decode(v, validate=True) for n, v in request['scripts'].items()}
    if set(scripts) != set(previous['scriptHashes']) or {
            n: hashlib.sha256(v).hexdigest() for n, v in scripts.items()} != candidate['scriptHashes']:
        raise ValueError('Candidate source hashes invalid')
    if not re.fullmatch(r'[a-f0-9]{40}', candidate['sourceCommit']):
        raise ValueError('Committed source required')
    for name in UNITS:
        state = run(['systemctl', 'show', name, '--property=ActiveState', '--value']).decode().strip()
        if state in ['active', 'activating', 'deactivating', 'reloading']:
            raise ValueError('Deactivate only the dedicated timers before updating daily code')
        current = daily.regular(UNIT_ROOT / name)
        # One reviewed migration from the exact pre-audit unit template. Later
        # changes require the hashes already stored by a successful installation.
        legacy = unit_files()[name].replace('RuntimeDirectory=alterward-daily-work\nRuntimeDirectoryMode=0700\nRuntimeDirectoryPreserve=yes\n', '').replace('/run/alterward-daily-work', '/dev/shm/alterward-daily-work').encode()
        expected = previous.get('unitHashes', {}).get(name, hashlib.sha256(legacy).hexdigest())
        if daily.digest(current) != expected:
            raise ValueError('Existing daily unit changed')
    baseline = daily.stable_state()
    with daily.exclusive(ROOT / 'job.lock'), daily.exclusive(daily.OWNER / 'activation.lock'):
        archive = ROOT / ('previous-' + candidate['sourceCommit'])
        archive.mkdir(mode=0o700)
        originals = {n: daily.regular(ROOT / 'scripts' / n) for n in scripts}
        originals['config.json'] = daily.regular(ROOT / 'config.json')
        originals.update({name: daily.regular(UNIT_ROOT / name) for name in UNITS})
        for name, content in originals.items():
            daily.durable_file(archive / name, content)
        def replace(path, content):
            import tempfile
            daily.regular(path)
            fd, temp = tempfile.mkstemp(prefix='.daily-update-', dir=path.parent)
            try:
                with os.fdopen(fd, 'wb') as handle:
                    os.fchmod(handle.fileno(), 0o600)
                    handle.write(content)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temp, path)
            finally:
                if os.path.exists(temp):
                    os.unlink(temp)
        try:
            for name, content in scripts.items():
                replace(ROOT / 'scripts' / name, content)
            for name, content in unit_files().items():
                replace(UNIT_ROOT / name, content.encode())
            run(['systemd-analyze', 'verify', *[str(UNIT_ROOT / n) for n in UNITS]])
            replace(ROOT / 'config.json', json.dumps(candidate, sort_keys=True).encode())
            run(['systemctl', 'daemon-reload'])
        except Exception:
            for name, content in originals.items():
                replace(UNIT_ROOT / name if name in UNITS else ROOT / 'config.json' if name == 'config.json' else ROOT / 'scripts' / name, content)
            run(['systemctl', 'daemon-reload'])
            raise
    if daily.stable_state() != baseline:
        raise ValueError('Daily source update changed existing containers')
    return {'updated': True, 'sourceCommit': candidate['sourceCommit'],
            'scriptHashes': candidate['scriptHashes'], 'unitHashes': candidate['unitHashes'], 'retentionDays': 7,
            'recipientChanged': False, 'timersActivated': False,
            'allExistingContainersUnchanged': True, 'paidAiCalls': 0}


def main(request):
    os.umask(0o077)
    if os.geteuid() != 0:
        raise ValueError('Root-only setup')
    if request['action'] == 'prepare':
        return install(request)
    daily = installed_daily()
    action = request['action']
    if action == 'update':
        return update_scripts(request, daily)
    if action in ['backup', 'monitor']:
        baseline = daily.stable_state()
        started = daily.utcnow()
        run(['systemctl', 'start', 'alterward-' + action + '.service'], timeout=390)
        value = json.loads(daily.regular(ROOT / 'status' / (action + '.json')))
        if (not value.get('ok') or not daily.current_proof(value, daily.config(), 600) or
                __import__('datetime').datetime.fromisoformat(value['capturedAt']) < started or
                daily.stable_state() != baseline):
            raise ValueError('Runtime or daily operation failed')
        return value
    if action in ['status', 'inventory']:
        with daily.exclusive(ROOT / 'job.lock'):
            daily.clean_pending()
            records = daily.completed_archives(ROOT / 'backups')
            return {'status': daily.status_snapshot(daily.config()), 'manifests': [r['manifest'] for r in records],
                    'units': {name: run(['systemctl', 'show', name, '--property=ActiveState,UnitFileState,NextElapseUSecRealtime,Result']).decode().splitlines() for name in UNITS}}
    if action == 'activate':
        with daily.exclusive(ROOT / 'job.lock'), daily.exclusive(daily.OWNER / 'activation.lock'):
            value = daily.config()
            status = daily.status_snapshot(value)
            proof = request['restoreProof']
            recorded = json.loads(daily.regular(ROOT / 'status' / 'restore.json'))
            if (not status['backup'].get('ok') or not status['monitor'].get('ok') or
                    not daily.current_proof(proof, value, 6 * 3600) or
                    not daily.current_proof(recorded, value, 6 * 3600) or
                    any(proof.get(k) != recorded.get(k) for k in ['runId', 'encryptedFiles', 'sourceCommit', 'scriptHashes', 'unitHashes']) or
                    proof.get('runId') != status['backup']['runId'] or
                    not recorded.get('offsiteCiphertextVerified') or not recorded.get('tamperedCiphertextRejected') or
                    recorded.get('tablesRestoredAndDataMatched') != status['backup']['tables'] or
                    not recorded.get('temporaryContainersRemoved') or not recorded.get('temporaryPlaintextRemoved')):
                raise ValueError('Fresh current-source capture, monitor and server-recorded offsite restore required')
            daily.owner_runtime()
            baseline = daily.stable_state()
            run(['systemctl', 'enable', '--now', 'alterward-backup.timer', 'alterward-monitor.timer'])
            if daily.stable_state() != baseline:
                raise ValueError('Timer activation changed existing containers')
        return {'timersActivated': True, 'dailyUtc': '03:15', 'monitorMinutes': 15,
                'retentionDays': 7, 'offsiteRestoreVerified': True,
                'allExistingContainersUnchanged': True, 'paidAiCalls': 0,
                'externalMessageSent': False}
    if action == 'disable':
        run(['systemctl', 'disable', '--now', 'alterward-backup.timer', 'alterward-monitor.timer'])
        return {'timersActivated': False, 'archivesDeleted': False, 'applicationRestarted': False}
    if action == 'rehearse':
        library = sys.modules['alterward_backup']
        with daily.exclusive(ROOT / 'job.lock'), daily.exclusive(daily.OWNER / 'activation.lock'):
            value = daily.config()
            manifest = request['manifest']
            records = daily.completed_archives(ROOT / 'backups')
            current = next((r['manifest'] for r in records if r['manifest']['runId'] == manifest['runId']), None)
            if current != manifest or any(manifest.get(k) != v for k, v in daily.source_binding(value).items()):
                raise ValueError('Exact server archive and current source required for activation rehearsal')
            baseline = daily.stable_state()
            proof = library.rehearse(request)
            if daily.stable_state() != baseline:
                raise ValueError('Restore changed live containers')
            proof.update({**daily.source_binding(value), 'encryptedFiles': manifest['encryptedFiles'],
                          'capturedAt': daily.utcnow().isoformat(), 'allExistingContainersUnchanged': True})
            daily.atomic(ROOT / 'status' / 'restore.json', proof)
            return proof
    raise ValueError('Unknown scoped action')


if __name__ == '__main__':
    try:
        print(json.dumps({'ok': True, 'result': main(json.load(sys.stdin))}))
    except Exception:
        print('{"ok":false,"phase":"daily-operator"}')
        sys.exit(1)
