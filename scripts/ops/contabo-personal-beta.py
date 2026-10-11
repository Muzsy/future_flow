"""One journalled personal-beta window, restoring ORIGINAL owner zero on failure.

No CLI or installed service. The git-bound workstation loader owns the source,
approval/CI/fixture checks and private selection. No Auth mutations, invitations,
Cloudflare edits, account resets, image changes or provider HTTP calls here.
"""
import datetime as dt
import json
import os
from pathlib import Path
import re
import signal
import sys

from alterward_backup import private_directory
from alterward_owner import server_environment
from alterward_target import docker, owner_overlay
from alterward_activation import DIRECTORY, FILES, INTERRUPTION_SIGNALS, encoded, frozen, sha
import alterward_upgrade as upgrade
import alterward_fence as fence
import alterward_readers as readers

STATE = DIRECTORY / 'personal-beta'
TERM_KEYS = {'participants', 'projectUsd', 'userUsd', 'startsAt', 'endsAt'}
ENV_KEYS = {'CLOSED_BETA_USER_IDS', 'AI_PROJECT_BUDGET_USD', 'AI_USER_BUDGET_USD',
            'OPENAI_API_KEY', 'AI_BUDGET_WINDOW_START', 'AI_BUDGET_WINDOW_END',
            'PUBLIC_FORK_PERMISSION_ENABLED', 'PUBLIC_FORK_STARTS_ENABLED',
            'SCENARIO_PERSONALIZATION_ENABLED'}


def terms_request(terms, key):
    if not isinstance(terms, dict) or set(terms) != TERM_KEYS:
        raise ValueError('Exact bounded personal terms required')
    return {**terms, 'openaiKey': key}


def candidate_environment(text, candidate):
    # Derive values from the independently validated pure candidate. Do not
    # reconstruct or duplicate any unrelated server secret.
    env = candidate['services']['worker']['environment']
    result = text
    for name in sorted(ENV_KEYS):
        value = env[name]
        if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_.,:\-]*', value):
            raise ValueError('Bounded literal personal environment required')
        result, count = re.subn(r"^" + name + r"='[^'\r\n]*'$",
                               name + "='" + value + "'", result, flags=re.MULTILINE)
        if count != 1:
            raise ValueError('One original personal environment line required')
    before, after = server_environment(text), server_environment(result)
    if (set(before) != set(after) or any(before[k] != after[k] for k in before if k not in ENV_KEYS) or
            any(after[k] != env[k] for k in ENV_KEYS)):
        raise ValueError('Personal delta differs from the exact whitelist')
    return result.encode()


def reader_baseline(request, policy, now):
    readers.current_digest(request)
    zero, stage, config, image = readers.zero_baseline(request)
    proof = json.loads(fence.original(readers.STATE / 'prepared.json'))
    journal = json.loads(fence.original(readers.STATE / 'journal.json'))
    if (journal.get('state') != 'applied' or
            journal.get('preparedSha256') != sha(encoded(proof))):
        raise ValueError('An applied unpaid reader journal is required')
    reader_files = readers.files(readers.STATE)
    if (readers.files(DIRECTORY) != reader_files or
            {k: sha(v) for k, v in reader_files.items()} != proof['candidateFilesSha256'] or
            {k: sha(v) for k, v in zero.items()} != proof['originalFilesSha256']):
        raise ValueError('Current reader or original zero bytes changed')
    selected = json.loads(fence.original(readers.STATE / 'readers.json'))
    access = json.loads(fence.original(readers.STATE / 'access.json'))
    if (sha(encoded(selected)) != proof['readersSha256'] or
            sha(encoded(access)) != proof['accessSha256']):
        raise ValueError('Root reader selection/access changed')
    rendered = readers.render(Path(request['buildProof']['sourceDirectory']), readers.STATE)
    policy.validate_reader_candidate(config, readers.projection(request['ownerAccess']),
                                    owner_overlay(request['ownerFlags']), selected, rendered, now=now)
    if (frozen(rendered) != reader_files['effective-compose.json'] or
            reader_files['pinned-image.json'] != zero['pinned-image.json'] or
            json.loads(reader_files['manifest.json']) != proof['manifest']):
        raise ValueError('Exact frozen unpaid reader state required')
    return zero, config, image, selected, access, rendered, proof, reader_files


def require_unattempted():
    for name in ('transition.json', 'journal.json'):
        path = STATE / name
        if path.exists() or path.is_symlink():
            raise ValueError('A prior transition forbids automatic funding or renewal')


