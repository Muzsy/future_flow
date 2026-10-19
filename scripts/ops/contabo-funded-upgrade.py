"""Linux funded-runtime upgrade of an ALREADY ACTIVE personal beta (N09, #34).

Root executor only; the git-bound workstation loader owns source, CI, audit,
fixture and private-report checks (scripts/contabo-funded-upgrade.mjs).

Unlike the owner image-only upgrade (original zero) and the personal-beta
activation (reader baseline), this path starts from the applied, exposure-
committed funded runtime and keeps every funded byte: window, allowances,
participants, Access emails, limits, provider and the database ledger. It
changes only the image, the four default-off narrative keys and the schema
(migration 038), in the order of alterward_funded_policy.transition.

No provider HTTP call, Access/DNS/proxy edit, window start/extension, budget
reset, ledger write or credential rotation happens here. Paid processing can
resume only through the already funded worker after the full post-check.
"""
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys

from alterward_backup import private_directory, confined
from alterward_target import ROOT as TARGET_ROOT, docker, run
from alterward_activation import DIRECTORY, CA, FILES, encoded, frozen, sha
import alterward_upgrade as upgrade
import alterward_fence as fence
import alterward_readers as readers
import alterward_funded_policy as policy

STATE = DIRECTORY / 'funded-upgrade'
PERSONAL = DIRECTORY / 'personal-beta'
ATTEMPT = re.compile(r'[a-f0-9]{12}-[0-9]{8}T[0-9]{6}Z')
ATTEMPT_NAMES = {'server.env', 'pinned-image.json', 'effective-compose.json', 'manifest.json',
                 'prepared.json', 'journal.json', 'baseline-observation.json',
                 'target-capability.json', 'recovery-capability.json', 'held-observation.json',
                 'schema-observation.json', 'applied.json', 'failure.json'}
OBSERVATION_LIMIT = 256 * 1024

OBSERVE_ADAPTER = r"""
import {createRequire as upRequire} from 'node:module';
import {readFileSync as upRead} from 'node:fs';
import {TLSSocket as UpTls} from 'node:tls';
import {X509Certificate as UpCertificate} from 'node:crypto';
const upHost=new URL(process.env.DATABASE_URL).hostname;
const {Client:UpClient}=upRequire('/app/packages/database/package.json')('pg');
const upClient=new UpClient({connectionString:process.env.DATABASE_URL,
  ssl:{rejectUnauthorized:true,ca:upRead(process.env.DATABASE_SSL_CA_FILE,'utf8')},connectionTimeoutMillis:10000});
const upWatchdog=setTimeout(()=>process.exit(1),45000);upWatchdog.unref();
try{
 await upClient.connect();const s=upClient.connection.stream;
 if(!(s instanceof UpTls)||!s.encrypted||s.authorized!==true||
    !new UpCertificate(s.getPeerCertificate().raw).checkHost(upHost))throw Error('TLS');
 await upClient.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await upClient.query("SET LOCAL statement_timeout='20s'");
 await upClient.query('SET LOCAL search_path=pg_catalog,public');
 const proof=await observeFundedState(upClient);
 await upClient.query('COMMIT');
 console.log(JSON.stringify({observation:proof,databaseTlsVerified:true,databaseTlsHostnameVerified:true}));
}catch{process.exitCode=1;}finally{clearTimeout(upWatchdog);await upClient.end();}
"""

CAPABILITY_ADAPTER = r"""
import {createRequire as capRequire} from 'node:module';
import {readFileSync as capRead,readdirSync as capList} from 'node:fs';
import {pathToFileURL as capUrl} from 'node:url';
const capInput=JSON.parse(capRead(0,'utf8'));
const capRoot='/app';
const capContracts=await import(capUrl(capRequire(capRoot+'/packages/database/package.json').resolve('@future-flow/contracts')).href);
const capFiles=capList(capRoot+'/database/migrations').map(name=>({name,text:capRead(capRoot+'/database/migrations/'+name,'utf8')}));
console.log(JSON.stringify(runtimeCapability(capContracts,capInput.policies,capFiles)));
"""


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def bounded_source(request):
    value = request.get('observationSource')
    if not isinstance(value, str) or len(value.encode()) > 128 * 1024:
        raise policy.UpgradeRefused('Bounded git-bound observation source required')
    if sha(value.encode()) != request.get('observationSourceSha256'):
        raise policy.UpgradeRefused('Observation source differs from its commit binding')
    return value


def parse_observation(stdout):
    if len(stdout) > OBSERVATION_LIMIT:
        raise policy.UpgradeRefused('Observation exceeds its bound')
    result = json.loads(stdout)
    if result.get('databaseTlsVerified') is not True or result.get('databaseTlsHostnameVerified') is not True:
        raise policy.UpgradeRefused('Verified database TLS required')
    return policy.validate_observation(result['observation'])


