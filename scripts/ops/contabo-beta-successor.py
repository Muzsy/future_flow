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
ROOT_NAMES = ('beta-successor', 'beta-successor-2', 'beta-successor-3', 'beta-successor-4')
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
            else {READER_PURPOSE, 'tester-beta', SCHEMA_PURPOSE})


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


def keeps_window(selection):
    """Reader admission and the schema upgrade never change the funded window."""
    return purpose_of(selection) in {READER_PURPOSE, SCHEMA_PURPOSE}


def selection_values(selection):
    """The allowance environment a selection may set; empty without a window change."""
    purpose = purpose_of(selection)
    if purpose == READER_PURPOSE:
        reader_emails(selection)
        return {}
    if purpose == SCHEMA_PURPOSE:
        schema_selection(selection)
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


def candidate_environment(text, selection, image_tag, previous=None):
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

    def is_window(self):
        """An allowance-changing generation: owner-e2e or tester-beta."""
        return not keeps_window(self.selected())

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
        return accepted

    def schema_frozen_source_hashes(self):
        # The schema upgrade ships billing, so exactly the reviewed allow-list may differ
        # from the serving image. Every other frozen path (above all the narrative engine)
        # must still match it byte for byte inside the SERVING image.
        return {p:h for p,h in self.frozen_source_hashes().items()
                if p not in funded.SCHEMA_039_ALLOWED_CHANGES}

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
        # window only means nothing can be generating, which the drain proves.
        if require_active is None:
            require_active = not self.is_schema()
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
        if not self.is_reader():
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
            old['server.env'].decode(), self.selected(), build['imageTag'], previous))
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
        frozen_hashes = self.schema_frozen_source_hashes() if self.is_schema() else self.frozen_source_hashes()
        if not frozen_hashes or self.capability(serving_image, frozen_hashes).returncode:
            raise ValueError('Original serving engine sources must remain unchanged')

    def prepare(self):
        self.archive_support()
        selected = self.selected()
        selection_values(selected)
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
        elif any(p['email'] not in access['allowedEmails'] for p in selected['next']['participants']):
            raise ValueError('Every participant must already be a readable, signed-in account')
        release = copy.deepcopy(self.request['release'])
        funded.exact(release, {'target','recovery','runtime','auditSha256','fixtureSha256','privacyFixtureSha256','ciSha256','successorFixtureSha256'})
        if release['runtime'] != runtime_selection(selected, previous) or any(
                not isinstance(release[k], str) or not funded.DIGEST.fullmatch(release[k])
                for k in ('auditSha256','fixtureSha256','privacyFixtureSha256','ciSha256','successorFixtureSha256')):
            raise ValueError('Exact interpreted source/fixture/CI and v9 runtime required')
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
        if self.is_reader():
            return {'accountsChanged': False}  # reader admission never writes the database
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
        if self.is_reader():
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
             'prepare':{'selection','release','accessSnapshot'},
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
