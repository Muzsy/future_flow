"""Protected local managed copies: serialized capture/read and resumable expiry.

CLI paths are fixed under the original workspace. No keys, decryption, database,
SSH, scheduler, historical archives or embedded ciphertext are accessed here.
"""
import base64
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat

from alterward_managed_expiry import validate_manifest, RUN_ID, SHA

FILES = {'managed.dump.age', 'catalog.json.age', 'manifest.json'}
JOURNAL = 'managed-lifecycle'
LOCK = 'managed-local.lock'
POINTER = 'managed-backup-latest.json'
LIMIT = 128 * 1024**2


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def identity(value):
    # Python 3.12 Windows stat/fstat expose different transitional ctime
    # semantics. Birthtime is consistent on both paths; mtime + file ID +
    # content hash still bind every read and resumed unlink.
    timestamp = value.st_birthtime_ns if os.name == 'nt' else value.st_ctime_ns
    return [value.st_dev, value.st_ino, value.st_mode, value.st_nlink,
            value.st_size, value.st_mtime_ns, timestamp]


def location(path, directory=False):
    value = path.lstat()
    if (path.resolve() != path or path.is_symlink() or
            not (stat.S_ISDIR(value.st_mode) if directory else stat.S_ISREG(value.st_mode)) or
            (not directory and value.st_nlink != 1)):
        raise ValueError('Original unlinked private location required')
    if os.name != 'nt' and (value.st_uid != os.getuid() or
                           stat.S_IMODE(value.st_mode) != (0o700 if directory else 0o600)):
        raise ValueError('Private owner and permissions required')
    return value


def safe_read(path, limit=LIMIT):
    before = location(path)
    if before.st_size > limit:
        raise ValueError('Bounded private input required')
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_BINARY', 0))
    try:
        if identity(os.fstat(fd)) != identity(before):
            raise ValueError('Input replaced before open')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            data = stream.read(limit + 1)
        if identity(os.fstat(fd)) != identity(before):
            raise ValueError('Input changed during read')
    finally:
        os.close(fd)
    if identity(location(path)) != identity(before) or len(data) != before.st_size:
        raise ValueError('Input changed after read')
    return data, identity(before)


