"""Root adapter for one explicit successor generation, retaining the original authority.

No provider request, account creation or database restore. The new image
contains the reviewed accounting transport; application sources must also match
the ORIGINAL serving image. Only the selected generation's future allowance,
admission, reader list and v9 runtime configuration may change: owner-e2e (first
generation), then reader-admission (no database write) and tester-beta, each chained
to the previous fully exposed generation.

The schema-039 generation is the one exception that changes the database and the
application: it takes the live, fully exposed chain tip from schema 038 to the
reviewed 039 billing foundation (one serializable migration that proves every
pre-039 row unchanged and the four billing tables empty) and swaps the three
services to the reviewed 039 image, with no allowance, reader, cohort or window
change and billing left at its compose default (off).
"""
import copy
import datetime as dt
import json
import os
from pathlib import Path
import re
import signal

from alterward_activation import DIRECTORY, FILES, encoded, frozen, sha
import alterward_fence as fence
import alterward_readers as readers
import alterward_upgrade as upgrade
import alterward_funded_upgrade as funded
from alterward_successor_transition import transition

VERSION = 'alterward-beta-successor-1'
STATE_NAME = 'beta-successor'  # the first generation; later ones are chained, see System
ROOT_NAMES = ('beta-successor', 'beta-successor-2', 'beta-successor-3', 'beta-successor-4',
              'beta-successor-5', 'beta-successor-6', 'beta-successor-7')
PLAN_VERSION = 'alterward-beta-successor-plan-2'
# The six files the audit-driven dependency update (#110) changed; any other
# manifest, even a sibling workspace package, stays frozen until a reviewed change names it.
DEPENDENCY_MANIFESTS = frozenset({
    'package.json', 'pnpm-lock.yaml', 'apps/api/package.json', 'apps/web/package.json',
    'packages/ai/package.json', 'packages/contracts/package.json'})
ALLOWANCE_KEYS = {'CLOSED_BETA_USER_IDS', 'AI_PROJECT_BUDGET_USD', 'AI_USER_BUDGET_USD',
                  'AI_BUDGET_WINDOW_START', 'AI_BUDGET_WINDOW_END'}
READER_PURPOSE = 'reader-admission'
SCHEMA_PURPOSE = 'schema-039'
REGISTRY_PURPOSE = 'schema-040'
REGISTRY_BILLING_PURPOSE = 'billing-config-040'
BILLING_PURPOSE = 'billing-config'
# Billing configuration is rolled out in at most three ordered, once-only stages:
# a Stripe TEST configuration, the LIVE configuration, and finally the enforcement flag.
BILLING_STAGES = ('sandbox', 'live', 'enforce')
BILLING_KEYS = tuple(funded.BILLING_DEFAULTS)
SECRET_KEY = re.compile(r'(?:sk|rk)_(test|live)_[A-Za-z0-9]{8,}')
WEBHOOK_SECRET = re.compile(r'whsec_[A-Za-z0-9]{8,}')
PRICE_ID = re.compile(r'price_[A-Za-z0-9]+')
COUPON_ID = re.compile(r'[A-Za-z0-9_-]{1,100}')
API_VERSION = re.compile(r'\d{4}-\d{2}-\d{2}(?:\.[a-z]+)?')
# One https origin with a short bounded path/query; no credentials, port, quote or backslash.
RETURN_URL = re.compile(r'https://([a-z0-9][a-z0-9.-]*[a-z0-9])(?:/[A-Za-z0-9._~/%?=&:-]{0,200})?')
# The only supported database step: the live 038 production database to the
# reviewed 001-039 baseline. No caller-supplied schema, catalog or file list.
SCHEMA_FROM, SCHEMA_TO = 38, 39
# purpose -> (participants, projectUsd, userUsd); only allowance-changing purposes.
WINDOW_PURPOSES = {'owner-e2e': (1, '3', '3'), 'tester-beta': (3, '10', '3.33')}
USER_ID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}')
EMAIL = re.compile(r'[-a-z0-9._+]+@[-a-z0-9.]+')


def canonical_sha(value):
    # Matches core.hash(stableStringify(value)), without encoded()'s newline.
    return sha(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode())


def purpose_of(selection):
    return selection.get('purpose') if isinstance(selection, dict) else None


def allowed_purposes(generation):
    # The first generation is the single-owner trial that is already exposed. Later
    # generations first admit readers (no money), then open the tester window; the
    # schema upgrade is allowed once, behind any fully exposed generation.
    return ({'owner-e2e'} if generation == 1
            else {READER_PURPOSE, 'tester-beta', SCHEMA_PURPOSE, BILLING_PURPOSE})


def is_tester_window(terms):
    """The effective window already is the one tester window (shape of tester-beta)."""
    count, project_usd, user_usd = WINDOW_PURPOSES['tester-beta']
    return (len(terms['participants']) == count and terms['projectUsd'] == project_usd
            and terms['userUsd'] == user_usd)


def reader_emails(selection):
    funded.exact(selection, {'purpose', 'previousTermsSha256', 'readers'})
    emails = funded.exact(selection['readers'], {'allowedEmails'})['allowedEmails']
    if (not isinstance(emails, list) or emails != sorted(set(emails)) or not 1 <= len(emails) <= 10
            or any(not isinstance(e, str) or not EMAIL.fullmatch(e) for e in emails)
            or not isinstance(selection['previousTermsSha256'], str)
            or not funded.DIGEST.fullmatch(selection['previousTermsSha256'])):
        raise ValueError('Exact sorted reader list required')
    return emails


def schema_selection(selection):
    funded.exact(selection, {'purpose', 'previousTermsSha256', 'fromSchema', 'toSchema'})
    if (selection['purpose'] != SCHEMA_PURPOSE or type(selection['fromSchema']) is not int
            or type(selection['toSchema']) is not int
            or (selection['fromSchema'], selection['toSchema']) != (SCHEMA_FROM, SCHEMA_TO)
            or not isinstance(selection['previousTermsSha256'], str)
            or not funded.DIGEST.fullmatch(selection['previousTermsSha256'])):
        raise ValueError('Exact approved schema 038 to 039 selection required')
    return selection


def billing_selection(selection):
    """Exact non-secret billing selection. Secrets appear only as SHA-256 digests."""
    funded.exact(selection, {'purpose', 'previousTermsSha256', 'billing'})
    value = funded.exact(selection['billing'], {
        'stage', 'mode', 'enabled', 'enforcement', 'priceId', 'couponId', 'apiVersion', 'successUrl',
        'cancelUrl', 'founderUserIds', 'reservationTtlSeconds', 'secretKeySha256', 'webhookSecretSha256'})
    founders = value['founderUserIds']
    stage, mode = value['stage'], value['mode']
    if (selection['purpose'] != BILLING_PURPOSE or not isinstance(selection['previousTermsSha256'], str)
            or not funded.DIGEST.fullmatch(selection['previousTermsSha256'])
            or stage not in BILLING_STAGES or mode not in {'test', 'live'}
            or value['enabled'] is not True or type(value['enforcement']) is not bool
            # Test keys can never enforce payment; the live stages are separate and ordered.
            or (stage == 'sandbox' and (mode != 'test' or value['enforcement']))
            or (stage == 'live' and (mode != 'live' or value['enforcement']))
            or (stage == 'enforce' and (mode != 'live' or not value['enforcement']))
            or any(not isinstance(value[k], str) or not pattern.fullmatch(value[k]) for k, pattern in (
                ('priceId', PRICE_ID), ('couponId', COUPON_ID), ('apiVersion', API_VERSION),
                ('successUrl', RETURN_URL), ('cancelUrl', RETURN_URL),
                ('secretKeySha256', funded.DIGEST), ('webhookSecretSha256', funded.DIGEST)))
            or not isinstance(founders, list) or founders != sorted(set(founders)) or len(founders) > 10
            or any(not isinstance(u, str) or not USER_ID.fullmatch(u) for u in founders)
            or type(value['reservationTtlSeconds']) is not int
            or not 600 <= value['reservationTtlSeconds'] <= 86400):
        raise ValueError('Exact approved billing-config selection required')
    return value


