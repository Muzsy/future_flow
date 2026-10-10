"""Scoped daily encrypted backup and read-only owner monitoring.

The private decryption identity is never installed. Restore is never automatic.
Only explicitly managed daily archives expire; historical rehearsals stay intact.
"""

import contextlib
import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import select
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

import alterward_backup as backup

ROOT = Path('/root/alterward-ops/daily')
OWNER = Path('/root/alterward-ops/owner')
WORK = Path('/run/alterward-daily-work')
ORIGINAL_ROOT = Path('/root/alterward-ops')
UID = 0
LABEL = 'com.alterward.daily-backup'
RESTORE_LABEL = 'com.alterward.daily-restore'
RETENTION_SECONDS = 7 * 86400
RUN_ID = re.compile(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}')
ARCHIVES = {'config.tar.age', 'application.dump.age', 'manifest.json'}
EXPIRY_JOURNAL = '.expiry-journal'

# A separate Node child uses the existing API's verified TLS configuration.
# It keeps its read-only exported snapshot open until pg_dump has completed.
DATABASE_PROBE = r"""import{createRequire}from'node:module';import{readFileSync}from'node:fs';import{X509Certificate}from'node:crypto';import{TLSSocket}from'node:tls';
const{Client}=createRequire('/app/packages/database/package.json')('pg');
const client=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:readFileSync(process.env.DATABASE_SSL_CA_FILE,'utf8')},connectionTimeoutMillis:10000});
const mode=process.argv[1];let watchdog;try{await client.connect();const socket=client.connection.stream;const host=new URL(process.env.DATABASE_URL).hostname;if(!(socket instanceof TLSSocket)||!socket.encrypted||socket.authorized!==true||!new X509Certificate(socket.getPeerCertificate().raw).checkHost(host))throw Error('TLS');
await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='15s'");await client.query("SET LOCAL timezone='UTC'");const version=(await client.query('SHOW server_version_num')).rows[0].server_version_num;if(Math.floor(Number(version)/10000)!==17)throw Error('Major');
if(mode==='snapshot'){const snapshot=(await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id;const names=(await client.query("SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;if(!names.length||names.length>1000||names.some(t=>!/^(aw_|ff_)[a-z0-9_]+$/.test(t.name)))throw Error('Schema');const tables=[];for(const{name}of names){const row=(await client.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS digest FROM public."${name}" t`)).rows[0];tables.push({name,...row});}console.log(JSON.stringify({databaseTlsVerified:true,snapshot,tables}));await new Promise(resolve=>{watchdog=setTimeout(resolve,240000);process.stdin.once('data',resolve);process.stdin.once('end',resolve);});clearTimeout(watchdog);
}else if(mode==='monitor'){let pendingJobs=0;for(const table of ['ff_jobs','aw_jobs','aw_shared_jobs','aw_public_review_jobs','aw_public_content_reviews']){pendingJobs+=(await client.query(`SELECT count(*)::int AS pending FROM ${table} WHERE status IN ('queued','running','validating')`)).rows[0].pending;}console.log(JSON.stringify({databaseTlsVerified:true,pendingJobs}));}else throw Error('Mode');await client.query('COMMIT');}catch{process.exitCode=1;}finally{clearTimeout(watchdog);await client.end();}"""

ORIGIN_PROBE = """let denied=0;for(const url of ['http://alterward-web:3000/','http://alterward-web:3000/discover','http://127.0.0.1:4000/api/public/discovery','http://127.0.0.1:4000/api/public/config']){const r=await fetch(url,{signal:AbortSignal.timeout(5000),redirect:'manual'});if(r.status!==403||!r.headers.get('cache-control')?.includes('no-store'))throw Error('Origin boundary');denied++}console.log(JSON.stringify({anonymousDenied:denied}));"""


def digest(data):
    return hashlib.sha256(data).hexdigest()


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def regular(path):
    value = path.lstat()
    if (not stat.S_ISREG(value.st_mode) or value.st_nlink != 1 or
            value.st_uid != UID or stat.S_IMODE(value.st_mode) != 0o600):
        raise ValueError('Private regular file required')
    return path.read_bytes()


def private_dir(path):
    if path.is_symlink() or path.resolve() != path.absolute():
        raise ValueError('Directory alias rejected')
    path.mkdir(mode=0o700, parents=False, exist_ok=True)
    value = path.stat()
    if not stat.S_ISDIR(value.st_mode) or value.st_uid != UID:
        raise ValueError('Private directory required')
    os.chmod(path, 0o700)