def preparation(request):
    value = json.loads(fence.original(STATE / 'prepared.json'))
    if value != request['preparedProof']:
        raise ValueError('Exact personal preparation receipt required')
    data = readers.files(STATE)
    terms = json.loads(fence.original(STATE / 'terms.json'))
    if ({k: sha(v) for k, v in data.items()} != value['candidateFilesSha256'] or
            sha(encoded(terms)) != value['termsSha256']):
        raise ValueError('Prepared personal bytes/terms changed')
    key = server_environment(data['server.env'].decode())['OPENAI_API_KEY']
    if sha(key.encode()) != value['providerKeySha256']:
        raise ValueError('Prepared worker-only provider changed')
    return value, data, terms, key


def require_restored_preparation(daily, prepared_at):
    """A real offsite restore must include all CURRENT durable preparations.

    Root restore status names an exact server archive; the installed restore
    verified its encrypted bytes, config hashes, DB rows and cleanup before
    writing this status. A workstation's alleged backup flag is not authority.
    """
    installed = daily.config()
    proof = json.loads(daily.regular(daily.ROOT / 'status' / 'restore.json'))
    if not daily.current_proof(proof, installed, 3600):
        raise ValueError('Fresh installed-source offsite restore required')
    for field in ('offsiteCiphertextVerified', 'tamperedCiphertextRejected',
                  'proxyAdaptAndValidate', 'singleTransactionRestore',
                  'temporaryContainersRemoved', 'temporaryPlaintextRemoved',
                  'allExistingContainersUnchanged', 'decryptionIdentityMemoryOnly'):
        if proof.get(field) is not True:
            raise ValueError('Actual offsite restore checks incomplete')
    if proof.get('liveDatabaseWrites') is not False or proof.get('paidAiCalls') != 0:
        raise ValueError('Non-writing restore proof required')
    records = daily.completed_archives(daily.ROOT / 'backups')
    matches = [record['manifest'] for record in records if record['manifest']['runId'] == proof.get('runId')]
    if len(matches) != 1:
        raise ValueError('Exact server archive for the restore required')
    manifest = matches[0]
    if (manifest['encryptedFiles'] != proof['encryptedFiles'] or
            any(manifest.get(k) != v for k, v in daily.source_binding(installed).items()) or
            dt.datetime.fromisoformat(manifest['capturedAt']) < prepared_at or
            proof.get('configFilesRestored') != len(manifest['configFiles']) or
            proof.get('tablesRestoredAndDataMatched') != len(manifest['expectedTables']) or
            proof.get('rowsMatched') != sum(t['count'] for t in manifest['expectedTables'])):
        raise ValueError('Restore is not bound to the current complete archive')
    paths = daily.reader_config_paths() + daily.personal_config_paths()
    if not paths:
        raise ValueError('Durable preparation must be included in the archive')
    for path in paths:
        if manifest['configFiles'].get(str(path).lstrip('/')) != sha(fence.original(path)):
            raise ValueError('Restored archive does not contain current preparation bytes')
    return proof['runId']


def prepare(request, daily, policy):
    before = daily.stable_state()
    now = daily.utcnow()
    zero, config, image, selected, access, current, reader_proof, reader_files = reader_baseline(request, policy, now)
    if STATE.exists() or STATE.is_symlink():
        raise ValueError('Previous personal preparation needs scoped inspection')
    terms = request['terms']
    # This zero is syntactic preparation only. Actual prior-window inventory is
    # observed under the held writers immediately before any promotion.
    candidate, expected_access = policy.funded_from_readers(
        config, readers.projection(request['ownerAccess']), owner_overlay(request['ownerFlags']),
        selected, current, terms_request(terms, request['openaiKey']), now=now, prior_window_count=0)
    if expected_access != readers.projection(access):
        raise ValueError('Funding cannot change the reviewed reader Access')
    private_directory(STATE)
    readers.durable_file(STATE / 'terms.json', encoded(terms))
    readers.durable_file(STATE / 'pinned-image.json', zero['pinned-image.json'])
    readers.durable_file(STATE / 'server.env', candidate_environment(reader_files['server.env'].decode(), candidate))
    rendered = readers.render(Path(request['buildProof']['sourceDirectory']), STATE)
    if rendered != candidate:
        raise ValueError('Rendered personal candidate differs outside the narrow policy')
    readers.durable_file(STATE / 'effective-compose.json', frozen(rendered))
    roundtrip = json.loads(upgrade.run(upgrade.compose(STATE / 'effective-compose.json') + ['config', '--format', 'json']).stdout)
    if roundtrip != candidate:
        raise ValueError('Frozen personal roundtrip changed')
    manifest = {**json.loads(reader_files['manifest.json']),
                'ownerEnvironmentSha256': sha(fence.original(STATE / 'server.env')),
                'effectiveComposeSha256': sha(frozen(rendered))}
    readers.durable_file(STATE / 'manifest.json', encoded(manifest))
    value = {'sourceCommit': request['sourceCommit'], 'preparedAt': now.isoformat(),
             'readerPreparedSha256': sha(encoded(reader_proof)),
             'readerManifestDigest': sha(reader_files['manifest.json']), 'manifest': manifest,
             'candidateFilesSha256': {k: sha(v) for k, v in readers.files(STATE).items()},
             'termsSha256': sha(encoded(terms)), 'providerKeySha256': sha(request['openaiKey'].encode()),
             'participantCount': len(selected), 'accessEmailCount': len(access['allowedEmails']),
             'proxyNetwork': upgrade.proxy_network()}
    readers.durable_file(STATE / 'prepared.json', encoded(value))
    if daily.stable_state() != before:
        raise ValueError('Preparation changed existing containers')
    return {'preparedProof': value, 'preparedOnly': True, 'databaseWrites': 0,
            'providerApiCalls': 0, 'containersStarted': 0, 'budgetWindowConfigured': False}


