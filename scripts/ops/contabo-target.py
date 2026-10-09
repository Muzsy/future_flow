"""Explicit isolated Contabo rehearsal, never a live deployment.

Receives only committed source, public build values and Access configuration.
The real database, provider credentials, existing proxy and DNS are untouched.
"""

import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

from alterward_backup import (
    ROOT as OPERATOR_ROOT, confined, private_directory, private_file, safe_extract,
)

ROOT = OPERATOR_ROOT / 'target'
CLI = ROOT / 'docker-cli'
BUILDX_URL = 'https://github.com/docker/buildx/releases/download/v0.38.0/buildx-v0.38.0.linux-amd64'
BUILDX_SHA = '4fe4cc38adf48169132749b6ca22a990928db0118e3407584ee553723115d287'
PHASE = 'validation'


def run(args, *, timeout=120, input=None, check=True):
    # Compose process variables override --env-file. Never inherit app credentials
    # or feature flags from the host, even when another application exports them.
    environment = {key: os.environ[key] for key in ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR']
                   if key in os.environ}
    result = subprocess.run(args, input=input, capture_output=True, timeout=timeout,
                            env=environment)
    if check and result.returncode:
        private_file(ROOT / ('failure-' + str(time.time_ns()) + '.json'),
                     json.dumps({'phase': PHASE,
                                 'stdout': result.stdout.decode(errors='replace')[-16384:],
                                 'stderr': result.stderr.decode(errors='replace')[-32768:]}).encode())
        raise RuntimeError('Operator command failed')
    return result


def docker(*args, **kwargs):
    return run(['docker', *args], **kwargs)


def source_extract(data, destination):
    """Git archives contain directory entries; restore only vetted regular files."""
    output = io.BytesIO()
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as source:
        members = source.getmembers()
        if len(members) > 10000 or sum(m.size for m in members) > 128 * 1024**2:
            raise ValueError('Source archive exceeds limits')
        with tarfile.open(fileobj=output, mode='w:gz') as files:
            for member in members:
                parts = member.name.rstrip('/').split('/')
                if (any(part in ['', '.', '..', '.git', '.local', 'env',
                                'node_modules', '__pycache__'] for part in parts) or
                        '\\' in member.name or
                        any(part == '.env' or (part.startswith('.env.') and
                            part != '.env.example') for part in parts)):
                    raise ValueError('Source includes private or aliased paths')
                if member.isdir():
                    continue
                if not member.isfile():
                    raise ValueError('Source links and special files are forbidden')
                files.addfile(member, source.extractfile(member))
    safe_extract(output.getvalue(), destination)


def existing_state():
    ids = docker('ps', '-q').stdout.decode().split()
    containers = json.loads(docker('inspect', *ids).stdout) if ids else []
    return {c['Id']: {'restarts': c['RestartCount'], 'status': c['State']['Status']}
            for c in containers}


def owner_overlay(text):
    flags = {}
    for line in text.splitlines():
        if not line or line.startswith('#'):
            continue
        if not re.fullmatch(r'[A-Z][A-Z0-9_]+=(?:true|false|0)?', line):
            raise ValueError('Owner flag overlay contains a non-fixture value')
        key, value = line.split('=', 1)
        if key in flags:
            raise ValueError('Duplicate owner flag')
        flags[key] = value
    return flags


