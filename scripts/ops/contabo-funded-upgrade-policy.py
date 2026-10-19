"""Pure boundary for the N09 funded-runtime upgrade (Issue #34).

No I/O, Docker, SSH, provider or database access. The root operator supplies
Docker-captured configuration, git-bound JS observations and image capability
probes; this module decides whether they prove an exact, non-widening upgrade
of an ALREADY ACTIVE funded personal beta, and orders the transition.

It never starts, extends or re-funds a window: every funded value must be
byte-identical before and after, and the original personal-beta activation
evidence is read, never replayed or rewritten.
"""

import copy
import datetime as dt
import hashlib
import json
import re
import signal

PREPARATION_SECONDS = 900
CANDIDATE_SCHEMA = 'alterward-funded-upgrade-candidate-1'
JOURNAL_SCHEMA = 'alterward-funded-upgrade-journal-1'
OBSERVATION_VERSION = 'alterward-funded-observation-1'
CAPABILITY_VERSION = 'alterward-runtime-capability-1'
SERVICES = ('web', 'api', 'worker')
# PR #53 forwards these keys. A funded upgrade accepts them ONLY at their
# compose defaults; a cohort, longer deadline or larger envelope is a later,
# separately authorized configuration step with its own prepare/apply.
NARRATIVE_DEFAULTS = {
    'web': {},
    'api': {'NARRATIVE_PIPELINE_MODE': 'legacy', 'NARRATIVE_COHORT_USER_IDS': ''},
    'worker': {'NARRATIVE_PIPELINE_MODE': 'legacy', 'NARRATIVE_COHORT_USER_IDS': '',
               'AI_FICTION_TIMEOUT_MS': '180000', 'AI_FICTION_MAX_REQUEST_BYTES': '100000'},
}
FUNDED_KEYS = ('AI_BUDGET_WINDOW_START', 'AI_BUDGET_WINDOW_END', 'AI_PROJECT_BUDGET_USD',
               'AI_USER_BUDGET_USD', 'AI_BUDGET_WINDOW_REQUIRED', 'CLOSED_BETA_USER_IDS',
               'CLOSED_SITE_ALLOWED_EMAILS', 'GENERATION_DAILY_LIMIT',
               'GENERATION_CONCURRENT_LIMIT', 'SHARED_GENERATION_DAILY_LIMIT',
               'SHARED_GENERATION_CONCURRENT_LIMIT', 'PUBLIC_REVIEW_DAILY_LIMIT',
               'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_PRODUCTION_BUDGET_USD',
               'SHARED_MODE_ENABLED', 'PUBLIC_FORK_PERMISSION_ENABLED',
               'PUBLIC_FORK_STARTS_ENABLED', 'SCENARIO_PERSONALIZATION_ENABLED')
TERMINAL_JOB_STATUSES = {'completed', 'failed', 'cancelled'}
NARRATIVE_MIGRATION = '038_narrative_artifacts.sql'
HEX64 = re.compile(r'[a-f0-9]{64}')
COMMIT = re.compile(r'[a-f0-9]{40}')
IMAGE = re.compile(r'sha256:[a-f0-9]{64}')
CANDIDATE_KEYS = frozenset({
    'schema', 'sourceCommit', 'preparedAt', 'expiresAt', 'helperSourcesSha256',
    'observationSourceSha256', 'ciRunIds', 'auditSourceCommit', 'auditResultSha256',
    'activeManifestSha256', 'activeCommit', 'activeImageId', 'activeFilesSha256',
    'personalPreparedSha256', 'personalJournalSha256', 'fundedProjectionSha256',
    'protectedEnvironmentSha256', 'targetCommit', 'targetImageId', 'targetFilesSha256',
    'targetCapabilitySha256', 'targetMigrationsSha256', 'recoveryCommit',
    'recoveryImageId', 'recoveryCapabilitySha256', 'baselineObservationSha256',
    'ledgerSha256', 'policyInventorySha256', 'proxyNetworkSha256',
    'accessProjectionSha256', 'databaseCaSha256', 'foreignContainersSha256',
    'recoveryFilesSha256'})
JOURNAL_STATES = ('intent', 'stopped', 'held', 'schema-applied', 'schema-verified',
                  'promoted', 'origin-verified', 'applied', 'restored-previous',
                  'recovered-compatible', 'closed-recovery-required')