def observe_running(api_id, source):
    """Read-only snapshot through the RUNNING api (no new container)."""
    return parse_observation(docker('exec', api_id, 'node', '--input-type=module', '-e',
                                    source + '\n' + OBSERVE_ADAPTER, timeout=60).stdout)


def observe_stopped(compose_path, source):
    """Read-only snapshot with all project writers stopped (held fence)."""
    return parse_observation(run(upgrade.compose(compose_path) + [
        'run', '-T', '--rm', '--no-deps', '--entrypoint', 'node', 'api', '--input-type=module',
        '-e', source + '\n' + OBSERVE_ADAPTER], timeout=90).stdout)


def capability(image_id, policies, source):
    """Run the image's OWN contracts against the stored policies, offline."""
    if not policy.IMAGE.fullmatch(image_id):
        raise policy.UpgradeRefused('Immutable image identity required')
    out = docker('run', '--rm', '-i', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
                 '--security-opt', 'no-new-privileges:true', '--pull', 'never', '--user', 'node',
                 '--memory', '256m', '--pids-limit', '64', '--entrypoint', 'node', image_id,
                 '--input-type=module', '-e', source + '\n' + CAPABILITY_ADAPTER,
                 input=json.dumps({'policies': policies}).encode(), timeout=60).stdout
    if len(out) > OBSERVATION_LIMIT:
        raise policy.UpgradeRefused('Capability proof exceeds its bound')
    return policy.validate_capability({**json.loads(out), 'imageId': image_id}, image_id=image_id)


def inventory(observation):
    return [item['policy'] for item in observation['policies']]


def personal_authority():
    prepared_bytes = fence.original(PERSONAL / 'prepared.json')
    return {'preparedBytes': prepared_bytes, 'prepared': json.loads(prepared_bytes),
            'journalBytes': fence.original(PERSONAL / 'journal.json'),
            'journal': json.loads(fence.original(PERSONAL / 'journal.json')),
            'transition': json.loads(fence.original(PERSONAL / 'transition.json')),
            'files': readers.files(PERSONAL)}


def attempts():
    if not STATE.exists() and not STATE.is_symlink():
        return []
    readers.private_root_directory(STATE)
    result = []
    for item in sorted(STATE.iterdir()):
        if not ATTEMPT.fullmatch(item.name):
            raise policy.UpgradeRefused('Unexpected funded upgrade artifact')
        readers.private_root_directory(item)
        for child in item.iterdir():
            if (child.name not in ATTEMPT_NAMES | {'previous', 'recovery'} and
                    not re.fullmatch(r'\.upgrade-[a-z0-9_]{8}', child.name)):
                raise policy.UpgradeRefused('Unexpected funded upgrade artifact')
        journal = item / 'journal.json'
        state = json.loads(fence.original(journal))['state'] if journal.exists() or journal.is_symlink() else None
        result.append({'path': item, 'state': state})
    return result


def require_no_open_attempt():
    for item in attempts():
        if item['state'] is not None and item['state'] not in policy.TERMINAL_STATES:
            raise policy.UpgradeRefused('An interrupted or closed attempt needs explicit recovery first')


def serving_authority(live_hashes, personal):
    """Which journalled operation produced the live bytes? Never an owner receipt."""
    if live_hashes == personal['prepared']['candidateFilesSha256']:
        return 'personal-activation'
    for item in reversed(attempts()):
        if item['state'] not in {'applied', 'recovered-compatible'}:
            continue
        record = json.loads(fence.original(item['path'] / 'journal.json'))
        if record.get('servingFilesSha256') == live_hashes:
            return item['path'].name
    raise policy.UpgradeRefused('Live runtime is not the product of a journalled funded operation')


def active_runtime(request, daily):
    """Read-only: exact, running, funded and journalled. No mutation."""
    readers.current_digest(request)
    live = readers.files(DIRECTORY)
    manifest = json.loads(live['manifest.json'])
    if (sha(live['server.env']) != manifest['ownerEnvironmentSha256'] or
            sha(live['effective-compose.json']) != manifest['effectiveComposeSha256'] or
            sha(CA.read_bytes()) != manifest['databaseCaSha256']):
        raise policy.UpgradeRefused('Live funded files or CA differ from the manifest')
    config = json.loads(live['effective-compose.json'])
    if frozen(config) != live['effective-compose.json']:
        raise policy.UpgradeRefused('Live frozen configuration is not canonical')
    personal = personal_authority()
    projection = policy.validate_funded_authority(
        personal_prepared=personal['prepared'], personal_prepared_bytes=personal['preparedBytes'],
        personal_journal=personal['journal'], personal_transition=personal['transition'],
        live_config=config)
    activated = json.loads(personal['files']['effective-compose.json'])
    if policy.protected_environment(activated) != policy.protected_environment(config):
        raise policy.UpgradeRefused('Funded environment drifted from the one-time activation')
    envs = policy.environments(config)
    if daily.personal_runtime_policy(envs, utcnow())['mode'] != 'personal-beta':
        raise policy.UpgradeRefused('Installed policy does not see a personal beta')
    live_hashes = {name: sha(value) for name, value in live.items()}
    authority = serving_authority(live_hashes, personal)
    services = upgrade.inspect_owner(config, manifest['imageId'])
    return {'files': live, 'hashes': live_hashes, 'manifest': manifest, 'config': config,
            'projection': projection, 'protected': policy.protected_environment(config),
            'personal': personal, 'authority': authority, 'services': services}