def validate_owner_configuration(config, access, flags):
    """Refuse a mismatched rendered gate before starting any owner fixture."""
    if len(access['allowedEmails']) != 1:
        raise ValueError('Owner-only configuration required')
    expected = {'CLOSED_SITE_ENABLED': 'true',
                'CLOUDFLARE_ACCESS_TEAM_DOMAIN': access['teamDomain'],
                'CLOUDFLARE_ACCESS_AUD': access['audience'],
                'CLOSED_SITE_ALLOWED_EMAILS': access['allowedEmails'][0]}
    for service in ['web', 'api']:
        environment = config['services'][service]['environment']
        if any(environment.get(key) != value for key, value in expected.items()):
            raise ValueError('Rendered web/API origin gate differs from dashboard')
    for service in ['api', 'worker']:
        environment = config['services'][service]['environment']
        if any(environment.get(key) != value for key, value in {
                'CLOSED_BETA_ENABLED': 'true', 'CLOSED_BETA_USER_IDS': '',
                'AI_PROJECT_BUDGET_USD': '0', 'AI_USER_BUDGET_USD': '0'}.items()):
            raise ValueError('Owner deployment could admit paid work')
    worker = config['services']['worker']['environment']
    if any(worker.get(key) != value for key, value in {
            'AI_BUDGET_WINDOW_REQUIRED': 'true',
            'AI_BUDGET_WINDOW_START': '', 'AI_BUDGET_WINDOW_END': ''}.items()):
        raise ValueError('Owner deployment could start a paid window')
    for key in ['OFFICIAL_PUBLICATIONS_ENABLED', 'DISCOVERY_ENABLED',
                'PUBLIC_COLLECTIONS_ENABLED', 'PUBLIC_SCENARIOS_ENABLED']:
        if config['services']['api']['environment'].get(key) != 'true':
            raise ValueError('Owner catalog configuration differs')
    for service in ['api', 'worker']:
        environment = config['services'][service]['environment']
        for key, value in flags.items():
            # These operator-only keys are checked in the actual server env;
            # they are deliberately not supplied to the serving containers.
            if key.endswith('_OPERATOR_ENABLED') or key == 'CLAUDE_PRODUCTION_BUDGET_USD':
                continue
            if key == 'CLOSED_SITE_ENABLED' and service == 'worker':
                continue
            if key.startswith('AI_BUDGET_WINDOW_') and service == 'api':
                continue
            if environment.get(key) != value:
                raise ValueError('Rendered owner feature matrix differs')
    if config['services']['web']['environment'].get('PUBLIC_EXTERNAL_EXPOSURE_ENABLED') != 'false':
        raise ValueError('Owner web could expose public metadata')


def prepare_buildx():
    plugins = CLI / 'cli-plugins'
    private_directory(plugins)
    binary = plugins / 'docker-buildx'
    if binary.exists():
        if binary.is_symlink() or hashlib.sha256(binary.read_bytes()).hexdigest() != BUILDX_SHA:
            raise ValueError('Private Buildx binary differs')
    else:
        request = urllib.request.Request(BUILDX_URL, headers={'User-Agent': 'Alterward-operator'})
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read(80 * 1024**2 + 1)
        if len(data) > 80 * 1024**2 or hashlib.sha256(data).hexdigest() != BUILDX_SHA:
            raise ValueError('Official Buildx checksum mismatch')
        private_file(binary, data)
    binary.chmod(0o700)
    version = run(['docker', '--config', str(CLI), 'buildx', 'version']).stdout.decode().strip()
    if 'v0.38.0' not in version:
        raise ValueError('Unexpected Buildx version')
    return version