TERMINAL_STATES = {'applied', 'restored-previous', 'recovered-compatible'}
PRE_SCHEMA_STATES = {'intent', 'stopped', 'held'}


class UpgradeRefused(ValueError):
    """Operator-actionable refusal; never echoes private input."""


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def environments(config):
    if not isinstance(config, dict) or set(config.get('services', {})) != set(SERVICES):
        raise UpgradeRefused('Exactly the three Alterward services required')
    result = {}
    for name in SERVICES:
        env = config['services'][name].get('environment')
        if not isinstance(env, dict) or any(not isinstance(v, str) for v in env.values()):
            raise UpgradeRefused('Literal service environment required')
        result[name] = env
    return result


def without_narrative(config, *, require_defaults):
    """Drop the four forwarded narrative keys after checking their value.

    The previous (pre-PR #53) render must not carry a non-default value
    either; a candidate must carry exactly the defaults.
    """
    result = copy.deepcopy(config)
    for name, defaults in NARRATIVE_DEFAULTS.items():
        env = result['services'][name]['environment']
        for key, value in defaults.items():
            if require_defaults and env.get(key) != value:
                raise UpgradeRefused('Narrative runtime keys must stay at their defaults')
            if key in env and env[key] != value:
                raise UpgradeRefused('Narrative runtime keys must stay at their defaults')
            env.pop(key, None)
        extra = {key for key in env if key.startswith('NARRATIVE_') or key.startswith('AI_FICTION_')}
        if extra:
            raise UpgradeRefused('Unreviewed narrative runtime key')
    return result


def normalized_render(config, source=None):
    result = copy.deepcopy(config)
    for service in result['services'].values():
        service['image'] = '<pinned-image>'
        service.pop('pull_policy', None)
        if 'build' in service:
            if source is None or service['build'].get('context') != str(source):
                raise UpgradeRefused('Build context must match the verified image source')
            service['build']['context'] = '<verified-source-directory>'
    return result


def build_context(config):
    """The one source directory every service of a render was built from."""
    contexts = {service['build'].get('context') for service in config['services'].values() if 'build' in service}
    if len(contexts) > 1:
        raise UpgradeRefused('Mixed build contexts')
    return next(iter(contexts)) if contexts else None


def validate_render_delta(previous, candidate, *, previous_image, candidate_image,
                          previous_source=None, candidate_source=None):
    """The only allowed difference: the image and the four narrative defaults."""
    environments(previous)
    environments(candidate)
    if not IMAGE.fullmatch(previous_image) or not IMAGE.fullmatch(candidate_image):
        raise UpgradeRefused('Immutable image identities required')
    if previous_image == candidate_image:
        raise UpgradeRefused('Upgrade target must be a different image')
    for name in SERVICES:
        if (previous['services'][name].get('image') != previous_image or
                candidate['services'][name].get('image') != candidate_image):
            raise UpgradeRefused('Every service must run the exact pinned image')
    before = normalized_render(without_narrative(previous, require_defaults=False), previous_source)
    after = normalized_render(without_narrative(candidate, require_defaults=True), candidate_source)
    if encoded(before) != encoded(after):
        raise UpgradeRefused('Funded upgrade may change only the image and narrative defaults')
    return {'previousRenderSha256': digest(previous), 'candidateRenderSha256': digest(candidate)}


def protected_environment(config):
    """Secret-free digest of every non-narrative env value in every service."""
    envs = environments(without_narrative(config, require_defaults=False))
    return {name: {key: sha(value.encode()) for key, value in sorted(env.items())}
            for name, env in envs.items()}