def inspect(request, daily):
    before = daily.stable_state()
    active = active_runtime(request, daily)
    observation = observe_running(active['services']['api']['Id'], bounded_source(request))
    drain = {'drained': drained(observation)}
    if daily.stable_state() != before:
        raise policy.UpgradeRefused('Inspection changed running containers')
    return {'activeCommit': active['manifest']['commit'], 'activeImageId': active['manifest']['imageId'],
            'servingAuthority': active['authority'], 'fundedProjectionSha256': policy.digest(active['projection']),
            'windowStart': active['projection']['windowStart'], 'windowEnd': active['projection']['windowEnd'],
            'participantCount': active['projection']['participantCount'],
            'appliedMigrations': len(observation['schema']['migrations']),
            'narrativeArtifactColumn': observation['schema']['narrativeArtifactColumn'],
            'storedPolicies': len(observation['policies']), 'drain': drain,
            'ledgerSha256': policy.digest(observation['ledger']),
            'attempts': [{'name': a['path'].name, 'state': a['state']} for a in attempts()],
            'containersStarted': 0, 'databaseWrites': 0, 'providerApiCalls': 0}


def image_proof(proof, *, registry, source_commit):
    if (set(proof) != {'commit', 'imageId', 'imageTag', 'sourceDirectory'} or
            not policy.COMMIT.fullmatch(proof['commit']) or not policy.IMAGE.fullmatch(proof['imageId']) or
            proof['imageTag'] != 'alterward:contabo-' + proof['commit'][:12]):
        raise policy.UpgradeRefused('Exact build proof required')
    source = confined(TARGET_ROOT, Path(proof['sourceDirectory']))
    inspected = json.loads(docker('image', 'inspect', proof['imageTag']).stdout)[0]
    if inspected['Id'] != proof['imageId'] or inspected['Config']['User'] != 'node':
        raise policy.UpgradeRefused('Pinned image changed')
    if proof['commit'] != source_commit and proof['imageId'] not in registry:
        raise policy.UpgradeRefused('Image is neither this reviewed source nor a reviewed release')
    return source


def candidate_files(directory, active, proof, source):
    """Write one durable candidate: only the tag line and pinned image change."""
    private_directory(directory)
    text = upgrade.image_only_environment(active['files']['server.env'].decode(), proof['imageTag'])
    policy.same_except_tag(active['files']['server.env'].decode(), text, proof['imageTag'])
    readers.durable_file(directory / 'server.env', text.encode())
    override = {'services': {name: {'image': proof['imageId'], 'pull_policy': 'never'}
                             for name in policy.SERVICES}}
    readers.durable_file(directory / 'pinned-image.json', encoded(override))
    rendered = readers.render(source, directory)
    policy.validate_render_delta(active['config'], rendered, previous_image=active['manifest']['imageId'],
                                 candidate_image=proof['imageId'], candidate_source=source,
                                 previous_source=policy.build_context(active['config']))
    if policy.protected_environment(rendered) != active['protected']:
        raise policy.UpgradeRefused('Candidate changes a funded environment value')
    readers.durable_file(directory / 'effective-compose.json', frozen(rendered))
    roundtrip = json.loads(run(upgrade.compose(directory / 'effective-compose.json') +
                               ['config', '--format', 'json']).stdout)
    if roundtrip != rendered:
        raise policy.UpgradeRefused('Frozen candidate changed after Compose roundtrip')
    manifest = {**active['manifest'], 'commit': proof['commit'], 'imageId': proof['imageId'],
                'ownerEnvironmentSha256': sha(text.encode()),
                'effectiveComposeSha256': sha(frozen(rendered)),
                'sourceComposeSha256': upgrade.source_hash(source)}
    readers.durable_file(directory / 'manifest.json', encoded(manifest))
    return rendered, {name: sha(fence.original(directory / name)) for name in FILES}


def drained(observation):
    try:
        return policy.drain_decision(observation)['drained']
    except policy.UpgradeRefused:
        return False