def funded_transition(*, record, stop, held, expose, start, verify, restore, verify_zero):
    # Unlike the unpaid reader transition, fresh held admission and the sticky
    # exposure journal precede file promotion and the first candidate start.
    record('applying')  # separate transition.json; durable before the first stop
    try:
        stop()
        held()
        record('held')
        expose()
        start()
        verify()
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


def require_future_start(policy, terms, now, minimum_seconds):
    if (policy.utc(terms['startsAt']) - now).total_seconds() < minimum_seconds:
        raise ValueError('Insufficient future window for a non-spending verification')


def apply(request, daily, policy):
    import alterward_personal_observation as observation
    require_unattempted()
    now = daily.utcnow()
    zero, config, image, selected, access, current, reader_proof, reader_files = reader_baseline(request, policy, now)
    value, candidate_files, terms, key = preparation(request)
    prepared_at = dt.datetime.fromisoformat(value['preparedAt'])
    if (value['sourceCommit'] != request['sourceCommit'] or
            value['readerPreparedSha256'] != sha(encoded(reader_proof)) or
            value['readerManifestDigest'] != request['ownerManifestDigest'] or
            value['proxyNetwork'] != upgrade.proxy_network() or
            not 0 <= (now - prepared_at).total_seconds() <= 900):
        raise ValueError('Current fresh personal preparation required')
    require_future_start(policy, terms, now, 300)
    candidate, expected_access = policy.funded_from_readers(
        config, readers.projection(request['ownerAccess']), owner_overlay(request['ownerFlags']),
        selected, current, terms_request(terms, key), now=prepared_at, prior_window_count=0)
    if (readers.render(Path(request['buildProof']['sourceDirectory']), STATE) != candidate or
            frozen(candidate) != candidate_files['effective-compose.json'] or
            expected_access != readers.projection(access)):
        raise ValueError('Exact original candidate render required')
    restore_run = require_restored_preparation(daily, prepared_at)
    original = upgrade.inspect_owner(current, image)  # actual Docker capture, not selection
    readers.quiet(DIRECTORY / 'effective-compose.json')
    foreign = upgrade.foreign_state()
    context = {**value, 'foreignContainers': foreign}
    bound_selection = {**request['observationSelection'], 'participants': terms['participants']}
    if set(request['observationSelection']) != {'seedProjectKeys', 'seedUserKeys'}:
        raise ValueError('Selection cannot carry journal/fence/source/provider authority')
    def record(state):
        readers.update_durable(STATE / 'transition.json', encoded({'state': state,
            'preparedSha256': sha(encoded(value)), 'changedAt': daily.utcnow().isoformat()}))
    def held():
        observation.held_services(original)
        readers.quiet(DIRECTORY / 'effective-compose.json')
        if upgrade.foreign_state() != foreign:
            raise ValueError('Foreign runtime changed during held transition')
    def expose():
        # A fresh full observation is the last authority before promotion. A
        # prior attempt's journal can never be ignored or replaced by this call.
        proof = observation.observe_held(bound_selection, original=original,
            manifest_digest=request['ownerManifestDigest'], probe_source=request['observationSource'])
        policy.funded_from_readers(config, readers.projection(request['ownerAccess']),
            owner_overlay(request['ownerFlags']), selected, current, terms_request(terms, key),
            now=prepared_at, prior_window_count=proof['priorWindowAccounts'])
        if (readers.files(STATE) != candidate_files or
                sha(encoded(json.loads(fence.original(STATE / 'terms.json')))) != value['termsSha256']):
            raise ValueError('Prepared bytes changed during held observation')
        require_future_start(policy, terms, daily.utcnow(), 180)
        readers.durable_file(STATE / 'observation.json', encoded(proof))
        # Sticky journal is written BEFORE any worker key is exposed. Even a
        # failed start/rollback permanently bars a fresh automatic window.
        readers.durable_file(STATE / 'journal.json', encoded({'state': 'exposure-committed',
            'preparedSha256': sha(encoded(value)), 'identityBindingSha256': proof['identityBindingSha256'],
            'startsAt': terms['startsAt'], 'endsAt': terms['endsAt'],
            'restoredPreparationRunId': restore_run, 'changedAt': daily.utcnow().isoformat()}))
        for name, data in candidate_files.items():
            upgrade.atomic_private(DIRECTORY / name, data)
        if readers.files(DIRECTORY) != candidate_files:
            raise ValueError('Promoted personal bytes differ')
    def start():
        require_future_start(policy, terms, daily.utcnow(), 180)
        upgrade.replace_services(DIRECTORY / 'effective-compose.json')
    def verify():
        result = upgrade.verify_release(DIRECTORY, candidate, image, context)
        readers.quiet(DIRECTORY / 'effective-compose.json')
        if result.get('existingForeignContainersUnchanged') is not True:
            raise ValueError('Foreign runtime changed')
        require_future_start(policy, terms, daily.utcnow(), 1)
        if readers.files(DIRECTORY) != candidate_files:
            raise ValueError('Active personal files drifted')
    funded_transition(record=record, stop=readers.stop_project, held=held, expose=expose,
        start=start, verify=verify, restore=lambda: readers.restore_zero(request),
        verify_zero=lambda: readers.verify_zero(request, foreign))
    return {**value['manifest'], 'upgraded': True, 'imageOnly': False,
            'configurationOnly': True, 'configurationMode': 'personal-beta',
            'runningServices': 3, 'selectedReaders': len(selected),
            'accessEmailCount': len(access['allowedEmails']), 'budgetWindowConfigured': True,
            'betaWindowActive': False, 'startsAt': terms['startsAt'], 'endsAt': terms['endsAt'],
            'projectUsd': terms['projectUsd'], 'userUsd': terms['userUsd'],
            'databaseWrites': 0, 'paidAiCalls': 0, 'existingForeignContainersUnchanged': True}