def funded_projection(config):
    """Reviewable, secret-free statement of the funded authority."""
    envs = environments(config)
    worker, api = envs['worker'], envs['api']
    users = [u for u in worker.get('CLOSED_BETA_USER_IDS', '').split(',') if u]
    allowed = [e for e in envs['web'].get('CLOSED_SITE_ALLOWED_EMAILS', '').split(',') if e]
    for key in ('CLOSED_BETA_USER_IDS', 'AI_PROJECT_BUDGET_USD', 'AI_USER_BUDGET_USD'):
        if api.get(key, '') != worker.get(key, ''):
            raise UpgradeRefused('API and worker funded values differ')
    if not users or not worker.get('AI_BUDGET_WINDOW_START') or not worker.get('AI_BUDGET_WINDOW_END'):
        raise UpgradeRefused('An active funded personal beta is required, not owner zero')
    return {
        'windowStart': worker['AI_BUDGET_WINDOW_START'], 'windowEnd': worker['AI_BUDGET_WINDOW_END'],
        'windowRequired': worker.get('AI_BUDGET_WINDOW_REQUIRED'),
        'projectUsd': worker.get('AI_PROJECT_BUDGET_USD'), 'userUsd': worker.get('AI_USER_BUDGET_USD'),
        'participantCount': len(users), 'participantsSha256': sha(','.join(users).encode()),
        'accessEmailCount': len(allowed), 'accessEmailsSha256': sha(','.join(allowed).encode()),
        'limits': {key: api.get(key) for key in ('GENERATION_DAILY_LIMIT', 'GENERATION_CONCURRENT_LIMIT',
                                                 'SHARED_GENERATION_DAILY_LIMIT',
                                                 'SHARED_GENERATION_CONCURRENT_LIMIT',
                                                 'PUBLIC_REVIEW_DAILY_LIMIT')},
        'providerSha256': sha(worker.get('OPENAI_API_KEY', '').encode()),
        'funded': {key: sha(worker.get(key, '').encode()) for key in FUNDED_KEYS},
    }


def validate_funded_authority(*, personal_prepared, personal_prepared_bytes, personal_journal,
                              personal_transition, live_config):
    """Bind the live runtime to the ORIGINAL one-time personal activation.

    An owner-zero or image-only owner-upgrade receipt can never satisfy this:
    only the sticky exposure journal plus an applied funded transition can.
    """
    prepared_sha = sha(personal_prepared_bytes)
    if (not isinstance(personal_journal, dict) or personal_journal.get('state') != 'exposure-committed' or
            personal_journal.get('preparedSha256') != prepared_sha or
            not isinstance(personal_transition, dict) or personal_transition.get('state') != 'applied' or
            personal_transition.get('preparedSha256') != prepared_sha or
            not isinstance(personal_prepared, dict) or 'manifest' not in personal_prepared):
        raise UpgradeRefused('Applied, exposure-committed personal activation required')
    projection = funded_projection(live_config)
    if (projection['windowStart'] != personal_journal.get('startsAt') or
            projection['windowEnd'] != personal_journal.get('endsAt')):
        raise UpgradeRefused('Live window differs from the one-time activation journal')
    return projection


def same_except_tag(previous_text, candidate_text, target_tag):
    """server.env may change exactly one ALTERWARD_TAG line, nothing else."""
    if not re.fullmatch(r'alterward:contabo-[a-f0-9]{12}', target_tag):
        raise UpgradeRefused('Exact target tag required')
    lines_before = previous_text.split('\n')
    lines_after = candidate_text.split('\n')
    if len(lines_before) != len(lines_after):
        raise UpgradeRefused('Funded environment line count changed')
    changed = [(a, b) for a, b in zip(lines_before, lines_after) if a != b]
    expected = "ALTERWARD_TAG='" + target_tag.split(':', 1)[1] + "'"
    if (len(changed) != 1 or not re.fullmatch(r"ALTERWARD_TAG='[^'\r\n]*'", changed[0][0]) or
            changed[0][1] != expected):
        raise UpgradeRefused('Only the image tag line may change in the funded environment')
    return True


def drain_decision(observation, *, runtime_flags=None):
    """Writers must be provably quiet in the DATABASE, under the held fence.

    runtime_flags (cohort/mode) are accepted only to make the point explicit:
    they never contribute. A legacy flag with queued work is still not drained.
    """
    del runtime_flags
    queue = observation.get('queue') if isinstance(observation, dict) else None
    ledger = observation.get('ledger') if isinstance(observation, dict) else None
    if not isinstance(queue, dict) or not isinstance(ledger, dict):
        raise UpgradeRefused('Exact queue and ledger observation required')
    for key in ('pendingJobs', 'liveLeases', 'generatingBranches'):
        if type(queue.get(key)) is not int or queue[key] != 0:
            raise UpgradeRefused('Queued, leased or generating work blocks the upgrade')
    reserved = ledger.get('reservations', {}).get('reserved', {})
    if type(reserved.get('count')) is not int or reserved['count'] != 0:
        raise UpgradeRefused('Open budget reservations block the upgrade')
    frozen = queue.get('frozenNarrativeJobs')
    if not isinstance(frozen, dict) or any(status not in TERMINAL_JOB_STATUSES for status in frozen):
        raise UpgradeRefused('Non-terminal frozen narrative jobs block the upgrade')
    return {'drained': True, 'pendingJobs': 0, 'liveLeases': 0, 'openReservations': 0}