def prepare(request, daily):
    require_no_open_attempt()
    source_text = bounded_source(request)
    registry = set(request['reviewedImageIds'])
    active = active_runtime(request, daily)
    target_source = image_proof(request['buildProof'], registry=registry, source_commit=request['sourceCommit'])
    recovery_proof = request['recoveryProof']
    recovery_source = image_proof(recovery_proof, registry=registry, source_commit=request['sourceCommit'])
    observation = observe_running(active['services']['api']['Id'], source_text)
    target_cap = capability(request['buildProof']['imageId'], inventory(observation), source_text)
    recovery_cap = capability(recovery_proof['imageId'], inventory(observation), source_text)
    policy.capability_covers(target_cap, observation)
    schema = policy.expected_schema_transition(observation, target_cap)
    policy.validate_recovery_target(recovery_cap, target=target_cap, observation=observation,
                                    reviewed_images=registry)
    before = daily.stable_state()
    now = utcnow()
    STATE.mkdir(mode=0o700, exist_ok=True)
    readers.private_root_directory(STATE)
    path = STATE / (request['buildProof']['commit'][:12] + '-' + now.strftime('%Y%m%dT%H%M%SZ'))
    if path.exists() or path.is_symlink():
        raise policy.UpgradeRefused('Preparation directory already exists')
    private_directory(path)
    previous = path / 'previous'
    private_directory(previous)
    for name, value in active['files'].items():
        readers.durable_file(previous / name, value)
    rendered, target_hashes = candidate_files(path, active, request['buildProof'], target_source)
    recovery_hashes = target_hashes
    if recovery_proof['imageId'] != request['buildProof']['imageId']:
        _, recovery_hashes = candidate_files(path / 'recovery', active, recovery_proof, recovery_source)
    readers.durable_file(path / 'baseline-observation.json', encoded(observation))
    readers.durable_file(path / 'target-capability.json', encoded(target_cap))
    readers.durable_file(path / 'recovery-capability.json', encoded(recovery_cap))
    candidate = {
        'schema': policy.CANDIDATE_SCHEMA, 'sourceCommit': request['sourceCommit'],
        'preparedAt': now.isoformat(),
        'expiresAt': (now + dt.timedelta(seconds=policy.PREPARATION_SECONDS)).isoformat(),
        'helperSourcesSha256': request['helperSourcesSha256'],
        'observationSourceSha256': request['observationSourceSha256'],
        'ciRunIds': request['ciRunIds'], 'auditSourceCommit': request['auditSourceCommit'],
        'auditResultSha256': request['auditResultSha256'],
        'activeManifestSha256': active['hashes']['manifest.json'],
        'activeCommit': active['manifest']['commit'], 'activeImageId': active['manifest']['imageId'],
        'activeFilesSha256': active['hashes'],
        'personalPreparedSha256': sha(active['personal']['preparedBytes']),
        'personalJournalSha256': sha(active['personal']['journalBytes']),
        'fundedProjectionSha256': policy.digest(active['projection']),
        'protectedEnvironmentSha256': policy.digest(active['protected']),
        'targetCommit': request['buildProof']['commit'], 'targetImageId': request['buildProof']['imageId'],
        'targetFilesSha256': target_hashes, 'targetCapabilitySha256': policy.digest(target_cap),
        'targetMigrationsSha256': policy.digest(target_cap['migrations']),
        'recoveryCommit': recovery_proof['commit'], 'recoveryImageId': recovery_proof['imageId'],
        'recoveryCapabilitySha256': policy.digest(recovery_cap),
        'baselineObservationSha256': policy.digest(observation),
        'ledgerSha256': policy.digest(observation['ledger']),
        'policyInventorySha256': policy.digest([p['policySha256'] for p in observation['policies']]),
        'proxyNetworkSha256': policy.digest(upgrade.proxy_network()),
        'accessProjectionSha256': policy.digest(readers.projection(request['ownerAccess'])),
        'databaseCaSha256': sha(CA.read_bytes()),
        'foreignContainersSha256': policy.digest(upgrade.foreign_state()),
        'recoveryFilesSha256': recovery_hashes}
    policy.validate_candidate(candidate, now=now)
    readers.durable_file(path / 'prepared.json', encoded(candidate))
    if daily.stable_state() != before:
        raise policy.UpgradeRefused('Preparation changed running containers')
    return {'preparedProof': candidate, 'attempt': path.name, 'pendingMigrations': schema['pending'],
            'drainedNow': drained(observation),
            'preparedOnly': True, 'containersStarted': 0, 'databaseWrites': 0, 'providerApiCalls': 0}


