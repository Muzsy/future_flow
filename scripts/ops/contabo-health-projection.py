"""Forced-command SSH projection of existing private owner monitoring.

Reads bounded original daily configuration/status only. No shell, database,
Docker, key, archive, provider, notification or write operation is performed.
"""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat

ROOT = Path('/root/alterward-ops/daily')
UID = 0
CHECKS = ('sourceBindingCurrent', 'monitorRecordCurrent', 'backupRecordCurrent',
          'workerRuntimeHealthy', 'databaseTlsHealthy', 'accessBoundaryClosed',
          'backupFresh', 'diskSpaceHealthy', 'originCertificateHealthy')
SCRIPTS = {'contabo-daily.py', 'backup_lib.py', 'daily_entry.py'}
UNITS = {'alterward-backup.service', 'alterward-backup.timer',
         'alterward-monitor.service', 'alterward-monitor.timer'}


def read(path):
    if path.resolve() != path.absolute():
        raise ValueError('Original projection input required')
    before = path.lstat()
    if (not stat.S_ISREG(before.st_mode) or before.st_uid != UID or before.st_nlink != 1 or
            stat.S_IMODE(before.st_mode) != 0o600 or before.st_size > 1024**2):
        raise ValueError('Bounded private projection input required')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        def identity(value):
            return (value.st_dev, value.st_ino, value.st_mode, value.st_uid, value.st_gid,
                    value.st_nlink, value.st_size, value.st_mtime_ns, value.st_ctime_ns)
        if identity(opened) != identity(before):
            raise ValueError('Projection input replaced before open')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            data = stream.read(1024**2 + 1)
        if identity(os.fstat(fd)) != identity(before) or identity(path.lstat()) != identity(before) or len(data) != before.st_size:
            raise ValueError('Projection input changed during read')
        return data
    finally:
        os.close(fd)


def current(record, config, now, age, require_ok=True):
    try:
        captured = dt.datetime.fromisoformat(record['capturedAt'])
        return ((not require_ok or record.get('ok') is True) and captured.utcoffset() == dt.timedelta(0) and
                0 <= (now - captured).total_seconds() <= age and
                all(record.get(k) == config[k] for k in ('sourceCommit', 'scriptHashes', 'unitHashes')))
    except (KeyError, TypeError, ValueError):
        return False


def recovery_current(root, now, unit_root):
    try:
        return recovery_projection(root, now, unit_root)
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return False


def recovery_projection(root, now, unit_root):
    # Installation is optional during the owner-only rollout. Once present,
    # the fixed root-only lifecycle source/status becomes part of backup health.
    if not root.exists() and not root.is_symlink():
        marker = root.parent / 'external-health/require-recovery.json'
        return not marker.exists() and not marker.is_symlink()
    config = json.loads(read(root / 'config.json'))
    scripts = {'lifecycle.py', 'managed.py', 'expiry.py', 'local.py', 'legacy.py', 'catalog.mjs'}
    units = {'alterward-recovery.service', 'alterward-recovery.timer'}
    if (config.get('schemaVersion') != 'alterward-recovery-lifecycle-1' or
            not re.fullmatch(r'[a-f0-9]{40}', config.get('sourceCommit', '')) or
            set(config.get('scriptHashes', {})) != scripts or set(config.get('unitHashes', {})) != units):
        return False
    for files, parent in [(config['scriptHashes'], root / 'scripts'), (config['unitHashes'], unit_root)]:
        for name, expected in files.items():
            if not re.fullmatch(r'[a-f0-9]{64}', expected) or hashlib.sha256(read(parent / name)).hexdigest() != expected:
                return False
    status = json.loads(read(root / 'status.json'))
    local = json.loads(read(root / 'local-sync.json'))
    local_stamp = dt.datetime.fromisoformat(local['capturedAt'])
    captured = dt.datetime.fromisoformat(status['lastCaptureAt'])
    return (current(status, config, now, 30 * 60) and
            local.get('ok') is True and local.get('installedSourceCommit') == config['sourceCommit'] and
            local_stamp.utcoffset() == dt.timedelta(0) and 0 <= (now - local_stamp).total_seconds() <= 26 * 3600 and
            captured.utcoffset() == dt.timedelta(0) and 0 <= (now - captured).total_seconds() <= 26 * 3600 and
            status.get('databaseTlsVerified') is True and status.get('independentClockVerified') is True and
            status.get('existingContainersUnchanged') is True and status.get('automaticRestoreAllowed') is False)


