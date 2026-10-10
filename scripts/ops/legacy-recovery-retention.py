"""Finite enrolled historical recovery copies, including four JSON fields.

Only exact original enrollment records may expire. No recursive removal, keys,
decryption, database, service or network. Daily/managed archives are out of scope.
Uses the reviewed local helper's original-file reads and durable metadata writes.
"""
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re

from alterward_managed_local import location, safe_read, exclusive_write, encoded, sync_directory, identity, local_lock

RUN = re.compile(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}')
SHA = re.compile(r'[a-f0-9]{64}')
SCOPES = {'application-public-and-proxy-config', 'proxy-tls-owner-config-no-database',
          'proxy-tls-owner-config-and-upgrade-archive-no-database'}
JSON_FIELDS = {'origin-config-capture-proof-before-owner-upgrade.json': 'encryptedCiphertext',
               'origin-config-capture-proof.json': 'encryptedCiphertext',
               'origin-config-restore-request-before-owner-upgrade.json': 'ciphertext',
               'origin-config-restore-request.json': 'ciphertext'}
CIPHERS = {'application.dump.age', 'config.tar.age', 'owner-config.tar.age'}
LIMIT = 16 * 1024**2


def sha(value):
    return hashlib.sha256(value).hexdigest()


def utc(value):
    result = dt.datetime.fromisoformat(value)
    if result.utcoffset() != dt.timedelta(0):
        raise ValueError('Exact UTC retention boundary required')
    return result


def validate_records(records, side, now):
    if not isinstance(records, list) or not 1 <= len(records) <= 3 or side not in {'server', 'local'}:
        raise ValueError('Finite historical batch required')
    runs, paths = set(), set()
    for record in records:
        if (set(record) != {'runId', 'scope', 'baseAt', 'expiresAt', 'timestampEvidence', 'directory', 'files'} or
                not RUN.fullmatch(record['runId']) or record['runId'] in runs or record['scope'] not in SCOPES or
                record['timestampEvidence'] != 'named-operation-start-conservative'):
            raise ValueError('Exact enrolled historical policy required')
        runs.add(record['runId'])
        base = utc(record['baseAt'])
        named = dt.datetime.strptime(record['runId'][:16], '%Y%m%dT%H%M%SZ').replace(tzinfo=dt.timezone.utc)
        if base != named or base > now or utc(record['expiresAt']) - base != dt.timedelta(days=7):
            raise ValueError('Original operation start plus seven days required')
        directory = record['directory']
        if side == 'server':
            expected_dir = record['runId'] if record['scope'] == 'application-public-and-proxy-config' else 'owner-config-' + record['runId']
            if directory != expected_dir:
                raise ValueError('Exact original server archive path required')
        elif directory is not None:
            raise ValueError('Flat historical local copies only')
        if not isinstance(record['files'], list) or not 1 <= len(record['files']) <= 8:
            raise ValueError('Bounded historical file set required')
        names = set()
        for entry in record['files']:
            if (set(entry) != {'name', 'field', 'sha256', 'bytes'} or entry['name'] in names or
                    not SHA.fullmatch(entry['sha256']) or type(entry['bytes']) is not int or not 0 < entry['bytes'] <= LIMIT):
                raise ValueError('Exact historical file binding required')
            name, field = entry['name'], entry['field']
            names.add(name)
            if side == 'server':
                if field is not None or name not in CIPHERS | {'manifest.json'}:
                    raise ValueError('Exact server ciphertext and manifest scope required')
            elif field is not None:
                if JSON_FIELDS.get(name) != field:
                    raise ValueError('Only four named historical JSON fields allowed')
            elif not (name == 'owner-config-latest.tar.age' or
                      re.fullmatch(re.escape(record['runId']) + r'-(application\.dump\.age|config\.tar\.age|owner-config\.tar\.age)', name)):
                raise ValueError('Exact named local historical ciphertext required')
            key = (directory, name)
            if key in paths:
                raise ValueError('Historical target must be unique')
            paths.add(key)
        if side == 'server':
            expected_names = {'manifest.json', 'application.dump.age', 'config.tar.age'} if record['scope'] == 'application-public-and-proxy-config' else {'manifest.json', 'owner-config.tar.age'}
            if names != expected_names:
                raise ValueError('Complete original historical server archive required')
    return records