def prepared(request):
    name = request.get('attempt')
    if not isinstance(name, str) or not ATTEMPT.fullmatch(name):
        raise policy.UpgradeRefused('Exact attempt name required')
    path = STATE / name
    readers.private_root_directory(path)
    value = json.loads(fence.original(path / 'prepared.json'))
    if value != request['preparedProof']:
        raise policy.UpgradeRefused('Exact funded preparation receipt required')
    if {n: sha(fence.original(path / n)) for n in FILES} != value['targetFilesSha256']:
        raise policy.UpgradeRefused('Prepared candidate bytes changed')
    recovery = path / 'recovery'
    if value['recoveryImageId'] != value['targetImageId']:
        if {n: sha(fence.original(recovery / n)) for n in FILES} != value['recoveryFilesSha256']:
            raise policy.UpgradeRefused('Prepared recovery bytes changed')
    previous = {n: fence.original(path / 'previous' / n) for n in FILES}
    if {n: sha(v) for n, v in previous.items()} != value['activeFilesSha256']:
        raise policy.UpgradeRefused('Archived previous funded bytes changed')
    caps = {key: json.loads(fence.original(path / (key + '-capability.json'))) for key in ('target', 'recovery')}
    if (policy.digest(caps['target']) != value['targetCapabilitySha256'] or
            policy.digest(caps['recovery']) != value['recoveryCapabilitySha256']):
        raise policy.UpgradeRefused('Prepared capability proof changed')
    return path, value, previous, caps


def require_restored_upgrade(daily, prepared_at, path):
    """A fresh, real offsite restore whose archive holds THIS preparation."""
    if getattr(daily, 'FUNDED_UPGRADE_ARCHIVE_POLICY_VERSION', None) != 1:
        raise policy.UpgradeRefused('Installed daily must archive funded upgrade evidence')
    installed = daily.config()
    proof = json.loads(daily.regular(daily.ROOT / 'status' / 'restore.json'))
    if not daily.current_proof(proof, installed, 3600):
        raise policy.UpgradeRefused('Fresh installed-source offsite restore required')
    for field in ('offsiteCiphertextVerified', 'tamperedCiphertextRejected', 'proxyAdaptAndValidate',
                  'singleTransactionRestore', 'temporaryContainersRemoved', 'temporaryPlaintextRemoved',
                  'allExistingContainersUnchanged', 'decryptionIdentityMemoryOnly'):
        if proof.get(field) is not True:
            raise policy.UpgradeRefused('Actual offsite restore checks incomplete')
    if proof.get('liveDatabaseWrites') is not False or proof.get('paidAiCalls') != 0:
        raise policy.UpgradeRefused('Non-writing restore proof required')
    matches = [r['manifest'] for r in daily.completed_archives(daily.ROOT / 'backups')
               if r['manifest']['runId'] == proof.get('runId')]
    if len(matches) != 1:
        raise policy.UpgradeRefused('Exact server archive for the restore required')
    manifest = matches[0]
    if (manifest['encryptedFiles'] != proof['encryptedFiles'] or
            any(manifest.get(k) != v for k, v in daily.source_binding(installed).items()) or
            dt.datetime.fromisoformat(manifest['capturedAt']) < prepared_at or
            proof.get('configFilesRestored') != len(manifest['configFiles']) or
            proof.get('tablesRestoredAndDataMatched') != len(manifest['expectedTables']) or
            proof.get('rowsMatched') != sum(t['count'] for t in manifest['expectedTables'])):
        raise policy.UpgradeRefused('Restore is not bound to the current complete archive')
    required = [path / 'prepared.json', path / 'manifest.json', path / 'server.env',
                PERSONAL / 'journal.json', DIRECTORY / 'manifest.json', DIRECTORY / 'server.env']
    for item in required:
        if manifest['configFiles'].get(str(item).lstrip('/')) != sha(fence.original(item)):
            raise policy.UpgradeRefused('Restored archive lacks the current funded preparation')
    return proof['runId']


def up(path, services):
    run(upgrade.compose(path) + ['up', '-d', '--no-deps', '--force-recreate', '--no-build',
        '--pull', 'never', '--wait', '--wait-timeout', '120', *services], timeout=180)


def running_subset(config, image, services):
    ids = upgrade.project_ids()
    items = [i for i in json.loads(docker('inspect', *ids).stdout)
             if i['State']['Running']] if ids else []
    names = sorted(i['Config']['Labels'].get('com.docker.compose.service') for i in items)
    if names != sorted(services):
        raise policy.UpgradeRefused('Unexpected running project services')
    for item in items:
        name = item['Config']['Labels']['com.docker.compose.service']
        env = dict(entry.split('=', 1) for entry in item['Config'].get('Env', []))
        if item['Image'] != image or any(env.get(k) != v for k, v in config['services'][name]['environment'].items()):
            raise policy.UpgradeRefused('Running service differs from the frozen candidate')
    return {i['Config']['Labels']['com.docker.compose.service']: i for i in items}


def origin_probe(api_id):
    checks = json.loads(docker('exec', api_id, 'node', '--input-type=module', '-e', upgrade.ORIGIN_PROBE).stdout)
    if checks.get('anonymousDenied') != 4:
        raise policy.UpgradeRefused('Origin access boundary failed')
    return checks


