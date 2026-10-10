"""Explicit expiry of complete, locally attested managed-recovery v2 archives.

No scheduler, key access, decryption, database, container or service operations.
Historical/daily archives and local copies have separate retention procedures.
"""
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat

ROOT = Path('/root/alterward-ops/managed-recovery')
FILES = {'managed.dump.age', 'catalog.json.age', 'manifest.json'}
JOURNAL = 'expiry-journal'
PG_IMAGE = 'sha256:589f742565e4f6d22149176b032974f55f8201a8a37b71ed587ec5c6902e689f'
RUN_ID = re.compile(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}')
SHA = re.compile(r'[a-f0-9]{64}')
UID = 0
LOCK_PATHS = (Path('/root/alterward-ops/daily/job.lock'),
              Path('/root/alterward-ops/owner/activation.lock'))


def fingerprint(data):
    return hashlib.sha256(data).hexdigest()


def directory(path):
    value = path.lstat()
    if (path.resolve() != path or not stat.S_ISDIR(value.st_mode) or
            value.st_uid != UID or stat.S_IMODE(value.st_mode) != 0o700):
        raise ValueError('Original private archive directory required')
    return value


def original_file(path):
    before = path.lstat()
    if (path.resolve() != path or not stat.S_ISREG(before.st_mode) or
            before.st_uid != UID or before.st_nlink != 1 or
            stat.S_IMODE(before.st_mode) != 0o600 or before.st_size > 128 * 1024**2):
        raise ValueError('Bounded original private archive file required')
    with path.open('rb') as stream:
        opened = os.fstat(stream.fileno())
        if identity(opened) != identity(before):
            raise ValueError('Archive changed before read')
        data = stream.read(128 * 1024**2 + 1)
        after = os.fstat(stream.fileno())
    if (identity(before) != identity(after) or len(data) != before.st_size or
            identity(path.lstat()) != identity(before)):
        raise ValueError('Archive changed during read')
    return data, before


def identity(value):
    return (value.st_dev, value.st_ino, value.st_mode, value.st_uid,
            value.st_nlink, value.st_size, value.st_mtime_ns, value.st_ctime_ns)


def journal_records(root, project, now):
    """Immutable deletion intent survives a killed process without ciphertext."""
    path = root / JOURNAL
    if not path.exists() and not path.is_symlink():
        return {}
    directory(path)
    result = {}
    for entry in path.iterdir():
        if not re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}\.json', entry.name):
            raise ValueError('Unknown expiry journal entry')
        raw, _ = original_file(entry)
        if len(raw) > 2 * 1024**2:
            raise ValueError('Bounded expiry journal required')
        record = json.loads(raw)
        run = entry.name[:-5]
        if (set(record) != {'schemaVersion', 'manifest', 'rootIdentity',
                           'directoryIdentity', 'files'} or
                record['schemaVersion'] != 'alterward-server-expiry-1' or
                validate_manifest(record['manifest'], run, project, now) > now or
                len(record['rootIdentity']) != 2 or
                not all(type(v) is int for v in record['rootIdentity']) or
                len(record['directoryIdentity']) != 8 or
                not all(type(v) is int for v in record['directoryIdentity']) or
                set(record['files']) != FILES):
            raise ValueError('Exact expired original journal required')
        for name, item in record['files'].items():
            if (set(item) != {'identity', 'sha256', 'bytes'} or
                    len(item['identity']) != 8 or
                    not all(type(v) is int for v in item['identity']) or
                    not SHA.fullmatch(item['sha256']) or type(item['bytes']) is not int or
                    not 0 < item['bytes'] <= 128 * 1024**2 or
                    item['identity'][5] != item['bytes']):
                raise ValueError('Bounded original journal file required')
            if name != 'manifest.json' and {k: item[k] for k in ('sha256', 'bytes')} != record['manifest']['encryptedFiles'][name]:
                raise ValueError('Journal ciphertext differs from manifest')
        result[run] = record
        if len(result) > 100:
            raise ValueError('Bounded expiry history required')
    return result