def billing_secrets(supplied, selection):
    """Validate the two Stripe secrets against the selection digests; never stored or logged."""
    value = billing_selection(selection)
    funded.exact(supplied, {'secretKey', 'webhookSecret'})
    key, webhook = supplied['secretKey'], supplied['webhookSecret']
    if (not isinstance(key, str) or not isinstance(webhook, str)
            or not (match := SECRET_KEY.fullmatch(key)) or not WEBHOOK_SECRET.fullmatch(webhook)
            or match[1] != value['mode']
            or sha(key.encode()) != value['secretKeySha256']
            or sha(webhook.encode()) != value['webhookSecretSha256']):
        raise ValueError('Exact approved Stripe secrets required')
    return key, webhook


def billing_values(selection, before, secrets=None):
    """The exact eleven BILLING_*/STRIPE_* environment values this selection sets.

    Without supplied secrets the ones already in the protected environment must be the
    selected ones (digest-bound), so a later stage can change one flag without a resend.
    """
    value = billing_selection(selection)
    if secrets is not None:
        key, webhook = billing_secrets(secrets, selection)
    else:
        key, webhook = (before.get('STRIPE_SECRET_KEY', ''), before.get('STRIPE_WEBHOOK_SECRET', ''))
        if (not SECRET_KEY.fullmatch(key) or not WEBHOOK_SECRET.fullmatch(webhook)
                or sha(key.encode()) != value['secretKeySha256']
                or sha(webhook.encode()) != value['webhookSecretSha256']
                or SECRET_KEY.fullmatch(key)[1] != value['mode']):
            raise ValueError('Selected Stripe secrets are not in the protected environment')
    host = before.get('PUBLIC_HOST', '')
    for name in ('successUrl', 'cancelUrl'):
        if not host or RETURN_URL.fullmatch(value[name])[1] != host:
            raise ValueError('Return addresses must use the production host')
    return {'BILLING_ENABLED': 'true', 'BILLING_ENFORCEMENT': 'true' if value['enforcement'] else 'false',
            'STRIPE_SECRET_KEY': key, 'STRIPE_WEBHOOK_SECRET': webhook, 'STRIPE_PRICE_ID': value['priceId'],
            'STRIPE_FOUNDER_COUPON_ID': value['couponId'], 'STRIPE_API_VERSION': value['apiVersion'],
            'BILLING_SUCCESS_URL': value['successUrl'], 'BILLING_CANCEL_URL': value['cancelUrl'],
            'BILLING_FOUNDER_USER_IDS': ','.join(value['founderUserIds']),
            'BILLING_RESERVATION_TTL_SECONDS': str(value['reservationTtlSeconds'])}


def billing_stage_key(selection):
    return BILLING_PURPOSE + ':' + billing_selection(selection)['stage']


def require_billing_stage(selection, before, purposes):
    """Ordered, once-only stages, each starting from exactly the state it expects."""
    stage = billing_selection(selection)['stage']
    done = {p for p in purposes if isinstance(p, str) and p.startswith(BILLING_PURPOSE + ':')}
    if billing_stage_key(selection) in done:
        raise ValueError('This billing stage may be applied at most once')
    default = all(before.get(k, v) == v for k, v in funded.BILLING_DEFAULTS.items())
    current_key = before.get('STRIPE_SECRET_KEY', '')
    live = bool(SECRET_KEY.fullmatch(current_key)) and SECRET_KEY.fullmatch(current_key)[1] == 'live'
    if stage == 'sandbox':
        if not default or BILLING_PURPOSE + ':live' in done:
            raise ValueError('The sandbox stage requires the default-off billing configuration')
    elif stage == 'live':
        if live or BILLING_PURPOSE + ':enforce' in done:
            raise ValueError('The live stage requires a default-off or sandbox billing configuration')
    else:
        # Enforcement flips exactly one flag of an already live, enabled, non-enforcing configuration.
        value = billing_selection(selection)
        expected = {k: v for k, v in billing_values(selection, before).items()}
        if (BILLING_PURPOSE + ':live' not in done or not live
                or any(before.get(k) != v for k, v in expected.items() if k != 'BILLING_ENFORCEMENT')
                or before.get('BILLING_ENFORCEMENT') != 'false' or value['mode'] != 'live'):
            raise ValueError('Enforcement requires the unchanged live configuration')


def keeps_window(selection):
    """Reader admission, the schema upgrade and billing configuration never change the funded window."""
    return purpose_of(selection) in {READER_PURPOSE, SCHEMA_PURPOSE, BILLING_PURPOSE}


def selection_values(selection):
    """The allowance environment a selection may set; empty without a window change."""
    purpose = purpose_of(selection)
    if purpose == READER_PURPOSE:
        reader_emails(selection)
        return {}
    if purpose == SCHEMA_PURPOSE:
        schema_selection(selection)
        return {}
    if purpose == BILLING_PURPOSE:
        billing_selection(selection)
        return {}
    funded.exact(selection, {'purpose', 'previousTermsSha256', 'closePreviousAt', 'next'})
    terms = selection['next']
    funded.exact(terms, {'participants', 'projectUsd', 'userUsd', 'startsAt', 'endsAt'})
    if purpose not in WINDOW_PURPOSES:
        raise ValueError('Approved successor purpose required')
    count, project_usd, user_usd = WINDOW_PURPOSES[purpose]
    participants = terms['participants']
    if (terms['projectUsd'] != project_usd or terms['userUsd'] != user_usd
            or not isinstance(participants, list) or len(participants) != count):
        raise ValueError('Explicit approved participant count and allowance required')
    for participant in participants:
        funded.exact(participant, {'email', 'userId'})
        if (not isinstance(participant['userId'], str) or not USER_ID.fullmatch(participant['userId'])
                or not isinstance(participant['email'], str) or not EMAIL.fullmatch(participant['email'])):
            raise ValueError('Exact private participant mapping required')
    if (len({p['userId'] for p in participants}) != count or len({p['email'] for p in participants}) != count
            or not isinstance(selection['previousTermsSha256'], str)
            or not funded.DIGEST.fullmatch(selection['previousTermsSha256'])):
        raise ValueError('Unique participants and previous terms digest required')
    start, end = (funded.stamp(terms[k]) for k in ('startsAt', 'endsAt'))
    if end - start != dt.timedelta(days=30) or funded.stamp(selection['closePreviousAt']) >= start:
        raise ValueError('Ordered thirty-day trial required')
    return {'CLOSED_BETA_USER_IDS': ','.join(p['userId'] for p in participants),
            'AI_PROJECT_BUDGET_USD': project_usd, 'AI_USER_BUDGET_USD': user_usd,
            'AI_BUDGET_WINDOW_START': terms['startsAt'], 'AI_BUDGET_WINDOW_END': terms['endsAt']}


def runtime_selection(selection, previous=None):
    if keeps_window(selection):
        # Reader admission and the schema upgrade never change who may generate: the
        # cohort is the still-active window's, taken from the authenticated previous terms.
        if previous is None:
            raise ValueError('Active terms required without a window change')
        participants = previous['participants']
    else:
        participants = selection['next']['participants']
    return {'mode': 'narrative-fiction-v2', 'generation': 'v9',
            'cohortUserIds': [p['userId'] for p in participants],
            'timeoutMs': 300000, 'maxRequestBytes': 196608}