def apply(request, daily):
    path, value, previous, caps = prepared(request)
    journal_path = path / 'journal.json'
    if journal_path.exists() or journal_path.is_symlink():
        raise policy.UpgradeRefused('Previous apply attempt requires explicit recovery inspection')
    now = utcnow()
    policy.validate_candidate(value, now=now)
    source_text = bounded_source(request)
    if (value['sourceCommit'] != request['sourceCommit'] or
            value['observationSourceSha256'] != request['observationSourceSha256'] or
            value['helperSourcesSha256'] != request['helperSourcesSha256']):
        raise policy.UpgradeRefused('Apply must use the prepared operator source')
    active = active_runtime(request, daily)
    if (active['hashes'] != value['activeFilesSha256'] or
            policy.digest(active['projection']) != value['fundedProjectionSha256'] or
            policy.digest(active['protected']) != value['protectedEnvironmentSha256'] or
            sha(active['personal']['journalBytes']) != value['personalJournalSha256'] or
            policy.digest(upgrade.proxy_network()) != value['proxyNetworkSha256'] or
            policy.digest(readers.projection(request['ownerAccess'])) != value['accessProjectionSha256'] or
            sha(CA.read_bytes()) != value['databaseCaSha256']):
        raise policy.UpgradeRefused('Live funded baseline changed after preparation')
    restore_run = require_restored_upgrade(daily, dt.datetime.fromisoformat(value['preparedAt']), path)
    target_config = json.loads(fence.original(path / 'effective-compose.json'))
    recovery_dir = path / 'recovery' if value['recoveryImageId'] != value['targetImageId'] else None
    original = active['services']
    foreign = upgrade.foreign_state()
    if policy.digest(foreign) != value['foreignContainersSha256']:
        raise policy.UpgradeRefused('Foreign workloads changed after preparation')
    held_state = {}
    prepared_sha = sha(encoded(value))

    def record(state, **extra):
        previous_record = json.loads(fence.original(journal_path)) if journal_path.exists() else None
        entry = policy.journal_record(state, prepared_sha256=prepared_sha, previous=previous_record,
                                      now=utcnow())
        readers.update_durable(journal_path, encoded({**entry, **extra}))

    def held():
        import alterward_personal_observation as observation
        observation.held_services(original)
        observed = observe_stopped(DIRECTORY / 'effective-compose.json', source_text)
        policy.drain_decision(observed)
        for key, image in (('target', value['targetImageId']), ('recovery', value['recoveryImageId'])):
            fresh = capability(image, inventory(observed), source_text)
            if fresh['migrations'] != caps[key]['migrations']:
                raise policy.UpgradeRefused('Image migrations changed after preparation')
            policy.capability_covers(fresh, observed)
            held_state[key] = fresh
        policy.expected_schema_transition(observed, held_state['target'])
        policy.validate_recovery_target(held_state['recovery'], target=held_state['target'],
                                        observation=observed, reviewed_images=set(request['reviewedImageIds']))
        if upgrade.foreign_state() != foreign:
            raise policy.UpgradeRefused('Foreign runtime changed during the held fence')
        readers.durable_file(path / 'held-observation.json', encoded(observed))
        held_state['observation'] = observed

    def migrate():
        # The reviewed checksum runner inside the TARGET image, writers stopped.
        run(upgrade.compose(path / 'effective-compose.json') +
            ['run', '-T', '--rm', '--no-deps', 'api', 'pnpm', 'db:migrate'], timeout=300)

    def schema_observation():
        return observe_stopped(path / 'effective-compose.json', source_text)

    def verify_schema():
        after = schema_observation()
        policy.require_schema(after, held_state['target'])
        policy.require_preserved(held_state['observation'], after)
        policy.drain_decision(after)
        policy.capability_covers(held_state['target'], after)
        readers.durable_file(path / 'schema-observation.json', encoded(after))

    def promote():
        for name in FILES:
            upgrade.atomic_private(DIRECTORY / name, fence.original(path / name))
        if {n: sha(v) for n, v in readers.files(DIRECTORY).items()} != value['targetFilesSha256']:
            raise policy.UpgradeRefused('Promoted funded bytes differ')

    def verify_origin():
        services = running_subset(target_config, value['targetImageId'], ['api', 'web'])
        origin_probe(services['api']['Id'])
        if policy.digest(upgrade.proxy_network()) != value['proxyNetworkSha256']:
            raise policy.UpgradeRefused('Shared proxy network changed')

    def verify_runtime():
        services = upgrade.inspect_owner(target_config, value['targetImageId'])
        origin_probe(services['api']['Id'])
        envs = policy.environments(target_config)
        if (daily.personal_runtime_policy(envs, utcnow())['mode'] != 'personal-beta' or
                policy.digest(policy.funded_projection(target_config)) != value['fundedProjectionSha256'] or
                policy.digest(policy.protected_environment(target_config)) != value['protectedEnvironmentSha256'] or
                upgrade.foreign_state() != foreign):
            raise policy.UpgradeRefused('Post-check: funded authority or foreign workloads changed')

    def schema_applied():
        names = [m['name'] for m in schema_observation()['schema']['migrations']]
        return policy.NARRATIVE_MIGRATION in names

    def restore_previous():
        for name, data in previous.items():
            upgrade.atomic_private(DIRECTORY / name, data)
        upgrade.replace_services(DIRECTORY / 'effective-compose.json')

    def verify_previous():
        config = json.loads(previous['effective-compose.json'])
        services = upgrade.inspect_owner(config, value['activeImageId'])
        origin_probe(services['api']['Id'])
        if upgrade.foreign_state() != foreign:
            raise policy.UpgradeRefused('Foreign runtime changed')

    def start_recovery():
        for name in FILES:
            upgrade.atomic_private(DIRECTORY / name, fence.original(recovery_dir / name))
        up(DIRECTORY / 'effective-compose.json', ['web', 'api'])

    def verify_recovery():
        config = json.loads(fence.original(recovery_dir / 'effective-compose.json'))
        services = running_subset(config, value['recoveryImageId'], ['api', 'web'])
        origin_probe(services['api']['Id'])
        up(DIRECTORY / 'effective-compose.json', ['worker'])
        upgrade.inspect_owner(config, value['recoveryImageId'])
        if (policy.digest(policy.protected_environment(config)) != value['protectedEnvironmentSha256'] or
                upgrade.foreign_state() != foreign):
            raise policy.UpgradeRefused('Recovery changed funded authority or foreign workloads')

    def final_record(state):
        serving = {n: sha(v) for n, v in readers.files(DIRECTORY).items()} if state in {
            'applied', 'recovered-compatible'} else None
        record(state, **({'servingFilesSha256': serving} if serving else {}))

    policy.transition(
        record=final_record, stop=readers.stop_project, held=held, migrate=migrate,
        verify_schema=verify_schema, promote=promote,
        start_origin=lambda: up(DIRECTORY / 'effective-compose.json', ['web', 'api']),
        verify_origin=verify_origin,
        start_worker=lambda: up(DIRECTORY / 'effective-compose.json', ['worker']),
        verify_runtime=verify_runtime, schema_applied=schema_applied,
        restore_previous=restore_previous, verify_previous=verify_previous,
        start_recovery=start_recovery if recovery_dir else None, verify_recovery=verify_recovery)
    result = {'upgraded': True, 'configurationMode': 'funded-upgrade',
              'manifest': json.loads(fence.original(DIRECTORY / 'manifest.json')),
              'attempt': path.name, 'commit': value['targetCommit'],
              'imageId': value['targetImageId'], 'previousImageId': value['activeImageId'],
              'restoredPreparationRunId': restore_run,
              'fundedProjectionSha256': value['fundedProjectionSha256'],
              'ledgerPreserved': True, 'windowPreserved': True, 'runningServices': 3,
              'narrativePipelineMode': 'legacy', 'paidAiCalls': 0, 'providerApiCalls': 0,
              'existingForeignContainersUnchanged': True, 'dnsChanged': False, 'proxyChanged': False}
    readers.durable_file(path / 'applied.json', encoded(result))
    return result