def validate_observation(observation):
    if (not isinstance(observation, dict) or observation.get('version') != OBSERVATION_VERSION or
            set(observation) != {'version', 'schema', 'ledger', 'queue', 'policies', 'artifacts', 'accounts'}):
        raise UpgradeRefused('Exact funded observation required')
    migrations = observation['schema'].get('migrations')
    if (not isinstance(migrations, list) or not migrations or
            any(set(m) != {'name', 'checksum'} for m in migrations)):
        raise UpgradeRefused('Migration history required')
    for item in observation['policies']:
        if not HEX64.fullmatch(item.get('policySha256', '')):
            raise UpgradeRefused('Policy inventory digest required')
    return observation


def preserved_projection(observation):
    """Everything an image/schema change must not touch."""
    validate_observation(observation)
    return {'ledger': observation['ledger'], 'accounts': observation['accounts'],
            'policies': [p['policySha256'] for p in observation['policies']],
            'storedArtifactsSha256': observation['artifacts']['storedSha256'],
            'storedArtifacts': observation['artifacts']['stored'],
            'periods': observation['artifacts']['periods']}


def require_preserved(before, after):
    if encoded(preserved_projection(before)) != encoded(preserved_projection(after)):
        raise UpgradeRefused('Ledger, accounts, policies or artifacts changed')
    return True


def validate_capability(capability, *, image_id):
    if (not isinstance(capability, dict) or capability.get('version') != CAPABILITY_VERSION or
            capability.get('imageId') != image_id or not IMAGE.fullmatch(image_id) or
            not isinstance(capability.get('migrations'), list) or
            not isinstance(capability.get('accepted'), list) or
            not isinstance(capability.get('rejected'), list)):
        raise UpgradeRefused('Exact image capability proof required')
    return capability


def capability_covers(capability, observation):
    """Every stored or frozen policy must be interpretable by this image."""
    inventory = {p['policySha256'] for p in validate_observation(observation)['policies']}
    if not inventory <= set(capability['accepted']) or inventory & set(capability['rejected']):
        raise UpgradeRefused('Image cannot interpret a stored narrative policy')
    return True


def expected_schema_transition(before, capability):
    """Target schema = applied history + only the image's appended migrations."""
    applied = before['schema']['migrations']
    target = capability['migrations']
    if target[:len(applied)] != applied:
        raise UpgradeRefused('Applied migration history differs from the target image')
    if NARRATIVE_MIGRATION not in [m['name'] for m in target]:
        raise UpgradeRefused('Target image lacks the narrative artifact migration')
    return {'appliedCount': len(applied), 'targetCount': len(target),
            'pending': [m['name'] for m in target[len(applied):]]}


def require_schema(after, capability):
    if (after['schema']['migrations'] != capability['migrations'] or
            after['schema']['narrativeArtifactColumn'] is not True):
        raise UpgradeRefused('Applied schema differs from the target image')
    return True


def validate_recovery_target(recovery, *, target, observation, reviewed_images):
    """A rollback image after 038 must know 038 AND every stored policy.

    A pre-038 image, or a post-038 one that cannot parse the stored planner/
    writer/planReviewer revisions, is incompatible; the result is fail-closed,
    never best-effort serving of the previous image.
    """
    validate_capability(recovery, image_id=recovery.get('imageId', ''))
    if recovery['migrations'] != target['migrations']:
        raise UpgradeRefused('Recovery image schema differs from the target schema')
    capability_covers(recovery, observation)
    if recovery['imageId'] != target['imageId'] and recovery['imageId'] not in reviewed_images:
        raise UpgradeRefused('Recovery image is not a reviewed release')
    return {'recoveryImageId': recovery['imageId'], 'sameAsTarget': recovery['imageId'] == target['imageId']}


