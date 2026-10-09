"""Stage or launch only the pinned owner stack; never touches DNS or Caddy.

The server-resident env and the frozen effective Compose configuration are
hash-bound to the saved workstation proof. Failed launches remove this project.
"""

import base64
import hashlib
import json
import os
from pathlib import Path
import stat
import sys

from alterward_backup import ROOT as OPERATOR_ROOT, private_directory, private_file
from alterward_target import docker, existing_state, run
from alterward_owner import validate_inputs, render_owner

DIRECTORY = OPERATOR_ROOT / 'owner'
PROJECT = 'alterward-owner'
NETWORK = 'alterward_proxy'
CA = Path('/etc/alterward/supabase-ca.crt')
FILES = ['server.env', 'pinned-image.json', 'effective-compose.json', 'manifest.json']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def frozen(config):
    # Compose interpolates strings again when a rendered JSON becomes its input.
    # Escape literal dollars so a credential cannot become a host env reference.
    def escape(value):
        if isinstance(value, str):
            return value.replace('$', '$$')
        if isinstance(value, dict):
            return {key: escape(item) for key, item in value.items()}
        if isinstance(value, list):
            return [escape(item) for item in value]
        return value
    return encoded(escape(config))


def read_private(path):
    # Inspect before resolve/open: a symlink to another regular secret is unsafe.
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != 0 or
            stat.S_IMODE(info.st_mode) != 0o600):
        raise ValueError('Root-only regular activation file required')
    return path.read_bytes()


def exact_file(path, data, *, public=False):
    if path.exists() or path.is_symlink():
        info = path.lstat()
        mode = 0o644 if public else 0o600
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != 0 or
                stat.S_IMODE(info.st_mode) != mode or path.read_bytes() != data):
            raise ValueError('Existing activation file differs')
    else:
        private_file(path, data)
        if public:
            path.chmod(0o644)  # Public CA must be readable by the node container.


def project_ids():
    return docker('ps', '-aq', '--filter', 'label=com.docker.compose.project=' + PROJECT).stdout.decode().split()


def source_hash(source):
    return sha(b''.join((source / name).read_bytes() for name in
                       ['deploy/compose.yaml', 'deploy/compose.contabo.yaml',
                        'deploy/closed-site-owner.flags.env']))


def verify_hashes(manifest, expected, env_bytes, config_bytes, source, ca_bytes):
    keys = ['commit', 'imageId', 'ownerEnvironmentSha256', 'effectiveComposeSha256',
            'sourceComposeSha256', 'databaseCaSha256', 'accessConfigurationSha256']
    if any(manifest.get(key) != expected.get(key) for key in keys):
        raise ValueError('Server manifest differs from saved stage proof')
    if (sha(env_bytes) != manifest['ownerEnvironmentSha256'] or
            sha(config_bytes) != manifest['effectiveComposeSha256'] or
            source_hash(source) != manifest['sourceComposeSha256'] or
            sha(ca_bytes) != manifest['databaseCaSha256']):
        raise ValueError('Staged activation input changed')


def validate_running(containers, config, image):
    by_service = {}
    for item in containers:
        labels = item['Config'].get('Labels', {})
        name = labels.get('com.docker.compose.service')
        if labels.get('com.docker.compose.project') != PROJECT or name in by_service:
            raise ValueError('Unexpected running project member')
        by_service[name] = item
    if set(by_service) != {'web', 'api', 'worker'}:
        raise ValueError('Incomplete running owner stack')
    for name, item in by_service.items():
        service, host, state = config['services'][name], item['HostConfig'], item['State']
        environment = {}
        for entry in item['Config'].get('Env', []):
            key, value = entry.split('=', 1)
            if key in environment:
                raise ValueError('Duplicate running environment key')
            environment[key] = value
        expected = service['environment']
        if any(environment.get(key) != str(value) for key, value in expected.items()):
            raise ValueError('Running environment differs from frozen configuration')
        if any(environment.get(key) for key in ['ANTHROPIC_API_KEY', 'SMTP_PASSWORD']):
            raise ValueError('Unexpected runtime provider credential')
        if (item['Image'] != image or item['Config']['User'] != 'node' or
                host.get('PortBindings') or
                any(value for value in item['NetworkSettings']['Ports'].values()) or
                host.get('Privileged') or host.get('CapDrop') != ['ALL'] or
                'no-new-privileges:true' not in host.get('SecurityOpt', []) or
                not host.get('Init') or host.get('Memory') != int(service['mem_limit']) or
                host.get('PidsLimit') != service['pids_limit'] or
                host.get('NanoCpus') != int(float(service['cpus']) * 1_000_000_000)):
            raise ValueError('Running image, port or resource protection differs')
        if (state.get('Status') != 'running' or state.get('OOMKilled') or
                item.get('RestartCount') != 0 or
                (name != 'worker' and state.get('Health', {}).get('Status') != 'healthy')):
            raise ValueError('Running owner service is unhealthy')
        if name in ['api', 'worker']:
            mounts = [m for m in item['Mounts'] if m['Destination'] == '/run/secrets/supabase-ca.crt']
            if len(mounts) != 1 or mounts[0]['Source'] != str(CA) or mounts[0]['RW']:
                raise ValueError('Running database CA mount differs')
    return by_service


