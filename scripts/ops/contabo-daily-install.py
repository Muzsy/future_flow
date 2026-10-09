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
ReadWritePaths=/root/alterward-ops/daily /root/alterward-ops/owner/activation.lock /dev/shm/alterward-daily-work
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
    config = request['config']
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
    work = Path('/dev/shm/alterward-daily-work')
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
            'paidAiCalls': 0, 'sourceCommit': config['sourceCommit'], 'scriptHashes': config['scriptHashes']}


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


def main(request):
    os.umask(0o077)
    if os.geteuid() != 0:
        raise ValueError('Root-only setup')
    if request['action'] == 'prepare':
        return install(request)
    daily = installed_daily()
    action = request['action']
    if action in ['backup', 'monitor']:
        baseline = daily.stable_state()
        run(['systemctl', 'start', 'alterward-' + action + '.service'], timeout=390)
        value = json.loads(daily.regular(ROOT / 'status' / (action + '.json')))
        if not value.get('ok') or daily.stable_state() != baseline:
            raise ValueError('Runtime or daily operation failed')
        return value
    if action in ['status', 'inventory']:
        records = daily.completed_archives(ROOT / 'backups')
        return {'status': daily.main('status'), 'manifests': [r['manifest'] for r in records],
                'units': {name: run(['systemctl', 'show', name, '--property=ActiveState,UnitFileState,NextElapseUSecRealtime,Result']).decode().splitlines() for name in UNITS}}
    if action == 'activate':
        status = daily.main('status')
        proof = request['restoreProof']
        if (not status['backup'].get('ok') or not status['monitor'].get('ok') or
                proof.get('runId') != status['backup']['runId'] or
                not proof.get('offsiteCiphertextVerified') or not proof.get('tamperedCiphertextRejected') or
                proof.get('tablesRestoredAndDataMatched') != status['backup']['tables'] or
                not proof.get('temporaryContainersRemoved') or not proof.get('temporaryPlaintextRemoved')):
            raise ValueError('Successful capture, monitor and offsite restore required')
        daily.atomic(ROOT / 'status' / 'restore.json', proof)
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
        baseline = daily.stable_state()
        proof = library.rehearse(request)
        if daily.stable_state() != baseline:
            raise ValueError('Restore changed live containers')
        proof['allExistingContainersUnchanged'] = True
        return proof
    raise ValueError('Unknown scoped action')


if __name__ == '__main__':
    try:
        print(json.dumps({'ok': True, 'result': main(json.load(sys.stdin))}))
    except Exception:
        print('{"ok":false,"phase":"daily-operator"}')
        sys.exit(1)
