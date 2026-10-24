"""Explicit local Linux/root rehearsal of one immutable release image.

No SSH, production paths, external database, provider keys or CI impersonation.
The selected image serves both target/recovery roles; distinct pairs are refused.
"""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import signal
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import uuid

REPO = Path(__file__).resolve().parents[2]
PG = 'postgres@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826'
LABEL = 'com.alterward.image-rehearsal'
IMAGE = re.compile(r'sha256:[a-f0-9]{64}')
CHECKS = {'success', 'stale', 'postcheck', 'interruption', 'locks', 'reservations',
          'leases', 'incompatibleRecovery', 'foreign', 'fundedState', 'artifactRestore',
          'privacyReplay', 'frozenPolicies', 'expiredPreparationArchive', 'probeCleanup', 'fundedReplayProof'}
ENV = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8',
       'DOCKER_HOST': 'unix:///var/run/docker.sock', 'PYTHONDONTWRITEBYTECODE': '1'}


def run(args, data=None, timeout=180):
    result = subprocess.run(args, input=data, capture_output=True, timeout=timeout, cwd=REPO, env=ENV)
    if result.returncode:
        raise RuntimeError('Isolated image rehearsal command failed: ' + args[0])
    return result.stdout


def validate_image(value):
    if not isinstance(value, str) or not IMAGE.fullmatch(value):
        raise ValueError('Explicit immutable local image ID required')
    return value


def validate_image_configuration(info, expected):
    if info.get('Id') != validate_image(expected):
        raise ValueError('Image ID changed')
    cfg = info['Config']
    if cfg.get('User') != 'node' or cfg.get('WorkingDir') != '/app' or cfg.get('Entrypoint') != ['docker-entrypoint.sh']:
        raise ValueError('Reviewed runtime image configuration required')
    for item in cfg.get('Env', []):
        key = item.split('=', 1)[0]
        if key in {'NODE_OPTIONS', 'NODE_PATH', 'DATABASE_URL'} or (
            re.search(r'(KEY|TOKEN|SECRET|PASSWORD)', key) and key not in {'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'}):
            raise ValueError('Image with private credentials or Node injection is refused')


def source_binding():
    git = ['git', '-c', 'safe.directory=' + str(REPO)]
    if run(git + ['status', '--porcelain']).strip():
        raise ValueError('Clean committed rehearsal checkout required')
    commit = run(git + ['rev-parse', 'HEAD']).decode().strip()
    if not re.fullmatch(r'[a-f0-9]{40}', commit):
        raise ValueError('Exact committed source required')
    paths = run(git + ['ls-tree', '-r', '--name-only', commit]).decode().splitlines()
    # Verify tracked executable bytes before importing the shared bundle helper.
    for name in paths:
        if name.startswith(('scripts/', 'tests/')):
            p = REPO / name
            info = p.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or p.resolve() != p or p.read_bytes() != run(git + ['show', commit + ':' + name]):
                raise ValueError('Exact committed regular source files required')
    code = """import{readFileSync}from'node:fs';import{fundedSourceBundle}from'./scripts/lib/funded-upgrade.mjs';
const paths=JSON.parse(readFileSync(0,'utf8'));console.log(JSON.stringify(fundedSourceBundle(paths,p=>readFileSync(p))));"""
    bundle = json.loads(run(['node', '--input-type=module', '-e', code], json.dumps(paths).encode()))
    for name, digest in bundle['sourceHashes'].items():
        expected = run(git + ['show', commit + ':' + name])
        if hashlib.sha256(expected).hexdigest() != digest:
            raise ValueError('Bundle differs from committed source')
    return {'sourceCommit': commit, **bundle}