def projection(root, now, unit_root=Path('/etc/systemd/system'), recovery_root=Path('/root/alterward-ops/recovery-lifecycle')):
    config = json.loads(read(root / 'config.json'))
    if (config['schemaVersion'] != 'alterward-daily-1' or config['retentionSeconds'] != 7 * 86400 or
            not re.fullmatch(r'[a-f0-9]{40}', config['sourceCommit']) or
            set(config['scriptHashes']) != SCRIPTS or set(config['unitHashes']) != UNITS):
        raise ValueError('Original installed daily binding required')
    binding = True
    for paths, directory in ((config['scriptHashes'], root / 'scripts'), (config['unitHashes'], unit_root)):
        for name, expected in paths.items():
            if not re.fullmatch(r'[a-f0-9]{64}', expected):
                raise ValueError('Exact source digest required')
            binding = binding and hashlib.sha256(read(directory / name)).hexdigest() == expected
    monitor = json.loads(read(root / 'status' / 'monitor.json'))
    backup = json.loads(read(root / 'status' / 'backup.json'))
    monitor_current = current(monitor, config, now, 30 * 60, require_ok=False)
    backup_current = current(backup, config, now, 26 * 3600)
    health = monitor.get('health', {})
    fresh = False
    try:
        last = dt.datetime.fromisoformat(health['lastBackupAt'])
        fresh = last.utcoffset() == dt.timedelta(0) and 0 <= (now - last).total_seconds() <= 26 * 3600
    except (KeyError, TypeError, ValueError):
        pass
    return {
        'sourceBindingCurrent': binding,
        'monitorRecordCurrent': monitor_current,
        'backupRecordCurrent': backup_current,
        # An overall monitor failure remains an alarm, including an unexpected
        # container-state change. Other valid health bits still aid diagnosis.
        'workerRuntimeHealthy': monitor_current and monitor.get('ok') is True and health.get('ownerHealthy') is True and health.get('queueHealthy', health.get('pendingJobs') == 0) is True,
        'databaseTlsHealthy': monitor_current and health.get('databaseTlsVerified') is True,
        'accessBoundaryClosed': monitor_current and health.get('edgeClosed') is True and health.get('anonymousDenied') == 4,
        'backupFresh': monitor_current and backup_current and fresh and health.get('backupFailed') is False and recovery_current(recovery_root, now, unit_root),
        'diskSpaceHealthy': monitor_current and type(health.get('diskFreeBytes')) is int and health['diskFreeBytes'] >= 2 * 1024**3,
        'originCertificateHealthy': monitor_current and health.get('originCertificateOver30Days') is True,
    }


def main():
    now = dt.datetime.now(dt.timezone.utc)
    checks = dict.fromkeys(CHECKS, False)
    source_hash = ''
    try:
        if os.geteuid() != UID or os.environ.get('SSH_ORIGINAL_COMMAND') != 'alterward-health-v1':
            raise ValueError('Only explicit health request allowed')
        source_hash = hashlib.sha256(read(Path(__file__).absolute())).hexdigest()
        checks = projection(ROOT, now)
    except Exception:
        pass
    value = {'schemaVersion': 'alterward-private-health-1', 'checkedAt': now.isoformat(),
             'sourceSha256': source_hash, 'checks': checks, 'ok': all(checks.values())}
    print(json.dumps(value, separators=(',', ':')))
    return 0 if value['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