def candidate_environment(text, selection, image_tag, previous=None, secrets=None):
    values = selection_values(selection)
    before = upgrade.server_environment(text)
    text = upgrade.image_only_environment(text, image_tag)
    for key, value in values.items():
        if not isinstance(value, str) or not re.fullmatch(r'[a-zA-Z0-9_.,:\-]+', value):
            raise ValueError('Bounded literal trial value required')
        text, count = re.subn(r"^" + key + r"='[^'\r\n]*'$", key + "='" + value + "'", text, flags=re.MULTILINE)
        if count != 1:
            raise ValueError('One original allowance line required')
    extra = set()
    if purpose_of(selection) == READER_PURPOSE:
        text, count = re.subn(r"^CLOSED_SITE_ALLOWED_EMAILS='[^'\r\n]*'$",
                              "CLOSED_SITE_ALLOWED_EMAILS='" + ','.join(reader_emails(selection)) + "'",
                              text, flags=re.MULTILINE)
        if count != 1:
            raise ValueError('One original reader line required')
        extra.add('CLOSED_SITE_ALLOWED_EMAILS')
    if purpose_of(selection) == BILLING_PURPOSE:
        # Existing lines are replaced in place, missing ones appended; nothing else may move.
        billing = billing_values(selection, before, secrets)
        for key, value in billing.items():
            if key in before:
                text, count = re.subn(r"^" + key + r"='[^'\r\n]*'$", lambda _m, k=key, v=value: k + "='" + v + "'",
                                      text, flags=re.MULTILINE)
                if count != 1:
                    raise ValueError('One original billing line required')
            else:
                text = text.rstrip('\n') + "\n" + key + "='" + value + "'\n"
        extra |= set(billing)
    runtime = runtime_selection(selection, previous)
    text = funded.narrative_environment(text, runtime)
    changed = set(values) | set(funded.narrative_runtime_values(runtime)) | {'ALTERWARD_TAG'} | extra
    after = upgrade.server_environment(text)
    if {k:v for k,v in before.items() if k not in changed} != {k:v for k,v in after.items() if k not in changed}:
        raise ValueError('Unrelated authority or credential changed')
    return text.encode()


def normalized(config, selection, previous=None):
    result = funded.normalized_configuration(config, runtime_selection(selection, previous))
    values = selection_values(selection)
    for role in ('api', 'worker'):
        env = result['services'][role]['environment']
        for key, value in values.items():
            if role == 'worker' or key in {'CLOSED_BETA_USER_IDS', 'AI_PROJECT_BUDGET_USD', 'AI_USER_BUDGET_USD'}:
                env[key] = value
    if purpose_of(selection) == READER_PURPOSE:
        for role in ('web', 'api'):
            result['services'][role]['environment']['CLOSED_SITE_ALLOWED_EMAILS'] = ','.join(reader_emails(selection))
    if purpose_of(selection) == BILLING_PURPOSE:
        # The delta is the eleven billing values on api and worker only; their exact content is
        # authenticated separately (digests here, Daily on the frozen candidate). The web service
        # must carry none of them, on either side.
        for role in ('api', 'worker'):
            for key in BILLING_KEYS:
                result['services'][role]['environment'][key] = '<billing-delta>'
    return result


