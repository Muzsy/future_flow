"""Linux active-funded upgrade. Never replays activation or restores an old DB.

The client sends only git-bound code and exact private release evidence. Root
state is finite, durable and archived by the installed daily operator. On any
interruption the original activation remains immutable and serving stays closed.
"""

import copy
import datetime as dt
import json
import os
from pathlib import Path
import re
import signal
import stat
import time

from alterward_activation import DIRECTORY, FILES, encoded, frozen, sha
import alterward_upgrade as upgrade
import alterward_fence as fence
import alterward_readers as readers
import alterward_personal_beta as beta

VERSION = 'alterward-funded-upgrade-1'
STATE_NAME = 'funded-runtime-upgrade'
DIGEST = re.compile(r'[a-f0-9]{64}')
IMAGE = re.compile(r'sha256:[a-f0-9]{64}')
COMMIT = re.compile(r'[a-f0-9]{40}')
PROBE_COMMAND = ['--import', 'tsx', 'scripts/ops/funded-runtime-probe.ts']
CAPABILITY_CODE = """import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
const hashes=JSON.parse(readFileSync(0,'utf8'));
for(const[p,h]of Object.entries(hashes))if(createHash('sha256').update(readFileSync('/app/'+p)).digest('hex')!==h)throw Error('Image source mismatch');
const{fundedRuntimeCapabilities}=await import('/app/scripts/lib/funded-runtime.ts');console.log(JSON.stringify(fundedRuntimeCapabilities()));"""
CAPABILITY_COMMAND = ['--import', 'tsx', '--input-type=module', '-e', CAPABILITY_CODE]


def exact(value, keys):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise ValueError('Exact funded-upgrade input shape required')
    return value


def probe_identity(record):
    return sha(encoded({k: v for k, v in record.items() if k not in {'state', 'containerId'}}))


def stamp(value):
    if not isinstance(value, str):
        raise ValueError('UTC timestamp required')
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.utcoffset() != dt.timedelta(0):
        raise ValueError('UTC timestamp required')
    return parsed


# Default additions from a newer Compose are harmless; existing nondefault
# values and all other environment/authority fields must remain exact.
NARRATIVE_DEFAULTS = {
    'NARRATIVE_PIPELINE_MODE': 'legacy',
    'NARRATIVE_COHORT_USER_IDS': '',
    'NARRATIVE_FICTION_GENERATION': 'v8',
}
WORKER_DEFAULTS = {'AI_FICTION_TIMEOUT_MS': '180000', 'AI_FICTION_MAX_REQUEST_BYTES': '100000'}


