"""Shared isolated root/Docker/PostgreSQL funded transition rehearsal.

Host/project/source-render/systemd installation and Access API identity are
explicit synthetic seams. Files, permissions, locks, image source capabilities,
Docker stop/create/network/exposure, death watch, PostgreSQL catalog/migration/
accounting, encrypted offsite copy and physical restore are actual operations.
No provider process executes. All resources have nonce-owned identities.
"""

import copy
import datetime as dt
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[2]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, REPO / 'scripts/ops' / file)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


for name, file in [
    ('alterward_backup', 'contabo-backup.py'),
    ('alterward_target', 'contabo-target.py'),
    ('alterward_owner', 'contabo-owner.py'),
    ('alterward_activation', 'contabo-owner-activation.py'),
    ('alterward_upgrade', 'contabo-owner-upgrade.py'),
    ('alterward_fence', 'contabo-writer-fence.py'),
    ('alterward_readers', 'contabo-personal-beta-readers.py'),
    ('alterward_personal_beta', 'contabo-personal-beta.py'),
    ('alterward_funded_watchdog', 'contabo-funded-watchdog.py'),
]:
    load(name, file)
containers = load('alterward_fixture_containers', 'contabo-fixture-containers.py')
replay = load('alterward_funded_replay', 'contabo-funded-replay.py')
funded = load('alterward_funded_upgrade', 'contabo-funded-upgrade.py')
load('alterward_successor_transition', 'beta-successor-transition.py')
successor_fixture = load('alterward_successor_fixture', 'contabo-beta-successor-fixture.py')
daily = load('fixture_daily', 'contabo-daily.py')
upgrade = funded.upgrade
activation = sys.modules['alterward_activation']
backup = sys.modules['alterward_backup']
readers = funded.readers
sha, encoded, frozen = activation.sha, activation.encoded, activation.frozen


def run(args, data=None, timeout=180):
    try:
        return subprocess.run(
            args,
            input=data,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            timeout=timeout,
        ).stdout
    except subprocess.CalledProcessError as error:
        print(
            'Synthetic fixture subprocess: '
            + error.stderr.decode(errors='replace')[-4000:],
            file=sys.stderr,
        )
        raise


def fixture_project_ids(project):
    if not re.fullmatch(r'alterward-funded-fixture-[a-f0-9]{12}', project):
        raise ValueError('Exact nonce fixture project required')
    return upgrade.docker('ps', '-aq', '--no-trunc', '--filter',
                          'label=com.docker.compose.project=' + project).stdout.decode().split()


def preserved_containers(before, project=None, sentinel=None):
    current = upgrade.existing_state()
    if sentinel is not None:
        owned = set(fixture_project_ids(project))
        # A fixture must never hide a pre-existing owner or foreign container.
        if (owned.intersection(before) or sentinel in before or
                sentinel in owned or sentinel not in current):
            return False
        current = {key: value for key, value in current.items()
                   if key not in owned and key != sentinel}
    return current == before