def sync_directory(path):
    # Python exposes no portable Windows directory fsync. File FlushFileBuffers
    # is used; abrupt power-loss directory-entry durability is not attested.
    if os.name != 'nt':
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def exclusive_write(path, data):
    location(path.parent, True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_BINARY', 0), 0o600)
    try:
        with os.fdopen(fd, 'wb', closefd=False) as stream:
            stream.write(data)
            stream.flush()
            os.fsync(fd)
    finally:
        os.close(fd)
    sync_directory(path.parent)


@contextlib.contextmanager
def local_lock(root):
    """Kernel lock, released on process death; every local writer uses this."""
    original = location(root, True)
    path = root / LOCK
    fd = os.open(path, os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    try:
        if identity(location(path)) != identity(os.fstat(fd)):
            raise ValueError('Original lock required')
        if os.name == 'nt':
            import msvcrt
            os.lseek(fd, 0, os.SEEK_SET)
            msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if (location(root, True).st_dev, location(root, True).st_ino) != (original.st_dev, original.st_ino):
            raise ValueError('Root changed before lock')
        yield
    finally:
        os.close(fd)


def journal_dir(root, create=False):
    path = root / JOURNAL
    if create and not path.exists():
        path.mkdir(mode=0o700)
        sync_directory(root)
    if path.exists() or path.is_symlink():
        location(path, True)
        return path
    return None


def journal_records(root, project, now):
    directory = journal_dir(root)
    records = {}
    if not directory:
        return records
    for path in directory.iterdir():
        match = re.fullmatch(r'([0-9]{8}T[0-9]{6}Z-[a-f0-9]{8})\.(capture|expiry)\.json', path.name)
        if not match:
            raise ValueError('Unknown lifecycle journal entry')
        raw, _ = safe_read(path, 2 * 1024**2)
        record = json.loads(raw)
        run, kind = match.groups()
        required = {'schemaVersion', 'manifest'} | ({'rootIdentity', 'files'} if kind == 'expiry' else set())
        if (set(record) != required or record['schemaVersion'] != 'alterward-local-' + kind + '-1'):
            raise ValueError('Exact lifecycle journal required')
        expires = validate_manifest(record['manifest'], run, project, now)
        if kind == 'expiry':
            if expires > now or len(record['rootIdentity']) != 2 or not isinstance(record['files'], dict):
                raise ValueError('Expired original journal required')
            if not set(record['files']) <= FILES:
                raise ValueError('Journal file scope required')
            for name, item in record['files'].items():
                if (set(item) != {'identity', 'sha256', 'bytes'} or
                        len(item['identity']) != 7 or not all(type(v) is int for v in item['identity']) or
                        not SHA.fullmatch(item['sha256']) or type(item['bytes']) is not int or
                        not 0 < item['bytes'] <= LIMIT):
                    raise ValueError('Original bounded journal file identity required')
                if name != 'manifest.json' and {k: item[k] for k in ('sha256', 'bytes')} != record['manifest']['encryptedFiles'][name]:
                    raise ValueError('Journal must match original ciphertext')
        group = records.setdefault(run, {})
        group[kind] = record
        if len(group) == 2 and group['capture']['manifest'] != group['expiry']['manifest']:
            raise ValueError('Lifecycle manifests disagree')
    if len(records) > 100:
        raise ValueError('Bounded lifecycle batch required')
    return records


def inventory(root, project, now):
    """Entire fresh/expired batch validated before preparing any deletion."""
    root_state = location(root, True)
    journals = journal_records(root, project, now)
    groups = {run: {} for run in journals}
    for path in root.iterdir():
        match = re.fullmatch(r'([0-9]{8}T[0-9]{6}Z-[a-f0-9]{8})-(managed\.dump\.age|catalog\.json\.age|manifest\.json)', path.name)
        if match:
            groups.setdefault(match[1], {})[match[2]] = path
        elif path.name.endswith('.age') or re.match(r'[0-9]{8}T[0-9]{6}Z-', path.name):
            raise ValueError('Unknown managed backup entry')
        # Existing inventory/proof/source files have independent scope. Never
        # read or delete them, or treat them as archive authority.
    if len(groups) > 100:
        raise ValueError('Bounded local batch required')
    plan = []
    for run, paths in sorted(groups.items()):
        journal = journals.get(run, {})
        raw_manifest = safe_read(paths['manifest.json'], 1024**2)[0] if 'manifest.json' in paths else None
        manifest = json.loads(raw_manifest) if raw_manifest else (journal.get('expiry') or journal.get('capture') or {}).get('manifest')
        if not manifest:
            raise ValueError('Original manifest missing')
        expires = validate_manifest(manifest, run, project, now)
        for item in journal.values():
            if item['manifest'] != manifest:
                raise ValueError('Original manifest and journal differ')
        if not journal and set(paths) != FILES:
            raise ValueError('Unjournaled incomplete copy')
        states = {}
        for name, path in paths.items():
            data, state = safe_read(path, 1024**2 if name == 'manifest.json' else LIMIT)
            actual = {'sha256': digest(data), 'bytes': len(data)}
            expected = {'sha256': digest(raw_manifest), 'bytes': len(raw_manifest)} if name == 'manifest.json' else manifest['encryptedFiles'][name]
            if actual != expected:
                raise ValueError('Local ciphertext differs')
            states[name] = {**actual, 'identity': state}
        pending = journal.get('expiry')
        if pending:
            if pending['rootIdentity'] != [root_state.st_dev, root_state.st_ino]:
                raise ValueError('Expiry journal belongs to another root')
            for name, value in states.items():
                if pending['files'].get(name) != value:
                    raise ValueError('File replaced after expiry journal')
        plan.append({'runId': run, 'manifest': manifest, 'files': states,
                     'expired': expires <= now, 'pendingExpiry': pending is not None,
                     'complete': set(paths) == FILES, 'rootIdentity': [root_state.st_dev, root_state.st_ino]})
    pointer = root / POINTER
    if pointer.exists() or pointer.is_symlink():
        value = json.loads(safe_read(pointer, 1024)[0])
        if set(value) != {'runId'} or value['runId'] not in groups:
            raise ValueError('Known original latest pointer required')
    if identity(location(root, True)) != identity(root_state):
        raise ValueError('Root changed during inventory')
    return plan


def expire(root, project, now, apply=False):
    plan = inventory(root, project, now)
    removed = 0
    expired = [r for r in plan if r['expired']]
    if apply:
        if inventory(root, project, now) != plan:
            raise ValueError('Batch changed before expiry')
        for record in expired:
            run = record['runId']
            if not record['pendingExpiry']:
                exclusive_write(journal_dir(root, True) / (run + '.expiry.json'), encoded({
                    'schemaVersion': 'alterward-local-expiry-1', 'manifest': record['manifest'],
                    'rootIdentity': record['rootIdentity'], 'files': record['files']}))
            # Validate the whole batch again after journal creation. A resumed
            # run allows only missing previously attested files, never replacements.
            inventory(root, project, now)
            for name in ['catalog.json.age', 'managed.dump.age', 'manifest.json']:
                path = root / (run + '-' + name)
                if path.exists() or path.is_symlink():
                    current_root = location(root, True)
                    if [current_root.st_dev, current_root.st_ino] != record['rootIdentity']:
                        raise ValueError('Root replaced before unlink')
                    raw, state = safe_read(path)
                    if record['files'].get(name) != {'sha256': digest(raw), 'bytes': len(raw), 'identity': state}:
                        raise ValueError('File changed before unlink')
                    os.unlink(path)
                    sync_directory(root)
                    removed += 1
            pointer = root / POINTER
            if pointer.exists():
                raw, state = safe_read(pointer, 1024)
                if json.loads(raw)['runId'] == run:
                    if identity(location(pointer)) != state:
                        raise ValueError('Pointer changed before unlink')
                    os.unlink(pointer)
                    sync_directory(root)
    return {'schemaVersion': 'alterward-local-expiry-proof-1', 'checkedAt': now.isoformat(),
            'projectBinding': project, 'mode': 'apply' if apply else 'check',
            'knownArchives': len(plan), 'expiredArchives': len(expired), 'removedFiles': removed,
            'pendingArchives': sum(r['pendingExpiry'] and bool(r['files']) for r in plan),
            'completeFreshArchives': sum(not r['expired'] and r['complete'] for r in plan),
            'keyRead': False, 'decryptionPerformed': False, 'liveDatabaseWrites': False,
            'historicalCopiesExpired': False, 'serverCopiesExpired': False,
            'automaticRetentionConfigured': False}


def store(root, project, now, manifest, files):
    run = manifest['runId']
    if validate_manifest(manifest, run, project, now) <= now or set(files) != FILES - {'manifest.json'}:
        raise ValueError('Fresh exact capture required')
    decoded = {}
    for name, item in manifest['encryptedFiles'].items():
        if not isinstance(files[name], str) or len(files[name]) > (LIMIT * 4 // 3 + 8):
            raise ValueError('Bounded encrypted input required')
        data = base64.b64decode(files[name], validate=True)
        if {'sha256': digest(data), 'bytes': len(data)} != item:
            raise ValueError('Capture cipher differs')
        decoded[name] = data
    plan = inventory(root, project, now)
    existing = next((r for r in plan if r['runId'] == run), None)
    journals = journal_records(root, project, now)
    if run in journals and 'expiry' in journals[run]:
        raise ValueError('Expired run cannot be resurrected')
    if existing and existing['manifest'] != manifest:
        raise ValueError('Original run cannot be overwritten')
    if run not in journals:
        exclusive_write(journal_dir(root, True) / (run + '.capture.json'), encoded({
            'schemaVersion': 'alterward-local-capture-1', 'manifest': manifest}))
    decoded['manifest.json'] = encoded(manifest)
    for name, data in decoded.items():
        path = root / (run + '-' + name)
        if path.exists() or path.is_symlink():
            old, _ = safe_read(path)
            if (json.loads(old) != manifest if name == 'manifest.json' else old != data):
                raise ValueError('Original capture cannot be replaced')
        else:
            exclusive_write(path, data)
    inventory(root, project, now)
    # Pointer updates use a fixed exclusive temporary entry; an interrupted
    # write blocks replacement until its content is checked on the next store.
    pointer = root / POINTER
    temporary = root / 'managed-backup-latest.pending.json'
    pointer_data = encoded({'runId': run})
    if temporary.exists() or temporary.is_symlink():
        if safe_read(temporary, 1024)[0] != pointer_data:
            raise ValueError('Another pending pointer needs operator review')
    else:
        exclusive_write(temporary, pointer_data)
    if pointer.exists() or pointer.is_symlink():
        safe_read(pointer, 1024)
    location(root, True)
    os.replace(temporary, pointer)
    sync_directory(root)
    return {'stored': True, 'runId': run}


def read_bundle(root, project, now):
    plan = inventory(root, project, now)
    pointer = json.loads(safe_read(root / POINTER, 1024)[0])
    record = next(r for r in plan if r['runId'] == pointer['runId'])
    if record['expired'] or record['pendingExpiry'] or not record['complete']:
        raise ValueError('Fresh complete unexpired copy required')
    return {'manifest': record['manifest'], 'files': {
        name: base64.b64encode(safe_read(root / (record['runId'] + '-' + name))[0]).decode()
        for name in sorted(FILES - {'manifest.json'})}}


def main(request):
    action = request.get('action')
    extra = {'manifest', 'files'} if action == 'store' else {'serverObservedAt'} if action in {'check', 'apply'} else set()
    if (action not in {'store', 'read', 'check', 'apply'} or
            set(request) != {'action', 'projectBinding'} | extra or not SHA.fullmatch(request['projectBinding'])):
        raise ValueError('Exact local operator action required')
    now = dt.datetime.now(dt.timezone.utc)
    if action in {'check', 'apply'}:
        peer = dt.datetime.fromisoformat(request['serverObservedAt'])
        if peer.utcoffset() != dt.timedelta(0) or abs((peer - now).total_seconds()) > 300:
            raise ValueError('Fresh independent server UTC clock required')
        now = min(now, peer)
    # Caller cannot name a target. No secret directory is read.
    workspace = Path.cwd().resolve()
    root = workspace / '.local' / 'supabase-recovery'
    location(workspace / '.local', True)
    location(root, True)
    with local_lock(root):
        if action == 'store':
            return store(root, request['projectBinding'], now, request['manifest'], request['files'])
        if action == 'read':
            return read_bundle(root, request['projectBinding'], now)
        return expire(root, request['projectBinding'], now, action == 'apply')


if __name__ == '__main__':
    import sys
    try:
        print(json.dumps({'ok': True, 'result': main(json.load(sys.stdin))}))
    except Exception:
        print(json.dumps({'ok': False, 'phase': 'local-managed-recovery'}))
        sys.exit(1)