def disable(request):
    # Reuse the independent stop-first ORIGINAL zero recovery. It reads neither
    # our candidate nor our provider nor our preparation/journal before stopping.
    result = readers.disable(request)
    prior = (STATE / 'journal.json').exists() or (STATE / 'journal.json').is_symlink()
    if STATE.exists() and not STATE.is_symlink():
        readers.update_durable(STATE / 'transition.json', encoded({'state': 'disabled',
            'changedAt': dt.datetime.now(dt.timezone.utc).isoformat()}))
    return {**result, 'operationPaidAiCalls': 0,
            'paidAiCallsScope': 'this-configuration-operation',
            'historicalProviderUsageNotMeasured': True,
            'priorFundedJournalPresent': prior,
            'providerKeyRevocationRequired': prior}


def main(request):
    mode = request.get('mode')
    if os.geteuid() != 0 or mode not in {'inspect', 'prepare-personal', 'apply-personal', 'disable'}:
        raise ValueError('Explicit personal operator mode required')
    for path in (fence.DAILY / 'job.lock', DIRECTORY / 'activation.lock'):
        fence.original(path)
    with (fence.DAILY / 'job.lock').open('rb') as job, (DIRECTORY / 'activation.lock').open('rb') as owner:
        readers.exclusive_lock(job, 30 if mode == 'disable' else 0)
        readers.exclusive_lock(owner, 30 if mode == 'disable' else 0)
        if mode == 'disable':
            return disable(request)
        daily = fence.installed_daily()
        if mode == 'inspect':
            readers.current_digest(request)
            manifest, services = daily.owner_runtime()
            return {'manifestDigest': sha(fence.original(DIRECTORY / 'manifest.json')),
                    'commit': manifest['commit'], 'runningServices': len(services),
                    'personalPreparationPresent': STATE.exists(), 'containersStarted': 0,
                    'databaseWrites': 0, 'providerApiCalls': 0}
        if (getattr(daily, 'READER_ARCHIVE_POLICY_VERSION', None) != 1 or
                getattr(daily, 'PERSONAL_ARCHIVE_POLICY_VERSION', None) != 1):
            raise ValueError('Reviewed installed personal/reader config archive required')
        policy = sys.modules['alterward_personal_policy']
        policy.personal_runtime_policy = daily.personal_runtime_policy
        return prepare(request, daily, policy) if mode == 'prepare-personal' else apply(request, daily, policy)
