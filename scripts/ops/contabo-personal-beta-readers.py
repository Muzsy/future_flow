"""Journalled, unpaid origin admission. No invitations or Cloudflare edits.

Only the two origin email lists change. This tool cannot fund UUIDs, change an
image, activate a provider or start a window. Disable stops this project's
writers before inspecting candidate drift and restores a verified zero baseline.
"""
import copy
import datetime as dt
import json
import os
from pathlib import Path
import re
import signal
import stat
import sys
import time

from alterward_backup import private_directory
from alterward_target import docker, run, validate_owner_configuration, owner_overlay
from alterward_owner import server_environment
from alterward_activation import (
    DIRECTORY, PROJECT, FILES, INTERRUPTION_SIGNALS, encoded, frozen, sha,
    verify_hashes, project_ids,
)
import alterward_upgrade as upgrade
import alterward_fence as fence

STATE = DIRECTORY / 'personal-beta-readers'
# Apply and prepare share one bound with the expired-preparation archive: a
# preparation older than this can never be applied, and only then may it be archived.
READER_PREPARATION_SECONDS = 900
CLOCK_TOLERANCE_SECONDS = 300
ARCHIVE_SCHEMA = 'alterward-reader-archive-1'
ARCHIVE_LIMIT = 8
ARCHIVE_ID = re.compile(r'expired-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{16}')
STATE_NAMES = ('server.env', 'pinned-image.json', 'effective-compose.json', 'manifest.json',
               'readers.json', 'access.json', 'prepared.json')
ORIGINAL_NAMES = ('server.env', 'pinned-image.json', 'effective-compose.json', 'manifest.json',
                  'stage.json', 'access.json')
PREPARED_KEYS = frozenset({'manifest', 'previousManifestSha256', 'originalFilesSha256',
                           'candidateFilesSha256', 'readersSha256', 'accessSha256', 'preparedAt',
                           'sourceCommit', 'proxyNetwork', 'selectedReaders', 'accessEmailCount'})


def archive_root():
    # Derived from STATE so the isolated fixture and tests redirect both together.
    return STATE.parent / 'personal-beta-readers-archive'


def durable_file(path, data):
    if path.exists() or path.is_symlink():
        if fence.original(path) != data:
            raise ValueError('Existing durable reader file differs')
    else:
        parent = path.parent.lstat()
        if (path.parent.resolve() != path.parent or not stat.S_ISDIR(parent.st_mode) or
                parent.st_uid != 0 or stat.S_IMODE(parent.st_mode) != 0o700):
            raise ValueError('Original private reader parent required')
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)


def update_durable(path, data):
    if path.exists() or path.is_symlink():
        fence.original(path)
        upgrade.atomic_private(path, data)
    else:
        durable_file(path, data)


def transition(*, record, stop, held, start, verify, promote, restore, verify_zero):
    """Production adapter and synthetic fault tests share this transaction.

    Persist intent before the first stop. A failed transition always goes to the
    original zero state, never to another reader candidate. SIGKILL recovery is
    an explicit disable operation using that durable original baseline.
    """
    record('applying')
    try:
        stop()
        held()
        record('held')
        start()
        verify()
        record('candidate-verified')
        promote()
        record('applied')
    except BaseException:
        for number in INTERRUPTION_SIGNALS:
            signal.signal(number, signal.SIG_IGN)
        try:
            stop()
            restore()
            verify_zero()
            record('disabled-after-failure')
        except BaseException:
            try:
                stop()
            finally:
                record('recovery-required')
            raise
        raise


def projection(access):
    return {key: access[key] for key in ('teamDomain', 'audience', 'allowedEmails')}


def reader_environment(text, allowed):
    value = ','.join(allowed)
    if not re.fullmatch(r'[a-z0-9@._+,\-]+', value):
        raise ValueError('Canonical selected addresses required')
    result, count = re.subn(r"^CLOSED_SITE_ALLOWED_EMAILS='[^'\r\n]*'$",
                           "CLOSED_SITE_ALLOWED_EMAILS='" + value + "'", text,
                           flags=re.MULTILINE)
    before, after = server_environment(text), server_environment(result)
    before.pop('CLOSED_SITE_ALLOWED_EMAILS', None)
    after.pop('CLOSED_SITE_ALLOWED_EMAILS', None)
    if count != 1 or before != after:
        raise ValueError('Only the original origin email line may change')
    return result.encode()