def narrative_runtime_values(runtime):
    exact(runtime, {'mode', 'generation', 'cohortUserIds', 'timeoutMs', 'maxRequestBytes'})
    users = runtime['cohortUserIds']
    if (runtime['mode'] != 'narrative-fiction-v2' or runtime['generation'] != 'v9'
            or not isinstance(users, list) or not 1 <= len(users) <= 10
            or any(not isinstance(u, str) or not re.fullmatch(
                r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', u) for u in users)
            or len(set(users)) != len(users)
            or type(runtime['timeoutMs']) is not int or not 1000 <= runtime['timeoutMs'] <= 300000
            or type(runtime['maxRequestBytes']) is not int or not 100000 <= runtime['maxRequestBytes'] <= 196608):
        raise ValueError('Bounded explicit v9 runtime required')
    return {
        'NARRATIVE_PIPELINE_MODE': runtime['mode'],
        'NARRATIVE_FICTION_GENERATION': runtime['generation'],
        'NARRATIVE_COHORT_USER_IDS': ','.join(users),
        'AI_FICTION_TIMEOUT_MS': str(runtime['timeoutMs']),
        'AI_FICTION_MAX_REQUEST_BYTES': str(runtime['maxRequestBytes']),
    }


def narrative_environment(text, runtime):
    if runtime is None:
        return text
    values = narrative_runtime_values(runtime)
    before = upgrade.server_environment(text)
    admitted = before.get('CLOSED_BETA_USER_IDS', '').split(',')
    if not set(runtime['cohortUserIds']) <= set(admitted):
        raise ValueError('Narrative cohort must already have funded admission')
    for key, value in values.items():
        if key in before:
            text = re.sub(r"^" + key + r"='[^'\r\n]*'$", key + "='" + value + "'", text, flags=re.MULTILINE)
        else:
            text = text.rstrip('\n') + "\n" + key + "='" + value + "'\n"
    after = upgrade.server_environment(text)
    if {k: v for k, v in before.items() if k not in values} != {k: v for k, v in after.items() if k not in values}:
        raise ValueError('Narrative selection changed funded authority')
    return text


def normalized_configuration(config, runtime=None):
    config = copy.deepcopy(config)
    values = narrative_runtime_values(runtime) if runtime is not None else {}
    for role, svc in config['services'].items():
        svc['image'] = '<reviewed-image>'
        if 'build' in svc:
            svc['build']['context'] = '<reviewed-source>'
        if role in ('api', 'worker'):
            env = svc['environment']
            for key, value in NARRATIVE_DEFAULTS.items():
                env.setdefault(key, value)
            if role == 'worker':
                for key, value in WORKER_DEFAULTS.items():
                    env.setdefault(key, value)
            for key, value in values.items():
                if role == 'worker' or key in NARRATIVE_DEFAULTS:
                    env[key] = value
    return config


def same_funded(before, after):
    # Catalog/schema may change only through the guarded 039 migration. Every
    # existing application row (including costs/leases) and artifact must match.
    keys = (
        'version',
        'identityBindingSha256',
        'dataSha256',
        'artifactSha256',
        'policiesSha256',
        'drained',
    )
    if (
        any(before.get(k) != after.get(k) for k in keys)
        or after.get('drained') is not True
    ):
        raise ValueError(
            'Protected funded database state changed: '
            + ','.join(k for k in keys if before.get(k) != after.get(k))
        )


def fresh(candidate, now):
    exact(
        candidate,
        {
            'version',
            'sourceCommit',
            'bundleSha256',
            'preparedAt',
            'expiresAt',
            'baseline',
            'release',
            'files',
            'database',
        },
    )
    if (
        candidate['version'] != VERSION
        or not COMMIT.fullmatch(candidate['sourceCommit'])
        or not DIGEST.fullmatch(candidate['bundleSha256'])
        or stamp(candidate['expiresAt']) - stamp(candidate['preparedAt'])
        != dt.timedelta(seconds=900)
        or not stamp(candidate['preparedAt']) <= now < stamp(candidate['expiresAt'])
    ):
        raise ValueError('Fresh exact 900-second funded candidate required')


def transition(system, candidate, *, recovery=False):
    """Same orchestration is exercised with actual filesystem/Docker fixtures.

    No automatic fallback to a previous image/schema. Explicit recovery uses the
    pre-validated compatible image on the CURRENT database, never an old dump.
    """
    system.preflight(candidate, recovery=recovery)
    system.begin_guard(candidate)
    try:
        system.record('recovery-intent' if recovery else 'apply-intent', candidate)
        system.stop()
        system.record('held', candidate)
        system.held(candidate)
        system.backup(candidate)
        system.capabilities(candidate)
        system.record('migration-intent', candidate)
        system.migrate(candidate)
        # 'schema-038' is the historical journal label of the post-migration
        # state; it is kept so recorded journals stay valid (now: schema 039).
        system.record('schema-038', candidate)
        system.stage(candidate, recovery=recovery)
        system.record('staged', candidate)
        system.postcheck(candidate, recovery=recovery)
        system.record('verified-staged', candidate)
        system.promote(candidate, recovery=recovery)
        # Only after complete staged post-check may ingress and then the worker
        # be exposed. A sticky exposure intent distinguishes an interrupted open.
        system.record('exposure-intent', candidate)
        system.expose(candidate, recovery=recovery)
        result = system.readback(candidate, recovery=recovery)
        system.record('recovered' if recovery else 'applied', candidate)
        system.restore_restart_policy()
        system.finish_guard()
        return result
    except BaseException:
        # SIGKILL is reconciled by explicit --recover. Catchable interruptions
        # cannot leave an unverified candidate or old incompatible image serving.
        for number in upgrade.INTERRUPTION_SIGNALS:
            signal.signal(number, signal.SIG_IGN)
        stopped = False
        try:
            system.stop()
            stopped = True
        finally:
            system.record('closed' if stopped else 'stop-unverified', candidate)
            system.finish_guard()
        raise


class System:
    def __init__(self, request, daily):
        self.request, self.daily = request, daily
        self.root = DIRECTORY / STATE_NAME
        self.staging_network = 'alterward-funded-check-' + request['sourceCommit'][:12]

    def active_proof(self):
        from alterward_funded_replay import active_funded_runtime
        candidate = json.loads(fence.original(self.root / 'prepared.json'))
        if (candidate['sourceCommit'] != self.request['sourceCommit'] or
                candidate['bundleSha256'] != self.request['bundleSha256']):
            raise ValueError('Use the original exact committed upgrade source for active proof')
        proof = active_funded_runtime(self.daily, fence.original)
        self.image(candidate['release'][proof['role']])
        # Re-read after the image capability check; concurrent state cannot issue a proof.
        if active_funded_runtime(self.daily, fence.original) != proof:
            raise ValueError('Active runtime drift while validating image')
        return proof

    def now(self):
        return dt.datetime.now(dt.timezone.utc)

    def files(self, path):
        return {name: fence.original(path / name) for name in FILES}

    def hashes(self, path):
        return {k: sha(v) for k, v in self.files(path).items()}

    def access(self, expected=None):
        value = self.request['accessSnapshot']
        exact(
            value,
            {
                'checkedAt',
                'teamDomain',
                'audience',
                'allowedEmails',
                'configurationSha256',
            },
        )
        if not 0 <= (self.now() - stamp(value['checkedAt'])).total_seconds() <= 900:
            raise ValueError('Fresh GET-only external Access observation required')
        if not DIGEST.fullmatch(value['configurationSha256']):
            raise ValueError('Access configuration digest required')
        previous = json.loads(
            fence.original(DIRECTORY / 'personal-beta-readers' / 'access.json')
        )
        if (
            value['teamDomain'] != previous['teamDomain']
            or value['audience'] != previous['audience']
            or sorted(value['allowedEmails']) != sorted(previous['allowedEmails'])
        ):
            raise ValueError('Access reader identity drift')
        config = self.configuration(DIRECTORY)
        for role in ('web', 'api'):
            env = config['services'][role]['environment']
            if (
                env.get('CLOUDFLARE_ACCESS_TEAM_DOMAIN') != value['teamDomain']
                or env.get('CLOUDFLARE_ACCESS_AUD') != value['audience']
                or sorted(env.get('CLOSED_SITE_ALLOWED_EMAILS', '').split(','))
                != sorted(value['allowedEmails'])
            ):
                raise ValueError('Origin and external Access identities differ')
        if expected is not None and value['configurationSha256'] != expected:
            raise ValueError('External Access configuration changed since preparation')
        return value['configurationSha256']

    def baseline(self, *, running=True, require_active=True):
        personal = DIRECTORY / 'personal-beta'
        prepared = json.loads(fence.original(personal / 'prepared.json'))
        journal = json.loads(fence.original(personal / 'journal.json'))
        applied = json.loads(fence.original(personal / 'transition.json'))
        expected = sha(encoded(prepared))
        if (
            journal.get('state') != 'exposure-committed'
            or applied.get('state') != 'applied'
            or journal.get('preparedSha256') != expected
            or applied.get('preparedSha256') != expected
        ):
            raise ValueError(
                'Immutable applied funded authority required; owner-zero is not accepted'
            )
        if self.hashes(personal) != prepared['candidateFilesSha256']:
            raise ValueError('Original funded candidate evidence changed')
        original = self.files(personal)
        current = self.files(DIRECTORY)
        if current != original:
            raise ValueError('Original active-funded baseline differs')
        config = self.configuration(DIRECTORY)
        policy = self.daily.personal_runtime_policy(
            {k: v['environment'] for k, v in config['services'].items()}, self.now()
        )
        terms = json.loads(fence.original(personal / 'terms.json'))
        if (
            policy['mode'] != 'personal-beta'
            or (require_active and (not policy['queueAllowed']
                or not stamp(terms['startsAt']) <= self.now() < stamp(terms['endsAt'])))
            or sha(encoded(terms)) != prepared['termsSha256']
        ):
            raise ValueError('Existing active funded window and terms required')
        manifest = json.loads(original['manifest.json'])
        ca = upgrade.CA.lstat()
        if (
            upgrade.CA.resolve() != upgrade.CA
            or not stat.S_ISREG(ca.st_mode)
            or ca.st_uid != 0
            or ca.st_nlink != 1
            or stat.S_IMODE(ca.st_mode) != 0o644
        ):
            raise ValueError('Original public CA file required')
        if (
            sha(upgrade.CA.read_bytes()) != manifest['databaseCaSha256']
            or manifest['accessConfigurationSha256']
            != prepared['manifest']['accessConfigurationSha256']
        ):
            raise ValueError('Original CA/access authority changed')
        if running:
            upgrade.inspect_owner(config, manifest['imageId'])
        paths = self.daily.reader_config_paths() + self.daily.personal_config_paths()
        return {
            'accessConfigurationSha256': self.access(),
            'files': {k: sha(v) for k, v in original.items()},
            'authority': {str(p): sha(fence.original(p)) for p in paths},
            'proxyNetwork': upgrade.proxy_network(),
            'foreign': upgrade.foreign_state(),
        }

    def configuration(self, path):
        return json.loads(
            upgrade.run(
                upgrade.compose(path / 'effective-compose.json')
                + ['config', '--format', 'json']
            ).stdout
        )

    def raw_probe(self, image, data):
        # API-shaped one-off: no worker/provider process and no public ports.
        # The image's exact source and contract capability have already matched.
        cfg = self.configuration(DIRECTORY)
        cfg['services']['api']['image'] = image
        probe_path = self.root / 'probe-compose.json'
        # This file is transient but deliberately retained on interruption and
        # included in the bounded encrypted operational archive.
        self.cleanup_probe()
        readers.update_durable(probe_path, frozen(cfg))
        # Persist the exact name/config/source BEFORE Docker can create a
        # one-off. The random nonce distinguishes it from every service/run.
        nonce = os.urandom(16).hex()
        record = {'version': self.daily.FUNDED_PROBE_VERSION,
                  'sourceCommit': self.request['sourceCommit'],
                  'bundleSha256': self.request['bundleSha256'],
                  'name': upgrade.PROJECT + '-funded-probe-' + nonce,
                  'imageId': image, 'composeSha256': sha(fence.original(probe_path)),
                  'state': 'pending', 'containerId': None}
        readers.update_durable(self.root / 'probe.json', encoded(record))
        try:
            result = upgrade.run(
                upgrade.compose(probe_path)
                + ['run', '-T', '--rm', '--no-deps', '--pull', 'never',
                   '--name', record['name'], '--label',
                   'com.alterward.funded-probe=' + probe_identity(record),
                   '--entrypoint', 'node', 'api', *PROBE_COMMAND],
                input=encoded(data), timeout=200,
            )
        finally:
            # Timeout/SIGTERM are cleaned here. SIGKILL retains the durable
            # intent for explicit cleanup/recovery under the same two locks.
            self.cleanup_probe()
        return json.loads(result.stdout)

    def probe(self, image, mode, expected=None):
        if mode not in {'capture', 'migrate'}:
            raise ValueError('Fixed funded database mode required')
        participants = json.loads(fence.original(DIRECTORY / 'personal-beta' / 'terms.json'))['participants']
        value = self.raw_probe(image, {'mode': mode, 'participants': participants, 'expected': expected})
        exact(
            value,
            {
                'version',
                'schema',
                'identityBindingSha256',
                'dataSha256',
                'artifactSha256',
                'catalogSha256',
                'policiesSha256',
                'drained',
                'providerApiCalls',
            },
        )
        if (
            value['version'] != 'alterward-funded-runtime-1'
            or value['providerApiCalls'] != 0
            or value['drained'] is not True
        ):
            raise ValueError('Actual drained database capability proof required')
        return value

    def cleanup_probe(self):
        self.archive_support()
        capability = self.cleanup_capability()
        record = self.daily.funded_probe_state(self.root)
        if record is None:
            return {**capability, 'probeRemoved': False, 'paidAiCalls': 0}
        if (record['sourceCommit'] != self.request['sourceCommit']
                or record['bundleSha256'] != self.request['bundleSha256']
                or not re.fullmatch(re.escape(upgrade.PROJECT) + r'-funded-probe-[a-f0-9]{32}', record['name'])
                or sha(fence.original(self.root / 'probe-compose.json')) != record['composeSha256']):
            raise ValueError('Exact original funded probe evidence required')
        def lookup():
            ids = upgrade.docker('ps', '-aq', '--no-trunc', '--filter',
                                 'name=^/' + record['name'] + '$').stdout.decode().split()
            if len(ids) > 1 or any(not DIGEST.fullmatch(i) for i in ids):
                raise ValueError('Ambiguous funded probe identity')
            return ids
        ids = lookup()
        removed = None
        if ids:
            value = json.loads(upgrade.docker('inspect', ids[0]).stdout)[0]
            labels, config, host = value['Config'].get('Labels', {}), value['Config'], value['HostConfig']
            if (record['state'] != 'pending' or value['Id'] != ids[0]
                    or value['Name'] != '/' + record['name'] or value['Image'] != record['imageId']
                    or labels.get('com.alterward.funded-probe') != probe_identity(record)
                    or labels.get('com.docker.compose.project') != upgrade.PROJECT
                    or labels.get('com.docker.compose.service') != 'api'
                    or labels.get('com.docker.compose.oneoff') != 'True'
                    or config.get('Entrypoint') != ['node'] or config.get('Cmd') != PROBE_COMMAND
                    or config.get('User') != 'node' or not host.get('AutoRemove')
                    or host.get('RestartPolicy', {}).get('Name') != 'no'
                    or host.get('Privileged') or host.get('PortBindings')):
                raise ValueError('Funded probe identity differs; no container changed')
            # Use the inspected immutable ID, never a name/project-wide rm.
            upgrade.docker('rm', '--force', ids[0], check=False, timeout=45)
            if lookup():
                raise ValueError('Funded probe removal unverified')
            removed = ids[0]
        if record['state'] == 'pending':
            readers.update_durable(self.root / 'probe.json', encoded(
                {**record, 'state': 'cleaned', 'containerId': removed}))
        return {**capability, 'probeRemoved': removed is not None, 'probeContainerId': removed,
                'applicationContainersChanged': False, 'paidAiCalls': 0}

    def capability_input_hashes(self):
        # Original image upgrades accept ONLY the complete committed bundle.
        return {sha(encoded(self.request['sourceHashes']))}

    def cleanup_capability(self):
        self.archive_support()
        record = self.daily.funded_capability_state(self.root)
        result = {'capabilityRemoved': False, 'capabilityContainerId': None}
        if record is None:
            return result
        if (record['sourceCommit'] != self.request['sourceCommit']
                or record['bundleSha256'] != self.request['bundleSha256']
                or record['inputSha256'] not in self.capability_input_hashes()
                or record['commandSha256'] != sha(encoded(CAPABILITY_COMMAND))
                or not re.fullmatch(re.escape(upgrade.PROJECT) + r'-funded-capability-[a-f0-9]{32}', record['name'])):
            raise ValueError('Exact original funded capability evidence required')
        def lookup():
            ids = upgrade.docker('ps', '-aq', '--no-trunc', '--filter',
                                 'name=^/' + record['name'] + '$').stdout.decode().split()
            if len(ids) > 1 or any(not DIGEST.fullmatch(i) for i in ids):
                raise ValueError('Ambiguous funded capability identity')
            return ids
        ids = lookup()
        if ids:
            value = json.loads(upgrade.docker('inspect', ids[0]).stdout)[0]
            config, host = value['Config'], value['HostConfig']
            if (record['state'] != 'pending' or value['Id'] != ids[0]
                    or value['Name'] != '/' + record['name'] or value['Image'] != record['imageId']
                    or (record['containerId'] is not None and record['containerId'] != ids[0])
                    or config.get('Labels', {}).get('com.alterward.funded-capability') != probe_identity(record)
                    or config.get('Entrypoint') != ['node'] or config.get('Cmd') != CAPABILITY_COMMAND
                    or config.get('User') != 'node' or config.get('WorkingDir') != '/app'
                    or not host.get('AutoRemove') or not host.get('ReadonlyRootfs')
                    or host.get('NetworkMode') != 'none' or host.get('Privileged') or host.get('PortBindings')
                    or host.get('Binds') or host.get('Mounts')
                    or host.get('RestartPolicy', {}).get('Name') != 'no'
                    or host.get('Memory') != 512 * 1024**2 or host.get('NanoCpus') != 1000000000
                    or host.get('PidsLimit') != 128 or host.get('CapDrop') != ['ALL']
                    or 'no-new-privileges:true' not in host.get('SecurityOpt', [])):
                raise ValueError('Funded capability identity differs; no container changed')
            # Persist the observed immutable ID before removing this exact helper.
            record = {**record, 'containerId': ids[0]}
            readers.update_durable(self.root / 'capability.json', encoded(record))
            upgrade.docker('rm', '--force', ids[0], timeout=45)
            if lookup():
                raise ValueError('Funded capability removal unverified')
            result = {'capabilityRemoved': True, 'capabilityContainerId': ids[0]}
        if record['state'] == 'pending':
            readers.update_durable(self.root / 'capability.json', encoded({**record, 'state': 'cleaned'}))
        return result

    def capability(self, image, hashes):
        if sha(encoded(hashes)) not in self.capability_input_hashes():
            raise ValueError('Exact committed capability input required before creation')
        self.cleanup_capability()
        record = {'version': self.daily.FUNDED_CAPABILITY_VERSION,
                  'sourceCommit': self.request['sourceCommit'], 'bundleSha256': self.request['bundleSha256'],
                  'name': upgrade.PROJECT + '-funded-capability-' + os.urandom(16).hex(),
                  'imageId': image, 'commandSha256': sha(encoded(CAPABILITY_COMMAND)),
                  'inputSha256': sha(encoded(hashes)), 'state': 'pending', 'containerId': None}
        readers.update_durable(self.root / 'capability.json', encoded(record))
        try:
            return upgrade.run(['docker', 'run', '--rm', '-i', '--pull', 'never',
                '--name', record['name'], '--label', 'com.alterward.funded-capability=' + probe_identity(record),
                '--network', 'none', '--user', 'node', '--read-only', '--cap-drop', 'ALL',
                '--security-opt', 'no-new-privileges:true', '--memory', '512m', '--cpus', '1',
                '--pids-limit', '128', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
                '--entrypoint', 'node', image, *CAPABILITY_COMMAND], input=encoded(hashes), timeout=60)
        finally:
            self.cleanup_capability()

    def image(self, build):
        exact(build, {'commit', 'imageId', 'imageTag', 'sourceDirectory'})
        if (
            build['commit'] != self.request['sourceCommit']
            or not IMAGE.fullmatch(build['imageId'])
            or not re.fullmatch(r'alterward:contabo-[a-f0-9]{12}', build['imageTag'])
        ):
            raise ValueError('Exact reviewed funded image source required')
        value = json.loads(upgrade.docker('image', 'inspect', build['imageId']).stdout)[
            0
        ]
        tag = json.loads(upgrade.docker('image', 'inspect', build['imageTag']).stdout)[
            0
        ]
        if (
            value['Id'] != tag['Id']
            or value['Id'] != build['imageId']
            or value['Config']['User'] != 'node'
            or value['Config'].get('WorkingDir') != '/app'
            or value['Config'].get('Entrypoint') != ['docker-entrypoint.sh']
        ):
            raise ValueError('Immutable cached image digest mismatch')
        source = Path(build['sourceDirectory'])
        from alterward_backup import confined, ROOT

        confined(ROOT, source)
        if source.resolve() != source or not source.is_dir():
            raise ValueError('Exact cached build source required')
        hashes = self.request['sourceHashes']
        for path, digest in hashes.items():
            target = source / path
            if (
                target.resolve() != target
                or target.is_symlink()
                or not target.is_file()
                or target.lstat().st_nlink != 1
                or sha(target.read_bytes()) != digest
            ):
                raise ValueError('Build source differs from reviewed Git bundle')
        # Compare files INSIDE the actual image before importing any capability
        # implementation. The image digest alone is not a self-declared version.
        result = self.capability(build['imageId'], hashes)
        capability = json.loads(result.stdout)
        if (
            capability.get('version') != 'alterward-funded-runtime-1'
            or capability.get('schema') != 39
            or len(capability.get('policies', [])) != 19
            or 'fiction-v9' not in capability.get('policies', [])
            or capability.get('characterStateVersion') != '1.0.0'
            or capability.get('fictionArtifactVersion') != '2.0.0'
            or capability.get('fictionV9Policy', {}).get('qualityPolicyVersion') != '2.8.0'
            or capability.get('reviewedPolicy', {}).get('maxPhysicalRequests') != 8
        ):
            raise ValueError(
                'Schema/prompt/artifact compatible image required before mutation'
            )
        return sha(encoded(capability))

    def capabilities(self, candidate):
        for role in ('target', 'recovery'):
            if (
                self.image(candidate['release'][role])
                != candidate['release'][role + 'CapabilitySha256']
            ):
                raise ValueError('Runtime/recovery capability changed')

    def build_files(self, role, build, baseline):
        path = self.root / role
        from alterward_backup import private_directory

        private_directory(path)
        old = self.files(DIRECTORY)
        readers.durable_file(
            path / 'server.env',
            narrative_environment(upgrade.image_only_environment(
                old['server.env'].decode(), build['imageTag']
            ), self.request['release'].get('runtime')).encode(),
        )
        readers.durable_file(
            path / 'pinned-image.json',
            encoded(
                {
                    'services': {
                        r: {'image': build['imageId'], 'pull_policy': 'never'}
                        for r in ('web', 'api', 'worker')
                    }
                }
            ),
        )
        source = Path(build['sourceDirectory'])
        rendered = json.loads(
            upgrade.run(
                [
                    'docker',
                    'compose',
                    '--project-name',
                    upgrade.PROJECT,
                    '--env-file',
                    str(path / 'server.env'),
                    '-f',
                    str(source / 'deploy/compose.contabo.yaml'),
                    '-f',
                    str(path / 'pinned-image.json'),
                    'config',
                    '--format',
                    'json',
                ]
            ).stdout
        )
        original = self.configuration(DIRECTORY)

        runtime = self.request['release'].get('runtime')
        if normalized_configuration(rendered) != normalized_configuration(original, runtime):
            raise ValueError('Only reviewed image and explicit narrative configuration may change')
        self.daily.personal_runtime_policy(
            {k: v['environment'] for k, v in rendered['services'].items()}, self.now()
        )
        readers.durable_file(path / 'effective-compose.json', frozen(rendered))
        manifest = json.loads(old['manifest.json'])
        manifest.update(
            commit=build['commit'],
            imageId=build['imageId'],
            ownerEnvironmentSha256=sha(fence.original(path / 'server.env')),
            effectiveComposeSha256=sha(frozen(rendered)),
            sourceComposeSha256=upgrade.source_hash(source),
        )
        readers.durable_file(path / 'manifest.json', encoded(manifest))
        return self.hashes(path)

    def archive_support(self):
        if getattr(self.daily, 'FUNDED_UPGRADE_ARCHIVE_POLICY_VERSION', None) != 4:
            raise ValueError(
                'Reviewed installed funded-upgrade archive support required'
            )
        installed = self.daily.config()
        paths = {
            'contabo-daily.py': 'scripts/ops/contabo-daily.py',
            'backup_lib.py': 'scripts/ops/contabo-backup.py',
            'daily_entry.py': 'scripts/ops/contabo-daily-entry.py',
        }
        if installed['sourceCommit'] != self.request['sourceCommit'] or installed[
            'scriptHashes'
        ] != {name: self.request['sourceHashes'][path] for name, path in paths.items()}:
            raise ValueError(
                'Installed Daily differs from exact reviewed upgrade source'
            )
        return installed

    def prepare(self):
        self.archive_support()
        if self.root.exists() or self.root.is_symlink():
            raise ValueError(
                'Existing funded-upgrade evidence requires explicit inspection'
            )
        before = self.baseline()
        from alterward_backup import private_directory

        release = copy.deepcopy(self.request['release'])
        exact(
            release,
            ({'runtime'} if 'runtime' in release else set()) | {
                'target',
                'recovery',
                'auditSha256',
                'fixtureSha256',
                'privacyFixtureSha256',
                'ciSha256',
            },
        )
        if any(
            not isinstance(release[k], str) or not DIGEST.fullmatch(release[k])
            for k in (
                'auditSha256',
                'fixtureSha256',
                'privacyFixtureSha256',
                'ciSha256',
            )
        ):
            raise ValueError(
                'Exact interpreted source/CI/fixture evidence hashes required'
            )
        if 'runtime' in release:
            narrative_environment(self.files(DIRECTORY)['server.env'].decode(), release['runtime'])
        # Invalid selections must not leave a preparation that blocks Daily or recovery.
        private_directory(self.root)
        for role in ('target', 'recovery'):
            release[role + 'CapabilitySha256'] = self.image(release[role])
        database = self.probe(release['target']['imageId'], 'capture')
        now = self.now()
        value = {
            'version': VERSION,
            'sourceCommit': self.request['sourceCommit'],
            'bundleSha256': self.request['bundleSha256'],
            'preparedAt': now.isoformat(),
            'expiresAt': (now + dt.timedelta(seconds=900)).isoformat(),
            'baseline': before,
            'release': release,
            'files': {},
            'database': database,
        }
        for role in ('target', 'recovery'):
            value['files'][role] = self.build_files(role, release[role], before)
        # Compare BEFORE the candidate becomes durable: a drifting baseline must
        # not leave a valid-looking prepared.json that blocks every later prepare.
        if self.baseline() != before:
            raise ValueError('Serving baseline changed during preparation')
        readers.durable_file(self.root / 'prepared.json', encoded(value))
        return {
            'preparedSha256': sha(encoded(value)),
            'expiresAt': value['expiresAt'],
            'preparedOnly': True,
            'databaseWrites': 0,
            'paidAiCalls': 0,
        }

    def archive_expired(self):
        # No Docker start/stop, database probe, migration or authority mutation.
        self.archive_support()
        digest = self.request['preparedSha256']
        if not isinstance(digest, str) or not DIGEST.fullmatch(digest):
            raise ValueError('Exact preparation identity required')
        archive = DIRECTORY / self.daily.FUNDED_ARCHIVE_NAME
        destination = archive / digest
        self.daily.funded_archived_paths()
        if destination.exists() or destination.is_symlink():
            if self.root.exists() or self.root.is_symlink():
                raise ValueError('Conflicting active and archived preparation')
            candidate, receipt = self.daily.validate_funded_archive(destination)
            if self.baseline(require_active=False) != candidate['baseline']:
                raise ValueError('Funded baseline changed since archive')
            readers.sync_directory(archive)
            readers.sync_directory(DIRECTORY)
            return self.archive_result(digest, receipt, True)
        files = self.daily.funded_unapplied_files(self.root)
        candidate = json.loads(fence.original(self.root / 'prepared.json'))
        fresh(candidate, stamp(candidate['preparedAt']))
        if sha(encoded(candidate)) != digest or self.now() < stamp(candidate['expiresAt']):
            raise ValueError('Only an expired exact preparation may be archived')
        for role in ('target', 'recovery'):
            if self.hashes(self.root / role) != candidate['files'][role]:
                raise ValueError('Prepared runtime changed before archive')
        if self.baseline(require_active=False) != candidate['baseline']:
            raise ValueError('Original funded baseline must still be serving')
        intent = self.root / 'archive.json'
        if intent.exists() or intent.is_symlink():
            _, receipt = self.daily.validate_funded_archive(self.root)
        else:
            receipt = {'version': self.daily.FUNDED_ARCHIVE_VERSION,
                       'preparedSha256': digest, 'preparedSourceCommit': candidate['sourceCommit'],
                       'archiverSourceCommit': self.request['sourceCommit'], 'archivedAt': self.now().isoformat(),
                       'baselineSha256': sha(encoded(candidate['baseline'])), 'files': files}
        if not archive.exists() and not archive.is_symlink():
            archive.mkdir(mode=0o700)
        self.daily.private_archive_directory(archive)
        if len(list(archive.iterdir())) >= self.daily.FUNDED_ARCHIVE_LIMIT:
            raise ValueError('Funded archive limit reached; no automatic deletion')
        readers.durable_file(intent, encoded(receipt))
        self.daily.validate_funded_archive(self.root)
        if self.baseline(require_active=False) != candidate['baseline']:
            raise ValueError('Funded baseline drift before archive move')
        os.rename(self.root, destination)
        readers.sync_directory(archive)
        readers.sync_directory(DIRECTORY)
        self.daily.validate_funded_archive(destination)
        if self.baseline(require_active=False) != candidate['baseline']:
            raise ValueError('Funded baseline drift after archive move')
        return self.archive_result(digest, receipt, False)

    def archive_result(self, digest, receipt, repeated):
        return {'version': self.daily.FUNDED_ARCHIVE_VERSION, 'preparedSha256': digest,
                'archived': True, 'alreadyArchived': repeated,
                'archivedFiles': len(receipt['files']), 'paidAiCalls': 0, 'databaseWrites': 0,
                'containersStarted': 0, 'containersStopped': 0, 'authorityChanged': False}

    def candidate(self):
        if (self.root / 'archive.json').exists() or (self.root / 'archive.json').is_symlink():
            raise ValueError('Archiving intent cannot be applied or recovered')
        value = json.loads(fence.original(self.root / 'prepared.json'))
        if sha(encoded(value)) != self.request['preparedSha256']:
            raise ValueError('Altered funded candidate rejected')
        if (
            value['sourceCommit'] != self.request['sourceCommit']
            or value['bundleSha256'] != self.request['bundleSha256']
        ):
            raise ValueError('Exact prepared source/helper bundle required')
        expected = {
            k: v
            for k, v in value['release'].items()
            if not k.endswith('CapabilitySha256')
        }
        if self.request.get('release') != expected:
            raise ValueError('Current reviewed release differs from prepared evidence')
        return value

    def journal(self, candidate=None):
        value = json.loads(fence.original(self.root / 'journal.json'))
        exact(value, {'version', 'preparedSha256', 'states'})
        if (
            value['version'] != VERSION
            or not isinstance(value['states'], list)
            or not 1 <= len(value['states']) <= 32
        ):
            raise ValueError('Bounded funded journal required')
        if candidate is not None and value['preparedSha256'] != sha(encoded(candidate)):
            raise ValueError('Journal candidate binding changed')
        previous = None
        known = {
            'apply-intent',
            'recovery-intent',
            'held',
            'migration-intent',
            'schema-038',
            'staged',
            'verified-staged',
            'exposure-intent',
            'applied',
            'recovered',
            'closed',
            'stop-unverified',
            'watchdog-stop-intent',
        }
        for row in value['states']:
            exact(row, {'state', 'changedAt', 'previousSha256', 'sha256'})
            body = {k: v for k, v in row.items() if k != 'sha256'}
            if (
                row['state'] not in known
                or row['previousSha256'] != previous
                or sha(encoded(body)) != row['sha256']
            ):
                raise ValueError('Funded journal chain changed')
            stamp(row['changedAt'])
            previous = row['sha256']
        return value

    def preflight(self, candidate, *, recovery=False):
        if not recovery:
            fresh(candidate, self.now())
            if (self.root / 'journal.json').exists():
                raise ValueError(
                    'Prior attempt cannot be replayed; explicit recovery required'
                )
            if self.baseline() != candidate['baseline']:
                raise ValueError('Active funded baseline drift')
        else:
            journal = self.journal(candidate)
            if journal['states'][-1]['state'] in {'applied', 'recovered'}:
                raise ValueError('Explicit incomplete funded transition required')
            # Root files can be a partial promotion, never an unrelated new right.
            for name in FILES:
                current = fence.original(DIRECTORY / name)
                choices = [fence.original(DIRECTORY / 'personal-beta' / name)] + [
                    fence.original(self.root / r / name) for r in ('target', 'recovery')
                ]
                if current not in choices:
                    raise ValueError('Unrelated runtime drift; keep closed')
            for path, digest in candidate['baseline']['authority'].items():
                if sha(fence.original(Path(path))) != digest:
                    raise ValueError('Original funded authority changed')
        self.access(candidate['baseline']['accessConfigurationSha256'])
        for role in ('target', 'recovery'):
            if self.hashes(self.root / role) != candidate['files'][role]:
                raise ValueError('Prepared runtime files altered')
        if (
            upgrade.proxy_network() != candidate['baseline']['proxyNetwork']
            or upgrade.foreign_state() != candidate['baseline']['foreign']
        ):
            raise ValueError('Foreign/proxy identity drift')
        self.capabilities(candidate)
        # Recheck before any stop/migration; unsupported active work is rejected.
        same_funded(
            candidate['database'],
            self.probe(candidate['release']['target']['imageId'], 'capture'),
        )
        self.backup(candidate)

    def record(self, state, candidate):
        path = self.root / 'journal.json'
        value = (
            self.journal(candidate)
            if path.exists()
            else {
                'version': VERSION,
                'preparedSha256': sha(encoded(candidate)),
                'states': [],
            }
        )
        if len(value['states']) >= 32:
            raise ValueError('Journal requires scoped inspection; no evidence deletion')
        row = {
            'state': state,
            'changedAt': self.now().isoformat(),
            'previousSha256': (
                value['states'][-1]['sha256'] if value['states'] else None
            ),
        }
        row['sha256'] = sha(encoded(row))
        value['states'].append(row)
        readers.update_durable(path, encoded(value))

    def begin_guard(self, candidate):
        from alterward_funded_watchdog import Watchdog

        self.watchdog = Watchdog(self, candidate)

    def finish_guard(self):
        self.watchdog.finish()

    def restore_restart_policy(self):
        values = self.roles()
        for v in values.values():
            upgrade.docker('update', '--restart', 'unless-stopped', v['Id'])
        if any(
            v['HostConfig']['RestartPolicy']['Name'] != 'unless-stopped'
            for v in self.roles().values()
        ):
            raise ValueError('Original restart policy not restored')

    def stop(self):
        # Validate the exact three roles first, then stop immutable IDs only.
        values = self.roles(stopping=True)
        errors = []
        for value in values.values():
            result = upgrade.docker(
                'stop', '--time', '30', value['Id'], check=False, timeout=45
            )
            if result.returncode:
                errors.append(value['Id'])
        after = json.loads(
            upgrade.docker('inspect', *[v['Id'] for v in values.values()]).stdout
        )
        if errors or any(v['State']['Running'] for v in after):
            raise ValueError('Scoped funded stop unverified')

    def held(self, candidate):
        values = json.loads(upgrade.docker('inspect', *upgrade.project_ids()).stdout)
        if len(values) != 3 or any(v['State']['Running'] for v in values):
            raise ValueError('Actual three-service writer hold required')
        if upgrade.foreign_state() != candidate['baseline']['foreign']:
            raise ValueError('Foreign workload drift under hold')
        same_funded(
            candidate['database'],
            self.probe(candidate['release']['target']['imageId'], 'capture'),
        )

    def backup(self, candidate):
        self.archive_support()
        # Reuse the actual installed-source ciphertext/offsite/restore gate. It
        # also checks our new finite candidate files, excluding mutable journals.
        beta.require_restored_preparation(self.daily, stamp(candidate['preparedAt']))
        proof = json.loads(
            self.daily.regular(self.daily.ROOT / 'status' / 'restore.json')
        )
        records = self.daily.completed_archives(self.daily.ROOT / 'backups')
        record = next(
            (
                r['manifest']
                for r in records
                if r['manifest']['runId'] == proof['runId']
            ),
            None,
        )
        if record is None:
            raise ValueError('Exact funded candidate archive required')
        for path in self.daily.funded_upgrade_config_paths(immutable_only=True):
            if record['configFiles'].get(str(path).lstrip('/')) != sha(
                fence.original(path)
            ):
                raise ValueError(
                    'Restore proof does not cover exact funded candidate bytes'
                )
        # A separate image/source-bound actual restore/privacy fixture is part
        # of the reviewed release package. An old generic backup flag is not it.
        evidence = self.request['restoreProof']
        exact(
            evidence,
            {
                'sourceCommit',
                'preparedSha256',
                'runId',
                'targetImage',
                'recoveryImage',
                'privacyFixtureSha256',
            },
        )
        if (
            evidence['sourceCommit'] != candidate['sourceCommit']
            or evidence['preparedSha256'] != sha(encoded(candidate))
            or evidence['runId'] != proof['runId']
            or evidence['targetImage'] != candidate['release']['target']['imageId']
            or evidence['recoveryImage'] != candidate['release']['recovery']['imageId']
            or evidence['privacyFixtureSha256']
            != candidate['release']['privacyFixtureSha256']
        ):
            raise ValueError('Candidate-bound privacy/runtime restore proof required')

    def migrate(self, candidate):
        current = self.probe(candidate['release']['target']['imageId'], 'capture')
        same_funded(candidate['database'], current)
        result = self.probe(
            candidate['release']['target']['imageId'], 'migrate', current
        )
        same_funded(candidate['database'], result)
        if result['schema'] != 39:
            raise ValueError('Reviewed 039 catalog required')

    def stage(self, candidate, *, recovery=False):
        role = 'recovery' if recovery else 'target'
        cfg = self.root / role / 'effective-compose.json'
        self.active_path = self.root / role
        upgrade.run(
            upgrade.compose(cfg)
            + [
                'create',
                '--no-build',
                '--pull',
                'never',
                '--force-recreate',
                'web',
                'api',
                'worker',
            ],
            timeout=90,
        )
        ids = self.roles()
        for v in ids.values():
            upgrade.docker('update', '--restart', 'no', v['Id'])
        self.watchdog.update()  # before the first start; SIGKILL cannot strand it
        network = upgrade.docker(
            'network', 'inspect', self.staging_network, check=False
        )
        if network.returncode:
            upgrade.docker(
                'network',
                'create',
                '--label',
                'com.alterward.funded-check=' + candidate['sourceCommit'],
                self.staging_network,
            )
        self.network_guard(candidate)
        for role in ('api', 'web'):
            item = ids[role]
            if item['State']['Running']:
                raise ValueError('Staging must attach held containers only')
            # No service is started while connected to the real ingress.
            upgrade.docker('network', 'disconnect', upgrade.NETWORK, item['Id'])
            upgrade.docker(
                'network',
                'connect',
                '--alias',
                'alterward-' + role,
                '--alias',
                role,
                self.staging_network,
                item['Id'],
            )
        for role in ('api', 'web'):
            upgrade.docker('start', ids[role]['Id'])
        until = time.monotonic() + 120
        while time.monotonic() < until:
            items = self.roles()
            if all(
                items[r]['State'].get('Health', {}).get('Status') == 'healthy'
                for r in ('web', 'api')
            ):
                break
            time.sleep(1)
        else:
            raise ValueError('Isolated candidate health failed')

    def roles(self, *, stopping=False):
        ids = upgrade.project_ids()
        values = json.loads(upgrade.docker('inspect', *ids).stdout) if ids else []
        result = {}
        for v in values:
            labels = v['Config'].get('Labels', {})
            if labels.get('com.docker.compose.project') != upgrade.PROJECT:
                raise ValueError('Exact owned project required')
            # Stop-first recovery must not depend on probe cleanup succeeding.
            # This exception permits ONLY stopping the three regular services;
            # serving/staging/hold/readback still reject every extra member.
            if stopping and labels.get('com.docker.compose.oneoff') == 'True':
                continue
            role = labels.get('com.docker.compose.service')
            if (
                v['Config'].get('Labels', {}).get('com.docker.compose.project')
                != upgrade.PROJECT
                or role not in {'web', 'api', 'worker'}
                or role in result
            ):
                raise ValueError('Exact owned service identities required')
            result[role] = v
        if set(result) != {'web', 'api', 'worker'}:
            raise ValueError('Exactly three owned services required')
        return result

    def network_guard(self, candidate):
        info = json.loads(
            upgrade.docker('network', 'inspect', self.staging_network).stdout
        )[0]
        if (
            info['Driver'] != 'bridge'
            or info.get('Labels', {}).get('com.alterward.funded-check')
            != candidate['sourceCommit']
            or set(info['Containers']) - set(upgrade.project_ids())
        ):
            raise ValueError('Private staging network contains a foreign workload')

    def postcheck(self, candidate, *, recovery=False):
        roles = self.roles()
        if any(
            v['HostConfig']['RestartPolicy']['Name'] != 'no' for v in roles.values()
        ):
            raise ValueError('Uncommitted runtime cannot auto-restart after a reboot')
        if roles['worker']['State']['Running']:
            raise ValueError('Worker exposure precedes post-check')
        self.network_guard(candidate)
        for role in ('web', 'api'):
            if set(roles[role]['NetworkSettings']['Networks']) != {
                self.staging_network
            }:
                raise ValueError('Candidate exposed before validation')
        cfg = self.configuration(self.active_path)
        expected = candidate['release']['recovery' if recovery else 'target']['imageId']
        from alterward_activation import validate_staged_running

        validate_staged_running(list(roles.values()), cfg, expected)
        for name, item in roles.items():
            if item['Config'].get('Entrypoint') != ['docker-entrypoint.sh']:
                raise ValueError('Unexpected runtime entrypoint')
            actual_env = dict(entry.split('=', 1) for entry in item['Config']['Env'])
            if name != 'worker' and (
                actual_env.get('OPENAI_API_KEY') or actual_env.get('ANTHROPIC_API_KEY')
            ):
                raise ValueError('Provider credential outside worker')
            if item['Config']['Cmd'] != cfg['services'][name]['command']:
                raise ValueError('Actual runtime command differs')
        checks = json.loads(
            upgrade.docker(
                'exec',
                roles['api']['Id'],
                'node',
                '--input-type=module',
                '-e',
                upgrade.ORIGIN_PROBE,
            ).stdout
        )
        if checks.get('anonymousDenied') != 4:
            raise ValueError('Candidate origin boundary incomplete')
        after = self.probe(expected, 'capture')
        same_funded(candidate['database'], after)
        if (
            after['schema'] != 39
            or upgrade.foreign_state() != candidate['baseline']['foreign']
        ):
            raise ValueError('Funded staged state changed')

    def promote(self, candidate, *, recovery=False):
        path = self.root / ('recovery' if recovery else 'target')
        for name, data in self.files(path).items():
            upgrade.atomic_private(DIRECTORY / name, data)
        if (
            self.hashes(DIRECTORY)
            != candidate['files']['recovery' if recovery else 'target']
        ):
            raise ValueError('Partial runtime promotion')

    def expose(self, candidate, *, recovery=False):
        self.network_guard(candidate)
        roles = self.roles()
        for role in ('api', 'web'):
            # Prechecked exact aliases from the unchanged frozen network shape.
            aliases = self.configuration(self.active_path)['services'][role][
                'networks'
            ]['proxy'].get('aliases', [])
            args = ['network', 'connect']
            for alias in aliases:
                args += ['--alias', alias]
            upgrade.docker(*args, upgrade.NETWORK, roles[role]['Id'])
            upgrade.docker(
                'network', 'disconnect', self.staging_network, roles[role]['Id']
            )
        upgrade.docker('network', 'rm', self.staging_network)
        upgrade.docker('start', roles['worker']['Id'])

    def readback(self, candidate, *, recovery=False):
        role = 'recovery' if recovery else 'target'
        cfg = self.configuration(DIRECTORY)
        context = {
            'proxyNetwork': candidate['baseline']['proxyNetwork'],
            'foreignContainers': candidate['baseline']['foreign'],
        }
        result = upgrade.verify_release(
            DIRECTORY, cfg, candidate['release'][role]['imageId'], context
        )
        if result.get('existingForeignContainersUnchanged') is not True:
            raise ValueError('Foreign workload changed')
        after = self.probe(candidate['release'][role]['imageId'], 'capture')
        same_funded(candidate['database'], after)
        proof = {
            'version': VERSION,
            'preparedSha256': sha(encoded(candidate)),
            'sourceCommit': candidate['sourceCommit'],
            'imageId': candidate['release'][role]['imageId'],
            'schema': 39,
            'fundedStateSha256': sha(encoded(after)),
            'protectedDataUnchanged': True,
            'paidAiCalls': 0,
            'operationPaidAiCalls': 0,
            'databaseRestored': False,
        }
        readers.update_durable(self.root / 'readback.json', encoded(proof))
        return proof


def main(request):
    base = {'mode', 'sourceCommit', 'bundleSha256', 'sourceHashes'}
    mode = request.get('mode')
    additions = {
        'inspect': set(),
        'active-proof': set(),
        'cleanup-probe': set(),
        'archive-expired': {'preparedSha256', 'accessSnapshot'},
        'prepare': {'release', 'accessSnapshot'},
        'apply': {'preparedSha256', 'restoreProof', 'release', 'accessSnapshot'},
        'recover': {'preparedSha256', 'restoreProof', 'release', 'accessSnapshot'},
    }
    if mode not in additions:
        raise ValueError('Explicit funded-upgrade mode required')
    exact(request, base | additions[mode])
    if (
        os.geteuid() != 0
        or not COMMIT.fullmatch(request['sourceCommit'])
        or not DIGEST.fullmatch(request['bundleSha256'])
    ):
        raise ValueError('Root and exact source/helper hashes required')
    for lock in (fence.DAILY / 'job.lock', DIRECTORY / 'activation.lock'):
        fence.original(lock)
    with (fence.DAILY / 'job.lock').open('rb') as daily_lock, (
        DIRECTORY / 'activation.lock'
    ).open('rb') as owner_lock:
        readers.exclusive_lock(daily_lock, 0)
        readers.exclusive_lock(owner_lock, 0)
        daily = fence.installed_daily()
        system = System(request, daily)
        if mode == 'active-proof':
            return system.active_proof()
        if mode == 'inspect':
            journal = system.root / 'journal.json'
            return {
                'version': VERSION,
                'fundedUpgradePresent': system.root.exists(),
                'journalState': (
                    system.journal()['states'][-1]['state']
                    if journal.exists()
                    else None
                ),
                'baselineSha256': None,
                'externalAccessChecked': False,
                'databaseWrites': 0,
                'paidAiCalls': 0,
                'containersStarted': 0,
            }
        if mode == 'cleanup-probe':
            return system.cleanup_probe()
        if mode == 'archive-expired':
            return system.archive_expired()
        if mode == 'prepare':
            return system.prepare()
        candidate = system.candidate()
        if mode == 'recover':
            # A previous SIGKILL may have happened during ingress exposure. Stop
            # only our bound services BEFORE checking a possibly invalid recovery
            # capability. Failed recovery validation must still leave them held.
            journal = system.journal(candidate)
            if journal['states'][-1]['state'] in {'applied', 'recovered'}:
                raise ValueError('Only incomplete exact transition can be recovered')
            for number in upgrade.INTERRUPTION_SIGNALS:
                signal.signal(number, signal.SIG_IGN)
            for attempt in range(3):
                try:
                    system.stop()
                    break
                except ValueError:
                    if attempt == 2:
                        raise
        system.cleanup_probe()
        return transition(system, candidate, recovery=mode == 'recover')