def clean_container(name, owner, image):
    ids = run(['docker', 'ps', '-aq', '--no-trunc', '--filter', 'name=^/'+re.escape(name)+'$']).decode().split()
    if not ids:
        return
    if len(ids) != 1:
        raise ValueError('Ambiguous owned cleanup identity')
    info = json.loads(run(['docker', 'inspect', ids[0]]))[0]
    if (info['Name'] != '/'+name or info['Image'] != image or
            info['Config'].get('Labels', {}).get(LABEL) != owner):
        raise ValueError('Foreign container cannot be cleaned')
    run(['docker', 'rm', '-f', info['Id']])


def verify_image_sources(image, binding):
    code = """import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
const h=JSON.parse(readFileSync(0,'utf8'));for(const[p,v]of Object.entries(h))if(createHash('sha256').update(readFileSync('/app/'+p)).digest('hex')!==v)throw Error('Image source mismatch');
const{fundedRuntimeCapabilities}=await import('/app/scripts/lib/funded-runtime.ts');console.log(JSON.stringify(fundedRuntimeCapabilities()));"""
    # Explicit command, no image CMD/entrypoint execution, no network or secrets.
    owner = 'alterward-image-rehearsal-' + uuid.uuid4().hex[:24]
    name = owner + '-source'
    try:
        capability = json.loads(run(['docker', 'run', '--rm', '--name', name, '--label', LABEL+'='+owner, '-i', '--network', 'none',
        '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges:true', '--memory', '512m', '--cpus', '1',
        '--pids-limit', '128', '--user', 'node', '--entrypoint', 'node', image,
        '--import', 'tsx', '--input-type=module', '-e', code], json.dumps(binding['sourceHashes']).encode()))
    finally:
        clean_container(name, owner, image)
    if capability.get('version') != 'alterward-funded-runtime-1' or 'fiction-v9' not in capability.get('policies', []):
        # Keep exact capability shape interpretation in the production System.image too.
        raise ValueError('V9 runtime capability required')


def reserve_output(path):
    if not path.is_absolute() or path.resolve() != path or not path.parent.is_dir():
        raise ValueError('New absolute non-aliased output directory required')
    path.mkdir(mode=0o700)  # Never overwrites an old proof or preparation.
    return path


def require_proof(proof, image, binding):
    if (set(proof) != {'sourceCommit', 'bundleSha256', 'targetImage', 'recoveryImage', 'checks', 'privacyFixtureSha256', 'paidAiCalls'} or
            proof['sourceCommit'] != binding['sourceCommit'] or proof['bundleSha256'] != binding['bundleSha256'] or
            proof['targetImage'] != image or proof['recoveryImage'] != image or proof['paidAiCalls'] != 0 or
            set(proof['checks']) != CHECKS or any(v is not True for v in proof['checks'].values()) or
            not re.fullmatch(r'[a-f0-9]{64}', proof['privacyFixtureSha256'])):
        raise ValueError('Complete actual image/source-bound fixture proof required')


def execute(image, output):
    if sys.platform != 'linux' or os.geteuid() != 0:
        raise ValueError('Explicit local Linux/root Docker execution required')
    validate_image(image)
    for program in ('docker', 'git', 'node', 'openssl', 'age', 'age-keygen'):
        if not shutil.which(program, path=ENV['PATH']):
            raise ValueError('Missing preinstalled rehearsal dependency: ' + program)
    if shutil.disk_usage(tempfile.gettempdir()).free < 2 * 1024**3:
        raise ValueError('At least 2 GiB scratch capacity required')
    available = re.search(r'^MemAvailable:\s+(\d+) kB$', Path('/proc/meminfo').read_text(), re.M)
    if not available or int(available[1]) < 3 * 1024**2:
        raise ValueError('At least 3 GiB currently available memory required')
    binding = source_binding()
    validate_image_configuration(json.loads(run(['docker', 'image', 'inspect', image]))[0], image)
    run(['docker', 'image', 'inspect', PG])  # Cached pinned input only, no implicit pull.
    verify_image_sources(image, binding)
    # Global exclusive lock protects nonce-owned fixtures and tag creation on this daemon.
    lock_path = Path('/run/lock/alterward-image-rehearsal.lock')
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'r+') as lock:
        info = os.fstat(lock.fileno())
        if info.st_uid != 0 or info.st_nlink != 1 or not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600:
            raise ValueError('Original root-only rehearsal lock required')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return isolated(image, output, binding)