class System(funded.System):
    def __init__(self, request, daily):
        super().__init__(request, daily)
        names = getattr(daily, 'SUCCESSOR_ROOT_NAMES', None)
        if (not names or tuple(names) != tuple(ROOT_NAMES)
                or any(not hasattr(daily, n) for n in ('successor_parent_context', 'successor_authority_paths'))):
            raise ValueError('Installed Daily lacks the reviewed chained successor authority')
        present = [n for n in names if (DIRECTORY / n).exists() or (DIRECTORY / n).is_symlink()]
        if present != list(names[:len(present)]):
            raise ValueError('Successor generations must be contiguous')
        if request['mode'] == 'prepare':
            if len(present) == len(names):
                raise ValueError('Successor generation limit reached')
            name = names[len(present)]
        else:
            name = present[-1] if present else names[0]
        self.root = DIRECTORY / name
        self.generation = names.index(name) + 1
        self.recovery = request['mode'] == 'recover'

    def selected(self):
        if 'selection' in self.request:
            value = self.request['selection']
        else:
            value = json.loads(fence.original(self.root / 'selection.json'))
        if purpose_of(value) not in allowed_purposes(self.generation):
            raise ValueError('Approved successor purpose for this generation required')
        return value

    def is_reader(self):
        return purpose_of(self.selected()) == READER_PURPOSE

    def is_schema(self):
        return purpose_of(self.selected()) == SCHEMA_PURPOSE

    def is_billing(self):
        return purpose_of(self.selected()) == BILLING_PURPOSE

    def registry_profile(self):
        # The new purposes are intentionally not admitted by allowed_purposes
        # until their full prepare/Daily/recovery protocol is wired and tested.
        if ('selection' not in self.request and not (self.root / 'selection.json').exists()
                and not (self.root / 'selection.json').is_symlink()):
            return False  # the original engine-freeze capability can precede selection creation
        return purpose_of(self.selected()) in {REGISTRY_PURPOSE, REGISTRY_BILLING_PURPOSE}

    def allowed_capability_commands(self):
        return ((funded.CAPABILITY_COMMAND, funded.REGISTRY_CAPABILITY_COMMAND) if self.registry_profile()
                else super().allowed_capability_commands())

    def image_capability_profile(self):
        return (('alterward-funded-runtime-2', 40, 'service-registry-040') if self.registry_profile()
                else super().image_capability_profile())

    def no_database_write(self):
        """Reader admission and billing configuration never write the database."""
        return self.is_reader() or self.is_billing()

    def is_window(self):
        """An allowance-changing generation: owner-e2e or tester-beta."""
        return not keeps_window(self.selected())

    def billing_secrets(self):
        """The two Stripe secrets of a prepare request; only in memory, never persisted."""
        return self.request.get('billingSecrets') if self.is_billing() else None

    def chain(self):
        """Funded parent, its role and the context this generation is bound to."""
        return self.daily.successor_parent_context(self.generation)

    def original_terms(self):
        # Kept under its first-generation name: the terms the NEW selection replaces.
        return self.chain()[2]['terms']

    def active_access(self):
        return self.chain()[2]['access']

    def validate_candidate(self, *, check_oneoffs=True):
        parent, role, context = self.chain()
        return self.daily.successor_candidate(parent, role, root=self.root, context=context,
                                              check_oneoffs=check_oneoffs)

    def frozen_source_hashes(self):
        # Application sources, schema, deploy files, Dockerfile and workspace policy stay
        # byte-identical to the serving image. Only the named dependency manifests and the
        # lockfile may differ: reviewed patch updates reach the target image through the
        # exact audit, image-fixture and rehearsal gates, not through this engine freeze.
        return {p:h for p,h in self.request['sourceHashes'].items()
                if (p.startswith(('apps/','packages/','database/','deploy/'))
                    or p in {'Dockerfile','pnpm-workspace.yaml'})
                and p not in DEPENDENCY_MANIFESTS}

    def capability_input_hashes(self):
        # A second fixed scope compares the NEW application inputs inside the
        # ORIGINAL image. No request-supplied alternate scope is accepted.
        accepted = super().capability_input_hashes() | {sha(encoded(self.frozen_source_hashes()))}
        # The filtered scope exists only once a schema selection has been recorded.
        if (self.root / 'selection.json').exists() and self.is_schema():
            accepted |= {sha(encoded(self.schema_frozen_source_hashes()))}
        elif (self.root / 'selection.json').exists() and self.is_billing():
            accepted |= {sha(encoded(self.billing_frozen_source_hashes()))}
        return accepted

    def registry_operation(self):
        return {'plan': self.daily.registry_schema_plan(self.selected(), self.original_terms(),
            self.now(), self.request['sourceHashes'])}

    def registry_frozen_source_hashes(self):
        approved = self.daily.REGISTRY_040_CHANGE_HASHES
        if any(self.request['sourceHashes'].get(p) != h for p, h in approved.items()):
            raise ValueError('Exact reviewed040 application exceptions required')
        return {p: h for p, h in self.frozen_source_hashes().items() if p not in approved}

    def registry_probe(self, image):
        value = self.raw_probe(image, {'mode': 'registry-capture', 'expected': None,
            'participants': list(self.original_terms()['participants'])})
        return self.daily.parse_registry_runtime(value)

    def registry_context(self, candidate, *, persist=False):
        # Authenticate a real fresh candidate restore before any new SQL attempt.
        # Retain the measured evidence once; later Daily status refreshes must not
        # silently rebind an already journaled intent to another backup.
        if persist:
            self.backup(candidate)  # freshness applies to preparation, never to read-only recovery
        path = self.root / 'registry-evidence.json'
        if path.exists() or path.is_symlink():
            evidence = json.loads(fence.original(path))
            funded.exact(evidence, {'candidateSha256', 'backupManifest', 'restoreProof'})
            if evidence['candidateSha256'] != canonical_sha(candidate):
                raise ValueError('Original registry backup evidence required')
        else:
            if not persist:
                raise ValueError('Durable registry backup evidence required')
            restore = json.loads(self.daily.regular(self.daily.ROOT / 'status' / 'restore.json'))
            records = self.daily.completed_archives(self.daily.ROOT / 'backups')
            record = next((r['manifest'] for r in records if r['manifest']['runId'] == restore['runId']), None)
            if record is None:
                raise ValueError('Measured candidate backup and restore required')
            evidence = {'candidateSha256': canonical_sha(candidate),
                        'backupManifest': record, 'restoreProof': restore}
            if persist:
                readers.durable_file(path, encoded(evidence))
        return {'sourceCommit': candidate['sourceCommit'],
            'imageId': candidate['release']['target']['imageId'],
            'candidateSha256': canonical_sha(candidate),
            'parentAuthoritySha256': canonical_sha({k: candidate[k] for k in (
                'parentPreparedSha256', 'parentJournalSha256', 'parentReadbackSha256')}),
            'backupManifestSha256': canonical_sha(evidence['backupManifest']),
            'restoreProofSha256': canonical_sha(evidence['restoreProof'])}

    def registry_intent(self, candidate):
        path = self.root / 'registry-intent.json'
        intent = json.loads(fence.original(path))
        if (intent.get('version') != 'alterward-registry-upgrade-intent-1'
                or intent.get('context') != self.registry_context(candidate)):
            raise ValueError('Original candidate-bound registry intent required')
        rows = self.journal(candidate)['states']
        hashes = {row.get('registryIntentSha256') for row in rows if row['state'] == 'database-intent'}
        if hashes != {canonical_sha(intent)}:
            raise ValueError('Registry intent must match its durable journal binding')
        return intent

    def registry_database_request(self, candidate, mode):
        if mode not in {'registry-prepare', 'registry-apply', 'registry-reconcile'}:
            raise ValueError('Explicit registry controller mode required')
        if mode == 'registry-prepare' and ((self.root / 'registry-intent.json').exists()
                or (self.root / 'registry-intent.json').is_symlink()):
            raise ValueError('Existing registry intent requires read-only reconciliation')
        expected = {'context': self.registry_context(candidate, persist=mode == 'registry-prepare')}
        if mode != 'registry-prepare':
            # Never hash a caller-supplied intent as if it proved persistence.
            # The only authority is the original root file plus its journal row.
            intent = self.registry_intent(candidate)
            expected.update(intent=intent, persistedIntentSha256=canonical_sha(intent))
        return self.raw_probe(candidate['release']['target']['imageId'], {
            'mode': mode, 'participants': list(self.original_terms()['participants']), 'expected': expected})

    def schema_frozen_source_hashes(self):
        # The schema upgrade ships billing, so exactly the reviewed allow-list may differ
        # from the serving image. Every other frozen path (above all the narrative engine)
        # must still match it byte for byte inside the SERVING image.
        return {p:h for p,h in self.frozen_source_hashes().items()
                if p not in funded.SCHEMA_039_ALLOWED_CHANGES}

    def billing_frozen_source_hashes(self):
        # A billing-config generation may carry exactly the reviewed pg-pool path; everything
        # else (above all the narrative engine) must still match the SERVING image.
        return {p:h for p,h in self.frozen_source_hashes().items()
                if p not in funded.BILLING_CONFIG_ALLOWED_CHANGES}

    def parent(self):
        _, _, context = self.chain()
        if self.generation > 1:
            return self.parent_generation(context)
        root = DIRECTORY / 'funded-runtime-upgrade'
        value = json.loads(fence.original(root / 'prepared.json'))
        original = funded.System(self.request, self.daily)
        journal = original.journal(value)
        if journal['states'][-1]['state'] not in {'applied', 'recovered'}:
            raise ValueError('Completed original funded parent required')
        role = 'recovery' if journal['states'][-1]['state'] == 'recovered' else 'target'
        proof = json.loads(fence.original(root / 'readback.json'))
        if (proof.get('version') != 'alterward-funded-upgrade-1' or proof.get('schema') not in (38, 39)
                or proof.get('preparedSha256') != sha(encoded(value))
                or proof.get('sourceCommit') != value['sourceCommit']
                or proof.get('imageId') != value['release'][role]['imageId']
                or proof.get('protectedDataUnchanged') is not True
                or proof.get('operationPaidAiCalls') != 0 or proof.get('databaseRestored') is not False
                or self.hashes(root / role) != value['files'][role]):
            raise ValueError('Unchanged original funded proof required')
        for observe in (self.daily.funded_probe_state, self.daily.funded_capability_state):
            pending = observe(root)
            if pending is not None and pending['state'] != 'cleaned':
                raise ValueError('Original pending one-off requires inspection')
        for path, digest in value['baseline']['authority'].items():
            if sha(fence.original(Path(path))) != digest:
                raise ValueError('Original personal/reader authority changed')
        return value, role, {key: sha(fence.original(root / name)) for key, name in (
            ('parentPreparedSha256', 'prepared.json'), ('parentJournalSha256', 'journal.json'),
            ('parentReadbackSha256', 'readback.json'))}

    def parent_generation(self, context):
        """The previous FULLY exposed successor generation, re-proven from its own evidence."""
        root = context['parent_dir']
        value = json.loads(fence.original(root / 'prepared.json'))
        journal = json.loads(fence.original(root / 'journal.json'))
        state = journal['states'][-1]['state']
        if journal.get('version') != VERSION or state not in {'applied', 'recovered'}:
            raise ValueError('Completed previous successor generation required')
        role = 'recovery' if state == 'recovered' else 'target'
        proof = json.loads(fence.original(root / 'readback.json'))
        if (proof.get('version') != VERSION or proof.get('preparedSha256') != sha(encoded(value))
                or proof.get('sourceCommit') != value['sourceCommit']
                or proof.get('imageId') != value['release'][role]['imageId']
                or proof.get('schema') not in (38, 39) or proof.get('protectedDataUnchanged') is not True
                or proof.get('operationPaidAiCalls') != 0 or proof.get('databaseRestored') is not False
                or self.hashes(root / role) != value['files'][role]
                or value['files'][role] != context['files']):
            raise ValueError('Unchanged previous successor proof required')
        for observe in (self.daily.funded_probe_state, self.daily.funded_capability_state):
            pending = observe(root)
            if pending is not None and pending['state'] != 'cleaned':
                raise ValueError('Previous successor pending one-off requires inspection')
        for path, digest in value['baseline']['authority'].items():
            if sha(fence.original(Path(path))) != digest:
                raise ValueError('Earlier authority changed')
        return value, role, {key: sha(fence.original(root / name)) for key, name in (
            ('parentPreparedSha256', 'prepared.json'), ('parentJournalSha256', 'journal.json'),
            ('parentReadbackSha256', 'readback.json'))}

    def access(self, expected=None):
        value = self.request['accessSnapshot']
        funded.exact(value, {'checkedAt', 'teamDomain', 'audience', 'allowedEmails', 'configurationSha256'})
        if not 0 <= (self.now() - funded.stamp(value['checkedAt'])).total_seconds() <= 900:
            raise ValueError('Fresh GET-only external Access observation required')
        if not funded.DIGEST.fullmatch(value['configurationSha256']):
            raise ValueError('Access configuration digest required')
        previous = self.active_access()
        # External Access always leads the origin: for reader admission it already
        # shows the approved list while the origin may still carry the previous one.
        wanted = reader_emails(self.selected()) if self.is_reader() else previous['allowedEmails']
        origin = [sorted(previous['allowedEmails'])] + ([sorted(wanted)] if self.is_reader() else [])
        if (value['teamDomain'] != previous['teamDomain'] or value['audience'] != previous['audience']
                or sorted(value['allowedEmails']) != sorted(wanted)):
            raise ValueError('Access reader identity drift')
        config = self.configuration(DIRECTORY)
        for role in ('web', 'api'):
            env = config['services'][role]['environment']
            if (env.get('CLOUDFLARE_ACCESS_TEAM_DOMAIN') != value['teamDomain']
                    or env.get('CLOUDFLARE_ACCESS_AUD') != value['audience']
                    or sorted(env.get('CLOSED_SITE_ALLOWED_EMAILS', '').split(',')) not in origin):
                raise ValueError('Origin and external Access identities differ')
        if expected is not None and value['configurationSha256'] != expected:
            raise ValueError('External Access configuration changed since preparation')
        return value['configurationSha256']

    def baseline(self, *, require_active=None):
        # The schema upgrade does not depend on a running funded window: an ended
        # window only means nothing can be generating, which the drain proves. Billing
        # configuration does not depend on the window either.
        if require_active is None:
            require_active = not (self.is_schema() or self.is_billing())
        parent, role, _ = self.parent()
        if self.hashes(DIRECTORY) != parent['files'][role]:
            raise ValueError('Active parent runtime files required')
        config = self.configuration(DIRECTORY)
        upgrade.inspect_owner(config, parent['release'][role]['imageId'])
        self.daily.owner_runtime()  # actual env/provider boundary and original CA hash
        policy = self.daily.personal_runtime_policy(
            {k:v['environment'] for k,v in config['services'].items()}, self.now())
        terms = self.original_terms()
        env = config['services']['worker']['environment']
        expected = {'CLOSED_BETA_USER_IDS': ','.join(p['userId'] for p in terms['participants']),
                    'AI_PROJECT_BUDGET_USD': terms['projectUsd'], 'AI_USER_BUDGET_USD': terms['userUsd'],
                    'AI_BUDGET_WINDOW_START': terms['startsAt'], 'AI_BUDGET_WINDOW_END': terms['endsAt']}
        if (policy['mode'] != 'personal-beta' or any(env.get(k) != v for k,v in expected.items())
                or (require_active and not policy['queueAllowed'])):
            raise ValueError('Active parent funded window/configuration required')
        paths = self.daily.successor_authority_paths(self.generation)
        return {'files': self.hashes(DIRECTORY), 'authority': {str(p):sha(fence.original(p)) for p in paths},
                'accessConfigurationSha256': self.access(), 'proxyNetwork': upgrade.proxy_network(),
                'foreign': upgrade.foreign_state()}

    def schema_probe(self, image, mode, expected=None):
        """Capture (038 or 039) or the single reviewed 038 to 039 migration."""
        if mode not in {'capture', 'migrate'} or (mode == 'migrate') != (expected is not None):
            raise ValueError('Fixed schema database mode required')
        value = self.raw_probe(image, {'mode': mode, 'expected': expected,
                                       'participants': list(self.original_terms()['participants'])})
        funded.exact(value, {'version','schema','identityBindingSha256','dataSha256','artifactSha256',
                             'catalogSha256','policiesSha256','drained','providerApiCalls'})
        if (value['version'] != 'alterward-funded-runtime-1' or value['schema'] not in (SCHEMA_FROM, SCHEMA_TO)
                or (mode == 'migrate' and value['schema'] != SCHEMA_TO)
                or value['providerApiCalls'] != 0 or value['drained'] is not True):
            raise ValueError('Exact drained schema038/039 observation required')
        return value

    def probe(self, image, mode, expected=None):
        if self.is_schema():
            return self.schema_probe(image, mode, expected)
        if mode != 'capture' or expected is not None:
            raise ValueError('Successor cannot migrate a database')
        participants = list(self.original_terms()['participants'])
        if self.is_window():
            participants += self.selected()['next']['participants']
        unique = list({p['userId']:p for p in participants}.values())
        value = self.raw_probe(image, {'mode':'capture','participants':unique,'expected':None})
        funded.exact(value, {'version','schema','identityBindingSha256','dataSha256','artifactSha256',
                             'catalogSha256','policiesSha256','drained','providerApiCalls'})
        if (value['version'] != 'alterward-funded-runtime-1' or value['schema'] != 39
                or value['providerApiCalls'] != 0 or value['drained'] is not True):
            raise ValueError('Exact drained schema039 observation required')
        return value

    def accounting(self, image, mode, expected=None):
        if not self.is_window():
            raise ValueError('Only an allowance-changing generation has an accounting operation')
        return self.raw_probe(image, {'mode':'successor','participants':[], 'expected':{
            'mode':mode, 'previous':self.original_terms(), 'selection':self.selected(), 'expected':expected}})

    def reader_operation(self):
        now = self.now()
        stamp = lambda t: t.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        selected = self.selected()
        return {'plan': {'version': PLAN_VERSION, 'purpose': READER_PURPOSE,
                         'observedAt': stamp(now), 'expiresAt': stamp(now + dt.timedelta(seconds=900)),
                         'previousTermsSha256': canonical_sha(self.original_terms()),
                         'selectionSha256': canonical_sha(selected)}}

    def schema_operation(self):
        now = self.now()
        stamp = lambda t: t.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        selected = self.selected()
        return {'plan': {'version': PLAN_VERSION, 'purpose': SCHEMA_PURPOSE,
                         'observedAt': stamp(now), 'expiresAt': stamp(now + dt.timedelta(seconds=900)),
                         'previousTermsSha256': canonical_sha(self.original_terms()),
                         'selectionSha256': canonical_sha(selected),
                         'fromSchema': SCHEMA_FROM, 'toSchema': SCHEMA_TO,
                         # Recorded evidence of the only sources allowed to differ from the serving image.
                         'allowedChanges': list(funded.SCHEMA_039_ALLOWED_CHANGES)}}

    def billing_operation(self):
        now = self.now()
        stamp = lambda t: t.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        selected = self.selected()
        return {'plan': {'version': PLAN_VERSION, 'purpose': BILLING_PURPOSE,
                         'stage': billing_selection(selected)['stage'],
                         'observedAt': stamp(now), 'expiresAt': stamp(now + dt.timedelta(seconds=900)),
                         'previousTermsSha256': canonical_sha(self.original_terms()),
                         'selectionSha256': canonical_sha(selected),
                         # Recorded evidence of the only source allowed to differ from the serving image.
                         'allowedChanges': list(funded.BILLING_CONFIG_ALLOWED_CHANGES),
                         'allowedChangeHashes': self.allowed_change_hashes()}}

    def allowed_change_hashes(self):
        hashes = {p: self.request['sourceHashes'].get(p) for p in funded.BILLING_CONFIG_ALLOWED_CHANGES}
        if any(not isinstance(h, str) or not funded.DIGEST.fullmatch(h) for h in hashes.values()):
            raise ValueError('Exact bundle hash of every allowed change required')
        return hashes

    def reader_receipt(self):
        previous = self.active_access()
        return encoded({'allowedEmails': reader_emails(self.selected()),
                        'audience': previous['audience'], 'teamDomain': previous['teamDomain']})

    def build_files(self, role, build, baseline):
        from alterward_backup import private_directory
        path = self.root / role
        private_directory(path)
        old = self.files(DIRECTORY)
        previous = self.original_terms()
        readers.durable_file(path / 'server.env', candidate_environment(
            old['server.env'].decode(), self.selected(), build['imageTag'], previous, self.billing_secrets()))
        readers.durable_file(path / 'pinned-image.json', encoded({'services':{
            r:{'image':build['imageId'],'pull_policy':'never'} for r in ('web','api','worker')}}))
        source = Path(build['sourceDirectory'])
        rendered = json.loads(upgrade.run(['docker','compose','--project-name',upgrade.PROJECT,
            '--env-file',str(path / 'server.env'),'-f',str(source / 'deploy/compose.contabo.yaml'),
            '-f',str(path / 'pinned-image.json'),'config','--format','json']).stdout)
        if (normalized(rendered, self.selected(), previous)
                != normalized(self.configuration(DIRECTORY), self.selected(), previous)):
            raise ValueError('Runtime delta exceeds selected allowance, readers and v9 configuration')
        self.daily.personal_runtime_policy({k:v['environment'] for k,v in rendered['services'].items()}, self.now())
        if self.is_schema():
            # Billing arrives with this image but stays at its compose default (off).
            # Enabling it, or any Stripe value, is a separate reviewed step.
            for role in ('api', 'worker'):
                env = rendered['services'][role]['environment']
                if any(env.get(k) != v for k, v in funded.BILLING_DEFAULTS.items()):
                    raise ValueError('Billing must stay at its default-off configuration')
            if any(k in rendered['services']['web']['environment'] for k in funded.BILLING_DEFAULTS):
                raise ValueError('Billing configuration must not reach the web service')
        if self.is_billing():
            # Billing reaches api and worker only; the web service carries none of it.
            if any(k in rendered['services']['web']['environment'] for k in BILLING_KEYS):
                raise ValueError('Billing configuration must not reach the web service')
            for role in ('api', 'worker'):
                env = rendered['services'][role]['environment']
                if {k: env.get(k) for k in BILLING_KEYS} != billing_values(
                        self.selected(), upgrade.server_environment(
                            (path / 'server.env').read_text()), self.billing_secrets()):
                    raise ValueError('Rendered billing configuration differs from the selection')
        readers.durable_file(path / 'effective-compose.json', frozen(rendered))
        manifest = json.loads(old['manifest.json'])
        manifest.update(commit=build['commit'],imageId=build['imageId'],
            ownerEnvironmentSha256=sha(fence.original(path / 'server.env')),
            effectiveComposeSha256=sha(frozen(rendered)),sourceComposeSha256=upgrade.source_hash(source))
        if self.is_reader():
            manifest['accessConfigurationSha256'] = sha(self.reader_receipt())
        readers.durable_file(path / 'manifest.json', encoded(manifest))
        return self.hashes(path)

    def require_engine_freeze(self, serving_image):
        """Freeze the motor: compare the NEW reviewed application inputs inside the
        ORIGINAL (serving) image, independently of the source cache's old contents.

        The schema upgrade ships billing, so only the exact reviewed allow-list of
        paths may differ (recorded in the plan and re-checked by Daily); every other
        path, above all the narrative engine, must still be byte-identical to the
        serving image. A removed file cannot be seen from the target hashes: the
        target image is built from the exact committed bundle and the audit records
        the full source diff.
        """
        frozen_hashes = (self.schema_frozen_source_hashes() if self.is_schema()
                         else self.billing_frozen_source_hashes() if self.is_billing()
                         else self.frozen_source_hashes())
        if not frozen_hashes or self.capability(serving_image, frozen_hashes).returncode:
            raise ValueError('Original serving engine sources must remain unchanged')

    def prepare(self):
        selected = self.selected()
        selection_values(selected)
        if 'billingSecrets' in self.request and not self.is_billing():
            raise ValueError('Stripe secrets belong only to a billing-config preparation')
        self.archive_support()
        if self.root.exists() or self.root.is_symlink():
            raise ValueError('Existing successor evidence requires explicit inspection/archive')
        if self.daily.funded_upgrade_healthy('personal-beta') is not True:
            raise ValueError('Healthy original funded runtime required')
        before = self.baseline()
        parent, parent_role, parent_hashes = self.parent()
        previous = self.original_terms()
        access = self.active_access()
        if selected['previousTermsSha256'] != canonical_sha(previous):
            raise ValueError('Original terms required')
        if purpose_of(selected) == 'tester-beta' and is_tester_window(previous):
            raise ValueError('The tester window may be opened at most once')
        if self.is_reader():
            if not set(access['allowedEmails']) < set(reader_emails(selected)):
                raise ValueError('Reader admission may only add readers')
        elif self.is_schema():
            if SCHEMA_PURPOSE in self.chain()[2].get('purposes', ()):
                raise ValueError('The schema upgrade may be applied at most once')
        elif self.is_billing():
            pass  # the ordered once-only stage rules are checked below, against the candidate environment
        elif any(p['email'] not in access['allowedEmails'] for p in selected['next']['participants']):
            raise ValueError('Every participant must already be a readable, signed-in account')
        release = copy.deepcopy(self.request['release'])
        funded.exact(release, {'target','recovery','runtime','auditSha256','fixtureSha256','privacyFixtureSha256','ciSha256','successorFixtureSha256'})
        if release['runtime'] != runtime_selection(selected, previous) or any(
                not isinstance(release[k], str) or not funded.DIGEST.fullmatch(release[k])
                for k in ('auditSha256','fixtureSha256','privacyFixtureSha256','ciSha256','successorFixtureSha256')):
            raise ValueError('Exact interpreted source/fixture/CI and v9 runtime required')
        if self.is_billing():
            # Dry run before anything is written: stage order, expected starting state, the
            # digest-bound secrets and the exact environment delta (nothing else may move).
            old_text = self.files(DIRECTORY)['server.env'].decode()
            require_billing_stage(selected, upgrade.server_environment(old_text),
                                  self.chain()[2].get('purposes', ()))
            candidate_environment(old_text, selected, release['target']['imageTag'], previous, self.billing_secrets())
        from alterward_backup import private_directory
        private_directory(self.root)
        readers.durable_file(self.root / 'selection.json', encoded(selected))
        readers.durable_file(self.root / 'terms.json', encoded(previous if keeps_window(selected) else selected['next']))
        if self.is_reader():
            readers.durable_file(self.root / 'access.json', self.reader_receipt())
        for role in ('target','recovery'):
            release[role + 'CapabilitySha256'] = self.image(release[role])
        self.require_engine_freeze(parent['release'][parent_role]['imageId'])
        operation = (self.reader_operation() if self.is_reader() else self.schema_operation() if self.is_schema()
                     else self.billing_operation() if self.is_billing()
                     else self.accounting(release['target']['imageId'], 'capture'))
        database = self.probe(release['target']['imageId'], 'capture')
        if self.is_schema() and database['schema'] != SCHEMA_FROM:
            raise ValueError('Live schema 038 database required before the upgrade')
        plan = operation['plan']
        value = {'version':VERSION,'sourceCommit':self.request['sourceCommit'],
            'bundleSha256':self.request['bundleSha256'],'preparedAt':plan['observedAt'],
            'expiresAt':plan['expiresAt'],'baseline':before,'release':release,'files':{},
            'operation':operation,'database':database, **parent_hashes,
            'termsSha256':sha(encoded(previous if keeps_window(selected) else selected['next'])),
            'selectionSha256':sha(encoded(selected))}
        private_directory(self.root / 'previous')
        for name, data in self.files(DIRECTORY).items():
            readers.durable_file(self.root / 'previous' / name, data)
        value['files']['previous'] = self.hashes(self.root / 'previous')
        for role in ('target','recovery'):
            value['files'][role] = self.build_files(role, release[role], before)
        if self.baseline() != before:
            raise ValueError('Original runtime drift during successor preparation')
        readers.durable_file(self.root / 'prepared.json', encoded(value))
        self.validate_candidate()
        return {'version':VERSION,'preparedSha256':sha(encoded(value)),'expiresAt':value['expiresAt'],
                'preparedOnly':True,'databaseWrites':0,'paidAiCalls':0,'browserJourneyPassed':False}

    def archive_expired(self):
        self.archive_support()
        digest = self.request['preparedSha256']
        if not isinstance(digest,str) or not funded.DIGEST.fullmatch(digest):
            raise ValueError('Exact expired successor preparation required')
        archive = DIRECTORY / self.daily.SUCCESSOR_ARCHIVE_NAME
        destination = archive / digest
        self.daily.successor_archived_paths()
        if destination.exists() or destination.is_symlink():
            if self.root.exists() or self.root.is_symlink():
                raise ValueError('Conflicting active and archived successor')
            candidate, receipt = self.daily.validate_successor_archive(destination)
            if self.baseline(require_active=False) != candidate['baseline']:
                raise ValueError('Original serving baseline changed')
            readers.sync_directory(archive)
            readers.sync_directory(DIRECTORY)
            return {'archived':True,'alreadyArchived':True,'preparedSha256':digest,
                    'databaseWrites':0,'paidAiCalls':0,'authorityChanged':False}
        files = self.daily.successor_unapplied_files(self.root)
        candidate = json.loads(fence.original(self.root / 'prepared.json'))
        if (sha(encoded(candidate)) != digest or self.now() < funded.stamp(candidate['expiresAt'])
                or self.baseline(require_active=False) != candidate['baseline']):
            raise ValueError('Exact expired never-attempted successor on original runtime required')
        path = self.root / 'archive.json'
        if not path.exists() and not path.is_symlink():
            receipt = {'version':self.daily.SUCCESSOR_ARCHIVE_VERSION,'preparedSha256':digest,
                'preparedSourceCommit':candidate['sourceCommit'],'archiverSourceCommit':self.request['sourceCommit'],
                'archivedAt':self.now().isoformat(),'files':files}
            readers.durable_file(path, encoded(receipt))
        self.daily.validate_successor_archive(self.root)
        from alterward_backup import private_directory
        if not archive.exists() and not archive.is_symlink():
            private_directory(archive)
        self.daily.private_archive_directory(archive)
        if len(list(archive.iterdir())) >= 8:
            raise ValueError('Successor archive limit reached; preserve all evidence')
        if self.baseline(require_active=False) != candidate['baseline']:
            raise ValueError('Original serving baseline drift before archive move')
        os.rename(self.root, destination)
        readers.sync_directory(archive)
        readers.sync_directory(DIRECTORY)
        self.daily.validate_successor_archive(destination)
        return {'archived':True,'alreadyArchived':False,'preparedSha256':digest,
                'databaseWrites':0,'paidAiCalls':0,'authorityChanged':False}

    def candidate(self):
        value = super().candidate()
        # Authenticate immutable authority before stop-first recovery. Pending
        # probes must not block STOP; their strict validation/cleanup follows
        # under both locks before any preflight, DB operation or serving.
        if self.validate_candidate(check_oneoffs=False) != value:
            raise ValueError('Exact original-parent-bound successor required')
        if self.request.get('selection') != json.loads(fence.original(self.root / 'selection.json')):
            raise ValueError('Reviewed owner selection changed')
        return value

    def journal(self, candidate=None):
        value = json.loads(fence.original(self.root / 'journal.json'))
        funded.exact(value, {'version','preparedSha256','states'})
        if (value['version'] != VERSION or not isinstance(value['states'],list)
                or not 1 <= len(value['states']) <= 32
                or (candidate is not None and value['preparedSha256'] != sha(encoded(candidate)))):
            raise ValueError('Bounded successor journal bound to original preparation required')
        previous = None
        for row in value['states']:
            funded.exact(row, {'state','changedAt','previousSha256','sha256'})
            if row['previousSha256'] != previous or row['sha256'] != sha(encoded({k:v for k,v in row.items() if k != 'sha256'})):
                raise ValueError('Successor journal chain changed')
            funded.stamp(row['changedAt'])
            previous = row['sha256']
        return value

    def record(self, state, candidate):
        path = self.root / 'journal.json'
        value = self.journal(candidate) if path.exists() else {'version':VERSION,'preparedSha256':sha(encoded(candidate)),'states':[]}
        if len(value['states']) >= 32:
            raise ValueError('Journal requires scoped inspection')
        row = {'state':state,'changedAt':self.now().isoformat(),
               'previousSha256':value['states'][-1]['sha256'] if value['states'] else None}
        row['sha256'] = sha(encoded(row))
        value['states'].append(row)
        readers.update_durable(path, encoded(value))

    def preflight(self, candidate, *, recovery=False):
        self.archive_support()
        if recovery:
            if self.journal(candidate)['states'][-1]['state'] in {'applied','recovered'}:
                raise ValueError('Completed owner trial cannot be replayed')
            for name in FILES:
                if fence.original(DIRECTORY / name) not in [fence.original(self.root / r / name) for r in ('previous','target','recovery')]:
                    raise ValueError('Unrelated runtime drift; keep held')
        else:
            if (self.root / 'journal.json').exists() or not funded.stamp(candidate['preparedAt']) <= self.now() < funded.stamp(candidate['expiresAt']):
                raise ValueError('Fresh never-attempted successor required')
            if self.baseline() != candidate['baseline']:
                raise ValueError('Original active funded baseline drift')
            if self.is_window() and not funded.stamp(self.selected()['closePreviousAt']) <= self.now() < funded.stamp(self.selected()['next']['startsAt']):
                raise ValueError('Selected closure time must have arrived before writer hold')
        self.parent()
        self.access(candidate['baseline']['accessConfigurationSha256'])
        if (upgrade.proxy_network() != candidate['baseline']['proxyNetwork']
                or upgrade.foreign_state() != candidate['baseline']['foreign']):
            raise ValueError('Foreign/proxy drift')
        self.capabilities(candidate)
        result = self.reconcile_accounts(candidate)
        if result['state'] not in self.expected_states(recovery):
            raise ValueError('Exact unused accounting state required')
        self.backup(candidate)

    def stop_and_hold(self, candidate):
        for number in upgrade.INTERRUPTION_SIGNALS:
            signal.signal(number, signal.SIG_IGN)
        self.stop()
        if any(v['State']['Running'] for v in self.roles().values()):
            raise ValueError('Three held owner services required')
        if upgrade.foreign_state() != candidate['baseline']['foreign']:
            raise ValueError('Foreign workload changed under hold')

    def expected_states(self, recovery=None):
        """Database states this attempt may start from.

        A first attempt starts uncommitted. Recovery starts committed, except for the
        schema migration, whose single serializable transaction either committed or
        did not: recovery finishes an uncommitted one (see database_pending).
        """
        if not (self.recovery if recovery is None else recovery):
            return {'uncommitted'}
        return {'committed', 'uncommitted'} if self.is_schema() else {'committed'}

    def database_pending(self, candidate):
        return self.is_schema() and self.reconcile_accounts(candidate)['state'] == 'uncommitted'

    def verify_drained(self, candidate):
        result = self.reconcile_accounts(candidate)
        if result['state'] not in self.expected_states():
            raise ValueError('Exact drained accounting state required')

    def require_candidate_restore(self, candidate):
        self.backup(candidate)

    def apply_accounts(self, candidate):
        # No polling/retry around the financial write. A lost output is reconciled
        # only by a separately invoked --recover, never by running apply again.
        if self.no_database_write():
            return {'accountsChanged': False}  # reader admission and billing never write the database
        if self.is_schema():
            return self.migrate_schema(candidate)
        return self.accounting(candidate['release']['target']['imageId'], 'apply', candidate['operation'])

    def migrate_schema(self, candidate):
        """The one database write of the schema generation, never polled or retried.

        Exact image capability, drain and protected-data identity were proven before
        the hold. The image migrates inside one serializable transaction that re-checks
        the exact expected state, applies only the missing checksummed step(s), proves
        the 96 pre-039 tables, artifacts, policies and identities byte-identical, and
        that the four billing tables are empty. A lost output is reconciled by an
        explicit --recover, which observes the database first.
        """
        image = candidate['release']['target']['imageId']
        current = self.probe(image, 'capture')
        funded.same_funded(candidate['database'], current)
        if current['schema'] != SCHEMA_FROM:
            raise ValueError('Live schema 038 database required for the migration')
        result = self.probe(image, 'migrate', current)
        funded.same_funded(candidate['database'], result)
        return {'migrated': True, 'schema': result['schema']}

    def reconcile_accounts(self, candidate):
        if self.is_schema():
            current = self.probe(candidate['release']['target']['imageId'], 'capture')
            funded.same_funded(candidate['database'], current)
            return {'state': 'committed' if current['schema'] == SCHEMA_TO else 'uncommitted',
                    'operationSha256': canonical_sha(candidate['operation']),
                    'protectedDataUnchanged': True, 'paidAiCalls': 0}
        if self.no_database_write():
            # No account may change. "Committed" only means the durable database
            # intent was reached, so recovery and replay follow the same order.
            current = self.probe(candidate['release']['target']['imageId'], 'capture')
            funded.same_funded(candidate['database'], current)
            journal = self.root / 'journal.json'
            intended = journal.exists() and any(
                row['state'] == 'database-intent' for row in self.journal(candidate)['states'])
            return {'state': 'committed' if intended else 'uncommitted',
                    'operationSha256': canonical_sha(candidate['operation']),
                    'protectedDataUnchanged': True, 'paidAiCalls': 0}
        result = self.accounting(candidate['release']['target']['imageId'], 'reconcile', candidate['operation'])
        if (result.get('operationSha256') != canonical_sha(candidate['operation'])
                or result.get('protectedDataUnchanged') is not True or result.get('paidAiCalls') != 0):
            raise ValueError('Independent protected accounting observation required')
        return result

    def stage_authority(self, candidate):
        # Capture after closure: base postcheck must compare the CURRENT data,
        # never the intentionally different old budget-account snapshot.
        if self.reconcile_accounts(candidate)['state'] != 'committed':
            raise ValueError('Committed unused owner allowance required')
        self.after = self.probe(candidate['release']['target']['imageId'], 'capture')
        readers.update_durable(self.root / 'database-after.json', encoded(self.after))
        self.stage(candidate, recovery=self.recovery)

    def verify_staged(self, candidate):
        after = {**candidate,'database':self.after}
        self.postcheck(after, recovery=self.recovery)
        if self.reconcile_accounts(candidate)['state'] != 'committed':
            raise ValueError('Accounting drift while staged')
        self.promote(candidate, recovery=self.recovery)

    def require_future_start(self, candidate):
        # A narrow recovery cannot extend/retime/reset a used or expired trial.
        if not self.is_window():
            return  # the window is unchanged; nothing can be extended or retimed
        if not self.now() < funded.stamp(self.selected()['next']['startsAt']):
            raise ValueError('Owner trial start already reached; keep held for explicit inspection')

    def expose(self, candidate, *, recovery=None):
        super().expose(candidate, recovery=self.recovery)

    def verify_serving(self, candidate):
        role = 'recovery' if self.recovery else 'target'
        result = upgrade.verify_release(DIRECTORY, self.configuration(DIRECTORY),
            candidate['release'][role]['imageId'], {'proxyNetwork':candidate['baseline']['proxyNetwork'],
                                                  'foreignContainers':candidate['baseline']['foreign']})
        if result.get('existingForeignContainersUnchanged') is not True:
            raise ValueError('Foreign workload changed')
        funded.same_funded(self.after, self.probe(candidate['release'][role]['imageId'], 'capture'))
        if self.reconcile_accounts(candidate)['state'] != 'committed':
            raise ValueError('Owner allowance used before host post-check completed')
        self.require_future_start(candidate)
        self.proof = {'version':VERSION,'preparedSha256':sha(encoded(candidate)),
            'sourceCommit':candidate['sourceCommit'],'imageId':candidate['release'][role]['imageId'],
            'schema':39,'protectedDataUnchanged':True,'previousSpendPreserved':True,
            **({'fromSchema':SCHEMA_FROM} if self.is_schema() else {}),
            'previousAllowanceClosed':self.is_window(),'operationSha256':canonical_sha(candidate['operation']),
            'fundedStateSha256':sha(encoded(self.after)), 'browserJourneyPassed':False,
            'paidAiCalls':0,'operationPaidAiCalls':0,'databaseRestored':False}
        readers.update_durable(self.root / 'readback.json', encoded(self.proof))