def recover(request, daily):
    """Explicit post-interruption action. Never moves forward, never replays."""
    path, value, previous, caps = prepared(request)
    journal_path = path / 'journal.json'
    record_value = json.loads(fence.original(journal_path))
    if (record_value.get('preparedSha256') != sha(encoded(value)) or
            record_value.get('state') in policy.TERMINAL_STATES):
        raise policy.UpgradeRefused('Only an interrupted or closed attempt can be recovered')
    source_text = bounded_source(request)
    if policy.digest(readers.projection(request['ownerAccess'])) != value['accessProjectionSha256']:
        raise policy.UpgradeRefused('Access changed; do not restore previous rights')
    # The live files must be the previous, target or recovery bytes; anything
    # else may be a revocation that we must never overwrite.
    live = {n: sha(v) for n, v in readers.files(DIRECTORY).items()}
    allowed = [value['activeFilesSha256'], value['targetFilesSha256'], value.get('recoveryFilesSha256')]
    if live not in allowed:
        raise policy.UpgradeRefused('Live runtime drift; refusing to restore previous rights')
    foreign = upgrade.foreign_state()
    recovery_dir = path / 'recovery' if value['recoveryImageId'] != value['targetImageId'] else None
    prepared_sha = sha(encoded(value))

    def record(state):
        current = json.loads(fence.original(journal_path))
        entry = policy.journal_record(state, prepared_sha256=prepared_sha, previous=current, now=utcnow())
        serving = {n: sha(v) for n, v in readers.files(DIRECTORY).items()} if state == 'recovered-compatible' else None
        readers.update_durable(journal_path, encoded({**entry, **({'servingFilesSha256': serving} if serving else {})}))

    def schema_applied():
        observed = observe_stopped(path / 'effective-compose.json', source_text)
        return policy.NARRATIVE_MIGRATION in [m['name'] for m in observed['schema']['migrations']]

    def restore_previous():
        for name, data in previous.items():
            upgrade.atomic_private(DIRECTORY / name, data)
        upgrade.replace_services(DIRECTORY / 'effective-compose.json')

    def verify_previous():
        services = upgrade.inspect_owner(json.loads(previous['effective-compose.json']), value['activeImageId'])
        origin_probe(services['api']['Id'])
        if upgrade.foreign_state() != foreign:
            raise policy.UpgradeRefused('Foreign runtime changed')

    def start_recovery():
        observed = observe_stopped(path / 'effective-compose.json', source_text)
        fresh = capability(value['recoveryImageId'], inventory(observed), source_text)
        policy.validate_recovery_target(fresh, target=caps['target'], observation=observed,
                                        reviewed_images=set(request['reviewedImageIds']))
        for name in FILES:
            upgrade.atomic_private(DIRECTORY / name, fence.original(recovery_dir / name))
        up(DIRECTORY / 'effective-compose.json', ['web', 'api'])

    def verify_recovery():
        config = json.loads(fence.original(recovery_dir / 'effective-compose.json'))
        services = running_subset(config, value['recoveryImageId'], ['api', 'web'])
        origin_probe(services['api']['Id'])
        up(DIRECTORY / 'effective-compose.json', ['worker'])
        upgrade.inspect_owner(config, value['recoveryImageId'])
        if upgrade.foreign_state() != foreign:
            raise policy.UpgradeRefused('Foreign runtime changed')

    state = policy.fail_closed(record=record, stop=readers.stop_project, schema_applied=schema_applied,
                               restore_previous=restore_previous, verify_previous=verify_previous,
                               start_recovery=start_recovery if recovery_dir else None,
                               verify_recovery=verify_recovery)
    return {'recovered': state != 'closed-recovery-required', 'state': state, 'attempt': path.name,
            'paidAiCalls': 0, 'providerApiCalls': 0, 'evidenceDeleted': False}