def build(request):
    global PHASE
    if os.uname().machine != 'x86_64':
        raise ValueError('This build tool is pinned for amd64')
    commit = request['commit']
    if not re.fullmatch(r'[a-f0-9]{40}', commit):
        raise ValueError('Commit required')
    available = int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines()
                         if line.startswith('MemAvailable:')))
    if available < 4 * 1024**2 or shutil.disk_usage(ROOT).free < 12 * 1024**3:
        raise ValueError('Insufficient shared-host headroom')
    public = request['publicBuild']
    if set(public) != {'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
                       'NEXT_PUBLIC_API_URL'}:
        raise ValueError('Only public build inputs are allowed')
    if (not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co', public['NEXT_PUBLIC_SUPABASE_URL']) or
            public['NEXT_PUBLIC_API_URL'] != '/api/v1' or
            not re.fullmatch(r'[A-Za-z0-9_.-]{16,2048}', public['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'])):
        raise ValueError('Invalid public build configuration')
    baseline = existing_state()
    run_id = commit[:12] + '-' + os.urandom(4).hex()
    work = ROOT / ('build-' + run_id)
    work.mkdir(mode=0o700)
    source = work / 'source'
    source.mkdir(mode=0o700)
    archive = base64.b64decode(request['archive'], validate=True)
    if hashlib.sha256(archive).hexdigest() != request['archiveSha256']:
        raise ValueError('Source archive differs')
    PHASE = 'source-extraction'
    source_extract(archive, source)
    PHASE = 'private-build-tool'
    version = prepare_buildx()
    builder = 'alterward-build-' + run_id
    buildx = ['docker', '--config', str(CLI), 'buildx']
    if run([*buildx, 'inspect', builder], check=False).returncode == 0:
        raise ValueError('Builder already exists')
    config = work / 'buildkitd.toml'
    private_file(config, b'[worker.oci]\n  max-parallelism = 1\n')
    tag = 'alterward:contabo-' + commit[:12]
    created = False
    try:
        PHASE = 'create-limited-builder'
        run([*buildx, 'create', '--name', builder, '--driver', 'docker-container',
             '--driver-opt', 'memory=2g,memory-swap=2g,cpu-quota=100000,cpu-period=100000,restart-policy=no',
             '--buildkitd-config', str(config)])
        created = True
        run([*buildx, 'inspect', '--bootstrap', builder], timeout=240)
        limited = json.loads(docker('inspect', 'buildx_buildkit_' + builder + '0').stdout)[0]
        limits = limited['HostConfig']
        if (limits['Memory'] != 2 * 1024**3 or limits['MemorySwap'] != 2 * 1024**3 or
                limits['CpuQuota'] != 100000 or limits['CpuPeriod'] != 100000 or
                any(limited['NetworkSettings']['Ports'].values())):
            raise ValueError('Build resource/port boundaries differ')
        PHASE = 'build-committed-image'
        args = [*buildx, 'build', '--builder', builder, '--load', '--progress', 'plain',
                '--metadata-file', str(work / 'build-metadata.json'), '-t', tag]
        for key, value in public.items():
            args += ['--build-arg', key + '=' + value]
        run([*args, str(source)], timeout=1200)
        image = json.loads(docker('image', 'inspect', tag).stdout)[0]
        if image['Config']['User'] != 'node':
            raise ValueError('Image runtime must not be root')
        proof = {'commit': commit, 'sourceArchiveSha256': request['archiveSha256'],
                 'sourceDirectory': str(source), 'imageTag': tag, 'imageId': image['Id'],
                 'imageSizeBytes': image['Size'], 'buildxVersion': version,
                 'buildxSha256': BUILDX_SHA, 'builderMemoryBytes': limits['Memory'],
                 'builderCpuLimit': 1, 'publicBuildNames': sorted(public),
                 'publicBuildFingerprint': hashlib.sha256(json.dumps(public, sort_keys=True).encode()).hexdigest(),
                 'runtimeUser': 'node', 'publicPorts': 0, 'existingContainers': baseline,
                 'paidAiCalls': 0, 'liveDatabaseConnection': False}
    finally:
        if created:
            PHASE = 'remove-dedicated-builder'
            run([*buildx, 'rm', '--force', builder], timeout=120)
    after = existing_state()
    if after != baseline:
        raise ValueError('Existing container state changed')
    proof['builderRemoved'] = True
    proof['existingContainersUnchanged'] = True
    private_file(work / 'build-proof.json', json.dumps(proof, indent=2).encode())
    return proof