def current_digest(request):
    if sha(fence.original(DIRECTORY / 'manifest.json')) != request['ownerManifestDigest']:
        raise ValueError('Current manifest differs from active receipt')


def render(source, path):
    return json.loads(run(['docker', 'compose', '--project-name', PROJECT,
                          '--env-file', str(path / 'server.env'), '-f',
                          str(source / 'deploy/compose.contabo.yaml'), '-f',
                          str(path / 'pinned-image.json'), 'config', '--format', 'json']).stdout)


def files(path):
    return {name: fence.original(path / name) for name in FILES}


def prepared(request):
    value = json.loads(fence.original(STATE / 'prepared.json'))
    if value != request['preparedProof']:
        raise ValueError('Exact prepared receipt required')
    candidate, original = files(STATE), files(STATE / 'original')
    if ({key: sha(data) for key, data in candidate.items()} != value['candidateFilesSha256'] or
            {key: sha(data) for key, data in original.items()} != value['originalFilesSha256']):
        raise ValueError('Durable preparation changed')
    return value, candidate, original


def zero_baseline(request, base=None):
    # This validation is independent of candidate bytes and selected readers.
    original = (base or STATE) / 'original'
    data = files(original)
    stage = json.loads(fence.original(original / 'stage.json'))
    if stage != request['zeroStageProof']:
        raise ValueError('Original zero receipt differs')
    access = json.loads(fence.original(original / 'access.json'))
    if access != request['ownerAccess']:
        raise ValueError('Original owner Access receipt differs')
    baseline = {**request, 'access': access,
                'previousBuildProof': request['buildProof'], 'previousStageProof': stage}
    source, image, flags, _ = upgrade.validate_inputs(baseline, data['server.env'].decode())
    manifest = json.loads(data['manifest.json'])
    verify_hashes(manifest, stage, data['server.env'], data['effective-compose.json'],
                  source, upgrade.CA.read_bytes())
    if manifest['accessConfigurationSha256'] != sha(encoded(access)):
        raise ValueError('Original owner Access digest differs')
    config = render(source, original)
    validate_owner_configuration(config, access, flags)
    if frozen(config) != data['effective-compose.json']:
        raise ValueError('Original frozen zero configuration differs')
    return data, stage, config, image


def stop_project():
    ids = project_ids()
    if not ids or len(ids) > 12:
        raise ValueError('Bounded existing Alterward members required')
    values = json.loads(docker('inspect', *ids).stdout)
    if any(value['Config']['Labels'].get('com.docker.compose.project') != PROJECT or
           value['Config']['Labels'].get('com.docker.compose.service') not in {'web', 'api', 'worker'}
           for value in values):
        raise ValueError('Stop ownership differs')
    # No candidate configuration or provider input is needed for these stops.
    errors = []
    for value in values:
        if value['State']['Running']:
            try:
                docker('stop', '--time', '30', value['Id'])
            except BaseException:
                errors.append(value['Id'])
    after = json.loads(docker('inspect', *ids).stdout)
    if any(value['State']['Running'] for value in after):
        raise ValueError('Alterward stop remains unverified')
    if errors:
        raise ValueError('A scoped stop failed or was interrupted; transition cannot continue')