def exercise(context, *, scope='ci'):
    run = globals()['run']
    if os.geteuid() != 0 or scope not in {'ci', 'image-rehearsal'}:
        raise ValueError('Explicit Linux/root isolated fixture scope required')
    if scope == 'ci' and (os.environ.get('CI') != 'true' or os.environ.get('GITHUB_ACTIONS') != 'true'):
        raise ValueError('Actual CI Linux/root fixture only')
    if set(context) != {
        'image',
        'databaseNetwork',
        'postgres',
        'ca',
        'sourceCommit',
        'sourceHashes',
        'bundleSha256',
        'privacy',
    }:
        raise ValueError('Exact fixture context required')
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', context['image']) or not re.fullmatch(
        r'[a-f0-9]{40}', context['sourceCommit']
    ):
        raise ValueError('Exact CI image/source required')
    pattern = r'alterward-ci-[0-9]+-proxy' if scope == 'ci' else r'alterward-image-rehearsal-[a-f0-9]{24}'
    if not re.fullmatch(pattern, context['databaseNetwork']):
        raise ValueError('Disposable CI database network required')
    pg = json.loads(run(['docker', 'inspect', context['postgres']]))[0]
    if pg['Config']['Labels'].get('com.docker.compose.service') != 'postgres' or pg[
        'HostConfig'
    ].get('PortBindings'):
        raise ValueError('Only unpublished CI PostgreSQL accepted')
    if scope == 'image-rehearsal':
        network_info = json.loads(run(['docker', 'network', 'inspect', context['databaseNetwork']]))[0]
        if (not network_info['Internal'] or network_info.get('Labels', {}).get('com.alterward.image-rehearsal') != context['databaseNetwork'] or
                pg['Config'].get('Labels', {}).get('com.alterward.image-rehearsal') != context['databaseNetwork'] or
                set(network_info['Containers']) != {pg['Id']}):
            raise ValueError('Exact owned isolated PostgreSQL/network required')
    for key in (
        'fundedV9ReplayAndCharacterStateVerified',
        'narrativeArtifactsSurvivedPhysicalRestore',
        'legacyNullArtifactsReadable',
        'privateArtifactExcludedFromLifeDto',
        'idempotentReplay',
        'budgetNotReducedAndPaidDisabled',
    ):
        if context['privacy'].get(key) is not True:
            raise ValueError('Actual preceding PostgreSQL privacy fixture required')
    nonce = uuid.uuid4().hex[:12]
    project = 'alterward-funded-fixture-' + nonce
    parent = Path(context['ca']).parent
    prefix = 'alterward-ci-' if scope == 'ci' else 'alterward-image-rehearsal-'
    if parent.resolve() != parent or not parent.name.startswith(prefix):
        raise ValueError('Caller-owned disposable TLS scratch required')
    base = Path(tempfile.mkdtemp(prefix=project + '-', dir=parent))
    base.chmod(0o700)
    diagnostics = base / 'diagnostics'
    diagnostics.mkdir(mode=0o700)
    owner = base / 'owner'
    owner.mkdir(mode=0o700)
    ca = base / 'ca.crt'
    ca.write_bytes(Path(context['ca']).read_bytes())
    ca.chmod(0o644)
    network = project + '-proxy'
    sentinel = project + '-foreign'
    # PROJECT is patched below: include the real owner stack in this baseline.
    all_before = upgrade.existing_state()
    oldImage = None
    patches = []
    created_network = False
    createdTag = False
    createdOldTag = False
    createdBaseTag = False
    foreign_id = None
    databases = set()
    checks = {}
    successor_checks = {}
    active_system = None
    image_only_verified = False
    raw_run = run
    helpers = containers.FixtureContainers(base/'helper-intents', project,
        lambda: {context['image'], oldImage}, raw_run)
    run = helpers.wrap(raw_run)

    def private(path, data):
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        readers.update_durable(path, data)

    def sql(database, query):
        return run(
            [
                'docker',
                'exec',
                context['postgres'],
                'psql',
                '-U',
                'postgres',
                '-d',
                database,
                '-v',
                'ON_ERROR_STOP=1',
                '-At',
                '-c',
                query,
            ]
        )

    def db(mode, database, expected=None):
        command = [
            'docker',
            'run',
            '--rm',
            '--memory', '512m', '--cpus', '1', '--pids-limit', '128',
            '-i',
            '--network',
            context['databaseNetwork'],
            '--mount',
            f'type=bind,src={ca},dst=/run/secrets/supabase-ca.crt,readonly',
            '-e',
            'ALTERWARD_FUNDED_FIXTURE=true',
            '-e',
            'AI_PROJECT_BUDGET_USD=0',
            '-e',
            'AI_USER_BUDGET_USD=0',
            '-e',
            'DATABASE_SSL_CA_FILE=/run/secrets/supabase-ca.crt',
            '-e',
            'DATABASE_SSL_REJECT_UNAUTHORIZED=true',
            '-e',
            'DATABASE_URL=postgresql://postgres:ci_unused_outside_fixture@postgres:5432/postgres',
            '--entrypoint',
            'node',
            context['image'],
            '--import',
            'tsx',
            'scripts/ops/funded-upgrade-fixture-db.ts',
        ]
        return json.loads(
            run(
                command,
                encoded({'mode': mode, 'database': database, 'expected': expected}),
            )
        )

    source = base / 'source'
    source.mkdir(mode=0o700)
    for path, digest in context['sourceHashes'].items():
        raw = (REPO / path).read_bytes()
        if sha(raw) != digest:
            raise ValueError('CI source bytes differ')
        target = source / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
    try:
        run(
            [
                'docker',
                'network',
                'create',
                '--internal',
                '--label',
                'com.alterward.funded-fixture=' + project,
                network,
            ]
        )
        created_network = True
        foreign_id = (
            run(
                [
                    'docker',
                    'run',
                    '-d',
                    '--name',
                    sentinel,
                    '--network',
                    network,
                    '--entrypoint',
                    'node',
                    context['image'],
                    '-e',
                    'setInterval(()=>{},1000)',
                ]
            )
            .decode()
            .strip()
        )

        def fixture_proxy():
            actual = json.loads(run(['docker', 'network', 'inspect', network]))[0]
            if (
                not actual['Internal']
                or actual['Labels'].get('com.alterward.funded-fixture') != project
            ):
                raise ValueError('Fixture network isolation changed')
            foreign = set(actual['Containers']) - set(upgrade.project_ids())
            if foreign != {foreign_id}:
                raise ValueError('Unexpected fixture network peer')
            return {'id': actual['Id'], 'foreignMembers': sorted(foreign)}

        for module, key, value in [
            (funded, 'DIRECTORY', owner),
            (upgrade, 'DIRECTORY', owner),
            (upgrade, 'PROJECT', project),
            (upgrade, 'NETWORK', network),
            (upgrade, 'CA', ca),
            (activation, 'DIRECTORY', owner),
            (activation, 'PROJECT', project),
            (activation, 'CA', ca),
            (readers, 'DIRECTORY', owner),
            (readers, 'PROJECT', project),
            (daily, 'OWNER', owner),
            (replay, 'PROJECT', project),
            (backup, 'ROOT', base),
            (sys.modules['alterward_target'], 'ROOT', diagnostics),
            (upgrade, 'proxy_network', fixture_proxy),
        ]:
            item = patch.object(module, key, value)
            item.start()
            patches.append(item)
        originalDocker = upgrade.docker

        def isolatedDocker(*args, **kwargs):
            if args[:2] == ('network', 'create'):
                args = (*args[:2], '--internal', *args[2:])
            return originalDocker(*args, **kwargs)

        item = patch.object(upgrade, 'docker', isolatedDocker)
        item.start()
        patches.append(item)
        # Actual one-off failures, including a killed fork whose memory cannot
        # report its new container back to the parent. Intents precede creation.
        idle = ['docker', 'run', '--rm', '--network', 'none', '--memory', '256m',
                '--cpus', '0.5', '--pids-limit', '64', '--cap-drop', 'ALL',
                '--security-opt', 'no-new-privileges:true', '--entrypoint', 'node',
                context['image'], '-e', 'setInterval(()=>{},1000)']
        try:
            run(idle, timeout=2)
        except subprocess.TimeoutExpired:
            pass
        else:
            raise AssertionError('Fixture helper timeout did not occur')
        helpers.cleanup_all()
        child = os.fork()
        if child == 0:
            try:
                args, _ = helpers.prepare(idle[:2]+['-d']+idle[2:])
                raw_run(args)
                os.kill(os.getpid(), signal.SIGKILL)
            finally:
                os._exit(3)
        _, status = os.waitpid(child, 0)
        assert os.WIFSIGNALED(status) and os.WTERMSIG(status) == signal.SIGKILL
        helpers.cleanup_all()

        sourceBinding = {
            'sourceCommit': context['sourceCommit'],
            'scriptHashes': {
                name: context['sourceHashes'][path]
                for name, path in {
                    'contabo-daily.py': 'scripts/ops/contabo-daily.py',
                    'backup_lib.py': 'scripts/ops/contabo-backup.py',
                    'daily_entry.py': 'scripts/ops/contabo-daily-entry.py',
                }.items()
            },
            'unitHashes': {},
        }
        # Synthetic installation identity only; all archive/proof validators stay real.
        item = patch.object(daily, 'config', lambda: sourceBinding)
        item.start()
        patches.append(item)
        start = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=2)).replace(
            microsecond=0
        )
        terms = {
            'startsAt': start.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'endsAt': (start + dt.timedelta(days=30)).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'participants': [
                {
                    'email': 'funded@example.invalid',
                    'userId': '11111111-1111-4111-8111-111111111111',
                }
            ],
            'projectUsd': '2',
            'userUsd': '0.5',
        }
        access = {
            'teamDomain': 'fixture.cloudflareaccess.com',
            'audience': 'a' * 64,
            'allowedEmails': ['funded@example.invalid', 'owner@example.invalid'],
        }
        baseenv = {
            'CLOUDFLARE_ACCESS_TEAM_DOMAIN': access['teamDomain'],
            'CLOUDFLARE_ACCESS_AUD': access['audience'],
            'CLOSED_SITE_ENABLED': 'true',
            'CLOSED_SITE_ALLOWED_EMAILS': 'funded@example.invalid,owner@example.invalid',
        }
        paid = {
            'GENERATION_DAILY_LIMIT': '3',
            'GENERATION_CONCURRENT_LIMIT': '1',
            'CLOSED_BETA_ENABLED': 'true',
            'CLOSED_BETA_USER_IDS': terms['participants'][0]['userId'],
            'AI_PROJECT_BUDGET_USD': '2',
            'AI_USER_BUDGET_USD': '0.5',
            'CLAUDE_PRODUCTION_BUDGET_USD': '0',
            'AI_PROJECT_INITIAL_SPENT_USD': '0',
            'AI_BUDGET_WINDOW_REQUIRED': 'true',
            'AI_BUDGET_WINDOW_START': terms['startsAt'],
            'AI_BUDGET_WINDOW_END': terms['endsAt'],
            **{k: 'false' for k in daily.SHARED_FLAGS},
        }
        baseTag = project + ':base'
        if run(['docker', 'image', 'ls', '-q', baseTag]).strip():
            raise ValueError('Fixture base tag already exists')
        run(['docker', 'tag', context['image'], baseTag])
        createdBaseTag = True
        # BuildKit resolves FROM by reference, not the daemon's raw image ID.
        # A nonce-owned local tag names the already inspected immutable input.
        oldImage = (
            run(
                ['docker', 'build', '--network', 'none', '-q', '-'],
                (
                    'FROM '
                    + baseTag
                    + '\nUSER root\nRUN rm /app/scripts/lib/funded-runtime.ts\nUSER node\nLABEL com.alterward.fixture=legacy-'
                    + nonce
                    + '\n'
                ).encode(),
            )
            .decode()
            .strip()
        )
        services = {}
        for role in ('web', 'api', 'worker'):
            env = {
                **baseenv,
                **(
                    {'PUBLIC_EXTERNAL_EXPOSURE_ENABLED': 'false'}
                    if role == 'web'
                    else paid
                ),
            }
            if role == 'worker':
                # Production Compose puts the reader email boundary on web/API,
                # not on the worker. Keep this absence in the real fixture too.
                env.pop('CLOSED_SITE_ALLOWED_EMAILS')
                env['OPENAI_API_KEY'] = 'synthetic_never_executed'
            # These inert processes cannot import a provider or claim queue work.
            code = (
                'setInterval(()=>{},1000)'
                if role == 'worker'
                else "require('http').createServer((q,s)=>{s.writeHead(q.url==='/health'?200:403,{'cache-control':'no-store'});s.end('fixture')}).listen("
                + ('3000' if role == 'web' else '4000')
                + ",'0.0.0.0')"
            )
            svc = {
                'image': oldImage,
                'user': 'node',
                'command': ['node', '-e', code],
                'entrypoint': ['docker-entrypoint.sh'],
                'environment': env,
                'cap_drop': ['ALL'],
                'security_opt': ['no-new-privileges:true'],
                'init': True,
                'mem_limit': 268435456,
                'cpus': 0.5,
                'pids_limit': 64,
                'restart': 'unless-stopped',
                'networks': {'proxy': {'aliases': ['alterward-' + role, role]}},
                'pull_policy': 'never',
            }
            if role != 'worker':
                svc['healthcheck'] = {
                    'test': [
                        'CMD',
                        'node',
                        '-e',
                        "fetch('http://127.0.0.1:"
                        + ('3000' if role == 'web' else '4000')
                        + "/health').then(r=>{if(r.status!==200)process.exit(1)}).catch(()=>process.exit(1))",
                    ],
                    'interval': '1s',
                    'timeout': '3s',
                    'retries': 30,
                }
            if role != 'web':
                svc['volumes'] = [
                    {
                        'type': 'bind',
                        'source': str(ca),
                        'target': '/run/secrets/supabase-ca.crt',
                        'read_only': True,
                    }
                ]
            services[role] = svc
        cfg = {
            'name': project,
            'services': services,
            'networks': {'proxy': {'external': True, 'name': network}},
        }
        # The real frozen JSON roundtrip is authoritative for Docker comparisons.
        private(owner / 'effective-compose.json', frozen(cfg))
        cfg = json.loads(
            upgrade.run(
                upgrade.compose(owner / 'effective-compose.json')
                + ['config', '--format', 'json']
            ).stdout
        )
        initialFiles = {
            'server.env': ("ALTERWARD_TAG='contabo-000000000000'\nSYNTHETIC_FUNDED='unchanged'\nCLOSED_BETA_USER_IDS='11111111-1111-4111-8111-111111111111'\n"
                + "CLOSED_SITE_ALLOWED_EMAILS='funded@example.invalid,owner@example.invalid'\n"
                + "AI_PROJECT_BUDGET_USD='2'\nAI_USER_BUDGET_USD='0.5'\n"
                + "AI_BUDGET_WINDOW_START='"+terms['startsAt']+"'\nAI_BUDGET_WINDOW_END='"+terms['endsAt']+"'\n").encode(),
            'pinned-image.json': encoded(
                {
                    'services': {
                        r: {'image': oldImage, 'pull_policy': 'never'} for r in services
                    }
                }
            ),
            'effective-compose.json': frozen(cfg),
        }
        initialFiles['manifest.json'] = encoded(
            {
                'imageId': oldImage,
                'commit': context['sourceCommit'],
                'databaseCaSha256': sha(ca.read_bytes()),
                'accessConfigurationSha256': sha(encoded(access)),
                'ownerEnvironmentSha256': sha(initialFiles['server.env']),
                'effectiveComposeSha256': sha(initialFiles['effective-compose.json']),
                'sourceComposeSha256': sha(b'synthetic-render'),
            }
        )
        for name, raw in initialFiles.items():
            private(owner / name, raw)
            private(owner / 'personal-beta' / name, raw)
        private(owner / 'personal-beta' / 'terms.json', encoded(terms))
        private(owner / 'personal-beta-readers' / 'access.json', encoded(access))
        prep = {
            'candidateFilesSha256': {k: sha(v) for k, v in initialFiles.items()},
            'termsSha256': sha(encoded(terms)),
            'manifest': json.loads(initialFiles['manifest.json']),
        }
        private(owner / 'personal-beta' / 'prepared.json', encoded(prep))
        for name, state in [
            ('transition.json', 'applied'),
            ('journal.json', 'exposure-committed'),
        ]:
            private(
                owner / 'personal-beta' / name,
                encoded({'state': state, 'preparedSha256': sha(encoded(prep))}),
            )
        private(owner / 'activation.lock', b'')
        initialAuthority = {
            str(p): sha(p.read_bytes())
            for p in daily.reader_config_paths() + daily.personal_config_paths()
        }
        release = {
            'runtime': {'mode': 'narrative-fiction-v2', 'generation': 'v9',
                        'cohortUserIds': [terms['participants'][0]['userId']],
                        'timeoutMs': 300000, 'maxRequestBytes': 196608},
            'target': {
                'commit': context['sourceCommit'],
                'imageId': context['image'],
                'imageTag': 'alterward:contabo-' + nonce,
                'sourceDirectory': str(source),
            },
            'recovery': {
                'commit': context['sourceCommit'],
                'imageId': context['image'],
                'imageTag': 'alterward:contabo-' + nonce,
                'sourceDirectory': str(source),
            },
            **{
                k: 'b' * 64
                for k in (
                    'auditSha256',
                    'fixtureSha256',
                    'privacyFixtureSha256',
                    'ciSha256',
                )
            },
        }
        # CI/audit receipts are explicit fixture placeholders; the privacy
        # fixture binding itself is real and must not be a placeholder.
        release['privacyFixtureSha256'] = sha(encoded(context['privacy']))
        # Do not overwrite a caller's tag, even in a fixture.
        if run(
            ['docker', 'image', 'ls', '-q', 'alterward:contabo-' + nonce]
        ).strip():
            raise ValueError('Fixture tag already exists')
        run(['docker', 'tag', context['image'], 'alterward:contabo-' + nonce])
        createdTag = True
        oldTag = 'alterward:contabo-' + uuid.uuid4().hex[:12]
        if run(['docker', 'image', 'ls', '-q', oldTag]).strip():
            raise ValueError('Fixture recovery tag already exists')
        run(['docker', 'tag', oldImage, oldTag])
        createdOldTag = True

        class FixtureSystem(funded.System):
            def __init__(self, request, database):
                super().__init__(request, daily)
                self.database = database
                self.staging_network = project + '-stage'

            def probe(self, image, mode, expected=None):
                if image != context['image']:
                    raise ValueError('Unknown fixture image')
                return db(mode, self.database, expected)

            def build_files(self, role, build, baseline):
                # Only source-render/host literals are adapted; original semantic
                # image-only comparator, real Compose and actual files remain.
                path = self.root / role
                path.mkdir(mode=0o700)
                new = copy.deepcopy(cfg)
                runtime = self.request['release'].get('runtime')
                values = funded.narrative_runtime_values(runtime) if runtime is not None else {}
                for service, svc in new['services'].items():
                    svc['image'] = build['imageId']
                    if service in ('api', 'worker'):
                        svc['environment'].update({k: v for k, v in values.items()
                                                   if service == 'worker' or k in funded.NARRATIVE_DEFAULTS})
                if funded.normalized_configuration(new) != funded.normalized_configuration(cfg, runtime):
                    raise ValueError('Fixture narrative configuration drift')
                daily.personal_runtime_policy({k: v['environment'] for k, v in new['services'].items()}, self.now())
                for name, raw in initialFiles.items():
                    if name == 'effective-compose.json':
                        raw = frozen(new)
                    elif name == 'server.env':
                        raw = funded.narrative_environment(upgrade.image_only_environment(
                            raw.decode(), build['imageTag']
                        ), runtime).encode()
                    elif name == 'manifest.json':
                        raw = encoded(
                            {
                                **json.loads(raw),
                                'imageId': build['imageId'],
                                'ownerEnvironmentSha256': sha(
                                    funded.fence.original(path / 'server.env')
                                ),
                                'effectiveComposeSha256': sha(frozen(new)),
                            }
                        )
                    elif name == 'pinned-image.json':
                        raw = encoded(
                            {
                                'services': {
                                    r: {
                                        'image': build['imageId'],
                                        'pull_policy': 'never',
                                    }
                                    for r in services
                                }
                            }
                        )
                    private(path / name, raw)
                return self.hashes(path)

            def backup(self, candidate):
                super().backup(candidate)

            def readback(self, candidate, **kwargs):
                # Actual config/health/image/env/CA/resource/network/database;
                # adapt only the production proxy discovery literal.
                roles = self.roles()
                activation.validate_running(
                    list(roles.values()), self.configuration(owner), context['image']
                )
                fixture_proxy()
                assert upgrade.foreign_state() == candidate['baseline']['foreign']
                after = self.probe(context['image'], 'capture')
                funded.same_funded(candidate['database'], after)
                proof = {
                    'version': funded.VERSION,
                    'sourceCommit': candidate['sourceCommit'],
                    'paidAiCalls': 0, 'operationPaidAiCalls': 0, 'databaseRestored': False,
                    'schema': 39,
                    'preparedSha256': sha(encoded(candidate)),
                    'imageId': context['image'],
                    'protectedDataUnchanged': True,
                }
                private(self.root / 'readback.json', encoded(proof))
                return proof

        def stopped(system):
            return not any(v['State']['Running'] for v in system.roles().values())

        def make_archive(system, candidate):
            # A real encrypted offsite copy, decrypt and isolated physical DB
            # restore precede the SAME production proof/ciphertext validators.
            daily.ROOT, offsite = containers.reserve_archive_directories(base, system.database)
            (daily.ROOT / 'status').mkdir(mode=0o700, parents=True)
            archives = daily.ROOT / 'backups'
            archives.mkdir(mode=0o700)
            rid = 'pending'
            archive = archives / 'pending'
            archive.mkdir(mode=0o700)
            identity = run(['age-keygen'])
            recipient = run(['age-keygen', '-y'], identity).decode().strip()
            paths = (
                daily.reader_config_paths()
                + daily.personal_config_paths()
                + daily.funded_upgrade_config_paths(immutable_only=True)
            )
            payload = io.BytesIO()
            with tarfile.open(fileobj=payload, mode='w') as tar:
                for path in paths:
                    tar.add(path, arcname=str(path).lstrip('/'), recursive=False)
            dump = run(
                [
                    'docker',
                    'exec',
                    context['postgres'],
                    'pg_dump',
                    '-U',
                    'postgres',
                    '-Fc',
                    system.database,
                ]
            )
            originals = {
                'config.tar.age': payload.getvalue(),
                'application.dump.age': dump,
            }
            encrypted = {}
            for name, raw in originals.items():
                cipher = run(['age', '-r', recipient], raw)
                private(archive / name, cipher)
                private(offsite / name, cipher)
                assert sha((archive / name).read_bytes()) == sha(
                    (offsite / name).read_bytes()
                )
                encrypted[name] = {'bytes': len(cipher), 'sha256': sha(cipher)}
            identityfd = os.memfd_create('synthetic-age-identity')
            os.write(identityfd, identity)
            os.lseek(identityfd, 0, 0)

            def decrypt(cipher, check=True):
                return subprocess.run(
                    ['age', '-d', '-i', f'/proc/self/fd/{identityfd}'],
                    input=cipher,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    pass_fds=(identityfd,),
                    check=check,
                )

            try:
                restored = {
                    n: decrypt((offsite / n).read_bytes()).stdout for n in originals
                }
                bad = bytearray((offsite / 'application.dump.age').read_bytes())
                bad[-1] ^= 1
                assert decrypt(bytes(bad), False).returncode != 0
            finally:
                os.close(identityfd)
            with tarfile.open(fileobj=io.BytesIO(restored['config.tar.age'])) as tar:
                assert {
                    m.name: sha(tar.extractfile(m).read()) for m in tar.getmembers()
                } == {str(p).lstrip('/'): sha(p.read_bytes()) for p in paths}
            restoredDB = 'aw_restore_' + uuid.uuid4().hex[:24]
            databases.add(restoredDB)
            sql('postgres', 'CREATE DATABASE ' + restoredDB)
            run(
                [
                    'docker',
                    'exec',
                    '-i',
                    context['postgres'],
                    'pg_restore',
                    '-U',
                    'postgres',
                    '--single-transaction',
                    '-d',
                    restoredDB,
                ],
                restored['application.dump.age'],
            )
            current = db('capture', system.database)
            restoredState = db('capture', restoredDB)
            funded.same_funded(
                {
                    **current,
                    'identityBindingSha256': restoredState['identityBindingSha256'],
                },
                restoredState,
            )
            tables = (
                sql(
                    system.database,
                    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'ff_migrations' ORDER BY tablename",
                )
                .decode()
                .splitlines()
            )
            if any(not re.fullmatch(r'[a-z_]+', name) for name in tables):
                raise ValueError('Strict application table names required')
            counts = json.loads(
                sql(
                    system.database,
                    'SELECT json_agg(t) FROM ('
                    + ' UNION ALL '.join(
                        "SELECT '"
                        + name
                        + "' AS \"table\",count(*)::int AS count FROM "
                        + name
                        for name in tables
                    )
                    + ') t',
                ).decode()
            )
            db('drop', restoredDB)
            databases.remove(restoredDB)
            instant = dt.datetime.now(dt.timezone.utc)
            timestamp = instant.isoformat()
            rid = instant.strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
            archive.rename(archives / rid)
            archive = archives / rid
            manifest = {
                'managedBy': 'alterward-daily-1',
                'schemaVersion': 'contabo-backup-1',
                'runId': rid,
                'capturedAt': timestamp,
                **sourceBinding,
                'encryptedFiles': encrypted,
                'configFiles': {str(p).lstrip('/'): sha(p.read_bytes()) for p in paths},
                'expectedTables': counts,
            }
            private(archive / 'manifest.json', encoded(manifest))
            proof = {
                **sourceBinding,
                'capturedAt': timestamp,
                'runId': rid,
                'encryptedFiles': encrypted,
                'configFilesRestored': len(paths),
                'tablesRestoredAndDataMatched': len(counts),
                'rowsMatched': sum(t['count'] for t in counts),
                **{
                    k: True
                    for k in (
                        'offsiteCiphertextVerified',
                        'tamperedCiphertextRejected',
                        'proxyAdaptAndValidate',
                        'singleTransactionRestore',
                        'temporaryContainersRemoved',
                        'temporaryPlaintextRemoved',
                        'allExistingContainersUnchanged',
                        'decryptionIdentityMemoryOnly',
                    )
                },
                'liveDatabaseWrites': False,
                'paidAiCalls': 0,
            }
            private(daily.ROOT / 'status' / 'restore.json', encoded(proof))
            system.request['restoreProof'] = {
                'sourceCommit': candidate['sourceCommit'],
                'preparedSha256': sha(encoded(candidate)),
                'runId': rid,
                'targetImage': context['image'],
                'recoveryImage': context['image'],
                'privacyFixtureSha256': candidate['release']['privacyFixtureSha256'],
            }
            # Mutation of a copied proof/config cannot pass the real gate.
            system.backup(candidate)

        for label in (
            'probe-cleanup',
            'expired-archive',
            'success',
            'image-only',
            'postcheck',
            'interruption-intent',
            'interruption-held',
            'interruption-schema',
            'interruption-staged',
        ):
            # Test-owned cleanup between independent cases, never a production
            # journal deletion/retry path.
            if (owner / 'funded-runtime-upgrade').exists():
                import shutil

                shutil.rmtree(owner / 'funded-runtime-upgrade')
            for name in (*daily.SUCCESSOR_ROOT_NAMES,'beta-successor-archive'):
                if (owner/name).exists():
                    # Independent nonce-owned cases ONLY, never an operator retry.
                    __import__('shutil').rmtree(owner/name)
            for name, raw in initialFiles.items():
                private(owner / name, raw)
            upgrade.run(
                upgrade.compose(owner / 'effective-compose.json')
                + ['up', '-d', '--wait', '--wait-timeout', '45'],
                timeout=90,
            )
            database = 'aw_fixture_' + uuid.uuid4().hex[:24]
            databases.add(database)
            db('init', database)
            request = {
                'mode': 'prepare',
                'sourceCommit': context['sourceCommit'],
                'bundleSha256': context['bundleSha256'],
                'sourceHashes': context['sourceHashes'],
                'release': release,
                'accessSnapshot': {
                    **access,
                    'checkedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
                    'configurationSha256': 'c' * 64,
                },
            }
            if label == 'image-only':
                request['release'] = {k: v for k, v in release.items() if k != 'runtime'}
            system = FixtureSystem(request, database)
            active_system = system
            prepared = system.prepare()
            candidate = json.loads((system.root / 'prepared.json').read_bytes())
            request['preparedSha256'] = prepared['preparedSha256']
            if label == 'probe-cleanup':
                # Exercise the production one-off lifecycle with actual Docker.
                # Only the Node payload is inert; real SQL/migration is covered
                # by this fixture's DB companion and interrupted transitions.
                plain = funded.System(request, daily)
                serving = {r: v['Id'] for r, v in system.roles().items()}
                before = db('capture', database)
                # The actual production capability lifecycle owns this direct
                # Docker run; no fixture wrapper rewrites its name/intent/cleanup.
                hang = "require('node:fs').readFileSync(0);setInterval(()=>{},1000)"
                plain.cleanup_capability()
                assert daily.funded_capability_state(system.root)['state'] == 'cleaned'
                saved_capability = (system.root/'capability.json').read_bytes()
                # The prior completed fixture receipt binds the real command.
                # Start a fresh synthetic intent for the inert payload override;
                # production never reinterprets a receipt with another command.
                (system.root/'capability.json').unlink()
                original_run = upgrade.run
                def capability_timeout(args, **kwargs):
                    if args[:2] == ['docker', 'run']:
                        kwargs['timeout'] = 2
                    return original_run(args, **kwargs)
                with patch.object(funded, 'CAPABILITY_COMMAND', ['-e', hang]):
                    with patch.object(upgrade, 'run', capability_timeout):
                        try:
                            plain.capability(context['image'], context['sourceHashes'])
                        except subprocess.TimeoutExpired:
                            pass
                        else:
                            raise AssertionError('Capability helper did not time out')
                    assert daily.funded_capability_state(system.root)['state'] == 'cleaned'
                    pid = os.fork()
                    if pid == 0:
                        plain.capability(context['image'], context['sourceHashes'])
                        os._exit(3)
                    until = time.monotonic() + 45
                    while time.monotonic() < until:
                        state = daily.funded_capability_state(system.root)
                        ids = run(['docker', 'ps', '-q', '--no-trunc', '--filter',
                                   'name=^/' + state['name'] + '$']).decode().split() if state else []
                        if state and state['state'] == 'pending' and ids:
                            break
                        time.sleep(0.2)
                    else:
                        os.kill(pid, signal.SIGKILL); os.waitpid(pid, 0)
                        raise AssertionError('Actual capability helper did not start')
                    os.kill(pid, signal.SIGKILL)
                    _, status = os.waitpid(pid, 0)
                    assert os.WIFSIGNALED(status)
                    assert not daily.funded_upgrade_healthy('personal-beta')
                    assert plain.cleanup_probe()['capabilityRemoved']
                    assert not plain.cleanup_probe()['capabilityRemoved']
                # Restore the preceding completed test-owned intent after the
                # inert payload override; no pending helper remains at this point.
                private(system.root/'capability.json', saved_capability)
                assert {r: v['Id'] for r, v in system.roles().items()} == serving
                assert db('capture', database) == before
                reply = "require('node:fs').readFileSync(0);process.stdout.write(" + json.dumps(json.dumps(before)) + ")"
                with patch.object(funded, 'PROBE_COMMAND', ['-e', reply]):
                    assert plain.probe(context['image'], 'capture') == before
                assert daily.funded_probe_state(system.root)['state'] == 'cleaned'
                hang = "require('node:fs').readFileSync(0);setInterval(()=>{},1000)"
                actual_run = upgrade.run
                def timeout_run(args, **kwargs):
                    if 'run' in args and '--name' in args:
                        kwargs['timeout'] = 5
                    return actual_run(args, **kwargs)
                with patch.object(funded, 'PROBE_COMMAND', ['-e', hang]):
                    with patch.object(upgrade, 'run', timeout_run):
                        try:
                            plain.probe(context['image'], 'capture')
                        except subprocess.TimeoutExpired:
                            pass
                        else:
                            raise AssertionError('Probe did not time out')
                    assert daily.funded_probe_state(system.root)['state'] == 'cleaned'
                    pid = os.fork()
                    if pid == 0:
                        plain.probe(context['image'], 'capture')
                        os._exit(3)
                    until = time.monotonic() + 45
                    while time.monotonic() < until:
                        state = daily.funded_probe_state(system.root)
                        ids = run(['docker', 'ps', '-q', '--no-trunc', '--filter',
                                   'name=^/' + state['name'] + '$']).decode().split() if state else []
                        if state and state['state'] == 'pending' and ids:
                            break
                        time.sleep(0.2)
                    else:
                        os.kill(pid, signal.SIGKILL); os.waitpid(pid, 0)
                        raise AssertionError('Actual probe did not start')
                    os.kill(pid, signal.SIGKILL)
                    _, status = os.waitpid(pid, 0)
                    assert os.WIFSIGNALED(status)
                    try:
                        system.roles()
                    except ValueError:
                        pass
                    else:
                        raise AssertionError('Unexpected fourth role was ignored')
                    assert not daily.funded_upgrade_healthy('personal-beta')
                    plain.stop()
                    assert all(not v['State']['Running'] for v in plain.roles(stopping=True).values())
                    assert plain.cleanup_probe()['probeRemoved']
                    assert not plain.cleanup_probe()['probeRemoved']
                upgrade.run(upgrade.compose(owner / 'effective-compose.json')
                            + ['up', '-d', '--wait', '--wait-timeout', '45'], timeout=90)
                assert {r: v['Id'] for r, v in system.roles().items()} == serving
                assert all(v['State']['Running'] for v in system.roles().values())
                funded.same_funded(before, db('capture', database))
                assert daily.funded_upgrade_healthy('personal-beta')
                assert all((owner / n).read_bytes() == raw for n, raw in initialFiles.items())
                checks['probeCleanup'] = True
                continue
            if label == 'expired-archive':
                # Advance the synthetic operator clock; do not wait 15 minutes
                # and do not edit the immutable prepared timestamp/receipt.
                advanced = system.now() + dt.timedelta(seconds=901)
                system.now = lambda: advanced
                request['accessSnapshot']['checkedAt'] = advanced.isoformat()
                serving = {r: v['Id'] for r, v in system.roles().items()}
                before = db('capture', database)
                saved = {p.relative_to(system.root).as_posix(): p.read_bytes()
                         for p in daily.funded_tree_paths(system.root)}
                result = system.archive_expired()
                destination = owner / daily.FUNDED_ARCHIVE_NAME / prepared['preparedSha256']
                assert result['archived'] and not system.root.exists()
                assert all((destination / n).read_bytes() == data for n, data in saved.items())
                assert system.archive_expired()['alreadyArchived']
                assert {r: v['Id'] for r, v in system.roles().items()} == serving
                assert all(v['State']['Running'] for v in system.roles().values())
                assert daily.funded_upgrade_healthy('personal-beta')
                after = db('capture', database)
                funded.same_funded(before, after)
                assert after['schema'] == 36
                assert all((owner / n).read_bytes() == raw for n, raw in initialFiles.items())
                checks['expiredPreparationArchive'] = True
                continue
            make_archive(system, candidate)
            before = db('capture', database)
            if label == 'success':
                # Altered funded authority/window/readers must refuse before
                # any scoped stop. These are test-owned files, restored exactly.
                for path in (
                    owner / 'server.env',
                    owner / 'personal-beta' / 'terms.json',
                    owner / 'personal-beta' / 'transition.json',
                    owner / 'personal-beta-readers' / 'access.json',
                ):
                    original = path.read_bytes()
                    if path.name == 'server.env':
                        changed = original + b"RESET_WINDOW='true'\n"
                    else:
                        changed = json.loads(original)
                        if path.name == 'terms.json':
                            changed['startsAt'] = '2000-01-01T00:00:00Z'
                        elif path.name == 'transition.json':
                            changed['state'] = 'owner-zero'
                        else:
                            changed['allowedEmails'].append('foreign@example.invalid')
                        changed = encoded(changed)
                    private(path, changed)
                    try:
                        try:
                            system.preflight(candidate)
                        except ValueError:
                            pass
                        else:
                            raise AssertionError(
                                'Altered original funded authority accepted'
                            )
                        assert all(
                            v['State']['Running'] for v in system.roles().values()
                        )
                    finally:
                        private(path, original)
                # Actual Linux flock rejects a competing operator.
                with (owner / 'activation.lock').open('rb') as lock:
                    readers.exclusive_lock(lock, 0)
                    child = run(
                        [
                            sys.executable,
                            '-c',
                            "import fcntl,sys\nf=open(sys.argv[1],'rb')\ntry:fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\nexcept BlockingIOError:sys.exit(0)\nsys.exit(1)",
                            str(owner / 'activation.lock'),
                        ]
                    )
                    checks['locks'] = True
                stale = copy.deepcopy(candidate)
                stale['preparedAt'] = (
                    system.now() - dt.timedelta(seconds=901)
                ).isoformat()
                stale['expiresAt'] = (
                    system.now() - dt.timedelta(seconds=1)
                ).isoformat()
                try:
                    system.preflight(stale)
                except ValueError:
                    checks['stale'] = True
                else:
                    raise AssertionError('Stale candidate accepted')
                originalImage = system.image
                for bad in (
                    {**release['recovery'], 'imageId': oldImage},
                    {**release['recovery'], 'imageId': oldImage, 'imageTag': oldTag},
                    {**release['recovery'], 'commit': '0' * 40},
                ):
                    try:
                        originalImage(bad)
                    except (ValueError, RuntimeError):
                        checks['incompatibleRecovery'] = True
                    else:
                        raise AssertionError('Incompatible image accepted')
                funded.transition(system, candidate)
                checks['success'] = True
                assert db('capture', database)['schema'] == 39
                try:
                    system.image(
                        {**release['recovery'], 'imageId': oldImage, 'imageTag': oldTag}
                    )
                except (ValueError, RuntimeError):
                    pass
                else:
                    raise AssertionError('Pre-039 rollback image accepted after 039')
            elif label == 'image-only':
                funded.transition(system, candidate)
            elif label == 'postcheck':
                actual = system.postcheck

                def fail(*args, **kwargs):
                    actual(*args, **kwargs)
                    raise ValueError('Synthetic post-check fault after real validation')

                system.postcheck = fail
                try:
                    funded.transition(system, candidate)
                except ValueError:
                    pass
                else:
                    raise AssertionError('Fault did not fail')
                assert stopped(system)
                assert system.journal(candidate)['states'][-1]['state'] == 'closed'
                checks['postcheck'] = True
                system.postcheck = actual
                funded.transition(system, candidate, recovery=True)
                assert system.journal(candidate)['states'][-1]['state'] == 'recovered'
            else:
                pid = os.fork()
                if pid == 0:
                    if label == 'interruption-staged':
                        originalPost = system.postcheck

                        def kill(*args, **kwargs):
                            originalPost(*args, **kwargs)
                            os.kill(os.getpid(), signal.SIGKILL)

                        system.postcheck = kill
                    else:
                        originalRecord = system.record
                        boundary = {
                            'interruption-intent': 'apply-intent',
                            'interruption-held': 'held',
                            'interruption-schema': 'schema-038',
                        }[label]

                        def kill_record(state, *args, **kwargs):
                            originalRecord(state, *args, **kwargs)
                            if state == boundary:
                                os.kill(os.getpid(), signal.SIGKILL)

                        system.record = kill_record
                    funded.transition(system, candidate)
                    os._exit(3)
                _, status = os.waitpid(pid, 0)
                assert os.WIFSIGNALED(status)
                until = time.monotonic() + 90
                while time.monotonic() < until:
                    if (system.root / 'watchdog.json').exists() and stopped(system):
                        break
                    time.sleep(1)
                else:
                    raise AssertionError('Death watch did not close killed operator')
                assert json.loads((system.root / 'watchdog.json').read_bytes())[-1][
                    'servicesStopped'
                ]
                checks['interruption'] = True
                funded.transition(system, candidate, recovery=True)
            assert daily.personal_transition_healthy('personal-beta')
            actual = system.configuration(owner)['services']
            if label == 'image-only':
                for role in ('api', 'worker'):
                    assert actual[role]['environment'].get('NARRATIVE_PIPELINE_MODE', 'legacy') == 'legacy'
                    assert actual[role]['environment'].get('NARRATIVE_COHORT_USER_IDS', '') == ''
            else:
                for role in ('api', 'worker'):
                    assert actual[role]['environment']['NARRATIVE_FICTION_GENERATION'] == 'v9'
                    assert actual[role]['environment']['NARRATIVE_COHORT_USER_IDS'] == terms['participants'][0]['userId']
                assert actual['worker']['environment']['AI_FICTION_MAX_REQUEST_BYTES'] == '196608'
            after = db('capture', database)
            funded.same_funded(before, after)
            assert after['schema'] == 39
            assert initialAuthority == {
                p: sha(Path(p).read_bytes()) for p in initialAuthority
            }
            assert (
                json.loads((owner / 'personal-beta' / 'terms.json').read_bytes())
                == terms
            )
            checks['fundedState'] = True
            from types import SimpleNamespace
            adapter = SimpleNamespace(**{k: getattr(daily, k) for k in (
                'FUNDED_UPGRADE_ARCHIVE_POLICY_VERSION', 'FUNDED_CAPABILITY_VERSION',
                'config', 'funded_capability_state')},
                OWNER=owner, funded_upgrade_healthy=daily.funded_upgrade_healthy,
                owner_runtime=lambda: (json.loads((owner/'manifest.json').read_bytes()), system.roles()),
                containers=daily.containers, reader_config_paths=daily.reader_config_paths,
                personal_config_paths=daily.personal_config_paths)
            actual_daily = system.daily
            try:
                system.daily = adapter
                active = system.active_proof()
                replay.require_funded_runtime(adapter, funded.fence.original, active)
                assert active['imageId'] == context['image']
                try:
                    replay.require_funded_runtime(adapter, funded.fence.original, {**active, 'imageId': oldImage})
                except ValueError:
                    pass
                else:
                    raise AssertionError('Stale active funded image proof accepted')
            finally:
                system.daily = actual_daily
            if label == 'image-only':
                image_only_verified = True
            checks['fundedReplayProof'] = True
            if label in {'success','postcheck','interruption-staged'}:
                from types import SimpleNamespace
                successor_fixture.exercise(SimpleNamespace(**globals()),context,label=label,system=system,
                    database=database,owner=owner,project=project,terms=terms,release=release,
                    db=db,make_archive=make_archive,private=private,checks=successor_checks)
            system.stop()
            db('drop', database)
            databases.remove(database)
        checks['foreign'] = preserved_containers(all_before, project, foreign_id)
        assert checks['foreign']
        successor_checks.update(foreignStable=checks['foreign'],cleanup=True)
        expected_successor = {'oldAllowanceClosed','historyPreserved','differentOwner','ownerCap',
            'lostCommitRecovery','noSqlReplay','interruptionHeld','stagedIngress','watchdog',
            'effectiveAuthority','candidateBackup','expiredArchive','foreignStable','cleanup',
            'readerAdmission','testerBetaWindow','chainedAuthority'}
        assert set(successor_checks)==expected_successor and all(v is True for v in successor_checks.values())
        # Consumed ONLY after exercise() returns through the verified finally
        # cleanup. Never published by a failed or interrupted fixture.
        global SUCCESSOR_PROOF
        SUCCESSOR_PROOF = {'version':'alterward-beta-successor-fixture-2',
            'sourceCommit':context['sourceCommit'],'bundleSha256':context['bundleSha256'],
            'targetImage':context['image'],'recoveryImage':context['image'],
            'checks':successor_checks,'paidAiCalls':0}
        # Reservation and lease/queue failures are exercised against real SQL by
        # the companion below, not simulated booleans in this controller.
        database = 'aw_fixture_' + uuid.uuid4().hex[:24]
        databases.add(database)
        checks.update(db('unsafe', database))
        db('drop', database)
        databases.remove(database)
        checks.update(artifactRestore=True, privacyReplay=True, frozenPolicies=True)
        assert all(checks.values()) and image_only_verified
        return {
            'sourceCommit': context['sourceCommit'],
            'bundleSha256': context['bundleSha256'],
            'targetImage': context['image'],
            'recoveryImage': context['image'],
            'checks': checks,
            'privacyFixtureSha256': sha(encoded(context['privacy'])),
            'paidAiCalls': 0,
        }
    finally:
        # This runner accepts synthetic credentials and fixed fixture targets
        # only. Show bounded Docker diagnostics for a failed rehearsal, never
        # use this diagnostic path in the production entry point.
        for failure in diagnostics.glob('failure-*.json'):
            record = json.loads(failure.read_bytes())
            print(
                'Synthetic Docker diagnostic: ' + record['stderr'][-4000:],
                file=sys.stderr,
            )
        failures = []

        def cleanup(action):
            try:
                action()
            except BaseException as error:
                failures.append(type(error).__name__)

        if active_system is not None:
            cleanup(active_system.cleanup_capability)
        cleanup(helpers.cleanup_all)
        for database in list(databases):
            if not re.fullmatch(r'(aw_fixture_|aw_restore_)[a-f0-9]{24}', database):
                failures.append('unsafe-database-name')
                continue
            cleanup(
                lambda database=database: sql(
                    'postgres', 'DROP DATABASE IF EXISTS ' + database + ' WITH (FORCE)'
                )
            )
        # Setup can fail before PROJECT is patched; never target the live owner.
        owned = fixture_project_ids(project)
        if owned:
            cleanup(lambda: run(['docker', 'rm', '-f', *owned]))
        if foreign_id:
            cleanup(lambda: run(['docker', 'rm', '-f', foreign_id]))
        if created_network:
            cleanup(lambda: run(['docker', 'network', 'rm', network]))
            def cleanup_stage():
                result = upgrade.docker('network', 'inspect', project + '-stage', check=False)
                if not result.returncode:
                    value = json.loads(result.stdout)[0]
                    if (not value['Internal'] or value.get('Labels', {}).get('com.alterward.funded-check') != context['sourceCommit'] or value.get('Containers')):
                        raise ValueError('Foreign staging network cannot be cleaned')
                    run(['docker', 'network', 'rm', value['Id']])
            cleanup(cleanup_stage)
        if createdTag:
            cleanup(
                lambda: run(['docker', 'image', 'rm', 'alterward:contabo-' + nonce])
            )
        if createdOldTag:
            cleanup(
                lambda: run(['docker', 'image', 'rm', oldTag])
            )
        if oldImage:
            def cleanup_derived_image():
                # Removing its final tag can already remove the derived image.
                ids = run(['docker', 'image', 'ls', '--no-trunc', '-q']).decode().split()
                if oldImage in ids:
                    value = json.loads(run(['docker', 'image', 'inspect', oldImage]))[0]
                    if value['Config'].get('Labels', {}).get('com.alterward.fixture') != 'legacy-' + nonce:
                        raise ValueError('Foreign derived image cannot be cleaned')
                    run(['docker', 'image', 'rm', oldImage])
            cleanup(cleanup_derived_image)
        if createdBaseTag:
            cleanup(lambda: run(['docker', 'image', 'rm', baseTag]))
        for item in patches[::-1]:
            item.stop()
        try:
            if not preserved_containers(all_before):
                failures.append('foreign-state-drift')
        except BaseException:
            failures.append('foreign-state-readback')
        containers.cleanup_workspace(base, failures)
        if failures:
            raise RuntimeError(
                'Isolated funded fixture cleanup incomplete: ' + ','.join(failures)
            )