def rehearse(request):
    global PHASE
    proof = request['buildProof']
    source = confined(ROOT, Path(proof['sourceDirectory']))
    image = proof['imageId']
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', image):
        raise ValueError('Pinned image required')
    tag_image = json.loads(docker('image', 'inspect', proof['imageTag']).stdout)[0]
    if tag_image['Id'] != image:
        raise ValueError('Image tag changed after build')
    baseline = existing_state()
    project = 'alterward-rehearsal-' + os.urandom(6).hex()
    network = project + '-proxy'
    with tempfile.TemporaryDirectory(prefix='runtime-', dir=ROOT) as temporary:
        fixture = Path(temporary)
        PHASE = 'fixture-certificates'
        run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
             '-subj', '/CN=Alterward isolated rehearsal CA', '-keyout', str(fixture / 'ca.key'),
             '-out', str(fixture / 'ca.crt'), '-addext', 'basicConstraints=critical,CA:TRUE'])
        run(['openssl', 'req', '-new', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=localhost',
             '-keyout', str(fixture / 'server.key'), '-out', str(fixture / 'server.csr')])
        private_file(fixture / 'server.ext', b'subjectAltName=DNS:localhost,DNS:postgres,DNS:alterward.com,DNS:www.alterward.com\nbasicConstraints=critical,CA:FALSE\nextendedKeyUsage=serverAuth\n')
        run(['openssl', 'x509', '-req', '-days', '1', '-in', str(fixture / 'server.csr'),
             '-CA', str(fixture / 'ca.crt'), '-CAkey', str(fixture / 'ca.key'), '-CAcreateserial',
             '-extfile', str(fixture / 'server.ext'), '-out', str(fixture / 'server.crt')])
        postgres = request['postgresImage']
        proxy = request['proxyImage']
        for pinned in [postgres, proxy]:
            if not re.fullmatch(r'sha256:[a-f0-9]{64}', pinned):
                raise ValueError('Fixture image must be pinned')
        group = int(docker('run', '--rm', '--network', 'none', '--entrypoint', 'id', postgres,
                           '-g', 'postgres').stdout.decode().strip())
        os.chown(fixture / 'server.key', 0, group)
        (fixture / 'server.key').chmod(0o640)
        (fixture / 'server.crt').chmod(0o644)
        (fixture / 'ca.crt').chmod(0o644)
        # All credentials below are disposable fixture values. There is no live DB/provider key.
        env = {'PUBLIC_HOST': 'localhost', 'ALTERWARD_TAG': proof['imageTag'].split(':', 1)[1],
               'ALTERWARD_PROXY_NETWORK': network,
               'NEXT_PUBLIC_SUPABASE_URL': 'https://example.supabase.co',
               'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': 'sb_publishable_rehearsal_unused',
               'SUPABASE_SERVICE_ROLE_KEY': 'rehearsal_admin_unused',
               'OPENAI_API_KEY': 'rehearsal_openai_unused',
               'DATABASE_URL': 'postgresql://postgres:rehearsal_unused@postgres:5432/postgres',
               'DATABASE_SSL_CA_HOST_FILE': str(fixture / 'ca.crt'),
               'AI_PROJECT_BUDGET_USD': '0', 'AI_USER_BUDGET_USD': '0',
               'CLOSED_BETA_ENABLED': 'true', 'CLOSED_BETA_USER_IDS': '',
               'CLOSED_SITE_ENABLED': 'true',
               'CLOUDFLARE_ACCESS_TEAM_DOMAIN': request['access']['teamDomain'],
               'CLOUDFLARE_ACCESS_AUD': request['access']['audience'],
               'CLOSED_SITE_ALLOWED_EMAILS': ','.join(request['access']['allowedEmails'])}
        flags = owner_overlay((source / 'deploy/closed-site-owner.flags.env').read_text())
        env.update(flags)
        # Enables the real owner catalog configuration, with a disposable secret.
        env['PUBLICATION_LINK_SECRET'] = '1' * 64
        if any('\n' in v or '\r' in v for v in env.values()):
            raise ValueError('Invalid fixture environment')
        env_file = fixture / 'fixture.env'
        private_file(env_file, ''.join(k + '=' + v + '\n' for k, v in env.items()).encode())
        # Exercise the prepared scoped proxy configuration without changing the
        # existing public proxy. Only its certificate source is a private fixture.
        proxy_candidate = request['proxyCandidate']
        origin_tls = 'tls /data/alterward-origin/origin.crt /data/alterward-origin/origin.key'
        if proxy_candidate.count(origin_tls) != 2:
            raise ValueError('Explicit origin certificate configuration required')
        fixture_proxy = proxy_candidate.replace(
            origin_tls, 'tls /fixture/server.crt /fixture/server.key')
        private_file(fixture / 'Caddyfile', (
            'https://localhost {\n tls /fixture/server.crt /fixture/server.key\n'
            ' handle /api/* {\n reverse_proxy alterward-api:4000\n }\n'
            ' handle {\n reverse_proxy alterward-web:3000\n }\n}\n' + fixture_proxy).encode())
        override = {'services': {
            'postgres': {'image': postgres, 'environment': {'POSTGRES_PASSWORD': 'rehearsal_unused'},
                         'command': ['postgres', '-c', 'ssl=on', '-c', 'ssl_cert_file=/fixture/server.crt',
                                     '-c', 'ssl_key_file=/fixture/server.key'],
                         'mem_limit': '512m', 'cpus': 0.5, 'pids_limit': 128,
                         'security_opt': ['no-new-privileges:true'],
                         'tmpfs': ['/var/lib/postgresql/data:rw,noexec,nosuid,size=384m'],
                         'volumes': [str(fixture / 'server.crt') + ':/fixture/server.crt:ro',
                                     str(fixture / 'server.key') + ':/fixture/server.key:ro'],
                         'networks': ['proxy', 'worker']},
            'smoke-proxy': {'image': proxy, 'mem_limit': '128m', 'cpus': 0.5, 'pids_limit': 64,
                            'cap_drop': ['ALL'], 'cap_add': ['NET_BIND_SERVICE'],
                            'security_opt': ['no-new-privileges:true'],
                            'volumes': [str(fixture / 'Caddyfile') + ':/etc/caddy/Caddyfile:ro',
                                        str(fixture / 'server.crt') + ':/fixture/server.crt:ro',
                                        str(fixture / 'server.key') + ':/fixture/server.key:ro'],
                            'networks': ['proxy']}}, 'networks': {'worker': {'internal': True}}}
        override_file = fixture / 'override.json'
        private_file(override_file, json.dumps(override).encode())
        compose_args = ['docker', 'compose', '--project-name', project, '--env-file', str(env_file),
                        '-f', str(source / 'deploy/compose.contabo.yaml'), '-f', str(override_file)]
        def compose(*args, **kwargs):
            return run([*compose_args, *args], **kwargs)
        PHASE = 'fixture-compose-boundaries'
        config = json.loads(compose('config', '--format', 'json').stdout)
        validate_owner_configuration(config, request['access'], flags)
        if set(config['services']) != {'web', 'api', 'worker', 'postgres', 'smoke-proxy'}:
            raise ValueError('Unexpected service set')
        if any(service.get('ports') for service in config['services'].values()):
            raise ValueError('A fixture service publishes ports')
        total_memory = sum(int(config['services'][s]['mem_limit']) for s in ['web', 'api', 'worker'])
        if total_memory != 2816 * 1024**2:
            raise ValueError('Runtime limits differ')
        created = False
        try:
            docker('network', 'create', '--internal', '--label', 'com.alterward.rehearsal=' + project, network)
            created = True
            PHASE = 'fixture-postgres-start'
            compose('up', '-d', '--no-build', 'postgres')
            deadline = time.monotonic() + 60
            while compose('exec', '-T', 'postgres', 'pg_isready', '-U', 'postgres', check=False).returncode:
                if time.monotonic() > deadline:
                    raise RuntimeError('Fixture postgres unavailable')
                time.sleep(1)
            compose('exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1',
                    '-c', 'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;')
            PHASE = 'verified-tls-migrations'
            compose('run', '--rm', '--no-deps', 'api', 'pnpm', 'db:migrate')
            compose('run', '--rm', '--no-deps', 'api', 'pnpm', 'db:migrate')
            PHASE = 'start-isolated-runtime'
            compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '90', 'web', 'api', 'worker')
            compose('up', '-d', '--no-build', 'smoke-proxy')
            PHASE = 'closed-site-http-and-egress'
            checker = request['checker']
            result = compose('exec', '-T', 'api', 'node', '--input-type=module',
                             input=checker.encode(), timeout=90).stdout
            checks = json.loads(result)
            for service in ['web', 'api', 'worker']:
                code = "const net=require('node:net');const s=net.connect(443,'1.1.1.1');s.on('connect',()=>{s.destroy();process.exit(1)});s.on('error',()=>process.exit(0));s.setTimeout(1500,()=>{s.destroy();process.exit(0)});"
                compose('exec', '-T', service, 'node', '-e', code, timeout=10)
            PHASE = 'worker-graceful-stop'
            worker_id = compose('ps', '-q', 'worker').stdout.decode().strip()
            compose('stop', '-t', '15', 'worker', timeout=30)
            stopped = json.loads(docker('inspect', worker_id).stdout)[0]['State']
            if stopped['ExitCode'] != 0 or stopped['OOMKilled']:
                raise ValueError('Worker did not stop cleanly')
            PHASE = 'life-process-kill-recovery'
            recovery = compose('exec', '-T', '-e', 'ALTERWARD_RECOVERY_FIXTURE=true',
                               'api', 'node', '--import', 'tsx', '--input-type=module',
                               input=request['lifeRecoveryChecker'].encode(), timeout=180).stdout
            recovery_checks = json.loads(recovery)
            if recovery_checks.get('processRecovery') != 'passed' or recovery_checks.get('paidAiCalls') != 0:
                raise ValueError('Isolated life recovery did not pass')
            result = {'commit': proof['commit'], 'imageId': image, 'migrationsRepeated': True,
                      'applicationMemoryLimitBytes': total_memory, 'publicPorts': 0,
                      'databaseMajor': 17, 'databaseTlsVerified': True,
                      'accessConfigMatchesDashboard': True, 'accessOwnerCount': len(request['access']['allowedEmails']),
                      'renderedOwnerGateValidated': True, 'enabledOwnerCatalogFlags': 4,
                      'paidAuthUuidCount': 0, 'betaWindowActive': False,
                      'liveDatabaseConnection': False, 'liveDatabaseWrites': False,
                      'paidAiCalls': 0, 'runtimeEgressProbesBlocked': 3,
                      'httpChecks': checks, 'workerExitCode': 0,
                      'lifeProcessRecovery': recovery_checks,
                      'proxyCandidateSha256': hashlib.sha256(proxy_candidate.encode()).hexdigest()}
        except Exception:
            # Preserve diagnostics from only our disposable project before cleanup.
            # Even fixture logs can contain the owner address: never print them.
            try:
                diagnostic = {'phase': PHASE,
                              'services': compose('ps', '-a', '--format', 'json', check=False).stdout.decode(errors='replace'),
                              'logs': compose('logs', '--no-color', '--tail', '80', check=False).stdout.decode(errors='replace')[-32768:]}
                private_file(ROOT / ('runtime-diagnostic-' + str(time.time_ns()) + '.json'),
                             json.dumps(diagnostic).encode())
            except Exception:
                pass
            raise
        finally:
            if created:
                failed_phase = PHASE
                had_failure = sys.exc_info()[0] is not None
                PHASE = 'remove-dedicated-fixtures'
                compose('down', '--volumes', '--remove-orphans', timeout=90)
                inspected = json.loads(docker('network', 'inspect', network).stdout)[0]
                if inspected.get('Containers') or inspected.get('Labels', {}).get('com.alterward.rehearsal') != project:
                    raise ValueError('Refusing to remove shared network')
                docker('network', 'rm', network)
                if had_failure:
                    PHASE = failed_phase
    if existing_state() != baseline:
        raise ValueError('Existing container state changed')
    result['existingContainersUnchanged'] = True
    result['temporaryFixturesRemoved'] = True
    return result


def main():
    os.umask(0o077)
    if os.geteuid() != 0 or OPERATOR_ROOT.is_symlink():
        raise ValueError('Pinned root-only operator context required')
    private_directory(ROOT)
    request = json.load(sys.stdin)
    if request['action'] == 'build':
        return build(request)
    if request['action'] == 'rehearse':
        return rehearse(request)
    raise ValueError('Unknown target action')


if __name__ == '__main__':
    try:
        print(json.dumps({'ok': True, 'result': main()}))
    except Exception:
        print(json.dumps({'ok': False, 'phase': PHASE}))
        sys.exit(1)