def inspect_file(path, entry):
    raw, state = safe_read(path, LIMIT * 2)
    if entry['field'] is None:
        if {'sha256': sha(raw), 'bytes': len(raw)} != {k: entry[k] for k in ('sha256', 'bytes')}:
            raise ValueError('Original historical ciphertext or manifest differs')
        return {'identity': state, 'originalSha256': sha(raw), 'replacementSha256': None}, None
    value = json.loads(raw)
    if not isinstance(value, dict) or not isinstance(value.get(entry['field']), str):
        raise ValueError('Original embedded historical ciphertext required')
    cipher = base64.b64decode(value[entry['field']], validate=True)
    if not cipher.startswith(b'age-encryption.org/v1') or {'sha256': sha(cipher), 'bytes': len(cipher)} != {k: entry[k] for k in ('sha256', 'bytes')}:
        raise ValueError('Embedded ciphertext differs from original registry')
    del value[entry['field']]
    replacement = encoded(value)
    return {'identity': state, 'originalSha256': sha(raw), 'replacementSha256': sha(replacement)}, replacement


def enrollment(meta, root, side, records, now):
    location(meta, True);root_state = location(root, True)
    validate_records(records, side, now)
    value = {'schemaVersion': 'alterward-legacy-retention-1', 'side': side,
             'rootIdentity': [root_state.st_dev, root_state.st_ino], 'records': records, 'originals': {}}
    for record in records:
        parent = root / record['directory'] if record['directory'] else root
        parent_state = location(parent, True)
        if record['directory'] and {p.name for p in parent.iterdir()} != {e['name'] for e in record['files']}:
            raise ValueError('Original complete historical directory required')
        group = {'directoryIdentity': [parent_state.st_dev, parent_state.st_ino], 'files': {}}
        if side == 'server':
            manifest = json.loads(safe_read(parent / 'manifest.json', 1024**2)[0])
            expected_schema = 'contabo-backup-1' if record['scope'] == 'application-public-and-proxy-config' else 'alterward-owner-config-backup-1'
            if (manifest.get('schemaVersion') != expected_schema or manifest.get('scope') != record['scope'] or
                    manifest.get('runId') != record['runId'] or 'capturedAt' in manifest):
                raise ValueError('Original legacy manifest scope required')
            ciphers = manifest.get('encryptedFiles') if expected_schema == 'contabo-backup-1' else {
                'owner-config.tar.age': {'sha256': manifest['cipherSha256'], 'bytes': manifest['cipherBytes']}}
            if ciphers != {e['name']: {k: e[k] for k in ('sha256', 'bytes')} for e in record['files'] if e['name'] != 'manifest.json'}:
                raise ValueError('Independent manifest ciphertext bindings required')
        for entry in record['files']:
            group['files'][entry['name']] = inspect_file(parent / entry['name'], entry)[0]
        value['originals'][record['runId']] = group
    path = meta / 'enrollment.json'
    if path.exists() or path.is_symlink():
        previous = json.loads(safe_read(path, 1024**2)[0])
        if previous != value:
            raise ValueError('Original enrollment cannot be replaced')
    else:
        exclusive_write(path, encoded(value))
    return {'enrolledRuns': len(records), 'enrolledTargets': sum(len(r['files']) for r in records),
            'ciphertextsDeleted': 0, 'keyRead': False}