def atomic(path, value):
    if path.exists() or path.is_symlink():
        regular(path)
    fd, temporary = tempfile.mkstemp(prefix='.status-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as handle:
            os.fchmod(handle.fileno(), 0o600)
            handle.write(json.dumps(value, sort_keys=True).encode())
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def command(args, *, input=None, timeout=60):
    result = subprocess.run(args, input=input, capture_output=True, timeout=timeout,
                            env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C'})
    if result.returncode:
        raise RuntimeError('Private operation failed')
    return result.stdout


def durable_file(path, data):
    with path.open('xb') as handle:
        os.fchmod(handle.fileno(), 0o600)
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())


def config():
    value = json.loads(regular(ROOT / 'config.json'))
    if (value['schemaVersion'] != 'alterward-daily-1' or
            value['retentionSeconds'] != RETENTION_SECONDS or
            not re.fullmatch(r'age1[0-9a-z]{58}', value['recipient']) or
            not re.fullmatch(r'sha256:[a-f0-9]{64}', value['postgresImage']) or
            not re.fullmatch(r'[a-f0-9]{40}', value['sourceCommit'])):
        raise ValueError('Invalid daily configuration')
    if set(value['scriptHashes']) != {'contabo-daily.py', 'backup_lib.py', 'daily_entry.py'}:
        raise ValueError('Exact installed script set required')
    for name, expected in value['scriptHashes'].items():
        if digest(regular(ROOT / 'scripts' / name)) != expected:
            raise ValueError('Installed script hash changed')
    for name, expected in value.get('unitHashes', {}).items():
        if name not in {'alterward-backup.service', 'alterward-backup.timer', 'alterward-monitor.service', 'alterward-monitor.timer'} or digest(regular(Path('/etc/systemd/system') / name)) != expected:
            raise ValueError('Installed daily unit changed')
    return value


def source_binding(value):
    return {key: value[key] for key in ['sourceCommit', 'scriptHashes', 'unitHashes']}


def current_proof(proof, value, maximum_age):
    try:
        captured = dt.datetime.fromisoformat(proof['capturedAt'])
        age = (utcnow() - captured).total_seconds()
        return (captured.utcoffset() == dt.timedelta(0) and 0 <= age <= maximum_age and
                all(proof.get(key) == expected for key, expected in source_binding(value).items()))
    except (KeyError, TypeError, ValueError):
        return False


def status_snapshot(value):
    result = {}
    for name, maximum_age in [('backup', 26 * 3600), ('monitor', 30 * 60)]:
        path = ROOT / 'status' / (name + '.json')
        record = json.loads(regular(path)) if path.exists() else {}
        if not current_proof(record, value, maximum_age):
            record = {**record, 'ok': False, 'alerts': [*record.get('alerts', []), name + '_stale_or_source_changed']}
        result[name] = record
    return result


@contextlib.contextmanager
def exclusive(path):
    import fcntl
    fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        value = os.fstat(fd)
        if not stat.S_ISREG(value.st_mode) or value.st_uid != UID or value.st_nlink != 1:
            raise ValueError('Private lock required')
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(fd)


def containers():
    ids = command(['docker', 'ps', '-aq']).decode().split()
    return json.loads(command(['docker', 'inspect', *ids])) if ids else []


def stable_state():
    return {v['Id']: (v['RestartCount'], v['State']['Status']) for v in containers()
            if not any(v['Config'].get('Labels', {}).get(label) is not None for label in [LABEL, RESTORE_LABEL])}


def owner_only_environment(service, env):
    if service == 'web':
        return not env.get('OPENAI_API_KEY') and not env.get('ANTHROPIC_API_KEY')
    return (not env.get('CLOSED_BETA_USER_IDS') and env.get('AI_PROJECT_BUDGET_USD') == '0' and
            env.get('AI_USER_BUDGET_USD') == '0' and not env.get('ANTHROPIC_API_KEY') and
            not env.get('AI_BUDGET_WINDOW_START') and not env.get('AI_BUDGET_WINDOW_END') and
            (env.get('OPENAI_API_KEY') == 'alterward_owner_provider_access_disabled'
             if service == 'worker' else not env.get('OPENAI_API_KEY')))


def owner_runtime():
    manifest = json.loads(regular(OWNER / 'manifest.json'))
    for filename, key in [('server.env', 'ownerEnvironmentSha256'),
                          ('effective-compose.json', 'effectiveComposeSha256')]:
        if digest(regular(OWNER / filename)) != manifest[key]:
            raise ValueError('Owner runtime drift')
    ca = Path('/etc/alterward/supabase-ca.crt')
    if ca.is_symlink() or digest(ca.read_bytes()) != manifest['databaseCaSha256']:
        raise ValueError('Database CA changed')
    services = {v['Config']['Labels'].get('com.docker.compose.service'): v for v in containers()
                if v['Config'].get('Labels', {}).get('com.docker.compose.project') == 'alterward-owner'}
    if set(services) != {'web', 'api', 'worker'}:
        raise ValueError('Three owner services required')
    expected = json.loads(regular(OWNER / 'effective-compose.json'))['services']
    for service, value in services.items():
        env = dict(item.split('=', 1) for item in value['Config']['Env'])
        if (not value['State']['Running'] or value['Image'] != manifest['imageId'] or
                value['HostConfig'].get('PortBindings') or value['Config']['User'] != 'node' or
                value['HostConfig'].get('CapDrop') != ['ALL'] or
                not owner_only_environment(service, env) or
                any(env.get(k) != str(v) for k, v in expected[service]['environment'].items())):
            raise ValueError('Owner-only runtime boundary changed')
        if service != 'worker' and value['State'].get('Health', {}).get('Status') != 'healthy':
            raise ValueError('Owner service unhealthy')
    return manifest, services


def owner_database():
    env = {}
    for line in regular(OWNER / 'server.env').decode().splitlines():
        if not line or line.startswith('#'):
            continue
        match = re.fullmatch(r"([A-Z][A-Z0-9_]*)='([^'\r\n\\]*)'", line)
        if not match or match[1] in env:
            raise ValueError('Protected environment invalid')
        env[match[1]] = match[2]
    value = urllib.parse.urlsplit(env['DATABASE_URL'])
    actual = json.loads(regular(OWNER / 'effective-compose.json'))['services']['api']['environment']
    if value.scheme not in ['postgres', 'postgresql'] or value.query or actual.get('DATABASE_SSL') != 'true':
        raise ValueError('Verified database connection required')
    return {'host': value.hostname, 'port': str(value.port or 5432),
            'name': urllib.parse.unquote(value.path[1:]),
            'user': urllib.parse.unquote(value.username),
            'password': urllib.parse.unquote(value.password)}


def extended_config_archive(proxy):
    source, _ = original_config_archive(proxy)
    files = {}
    with tarfile.open(fileobj=io.BytesIO(source), mode='r:gz') as archive:
        for member in archive.getmembers():
            if not member.isfile() or member.name in files:
                raise ValueError('Proxy archive invalid')
            files[member.name] = archive.extractfile(member).read()
    manifest = json.loads(regular(OWNER / 'manifest.json'))
    upgrade = OWNER / 'upgrades' / manifest['commit']
    paths = [OWNER / n for n in ['server.env', 'manifest.json', 'effective-compose.json', 'pinned-image.json']]
    paths += [upgrade / n for n in ['server.env', 'manifest.json', 'effective-compose.json', 'pinned-image.json', 'prepared.json', 'applying.json', 'applied.json']]
    paths += [upgrade / 'previous' / n for n in ['server.env', 'manifest.json', 'effective-compose.json', 'pinned-image.json']]
    paths += [OWNER / 'origin-install' / n for n in ['inventory.json', 'origin-ca.pem']]
    paths += [OWNER / 'proxy-prepare' / n for n in ['before.Caddyfile', 'before.compose.yaml']]
    paths += [ROOT / 'config.json']
    paths += [ROOT / 'scripts' / name for name in config()['scriptHashes']]
    paths += [Path('/etc/systemd/system') / n for n in ['alterward-backup.service', 'alterward-backup.timer', 'alterward-monitor.service', 'alterward-monitor.timer']]
    for path in paths:
        files[str(path).lstrip('/')] = regular(path)
    ca = Path('/etc/alterward/supabase-ca.crt')
    files[str(ca).lstrip('/')] = ca.read_bytes()
    if any(Path('/' + name).read_bytes() != data for name, data in files.items()):
        raise ValueError('Configuration changed during capture')
    if len(files) > 10000 or sum(map(len, files.values())) > 128 * 1024**2:
        raise ValueError('Configuration exceeds limit')
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz') as archive:
        for name, data in sorted(files.items()):
            entry = tarfile.TarInfo(name)
            entry.size, entry.mode = len(data), 0o600
            archive.addfile(entry, io.BytesIO(data))
    return output.getvalue(), {name: digest(data) for name, data in files.items()}


original_config_archive = backup.config_archive


def expiry_directory(path):
    state = path.lstat()
    if (path.resolve() != path.absolute() or not stat.S_ISDIR(state.st_mode) or
            state.st_uid != UID or stat.S_IMODE(state.st_mode) != 0o700):
        raise ValueError('Original private expiry directory required')
    return [state.st_dev, state.st_ino]


def expiry_file(path):
    before = path.lstat()
    def identity(state):
        return [state.st_dev, state.st_ino, state.st_mode, state.st_nlink,
                state.st_size, state.st_mtime_ns, state.st_ctime_ns]
    if before.st_size > 512 * 1024**2:
        raise ValueError('Bounded daily ciphertext required')
    data = regular(path)
    if identity(path.lstat()) != identity(before) or len(data) != before.st_size:
        raise ValueError('Daily original changed during read')
    return data, {'identity': identity(before), 'bytes': len(data), 'sha256': digest(data)}


def expiry_manifest(manifest, run, now):
    if (manifest.get('managedBy') != 'alterward-daily-1' or
            manifest.get('schemaVersion') != 'contabo-backup-1' or manifest.get('runId') != run or
            set(manifest.get('encryptedFiles', {})) != ARCHIVES - {'manifest.json'}):
        raise ValueError('Archive identity invalid')
    created = dt.datetime.fromisoformat(manifest['capturedAt'])
    named = dt.datetime.strptime(run[:16], '%Y%m%dT%H%M%SZ').replace(tzinfo=dt.timezone.utc)
    if (created.utcoffset() != dt.timedelta(0) or not 0 <= (created - named).total_seconds() < 1 or
            created > now + dt.timedelta(minutes=5)):
        raise ValueError('Archive timestamp invalid')
    for entry in manifest['encryptedFiles'].values():
        if (set(entry) != {'bytes', 'sha256'} or type(entry['bytes']) is not int or
                not 0 < entry['bytes'] <= 512 * 1024**2 or not re.fullmatch(r'[a-f0-9]{64}', entry['sha256'])):
            raise ValueError('Exact bounded ciphertext binding required')
    return created


def expiry_inventory(directory, now):
    root_identity = expiry_directory(directory)
    metadata = directory / EXPIRY_JOURNAL
    intents, total_metadata = {}, 0
    if metadata.exists() or metadata.is_symlink():
        expiry_directory(metadata)
        for path in sorted(metadata.iterdir()):
            run = path.name.removesuffix('.json')
            if not RUN_ID.fullmatch(run) or path.name != run + '.json':
                raise ValueError('Unknown or interrupted daily deletion metadata')
            if path.lstat().st_size > 1024**2:
                raise ValueError('Bounded deletion intent required')
            raw, _ = expiry_file(path); total_metadata += len(raw)
            record = json.loads(raw)
            if (set(record) != {'schemaVersion', 'runId', 'rootIdentity', 'directoryIdentity', 'manifest', 'files'} or
                    record['schemaVersion'] != 'alterward-daily-expiry-1' or record['runId'] != run or
                    record['rootIdentity'] != root_identity or set(record['files']) != ARCHIVES or
                    not isinstance(record['directoryIdentity'], list) or len(record['directoryIdentity']) != 2 or
                    not all(type(v) is int for v in record['directoryIdentity'])):
                raise ValueError('Original immutable daily intent required')
            created = expiry_manifest(record['manifest'], run, now)
            if (now - created).total_seconds() <= RETENTION_SECONDS:
                raise ValueError('Pending expiry must be past its original boundary')
            for name, entry in record['files'].items():
                if (set(entry) != {'identity', 'bytes', 'sha256'} or not isinstance(entry['identity'], list) or
                        len(entry['identity']) != 7 or not all(type(v) is int for v in entry['identity']) or
                        type(entry['bytes']) is not int or not 0 < entry['bytes'] <= 512 * 1024**2 or
                        not re.fullmatch(r'[a-f0-9]{64}', entry['sha256']) or
                        (name != 'manifest.json' and {k: entry[k] for k in ('bytes', 'sha256')} != record['manifest']['encryptedFiles'][name])):
                    raise ValueError('Original daily file identity required')
            intents[run] = record
            if len(intents) > 10000 or total_metadata > 32 * 1024**2:
                raise ValueError('Daily metadata capacity reached')
    paths = {}
    for path in sorted(directory.iterdir()):
        if path.name == EXPIRY_JOURNAL:
            continue
        if not RUN_ID.fullmatch(path.name):
            raise ValueError('Unmanaged archive in daily directory')
        paths[path.name] = path
    if len(paths) > 100:
        raise ValueError('Daily archive capacity reached')
    records, total_cipher = [], 0
    for run in sorted(set(paths) | set(intents)):
        path = directory / run; intent = intents.get(run); present = run in paths
        files = {}
        if present:
            directory_identity = expiry_directory(path)
            actual = {p.name for p in path.iterdir()}
            if not actual <= ARCHIVES or (not intent and actual != ARCHIVES):
                raise ValueError('Daily archive incomplete without original intent')
            if intent and directory_identity != intent['directoryIdentity']:
                raise ValueError('Daily directory resurrected or replaced')
            for name in sorted(actual):
                raw, entry = expiry_file(path / name); files[name] = entry
                if intent and entry != intent['files'][name]:
                    raise ValueError('Daily original changed after deletion intent')
                if name != 'manifest.json':
                    total_cipher += len(raw)
            manifest = intent['manifest'] if intent else json.loads(regular(path / 'manifest.json'))
            if 'manifest.json' in files and digest(regular(path / 'manifest.json')) != files['manifest.json']['sha256']:
                raise ValueError('Daily manifest changed during read')
            for name in ARCHIVES - {'manifest.json'}:
                if name in files and {k: files[name][k] for k in ('bytes', 'sha256')} != manifest['encryptedFiles'][name]:
                    raise ValueError('Daily ciphertext differs from manifest')
        elif intent:
            directory_identity = intent['directoryIdentity'];manifest = intent['manifest']
        else:
            raise ValueError('Missing unjournaled daily archive')
        created = expiry_manifest(manifest, run, now)
        original = intent or {'schemaVersion': 'alterward-daily-expiry-1', 'runId': run,
                              'rootIdentity': root_identity, 'directoryIdentity': directory_identity,
                              'manifest': manifest, 'files': files}
        records.append({'path': path, 'created': created, 'manifest': manifest, 'hashes': {n: f['sha256'] for n, f in files.items()},
                        'files': files, 'original': original, 'pending': intent is not None, 'present': present})
    if total_cipher > 512 * 1024**2:
        raise ValueError('Daily ciphertext byte capacity reached')
    return records


def completed_archives(directory):
    records = expiry_inventory(directory, utcnow())
    if any(r['present'] and set(r['files']) != ARCHIVES for r in records):
        raise ValueError('Daily expiry needs guarded resumption before inventory')
    return [r for r in records if r['present'] and not r['pending']]


def retention_plan(directory, now):
    records = expiry_inventory(directory, now)
    if any(r['created'] > now + dt.timedelta(minutes=5) for r in records):
        raise ValueError('Future archive timestamp')
    return [r for r in records if
            (now - r['created']).total_seconds() > RETENTION_SECONDS]


def expire(directory, now):
    records = expiry_inventory(directory, now)
    plan = [r for r in records if (now - r['created']).total_seconds() > RETENTION_SECONDS]
    if expiry_inventory(directory, now) != records:
        raise ValueError('Archive changed before expiry')
    if not plan:
        return 0
    metadata = directory / EXPIRY_JOURNAL
    if not metadata.exists():
        metadata.mkdir(mode=0o700); expiry_sync(directory)
    expiry_directory(metadata)
    additions = [r for r in plan if not r['pending']]
    serialized = [json.dumps(r['original'], sort_keys=True, separators=(',', ':')).encode() for r in additions]
    if (sum(r['pending'] for r in records) + len(additions) > 10000 or
            any(len(raw) > 1024**2 for raw in serialized) or
            sum(p.lstat().st_size for p in metadata.iterdir()) + sum(map(len, serialized)) > 32 * 1024**2):
        raise ValueError('Daily intent capacity would be exceeded')
    # Durable original intent for EVERY expired run precedes the first unlink.
    for record in plan:
        if not record['pending']:
            expiry_atomic_intent(metadata / (record['path'].name + '.json'), record['original'])
    checked = expiry_inventory(directory, now)
    if len(checked) != len(records) or any(a['original'] != b['original'] or a['files'] != b['files'] or a['present'] != b['present'] for a, b in zip(records, checked)):
        raise ValueError('Daily batch changed after durable intent')
    removed = 0
    for record in [r for r in checked if (now - r['created']).total_seconds() > RETENTION_SECONDS]:
        path = record['path']
        if not record['present']:
            continue
        fd = root_fd = None
        if os.name != 'nt':
            fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            if [os.fstat(fd).st_dev, os.fstat(fd).st_ino] != record['original']['directoryIdentity']:
                os.close(fd);raise ValueError('Original daily directory descriptor required')
        try:
            if os.name != 'nt':
                root_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
                if [os.fstat(root_fd).st_dev, os.fstat(root_fd).st_ino] != record['original']['rootIdentity']:
                    raise ValueError('Original daily root descriptor required')
            for name in sorted(record['files'], key=lambda n: (n == 'manifest.json', n)):
                if (expiry_directory(directory) != record['original']['rootIdentity'] or
                        expiry_directory(path) != record['original']['directoryIdentity'] or
                        expiry_file(path / name)[1] != record['original']['files'][name]):
                    raise ValueError('Original daily file changed immediately before unlink')
                if fd is not None:
                    os.unlink(name, dir_fd=fd);os.fsync(fd)
                else:
                    os.unlink(path / name)
            if expiry_directory(path) != record['original']['directoryIdentity'] or list(path.iterdir()):
                raise ValueError('Only original empty daily directory may be removed')
            if root_fd is not None:
                os.rmdir(path.name, dir_fd=root_fd);os.fsync(root_fd)
            else:
                os.rmdir(path)
            expiry_sync(directory);removed += 1
        finally:
            if fd is not None:
                os.close(fd)
            if root_fd is not None:
                os.close(root_fd)
    expiry_inventory(directory, now)
    return removed


def expiry_sync(path):
    if os.name != 'nt':
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def expiry_atomic_intent(path, record):
    # Called under the existing kernel job lock. Never replace an original intent.
    if path.exists() or path.is_symlink():
        raise ValueError('Daily intent already exists')
    temporary = path.parent / ('.pending-' + path.name)
    raw = json.dumps(record, sort_keys=True, separators=(',', ':')).encode()
    if temporary.exists() or temporary.is_symlink():
        if regular(temporary) != raw:
            raise ValueError('Interrupted daily intent needs operator verification')
    else:
        with temporary.open('xb') as stream:
            os.chmod(temporary, 0o600);stream.write(raw);stream.flush();os.fsync(stream.fileno())
    if path.exists() or path.is_symlink():
        raise ValueError('Daily intent changed before publication')
    os.replace(temporary, path);expiry_sync(path.parent)


def clean_work():
    private_dir(WORK)
    # The directory is exclusive to this job and backed by host shared memory.
    # Reject links/special files anywhere before removing abandoned scratch files.
    paths = list(WORK.rglob('*'))
    for path in paths:
        value = path.lstat()
        if (value.st_uid != UID or path.is_symlink() or
                not (stat.S_ISREG(value.st_mode) or stat.S_ISDIR(value.st_mode)) or
                (stat.S_ISREG(value.st_mode) and value.st_nlink != 1)):
            raise ValueError('Unsafe abandoned scratch entry')
    for value in containers():
        if value['Config'].get('Labels', {}).get(LABEL) is not None:
            run_id = value['Config']['Labels'][LABEL]
            if not RUN_ID.fullmatch(run_id) or value['Name'] != '/alterward-dump-' + run_id.lower():
                raise ValueError('Unexpected daily client container')
            if not any(m['Source'].startswith(str(WORK) + '/') for m in value['Mounts']):
                raise ValueError('Daily container outside scratch directory')
            command(['docker', 'rm', '-f', value['Id']])
        if value['Config'].get('Labels', {}).get(RESTORE_LABEL) is not None:
            run_id = value['Config']['Labels'][RESTORE_LABEL]
            if (not RUN_ID.fullmatch(run_id) or value['Name'] != '/alterward-restore-' + run_id.lower() or
                    value['HostConfig']['NetworkMode'] != 'none' or value['HostConfig'].get('PortBindings') or
                    value['Config']['Image'] != config()['postgresImage']):
                raise ValueError('Unexpected daily restore fixture')
            command(['docker', 'rm', '-f', value['Id']])
    for path in sorted(paths, key=lambda p: len(p.parts), reverse=True):
        if path.is_dir():
            path.rmdir()
        else:
            path.unlink()


def clean_pending():
    pending = []
    for path in (ROOT / 'backups').iterdir():
        if not path.name.startswith('.pending-'):
            continue
        if (not RUN_ID.fullmatch(path.name.removeprefix('.pending-')) or
                path.is_symlink() or not path.is_dir() or path.stat().st_uid != UID or
                stat.S_IMODE(path.stat().st_mode) != 0o700):
            raise ValueError('Unsafe pending archive')
        entries = list(path.iterdir())
        if not {p.name for p in entries}.issubset(ARCHIVES):
            raise ValueError('Unexpected pending archive entry')
        for entry in entries:
            regular(entry)
        pending.append((path, entries))
    for path, entries in pending:
        for entry in entries:
            entry.unlink()
        path.rmdir()
    return len(pending)


@contextlib.contextmanager
def source_snapshot(api):
    process = subprocess.Popen(['docker', 'exec', '-i', api, 'node', '--max-old-space-size=128',
        '--input-type=module', '-e', DATABASE_PROBE, 'snapshot'], stdin=subprocess.PIPE,
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        if not select.select([process.stdout], [], [], 90)[0]:
            raise TimeoutError('Snapshot preparation timed out')
        value = json.loads(process.stdout.readline(128 * 1024))
        if not value.get('databaseTlsVerified'):
            raise ValueError('Snapshot TLS proof missing')
        yield value
        process.stdin.write(b'COMMIT\n')
        process.stdin.flush()
        process.stdin.close()
        if process.wait(timeout=20):
            raise RuntimeError('Source snapshot failed')
    finally:
        if not process.stdin.closed:
            process.stdin.close()
        if process.poll() is None:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)


def rehearse_offsite(request):
    # /run is verified tmpfs on the target. A hard kill may leave root-only
    # memory until the next monitor; no decryption identity persists on disk.
    clean_work()
    if shutil.disk_usage(WORK).free < 384 * 1024**2:
        raise ValueError('Insufficient memory-backed restore space')
    old_root, old_label, old_age = backup.ROOT, backup.LABEL, backup.age_path
    try:
        backup.ROOT, backup.LABEL = WORK, RESTORE_LABEL
        backup.age_path = lambda name='age': str(ORIGINAL_ROOT / 'tools/usr/bin' / name)
        proof = backup.rehearse(request)
        proof['decryptionIdentityMemoryOnly'] = True
        return proof
    finally:
        backup.ROOT, backup.LABEL, backup.age_path = old_root, old_label, old_age
        clean_work()


def perform_backup(value):
    baseline = stable_state()
    with exclusive(OWNER / 'activation.lock'):
        manifest, services = owner_runtime()
        if shutil.disk_usage(ROOT).free < 2 * 1024**3 or shutil.disk_usage(WORK.parent).free < 384 * 1024**2:
            raise ValueError('Insufficient backup space')
        clean_work()
        started = utcnow()
        run_id = started.strftime('%Y%m%dT%H%M%SZ-') + secrets.token_hex(4)
        backup.ROOT, backup.LABEL = WORK, LABEL
        backup.age_path = lambda name='age': str(ORIGINAL_ROOT / 'tools/usr/bin' / name)
        backup.config_archive = extended_config_archive
        try:
            with source_snapshot(services['api']['Id']) as snapshot:
                result = backup.capture({'runId': run_id, 'commit': value['sourceCommit'],
                    'snapshot': snapshot['snapshot'], 'database': owner_database(),
                    'ca': Path('/etc/alterward/supabase-ca.crt').read_text(),
                    'recipient': value['recipient'], 'image': value['postgresImage'],
                    'tables': snapshot['tables']})
            result.update({'managedBy': 'alterward-daily-1', 'capturedAt': started.isoformat(),
                'ownerCommit': manifest['commit'], 'ownerImage': manifest['imageId'],
                'scope': 'application-public-proxy-tls-owner-and-daily-config',
                'databaseTlsVerified': True, 'retentionSeconds': RETENTION_SECONDS,
                **source_binding(value),
                'dailyScriptSha256': value['scriptHashes']['contabo-daily.py']})
            stage = ROOT / 'backups' / ('.pending-' + run_id)
            private_dir(stage)
            for name, expected in result['encryptedFiles'].items():
                content = regular(WORK / 'backups' / run_id / name)
                if digest(content) != expected['sha256'] or len(content) != expected['bytes']:
                    raise ValueError('Encrypted archive changed before persistence')
                durable_file(stage / name, content)
            durable_file(stage / 'manifest.json', json.dumps(result, sort_keys=True).encode())
            final = ROOT / 'backups' / run_id
            if final.exists():
                raise ValueError('Archive name already exists')
            os.rename(stage, final)
            for directory in [final, final.parent]:
                fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(fd)
                finally:
                    os.close(fd)
            expired = expire(ROOT / 'backups', utcnow())
            if stable_state() != baseline:
                raise ValueError('Existing container state changed during backup')
            status = {'ok': True, **source_binding(value), 'capturedAt': utcnow().isoformat(), 'runId': run_id,
                'tables': len(result['expectedTables']), 'rows': sum(t['count'] for t in result['expectedTables']),
                'configFiles': len(result['configFiles']), 'encryptedBytes': sum(x['bytes'] for x in result['encryptedFiles'].values()),
                'archivesExpired': expired, 'databaseTlsVerified': True, 'liveDatabaseWrites': False,
                'allExistingContainersUnchanged': True, 'paidAiCalls': 0}
            atomic(ROOT / 'status' / 'backup.json', status)
            return status
        finally:
            clean_work()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def edge_closed(team):
    opener = urllib.request.build_opener(NoRedirect())
    try:
        request = urllib.request.Request('https://alterward.com/discover',
            headers={'User-Agent': 'Alterward-Release-Verification/1'})
        opener.open(request, timeout=15).close()
        return False
    except urllib.error.HTTPError as error:
        try:
            location = urllib.parse.urlsplit(error.headers.get('Location', ''))
            return (error.code in [302, 303, 307] and location.scheme == 'https' and
                    location.hostname == team and location.path.startswith('/cdn-cgi/access/login/') and
                    error.headers.get('CF-Cache-Status', '').upper() != 'HIT')
        finally:
            error.close()


def alerts_for(health, now):
    alerts = []
    if not health['ownerHealthy']:
        alerts.append('owner_runtime')
    if not health['databaseTlsVerified']:
        alerts.append('database_tls')
    if health['pendingJobs'] != 0:
        alerts.append('unexpected_owner_jobs')
    if health['anonymousDenied'] != 4 or not health['edgeClosed']:
        alerts.append('access_boundary')
    if health['diskFreeBytes'] < 2 * 1024**3:
        alerts.append('disk_space')
    if not health['originCertificateOver30Days']:
        alerts.append('origin_certificate')
    last = health.get('lastBackupAt')
    if not last or (now - dt.datetime.fromisoformat(last)).total_seconds() > 26 * 3600:
        alerts.append('backup_stale')
    if health.get('backupFailed'):
        alerts.append('backup_failed')
    return alerts


def monitor(value):
    baseline = stable_state()
    with exclusive(OWNER / 'activation.lock'):
        clean_work()
        _, services = owner_runtime()
        database = json.loads(command(['docker', 'exec', services['api']['Id'], 'node',
            '--max-old-space-size=128', '--input-type=module', '-e', DATABASE_PROBE, 'monitor']))
        origin = json.loads(command(['docker', 'exec', services['api']['Id'], 'node',
                                    '--input-type=module', '-e', ORIGIN_PROBE]))
        records = completed_archives(ROOT / 'backups')
        last = max(records, key=lambda r: r['created'])['created'].isoformat() if records else None
        status_file = ROOT / 'status' / 'backup.json'
        backup_failed = status_file.exists() and not json.loads(regular(status_file)).get('ok')
        certificate = command(['openssl', 'x509', '-in', '/root/ghost/caddy_data/alterward-origin/origin.crt',
                               '-noout', '-enddate']).decode().strip().removeprefix('notAfter=')
        expires = dt.datetime.strptime(certificate, '%b %d %H:%M:%S %Y %Z').replace(tzinfo=dt.timezone.utc)
        now = utcnow()
        health = {'ownerHealthy': True, **database, **origin,
            'edgeClosed': edge_closed(value['teamDomain']), 'lastBackupAt': last,
            'backupFailed': bool(backup_failed), 'diskFreeBytes': shutil.disk_usage(ROOT).free,
            'originCertificateOver30Days': (expires - now).total_seconds() > 30 * 86400}
        alerts = alerts_for(health, now)
        if stable_state() != baseline:
            alerts.append('container_state_changed')
        result = {'ok': not alerts, **source_binding(value), 'capturedAt': now.isoformat(), 'alerts': alerts,
                  'health': health, 'paidAiCalls': 0, 'externalMessageSent': False}
        atomic(ROOT / 'status' / 'monitor.json', result)
        return result


def run_operation(action):
    os.umask(0o077)
    if os.geteuid() != UID or action not in ['backup', 'monitor', 'status']:
        raise ValueError('Explicit root-only action required')
    value = config()
    if action == 'status':
        with exclusive(ROOT / 'job.lock'):
            return status_snapshot(value)
    with exclusive(ROOT / 'job.lock'):
        try:
            clean_pending()
            # Enforce the approved retention even when today's capture or a
            # runtime check fails; never silently retain the last copy forever.
            expired = expire(ROOT / 'backups', utcnow())
            if action == 'monitor':
                result = monitor(value)
                result['archivesExpired'] = expired
                atomic(ROOT / 'status' / 'monitor.json', result)
                return result
            result = perform_backup(value)
            result['archivesExpired'] += expired
            atomic(ROOT / 'status' / 'backup.json', result)
            return result
        except BlockingIOError:
            # Another guarded owner operation is running; defer without mutation.
            return {'ok': True, 'deferred': True, 'paidAiCalls': 0}
        except Exception:
            result = {'ok': False, **source_binding(value), 'capturedAt': utcnow().isoformat(),
                      'alerts': [action + '_operation_failed'], 'paidAiCalls': 0,
                      'phase': backup.PHASE if action == 'backup' else 'monitor-checks',
                      'externalMessageSent': False}
            atomic(ROOT / 'status' / (action + '.json'), result)
            return result


def main(action):
    try:
        return run_operation(action)
    except BlockingIOError:
        return {'ok': True, 'deferred': True, 'paidAiCalls': 0}


if __name__ == '__main__':
    def interrupted(signum, frame):
        raise InterruptedError('Daily operation interrupted')
    for name in ['SIGTERM', 'SIGINT', 'SIGHUP']:
        signal.signal(getattr(signal, name), interrupted)
    try:
        result = main(sys.argv[1].removeprefix('--'))
        print(json.dumps(result))
        sys.exit(0 if result.get('ok', True) else 1)
    except Exception:
        print(json.dumps({'ok': False, 'alerts': ['daily_entry_failed']}))
        sys.exit(1)