def main(request):
    base = {'mode','sourceCommit','bundleSha256','sourceHashes'}
    modes = {'inspect':set(), 'cleanup-probe':set(),
             'archive-expired':{'preparedSha256','accessSnapshot'},
             # Only a billing-config preparation may carry the two Stripe secrets (checked there).
             'prepare':{'selection','release','accessSnapshot'} | ({'billingSecrets'} if 'billingSecrets' in request else set()),
             'apply':{'selection','release','accessSnapshot','preparedSha256','restoreProof'},
             'recover':{'selection','release','accessSnapshot','preparedSha256','restoreProof'}}
    mode = request.get('mode')
    if mode not in modes:
        raise ValueError('Explicit successor mode required')
    funded.exact(request, base | modes[mode])
    if os.geteuid() != 0 or not funded.COMMIT.fullmatch(request['sourceCommit']) or not funded.DIGEST.fullmatch(request['bundleSha256']):
        raise ValueError('Root and exact committed source required')
    for lock in (fence.DAILY / 'job.lock', DIRECTORY / 'activation.lock'):
        fence.original(lock)
    with (fence.DAILY / 'job.lock').open('rb') as job, (DIRECTORY / 'activation.lock').open('rb') as activation:
        readers.exclusive_lock(job,0)
        readers.exclusive_lock(activation,0)
        system = System(request, fence.installed_daily())
        if mode == 'inspect':
            return {'version':VERSION,'successorPresent':system.root.exists(),
                    'generation':system.generation,
                    'generations':sum(1 for n in ROOT_NAMES if (DIRECTORY / n).exists()),
                    'journalState':system.journal()['states'][-1]['state'] if (system.root/'journal.json').exists() else None,
                    'databaseWrites':0,'paidAiCalls':0,'browserJourneyPassed':False}
        if mode == 'cleanup-probe':
            return system.cleanup_probe()
        if mode == 'archive-expired':
            return system.archive_expired()
        if mode == 'prepare':
            return system.prepare()
        candidate = system.candidate()
        if mode == 'recover':
            if system.journal(candidate)['states'][-1]['state'] in {'applied','recovered'}:
                raise ValueError('Completed successor cannot be recovered again')
            # Stop only captured regular-service IDs before pending one-off
            # cleanup. The strict three-member hold follows cleanup inside the
            # transition; pending probes cannot prevent this initial STOP.
            for number in upgrade.INTERRUPTION_SIGNALS:
                signal.signal(number, signal.SIG_IGN)
            system.stop()
        system.cleanup_probe()
        result = transition(system, candidate, recovery=mode=='recover')
        return {**result, **system.proof}