def prepare(request, daily, policy):
    current_digest(request)
    before = daily.stable_state()
    baseline_request = {**request, 'access': request['ownerAccess']}
    data, original_manifest, config = upgrade.baseline(baseline_request)
    now = daily.utcnow()
    expected, expected_access = policy.reader_candidate(
        config, projection(request['ownerAccess']),
        owner_overlay(request['ownerFlags']), request['readers'], now=now)
    reviewed = request['readerAccess']
    allowed_metadata = copy.deepcopy(request['ownerAccess'])
    allowed_metadata.update(allowedEmails=expected_access['allowedEmails'], checkedAt=reviewed.get('checkedAt'))
    if reviewed != allowed_metadata:
        raise ValueError('Reviewed Access differs outside addresses and observation time')
    instant = dt.datetime.fromisoformat(reviewed['checkedAt'].replace('Z', '+00:00'))
    if instant.tzinfo != dt.timezone.utc or not 0 <= (now - instant).total_seconds() <= READER_PREPARATION_SECONDS:
        raise ValueError('Fresh external Access readback required')
    if STATE.exists() or STATE.is_symlink():
        raise ValueError('Previous reader preparation requires explicit inspection')
    # A new cycle may start only beside fully archived, hash-verified predecessors.
    require_complete_archives()
    private_directory(STATE)
    private_directory(STATE / 'original')
    for name, value in data.items():
        durable_file(STATE / 'original' / name, value)
    durable_file(STATE / 'original' / 'stage.json', encoded(request['previousStageProof']))
    durable_file(STATE / 'original' / 'access.json', encoded(request['ownerAccess']))
    durable_file(STATE / 'readers.json', encoded(request['readers']))
    durable_file(STATE / 'access.json', encoded(reviewed))
    durable_file(STATE / 'pinned-image.json', data['pinned-image.json'])
    durable_file(STATE / 'server.env', reader_environment(data['server.env'].decode(), expected_access['allowedEmails']))
    source = Path(request['buildProof']['sourceDirectory'])
    rendered = render(source, STATE)
    policy.validate_reader_candidate(config, projection(request['ownerAccess']),
                                    owner_overlay(request['ownerFlags']),
                                    request['readers'], rendered, now=now)
    durable_file(STATE / 'effective-compose.json', frozen(rendered))
    roundtrip = json.loads(run(upgrade.compose(STATE / 'effective-compose.json') + ['config', '--format', 'json']).stdout)
    if roundtrip != expected:
        raise ValueError('Frozen candidate roundtrip differs')
    manifest = {**original_manifest,
                'ownerEnvironmentSha256': sha(fence.original(STATE / 'server.env')),
                'effectiveComposeSha256': sha(frozen(rendered)),
                'accessConfigurationSha256': sha(encoded(reviewed))}
    durable_file(STATE / 'manifest.json', encoded(manifest))
    value = {'manifest': manifest, 'previousManifestSha256': sha(data['manifest.json']),
             'originalFilesSha256': {key: sha(value) for key, value in data.items()},
             'candidateFilesSha256': {key: sha(value) for key, value in files(STATE).items()},
             'readersSha256': sha(encoded(request['readers'])),
             'accessSha256': sha(encoded(reviewed)), 'preparedAt': now.isoformat(),
             'sourceCommit': request['sourceCommit'], 'proxyNetwork': upgrade.proxy_network(),
             'selectedReaders': len(request['readers']),
             'accessEmailCount': len(expected_access['allowedEmails'])}
    durable_file(STATE / 'prepared.json', encoded(value))
    if before != daily.stable_state():
        raise ValueError('Preparation changed existing containers')
    return {'preparedProof': value, 'prepared': True, 'containersStarted': 0,
            'paidAiCalls': 0, 'databaseWrites': 0, 'betaWindowActive': False}


def verify_zero(request, foreign):
    data, stage, config, image = zero_baseline(request)
    if files(DIRECTORY) != data:
        raise ValueError('Promoted zero baseline differs')
    upgrade.inspect_owner(config, image)
    quiet(DIRECTORY / 'effective-compose.json')
    services = upgrade.inspect_owner(config, image)
    result = json.loads(docker('exec', services['api']['Id'], 'node', '--input-type=module',
                               '-e', upgrade.ORIGIN_PROBE).stdout)
    if result.get('anonymousDenied') != 4:
        raise ValueError('Zero origin probe incomplete')
    if upgrade.foreign_state() != foreign:
        raise ValueError('Foreign runtime changed')
    return stage


def quiet(path):
    result = json.loads(run(upgrade.compose(path) + ['run', '-T', '--rm', '--no-deps',
                            '--entrypoint', 'node', 'api', '--input-type=module', '-e',
                            fence.PROBE], timeout=60).stdout)
    if not fence.quiet(result):
        raise ValueError('Fresh idle TLS source and no foreign writer required')
    return result