def inventory(meta, root, now):
    value = json.loads(safe_read(meta / 'enrollment.json', 1024**2)[0])
    if set(value) != {'schemaVersion', 'side', 'rootIdentity', 'records', 'originals'} or value['schemaVersion'] != 'alterward-legacy-retention-1':
        raise ValueError('Original historical enrollment required')
    records = validate_records(value['records'], value['side'], now)
    root_state = location(root, True)
    if value['rootIdentity'] != [root_state.st_dev, root_state.st_ino]:
        raise ValueError('Historical root identity changed')
    if set(value['originals']) != {r['runId'] for r in records}:
        raise ValueError('Complete historical identities required')
    intents = meta / 'intents'
    if intents.exists() or intents.is_symlink():
        location(intents, True)
        if {p.name for p in intents.iterdir()} - {r['runId'] + '.json' for r in records}:
            raise ValueError('Unknown historical deletion intent')
    plan = []
    for record in records:
        run = record['runId'];original = value['originals'][run]
        if set(original) != {'directoryIdentity', 'files'} or set(original['files']) != {e['name'] for e in record['files']}:
            raise ValueError('Complete original historical group required')
        intent_path = intents / (run + '.json')
        pending = intent_path.exists() or intent_path.is_symlink()
        expired = utc(record['expiresAt']) <= now
        intent = {'schemaVersion': 'alterward-legacy-intent-1', 'enrollmentSha256': sha(encoded(value)),
                  'runId': run, 'original': original}
        if pending and (not expired or json.loads(safe_read(intent_path, 1024**2)[0]) != intent):
            raise ValueError('Expired original historical intent required')
        parent = root / record['directory'] if record['directory'] else root
        present = parent.exists() or parent.is_symlink()
        if present:
            state = location(parent, True)
            if [state.st_dev, state.st_ino] != original['directoryIdentity']:
                raise ValueError('Historical archive directory replaced')
            if record['directory'] and {p.name for p in parent.iterdir()} - {e['name'] for e in record['files']}:
                raise ValueError('Unrecognized original historical archive entry')
        elif not (pending and expired and record['directory']):
            raise ValueError('Historical archive missing without deletion intent')
        files, replacements = {}, {}
        for entry in record['files']:
            name = entry['name'];path = parent / name;expected = original['files'][name]
            if (set(expected) != {'identity', 'originalSha256', 'replacementSha256'} or
                    not isinstance(expected['identity'], list) or len(expected['identity']) != 7 or
                    not all(type(v) is int for v in expected['identity']) or
                    not SHA.fullmatch(expected['originalSha256']) or
                    (expected['replacementSha256'] is not None and not SHA.fullmatch(expected['replacementSha256']))):
                raise ValueError('Original historical file identity required')
            if not (path.exists() or path.is_symlink()):
                if not (pending and expired and entry['field'] is None):
                    raise ValueError('Historical file missing without original intent')
                files[name] = 'completed';continue
            raw, state = safe_read(path, LIMIT * 2)
            if pending and entry['field'] is not None and sha(raw) == expected['replacementSha256']:
                value_without = json.loads(raw)
                if not isinstance(value_without, dict) or entry['field'] in value_without:
                    raise ValueError('Expired embedded field reappeared')
                files[name] = 'completed';continue
            actual, replacement = inspect_file(path, entry)
            if actual != expected:
                raise ValueError('Historical original file changed since enrollment')
            files[name] = 'original'
            if replacement is not None:
                replacements[name] = replacement
        plan.append({'record': record, 'original': original, 'intent': intent,
                     'pending': pending, 'expired': expired, 'files': files,
                     'replacements': replacements, 'directoryPresent': present})
    return value, plan


