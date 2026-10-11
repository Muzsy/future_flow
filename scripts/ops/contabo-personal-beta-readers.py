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


def zero_baseline(request):
    # This validation is independent of candidate bytes and selected readers.
    original = STATE / 'original'
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
    if instant.tzinfo != dt.timezone.utc or not 0 <= (now - instant).total_seconds() <= 900:
        raise ValueError('Fresh external Access readback required')
    if STATE.exists() or STATE.is_symlink():
        raise ValueError('Previous reader preparation requires explicit inspection')
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
    if not 0 <= (now - dt.datetime.fromisoformat(value['preparedAt'])).total_seconds() <= 900:
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


def disable(request):
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


def main(request):
    import fcntl
    mode = request.get('mode')
    if os.geteuid() != 0 or mode not in {'inspect', 'prepare-readers', 'apply-readers', 'disable'}:
        raise ValueError('Explicit unpaid reader operator mode required')
    for path in (fence.DAILY / 'job.lock', DIRECTORY / 'activation.lock'):
        fence.original(path)
    with (fence.DAILY / 'job.lock').open('rb') as job, (DIRECTORY / 'activation.lock').open('rb') as owner:
        fcntl.flock(job, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fcntl.flock(owner, fcntl.LOCK_EX | fcntl.LOCK_NB)
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
                    'readerPreparationPresent': STATE.exists(),
                    'paidAiCalls': 0, 'containersStarted': 0, 'databaseWrites': 0}
        if getattr(daily, 'READER_ARCHIVE_POLICY_VERSION', None) != 1:
            raise ValueError('Reviewed installed reader journal/config backup required')
        return prepare(request, daily, policy) if mode == 'prepare-readers' else apply(request, daily, policy)