def restore_zero(request):
    data, _, _, _ = zero_baseline(request)
    for name, value in data.items():
        upgrade.atomic_private(DIRECTORY / name, value)
    upgrade.replace_services(DIRECTORY / 'effective-compose.json')


def apply(request, daily, policy):
    current_digest(request)
    value, candidate, original = prepared(request)
    if (value['sourceCommit'] != request['sourceCommit'] or
            value['previousManifestSha256'] != request['ownerManifestDigest'] or
            files(DIRECTORY) != original or value['proxyNetwork'] != upgrade.proxy_network()):
        raise ValueError('Active preparation baseline changed')
    if (STATE / 'journal.json').exists() or (STATE / 'journal.json').is_symlink():
        raise ValueError('Previous apply needs explicit disable/inspection')
    now = daily.utcnow()
    if not 0 <= (now - dt.datetime.fromisoformat(value['preparedAt'])).total_seconds() <= READER_PREPARATION_SECONDS:
        raise ValueError('Fresh reader preparation required')
    data, stage, config, image = zero_baseline(request)
    readers = json.loads(fence.original(STATE / 'readers.json'))
    access = json.loads(fence.original(STATE / 'access.json'))
    if sha(encoded(readers)) != value['readersSha256'] or sha(encoded(access)) != value['accessSha256']:
        raise ValueError('Reader selection changed')
    rendered = render(Path(request['buildProof']['sourceDirectory']), STATE)
    policy.validate_reader_candidate(config, projection(request['ownerAccess']),
                                    owner_overlay(request['ownerFlags']), readers, rendered, now=now)
    if frozen(rendered) != candidate['effective-compose.json']:
        raise ValueError('Frozen reader candidate changed')
    upgrade.inspect_owner(config, image)
    quiet(STATE / 'original' / 'effective-compose.json')
    foreign = upgrade.foreign_state()
    context = {**value, 'foreignContainers': foreign}
    def record(state):
        update_durable(STATE / 'journal.json', encoded({'state': state,
                               'preparedSha256': sha(encoded(value)),
                               'changedAt': daily.utcnow().isoformat()}))
    def held():
        quiet(STATE / 'original' / 'effective-compose.json')
        if upgrade.foreign_state() != foreign:
            raise ValueError('Foreign runtime changed during hold')
    def verify():
        result = upgrade.verify_release(STATE, rendered, image, context)
        if result.get('existingForeignContainersUnchanged') is not True:
            raise ValueError('Foreign runtime changed')
        quiet(STATE / 'effective-compose.json')
    def promote():
        for name, data in candidate.items():
            upgrade.atomic_private(DIRECTORY / name, data)
        if files(DIRECTORY) != candidate:
            raise ValueError('Promoted reader bytes differ')
    transition(record=record, stop=stop_project, held=held,
               start=lambda: upgrade.replace_services(STATE / 'effective-compose.json'),
               verify=verify, promote=promote,
               restore=lambda: restore_zero(request),
               verify_zero=lambda: verify_zero(request, foreign))
    return {**value['manifest'], 'upgraded': True, 'imageOnly': False,
            'configurationOnly': True, 'configurationMode': 'readers',
            'selectedReaders': value['selectedReaders'], 'accessEmailCount': value['accessEmailCount'],
            'runningServices': 3, 'paidAiCalls': 0, 'betaWindowActive': False,
            'databaseWrites': 0, 'existingForeignContainersUnchanged': True}