def expire(meta, root, now, apply=False):
    value, plan = inventory(meta, root, now)
    expired = [r for r in plan if r['expired']]
    removed = rewritten = directories = 0
    if apply and expired:
        if inventory(meta, root, now) != (value, plan):
            raise ValueError('Historical batch changed before expiry')
        intents = meta / 'intents'
        if not intents.exists():
            intents.mkdir(mode=0o700);sync_directory(meta)
        for group in expired:
            if not group['pending']:
                exclusive_write(intents / (group['record']['runId'] + '.json'), encoded(group['intent']))
        checked_value, checked = inventory(meta, root, now)
        if checked_value != value or len(checked) != len(plan):
            raise ValueError('Original full historical enrollment changed')
        for a, b in zip(plan, checked):
            if any(a[k] != b[k] for k in ('record', 'original', 'files', 'replacements', 'directoryPresent')):
                raise ValueError('Historical batch changed while recording intents')
        for group in expired:
            record = group['record'];parent = root / record['directory'] if record['directory'] else root
            # Manifest last. JSON fields are atomically replaced, never deleted
            # wholesale; all unrelated JSON values remain present.
            for entry in sorted(record['files'], key=lambda e: e['name'] == 'manifest.json'):
                name = entry['name'];path = parent / name
                if group['files'][name] == 'completed':
                    continue
                if inspect_file(path, entry)[0] != group['original']['files'][name]:
                    raise ValueError('Historical file changed before mutation')
                if entry['field'] is None:
                    os.unlink(path);sync_directory(parent);removed += 1
                else:
                    temporary = meta / (record['runId'] + '-' + sha(name.encode())[:16] + '.pending')
                    replacement = group['replacements'][name]
                    if temporary.exists() or temporary.is_symlink():
                        if safe_read(temporary, LIMIT * 2)[0] != replacement:
                            raise ValueError('Original pending JSON replacement required')
                    else:
                        exclusive_write(temporary, replacement)
                    if inspect_file(path, entry)[0] != group['original']['files'][name]:
                        raise ValueError('Historical JSON changed before atomic replacement')
                    os.replace(temporary, path);sync_directory(parent);sync_directory(meta);rewritten += 1
            if record['directory'] and parent.exists():
                state = location(parent, True)
                if [state.st_dev, state.st_ino] != group['original']['directoryIdentity'] or list(parent.iterdir()):
                    raise ValueError('Only original empty historical directory may be removed')
                os.rmdir(parent);sync_directory(root);directories += 1
    inventory(meta, root, now)
    return {'checkedAt': now.isoformat(), 'mode': 'apply' if apply else 'check',
            'policyDigest': sha(encoded([{k: r[k] for k in ('runId', 'scope', 'baseAt', 'expiresAt', 'timestampEvidence')}
                                        for r in sorted(value['records'], key=lambda r: r['runId'])])),
            'knownRuns': len(plan), 'expiredRuns': len(expired), 'filesRemoved': removed,
            'embeddedFieldsRemoved': rewritten, 'emptyDirectoriesRemoved': directories,
            'keyRead': False, 'decryptionPerformed': False, 'liveDatabaseWrites': False,
            'dailyOrManagedScopeChanged': False, 'serviceActivationAllowed': False}


def main(request):
    action = request.get('action');side = request.get('side')
    extra = {'records'} if action == 'enroll' else {'peerObservedAt'}
    if action not in {'enroll', 'check', 'apply'} or side not in {'local', 'server'} or set(request) != {'action', 'side'} | extra:
        raise ValueError('Exact historical operator action required')
    now = dt.datetime.now(dt.timezone.utc)
    if action != 'enroll':
        peer = utc(request['peerObservedAt'])
        if abs((now - peer).total_seconds()) > 300:
            raise ValueError('Fresh independent peer UTC clock required')
        now = min(now, peer)
    if side == 'server':
        if os.geteuid() != 0:
            raise ValueError('Root historical operator required')
        root = Path('/root/alterward-ops/backups');meta = Path('/root/alterward-ops/legacy-retention')
    else:
        root = Path.cwd().resolve() / '.local' / 'contabo-release'
        meta = Path.cwd().resolve() / '.local' / 'legacy-retention'
    location(root, True);location(meta, True)
    with local_lock(meta):
        if action == 'enroll':
            return enrollment(meta, root, side, request['records'], now)
        return expire(meta, root, now, action == 'apply')
