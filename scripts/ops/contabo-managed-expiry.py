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
PG_IMAGE = 'sha256:589f742565e4f6d22149176b032974f55f8201a8a37b71ed587ec5c6902e689f'
RUN_ID = re.compile(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}')
SHA = re.compile(r'[a-f0-9]{64}')
UID = 0


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
    names = sorted(p.name for p in root.iterdir())
    if names != sorted(expected) or any(not RUN_ID.fullmatch(n) for n in names):
        raise ValueError('Complete original local manifest set must match server')
    records = []
    for name in names:
        path = root / name
        dir_state = directory(path)
        if {p.name for p in path.iterdir()} != FILES:
            raise ValueError('Incomplete or foreign archive contents')
        raw, manifest_state = original_file(path / 'manifest.json')
        if len(raw) > 1024**2:
            raise ValueError('Bounded manifest required')
        manifest = json.loads(raw)
        if manifest != expected[name]:
            raise ValueError('Original local manifest differs from server')
        expires = validate_manifest(manifest, name, project, now)
        file_states = {'manifest.json': identity(manifest_state)}
        for filename, item in manifest['encryptedFiles'].items():
            data, file_state = original_file(path / filename)
            if len(data) != item['bytes'] or fingerprint(data) != item['sha256']:
                raise ValueError('Ciphertext changed; refuse whole batch')
            file_states[filename] = identity(file_state)
        if identity(path.lstat()) != identity(dir_state):
            raise ValueError('Archive directory changed')
        records.append({'runId': name, 'expired': expires <= now,
                        'manifestSha256': fingerprint(raw),
                        'directoryIdentity': identity(dir_state), 'files': file_states})
    if identity(root.lstat()) != identity(root_state):
        raise ValueError('Archive root changed')
    return records


def expire(root, expected, project, now, apply=False):
    root_identity = identity(directory(root))
    records = inventory(root, expected, project, now)
    expired = [r for r in records if r['expired']]
    if apply:
        # Locks cover all cooperating capture/restore/daily operators. Directory
        # descriptors confine each unlink even if an unrelated path is swapped.
        if inventory(root, expected, project, now) != records:
            raise ValueError('Batch changed before expiry')
        root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            if identity(os.fstat(root_fd)) != root_identity:
                raise ValueError('Archive root changed before expiry')
            for record in expired:
                name = record['runId']
                if identity(os.stat(name, dir_fd=root_fd, follow_symlinks=False)) != record['directoryIdentity']:
                    raise ValueError('Archive directory changed before expiry')
                archive_fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root_fd)
                try:
                    if identity(os.fstat(archive_fd)) != record['directoryIdentity'] or set(os.listdir(archive_fd)) != FILES:
                        raise ValueError('Archive changed before unlink')
                    for filename in sorted(FILES):
                        if identity(os.stat(filename, dir_fd=archive_fd, follow_symlinks=False)) != record['files'][filename]:
                            raise ValueError('Archive file changed before unlink')
                    for filename in sorted(FILES - {'manifest.json'}):
                        os.unlink(filename, dir_fd=archive_fd)
                    os.unlink('manifest.json', dir_fd=archive_fd)
                finally:
                    os.close(archive_fd)
                # Never unlink a replacement entry or recursively delete.
                current = os.stat(name, dir_fd=root_fd, follow_symlinks=False)
                if (current.st_dev, current.st_ino) != record['directoryIdentity'][:2]:
                    raise ValueError('Archive replaced before directory removal')
                os.rmdir(name, dir_fd=root_fd)
            os.fsync(root_fd)
        finally:
            os.close(root_fd)
    return {'schemaVersion': 'alterward-managed-expiry-1', 'checkedAt': now.isoformat(),
            'projectBinding': project, 'validatedArchives': len(records),
            'expiredArchives': len(expired), 'removedArchives': len(expired) if apply else 0,
            'mode': 'apply' if apply else 'check',
            'expiredManifestHashes': [r['manifestSha256'] for r in expired],
            'keyRead': False, 'decryptionPerformed': False, 'liveDatabaseWrites': False,
            'serviceActivationAllowed': False, 'localCopiesExpired': False,
            'historicalCopiesExpired': False, 'automaticRetentionConfigured': False}


@contextlib.contextmanager
def operator_locks():
    import fcntl
    with contextlib.ExitStack() as stack:
        for path in [Path('/root/alterward-ops/daily/job.lock'),
                     Path('/root/alterward-ops/owner/activation.lock')]:
            original_file(path)
            fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
            stack.callback(os.close, fd)
            state = os.fstat(fd)
            if (not stat.S_ISREG(state.st_mode) or state.st_uid != UID or
                    state.st_nlink != 1 or stat.S_IMODE(state.st_mode) != 0o600):
                raise ValueError('Private original lock required')
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def main(request):
    if (os.geteuid() != UID or set(request) != {'mode', 'projectBinding', 'expectedManifests'} or
            request['mode'] not in {'check', 'apply'} or not isinstance(request['projectBinding'], str) or
            not SHA.fullmatch(request['projectBinding'])):
        raise ValueError('Explicit root operator expiry mode required')
    with operator_locks():
        return expire(ROOT, request['expectedManifests'], request['projectBinding'],
                      dt.datetime.now(dt.timezone.utc), request['mode'] == 'apply')


if __name__ == '__main__':
    import sys
    try:
        print(json.dumps({'ok': True, 'result': main(json.load(sys.stdin))}))
    except Exception:
        # Do not print archived data, paths, user fields or exception payloads.
        print(json.dumps({'ok': False, 'phase': 'managed-expiry'}))
        sys.exit(1)