def stage(request):
    if project_ids():
        raise ValueError('Stage cannot replace an existing owner project')
    text = request['ownerEnvironment']
    source, image, flags, environment = validate_inputs(request, text)
    if environment.get('DATABASE_SSL_CA_HOST_FILE') != str(CA):
        raise ValueError('Unexpected protected database CA path')
    ca_bytes = base64.b64decode(request['databaseCa'], validate=True)
    if sha(ca_bytes) != request['databaseCaSha256'] or b'BEGIN CERTIFICATE' not in ca_bytes:
        raise ValueError('Verified database CA required')
    baseline = existing_state()
    private_directory(DIRECTORY)
    if CA.parent.is_symlink():
        raise ValueError('Linked database CA directory')
    CA.parent.mkdir(mode=0o700, exist_ok=True)
    if CA.parent.stat().st_uid != 0 or stat.S_IMODE(CA.parent.stat().st_mode) != 0o700:
        raise ValueError('Private database CA directory required')
    exact_file(CA, ca_bytes, public=True)
    exact_file(DIRECTORY / 'server.env', text.encode())
    override = {'services': {name: {'image': image, 'pull_policy': 'never'}
                            for name in ['web', 'api', 'worker']}}
    exact_file(DIRECTORY / 'pinned-image.json', encoded(override))
    config = render_owner(source, image, flags, request['access'],
                          DIRECTORY / 'server.env', DIRECTORY / 'pinned-image.json')
    exact_file(DIRECTORY / 'effective-compose.json', frozen(config))
    roundtrip = json.loads(run(['docker', 'compose', '--project-name', PROJECT, '-f',
        str(DIRECTORY / 'effective-compose.json'), 'config', '--format', 'json']).stdout)
    if any(roundtrip['services'][name]['environment'] != service['environment'] or
           roundtrip['services'][name]['command'] != service['command']
           for name, service in config['services'].items()):
        raise ValueError('Frozen Compose interpolation changed runtime values')
    manifest = {'commit': request['buildProof']['commit'], 'imageId': image,
                'ownerEnvironmentSha256': sha(text.encode()),
                'effectiveComposeSha256': sha(frozen(config)),
                'sourceComposeSha256': source_hash(source), 'databaseCaSha256': sha(ca_bytes),
                'accessConfigurationSha256': sha(encoded(request['access']))}
    exact_file(DIRECTORY / 'manifest.json', encoded(manifest))
    if existing_state() != baseline:
        raise ValueError('Staging changed existing containers')
    return {**manifest, 'staged': True, 'frozenComposeRoundtripVerified': True,
            'containersStarted': 0,
            'databaseConnections': 0, 'paidAiCalls': 0,
            'dnsChanged': False, 'proxyChanged': False, 'existingContainersUnchanged': True}


