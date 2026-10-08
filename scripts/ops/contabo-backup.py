"""Root-only backup rehearsal. JSON over SSH stdin; never restores a live DB.

No application, worker, outbound email, public ports, or live proxy reload.
Credentials and decryption identities are temporary private files, not argv/env.
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

ROOT = Path('/root/alterward-ops')
LABEL = 'com.alterward.backup-rehearsal'
PHASE = 'validation'


def run(args, *, input=None, timeout=120, check=True):
    result = subprocess.run(args, input=input, capture_output=True, timeout=timeout)
    if check and result.returncode:
        # Provider/psql output may contain credentials or user content.
        if ROOT.is_dir():
            private_file(ROOT / ('command-failure-' + str(time.time_ns()) + '.json'),
                         json.dumps({'phase': PHASE, 'program': args[0],
                                     'stderr': result.stderr.decode(errors='replace')[:32768]}).encode())
        raise RuntimeError('Command failed')
    return result


def private_file(path, data):
    with path.open('xb') as handle:
        os.chmod(path, 0o600)
        handle.write(data)


def private_directory(path):
    if path.is_symlink():
        raise ValueError('Private directory cannot be linked')
    confined(ROOT, path)
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path, 0o700)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def confined(root, path):
    resolved = path.resolve()
    if resolved == root.resolve() or root.resolve() not in resolved.parents:
        raise ValueError('Path outside dedicated workspace')
    return resolved


def safe_extract(data, destination):
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        members = archive.getmembers()
        if len(members) > 10000 or sum(m.size for m in members) > 128 * 1024**2:
            raise ValueError('Archive exceeds limits')
        names = set()
        for member in members:
            # Reject path aliases before any writes, not merely duplicate strings.
            if (not member.isfile() or member.name in names or
                    '\\' in member.name or
                    any(part in ['', '.', '..'] for part in member.name.split('/'))):
                raise ValueError('Only unique regular files can be restored')
            confined(destination, destination / member.name)
            names.add(member.name)
        # No links or special files. Never extract over a live path.
        for member in members:
            path = destination / member.name
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            private_file(path, archive.extractfile(member).read())


def proxy_container():
    ids = run(['docker', 'ps', '-q']).stdout.decode().split()
    containers = json.loads(run(['docker', 'inspect', *ids]).stdout)
    matches = []
    for container in containers:
        ports = container['NetworkSettings']['Ports'].get('443/tcp') or []
        if 'caddy' in container['Config']['Image'] and any(
            p['HostPort'] == '443' for p in ports
        ):
            matches.append(container)
    if len(matches) != 1:
        raise ValueError('Expected one existing public Caddy')
    return matches[0]


def config_archive(container):
    mounts = {m['Destination']: m for m in container['Mounts']}
    paths = []
    for destination in ['/data', '/config', '/etc/caddy/Caddyfile']:
        mount = mounts.get(destination)
        if not mount or mount['Type'] != 'bind':
            raise ValueError('Unexpected proxy mount layout')
        paths.append(Path(mount['Source']))
    labels = container['Config'].get('Labels', {})
    directory = Path(labels['com.docker.compose.project.working_dir'])
    for name in labels['com.docker.compose.project.config_files'].split(','):
        paths.append(directory / name)
    if (directory / '.env').exists():
        paths.append(directory / '.env')
    for name in ['/etc/ssh/sshd_config',
                 '/etc/ssh/sshd_config.d/00-alterward-ops.conf',
                 '/root/.ssh/authorized_keys']:
        paths.append(Path(name))
    files = {}
    for source in paths:
        if source.is_symlink():
            raise ValueError('Source symlink rejected')
        candidates = sorted(source.rglob('*')) if source.is_dir() else [source]
        for path in candidates:
            if path.is_symlink():
                raise ValueError('Source symlink rejected')
            if path.is_dir():
                continue
            if not path.is_file():
                raise ValueError('Source is not a regular file')
            files[str(path).lstrip('/')] = path.read_bytes()
    if len(files) > 10000 or sum(map(len, files.values())) > 128 * 1024**2:
        raise ValueError('Config exceeds limits')
    # Refuse a moving live file set. This is still a logical copy, not a VM snapshot.
    if any(Path('/' + name).read_bytes() != data for name, data in files.items()):
        raise ValueError('Configuration changed during capture')
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz') as archive:
        for name, data in sorted(files.items()):
            info = tarfile.TarInfo(name)
            info.size, info.mode = len(data), 0o600
            archive.addfile(info, io.BytesIO(data))
    return output.getvalue(), {name: digest(data) for name, data in files.items()}


def age_path(name='age'):
    return str(ROOT / 'tools/usr/bin' / name)


def prepare():
    global PHASE
    PHASE = 'prepare-tools'
    tools = ROOT / 'tools'
    private_directory(tools)
    if not Path(age_path()).is_file():
        with tempfile.TemporaryDirectory(dir=ROOT, prefix='package-') as temporary:
            # apt download checks the repository package hash. No apt install/upgrade.
            result = subprocess.run(['apt-get', 'download', 'age'], cwd=temporary,
                                    capture_output=True, timeout=120)
            if result.returncode:
                raise RuntimeError('Package download failed')
            packages = list(Path(temporary).glob('age_*.deb'))
            if len(packages) != 1:
                raise ValueError('Unexpected package count')
            run(['dpkg-deb', '-x', str(packages[0]), str(tools)])
    PHASE = 'pull-postgres-client'
    run(['docker', 'pull', 'postgres:17-bookworm'], timeout=240)
    image = json.loads(run(['docker', 'image', 'inspect', 'postgres:17-bookworm']).stdout)[0]
    return {'ageVersion': run([age_path(), '--version']).stdout.decode().strip(),
            'postgresImage': image['Id'], 'postgresDigests': image['RepoDigests']}


def capture(request):
    global PHASE
    run_id = request['runId']
    if not re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}', run_id):
        raise ValueError('Invalid backup name')
    if not re.fullmatch(r'age1[0-9a-z]{58}', request['recipient']):
        raise ValueError('Invalid age recipient')
    if not re.fullmatch(r'[0-9A-Fa-f-]{8,100}', request['snapshot']):
        raise ValueError('Invalid exported snapshot')
    image = request['image']
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', image):
        raise ValueError('Pinned image required')
    backups = ROOT / 'backups'
    private_directory(backups)
    target = confined(backups, backups / run_id)
    target.mkdir(mode=0o700)
    try:
        with tempfile.TemporaryDirectory(dir=ROOT, prefix='capture-') as temporary:
            scratch = Path(temporary)
            PHASE = 'proxy-config-capture'
            proxy = proxy_container()
            config, hashes = config_archive(proxy)
            config_path = scratch / 'config.tar.gz'
            private_file(config_path, config)
            adapted = run(['docker', 'exec', proxy['Id'], 'caddy', 'adapt',
                           '--config', '/etc/caddy/Caddyfile']).stdout
            PHASE = 'database-dump'
            pg = request['database']
            if any('\n' in str(v) or '\r' in str(v) for v in pg.values()):
                raise ValueError('Invalid database credential encoding')
            def escape(value):
                return str(value).replace('\\', '\\\\').replace(':', '\\:')
            password_line = ':'.join(escape(pg[k]) for k in
                                     ['host', 'port', 'name', 'user', 'password']) + '\n'
            private_file(scratch / 'pgpass', password_line.encode())
            private_file(scratch / 'ca.crt', request['ca'].encode())
            env = { 'PGHOST': pg['host'], 'PGPORT': str(pg['port']),
                    'PGDATABASE': pg['name'], 'PGUSER': pg['user'],
                    'PGPASSFILE': '/private/pgpass', 'PGSSLMODE': 'verify-full',
                    'PGSSLROOTCERT': '/private/ca.crt',
                    'PGCONNECT_TIMEOUT': '15',
                    'PGOPTIONS': '-c statement_timeout=120000 -c timezone=UTC' }
            if any('\n' in v or '\r' in v for v in env.values()):
                raise ValueError('Invalid client configuration')
            private_file(scratch / 'client.env', ''.join(
                k + '=' + v + '\n' for k, v in env.items()).encode())
            client_name = 'alterward-dump-' + run_id.lower()
            args = ['docker', 'run', '--rm', '--name', client_name,
                    '--label', LABEL + '=' + run_id, '--read-only',
                    '--memory', '256m', '--cpus', '0.5', '--pids-limit', '64',
                    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
                    '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
                    '--mount', 'type=bind,src=' + str(scratch) + ',dst=/private,readonly',
                    '--env-file', str(scratch / 'client.env'), '--entrypoint', 'pg_dump',
                    image, '--format=custom', '--schema=public', '--no-owner',
                    '--no-acl', '--lock-wait-timeout=5000',
                    '--snapshot=' + request['snapshot']]
            try:
                dump = run(args, timeout=150).stdout
            finally:
                cleanup_container(client_name, run_id)
            if not dump.startswith(b'PGDMP') or len(dump) > 128 * 1024**2:
                raise ValueError('Invalid database dump')
            dump_path = scratch / 'application.dump'
            private_file(dump_path, dump)
            PHASE = 'encrypt'
            for source, name in [(config_path, 'config.tar.age'),
                                 (dump_path, 'application.dump.age')]:
                encrypted = run([age_path(), '-r', request['recipient'], str(source)]).stdout
                private_file(target / name, encrypted)
            manifest = {'schemaVersion': 'contabo-backup-1', 'runId': run_id,
                        'sourceCommit': request['commit'], 'scope': 'application-public-and-proxy-config',
                        'databaseMajor': 17, 'postgresImage': image,
                        'proxyImage': proxy['Image'], 'proxyMounts': {
                            m['Destination']: m['Source'] for m in proxy['Mounts']},
                        'configFiles': hashes, 'configSha256': digest(config),
                        'dumpSha256': digest(dump), 'adaptedConfigSha256': digest(adapted),
                        'expectedTables': request['tables'],
                        'encryptedFiles': {p.name: {'sha256': digest(p.read_bytes()),
                                                   'bytes': p.stat().st_size}
                                           for p in target.iterdir()}}
            private_file(target / 'manifest.json', json.dumps(manifest, indent=2).encode())
            return manifest
    except Exception:
        # Only this newly-created, confined incomplete run directory is removed.
        shutil.rmtree(confined(backups, target))
        raise


def cleanup_container(name, run_id):
    inspected = run(['docker', 'inspect', name], check=False)
    if inspected.returncode == 0:
        container = json.loads(inspected.stdout)[0]
        if container['Config'].get('Labels', {}).get(LABEL) != run_id:
            raise ValueError('Refusing to remove an unrelated container')
        run(['docker', 'rm', '-f', container['Id']])


def rehearse(request):
    global PHASE
    manifest = request['manifest']
    run_id = manifest['runId']
    if not re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}', run_id):
        raise ValueError('Invalid rehearsal name')
    for image in [manifest['postgresImage'], manifest['proxyImage']]:
        if not re.fullmatch(r'sha256:[a-f0-9]{64}', image):
            raise ValueError('Pinned image required')
    name = 'alterward-restore-' + run_id.lower()
    proof = {'schemaVersion': 'contabo-restore-proof-1', 'runId': run_id,
             'liveDatabaseWrites': False, 'publicPorts': 0,
             'applicationStarted': False, 'paidAiCalls': 0}
    with tempfile.TemporaryDirectory(dir=ROOT, prefix='restore-') as temporary:
        scratch = Path(temporary)
        identity = scratch / 'identity.txt'
        private_file(identity, request['identity'].encode())
        PHASE = 'decrypt-offsite-copy'
        plaintext = {}
        for filename in ['config.tar.age', 'application.dump.age']:
            encrypted = base64.b64decode(request['files'][filename], validate=True)
            if digest(encrypted) != manifest['encryptedFiles'][filename]['sha256']:
                raise ValueError('Offsite copy hash mismatch')
            plaintext[filename] = run([age_path(), '-d', '-i', str(identity)],
                                      input=encrypted).stdout
            tampered = bytearray(encrypted)
            tampered[-1] ^= 1
            rejected = run([age_path(), '-d', '-i', str(identity)],
                           input=bytes(tampered), check=False).returncode != 0
            if not rejected:
                raise ValueError('Encryption did not reject corruption')
        proof['offsiteCiphertextVerified'] = True
        proof['tamperedCiphertextRejected'] = True
        if digest(plaintext['config.tar.age']) != manifest['configSha256']:
            raise ValueError('Config mismatch')
        if digest(plaintext['application.dump.age']) != manifest['dumpSha256']:
            raise ValueError('Dump mismatch')
        PHASE = 'config-restore'
        restored = scratch / 'config-restore'
        restored.mkdir(mode=0o700)
        safe_extract(plaintext['config.tar.age'], restored)
        PHASE = 'config-file-hashes'
        if {str(p.relative_to(restored)): digest(p.read_bytes())
                for p in restored.rglob('*') if p.is_file()} != manifest['configFiles']:
            raise ValueError('Restored config file mismatch')
        mounts = manifest['proxyMounts']
        PHASE = 'proxy-adapt'
        caddy_args = ['docker', 'run', '--rm', '--network', 'none', '--read-only',
                      '--memory', '128m', '--cpus', '0.5', '--pids-limit', '64',
                      '--cap-drop', 'ALL', '--cap-add', 'NET_BIND_SERVICE',
                      '--security-opt', 'no-new-privileges:true']
        for destination in ['/data', '/config', '/etc/caddy/Caddyfile']:
            source = confined(restored, restored / mounts[destination].lstrip('/'))
            caddy_args += ['--mount', 'type=bind,src=' + str(source) + ',dst=' + destination + ',readonly']
        adapted = run([*caddy_args, manifest['proxyImage'], 'caddy', 'adapt',
                       '--config', '/etc/caddy/Caddyfile']).stdout
        if digest(adapted) != manifest['adaptedConfigSha256']:
            raise ValueError('Restored proxy configuration mismatch')
        PHASE = 'proxy-validate'
        run([*caddy_args, manifest['proxyImage'], 'caddy', 'validate',
             '--config', '/etc/caddy/Caddyfile'])
        proof['configFilesRestored'] = len(manifest['configFiles'])
        proof['proxyAdaptAndValidate'] = True
        PHASE = 'database-restore'
        try:
            run(['docker', 'run', '-d', '--name', name, '--network', 'none',
                 '--label', LABEL + '=' + run_id, '--read-only',
                 '--memory', '512m', '--cpus', '0.5', '--pids-limit', '128',
                 '--security-opt', 'no-new-privileges:true',
                 '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=384m',
                 '--tmpfs', '/var/run/postgresql:rw,noexec,nosuid,size=2m',
                 '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
                 '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', manifest['postgresImage']])
            deadline = time.monotonic() + 45
            while True:
                ready = run(['docker', 'exec', name, 'pg_isready', '-U', 'postgres'], check=False)
                if ready.returncode == 0:
                    break
                if time.monotonic() > deadline:
                    raise RuntimeError('Restore fixture readiness timed out')
                time.sleep(1)
            run(['docker', 'exec', name, 'psql', '-U', 'postgres',
                 '-v', 'ON_ERROR_STOP=1', '-c',
                 'DROP SCHEMA public; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;'])
            run(['docker', 'exec', '-i', name, 'pg_restore', '-U', 'postgres',
                 '-d', 'postgres', '--no-owner', '--no-acl', '--exit-on-error',
                 '--single-transaction'], input=plaintext['application.dump.age'])
            PHASE = 'compare-restored-data'
            for table in manifest['expectedTables']:
                if not re.fullmatch(r'(aw_|ff_)[a-z0-9_]+', table['name']):
                    raise ValueError('Unexpected table name')
                sql = "SET timezone='UTC'; SELECT count(*)::int,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.\"" + table['name'] + '\" t;'
                result = run(['docker', 'exec', name, 'psql', '-U', 'postgres',
                              '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', sql]).stdout.decode().strip()
                if result != str(table['count']) + '|' + table['digest']:
                    raise ValueError('Restored table differs')
            proof['tablesRestoredAndDataMatched'] = len(manifest['expectedTables'])
            proof['rowsMatched'] = sum(t['count'] for t in manifest['expectedTables'])
            proof['singleTransactionRestore'] = True
        finally:
            cleanup_container(name, run_id)
        proof['temporaryContainersRemoved'] = True
    proof['temporaryPlaintextRemoved'] = True
    return proof


def main():
    os.umask(0o077)
    if os.geteuid() != 0:
        raise ValueError('Root-only operator task')
    if ROOT.is_symlink():
        raise ValueError('Operator root cannot be linked')
    ROOT.mkdir(mode=0o700, exist_ok=True)
    os.chmod(ROOT, 0o700)
    request = json.load(sys.stdin)
    action = request['action']
    if action == 'prepare':
        return prepare()
    if action == 'keygen':
        identity = run([age_path('age-keygen')]).stdout.decode()
        recipient = run([age_path('age-keygen'), '-y'], input=identity.encode()).stdout.decode().strip()
        return {'identity': identity, 'recipient': recipient}
    if action == 'capture':
        return capture(request)
    if action == 'rehearse':
        return rehearse(request)
    raise ValueError('Unknown action')


if __name__ == '__main__':
    try:
        print(json.dumps({'ok': True, 'result': main()}))
    except Exception:
        print(json.dumps({'ok': False, 'phase': PHASE}))
        sys.exit(1)