def readback(request, daily):
    active = active_runtime(request, daily)
    observation = observe_running(active['services']['api']['Id'], bounded_source(request))
    applied = [a for a in attempts() if a['state'] in {'applied', 'recovered-compatible'}]
    latest = applied[-1] if applied else None
    return {'configurationMode': 'funded-upgrade', 'manifest': active['manifest'], 'paidAiCalls': 0,
            'activeCommit': active['manifest']['commit'], 'activeImageId': active['manifest']['imageId'],
            'servingAuthority': active['authority'], 'latestAttempt': latest['path'].name if latest else None,
            'latestAttemptState': latest['state'] if latest else None,
            'fundedProjectionSha256': policy.digest(active['projection']),
            'protectedEnvironmentSha256': policy.digest(active['protected']),
            'narrativeArtifactColumn': observation['schema']['narrativeArtifactColumn'],
            'appliedMigrations': len(observation['schema']['migrations']),
            'ledgerSha256': policy.digest(observation['ledger']),
            'containersStarted': 0, 'databaseWrites': 0, 'providerApiCalls': 0}


MODES = {'inspect': inspect, 'prepare-funded-upgrade': prepare, 'apply-funded-upgrade': apply,
         'recover-funded-upgrade': recover, 'readback-funded-upgrade': readback}


def main(request):
    mode = request.get('mode')
    if os.geteuid() != 0 or mode not in MODES:
        raise policy.UpgradeRefused('Explicit funded upgrade mode required')
    for path in (fence.DAILY / 'job.lock', DIRECTORY / 'activation.lock'):
        fence.original(path)
    with (fence.DAILY / 'job.lock').open('rb') as job, (DIRECTORY / 'activation.lock').open('rb') as owner:
        # Never wait: a competing daily job or operator means no mutation now.
        readers.exclusive_lock(job, 0)
        readers.exclusive_lock(owner, 0)
        daily = fence.installed_daily()
        if (getattr(daily, 'READER_ARCHIVE_POLICY_VERSION', None) != 1 or
                getattr(daily, 'PERSONAL_ARCHIVE_POLICY_VERSION', None) != 1):
            raise policy.UpgradeRefused('Reviewed installed personal/reader config archive required')
        return MODES[mode](request, daily)


if __name__ == '__main__':
    try:
        print(json.dumps({'ok': True, 'result': main(json.load(sys.stdin))}))
    except BaseException:
        print(json.dumps({'ok': False, 'phase': 'funded-upgrade'}))
        sys.exit(1)