def launch(request):
    if project_ids():
        raise ValueError('Only an initial, absent owner project may be launched')
    env_bytes = read_private(DIRECTORY / 'server.env')
    manifest = json.loads(read_private(DIRECTORY / 'manifest.json'))
    config_bytes = read_private(DIRECTORY / 'effective-compose.json')
    read_private(DIRECTORY / 'pinned-image.json')
    source, image, flags, _ = validate_inputs(request, env_bytes.decode())
    verify_hashes(manifest, request['stageProof'], env_bytes, config_bytes, source, CA.read_bytes())
    if manifest['accessConfigurationSha256'] != sha(encoded(request['access'])):
        raise ValueError('Dashboard Access configuration changed')
    config = render_owner(source, image, flags, request['access'],
                          DIRECTORY / 'server.env', DIRECTORY / 'pinned-image.json')
    if frozen(config) != config_bytes:
        raise ValueError('Fresh render differs from frozen launch configuration')
    baseline = existing_state()
    networks = docker('network', 'ls', '--filter', 'name=^' + NETWORK + '$', '-q').stdout.decode().split()
    if not networks:
        docker('network', 'create', '--label', 'com.alterward.owner=true', NETWORK)
    network = json.loads(docker('network', 'inspect', NETWORK).stdout)[0]
    if (network['Driver'] != 'bridge' or network['Internal'] or network['Containers'] or
            network['Labels'].get('com.alterward.owner') != 'true'):
        raise ValueError('Unexpected initial owner proxy network')
    command = ['docker', 'compose', '--project-name', PROJECT,
               '-f', str(DIRECTORY / 'effective-compose.json')]
    attempted = False
    try:
        # Up consumes this exact frozen JSON, not a second env interpolation.
        attempted = True
        # Empty paid UUIDs prevent provider calls, but an old queued job could
        # still be claimed and failed. Refuse startup before that can happen.
        queue_probe = """import {connectDatabase} from '@future-flow/database';const db=connectDatabase(process.env.DATABASE_URL,true);try{const result=await db.transaction(async tx=>{await tx.query('SET TRANSACTION READ ONLY');const counts=[];for(const table of ['ff_jobs','aw_jobs','aw_shared_jobs','aw_public_review_jobs','aw_public_content_reviews']){const rows=await tx.query(`SELECT count(*)::int AS pending FROM ${table} WHERE status IN ('queued','running','validating')`);counts.push(rows[0].pending)}const tls=await tx.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()');if(tls[0]?.ssl!==true||counts.some(n=>n!==0))throw Error('Owner startup queue or TLS guard failed');return {pendingJobs:0,databaseTlsVerified:true}});console.log(JSON.stringify(result))}finally{await db.close()}"""
        queue_checks = json.loads(run(command + ['run', '-T', '--rm', '--no-deps',
                    '--entrypoint', 'node', 'api', '--input-type=module', '-e', queue_probe],
                    timeout=60).stdout)
        run(command + ['up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '120'], timeout=180)
        ids = project_ids()
        containers = json.loads(docker('inspect', *ids).stdout) if ids else []
        services = validate_running(containers, config, image)
        probe = """let count=0;for(const url of ['http://alterward-web:3000/','http://alterward-web:3000/discover','http://127.0.0.1:4000/api/public/discovery','http://127.0.0.1:4000/api/public/config']){const r=await fetch(url,{signal:AbortSignal.timeout(5000),redirect:'manual'});if(r.status!==403||!r.headers.get('cache-control')?.includes('no-store'))throw Error('Origin access boundary failed');count++}console.log(JSON.stringify({anonymousDenied:count}));"""
        checks = json.loads(docker('exec', services['api']['Id'], 'node', '--input-type=module',
                                   '-e', probe).stdout)
        # Root edits during launch are detected too; failed launches are stopped.
        verify_hashes(manifest, request['stageProof'], read_private(DIRECTORY / 'server.env'),
                      read_private(DIRECTORY / 'effective-compose.json'), source, CA.read_bytes())
        current = {key: value for key, value in existing_state().items() if key not in ids}
        if current != baseline:
            raise ValueError('Existing containers changed during launch')
        return {**manifest, **checks, **queue_checks, 'runningServices': 3, 'imageIdPinned': True,
                'runningEnvironmentVerified': True, 'publicPorts': 0,
                'paidAiCalls': 0, 'betaWindowActive': False,
                'existingContainersUnchanged': True, 'dnsChanged': False, 'proxyChanged': False}
    except Exception:
        if attempted:
            run(command + ['down', '--remove-orphans'], timeout=180)
            if project_ids():
                raise RuntimeError('Failed owner launch cleanup incomplete')
        raise


if __name__ == '__main__':
    try:
        import fcntl
        private_directory(DIRECTORY)
        lock = DIRECTORY / 'activation.lock'
        if not lock.exists():
            private_file(lock, b'')
        read_private(lock)
        with lock.open('rb') as handle:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            request = json.load(sys.stdin)
            action = request['action']
            if action not in ['stage', 'launch']:
                raise ValueError('Explicit activation action required')
            result = stage(request) if action == 'stage' else launch(request)
        print(json.dumps({'ok': True, 'result': result}))
    except Exception:
        print(json.dumps({'ok': False, 'phase': 'guarded-owner-activation'}))
        sys.exit(1)