def utc(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\+00:00', value):
        raise UpgradeRefused('Canonical UTC timestamp required')
    return dt.datetime.fromisoformat(value)


def validate_candidate(candidate, *, now):
    if (not isinstance(candidate, dict) or set(candidate) != CANDIDATE_KEYS or
            candidate['schema'] != CANDIDATE_SCHEMA):
        raise UpgradeRefused('Exact funded upgrade candidate required')
    for key in ('sourceCommit', 'activeCommit', 'targetCommit', 'recoveryCommit', 'auditSourceCommit'):
        if not COMMIT.fullmatch(candidate[key]):
            raise UpgradeRefused('Exact commits required')
    for key in ('activeImageId', 'targetImageId', 'recoveryImageId'):
        if not IMAGE.fullmatch(candidate[key]):
            raise UpgradeRefused('Immutable image identities required')
    if candidate['auditSourceCommit'] != candidate['sourceCommit']:
        raise UpgradeRefused('The audited source must be the operator source')
    if candidate['targetImageId'] == candidate['activeImageId']:
        raise UpgradeRefused('Upgrade target must be a different image')
    prepared, expires = utc(candidate['preparedAt']), utc(candidate['expiresAt'])
    if (expires - prepared).total_seconds() != PREPARATION_SECONDS:
        raise UpgradeRefused('Canonical preparation lifetime required')
    if not prepared <= now <= expires:
        raise UpgradeRefused('Stale or future funded upgrade preparation')
    if not isinstance(candidate['ciRunIds'], list) or not candidate['ciRunIds']:
        raise UpgradeRefused('Exact CI run evidence required')
    return candidate


def journal_record(state, *, prepared_sha256, previous=None, now, detail=None):
    if state not in JOURNAL_STATES:
        raise UpgradeRefused('Unknown journal state')
    history = list(previous['history']) if previous else []
    if previous and previous['state'] in TERMINAL_STATES:
        raise UpgradeRefused('A terminal attempt cannot continue')
    history.append({'state': state, 'at': now.isoformat()})
    return {'schema': JOURNAL_SCHEMA, 'state': state, 'preparedSha256': prepared_sha256,
            'history': history, **({'detail': detail} if detail else {})}


def transition(*, record, stop, held, migrate, verify_schema, promote, start_origin,
               verify_origin, start_worker, verify_runtime, schema_applied,
               restore_previous, verify_previous, start_recovery, verify_recovery):
    """Ordered funded upgrade. Production adapter and fault tests share it.

    Durable intent precedes the first stop. Schema mutation happens only after
    the fresh held observation and the compatible recovery proof. The worker
    (the only paid-provider process) starts last, after full verification.
    On failure the DATABASE, not the journal, decides whether 038 exists:
    before it, the previous funded files/image return; after it, only the
    reviewed compatible recovery target may serve, otherwise all stay stopped.
    """
    record('intent')
    try:
        stop()
        record('stopped')
        held()
        record('held')
        migrate()
        record('schema-applied')
        verify_schema()
        record('schema-verified')
        promote()
        record('promoted')
        start_origin()
        verify_origin()
        record('origin-verified')
        start_worker()
        verify_runtime()
        record('applied')
    except BaseException:
        for number in [getattr(signal, n) for n in ('SIGHUP', 'SIGTERM', 'SIGINT') if hasattr(signal, n)]:
            signal.signal(number, signal.SIG_IGN)
        fail_closed(record=record, stop=stop, schema_applied=schema_applied,
                    restore_previous=restore_previous, verify_previous=verify_previous,
                    start_recovery=start_recovery, verify_recovery=verify_recovery)
        raise


def fail_closed(*, record, stop, schema_applied, restore_previous, verify_previous,
                start_recovery, verify_recovery):
    """Shared by in-process failure and explicit post-interruption recovery."""
    try:
        stop()
        try:
            applied = schema_applied()
        except BaseException:
            applied = True  # Unknown schema state is treated as post-038.
        if not applied:
            restore_previous()
            verify_previous()
            record('restored-previous')
            return 'restored-previous'
        if start_recovery is None:
            record('closed-recovery-required')
            return 'closed-recovery-required'
        start_recovery()
        verify_recovery()
        record('recovered-compatible')
        return 'recovered-compatible'
    except BaseException:
        try:
            stop()
        finally:
            record('closed-recovery-required')
        raise