def write_journal(root, record):
    path = root / JOURNAL
    if not path.exists():
        path.mkdir(mode=0o700)
    directory(path)
    data = (json.dumps(record, sort_keys=True, separators=(',', ':')) + '\n').encode()
    fd = os.open(path / (record['manifest']['runId'] + '.json'),
                 os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb', closefd=False) as stream:
            stream.write(data)
            stream.flush()
            os.fsync(fd)
    finally:
        os.close(fd)
    # The journal entry and its containing directory must be durable before
    # any ciphertext unlink. A torn journal fails closed for operator review.
    for directory_path in (path, root):
        fd = os.open(directory_path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def validate_manifest(manifest, run_id, project, now):
    if (manifest.get('schemaVersion') != 'alterward-managed-recovery-2' or
            manifest.get('runId') != run_id or not RUN_ID.fullmatch(run_id) or
            not isinstance(project, str) or not SHA.fullmatch(project) or
            manifest.get('projectBinding') != project or
            manifest.get('postgresImage') != PG_IMAGE or
            not re.fullmatch(r'[a-f0-9]{40}', manifest.get('sourceCommit', '')) or
            manifest.get('scope') != 'auth-storage-data-and-public-security' or
            manifest.get('publicDataIncluded') is not False or
            manifest.get('liveDatabaseWrites') is not False or
            manifest.get('restoreOrActivationAllowed') is not False or
            any(manifest.get(k) is not True for k in [
                'originalDailyRecipientMatched', 'ephemeralAuthDataExcludedAtCapture',
                'ephemeralStorageUploadDataExcludedAtCapture', 'authUserTokenColumnsClearedAtCapture'])):
        raise ValueError('Exact project-bound managed v2 manifest required')
    captured = dt.datetime.fromisoformat(manifest['capturedAt'])
    expires = dt.datetime.fromisoformat(manifest['expiresAt'])
    if (captured.utcoffset() != dt.timedelta(0) or
            expires.utcoffset() != dt.timedelta(0) or
            captured > now + dt.timedelta(seconds=30) or
            expires - captured != dt.timedelta(days=7)):
        raise ValueError('UTC capture and exact seven-day expiry required')
    encrypted = manifest['encryptedFiles']
    if set(encrypted) != FILES - {'manifest.json'}:
        raise ValueError('Exact ciphertext set required')
    for item in encrypted.values():
        if (set(item) != {'sha256', 'bytes'} or not isinstance(item['sha256'], str) or
                not SHA.fullmatch(item['sha256']) or type(item['bytes']) is not int or
                not 1 <= item['bytes'] <= 128 * 1024**2):
            raise ValueError('Bounded ciphertext hashes required')
    return expires


def inventory(root, expected, project, now):
    """Validate the entire batch before any deletion, including fresh archives."""
    if (now.utcoffset() != dt.timedelta(0) or not isinstance(expected, dict) or
            len(expected) > 100):
        raise ValueError('UTC clock and original local manifest inventory required')
    root_state = directory(root)
    journals = journal_records(root, project, now)
    names = {p.name for p in root.iterdir() if p.name != JOURNAL}
    if (names | set(journals) != set(expected) or
            any(not isinstance(n, str) or not RUN_ID.fullmatch(n) for n in expected)):
        raise ValueError('Complete original local manifest set must match server')
    records = []
    for name in sorted(expected):
        manifest = expected[name]
        expires = validate_manifest(manifest, name, project, now)
        pending = journals.get(name)
        if pending and pending['manifest'] != manifest:
            raise ValueError('Local original manifest differs from expiry journal')
        path = root / name
        if name not in names:
            # Completed tombstones contain metadata only. Moving an empty
            # history does not authorize a new directory at the same run ID.
            records.append({'runId': name, 'manifest': manifest, 'expired': True,
                            'manifestSha256': pending['files']['manifest.json']['sha256'],
                            'directoryIdentity': pending['directoryIdentity'],
                            'files': {}, 'pendingExpiry': True, 'directoryPresent': False})
            continue
        dir_state = directory(path)
        present = {p.name for p in path.iterdir()}
        if (not present <= FILES or (not pending and present != FILES)):
            raise ValueError('Incomplete or foreign archive contents')
        if pending and (pending['rootIdentity'] != list(identity(root_state)[:2]) or
                        pending['directoryIdentity'][:2] != list(identity(dir_state)[:2])):
            raise ValueError('Expiry belongs to another original directory')
        file_states = {}
        manifest_hash = pending['files']['manifest.json']['sha256'] if pending else None
        for filename in sorted(present):
            data, file_state = original_file(path / filename)
            item = {'identity': list(identity(file_state)), 'bytes': len(data),
                    'sha256': fingerprint(data)}
            if filename == 'manifest.json':
                if len(data) > 1024**2 or json.loads(data) != manifest:
                    raise ValueError('Original local manifest differs from server')
                manifest_hash = item['sha256']
            elif {k: item[k] for k in ('sha256', 'bytes')} != manifest['encryptedFiles'][filename]:
                raise ValueError('Ciphertext changed; refuse whole batch')
            if pending and item != pending['files'][filename]:
                raise ValueError('Archive file replaced after deletion intent')
            file_states[filename] = item
        if identity(path.lstat()) != identity(dir_state):
            raise ValueError('Archive directory changed')
        records.append({'runId': name, 'expired': expires <= now,
                        'manifest': manifest, 'manifestSha256': manifest_hash,
                        'directoryIdentity': list(identity(dir_state)), 'files': file_states,
                        'pendingExpiry': pending is not None, 'directoryPresent': True})
    if identity(root.lstat()) != identity(root_state):
        raise ValueError('Archive root changed')
    return records


def expire(root, expected, project, now, apply=False):
    root_identity = identity(directory(root))
    records = inventory(root, expected, project, now)
    expired = [r for r in records if r['expired']]
    removed = 0
    if apply:
        # Locks cover all cooperating capture/restore/daily operators. Directory
        # descriptors confine each unlink even if an unrelated path is swapped.
        if inventory(root, expected, project, now) != records:
            raise ValueError('Batch changed before expiry')
        root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            if identity(os.fstat(root_fd)) != root_identity:
                raise ValueError('Archive root changed before expiry')
            # Record every new intent after complete batch validation. Partial
            # progress is allowed only for these exact original identities.
            for record in expired:
                if not record['pendingExpiry']:
                    write_journal(root, {
                        'schemaVersion': 'alterward-server-expiry-1',
                        'manifest': record['manifest'], 'rootIdentity': list(root_identity[:2]),
                        'directoryIdentity': record['directoryIdentity'], 'files': record['files']})
            # Journal creation changes directory timestamps. Compare immutable
            # original entries and hashes, then use the new resumable inventory.
            updated = inventory(root, expected, project, now)
            for old, new in zip(records, updated):
                if any(old[k] != new[k] for k in ('runId', 'manifest', 'directoryIdentity', 'files', 'directoryPresent')):
                    raise ValueError('Batch changed while recording expiry intent')
            for record in expired:
                name = record['runId']
                if not record['directoryPresent']:
                    continue
                if list(identity(os.stat(name, dir_fd=root_fd, follow_symlinks=False))) != record['directoryIdentity']:
                    raise ValueError('Archive directory changed before expiry')
                archive_fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root_fd)
                try:
                    if list(identity(os.fstat(archive_fd))) != record['directoryIdentity'] or set(os.listdir(archive_fd)) != set(record['files']):
                        raise ValueError('Archive changed before unlink')
                    for filename, item in record['files'].items():
                        if list(identity(os.stat(filename, dir_fd=archive_fd, follow_symlinks=False))) != item['identity']:
                            raise ValueError('Archive file changed before unlink')
                    for filename in ['catalog.json.age', 'managed.dump.age', 'manifest.json']:
                        if filename in record['files']:
                            # Recheck after every previous unlink. A replacement
                            # entry never inherits a missing file's deletion right.
                            if list(identity(os.stat(filename, dir_fd=archive_fd, follow_symlinks=False))) != record['files'][filename]['identity']:
                                raise ValueError('File changed immediately before unlink')
                            os.unlink(filename, dir_fd=archive_fd)
                            os.fsync(archive_fd)
                finally:
                    os.close(archive_fd)
                # Never unlink a replacement entry or recursively delete.
                current = os.stat(name, dir_fd=root_fd, follow_symlinks=False)
                if [current.st_dev, current.st_ino] != record['directoryIdentity'][:2]:
                    raise ValueError('Archive replaced before directory removal')
                os.rmdir(name, dir_fd=root_fd)
                removed += 1
            os.fsync(root_fd)
        finally:
            os.close(root_fd)
    return {'schemaVersion': 'alterward-managed-expiry-2', 'checkedAt': now.isoformat(),
            'projectBinding': project, 'validatedArchives': len(records),
            'expiredArchives': len(expired), 'removedArchives': removed,
            'pendingArchives': sum(r['pendingExpiry'] and r['directoryPresent'] for r in records),
            'completedTombstones': sum(not r['directoryPresent'] for r in records),
            'durableDeletionIntent': True,
            'mode': 'apply' if apply else 'check',
            'expiredManifestHashes': [r['manifestSha256'] for r in expired],
            'keyRead': False, 'decryptionPerformed': False, 'liveDatabaseWrites': False,
            'serviceActivationAllowed': False, 'localCopiesExpired': False,
            'historicalCopiesExpired': False, 'automaticRetentionConfigured': False}


@contextlib.contextmanager
def operator_locks():
    import fcntl
    with contextlib.ExitStack() as stack:
        for path in LOCK_PATHS:
            original_file(path)
            fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
            stack.callback(os.close, fd)
            state = os.fstat(fd)
            if (not stat.S_ISREG(state.st_mode) or state.st_uid != UID or
                    state.st_nlink != 1 or stat.S_IMODE(state.st_mode) != 0o600):
                raise ValueError('Private original lock required')
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def utc_now():
    return dt.datetime.now(dt.timezone.utc)


def main(request):
    if (os.geteuid() != UID or set(request) != {'mode', 'projectBinding', 'expectedManifests', 'clientObservedAt'} or
            request['mode'] not in {'check', 'apply'} or not isinstance(request['projectBinding'], str) or
            not SHA.fullmatch(request['projectBinding'])):
        raise ValueError('Explicit root operator expiry mode required')
    server_clock = utc_now()
    client_clock = dt.datetime.fromisoformat(request['clientObservedAt'])
    if (client_clock.utcoffset() != dt.timedelta(0) or
            abs((server_clock - client_clock).total_seconds()) > 300):
        raise ValueError('Protected operator UTC clock must match within five minutes')
    # Expiry must have passed on both clocks. This bounds independent drift;
    # two equally wrong clocks or a forged caller are not attested by this check.
    decision_clock = min(server_clock, client_clock)
    with operator_locks():
        result = expire(ROOT, request['expectedManifests'], request['projectBinding'],
                        decision_clock, request['mode'] == 'apply')
    return {**result, 'serverClock': server_clock.isoformat(),
            'clientClock': client_clock.isoformat(), 'bothClocksPastExpiryRequired': True}


if __name__ == '__main__':
    import sys
    try:
        print(json.dumps({'ok': True, 'result': main(json.load(sys.stdin))}))
    except Exception:
        # Do not print archived data, paths, user fields or exception payloads.
        print(json.dumps({'ok': False, 'phase': 'managed-expiry'}))
        sys.exit(1)
