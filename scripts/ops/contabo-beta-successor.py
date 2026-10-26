"""Root adapter for one explicit owner trial, retaining the original authority.

No migration, provider request, account creation or database restore. The new
image contains the reviewed accounting transport; application sources must also
match the ORIGINAL serving image. Only the selected owner's future allowance,
admission and v9 runtime configuration may change.
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
STATE_NAME = 'beta-successor'
ALLOWANCE_KEYS = {'CLOSED_BETA_USER_IDS', 'AI_PROJECT_BUDGET_USD', 'AI_USER_BUDGET_USD',
                  'AI_BUDGET_WINDOW_START', 'AI_BUDGET_WINDOW_END'}


def canonical_sha(value):
    # Matches core.hash(stableStringify(value)), without encoded()'s newline.
    return sha(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode())


def selection_values(selection):
    funded.exact(selection, {'purpose', 'previousTermsSha256', 'closePreviousAt', 'next'})
    terms = selection['next']
    funded.exact(terms, {'participants', 'projectUsd', 'userUsd', 'startsAt', 'endsAt'})
    if (selection['purpose'] != 'owner-e2e' or terms['projectUsd'] != '3' or terms['userUsd'] != '3'
            or not isinstance(terms['participants'], list) or len(terms['participants']) != 1):
        raise ValueError('Explicit single-owner 3 USD trial required')
    owner = funded.exact(terms['participants'][0], {'email', 'userId'})
    if (not isinstance(owner['userId'], str) or not re.fullmatch(
            r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', owner['userId'])
            or not isinstance(owner['email'], str) or not re.fullmatch(r'[a-z0-9._+\-]+@[a-z0-9.\-]+', owner['email'])
            or not isinstance(selection['previousTermsSha256'], str)
            or not funded.DIGEST.fullmatch(selection['previousTermsSha256'])):
        raise ValueError('Exact private owner mapping required')
    start, end = (funded.stamp(terms[k]) for k in ('startsAt', 'endsAt'))
    if end - start != dt.timedelta(days=30) or funded.stamp(selection['closePreviousAt']) >= start:
        raise ValueError('Ordered thirty-day trial required')
    return {'CLOSED_BETA_USER_IDS': owner['userId'], 'AI_PROJECT_BUDGET_USD': '3',
            'AI_USER_BUDGET_USD': '3', 'AI_BUDGET_WINDOW_START': terms['startsAt'],
            'AI_BUDGET_WINDOW_END': terms['endsAt']}


def runtime_selection(selection):
    return {'mode': 'narrative-fiction-v2', 'generation': 'v9',
            'cohortUserIds': [selection['next']['participants'][0]['userId']],
            'timeoutMs': 300000, 'maxRequestBytes': 196608}


def candidate_environment(text, selection, image_tag):
    values = selection_values(selection)
    before = upgrade.server_environment(text)
    text = upgrade.image_only_environment(text, image_tag)
    for key, value in values.items():
        if not isinstance(value, str) or not re.fullmatch(r'[a-zA-Z0-9_.,:\-]+', value):
            raise ValueError('Bounded literal trial value required')
        text, count = re.subn(r"^" + key + r"='[^'\r\n]*'$", key + "='" + value + "'", text, flags=re.MULTILINE)
        if count != 1:
            raise ValueError('One original allowance line required')
    text = funded.narrative_environment(text, runtime_selection(selection))
    changed = set(values) | set(funded.narrative_runtime_values(runtime_selection(selection))) | {'ALTERWARD_TAG'}
    after = upgrade.server_environment(text)
    if {k:v for k,v in before.items() if k not in changed} != {k:v for k,v in after.items() if k not in changed}:
        raise ValueError('Unrelated authority or credential changed')
    return text.encode()


def normalized(config, selection):
    result = funded.normalized_configuration(config, runtime_selection(selection))
    values = selection_values(selection)
    for role in ('api', 'worker'):
        env = result['services'][role]['environment']
        for key, value in values.items():
            if role == 'worker' or key in {'CLOSED_BETA_USER_IDS', 'AI_PROJECT_BUDGET_USD', 'AI_USER_BUDGET_USD'}:
                env[key] = value
    return result


class System(funded.System):
    def __init__(self, request, daily):
        super().__init__(request, daily)
        self.root = DIRECTORY / STATE_NAME
        self.recovery = request['mode'] == 'recover'

    def selected(self):
        if 'selection' in self.request:
            return self.request['selection']
        return json.loads(fence.original(self.root / 'selection.json'))

    def original_terms(self):
        return json.loads(fence.original(DIRECTORY / 'personal-beta' / 'terms.json'))

    def frozen_source_hashes(self):
        return {p:h for p,h in self.request['sourceHashes'].items()
                if p.startswith(('apps/','packages/','database/','deploy/'))
                or p in {'Dockerfile','package.json','pnpm-lock.yaml','pnpm-workspace.yaml'}}

    def capability_input_hashes(self):
        # A second fixed scope compares the NEW application inputs inside the
        # ORIGINAL image. No request-supplied alternate scope is accepted.
        return super().capability_input_hashes() | {sha(encoded(self.frozen_source_hashes()))}

    def parent(self):
        root = DIRECTORY / 'funded-runtime-upgrade'
        value = json.loads(fence.original(root / 'prepared.json'))
        original = funded.System(self.request, self.daily)
        journal = original.journal(value)
        if journal['states'][-1]['state'] not in {'applied', 'recovered'}:
            raise ValueError('Completed original funded parent required')
        role = 'recovery' if journal['states'][-1]['state'] == 'recovered' else 'target'
        proof = json.loads(fence.original(root / 'readback.json'))
        if (proof.get('version') != 'alterward-funded-upgrade-1' or proof.get('schema') != 38
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

    def baseline(self, *, require_active=True):
        parent, role, _ = self.parent()
        if self.hashes(DIRECTORY) != parent['files'][role]:
            raise ValueError('Original active funded files required')
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
            raise ValueError('Original funded window/configuration required')
        paths = (self.daily.reader_config_paths() + self.daily.personal_config_paths()
                 + self.daily.funded_tree_paths(DIRECTORY / 'funded-runtime-upgrade')
                 + self.daily.funded_archived_paths())
        return {'files': self.hashes(DIRECTORY), 'authority': {str(p):sha(fence.original(p)) for p in paths},
                'accessConfigurationSha256': self.access(), 'proxyNetwork': upgrade.proxy_network(),
                'foreign': upgrade.foreign_state()}

    def probe(self, image, mode, expected=None):
        if mode != 'capture' or expected is not None:
            raise ValueError('Successor cannot migrate a database')
        participants = self.original_terms()['participants'] + self.selected()['next']['participants']
        unique = list({p['userId']:p for p in participants}.values())
        value = self.raw_probe(image, {'mode':'capture','participants':unique,'expected':None})
        funded.exact(value, {'version','schema','identityBindingSha256','dataSha256','artifactSha256',
                             'catalogSha256','policiesSha256','drained','providerApiCalls'})
        if (value['version'] != 'alterward-funded-runtime-1' or value['schema'] != 38
                or value['providerApiCalls'] != 0 or value['drained'] is not True):
            raise ValueError('Exact drained schema038 observation required')
        return value

    def accounting(self, image, mode, expected=None):
        return self.raw_probe(image, {'mode':'successor','participants':[], 'expected':{
            'mode':mode, 'previous':self.original_terms(), 'selection':self.selected(), 'expected':expected}})

    def build_files(self, role, build, baseline):
        from alterward_backup import private_directory
        path = self.root / role
        private_directory(path)
        old = self.files(DIRECTORY)
        readers.durable_file(path / 'server.env', candidate_environment(old['server.env'].decode(), self.selected(), build['imageTag']))
        readers.durable_file(path / 'pinned-image.json', encoded({'services':{
            r:{'image':build['imageId'],'pull_policy':'never'} for r in ('web','api','worker')}}))
        source = Path(build['sourceDirectory'])
        rendered = json.loads(upgrade.run(['docker','compose','--project-name',upgrade.PROJECT,
            '--env-file',str(path / 'server.env'),'-f',str(source / 'deploy/compose.contabo.yaml'),
            '-f',str(path / 'pinned-image.json'),'config','--format','json']).stdout)
        if normalized(rendered, self.selected()) != normalized(self.configuration(DIRECTORY), self.selected()):
            raise ValueError('Runtime delta exceeds selected owner allowance and v9 configuration')
        self.daily.personal_runtime_policy({k:v['environment'] for k,v in rendered['services'].items()}, self.now())
        readers.durable_file(path / 'effective-compose.json', frozen(rendered))
        manifest = json.loads(old['manifest.json'])
        manifest.update(commit=build['commit'],imageId=build['imageId'],
            ownerEnvironmentSha256=sha(fence.original(path / 'server.env')),
            effectiveComposeSha256=sha(frozen(rendered)),sourceComposeSha256=upgrade.source_hash(source))
        readers.durable_file(path / 'manifest.json', encoded(manifest))
        return self.hashes(path)

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
        access = json.loads(fence.original(DIRECTORY / 'personal-beta-readers/access.json'))
        if (selected['previousTermsSha256'] != canonical_sha(previous)
                or selected['next']['participants'][0]['email'] not in access['allowedEmails']):
            raise ValueError('Original terms and already-readable owner required')
        release = copy.deepcopy(self.request['release'])
        funded.exact(release, {'target','recovery','runtime','auditSha256','fixtureSha256','privacyFixtureSha256','ciSha256','successorFixtureSha256'})
        if release['runtime'] != runtime_selection(selected) or any(
                not isinstance(release[k], str) or not funded.DIGEST.fullmatch(release[k])
                for k in ('auditSha256','fixtureSha256','privacyFixtureSha256','ciSha256','successorFixtureSha256')):
            raise ValueError('Exact interpreted source/fixture/CI and owner v9 runtime required')
        from alterward_backup import private_directory
        private_directory(self.root)
        readers.durable_file(self.root / 'selection.json', encoded(selected))
        readers.durable_file(self.root / 'terms.json', encoded(selected['next']))
        for role in ('target','recovery'):
            release[role + 'CapabilitySha256'] = self.image(release[role])
        # Freeze the motor: compare the NEW reviewed application inputs inside
        # the ORIGINAL image, independently of the source cache's old contents.
        frozen_hashes = self.frozen_source_hashes()
        if not frozen_hashes or self.capability(parent['release'][parent_role]['imageId'], frozen_hashes).returncode:
            raise ValueError('Original serving engine sources must remain unchanged')
        operation = self.accounting(release['target']['imageId'], 'capture')
        database = self.probe(release['target']['imageId'], 'capture')
        plan = operation['plan']
        value = {'version':VERSION,'sourceCommit':self.request['sourceCommit'],
            'bundleSha256':self.request['bundleSha256'],'preparedAt':plan['observedAt'],
            'expiresAt':plan['expiresAt'],'baseline':before,'release':release,'files':{},
            'operation':operation,'database':database, **parent_hashes,
            'termsSha256':sha(encoded(selected['next'])),'selectionSha256':sha(encoded(selected))}
        private_directory(self.root / 'previous')
        for name, data in self.files(DIRECTORY).items():
            readers.durable_file(self.root / 'previous' / name, data)
        value['files']['previous'] = self.hashes(self.root / 'previous')
        for role in ('target','recovery'):
            value['files'][role] = self.build_files(role, release[role], before)
        if self.baseline() != before:
            raise ValueError('Original runtime drift during successor preparation')
        readers.durable_file(self.root / 'prepared.json', encoded(value))
        self.daily.successor_candidate(parent, parent_role)
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
        parent, role, _ = self.parent()
        # Authenticate immutable authority before stop-first recovery. Pending
        # probes must not block STOP; their strict validation/cleanup follows
        # under both locks before any preflight, DB operation or serving.
        if self.daily.successor_candidate(parent, role, check_oneoffs=False) != value:
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
            if not funded.stamp(self.selected()['closePreviousAt']) <= self.now() < funded.stamp(self.selected()['next']['startsAt']):
                raise ValueError('Selected closure time must have arrived before writer hold')
        self.parent()
        self.access(candidate['baseline']['accessConfigurationSha256'])
        if (upgrade.proxy_network() != candidate['baseline']['proxyNetwork']
                or upgrade.foreign_state() != candidate['baseline']['foreign']):
            raise ValueError('Foreign/proxy drift')
        self.capabilities(candidate)
        result = self.reconcile_accounts(candidate)
        if result['state'] != ('committed' if recovery else 'uncommitted'):
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

    def verify_drained(self, candidate):
        result = self.reconcile_accounts(candidate)
        if result['state'] != ('committed' if self.recovery else 'uncommitted'):
            raise ValueError('Exact drained accounting state required')

    def require_candidate_restore(self, candidate):
        self.backup(candidate)

    def apply_accounts(self, candidate):
        # No polling/retry around the financial write. A lost output is reconciled
        # only by a separately invoked --recover, never by running apply again.
        return self.accounting(candidate['release']['target']['imageId'], 'apply', candidate['operation'])

    def reconcile_accounts(self, candidate):
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
            'schema':38,'protectedDataUnchanged':True,'previousSpendPreserved':True,
            'previousAllowanceClosed':True,'operationSha256':canonical_sha(candidate['operation']),
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