def isolated(image, output, binding):
    output = reserve_output(output)
    nonce = uuid.uuid4().hex[:24]
    network = 'alterward-image-rehearsal-' + nonce
    name = network + '-postgres'
    scratch = Path(tempfile.mkdtemp(prefix='alterward-image-rehearsal-')).resolve()
    scratch.chmod(0o700)
    os.environ.clear()
    os.environ.update(ENV)
    with (output/'rehearsal-intent.json').open('x', encoding='utf8') as handle:
        os.chmod(output/'rehearsal-intent.json', 0o600)
        json.dump({**{k: binding[k] for k in ('sourceCommit', 'bundleSha256')}, 'imageId': image, 'network': network, 'postgresName': name, 'scratchDirectory': str(scratch), 'state': 'started', 'syntheticDataOnly': True}, handle)
    spec = importlib.util.spec_from_file_location('image_rehearsal_engine', REPO / 'scripts/ops/contabo-funded-fixture-engine.py')
    engine = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(engine)
    baseline = engine.upgrade.foreign_state()
    created_network = False
    pg_id = None
    proof = None
    pg_image = json.loads(run(['docker', 'image', 'inspect', PG]))[0]['Id']
    privacy_name = network + '-privacy'
    # Child operations, including the shared engine, see only the fixed local environment.
    try:
        ca, key, cert = scratch/'ca.crt', scratch/'server.key', scratch/'server.crt'
        run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
             '-subj', '/CN=isolated image rehearsal', '-keyout', str(scratch/'ca.key'), '-out', str(ca),
             '-addext', 'basicConstraints=critical,CA:TRUE'])
        run(['openssl', 'req', '-new', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=postgres',
             '-keyout', str(key), '-out', str(scratch/'server.csr')])
        (scratch/'server.ext').write_text('subjectAltName=DNS:postgres\nbasicConstraints=critical,CA:FALSE\nextendedKeyUsage=serverAuth\n')
        run(['openssl', 'x509', '-req', '-days', '1', '-in', str(scratch/'server.csr'), '-CA', str(ca),
             '-CAkey', str(scratch/'ca.key'), '-CAcreateserial', '-extfile', str(scratch/'server.ext'), '-out', str(cert)])
        gid = run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'id', PG, '-g', 'postgres']).decode().strip()
        if not re.fullmatch(r'[0-9]+', gid):
            raise ValueError('Pinned PostgreSQL group required')
        os.chown(key, 0, int(gid)); key.chmod(0o640); ca.chmod(0o644); cert.chmod(0o644)
        run(['docker', 'network', 'create', '--internal', '--label', LABEL+'='+network, network])
        created_network = True
        pg_id = run(['docker', 'run', '-d', '--name', name, '--label', LABEL+'='+network, '--label', 'com.docker.compose.service=postgres',
             '--network', network, '--network-alias', 'postgres', '--user', 'postgres', '--read-only',
             '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--memory', '1g', '--cpus', '1', '--pids-limit', '256',
             '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,size=512m', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
             '--tmpfs', '/var/run/postgresql:rw,nosuid,size=16m',
             '--mount', 'type=bind,src='+str(cert)+',dst=/fixture/server.crt,readonly',
             '--mount', 'type=bind,src='+str(key)+',dst=/fixture/server.key,readonly',
             '-e', 'POSTGRES_PASSWORD=ci_unused_outside_fixture', '-e', 'PGDATA=/var/lib/postgresql/data/pgdata', PG,
             'postgres', '-c', 'ssl=on', '-c', 'ssl_cert_file=/fixture/server.crt', '-c', 'ssl_key_file=/fixture/server.key']).decode().strip()
        if not re.fullmatch(r'[a-f0-9]{64}', pg_id):
            raise ValueError('Actual owned PostgreSQL container ID required')
        for attempt in range(30):
            try:
                run(['docker', 'exec', pg_id, 'pg_isready', '-U', 'postgres'], timeout=5)
                break
            except RuntimeError:
                if attempt == 29: raise
                time.sleep(1)
        run(['docker', 'exec', pg_id, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
             'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;'])
        privacy_raw = run(['docker', 'run', '--rm', '--name', privacy_name, '--label', LABEL+'='+network, '--network', network, '--user', 'node', '--read-only',
             '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
             '--memory', '512m', '--cpus', '1', '--pids-limit', '128',
             '--mount', 'type=bind,src='+str(ca)+',dst=/run/secrets/supabase-ca.crt,readonly',
             '-e', 'ALTERWARD_PRIVACY_FIXTURE=true', '-e', 'AI_PROJECT_BUDGET_USD=0', '-e', 'AI_USER_BUDGET_USD=0',
             '-e', 'DATABASE_URL=postgresql://postgres:ci_unused_outside_fixture@postgres:5432/postgres',
             '-e', 'DATABASE_SSL_CA_FILE=/run/secrets/supabase-ca.crt', '-e', 'DATABASE_SSL_REJECT_UNAUTHORIZED=true',
             '--entrypoint', 'node', image, 'node_modules/tsx/dist/cli.mjs', '--tsconfig', 'tsconfig.scripts.json', 'scripts/smoke-privacy-restore.ts'])
        context = {**binding, 'image': image, 'databaseNetwork': network, 'postgres': pg_id, 'ca': str(ca), 'privacy': json.loads(privacy_raw)}
        # Synthetic-only diagnostics stay private and bounded by the existing engine.
        with contextlib.redirect_stderr(io.StringIO()):
            proof = engine.exercise(context, scope='image-rehearsal')
        require_proof(proof, image, binding)
        if source_binding() != binding:
            raise ValueError('Rehearsal source changed while running')
    finally:
        # Publish no success unless every cleanup step and foreign-state comparison succeeds.
        failures = []
        for container, expected in ((privacy_name, image), (name, pg_image)):
            try: clean_container(container, network, expected)
            except BaseException: failures.append('container-cleanup')
        if created_network:
            try: run(['docker', 'network', 'rm', network])
            except BaseException: failures.append('network-cleanup')
        try: shutil.rmtree(scratch)
        except BaseException: failures.append('scratch-cleanup')
        if engine.upgrade.foreign_state() != baseline:
            failures.append('foreign-state-drift')
        if failures:
            raise RuntimeError('Image rehearsal cleanup incomplete: ' + ','.join(failures))
    require_proof(proof, image, binding)
    for filename, value in [('funded-upgrade-fixture-proof.json', proof), ('image-rehearsal-receipt.json', {
            'version': 'alterward-image-rehearsal-1', 'sourceCommit': binding['sourceCommit'], 'imageId': image,
            'capturedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'syntheticDataOnly': True,
            'cleanupVerified': True, 'foreignContainersUnchanged': True, 'paidAiCalls': 0,
            'fixtureSha256': hashlib.sha256((json.dumps(proof, sort_keys=True, separators=(',', ':'))+'\n').encode()).hexdigest()} )]:
        with (output/filename).open('x', encoding='utf8') as handle:
            os.chmod(output/filename, 0o600)
            handle.write(json.dumps(value, sort_keys=True, separators=(',', ':'))+'\n')
    return proof


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', required=True)
    parser.add_argument('--output-directory', required=True, type=Path)
    args = parser.parse_args()
    def interrupted(*_):
        raise KeyboardInterrupt('Image rehearsal interrupted')
    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, interrupted)
    execute(args.image, args.output_directory)
    print(json.dumps({'imageRehearsal': 'passed', 'paidAiCalls': 0, 'proofSaved': True}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Isolated image rehearsal failed; no release authorization.', file=sys.stderr)
        sys.exit(1)
