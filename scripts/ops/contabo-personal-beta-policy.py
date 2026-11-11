"""Pure candidate/rollback boundary for a future personal-beta config operator.

No I/O, deployment, invitation, key generation or spending. The caller must
independently verify the frozen owner files, fresh Auth/DB identity mapping and
prior-window count, then journal/rehearse/apply the exact candidate. This module
alone is not an activation path and must never be used to hand-edit live files.
"""

from copy import deepcopy
import datetime as dt
from decimal import Decimal, InvalidOperation
import hashlib
from functools import wraps
import json
import re

from alterward_target import validate_owner_configuration
from alterward_daily import personal_runtime_policy

SENTINEL = 'alterward_owner_provider_access_disabled'
UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}')
EMAIL = re.compile(r'[a-z0-9][a-z0-9._+\-]*@[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?)+')
PAID_FLAGS = ('PUBLIC_FORK_PERMISSION_ENABLED', 'PUBLIC_FORK_STARTS_ENABLED',
              'SCENARIO_PERSONALIZATION_ENABLED')
REQUEST_KEYS = {'participants', 'openaiKey', 'projectUsd', 'userUsd', 'startsAt', 'endsAt'}


def input_errors(function):
    """Expose a single fail-closed error type without echoing private inputs."""
    @wraps(function)
    def bounded(*args, **kwargs):
        try:
            return function(*args, **kwargs)
        except (AttributeError, KeyError, TypeError, OverflowError, InvalidOperation):
            raise ValueError('Malformed personal configuration input') from None
    return bounded


@input_errors
def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def email(value):
    if (not isinstance(value, str) or len(value) > 254 or
            not EMAIL.fullmatch(value) or '..' in value):
        raise ValueError('Canonical bounded email required')
    local = value.split('@')[0]
    if len(local) > 64 or local.endswith('.'):
        raise ValueError('Canonical bounded email required')
    return value


def positive_budget(value, ceiling):
    if not isinstance(value, str) or not re.fullmatch(r'(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?', value):
        raise ValueError('Exact decimal budget required')
    try:
        number = Decimal(value)
    except InvalidOperation:
        raise ValueError('Exact decimal budget required') from None
    if not 0 < number <= Decimal(ceiling):
        raise ValueError('Approved positive budget required')
    return format(number.normalize(), 'f')