def private_root_directory(path):
    info = path.lstat()
    if (path.is_symlink() or path.resolve() != path or not stat.S_ISDIR(info.st_mode) or
            info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700):
        raise ValueError('Original private reader directory required')


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def sync_file(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def file_time(path):
    return path.lstat().st_mtime


def utc_time(text):
    # Exactly what datetime.isoformat() writes for an aware UTC value.
    if not isinstance(text, str) or not re.fullmatch(
            r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{6})?\+00:00', text):
        raise ValueError('Exact UTC time required')
    return dt.datetime.fromisoformat(text)


def unapplied_tree(base):
    """Bytes of exactly one complete, never-applied preparation.

    A journal, interrupted-replacement temp file, unknown name, link, public mode
    or missing file is not "unapplied": it is evidence that needs explicit review.
    """
    private_root_directory(base)
    original = base / 'original'
    if {item.name for item in base.iterdir()} != set(STATE_NAMES) | {'original'}:
        raise ValueError('Complete unapplied reader preparation required')
    private_root_directory(original)
    if {item.name for item in original.iterdir()} != set(ORIGINAL_NAMES):
        raise ValueError('Complete unapplied reader preparation required')
    tree = {name: fence.original(base / name) for name in STATE_NAMES}
    tree.update({'original/' + name: fence.original(original / name) for name in ORIGINAL_NAMES})
    return tree


def tree_hashes(tree):
    return {name: sha(data) for name, data in sorted(tree.items())}


def valid_prepared(value):
    digest = re.compile(r'[a-f0-9]{64}')
    if not isinstance(value, dict) or set(value) != PREPARED_KEYS:
        raise ValueError('Exact prepared receipt schema required')
    if (not isinstance(value['manifest'], dict) or not isinstance(value['proxyNetwork'], dict) or
            not isinstance(value['sourceCommit'], str) or not re.fullmatch(r'[a-f0-9]{40}', value['sourceCommit'])):
        raise ValueError('Exact prepared receipt schema required')
    for key in ('previousManifestSha256', 'readersSha256', 'accessSha256'):
        if not isinstance(value[key], str) or not digest.fullmatch(value[key]):
            raise ValueError('Exact prepared receipt schema required')
    for key in ('originalFilesSha256', 'candidateFilesSha256'):
        item = value[key]
        if (not isinstance(item, dict) or set(item) != set(FILES) or
                not all(isinstance(entry, str) and digest.fullmatch(entry) for entry in item.values())):
            raise ValueError('Exact prepared receipt schema required')
    for key in ('selectedReaders', 'accessEmailCount'):
        if isinstance(value[key], bool) or not isinstance(value[key], int):
            raise ValueError('Exact prepared receipt schema required')
    if not 1 <= value['selectedReaders'] <= 10 or not (
            value['selectedReaders'] <= value['accessEmailCount'] <= value['selectedReaders'] + 1):
        raise ValueError('Exact prepared receipt schema required')


def owner_zero_serving(request, daily, base):
    """Serving state is exactly the preserved original zero baseline; nothing runs or stops."""
    current_digest(request)
    data, _stage, config, image = zero_baseline(request, base)
    if files(DIRECTORY) != data:
        raise ValueError('Serving owner files differ from the original zero baseline')
    funded = DIRECTORY / 'personal-beta'
    if funded.exists() or funded.is_symlink():
        raise ValueError('Funded personal state present; archive refused')
    _manifest, services = daily.owner_runtime()
    environments = {name: dict(item.split('=', 1) for item in value['Config']['Env'])
                    for name, value in services.items()}
    if daily.personal_runtime_policy(environments, daily.utcnow()).get('mode') != 'owner':
        raise ValueError('Owner-only serving state required')
    upgrade.inspect_owner(config, image)
    return data


def expired_preparation(request, daily):
    """Return (value, tree, now) only for a valid, expired, never-applied preparation."""
    now = daily.utcnow()
    if now.tzinfo is None or now.utcoffset() != dt.timedelta(0):
        raise ValueError('UTC clock required')
    tree = unapplied_tree(STATE)
    value = json.loads(tree['prepared.json'])
    valid_prepared(value)
    if encoded(value) != tree['prepared.json'] or value != request['preparedProof']:
        raise ValueError('Exact prepared receipt required')
    candidate = {name: tree[name] for name in FILES}
    original = {name: tree['original/' + name] for name in FILES}
    if ({name: sha(data) for name, data in candidate.items()} != value['candidateFilesSha256'] or
            {name: sha(data) for name, data in original.items()} != value['originalFilesSha256'] or
            sha(tree['readers.json']) != value['readersSha256'] or
            sha(tree['access.json']) != value['accessSha256']):
        raise ValueError('Durable preparation changed')
    if value['previousManifestSha256'] != request['ownerManifestDigest']:
        raise ValueError('Preparation baseline differs from the active owner receipt')
    prepared_at = utc_time(value['preparedAt'])
    age = (now - prepared_at).total_seconds()
    if age < 0:
        raise ValueError('Future preparation time rejected')
    if age <= READER_PREPARATION_SECONDS:
        raise ValueError('A still fresh preparation cannot be archived')
    written = dt.datetime.fromtimestamp(file_time(STATE / 'prepared.json'), dt.timezone.utc)
    if written > now or abs((written - prepared_at).total_seconds()) > CLOCK_TOLERANCE_SECONDS:
        raise ValueError('Preparation time and file time disagree')
    if owner_zero_serving(request, daily, STATE) != original:
        raise ValueError('Original zero baseline differs from the preparation')
    return value, tree, now


def archive_identity(value):
    prepared_at = utc_time(value['preparedAt'])
    return 'expired-' + prepared_at.strftime('%Y%m%dT%H%M%SZ') + '-' + sha(encoded(value))[:16]


def archive_inventory():
    root = archive_root()
    if not root.exists() and not root.is_symlink():
        return []
    private_root_directory(root)
    entries = sorted(root.iterdir())
    if len(entries) > ARCHIVE_LIMIT:
        raise ValueError('Too many reader preparation archives')
    inventory = []
    for entry in entries:
        if not ARCHIVE_ID.fullmatch(entry.name):
            raise ValueError('Unexpected reader archive artifact')
        private_root_directory(entry)
        names = {item.name for item in entry.iterdir()}
        if not names <= {'intent.json', 'complete.json', 'state'}:
            raise ValueError('Unexpected reader archive artifact')
        intent_bytes = fence.original(entry / 'intent.json') if 'intent.json' in names else None
        intent = json.loads(intent_bytes) if intent_bytes is not None else None
        done = json.loads(fence.original(entry / 'complete.json')) if 'complete.json' in names else None
        if intent is not None and (intent.get('schema') != ARCHIVE_SCHEMA or intent.get('archiveId') != entry.name):
            raise ValueError('Reader archive intent differs')
        if done is not None and (intent is None or 'state' not in names or
                                 done.get('schema') != ARCHIVE_SCHEMA or done.get('archiveId') != entry.name or
                                 done.get('intentSha256') != sha(intent_bytes)):
            raise ValueError('Reader archive evidence is inconsistent')
        if 'state' in names and intent is None:
            raise ValueError('Reader archive evidence is inconsistent')
        inventory.append({'id': entry.name, 'path': entry, 'intent': intent, 'intentBytes': intent_bytes,
                          'complete': done, 'hasState': 'state' in names})
    return inventory


def verify_archived_bytes(item):
    tree = unapplied_tree(item['path'] / 'state')
    value = json.loads(tree['prepared.json'])
    valid_prepared(value)
    if (encoded(value) != tree['prepared.json'] or archive_identity(value) != item['id'] or
            tree_hashes(tree) != item['intent']['files'] or
            sha(tree['prepared.json']) != item['intent']['preparedSha256']):
        raise ValueError('Archived bytes differ from the recorded intent')
    return value, tree


def require_complete_archives():
    for item in archive_inventory():
        if item['complete'] is None:
            raise ValueError('Incomplete reader preparation archive requires explicit recovery')
        verify_archived_bytes(item)


def archive_summary():
    try:
        inventory = archive_inventory()
    except Exception:
        return {'valid': False}
    complete = sum(1 for item in inventory if item['complete'] is not None)
    return {'valid': True, 'complete': complete, 'incomplete': len(inventory) - complete}


def archive_result(item_id, intent, intent_bytes, repeated):
    return {'archived': True, 'alreadyArchived': repeated, 'archiveId': item_id,
            'preparedAt': intent['preparedAt'], 'preparedSha256': intent['preparedSha256'],
            'archiveIntentSha256': sha(intent_bytes), 'archivedFiles': len(intent['files']),
            'readerStatePresent': False, 'zeroBaselineUnchanged': True,
            'containersStarted': 0, 'containersStopped': 0, 'paidAiCalls': 0,
            'databaseWrites': 0, 'betaWindowActive': False}


def finish_archive(entry, intent, intent_bytes, daily, stable, foreign):
    item = {'id': entry.name, 'path': entry, 'intent': intent}
    verify_archived_bytes(item)
    if STATE.exists() or STATE.is_symlink():
        raise ValueError('Active reader preparation remains after archive')
    if daily.stable_state() != stable or upgrade.foreign_state() != foreign:
        raise ValueError('Existing containers changed during archive')
    durable_file(entry / 'complete.json', encoded({
        'schema': ARCHIVE_SCHEMA, 'archiveId': entry.name, 'intentSha256': sha(intent_bytes),
        'completedAt': daily.utcnow().isoformat()}))


def archive_expired(request, daily, policy):
    """Move one expired, never-applied preparation into a protected, verifiable archive.

    Nothing is started, stopped, restored or deleted. The preparation directory is
    renamed (same filesystem, atomic), so bytes, hashes and timestamps are preserved.
    Durable intent precedes the move and completion follows it; prepare refuses to
    start from any archive entry without a verified completion.
    """
    inventory = archive_inventory()
    for item in inventory:
        if item['complete'] is not None:
            verify_archived_bytes(item)
    stable, foreign = daily.stable_state(), upgrade.foreign_state()
    if not (STATE.exists() or STATE.is_symlink()):
        return reconcile_archive(request, daily, inventory, stable, foreign)
    value, tree, now = expired_preparation(request, daily)
    identity = archive_identity(value)
    if any(item['id'] != identity and item['complete'] is None for item in inventory):
        raise ValueError('Another reader preparation archive is incomplete')
    existing = next((item for item in inventory if item['id'] == identity), None)
    if existing is not None and (existing['complete'] is not None or existing['hasState']):
        raise ValueError('Archived preparation reappeared; explicit inspection required')
    # The daily capture and every later gate refuse more than ARCHIVE_LIMIT entries,
    # so this tool must never be the one that creates the entry beyond the limit.
    if existing is None and len(inventory) >= ARCHIVE_LIMIT:
        raise ValueError('Reader preparation archive limit reached; review the evidence first')
    if existing is not None and existing['intent'] is not None:
        intent_bytes = existing['intentBytes']
        intent = existing['intent']
        if intent['files'] != tree_hashes(tree) or intent['preparedSha256'] != sha(tree['prepared.json']):
            raise ValueError('Recorded archive intent differs from the preparation')
    else:
        intent = {'schema': ARCHIVE_SCHEMA, 'archiveId': identity, 'reason': 'expired-unapplied',
                  'expirySeconds': READER_PREPARATION_SECONDS, 'archivedAt': now.isoformat(),
                  'preparedAt': value['preparedAt'], 'preparedSourceCommit': value['sourceCommit'],
                  'archiverSourceCommit': request['sourceCommit'],
                  'preparedSha256': sha(tree['prepared.json']),
                  'ownerManifestSha256': value['previousManifestSha256'],
                  'servingFilesSha256': {name: sha(data) for name, data in files(DIRECTORY).items()},
                  'files': tree_hashes(tree)}
        intent_bytes = encoded(intent)
    root = archive_root()
    private_directory(root)
    entry = root / identity
    if not entry.exists():
        private_directory(entry)
    durable_file(entry / 'intent.json', intent_bytes)
    # Explicit ordering: the intent file (also when it already existed with equal
    # bytes after an interrupted run) and the directory entries that name it are
    # durable BEFORE the preparation moves.
    sync_file(entry / 'intent.json')
    sync_directory(entry)
    sync_directory(root)
    sync_directory(STATE.parent)
    # From here a half-done move is recoverable only through this explicit mode.
    for number in INTERRUPTION_SIGNALS:
        signal.signal(number, signal.SIG_IGN)
    os.rename(STATE, entry / 'state')
    sync_directory(entry)
    sync_directory(root)
    sync_directory(STATE.parent)
    finish_archive(entry, intent, intent_bytes, daily, stable, foreign)
    return archive_result(identity, intent, intent_bytes, False)


def reconcile_archive(request, daily, inventory, stable, foreign):
    """STATE is gone: finish an interrupted move or report an identical repeat."""
    value = request['preparedProof']
    valid_prepared(value)
    identity = archive_identity(value)
    item = next((entry for entry in inventory if entry['id'] == identity), None)
    if item is None or item['intent'] is None or not item['hasState']:
        raise ValueError('No reader preparation to archive')
    if item['intent']['preparedSha256'] != sha(encoded(value)):
        raise ValueError('Archived preparation differs from the request')
    verify_archived_bytes(item)
    owner_zero_serving(request, daily, item['path'] / 'state')
    repeated = item['complete'] is not None
    if not repeated:
        finish_archive(item['path'], item['intent'], item['intentBytes'], daily, stable, foreign)
    return archive_result(identity, item['intent'], item['intentBytes'], repeated)


def disable(request):
    # A preparation that never saved its original receipt has no reader state
    # to revoke. Refuse before touching the already-zero owner services. If the
    # receipt exists (even damaged), retain the emergency stop-first behavior.
    original_receipt = STATE / 'original' / 'stage.json'
    if not original_receipt.exists() and not original_receipt.is_symlink():
        raise ValueError('No prepared original reader receipt; owner services untouched')
    # Stop first: a damaged candidate or missing provider input cannot retain
    # writers. The verified ORIGINAL bytes are the only restart authority.
    for number in INTERRUPTION_SIGNALS:
        signal.signal(number, signal.SIG_IGN)
    try:
        foreign = upgrade.foreign_state()
    except BaseException:
        foreign = None
    stop_project()
    try:
        if foreign is None:
            raise ValueError('No verified foreign runtime baseline; keep writers stopped')
        restore_zero(request)
        stage = verify_zero(request, foreign)
        update_durable(STATE / 'journal.json', encoded({'state': 'disabled',
                               'changedAt': dt.datetime.now(dt.timezone.utc).isoformat()}))
        return {**stage, 'zeroBaselineRestored': True, 'paidAiCalls': 0,
                'betaWindowActive': False, 'requiresExternalAccessReview': True}
    except BaseException:
        stop_project()
        raise


def exclusive_lock(handle, wait_seconds=0):
    import fcntl
    deadline = time.monotonic() + wait_seconds
    while True:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return
        except BlockingIOError:
            if time.monotonic() >= deadline:
                raise ValueError('An existing operation holds the lock; no concurrent mutation allowed')
            time.sleep(0.25)


def main(request):
    import fcntl
    mode = request.get('mode')
    if os.geteuid() != 0 or mode not in {'inspect', 'prepare-readers', 'apply-readers', 'disable',
                                         'archive-expired-readers'}:
        raise ValueError('Explicit unpaid reader operator mode required')
    for path in (fence.DAILY / 'job.lock', DIRECTORY / 'activation.lock'):
        fence.original(path)
    with (fence.DAILY / 'job.lock').open('rb') as job, (DIRECTORY / 'activation.lock').open('rb') as owner:
        exclusive_lock(job, 30 if mode == 'disable' else 0)
        exclusive_lock(owner, 30 if mode == 'disable' else 0)
        if mode == 'disable':
            return disable(request)
        # Use the verified INSTALLED daily policy; never an arbitrary client copy.
        daily = fence.installed_daily()
        sys.modules['alterward_daily'] = daily
        policy = sys.modules['alterward_personal_policy']
        policy.personal_runtime_policy = daily.personal_runtime_policy
        if mode == 'inspect':
            current_digest(request)
            manifest, services = daily.owner_runtime()
            return {'manifestDigest': sha(fence.original(DIRECTORY / 'manifest.json')),
                    'commit': manifest['commit'], 'runningServices': len(services),
                    'readerPreparationPresent': STATE.exists(), 'readerArchives': archive_summary(),
                    'paidAiCalls': 0, 'containersStarted': 0, 'databaseWrites': 0}
        # The preparation-archive policy keeps archived (expired) states inside the
        # encrypted daily backup; without it a new cycle must not start or be applied.
        if (getattr(daily, 'READER_ARCHIVE_POLICY_VERSION', None) != 1 or
                getattr(daily, 'READER_PREPARATION_ARCHIVE_POLICY_VERSION', None) != 1):
            raise ValueError('Reviewed installed reader journal/config backup required')
        if mode == 'archive-expired-readers':
            return archive_expired(request, daily, policy)
        return prepare(request, daily, policy) if mode == 'prepare-readers' else apply(request, daily, policy)