def utc(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z', value):
        raise ValueError('Canonical UTC timestamp required')
    try:
        return dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        raise ValueError('Canonical UTC timestamp required') from None


@input_errors
def owner_baseline(config, access, flags, now):
    if set(config.get('services', {})) != {'web', 'api', 'worker'}:
        raise ValueError('Exact three-service baseline required')
    if (set(access) != {'teamDomain', 'audience', 'allowedEmails'} or
            not isinstance(access['allowedEmails'], list) or len(access['allowedEmails']) != 1):
        raise ValueError('Exact owner Access baseline required')
    email(access['allowedEmails'][0])
    validate_owner_configuration(config, access, flags)
    environments = {name: value['environment'] for name, value in config['services'].items()}
    if personal_runtime_policy(environments, now)['mode'] != 'owner':
        raise ValueError('Inactive owner baseline required')


@input_errors
def reader_candidate(config, access, flags, readers, *, now):
    """Prepare origin reading/sign-in only; no UUID, key, flag or budget change.

    External Access policy, invites and server-file promotion remain separate.
    This step permits real first login before paid UUID admission is considered.
    """
    if not isinstance(now, dt.datetime) or now.tzinfo != dt.timezone.utc:
        raise ValueError('UTC operator clock required')
    owner_baseline(config, access, flags, now)
    if not isinstance(readers, list) or not 1 <= len(readers) <= 10:
        raise ValueError('One to ten selected reader emails required')
    selected = [email(value) for value in readers]
    if len(set(selected)) != len(selected):
        raise ValueError('Unique reader emails required')
    allowed = access['allowedEmails'] + [value for value in selected if value not in access['allowedEmails']]
    updated = deepcopy(config)
    for name in ('web', 'api'):
        updated['services'][name]['environment']['CLOSED_SITE_ALLOWED_EMAILS'] = ','.join(allowed)
    return updated, {**access, 'allowedEmails': allowed}


@input_errors
def validate_reader_candidate(config, access, flags, readers, rendered, *, now):
    expected, expected_access = reader_candidate(config, access, flags, readers, now=now)
    if encoded(rendered) != encoded(expected):
        raise ValueError('Reader stage differs outside the exact origin email delta')
    return {'candidateSha256': digest(rendered), 'previousSha256': digest(config),
            'accessEmailCount': len(expected_access['allowedEmails']),
            'containersStarted': 0, 'paidAiCalls': 0}


@input_errors
def funded_from_readers(config, access, flags, readers, current, request, *, now, prior_window_count):
    """Bind syntactic paid pairs to this exact previously prepared reader set."""
    validate_reader_candidate(config, access, flags, readers, current, now=now)
    if [participant['email'] for participant in request['participants']] != readers:
        raise ValueError('Paid identities must exactly match the selected readers')
    return candidate(config, access, flags, request, now=now, prior_window_count=prior_window_count)


@input_errors
def candidate(config, access, flags, request, *, now, prior_window_count):
    """Return an in-memory exact candidate; never promote it or claim live proof.

    prior_window_count is a fresh READ ONLY production aggregate supplied by the
    trusted caller, not a field accepted from the user request. A future caller
    must repeat that observation under the held writer fence before promotion.
    """
    if now.tzinfo != dt.timezone.utc:
        raise ValueError('UTC operator clock required')
    owner_baseline(config, access, flags, now)
    if type(prior_window_count) is not int or prior_window_count != 0:
        raise ValueError('A prior paid window forbids fresh activation')
    if not isinstance(request, dict) or set(request) != REQUEST_KEYS:
        raise ValueError('Exact personal activation fields required')
    participants = request['participants']
    if not isinstance(participants, list) or not 1 <= len(participants) <= 10:
        raise ValueError('One to ten selected participants required')
    emails, users = [], []
    for participant in participants:
        if not isinstance(participant, dict) or set(participant) != {'email', 'userId'}:
            raise ValueError('Exact identity pair required')
        address = email(participant['email'])
        user = participant['userId']
        if not isinstance(user, str) or not UUID.fullmatch(user) or address in emails or user in users:
            raise ValueError('Unique canonical identities required')
        emails.append(address)
        users.append(user)
    key = request['openaiKey']
    if (not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9_\-]{16,4096}', key) or
            key == SENTINEL):
        raise ValueError('Bounded worker-only provider input required')
    # Owner decision 2026-10-19: 10 USD project allowance for three testers.
    project = positive_budget(request['projectUsd'], '10')
    user_budget = positive_budget(request['userUsd'], '3.34')
    if Decimal(user_budget) > Decimal(project):
        raise ValueError('Personal allowance cannot exceed the project allowance')
    start, end = utc(request['startsAt']), utc(request['endsAt'])
    if end - start != dt.timedelta(days=30) or not now <= start <= now + dt.timedelta(minutes=15):
        raise ValueError('One fresh fixed thirty-day window required')
    allowed = [access['allowedEmails'][0]] + [address for address in emails if address != access['allowedEmails'][0]]
    updated = deepcopy(config)
    for name in ('web', 'api'):
        updated['services'][name]['environment']['CLOSED_SITE_ALLOWED_EMAILS'] = ','.join(allowed)
    for name in ('api', 'worker'):
        env = updated['services'][name]['environment']
        env.update(CLOSED_BETA_USER_IDS=','.join(users), AI_PROJECT_BUDGET_USD=project,
                   AI_USER_BUDGET_USD=user_budget)
        for flag in PAID_FLAGS:
            env[flag] = 'true'
    worker = updated['services']['worker']['environment']
    worker.update(OPENAI_API_KEY=key, AI_BUDGET_WINDOW_START=request['startsAt'],
                  AI_BUDGET_WINDOW_END=request['endsAt'])
    # The personal processor is OpenAI-only. The separate Claude audit reserve
    # is not wired into this runtime and is never silently transferred to it.
    environments = {name: value['environment'] for name, value in updated['services'].items()}
    policy = personal_runtime_policy(environments, start)
    if policy['mode'] != 'personal-beta' or not policy['queueAllowed']:
        raise ValueError('Funded personal runtime required')
    return updated, {**access, 'allowedEmails': allowed}


def validate_candidate(config, access, flags, request, rendered, *, now, prior_window_count):
    """Reject every render change outside the exact narrow candidate delta."""
    expected, expected_access = candidate(config, access, flags, request, now=now,
                                          prior_window_count=prior_window_count)
    if encoded(rendered) != encoded(expected):
        raise ValueError('Candidate differs outside the exact approved delta')
    return {'candidateSha256': digest(rendered), 'previousSha256': digest(config),
            'participantCount': len(request['participants']),
            'accessEmailCount': len(expected_access['allowedEmails']),
            'containersStarted': 0, 'paidAiCalls': 0}


def deactivation(config, access, flags, request, current, *, prepared_at):
    """Return the original zero state only for this exact approved candidate.

    This is a value boundary, not an operational rollback; durable original
    files, service stop/start, post-checks and journal recovery remain required.
    """
    validate_candidate(config, access, flags, request, current, now=prepared_at,
                       prior_window_count=0)
    owner_baseline(config, access, flags, prepared_at)
    return deepcopy(config), deepcopy(access)
