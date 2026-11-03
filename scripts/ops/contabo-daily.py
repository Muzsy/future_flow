"""Scoped daily encrypted backup and read-only owner monitoring.

The private decryption identity is never installed. Restore is never automatic.
Only explicitly managed daily archives expire; historical rehearsals stay intact.
"""

import contextlib
import datetime as dt
from decimal import Decimal
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

# This source is also exercised directly by the isolated SQL tests. The helper
# receives bounded admission metadata in memory and emits only aggregate counts.
PERSONAL_QUEUE_PROBE = r"""export async function personalBetaQueueProbe(client, policy) {
  if (typeof policy?.queueAllowed !== 'boolean' || !Array.isArray(policy.userIds) || policy.userIds.length > 10 || new Set(policy.userIds).size !== policy.userIds.length || policy.userIds.some(id=>typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id))) throw Error('Bounded monitor policy required');
  let unexpectedPending=0;
  for (const table of ['ff_jobs','aw_shared_jobs','aw_public_review_jobs','aw_public_content_reviews','aw_scenario_reviews']) {
    unexpectedPending+=(await client.query(`SELECT count(*)::int AS n FROM public.${table} WHERE status IN ('queued','running','validating')`)).rows[0].n;
  }
  unexpectedPending+=(await client.query("SELECT count(*)::int AS n FROM public.aw_public_draft_reviews WHERE status='running'")).rows[0].n;
  unexpectedPending+=(await client.query("SELECT count(*)::int AS n FROM public.aw_branches b WHERE b.status='generating' AND NOT EXISTS(SELECT 1 FROM public.aw_jobs j WHERE j.branch_id=b.id AND j.user_id=b.user_id AND j.status IN ('queued','running'))")).rows[0].n;
  const row=(await client.query(`SELECT count(*)::int AS "personalPending",
    count(*) FILTER(WHERE j.created_at<clock_timestamp()-interval '30 minutes')::int AS "stalePersonal",
    count(*) FILTER(WHERE (j.status='running' AND (j.lease_token IS NULL OR j.lease_until IS NULL OR j.lease_until<clock_timestamp()-interval '2 minutes')) OR (j.status='queued' AND (j.lease_token IS NOT NULL OR j.lease_until IS NOT NULL)))::int AS "expiredPersonal",
    count(*) FILTER(WHERE u.id IS NULL OR u.status IS DISTINCT FROM 'active' OR NOT(j.user_id=ANY($1::uuid[])))::int AS "unadmittedPersonal"
    FROM public.aw_jobs j LEFT JOIN public.ff_users u ON u.id=j.user_id WHERE j.status IN ('queued','running')`,[policy.userIds])).rows[0];
  const result={pendingJobs:row.personalPending+unexpectedPending,personalPending:row.personalPending,unexpectedPending,stalePersonal:row.stalePersonal,expiredPersonal:row.expiredPersonal,unadmittedPersonal:row.unadmittedPersonal};
  if (Object.values(result).some(v=>!Number.isSafeInteger(v)||v<0)) throw Error('Aggregate queue counts required');
  return {...result,queueHealthy:policy.queueAllowed?unexpectedPending===0&&row.stalePersonal===0&&row.expiredPersonal===0&&row.unadmittedPersonal===0:result.pendingJobs===0};
}
"""

# A separate Node child uses the existing API's verified TLS configuration.
# It keeps its read-only exported snapshot open until pg_dump has completed.
DATABASE_PROBE = PERSONAL_QUEUE_PROBE + r"""import{createRequire}from'node:module';import{readFileSync}from'node:fs';import{X509Certificate}from'node:crypto';import{TLSSocket}from'node:tls';
const{Client}=createRequire('/app/packages/database/package.json')('pg');
const client=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:readFileSync(process.env.DATABASE_SSL_CA_FILE,'utf8')},connectionTimeoutMillis:10000});
const mode=process.argv[1];let watchdog;try{await client.connect();const socket=client.connection.stream;const host=new URL(process.env.DATABASE_URL).hostname;if(!(socket instanceof TLSSocket)||!socket.encrypted||socket.authorized!==true||!new X509Certificate(socket.getPeerCertificate().raw).checkHost(host))throw Error('TLS');
await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='15s'");await client.query("SET LOCAL timezone='UTC'");const version=(await client.query('SHOW server_version_num')).rows[0].server_version_num;if(Math.floor(Number(version)/10000)!==17)throw Error('Major');
if(mode==='snapshot'){const snapshot=(await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id;const names=(await client.query("SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;if(!names.length||names.length>1000||names.some(t=>!/^(aw_|ff_)[a-z0-9_]+$/.test(t.name)))throw Error('Schema');const tables=[];for(const{name}of names){const row=(await client.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS digest FROM public."${name}" t`)).rows[0];tables.push({name,...row});}console.log(JSON.stringify({databaseTlsVerified:true,snapshot,tables}));await new Promise(resolve=>{watchdog=setTimeout(resolve,240000);process.stdin.once('data',resolve);process.stdin.once('end',resolve);});clearTimeout(watchdog);
}else if(mode==='monitor'){const raw=readFileSync(0,'utf8');if(Buffer.byteLength(raw)>8192)throw Error('Policy');const policy=JSON.parse(raw);if(JSON.stringify(policy.userIds)!==JSON.stringify(process.env.CLOSED_BETA_USER_IDS?process.env.CLOSED_BETA_USER_IDS.split(','):[]))throw Error('Admission');const queue=await personalBetaQueueProbe(client,policy);console.log(JSON.stringify({databaseTlsVerified:true,...queue}));}else throw Error('Mode');await client.query('COMMIT');}catch{process.exitCode=1;}finally{clearTimeout(watchdog);await client.end();}"""

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


SHARED_FLAGS = ('SHARED_CONTEXTS_ENABLED', 'SHARED_FRIEND_ENABLED',
                'SHARED_CONNECTED_ENABLED', 'SHARED_WORLD_ENABLED')
ADMISSION_UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}')


def bounded_budget(env, key, maximum):
    value = env.get(key, '0')
    if not isinstance(value, str) or not re.fullmatch(r'\d+(?:\.\d+)?', value):
        raise ValueError('Finite bounded budget required')
    amount = Decimal(value)
    if not 0 <= amount <= Decimal(str(maximum)):
        raise ValueError('Approved budget ceiling exceeded')
    return amount


def personal_runtime_policy(environments, now):
    """Validate only an inactive owner or the approved personal beta.

    This function neither admits users nor starts a spending window. UUIDs and
    provider values stay in process memory and never enter status or logs.
    """
    if set(environments) != {'web', 'api', 'worker'}:
        raise ValueError('Three services required')
    web, api, worker = (environments[k] for k in ('web', 'api', 'worker'))
    for env in (web, api):
        if env.get('CLOSED_SITE_ENABLED') != 'true' or env.get('OPENAI_API_KEY') or env.get('ANTHROPIC_API_KEY'):
            raise ValueError('Closed origin and worker-only providers required')
    if web.get('PUBLIC_EXTERNAL_EXPOSURE_ENABLED') != 'false':
        raise ValueError('External exposure remains disabled')
    for env in (api, worker):
        if env.get('CLOSED_BETA_ENABLED') != 'true' or any(env.get(k) != 'false' for k in SHARED_FLAGS):
            raise ValueError('Personal beta only')
    for key in ('CLOSED_BETA_USER_IDS', 'AI_PROJECT_BUDGET_USD', 'AI_USER_BUDGET_USD'):
        if api.get(key, '') != worker.get(key, ''):
            raise ValueError('API and worker admission/budget mismatch')
    users = worker.get('CLOSED_BETA_USER_IDS', '').split(',') if worker.get('CLOSED_BETA_USER_IDS') else []
    if len(users) > 10 or len(set(users)) != len(users) or any(not ADMISSION_UUID.fullmatch(u) for u in users):
        raise ValueError('At most ten exact account UUIDs required')
    defaults = {'NARRATIVE_PIPELINE_MODE': 'legacy', 'NARRATIVE_COHORT_USER_IDS': '',
                'NARRATIVE_FICTION_GENERATION': 'v8'}
    for key, default in defaults.items():
        if api.get(key, default) != worker.get(key, default):
            raise ValueError('API and worker narrative configuration mismatch')
    mode, generation = (worker.get(k, defaults[k]) for k in
                        ('NARRATIVE_PIPELINE_MODE', 'NARRATIVE_FICTION_GENERATION'))
    cohort = worker.get('NARRATIVE_COHORT_USER_IDS', '')
    cohort = cohort.split(',') if cohort else []
    if (mode not in ('legacy', 'context', 'narrative-v1', 'narrative-fiction-v2')
            or generation not in ('v8', 'v9') or (generation == 'v9' and mode != 'narrative-fiction-v2')
            or len(cohort) != len(set(cohort)) or any(u not in users for u in cohort)):
        raise ValueError('Supported narrative configuration and admitted cohort required')
    for key, default, low, high in [('AI_FICTION_TIMEOUT_MS', '180000', 1000, 300000),
                                   ('AI_FICTION_MAX_REQUEST_BYTES', '100000', 100000, 196608)]:
        value = worker.get(key, default)
        if not isinstance(value, str) or not re.fullmatch(r'\d+', value) or not low <= int(value) <= high:
            raise ValueError('Bounded narrative worker runtime required')
    oa = bounded_budget(worker, 'AI_PROJECT_BUDGET_USD', 10)
    claude = bounded_budget(worker, 'CLAUDE_PRODUCTION_BUDGET_USD', 1)
    user = bounded_budget(worker, 'AI_USER_BUDGET_USD', 3.34)
    bounded_budget(worker, 'AI_PROJECT_INITIAL_SPENT_USD', 0)
    if worker.get('AI_BUDGET_WINDOW_REQUIRED') != 'true':
        raise ValueError('Fixed spending period required')
    if not users:
        if (oa or claude or user or worker.get('AI_BUDGET_WINDOW_START') or worker.get('AI_BUDGET_WINDOW_END') or
                worker.get('ANTHROPIC_API_KEY') or worker.get('OPENAI_API_KEY') != 'alterward_owner_provider_access_disabled'):
            raise ValueError('Inactive owner must retain zero allowances')
        return {'mode': 'owner', 'queueAllowed': False, 'userIds': []}
    stamps = []
    for key in ('AI_BUDGET_WINDOW_START', 'AI_BUDGET_WINDOW_END'):
        value = worker.get(key, '')
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z', value):
            raise ValueError('Exact UTC budget window required')
        stamps.append(dt.datetime.fromisoformat(value.replace('Z', '+00:00')))
    if (stamps[1] - stamps[0]).total_seconds() != 30 * 86400:
        raise ValueError('Exactly thirty days required')
    if oa and worker.get('OPENAI_API_KEY') in (None, '', 'alterward_owner_provider_access_disabled'):
        raise ValueError('Funded OpenAI worker requires its provider')
    if claude and not worker.get('ANTHROPIC_API_KEY'):
        raise ValueError('Funded Claude worker requires its provider')
    if not oa and worker.get('OPENAI_API_KEY') not in (None, '', 'alterward_owner_provider_access_disabled'):
        raise ValueError('Unfunded OpenAI provider must stay disabled')
    if not claude and worker.get('ANTHROPIC_API_KEY'):
        raise ValueError('Unfunded Claude provider must stay disabled')
    return {'mode': 'personal-beta', 'queueAllowed': stamps[0] <= now < stamps[1] and (oa > 0 or claude > 0) and user > 0,
            'userIds': users}


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
    environments = {service: dict(item.split('=', 1) for item in value['Config']['Env'])
                    for service, value in services.items()}
    personal_runtime_policy(environments, utcnow())
    for service, value in services.items():
        env = dict(item.split('=', 1) for item in value['Config']['Env'])
        if (not value['State']['Running'] or value['Image'] != manifest['imageId'] or
                value['HostConfig'].get('PortBindings') or value['Config']['User'] != 'node' or
                value['HostConfig'].get('CapDrop') != ['ALL'] or
                any(env.get(k) != str(v) for k, v in expected[service]['environment'].items())):
            raise ValueError('Protected runtime boundary changed')
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


def legacy_upgrade_archive_directory(manifest):
    """Keep the original legacy evidence after a completed funded transition.

    The active manifest moves to the funded source; its legacy upgrade directory
    does not. Only the preparation's byte-bound original authority may select
    that directory, and only after the existing terminal-state checks pass.
    """
    commit = manifest['commit']
    root = OWNER / 'funded-runtime-upgrade'
    journal = root / 'journal.json'
    if journal.exists() or journal.is_symlink():
        if not funded_upgrade_healthy('personal-beta'):
            raise ValueError('Completed funded transition required for legacy backup anchor')
        original = OWNER / 'personal-beta' / 'manifest.json'
        original_bytes = regular(original)
        prepared = json.loads(regular(root / 'prepared.json'))
        if digest(original_bytes) != prepared['baseline']['authority'][str(original)]:
            raise ValueError('Original legacy backup authority changed')
        commit = json.loads(original_bytes)['commit']
    if not isinstance(commit, str) or not re.fullmatch(r'[a-f0-9]{40}', commit):
        raise ValueError('Exact legacy backup commit required')
    return OWNER / 'upgrades' / commit


def extended_config_archive(proxy):
    source, _ = original_config_archive(proxy)
    files = {}
    with tarfile.open(fileobj=io.BytesIO(source), mode='r:gz') as archive:
        for member in archive.getmembers():
            if not member.isfile() or member.name in files:
                raise ValueError('Proxy archive invalid')
            files[member.name] = archive.extractfile(member).read()
    manifest = json.loads(regular(OWNER / 'manifest.json'))
    upgrade = legacy_upgrade_archive_directory(manifest)
    paths = [OWNER / n for n in ['server.env', 'manifest.json', 'effective-compose.json', 'pinned-image.json']]
    paths += [upgrade / n for n in ['server.env', 'manifest.json', 'effective-compose.json', 'pinned-image.json', 'prepared.json', 'applying.json', 'applied.json']]
    paths += [upgrade / 'previous' / n for n in ['server.env', 'manifest.json', 'effective-compose.json', 'pinned-image.json']]
    paths += [OWNER / 'origin-install' / n for n in ['inventory.json', 'origin-ca.pem']]
    paths += [OWNER / 'proxy-prepare' / n for n in ['before.Caddyfile', 'before.compose.yaml']]
    paths += [ROOT / 'config.json']
    paths += [ROOT / 'scripts' / name for name in config()['scriptHashes']]
    paths += reader_config_paths()
    paths += personal_config_paths()
    paths += funded_upgrade_config_paths()
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


READER_ARCHIVE_POLICY_VERSION = 1
PERSONAL_ARCHIVE_POLICY_VERSION = 1
# Separate from the two versions above so the funded operator's pinned check is
# untouched. Version 1 adds the completed/partial expired-preparation archives.
READER_PREPARATION_ARCHIVE_POLICY_VERSION = 1
READER_ARCHIVE_ROOT_NAME = 'personal-beta-readers-archive'
READER_ARCHIVE_LIMIT = 8
READER_ARCHIVE_ID = re.compile(r'expired-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{16}')
READER_ARCHIVED_STATE_NAMES = {'server.env', 'pinned-image.json', 'effective-compose.json',
                               'manifest.json', 'readers.json', 'access.json', 'prepared.json'}
READER_ARCHIVED_ORIGINAL_NAMES = {'server.env', 'pinned-image.json', 'effective-compose.json',
                                  'manifest.json', 'stage.json', 'access.json'}


def personal_config_paths():
    """Exact personal preparation/journal files, including interrupted evidence.

    The ORIGINAL zero bytes stay in the separately captured reader original.
    Provider credentials are captured only inside the existing encrypted config
    archive, never in health status, a new authority file or a public report.
    """
    path = OWNER / 'personal-beta'
    if not path.exists() and not path.is_symlink():
        return []
    info = path.lstat()
    if (path.resolve() != path.absolute() or not stat.S_ISDIR(info.st_mode) or
            info.st_uid != UID or stat.S_IMODE(info.st_mode) != 0o700):
        raise ValueError('Original private personal configuration directory required')
    names = {'server.env', 'pinned-image.json', 'effective-compose.json', 'manifest.json',
             'terms.json', 'prepared.json', 'transition.json', 'journal.json', 'observation.json'}
    files = []
    interrupted = 0
    for item in path.iterdir():
        if item.name not in names:
            if not re.fullmatch(r'\.upgrade-[a-z0-9_]{8}', item.name) or interrupted >= 8:
                raise ValueError('Unexpected personal preparation artifact')
            interrupted += 1
        regular(item)
        files.append(item)
    return sorted(files)


# Independent policy version: do not reinterpret the original personal/reader
# activation archives. Installing this reviewed Daily is a later release gate.
FUNDED_UPGRADE_ARCHIVE_POLICY_VERSION = 4


def funded_tree_paths(root, *, immutable_only=False):
    if not root.exists() and not root.is_symlink():
        return []
    private_archive_directory(root)
    files = []
    temporary = 0
    for item in root.iterdir():
        if item.name in {'target', 'recovery'}:
            private_archive_directory(item)
            for child in item.iterdir():
                if child.name not in {'server.env', 'effective-compose.json', 'pinned-image.json', 'manifest.json'}:
                    raise ValueError('Unknown funded runtime candidate file')
                regular(child)
                files.append(child)
        else:
            allowed = {'prepared.json', 'journal.json', 'readback.json', 'probe-compose.json', 'watchdog.json', 'archive.json', 'probe.json', 'capability.json'}
            if item.name not in allowed:
                if not re.fullmatch(r'\.upgrade-[a-z0-9_]{8}', item.name) or temporary >= 8:
                    raise ValueError('Unknown funded upgrade evidence')
                temporary += 1
            regular(item)
            if not immutable_only or item.name in {'prepared.json', 'archive.json'}:
                files.append(item)
    return sorted(files)


FUNDED_PROBE_VERSION = 'alterward-funded-probe-1'


def funded_probe_state(root):
    path = root / 'probe.json'
    if not path.exists() and not path.is_symlink():
        return None
    private_archive_directory(root)
    value = json.loads(regular(path))
    keys = {'version', 'sourceCommit', 'bundleSha256', 'name', 'imageId',
            'composeSha256', 'state', 'containerId'}
    if (not isinstance(value, dict) or set(value) != keys
            or value['version'] != FUNDED_PROBE_VERSION
            or not isinstance(value['sourceCommit'], str) or not re.fullmatch(r'[a-f0-9]{40}', value['sourceCommit'])
            or any(not isinstance(value[k], str) or not re.fullmatch(r'[a-f0-9]{64}', value[k])
                   for k in ('bundleSha256', 'composeSha256'))
            or not isinstance(value['name'], str) or not re.fullmatch(
                r'[a-z0-9][a-z0-9_.-]{0,100}-funded-probe-[a-f0-9]{32}', value['name'])
            or not isinstance(value['imageId'], str) or not re.fullmatch(r'sha256:[a-f0-9]{64}', value['imageId'])
            or value['state'] not in {'pending', 'cleaned'}
            or (value['containerId'] is not None and (not isinstance(value['containerId'], str)
                or not re.fullmatch(r'[a-f0-9]{64}', value['containerId'])))
            or (value['state'] == 'pending' and value['containerId'] is not None)
            or digest(regular(root / 'probe-compose.json')) != value['composeSha256']):
        raise ValueError('Invalid funded probe evidence')
    return value


FUNDED_CAPABILITY_VERSION = 'alterward-funded-capability-1'


def funded_capability_state(root):
    path = root / 'capability.json'
    if not path.exists() and not path.is_symlink():
        return None
    private_archive_directory(root)
    value = json.loads(regular(path))
    keys = {'version', 'sourceCommit', 'bundleSha256', 'name', 'imageId',
            'commandSha256', 'inputSha256', 'state', 'containerId'}
    if (not isinstance(value, dict) or set(value) != keys
            or value['version'] != FUNDED_CAPABILITY_VERSION
            or not isinstance(value['sourceCommit'], str) or not re.fullmatch(r'[a-f0-9]{40}', value['sourceCommit'])
            or any(not isinstance(value[k], str) or not re.fullmatch(r'[a-f0-9]{64}', value[k])
                   for k in ('bundleSha256', 'commandSha256', 'inputSha256'))
            or not isinstance(value['name'], str) or not re.fullmatch(
                r'[a-z0-9][a-z0-9_.-]{0,100}-funded-capability-[a-f0-9]{32}', value['name'])
            or not isinstance(value['imageId'], str) or not re.fullmatch(r'sha256:[a-f0-9]{64}', value['imageId'])
            or value['state'] not in {'pending', 'cleaned'}
            or (value['containerId'] is not None and (not isinstance(value['containerId'], str)
                or not re.fullmatch(r'[a-f0-9]{64}', value['containerId'])))):
        raise ValueError('Invalid funded capability evidence')
    return value


FUNDED_ARCHIVE_NAME = 'funded-runtime-upgrade-archive'
FUNDED_ARCHIVE_LIMIT = 8
FUNDED_ARCHIVE_VERSION = 'alterward-funded-archive-1'


def funded_unapplied_files(root):
    paths = funded_tree_paths(root)
    names = {p.relative_to(root).as_posix() for p in paths}
    required = {'prepared.json'} | {r + '/' + n for r in ('target', 'recovery') for n in
               ('server.env', 'effective-compose.json', 'pinned-image.json', 'manifest.json')}
    if not required <= names or not names <= required | {'probe-compose.json', 'archive.json', 'probe.json', 'capability.json'}:
        raise ValueError('Only a complete never-applied funded preparation can be archived')
    capability = funded_capability_state(root)
    if capability is not None and capability['state'] != 'cleaned':
        raise ValueError('Pending funded capability cannot be archived')
    probe = funded_probe_state(root)
    if probe is not None and probe['state'] != 'cleaned':
        raise ValueError('Pending funded probe cannot be archived')
    return {p.relative_to(root).as_posix(): digest(regular(p)) for p in paths if p.name != 'archive.json'}


def validate_funded_archive(root):
    files = funded_unapplied_files(root)
    value = json.loads(regular(root / 'archive.json'))
    keys = {'version', 'preparedSha256', 'preparedSourceCommit', 'archiverSourceCommit',
            'archivedAt', 'baselineSha256', 'files'}
    prepared_bytes = regular(root / 'prepared.json')
    prepared = json.loads(prepared_bytes)
    for role in ('target', 'recovery'):
        expected = prepared['files'][role]
        observed = {name.split('/', 1)[1]: h for name, h in files.items() if name.startswith(role + '/')}
        if expected != observed:
            raise ValueError('Archived runtime differs from preparation')
    if (set(value) != keys or value['version'] != FUNDED_ARCHIVE_VERSION or value['files'] != files
            or value['preparedSha256'] != digest(prepared_bytes)
            or value['preparedSourceCommit'] != prepared['sourceCommit']
            or not re.fullmatch(r'[a-f0-9]{40}', value['archiverSourceCommit'])
            or value['baselineSha256'] != digest((json.dumps(prepared['baseline'], sort_keys=True, separators=(',', ':')) + '\n').encode())
            or dt.datetime.fromisoformat(value['archivedAt']) < dt.datetime.fromisoformat(prepared['expiresAt'])):
        raise ValueError('Funded archive evidence changed')
    return prepared, value


def funded_archived_paths():
    root = OWNER / FUNDED_ARCHIVE_NAME
    if not root.exists() and not root.is_symlink():
        return []
    private_archive_directory(root)
    entries = sorted(root.iterdir())
    if len(entries) > FUNDED_ARCHIVE_LIMIT:
        raise ValueError('Too many funded preparation archives')
    files = []
    for entry in entries:
        if not re.fullmatch(r'[a-f0-9]{64}', entry.name):
            raise ValueError('Unknown funded archive')
        validate_funded_archive(entry)
        if digest(regular(entry / 'prepared.json')) != entry.name:
            raise ValueError('Funded archive identity changed')
        files += funded_tree_paths(entry)
    return files


def funded_upgrade_config_paths(*, immutable_only=False):
    return sorted(funded_tree_paths(OWNER / 'funded-runtime-upgrade', immutable_only=immutable_only)
                  + funded_archived_paths() + successor_config_paths(immutable_only=immutable_only))


SUCCESSOR_VERSION = 'alterward-beta-successor-1'
RUNTIME_NAMES = {'server.env', 'effective-compose.json', 'pinned-image.json', 'manifest.json'}
SUCCESSOR_NAMES = {'prepared.json', 'selection.json', 'terms.json', 'journal.json',
                   'readback.json', 'database-after.json', 'probe-compose.json',
                   'probe.json', 'capability.json', 'watchdog.json', 'archive.json',
                   'access.json', 'registry-evidence.json', 'registry-intent.json'}
SUCCESSOR_IMMUTABLE_NAMES = {'prepared.json', 'selection.json', 'terms.json', 'archive.json', 'access.json'}
SUCCESSOR_ARCHIVE_NAME = 'beta-successor-archive'
SUCCESSOR_ARCHIVE_VERSION = 'alterward-beta-successor-archive-1'
SUCCESSOR_PLAN_VERSION = 'alterward-beta-successor-plan-2'
# One finite directory per separately authorized transition. The first is the
# owner-e2e window; each later one has the previous FULLY exposed generation as
# its parent and may never be prepared while an earlier one is still unfinished.
SUCCESSOR_ROOT_NAMES = ('beta-successor', 'beta-successor-2', 'beta-successor-3', 'beta-successor-4',
                        'beta-successor-5', 'beta-successor-6', 'beta-successor-7', 'beta-successor-8')
# purpose -> (participants, projectUsd, userUsd) for allowance-changing purposes.
SUCCESSOR_WINDOW_PURPOSES = {'owner-e2e': (1, '3', '3'), 'tester-beta': (3, '10', '3.33')}
# Explicit040 profile; none of these labels relax the historical039 validators.
SUCCESSOR_REGISTRY_PURPOSE = 'schema-040'
SUCCESSOR_REGISTRY_BILLING_PURPOSE = 'billing-config-040'
SUCCESSOR_REGISTRY_PLAN_VERSION = 'alterward-beta-successor-plan-3'
REGISTRY_040_CHANGE_HASHES = {
    'apps/api/src/app.ts': 'add67bab0dbae4f95a257e5aed396ef8d96bd0cf8156e3aba8174b9712a3b270',
    'apps/api/src/auth.ts': 'ad860d1c49b7e3446d8c54990afb1b7e2aa790063dadd6940466b6f39817632f',
    'apps/api/src/billing-generation.ts': '8c363513342a07a092c1a088df9484eba1781fc79b9526d96e2a41bb85fa3896',
    'apps/api/src/billing.ts': '382ba90fb5219470d393cef8415209953278ee1e41c463340d6f337cb575c3f0',
    'apps/api/src/personal-scenario-starts.ts': '912e8eb3b58142c332ffcc109c7721d382779468f540ff4ff6523ab88a1f7b1c',
    'apps/api/src/public-fork-permission.ts': '692f100f927b31164645a50f2ddc872073edc7c761d61bc196a3b04f5927570d',
    'apps/api/src/service-access.ts': '3cd270e384b5e5e949882bb36484a9f7af563748969a0eb8dcadde2dfb325009',
    'apps/api/src/service-admission.ts': 'c47fc49078afb4662880ce9020d456c1a838c01586fcf4ee62aa4c369107f991',
    'apps/web/components/admission-gate.tsx': 'c8303ffbdbcf76c8521039edfd257a818b6d338d5cf67c532058809ac9d3d156',
    'apps/web/components/billing-panel.tsx': '5ffc3b3a1b52992f4f6163bbf7afc74575ecde109cd1d0de49d0068c0f5a1900',
    'apps/web/components/experience.tsx': '6679d36cd61bb11e171dd15fd23dacd084929a1ec71350014723f129c4f6ca86',
    'apps/web/components/life-error-notice.tsx': '5a004dca3e9837336de767c45a9e712705ff2904403e6e7f4957939041d22412',
    'apps/web/components/life-experience.tsx': '3084f90363549a8d382751cabd0f5d971504fd291a04f0cfad7370919a087e1d',
    'apps/web/components/public-fork-launcher.tsx': 'ac98461cf76aa48ced751ae1b1610ac0abf9b8936e9b549ca8fa9c22aa6a80a3',
    'apps/web/components/scenario-personal-launcher.tsx': '3308804fa9d995b0b217f03bd11d63874ec81d057ed13721ed0991dda1bc5c45',
    'apps/web/lib/admission.ts': 'c92d1637cca27f06e0529c2ffe028b1b4dec6ba227fcdae403ace13ae78bdc2a',
    'apps/web/lib/billing.ts': 'b1d875729517a96776086624ce9463cf015dcfcc53218b99b6d7130b07b49e46',
    'apps/web/lib/i18n/messages.ts': '43cd2b2bc4ddf5c48d30c43872e721e46e7780fc0df6cde2efe2287edc2ca8a4',
    'apps/web/lib/life-notice.ts': '825577c83af2ad474c89c7f0dbb680af8a407404cf23d075c34f214d58350b60',
    'apps/web/proxy.ts': '5d6188280d6d0c94e719d02df3a3bca541251d5d7659f383eb1136cd5129ae29',
    'apps/worker/src/billing-queues.ts': '8df63e8c787be10e12c8c93889894e6444a6e0a0f5ca6a2b66a06d665961a04b',
    'apps/worker/src/chapter-billing.ts': '07e5a49cf1d5352a7f28ff32fa864489e99a3acca6d9f7321552139f87200245',
    'apps/worker/src/main.ts': '10134cf57123abc8d6f7cf1f1f31a37197280ecb80f148a8a956d185ce9b4fae',
    'apps/worker/src/service-budget.ts': 'a7d7c6b390765322a6a299067be543a46b9cfdb2fb70cae2f8608007059192cc',
    'database/migrations/040_service_access_registry.sql': '622b11aa79aee37421802c02167e98d1b73ec8a79c5ff9da4d75ed33a08d7b2c',
    'deploy/compose.yaml': '54d0170b7974a46432b3a4993c527ec8e8626ad7e18ad53a8c563f102edb4fea',
    'deploy/server.env.example': '3c29e4ca8f6141e35376fda1fbf9c1dd75c6eecc1a5a29361e8c37a56c9f8bd9',
    'packages/access/src/index.ts': '04831f04b136756c3601943f993b182de837d013d10e2d53f38cbbc911f219d5',
    'packages/contracts/src/error-messages.ts': '586e6aa7f3538d5c362d29b0520a1f4095df3498319b8b9071f4f91dff7c8ec8',
    'packages/contracts/src/privacy-consent.ts': '6f505e74c7994c744295cbc7ad1271dc982f7b23059303027d100f79f2fc6ac2',
    'packages/core/src/billing-service.ts': '3826bf6fe5f55ab6ecdb2837d5a68c54454990319213f01e465378fd1ecc7703',
    'packages/core/src/billing-stripe-provider.ts': 'd5cf5c74ce6a315de9a6b7f7ecf0b50399727af491ac5f283249e63208f7aecc',
    'packages/core/src/billing.ts': 'af3cfe5a84b21765d049bc5b13c8f71e4ed8eafa649b7e088b0ec0af169f1b5b',
    'packages/core/src/index.ts': '04fd18bc5aa2bac28a6514eb9b6b7ddfa227ade8180435680c19f362092bb3fd',
    'packages/core/src/service-access.ts': 'b27f25b70682ac0541c62b52d33b303281f6300ed58c7c9e4f40b34d4e8c4d21',
    'packages/database/src/ai-budget.ts': 'f0b09e219da55b16af941ba1d945b00ab662be994a92657f815afff026b20c5d',
    'packages/database/src/billing.ts': 'ee4424f5496ac027f6967f07702dbe54daaab26dceba7a207171870493b7883b',
    'packages/database/src/closed-beta.ts': '5fcb3fb69a5b0758163a38b3cd28c142b1a471504a0ba9816f00be47650ee338',
    'packages/database/src/index.ts': '34e5298993b6ab93fe4345aa477d67c097f010f2faab1b83074be878d40f992f',
    'packages/database/src/life-jobs.ts': '1ff551d723dd41bf935e3e6aa3938e469cf2bd501607d82dfa1a46ddb8bc5105',
    'packages/database/src/lives.ts': '548069e66f2ef9208a44cbafed1a102bba71ebe596e09ba809035154283b298a',
    'packages/database/src/narrative-memory.ts': '3941f9f8c2d1b0947e3e00e09b53b4103a005b34687b23d49f76b457e54f6355',
    'packages/database/src/repository.ts': '5a4f2cde4503cd41e7a7feca3f777b9f73ee84d912cb0680fab798a0d4907824',
    'packages/database/src/service-access.ts': '29538c53ec4b66863185916be098ebe49774c022eda5656965d67b2ec57226a6'
}

SUCCESSOR_READER_PURPOSE = 'reader-admission'
# The 038 to 039 database and application upgrade: no allowance, window, cohort or reader change.
SUCCESSOR_SCHEMA_PURPOSE = 'schema-039'
SUCCESSOR_SCHEMA_STEP = (38, 39)
# Billing reaches api and worker only and stays at the compose default (off) in this upgrade.
SUCCESSOR_BILLING_DEFAULTS = {
    'BILLING_ENABLED': 'false', 'BILLING_ENFORCEMENT': 'false', 'STRIPE_SECRET_KEY': '',
    'STRIPE_WEBHOOK_SECRET': '', 'STRIPE_PRICE_ID': '', 'STRIPE_FOUNDER_COUPON_ID': '',
    'STRIPE_API_VERSION': '', 'BILLING_SUCCESS_URL': '', 'BILLING_CANCEL_URL': '',
    'BILLING_FOUNDER_USER_IDS': '', 'BILLING_RESERVATION_TTL_SECONDS': '7200'}
# Billing configuration: the eleven BILLING_*/STRIPE_* values reach api and worker only, in at most
# three ordered, once-only stages (Stripe test, live, enforcement). No allowance, window, cohort,
# reader or database change; the secrets exist only as SHA-256 digests in the selection.
SUCCESSOR_BILLING_PURPOSE = 'billing-config'
SUCCESSOR_BILLING_STAGES = ('sandbox', 'live', 'enforce')
# Mirror of the root adapter's list (a test keeps all copies equal): the one reviewed path that may
# differ from the serving image in a billing-config generation (pg-pool idle error handling).
SUCCESSOR_BILLING_ALLOWED_CHANGES = ('packages/database/src/index.ts',)
SUCCESSOR_BILLING_SECRET_KEY = re.compile(r'(?:sk|rk)_(test|live)_[A-Za-z0-9]{8,}')
SUCCESSOR_BILLING_WEBHOOK = re.compile(r'whsec_[A-Za-z0-9]{8,}')
SUCCESSOR_BILLING_PATTERNS = {
    'priceId': re.compile(r'price_[A-Za-z0-9]+'), 'couponId': re.compile(r'[A-Za-z0-9_-]{1,100}'),
    'apiVersion': re.compile(r'\d{4}-\d{2}-\d{2}(?:\.[a-z]+)?'),
    'successUrl': re.compile(r'https://([a-z0-9][a-z0-9.-]*[a-z0-9])(?:/[A-Za-z0-9._~/%?=&:-]{0,200})?'),
    'cancelUrl': re.compile(r'https://([a-z0-9][a-z0-9.-]*[a-z0-9])(?:/[A-Za-z0-9._~/%?=&:-]{0,200})?'),
    'secretKeySha256': re.compile(r'[a-f0-9]{64}'), 'webhookSecretSha256': re.compile(r'[a-f0-9]{64}')}
# The ONLY application sources that may differ between the serving image and the
# schema-039 target image (909ae28..fe67d94: billing, legal pages, the closed-site
# webhook/terms exception and the default-off generation-gate hooks). Everything
# else in the frozen scope, above all the narrative engine, must stay byte-identical
# to the serving image or the preparation is refused. Reviewed together with the
# diff; adding a path is a code change that needs its own review.
SUCCESSOR_SCHEMA_ALLOWED_CHANGES = (
    'apps/api/src/account-deletion.ts',
    'apps/api/src/app.ts',
    'apps/api/src/billing-runtime.ts',
    'apps/api/src/billing.ts',
    'apps/web/app/billing/page.tsx',
    'apps/web/app/globals.css',
    'apps/web/app/terms/page.tsx',
    'apps/web/components/billing-panel.tsx',
    'apps/web/components/experience.tsx',
    'apps/web/components/legal-text.tsx',
    'apps/web/components/privacy-notice.tsx',
    'apps/web/components/terms-of-use.tsx',
    'apps/web/lib/billing.ts',
    'apps/web/lib/i18n/messages.ts',
    'apps/worker/src/billing-maintenance.ts',
    'apps/worker/src/main.ts',
    'database/migrations/039_billing_foundation.sql',
    'deploy/compose.yaml',
    'deploy/server.env.example',
    'packages/access/src/index.ts',
    'packages/ai/src/claude.ts',
    'packages/contracts/src/error-messages.ts',
    'packages/core/src/billing-service.ts',
    'packages/core/src/billing-stripe-provider.ts',
    'packages/core/src/billing-stripe.ts',
    'packages/core/src/billing.ts',
    'packages/core/src/index.ts',
    'packages/database/src/ai-budget.ts',
    'packages/database/src/billing.ts',
    'packages/database/src/index.ts',
    'packages/database/src/life-jobs.ts',
    'packages/database/src/lives.ts',
)
SUCCESSOR_EMAIL = re.compile(r'[-a-z0-9._+]+@[-a-z0-9.]+')


def successor_billing_selection(selection):
    """The exact non-secret billing selection (the root adapter validates the same shape)."""
    keys = {'stage', 'mode', 'enabled', 'enforcement', 'priceId', 'couponId', 'apiVersion', 'successUrl',
            'cancelUrl', 'founderUserIds', 'reservationTtlSeconds', 'secretKeySha256', 'webhookSecretSha256'}
    if (not isinstance(selection, dict) or set(selection) != {'purpose', 'previousTermsSha256', 'billing'}
            or selection['purpose'] not in {SUCCESSOR_BILLING_PURPOSE, SUCCESSOR_REGISTRY_BILLING_PURPOSE}
            or not isinstance(selection['billing'], dict) or set(selection['billing']) != keys):
        raise ValueError('Exact billing-config selection required')
    value = selection['billing']
    founders = value['founderUserIds']
    stage, mode = value['stage'], value['mode']
    if (stage not in SUCCESSOR_BILLING_STAGES or mode not in {'test', 'live'}
            or value['enabled'] is not True or type(value['enforcement']) is not bool
            or (stage == 'sandbox' and (mode != 'test' or value['enforcement']))
            or (stage == 'live' and (mode != 'live' or value['enforcement']))
            or (stage == 'enforce' and (mode != 'live' or not value['enforcement']))
            or any(not isinstance(value[k], str) or not pattern.fullmatch(value[k])
                   for k, pattern in SUCCESSOR_BILLING_PATTERNS.items())
            or not isinstance(founders, list) or founders != sorted(set(founders)) or len(founders) > 10
            or any(not isinstance(u, str) or not ADMISSION_UUID.fullmatch(u) for u in founders)
            or type(value['reservationTtlSeconds']) is not int
            or not 600 <= value['reservationTtlSeconds'] <= 86400):
        raise ValueError('Exact billing-config selection required')
    return value


def successor_billing_environment(value):
    """The api/worker values a billing selection must produce, except the two secrets."""
    return {'BILLING_ENABLED': 'true', 'BILLING_ENFORCEMENT': 'true' if value['enforcement'] else 'false',
            'STRIPE_PRICE_ID': value['priceId'], 'STRIPE_FOUNDER_COUPON_ID': value['couponId'],
            'STRIPE_API_VERSION': value['apiVersion'], 'BILLING_SUCCESS_URL': value['successUrl'],
            'BILLING_CANCEL_URL': value['cancelUrl'], 'BILLING_FOUNDER_USER_IDS': ','.join(value['founderUserIds']),
            'BILLING_RESERVATION_TTL_SECONDS': str(value['reservationTtlSeconds'])}


def successor_json(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()





REGISTRY_040_MIGRATION_SHA256 = '0186a292a524ed9e0de5238aa3ebe8c966c29d8a48bb1ecaf694045ad03bd5d8'


def registry_journal_fields(row, *, registry=False, registry_config=False):
    keys = {'state', 'changedAt', 'previousSha256', 'sha256'}
    if registry and row.get('state') == 'database-intent':
        keys.add('registryIntentSha256')
        h = row.get('registryIntentSha256')
        if not isinstance(h, str) or not re.fullmatch(r'[a-f0-9]{64}', h):
            raise ValueError('Exact registry intent journal hash required')
    if registry_config and row.get('state') == 'database-intent':
        keys.add('registryEvidenceSha256')
        if not isinstance(row.get('registryEvidenceSha256'),str) or not re.fullmatch(r'[a-f0-9]{64}',row['registryEvidenceSha256']):
            raise ValueError('Exact native040 configuration evidence hash required')
    if set(row) != keys:
        raise ValueError('Exact profile-bound journal row required')
    return keys


def validate_registry_restore_proof(candidate, manifest, proof, *, migration):
    """A root-produced, held-writer replay receipt, never a caller boolean.

    Callers authenticate the original root-only file. This validates its source,
    image, actual archive and immutable predecessor before it can authorize SQL.
    """
    if not isinstance(proof, dict) or not isinstance(manifest, dict):
        raise ValueError('Measured registry restore proof required')
    positive = ('originalIdsImagesPreserved','foreignContainersUnchanged','freshStateEqualBeforeAndAfterReplay',
                'ownerOriginBoundaryVerified','dataOnlyOriginalBackupLoaded','cleanCatalogHardenedBeforeDataLoad',
                'networkHasNoExternalInterface','temporaryContainersAndPlaintextRemoved')
    negative = ('writerFenceStillHeld','replayAllowed','serviceActivationAllowed','liveDatabaseWrites',
                'authProviderWrites','externalMessagesSent')
    if (proof.get('sourceCommit') != candidate['sourceCommit'] or proof.get('mode') != 'rehearsal'
            or proof.get('ownerManifestDigest') != candidate['files']['previous']['manifest.json']
            or proof.get('backupRunId') != manifest.get('runId')
            or proof.get('backupManifestCanonicalSha256') != successor_canonical_hash(manifest)
            or proof.get('backupCipherSha256') != manifest.get('encryptedFiles',{}).get('application.dump.age',{}).get('sha256')
            or proof.get('tablesMatchedBeforeReplay') != (101 if migration else 103)
            or proof.get('servicesStoppedAndResumed') != 3 or proof.get('publicPorts') != 0
            or type(proof.get('paidAiCalls')) is not int or proof['paidAiCalls'] != 0
            or any(proof.get(k) is not True for k in positive)
            or any(proof.get(k) is not False for k in negative)):
        raise ValueError('Exact candidate archive, held replay, source and predecessor required')
    try:
        at = dt.datetime.fromisoformat(proof['capturedAt'].replace('Z','+00:00'))
        prepared = dt.datetime.fromisoformat(candidate['preparedAt'].replace('Z','+00:00'))
        expires = dt.datetime.fromisoformat(candidate['expiresAt'].replace('Z','+00:00'))
        if at.utcoffset() != dt.timedelta(0) or not prepared <= at < expires:
            raise ValueError('Restore must follow preparation inside its original window')
    except (KeyError, TypeError, AttributeError) as error:
        raise ValueError('Exact registry restore timestamp required') from error
    active = proof.get('fundedRuntime', {})
    if (active.get('sourceCommit') != manifest.get('ownerCommit') or active.get('imageId') != manifest.get('ownerImage')
            or active.get('ownerManifestDigest') != proof['ownerManifestDigest']):
        raise ValueError('Original backup owner authority must remain distinct')
    if migration:
        step = proof.get('registryMigrationRestore', {})
        context = step.get('context', {})
        if (proof.get('registryCandidate') != {'preparedSha256':digest(successor_json(candidate)),
                'targetImage':candidate['release']['target']['imageId']}
                or active.get('version') != 'alterward-funded-replay-1'
                or step.get('version') != 'alterward-registry-migration-restore-proof-1'
                or step.get('profile') != 'historical039-to-registry040'
                or context.get('sourceCommit') != candidate['sourceCommit']
                or context.get('imageId') != candidate['release']['target']['imageId']
                or context.get('backupRunId') != manifest['runId']
                or context.get('backupDumpSha256') != manifest.get('dumpSha256')
                or context.get('backupCapturedAt') != manifest.get('capturedAt','').replace('+00:00','Z')
                or not re.fullmatch(r'aw_restore_[a-f0-9]{24}',context.get('quarantineDatabase',''))
                or step.get('sourceTables') != 100 or step.get('reviewedTables') != 102
                or step.get('reviewedForeignKeys') != 226 or step.get('newRegistryEmpty') is not True
                or step.get('replayedDataPreserved') is not True
                or step.get('serviceActivationAllowed') is not False or step.get('authProviderWrites') is not False
                or type(step.get('providerApiCalls')) is not int or step['providerApiCalls'] != 0
                or any(not isinstance(h,str) or not re.fullmatch(r'[a-f0-9]{64}',h) for h in
                    [context.get('quarantineInstanceSha256')] + [step.get(k) for k in ('intentSha256',
                        'sourceAuthoritySha256','historicalReplayProofSha256','historicalVerificationSha256','postVerificationSha256','postVerificationStateSha256')])):
            raise ValueError('Measured independently verified historical039 to040 restore required')
    elif (active.get('version') != 'alterward-funded-replay-2' or active.get('schema') != 40
            or active.get('recoveryProfile') != 'registry040' or proof.get('reviewedTables') != 102
            or proof.get('reviewedForeignKeys') != 226 or proof.get('independentReadOnlyPostReplayVerified') is not True
            or proof.get('reviewedSecurityCatalog') is not True):
        raise ValueError('Native040 independent privacy replay required')
    return proof


def validate_registry_intent_payload(intent, candidate, evidence):
    keys = {'version', 'purpose', 'context', 'observedAt', 'expiresAt', 'before',
            'migrationSha256', 'serviceActivationAllowed', 'providerApiCalls', 'authProviderWrites'}
    plan = candidate.get('operation', {}).get('plan', {})
    if (not isinstance(intent, dict) or set(intent) != keys
            or intent['version'] != 'alterward-registry-upgrade-intent-1'
            or intent['purpose'] != SUCCESSOR_REGISTRY_PURPOSE
            or plan.get('purpose') != SUCCESSOR_REGISTRY_PURPOSE
            or plan.get('version') != SUCCESSOR_REGISTRY_PLAN_VERSION
            or intent['serviceActivationAllowed'] is not False
            or intent['authProviderWrites'] is not False
            or type(intent['providerApiCalls']) is not int or intent['providerApiCalls'] != 0
            or intent['migrationSha256'] != REGISTRY_040_MIGRATION_SHA256):
        raise ValueError('Exact registry migration intent required')
    before = parse_registry_runtime(intent['before'])
    if before['schema'] != 39 or before != parse_registry_runtime(candidate['database']):
        raise ValueError('Original registry039 baseline required')
    if (not isinstance(evidence, dict)
            or set(evidence) != {'candidateSha256', 'backupManifest', 'restoreProof'}
            or evidence['candidateSha256'] != successor_canonical_hash(candidate)
            or not isinstance(evidence['backupManifest'], dict) or not isinstance(evidence['restoreProof'], dict)
            or not isinstance(evidence['backupManifest'].get('runId'), str)
            or not RUN_ID.fullmatch(evidence['backupManifest']['runId'])
            or evidence['backupManifest']['runId'] != evidence['restoreProof'].get('runId')):
        raise ValueError('Original registry backup evidence required')
    validate_registry_restore_proof(candidate, evidence['backupManifest'],
        evidence['restoreProof'].get('registryReplay'), migration=True)
    expected = {'sourceCommit': candidate['sourceCommit'],
        'imageId': candidate['release']['target']['imageId'],
        'candidateSha256': successor_canonical_hash(candidate),
        'parentAuthoritySha256': successor_canonical_hash({k: candidate[k] for k in (
            'parentPreparedSha256', 'parentJournalSha256', 'parentReadbackSha256')}),
        'backupManifestSha256': successor_canonical_hash(evidence['backupManifest']),
        'restoreProofSha256': successor_canonical_hash(evidence['restoreProof'])}
    if intent['context'] != expected:
        raise ValueError('Registry intent context binding mismatch')
    if any(not isinstance(intent[k], str) or not re.fullmatch(
            r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z', intent[k])
            for k in ('observedAt', 'expiresAt')):
        raise ValueError('Exact UTC registry intent timestamps required')
    observed, expires = (dt.datetime.fromisoformat(intent[k].replace('Z', '+00:00'))
                         for k in ('observedAt', 'expiresAt'))
    if (any(t.utcoffset() != dt.timedelta(0) for t in (observed, expires))
            or (expires - observed).total_seconds() != 900):
        raise ValueError('Exact bounded UTC registry intent required')
    return intent


def registry_bound_config_evidence(root, candidate, rows, *, read=None):
    read = regular if read is None else read
    evidence = json.loads(read(root/'registry-evidence.json'))
    if (set(evidence) != {'candidateSha256','backupManifest','restoreProof'}
            or evidence['candidateSha256'] != successor_canonical_hash(candidate)
            or evidence['backupManifest']['runId'] != evidence['restoreProof']['runId']):
        raise ValueError('Original native040 configuration restore evidence required')
    validate_registry_restore_proof(candidate,evidence['backupManifest'],evidence['restoreProof']['registryReplay'],migration=False)
    hashes = []
    for row in rows:
        registry_journal_fields(row,registry_config=True)
        if row['state'] == 'database-intent':
            hashes.append(row['registryEvidenceSha256'])
    if not hashes or set(hashes) != {successor_canonical_hash(evidence)}:
        raise ValueError('Native040 evidence must match its durable journal binding')
    return evidence


def registry_bound_intent(root, candidate, rows, *, read=None):
    read = regular if read is None else read
    evidence = json.loads(read(root / 'registry-evidence.json'))
    intent = validate_registry_intent_payload(json.loads(read(root / 'registry-intent.json')), candidate, evidence)
    hashes = []
    for row in rows:
        registry_journal_fields(row, registry=True)
        if row['state'] == 'database-intent':
            hashes.append(row['registryIntentSha256'])
    if not hashes or set(hashes) != {successor_canonical_hash(intent)}:
        raise ValueError('Registry intent must match its durable journal binding')
    return intent

def registry_schema_selection(selection, previous_terms):
    if (not isinstance(selection, dict)
            or set(selection) != {'purpose', 'previousTermsSha256', 'fromSchema', 'toSchema'}
            or selection['purpose'] != SUCCESSOR_REGISTRY_PURPOSE
            or type(selection['fromSchema']) is not int or type(selection['toSchema']) is not int
            or (selection['fromSchema'], selection['toSchema']) != (39, 40)
            or selection['previousTermsSha256'] != successor_canonical_hash(previous_terms)):
        raise ValueError('Exact039 to040 selection preserving previous terms required')
    return selection


def registry_schema_plan(selection, previous_terms, now, source_hashes):
    registry_schema_selection(selection, previous_terms)
    if (now.utcoffset() != dt.timedelta(0)
            or any(source_hashes.get(p) != h for p, h in REGISTRY_040_CHANGE_HASHES.items())):
        raise ValueError('Exact UTC clock and reviewed040 source hashes required')
    stamp = lambda t: t.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    return {'version': SUCCESSOR_REGISTRY_PLAN_VERSION, 'purpose': SUCCESSOR_REGISTRY_PURPOSE,
        'observedAt': stamp(now), 'expiresAt': stamp(now + dt.timedelta(seconds=900)),
        'previousTermsSha256': successor_canonical_hash(previous_terms),
        'selectionSha256': successor_canonical_hash(selection), 'fromSchema': 39, 'toSchema': 40,
        'allowedChanges': list(REGISTRY_040_CHANGE_HASHES),
        'allowedChangeHashes': dict(REGISTRY_040_CHANGE_HASHES)}

def parse_registry_runtime(value):
    keys = {'version', 'profile', 'schema', 'identityBindingSha256', 'dataSha256',
            'artifactSha256', 'catalogSha256', 'policiesSha256', 'drained', 'providerApiCalls',
            'billingDataSha256', 'migrationPrefixSha256', 'registryDataSha256', 'registryRows'}
    hashes = ('identityBindingSha256', 'dataSha256', 'artifactSha256', 'catalogSha256',
              'policiesSha256', 'billingDataSha256', 'migrationPrefixSha256')
    if (not isinstance(value, dict) or set(value) != keys
            or value['version'] != 'alterward-funded-runtime-2'
            or value['profile'] != 'service-registry-040'
            or type(value['schema']) is not int or value['schema'] not in (39, 40)
            or value['drained'] is not True or type(value['providerApiCalls']) is not int
            or value['providerApiCalls'] != 0
            or any(not isinstance(value[k], str) or not re.fullmatch(r'[a-f0-9]{64}', value[k]) for k in hashes)):
        raise ValueError('Exact drained registry v2 observation required')
    rows, registry = value['registryRows'], value['registryDataSha256']
    if value['schema'] == 39:
        if rows is not None or registry is not None:
            raise ValueError('Schema039 cannot carry registry authority')
    elif (not isinstance(rows, dict) or set(rows) != {'policy', 'admissions'}
            or type(rows['policy']) is not int or not 0 <= rows['policy'] <= 1
            or type(rows['admissions']) is not int or not 0 <= rows['admissions'] <= 100000
            or not isinstance(registry, str) or not re.fullmatch(r'[a-f0-9]{64}', registry)):
        raise ValueError('Exact schema040 registry observation required')
    return value


def same_registry_runtime(before, after, *, migration=False):
    before, after = parse_registry_runtime(before), parse_registry_runtime(after)
    if not migration:
        if before != after:
            raise ValueError('Protected registry runtime changed')
        return
    keys = ('identityBindingSha256', 'dataSha256', 'artifactSha256', 'policiesSha256',
            'billingDataSha256', 'migrationPrefixSha256')
    if (before['schema'] != 39 or after['schema'] != 40
            or after['registryRows'] != {'policy': 0, 'admissions': 0}
            or any(before[k] != after[k] for k in keys)):
        raise ValueError('Registry migration changed protected data or receipts')


def registry_profile_default(config):
    # A newly introduced false value may be absent in the original039 render.
    # True/unknown values are never normalized away during an OFF-profile upgrade.
    result = json.loads(json.dumps(config))
    for role in ('web', 'api', 'worker'):
        env = result['services'][role]['environment']
        if env.get('SERVICE_ACCESS_ENFORCEMENT', 'false') != 'false':
            raise ValueError('Registry schema upgrade must leave service profile OFF')
        env['SERVICE_ACCESS_ENFORCEMENT'] = 'false'
    return result

def successor_roots():
    """Existing generation roots in order; a gap is invalid, not skipped."""
    roots = []
    missing = False
    for name in SUCCESSOR_ROOT_NAMES:
        path = OWNER / name
        present = path.exists() or path.is_symlink()
        if present and missing:
            raise ValueError('Successor generations must be contiguous')
        if present:
            roots.append(path)
        else:
            missing = True
    return roots


def successor_config_paths(*, immutable_only=False):
    """Only finite, private successor evidence; never scan arbitrary backups."""
    paths = []
    for root in successor_roots():
        paths += successor_tree_paths(root, immutable_only=immutable_only)
    return sorted(paths + successor_archived_paths())


def successor_tree_paths(root, *, immutable_only=False):
    if not root.exists() and not root.is_symlink():
        return []
    private_archive_directory(root)
    result = []
    for path in root.iterdir():
        if path.name in {'previous', 'target', 'recovery'}:
            private_archive_directory(path)
            for child in path.iterdir():
                if child.name not in RUNTIME_NAMES:
                    raise ValueError('Unknown successor runtime evidence')
                regular(child)
                result.append(child)
        else:
            if path.name not in SUCCESSOR_NAMES:
                raise ValueError('Unknown successor evidence')
            if path.name in {'registry-evidence.json', 'registry-intent.json'}:
                selection = json.loads(regular(root / 'selection.json'))
                if (selection.get('purpose') != SUCCESSOR_REGISTRY_PURPOSE
                        and not (path.name == 'registry-evidence.json' and selection.get('purpose') == SUCCESSOR_REGISTRY_BILLING_PURPOSE)):
                    raise ValueError('Registry evidence requires its explicit successor purpose')
            regular(path)
            if not immutable_only or path.name in SUCCESSOR_IMMUTABLE_NAMES:
                result.append(path)
    return sorted(result)


def successor_funded_parent():
    """The completed ORIGINAL funded upgrade: the parent of the first generation."""
    original = OWNER / 'funded-runtime-upgrade'
    prepared = json.loads(regular(original / 'prepared.json'))
    journal = json.loads(regular(original / 'journal.json'))
    terminal = journal['states'][-1]['state']
    if terminal not in {'applied', 'recovered'}:
        raise ValueError('Completed original funded parent required')
    return prepared, 'recovery' if terminal == 'recovered' else 'target'


def successor_context(generation, parent_dir, files, terms, access, purposes=()):
    """What a generation is chained to: parent evidence, active files, terms, readers
    and the purposes of every earlier generation (a tester window may open only once)."""
    return {'generation': generation, 'parent_dir': parent_dir, 'files': files,
            'terms': terms, 'access': access, 'purposes': tuple(purposes)}


def successor_funded_context(parent, parent_role):
    return successor_context(
        0, OWNER / 'funded-runtime-upgrade', parent['files'][parent_role],
        json.loads(regular(OWNER / 'personal-beta' / 'terms.json')),
        json.loads(regular(OWNER / 'personal-beta-readers' / 'access.json')))


def successor_authority_paths(generation):
    """Immutable-by-construction authority a generation is prepared against.

    Every earlier generation is fully exposed before the next may be prepared, so
    its whole tree is part of the baseline, exactly like the original funded tree.
    """
    original = OWNER / 'funded-runtime-upgrade'
    paths = reader_config_paths() + personal_config_paths() + funded_tree_paths(original) + funded_archived_paths()
    for name in SUCCESSOR_ROOT_NAMES[:generation - 1]:
        paths += successor_tree_paths(OWNER / name)
    return paths


def successor_normalized_terms(raw):
    return {**raw, **{k: dt.datetime.fromisoformat(raw[k].replace('Z', '+00:00'))
                      .isoformat(timespec='milliseconds').replace('+00:00', 'Z')
                      for k in ('startsAt', 'endsAt')}}


def successor_canonical_hash(value):
    return digest(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode())


def successor_candidate(parent, parent_role, *, root=None, check_oneoffs=True, context=None):
    """Validate one generation's immutable authority, including its parent.

    This consumes root evidence, it does not create accounts or activate users.
    The original reader/personal/funded files remain byte-bound and untouched; a
    later generation additionally binds every earlier generation's evidence.
    """
    root = OWNER / 'beta-successor' if root is None else root
    if not root.exists() and not root.is_symlink():
        return None
    context = successor_funded_context(parent, parent_role) if context is None else context
    generation = context['generation'] + 1
    successor_tree_paths(root)
    if check_oneoffs:
        for observe in (funded_probe_state, funded_capability_state):
            pending = observe(root)
            if pending is not None and pending['state'] != 'cleaned':
                raise ValueError('Pending successor one-off cannot issue active authority')
    value = json.loads(regular(root / 'prepared.json'))
    keys = {'version', 'sourceCommit', 'bundleSha256', 'preparedAt', 'expiresAt',
            'baseline', 'release', 'files', 'database', 'operation',
            'parentPreparedSha256', 'parentJournalSha256', 'parentReadbackSha256',
            'termsSha256', 'selectionSha256'}
    if set(value) != keys or value['version'] != SUCCESSOR_VERSION:
        raise ValueError('Exact successor preparation required')
    if (not isinstance(value['sourceCommit'], str) or not re.fullmatch(r'[a-f0-9]{40}', value['sourceCommit'])
            or not isinstance(value['bundleSha256'], str) or not re.fullmatch(r'[a-f0-9]{64}', value['bundleSha256'])):
        raise ValueError('Committed successor source required')
    parent_dir = context['parent_dir']
    for name, key in [('prepared.json', 'parentPreparedSha256'), ('journal.json', 'parentJournalSha256'),
                      ('readback.json', 'parentReadbackSha256')]:
        if digest(regular(parent_dir / name)) != value[key]:
            raise ValueError('Original funded parent evidence changed')
    if value['baseline']['authority'] != {str(p): digest(regular(p)) for p in successor_authority_paths(generation)}:
        raise ValueError('Successor original authority changed')
    if (set(value['files']) != {'previous', 'target', 'recovery'}
            or value['files']['previous'] != context['files']
            or value['baseline']['files'] != value['files']['previous']):
        raise ValueError('Successor does not retain original active runtime')
    for role in ('previous', 'target', 'recovery'):
        if set(value['files'][role]) != RUNTIME_NAMES:
            raise ValueError('Four exact successor runtime files required')
        if {n: digest(regular(root / role / n)) for n in RUNTIME_NAMES} != value['files'][role]:
            raise ValueError('Successor runtime candidate changed')
    for name, key in [('terms.json', 'termsSha256'), ('selection.json', 'selectionSha256')]:
        if digest(regular(root / name)) != value[key]:
            raise ValueError('Successor terms or selection changed')
    terms = json.loads(regular(root / 'terms.json'))
    selection = json.loads(regular(root / 'selection.json'))
    plan = value['operation']['plan']
    prior = context['terms']
    access = context['access']
    purpose = selection.get('purpose') if isinstance(selection, dict) else None
    allowed = ({'owner-e2e'} if generation == 1
               else {SUCCESSOR_READER_PURPOSE, 'tester-beta', SUCCESSOR_SCHEMA_PURPOSE,
                     SUCCESSOR_BILLING_PURPOSE, SUCCESSOR_REGISTRY_PURPOSE, SUCCESSOR_REGISTRY_BILLING_PURPOSE})
    if purpose not in allowed or plan.get('purpose') != purpose:
        raise ValueError('Approved successor purpose for this generation required')
    has_registry = SUCCESSOR_REGISTRY_PURPOSE in context.get('purposes', ())
    if has_registry != (purpose == SUCCESSOR_REGISTRY_BILLING_PURPOSE):
        raise ValueError('Only the explicit040 billing continuation may follow the registry upgrade')
    if purpose == 'tester-beta' and 'tester-beta' in context.get('purposes', ()):
        raise ValueError('The tester window may be opened at most once')
    if purpose == SUCCESSOR_SCHEMA_PURPOSE and SUCCESSOR_SCHEMA_PURPOSE in context.get('purposes', ()):
        raise ValueError('The schema upgrade may be applied at most once')
    if purpose == SUCCESSOR_REGISTRY_PURPOSE and SUCCESSOR_REGISTRY_PURPOSE in context.get('purposes', ()):
        raise ValueError('The registry upgrade may be applied at most once')
    if purpose in {SUCCESSOR_BILLING_PURPOSE, SUCCESSOR_REGISTRY_BILLING_PURPOSE}:
        stage = successor_billing_selection(selection)['stage']
        done = context.get('purposes', ())
        prefix = SUCCESSOR_BILLING_PURPOSE + ':'
        # Ordered and once-only: sandbox, live, enforce; enforcement needs the live stage before it.
        if (prefix + stage in done
                or (stage == 'sandbox' and prefix + 'live' in done)
                or (stage == 'live' and prefix + 'enforce' in done)
                or (stage == 'enforce' and prefix + 'live' not in done)):
            raise ValueError('The billing stage order and once-only rule are required')
    prepared_at, expires = [dt.datetime.fromisoformat(value[k].replace('Z', '+00:00'))
                            for k in ('preparedAt', 'expiresAt')]
    prior_start, prior_end = [dt.datetime.fromisoformat(prior[k].replace('Z', '+00:00')) for k in ('startsAt', 'endsAt')]
    receipt = root / 'access.json'
    has_receipt = receipt.exists() or receipt.is_symlink()
    readers = access['allowedEmails']
    if purpose == SUCCESSOR_READER_PURPOSE:
        # Reader admission changes ONLY who may reach the closed site. The window,
        # participants, budget, cohort and every account stay byte-identical.
        emails = selection.get('readers', {}).get('allowedEmails') if isinstance(selection.get('readers'), dict) else None
        if (set(selection) != {'purpose', 'previousTermsSha256', 'readers'} or set(selection['readers']) != {'allowedEmails'}
                or not isinstance(emails, list) or emails != sorted(set(emails)) or len(emails) > 10
                or any(not isinstance(e, str) or not SUCCESSOR_EMAIL.fullmatch(e) for e in emails)
                or not set(readers) < set(emails)
                or terms != prior
                or set(plan) != {'version', 'purpose', 'observedAt', 'expiresAt', 'previousTermsSha256', 'selectionSha256'}
                or plan['version'] != SUCCESSOR_PLAN_VERSION
                or selection['previousTermsSha256'] != successor_canonical_hash(prior)
                or plan['previousTermsSha256'] != successor_canonical_hash(prior)
                or plan['selectionSha256'] != successor_canonical_hash(selection)
                or not has_receipt
                or regular(receipt) != successor_json({'allowedEmails': emails, 'audience': access['audience'],
                                                       'teamDomain': access['teamDomain']})):
            raise ValueError('Only the exact approved reader-admission selection is supported')
        readers = emails
        if (any(t.utcoffset() != dt.timedelta(0) for t in (prepared_at, expires))
                or not prior_start <= prepared_at < prior_end or (expires - prepared_at).total_seconds() != 900
                or plan['observedAt'] != prepared_at.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
                or plan['expiresAt'] != expires.isoformat(timespec='milliseconds').replace('+00:00', 'Z')):
            raise ValueError('Bounded reader-admission preparation within the active window required')
    elif purpose == SUCCESSOR_SCHEMA_PURPOSE:
        # The schema upgrade changes the database and the image, never the funded
        # window, participants, budget, cohort, readers or any account: terms, readers
        # and the allowance environment stay byte-identical to the effective parent.
        if (set(selection) != {'purpose', 'previousTermsSha256', 'fromSchema', 'toSchema'}
                or type(selection['fromSchema']) is not int or type(selection['toSchema']) is not int
                or (selection['fromSchema'], selection['toSchema']) != SUCCESSOR_SCHEMA_STEP
                or terms != prior
                or set(plan) != {'version', 'purpose', 'observedAt', 'expiresAt', 'previousTermsSha256',
                                 'selectionSha256', 'fromSchema', 'toSchema', 'allowedChanges'}
                or plan['version'] != SUCCESSOR_PLAN_VERSION
                or (plan['fromSchema'], plan['toSchema']) != SUCCESSOR_SCHEMA_STEP
                # The exact reviewed set of sources that were allowed to differ from the
                # serving image when this preparation passed the engine freeze.
                or plan['allowedChanges'] != list(SUCCESSOR_SCHEMA_ALLOWED_CHANGES)
                or selection['previousTermsSha256'] != successor_canonical_hash(prior)
                or plan['previousTermsSha256'] != successor_canonical_hash(prior)
                or plan['selectionSha256'] != successor_canonical_hash(selection)
                or has_receipt):
            raise ValueError('Only the exact approved schema 038 to 039 selection is supported')
        # Deliberately no window bound at all: the upgrade does not depend on the funded
        # window (it may not have started yet, or may already have ended; either way
        # nothing is changed about it). The preparation itself must still be a fresh,
        # exactly 900 s candidate whose clock equals the recorded plan.
        if (any(t.utcoffset() != dt.timedelta(0) for t in (prepared_at, expires))
                or (expires - prepared_at).total_seconds() != 900
                or plan['observedAt'] != prepared_at.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
                or plan['expiresAt'] != expires.isoformat(timespec='milliseconds').replace('+00:00', 'Z')):
            raise ValueError('Bounded schema-upgrade preparation required')
    elif purpose == SUCCESSOR_REGISTRY_PURPOSE:
        registry_schema_selection(selection, prior)
        expected = registry_schema_plan(selection, prior, prepared_at, REGISTRY_040_CHANGE_HASHES)
        before = parse_registry_runtime(value['database'])
        if (terms != prior or has_receipt or plan != expected or before['schema'] != 39
                or expires != prepared_at + dt.timedelta(seconds=900)):
            raise ValueError('Exact bounded source-bound039 to040 plan required')
    elif purpose in {SUCCESSOR_BILLING_PURPOSE, SUCCESSOR_REGISTRY_BILLING_PURPOSE}:
        # Billing configuration changes only the eleven api/worker values: terms, readers, cohort,
        # allowance and every account stay byte-identical, and the database is untouched.
        successor_billing_selection(selection)
        if purpose == SUCCESSOR_REGISTRY_BILLING_PURPOSE and parse_registry_runtime(value['database'])['schema'] != 40:
            raise ValueError('Native040 billing configuration requires a typed040 baseline')
        if (terms != prior
                or set(plan) != {'version', 'purpose', 'stage', 'observedAt', 'expiresAt',
                                 'previousTermsSha256', 'selectionSha256', 'allowedChanges', 'allowedChangeHashes'}
                or plan['version'] != (SUCCESSOR_REGISTRY_PLAN_VERSION if purpose == SUCCESSOR_REGISTRY_BILLING_PURPOSE else SUCCESSOR_PLAN_VERSION)
                or plan['stage'] != selection['billing']['stage']
                # The exact reviewed list of sources allowed to differ from the serving image, with
                # the hash each had in the prepared bundle.
                or plan['allowedChanges'] != ([] if purpose == SUCCESSOR_REGISTRY_BILLING_PURPOSE else list(SUCCESSOR_BILLING_ALLOWED_CHANGES))
                or not isinstance(plan['allowedChangeHashes'], dict)
                or set(plan['allowedChangeHashes']) != (set() if purpose == SUCCESSOR_REGISTRY_BILLING_PURPOSE else set(SUCCESSOR_BILLING_ALLOWED_CHANGES))
                or any(not isinstance(h, str) or not re.fullmatch(r'[a-f0-9]{64}', h)
                       for h in plan['allowedChangeHashes'].values())
                or selection['previousTermsSha256'] != successor_canonical_hash(prior)
                or plan['previousTermsSha256'] != successor_canonical_hash(prior)
                or plan['selectionSha256'] != successor_canonical_hash(selection)
                or has_receipt):
            raise ValueError('Only the exact approved billing-config selection is supported')
        # Like the schema upgrade, no dependency on the funded window; still a fresh 900 s candidate.
        if (any(t.utcoffset() != dt.timedelta(0) for t in (prepared_at, expires))
                or (expires - prepared_at).total_seconds() != 900
                or plan['observedAt'] != prepared_at.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
                or plan['expiresAt'] != expires.isoformat(timespec='milliseconds').replace('+00:00', 'Z')):
            raise ValueError('Bounded billing-config preparation required')
    else:
        count, project_usd, user_usd = SUCCESSOR_WINDOW_PURPOSES[purpose]
        participants = terms['participants'] if isinstance(terms.get('participants'), list) else []
        if (set(selection) != {'purpose', 'previousTermsSha256', 'closePreviousAt', 'next'}
                or plan['version'] != SUCCESSOR_PLAN_VERSION
                or set(terms) != {'participants', 'projectUsd', 'userUsd', 'startsAt', 'endsAt'}
                or terms != selection['next'] or successor_normalized_terms(terms) != plan['next']
                or successor_normalized_terms(prior) != plan['previous']
                or len(participants) != count
                or len({p.get('userId') for p in participants if isinstance(p, dict)}) != count
                or len({p.get('email') for p in participants if isinstance(p, dict)}) != count
                or any(not isinstance(p, dict) or set(p) != {'email', 'userId'}
                       or not isinstance(p['userId'], str) or not ADMISSION_UUID.fullmatch(p['userId'])
                       or p['email'] not in readers for p in participants)
                or terms['projectUsd'] != project_usd or terms['userUsd'] != user_usd
                or selection['previousTermsSha256'] != successor_canonical_hash(prior)
                or plan['previousTermsSha256'] != successor_canonical_hash(prior)
                or plan['selectionSha256'] != successor_canonical_hash(selection)
                or has_receipt):
            raise ValueError('Only the exact approved already-readable successor selection is supported')
        start, end = [dt.datetime.fromisoformat(terms[k].replace('Z', '+00:00')) for k in ('startsAt', 'endsAt')]
        close = dt.datetime.fromisoformat(selection['closePreviousAt'].replace('Z', '+00:00'))
        if (any(t.utcoffset() != dt.timedelta(0) for t in (start, end, close, prepared_at, expires))
                or (end - start).total_seconds() != 30 * 86400 or not prepared_at <= close < start <= expires
                or not prior_start <= prepared_at <= close < prior_end
                or plan['observedAt'] != prepared_at.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
                or plan['expiresAt'] != expires.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
                or plan['closePreviousAt'] != close.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
                or (expires - prepared_at).total_seconds() != 900):
            raise ValueError('Bounded ordered successor window required')
    ids = ','.join(p['userId'] for p in terms['participants'])
    for role in ('target', 'recovery'):
        manifest = json.loads(regular(root / role / 'manifest.json'))
        build = value['release'][role]
        if (build['commit'] != value['sourceCommit'] or manifest['commit'] != build['commit']
                or manifest['imageId'] != build['imageId']
                or manifest['ownerEnvironmentSha256'] != value['files'][role]['server.env']
                or manifest['effectiveComposeSha256'] != value['files'][role]['effective-compose.json']):
            raise ValueError('Exact successor source/image manifest required')
        config = json.loads(regular(root / role / 'effective-compose.json'))
        for service in ('api', 'worker'):
            env = config['services'][service]['environment']
            if (env['AI_PROJECT_BUDGET_USD'] != terms['projectUsd'] or env['AI_USER_BUDGET_USD'] != terms['userUsd']
                    or env['CLOSED_BETA_USER_IDS'] != ids
                    or env.get('CLAUDE_PRODUCTION_BUDGET_USD', '0') != '0'
                    or env['NARRATIVE_PIPELINE_MODE'] != 'narrative-fiction-v2'
                    or env['NARRATIVE_FICTION_GENERATION'] != 'v9'
                    or env['NARRATIVE_COHORT_USER_IDS'] != ids):
                raise ValueError('Successor runtime policy differs')
        if purpose == SUCCESSOR_SCHEMA_PURPOSE:
            for service in ('api', 'worker'):
                if any(config['services'][service]['environment'].get(k) != v
                       for k, v in SUCCESSOR_BILLING_DEFAULTS.items()):
                    raise ValueError('Schema upgrade must keep billing at its default-off configuration')
            if any(k in config['services']['web']['environment'] for k in SUCCESSOR_BILLING_DEFAULTS):
                raise ValueError('Billing configuration must not reach the web service')
        if purpose == SUCCESSOR_REGISTRY_PURPOSE:
            registry_profile_default(config)  # only an absent/false service flag is allowed
            previous_config = json.loads(regular(root / 'previous' / 'effective-compose.json'))
            for service in ('api', 'worker'):
                before_env = previous_config['services'][service]['environment']
                wanted = {k: before_env.get(k, v) for k, v in SUCCESSOR_BILLING_DEFAULTS.items()}
                if any(config['services'][service]['environment'].get(k) != v for k, v in wanted.items()):
                    raise ValueError('Registry upgrade must preserve billing configuration')
            if any(k in config['services']['web']['environment'] for k in SUCCESSOR_BILLING_DEFAULTS):
                raise ValueError('Billing configuration must not reach web')
        if purpose in {SUCCESSOR_BILLING_PURPOSE, SUCCESSOR_REGISTRY_BILLING_PURPOSE}:
            billing = selection['billing']
            wanted = successor_billing_environment(billing)
            for service in ('api', 'worker'):
                env = config['services'][service]['environment']
                key, webhook = env.get('STRIPE_SECRET_KEY', ''), env.get('STRIPE_WEBHOOK_SECRET', '')
                if (any(env.get(k) != v for k, v in wanted.items())
                        or not SUCCESSOR_BILLING_SECRET_KEY.fullmatch(key)
                        or SUCCESSOR_BILLING_SECRET_KEY.fullmatch(key)[1] != billing['mode']
                        or digest(key.encode()) != billing['secretKeySha256']
                        or not SUCCESSOR_BILLING_WEBHOOK.fullmatch(webhook)
                        or digest(webhook.encode()) != billing['webhookSecretSha256']):
                    raise ValueError('Billing runtime differs from the selection')
            if any(k in config['services']['web']['environment'] for k in SUCCESSOR_BILLING_DEFAULTS):
                raise ValueError('Billing configuration must not reach the web service')
        # The reader boundary belongs to ingress web/API. Compose deliberately
        # omits access settings from the background worker.
        for service in ('web', 'api'):
            allowed_emails = config['services'][service]['environment'].get('CLOSED_SITE_ALLOWED_EMAILS')
            if not isinstance(allowed_emails, str) or sorted(allowed_emails.split(',')) != sorted(readers):
                raise ValueError('Successor reader access differs')
        env = config['services']['worker']['environment']
        if (env['AI_BUDGET_WINDOW_START'] != terms['startsAt'] or env['AI_BUDGET_WINDOW_END'] != terms['endsAt']
                or env['AI_BUDGET_WINDOW_REQUIRED'] != 'true'
                or env['AI_FICTION_TIMEOUT_MS'] != '300000' or env['AI_FICTION_MAX_REQUEST_BYTES'] != '196608'):
            raise ValueError('Successor runtime window differs')
    return value


def successor_unapplied_files(root):
    paths = successor_tree_paths(root)
    names = {p.relative_to(root).as_posix() for p in paths}
    required = {'prepared.json', 'selection.json', 'terms.json'} | {
        r + '/' + n for r in ('previous', 'target', 'recovery') for n in RUNTIME_NAMES}
    # A reader-admission preparation also carries its immutable reader receipt.
    if 'selection.json' in names and json.loads(regular(root / 'selection.json')).get('purpose') == SUCCESSOR_READER_PURPOSE:
        required |= {'access.json'}
    if not required <= names or not names <= required | {'probe-compose.json','probe.json','capability.json','archive.json'}:
        raise ValueError('Only complete never-attempted successor preparation may be archived')
    for observe in (funded_probe_state, funded_capability_state):
        value = observe(root)
        if value is not None and value['state'] != 'cleaned':
            raise ValueError('Pending successor one-off cannot be archived')
    return {p.relative_to(root).as_posix():digest(regular(p)) for p in paths if p.name != 'archive.json'}


class SuccessorNotExposed(ValueError):
    """A generation exists but is not yet (or no longer) the fully exposed parent."""


def successor_chain_contexts():
    """Contexts of every possible parent: the original funded upgrade, then each
    generation that is already fully exposed. Archived (never-applied) preparations
    are validated against the context whose evidence they were prepared from."""
    parent, parent_role = successor_funded_parent()
    context = successor_funded_context(parent, parent_role)
    contexts = [context]
    for number, root in enumerate(successor_roots(), 1):
        value = successor_candidate(parent, parent_role, root=root, context=context)
        try:
            role = successor_effective_role(value, root)
        except SuccessorNotExposed:
            # An in-flight generation is never a parent of anything. Stopping here
            # does not loosen health: successor_active_state still rejects a
            # directory that follows an unfinished one.
            break
        if role == 'previous':
            break
        context = successor_next_context(number, root, value, role, context)
        contexts.append(context)
    return contexts


def successor_next_context(number, root, value, role, context):
    receipt = root / 'access.json'
    access = (json.loads(regular(receipt)) if receipt.exists() or receipt.is_symlink() else context['access'])
    selection = json.loads(regular(root / 'selection.json'))
    purpose = selection.get('purpose')
    if purpose in {SUCCESSOR_BILLING_PURPOSE, SUCCESSOR_REGISTRY_BILLING_PURPOSE}:
        # Each billing stage is remembered separately (ordered, once only).
        purpose = SUCCESSOR_BILLING_PURPOSE + ':' + successor_billing_selection(selection)['stage']
    return successor_context(number, root, value['files'][role],
                             json.loads(regular(root / 'terms.json')), access,
                             context.get('purposes', ()) + (purpose,))


def successor_parent_context(generation):
    """Funded parent and the context a generation is prepared/validated against.

    Every EARLIER generation must be fully exposed; the generation itself (which
    may be mid-transition) is never evaluated here.
    """
    parent, parent_role = successor_funded_parent()
    context = successor_funded_context(parent, parent_role)
    for number, root in enumerate(successor_roots()[:generation - 1], 1):
        value = successor_candidate(parent, parent_role, root=root, context=context)
        role = successor_effective_role(value, root)
        if role == 'previous':
            raise ValueError('Earlier successor generation must be fully exposed')
        context = successor_next_context(number, root, value, role, context)
    return parent, parent_role, context


def validate_successor_archive(root):
    files = successor_unapplied_files(root)
    receipt = json.loads(regular(root / 'archive.json'))
    parent, parent_role = successor_funded_parent()
    expected = digest(regular(root / 'prepared.json'))
    value = json.loads(regular(root / 'prepared.json'))
    for context in successor_chain_contexts():
        if digest(regular(context['parent_dir'] / 'prepared.json')) == value.get('parentPreparedSha256'):
            break
    else:
        raise ValueError('Archived successor parent is not part of the exposed chain')
    candidate = successor_candidate(parent, parent_role, root=root, context=context)
    if (set(receipt) != {'version','preparedSha256','preparedSourceCommit','archiverSourceCommit','archivedAt','files'}
            or receipt['version'] != SUCCESSOR_ARCHIVE_VERSION or receipt['files'] != files
            or receipt['preparedSha256'] != expected
            or receipt['preparedSourceCommit'] != candidate['sourceCommit']
            or not re.fullmatch(r'[a-f0-9]{40}',receipt['archiverSourceCommit'])
            or dt.datetime.fromisoformat(receipt['archivedAt']) < dt.datetime.fromisoformat(candidate['expiresAt'])):
        raise ValueError('Original expired successor archive receipt required')
    return candidate, receipt


def successor_archived_paths():
    root = OWNER / SUCCESSOR_ARCHIVE_NAME
    if not root.exists() and not root.is_symlink():
        return []
    private_archive_directory(root)
    entries = sorted(root.iterdir())
    if len(entries) > 8:
        raise ValueError('Successor archive limit reached')
    result = []
    for entry in entries:
        if not re.fullmatch(r'[a-f0-9]{64}',entry.name):
            raise ValueError('Unknown successor archive entry')
        validate_successor_archive(entry)
        if digest(regular(entry / 'prepared.json')) != entry.name:
            raise ValueError('Successor archive identity changed')
        result += successor_tree_paths(entry)
    return result


def successor_effective_role(value, root=None):
    root = OWNER / 'beta-successor' if root is None else root
    journal = root / 'journal.json'
    if not journal.exists() and not journal.is_symlink():
        if utcnow() >= dt.datetime.fromisoformat(value['expiresAt']):
            raise ValueError('Expired successor preparation')
        return 'previous'
    intent = json.loads(regular(journal))
    if (set(intent) != {'version', 'preparedSha256', 'states'} or intent['version'] != SUCCESSOR_VERSION
            or intent['preparedSha256'] != digest(regular(root / 'prepared.json'))
            or not isinstance(intent['states'], list) or not 1 <= len(intent['states']) <= 32):
        raise ValueError('Bounded original successor journal required')
    purpose = json.loads(regular(root / 'selection.json')).get('purpose')
    registry = (purpose == SUCCESSOR_REGISTRY_PURPOSE and
                value['operation']['plan'].get('version') == SUCCESSOR_REGISTRY_PLAN_VERSION)
    registry_config = purpose == SUCCESSOR_REGISTRY_BILLING_PURPOSE
    previous = None
    known = {'apply-intent', 'recovery-intent', 'held', 'database-intent', 'accounts-committed',
             'authority-staged', 'exposure-intent', 'applied', 'recovered', 'held-after-failure',
             'stop-unverified', 'watchdog-stop-intent', 'closed'}
    last_time = None
    last_state = None
    attempt = None
    successors = {
        None: {'apply-intent'},
        'apply-intent': {'held'}, 'recovery-intent': {'held'},
        'held': {'database-intent', 'accounts-committed'},
        'database-intent': {'accounts-committed'},
        'accounts-committed': {'authority-staged'},
        'authority-staged': {'exposure-intent'},
        'exposure-intent': {'applied', 'recovered'},
    }
    failures = {'held-after-failure', 'stop-unverified', 'watchdog-stop-intent', 'closed'}
    for row in intent['states']:
        registry_journal_fields(row, registry=registry,registry_config=registry_config)
        if row['previousSha256'] != previous:
            raise ValueError('Successor journal chain changed')
        data = (json.dumps({k:v for k,v in row.items() if k != 'sha256'},sort_keys=True,separators=(',', ':'))+'\n').encode()
        if row['sha256'] != digest(data):
            raise ValueError('Successor journal digest changed')
        changed = dt.datetime.fromisoformat(row['changedAt'].replace('Z', '+00:00'))
        state = row['state']
        if (row['state'] not in known or changed.utcoffset() != dt.timedelta(0)
                or changed < dt.datetime.fromisoformat(value['preparedAt'])
                or changed > utcnow() + dt.timedelta(seconds=300)
                or (last_time is not None and changed < last_time)):
            raise ValueError('Known ordered UTC successor journal required')
        if state == 'recovery-intent':
            valid = last_state is not None and last_state not in {'applied', 'recovered'}
        elif state in failures:
            valid = last_state is not None
        else:
            valid = state in successors.get(last_state, set())
        # Accounting SQL is never repeated by recovery. The schema migration is the
        # one idempotent database step: a recovery may finish it, but only if the
        # database still has to be migrated (the adapter observes this first).
        if (not valid or (state == 'database-intent' and attempt != 'apply-intent'
                          and not (purpose in {SUCCESSOR_SCHEMA_PURPOSE,SUCCESSOR_REGISTRY_PURPOSE} and attempt == 'recovery-intent'))
                or (last_state == 'held' and state == 'accounts-committed' and attempt != 'recovery-intent')
                or (state == 'applied' and attempt != 'apply-intent')
                or (state == 'recovered' and attempt != 'recovery-intent')):
            raise ValueError('Ordered successor transition without SQL replay required')
        if state in {'apply-intent', 'recovery-intent'}:
            attempt = state
        last_state = state
        last_time = changed
        previous = row['sha256']
    if registry and any(row['state'] == 'database-intent' for row in intent['states']):
        registry_bound_intent(root, value, intent['states'])
    if registry_config and any(row['state'] == 'database-intent' for row in intent['states']):
        registry_bound_config_evidence(root,value,intent['states'])
    state = intent['states'][-1]['state']
    if state not in {'applied', 'recovered'}:
        raise SuccessorNotExposed('Successor not fully exposed; keep held')
    role = 'recovery' if state == 'recovered' else 'target'
    proof = json.loads(regular(root / 'readback.json'))
    schema_step = purpose == SUCCESSOR_SCHEMA_PURPOSE
    # The schema upgrade must read back schema 039 reached FROM 038; every other
    # generation keeps the recorded 038/039 acceptance and carries no such field.
    schema_ok = ((proof.get('schema') == 40 and 'fromSchema' not in proof) if purpose == SUCCESSOR_REGISTRY_BILLING_PURPOSE else
                 (proof.get('schema') == 40 and proof.get('fromSchema') == 39) if registry else
                 (proof.get('schema') == SUCCESSOR_SCHEMA_STEP[1] and proof.get('fromSchema') == SUCCESSOR_SCHEMA_STEP[0])
                 if schema_step else
                 (proof.get('schema') == 39 and 'fromSchema' not in proof) if purpose == SUCCESSOR_BILLING_PURPOSE
                 else (proof.get('schema') in (38, 39) and 'fromSchema' not in proof))
    if (proof.get('version') != SUCCESSOR_VERSION or proof.get('preparedSha256') != intent['preparedSha256']
            or proof.get('sourceCommit') != value['sourceCommit']
            or proof.get('imageId') != value['release'][role]['imageId']
            or not schema_ok
            or proof.get('protectedDataUnchanged') is not True or proof.get('previousSpendPreserved') is not True
            or proof.get('previousAllowanceClosed') is not (
                purpose not in {SUCCESSOR_READER_PURPOSE, SUCCESSOR_SCHEMA_PURPOSE, SUCCESSOR_BILLING_PURPOSE, SUCCESSOR_REGISTRY_PURPOSE, SUCCESSOR_REGISTRY_BILLING_PURPOSE})
            or proof.get('browserJourneyPassed') is not False
            or proof.get('operationSha256') != digest(json.dumps(value['operation'],sort_keys=True,separators=(',', ':')).encode())
            or proof.get('operationPaidAiCalls') != 0 or proof.get('paidAiCalls') != 0
            or proof.get('databaseRestored') is not False):
        raise ValueError('Original successor commit/readback proof required')
    if registry:
        bound = registry_bound_intent(root, value, intent['states'])
        after = parse_registry_runtime(json.loads(regular(root / 'database-after.json')))
        same_registry_runtime(value['database'], after, migration=True)
        if (proof.get('runtimeProfile') != 'service-registry-040'
                or proof.get('registryIntentSha256') != successor_canonical_hash(bound)
                or proof.get('fundedStateSha256') != digest(regular(root / 'database-after.json'))):
            raise ValueError('Exact registry040 result and journal readback required')
    if purpose == SUCCESSOR_REGISTRY_BILLING_PURPOSE:
        after = parse_registry_runtime(json.loads(regular(root / 'database-after.json')))
        same_registry_runtime(value['database'], after)
        if (proof.get('runtimeProfile') != 'service-registry-040'
                or 'registryIntentSha256' in proof
                or proof.get('fundedStateSha256') != digest(regular(root / 'database-after.json'))):
            raise ValueError('Unchanged native040 configuration result required')
    return role


def successor_active_state():
    """The authority every consumer must treat as active: the last FULLY exposed
    generation (or the original funded upgrade), plus an unfinished last generation.

    Returns {'directory','generation','files','terms','access','pending'}; `pending` is
    the root of a prepared-but-not-exposed last generation, never active authority.
    """
    parent, parent_role = successor_funded_parent()
    context = successor_funded_context(parent, parent_role)
    directory = OWNER / 'funded-runtime-upgrade'
    pending = None
    roots = successor_roots()
    for number, root in enumerate(roots, 1):
        value = successor_candidate(parent, parent_role, root=root, context=context)
        role = successor_effective_role(value, root)
        if role == 'previous':
            if number != len(roots):
                raise ValueError('Only the last successor generation may be unfinished')
            pending = root
            break
        context = successor_next_context(number, root, value, role, context)
        directory = root
    return {'directory': directory, 'generation': context['generation'], 'files': context['files'],
            'terms': context['terms'], 'access': context['access'], 'pending': pending}


def active_funded_directory():
    """Choose new authority only when its own terminal proof has passed.

    Called after funded_upgrade_healthy; a prepared-only successor cannot make
    an old proof look like an activation of the new window.
    """
    if not successor_roots():
        return OWNER / 'funded-runtime-upgrade'
    return successor_active_state()['directory']


def funded_upgrade_healthy(mode):
    root = OWNER / 'funded-runtime-upgrade'
    if not root.exists() and not root.is_symlink():
        try:
            funded_archived_paths()
            if successor_roots():
                return False
            return True
        except (OSError, ValueError, KeyError, TypeError):
            return False
    try:
        funded_upgrade_config_paths()
        capability = funded_capability_state(root)
        if capability is not None and capability['state'] != 'cleaned':
            return False
        probe = funded_probe_state(root)
        if probe is not None and probe['state'] != 'cleaned':
            return False
        if (root / 'archive.json').exists() or (root / 'archive.json').is_symlink():
            return False
        prepared = json.loads(regular(root / 'prepared.json'))
        if prepared.get('version') != 'alterward-funded-upgrade-1':
            return False
        journal = root / 'journal.json'
        if not journal.exists():
            return (not successor_roots() and mode == 'personal-beta'
                    and utcnow() < dt.datetime.fromisoformat(prepared['expiresAt']))
        intent = json.loads(regular(journal))
        if set(intent)!={'version','preparedSha256','states'} or intent['version']!='alterward-funded-upgrade-1' or not 1<=len(intent['states'])<=32:
            return False
        previous=None
        for row in intent['states']:
            if set(row)!={'state','changedAt','previousSha256','sha256'} or row['previousSha256']!=previous:
                return False
            data=(json.dumps({k:v for k,v in row.items() if k!='sha256'},sort_keys=True,separators=(',',':'))+'\n').encode()
            if digest(data)!=row['sha256']:
                return False
            previous=row['sha256']
        state=intent['states'][-1]['state']
        if mode != 'personal-beta' or state not in {'applied', 'recovered'}:
            return False
        proof = json.loads(regular(root / 'readback.json'))
        expected = digest(regular(root / 'prepared.json'))
        role = 'recovery' if state == 'recovered' else 'target'
        parent_valid = (intent.get('preparedSha256') == expected == proof.get('preparedSha256') and
                proof.get('schema') in (38, 39) and proof.get('protectedDataUnchanged') is True and
                proof.get('imageId') == prepared['release'][role]['imageId'])
        if not parent_valid:
            return False
        expected_files = successor_active_state()['files'] if successor_roots() else prepared['files'][role]
        return {name: digest(regular(OWNER / name)) for name in expected_files} == expected_files
    except (OSError, ValueError, KeyError, TypeError):
        return False


def reader_config_paths():
    """Active reader preparation plus every archived (expired, never applied) one."""
    return sorted(active_reader_config_paths() + reader_archive_config_paths())


def private_archive_directory(path):
    info = path.lstat()
    if (path.is_symlink() or path.resolve() != path.absolute() or not stat.S_ISDIR(info.st_mode) or
            info.st_uid != UID or stat.S_IMODE(info.st_mode) != 0o700):
        raise ValueError('Original private reader archive directory required')


def reader_archive_config_paths():
    """Exact files of the expired-preparation archives, including interrupted ones.

    Layout per archive id: intent.json, complete.json and the moved, byte-identical
    preparation under state/ (+ state/original/). Nothing else is ever accepted, so
    an unknown name, alias, hardlink or public mode fails the whole capture closed.
    """
    root = OWNER / READER_ARCHIVE_ROOT_NAME
    if not root.exists() and not root.is_symlink():
        return []
    private_archive_directory(root)
    entries = sorted(root.iterdir())
    if len(entries) > READER_ARCHIVE_LIMIT:
        raise ValueError('Too many reader preparation archives')
    files = []
    for entry in entries:
        if not READER_ARCHIVE_ID.fullmatch(entry.name):
            raise ValueError('Unexpected reader archive artifact')
        private_archive_directory(entry)
        for item in entry.iterdir():
            if item.name in ('intent.json', 'complete.json'):
                regular(item)
                files.append(item)
            elif item.name == 'state':
                private_archive_directory(item)
                for child in item.iterdir():
                    if child.name in READER_ARCHIVED_STATE_NAMES:
                        regular(child)
                        files.append(child)
                    elif child.name == 'original':
                        private_archive_directory(child)
                        for leaf in child.iterdir():
                            if leaf.name not in READER_ARCHIVED_ORIGINAL_NAMES:
                                raise ValueError('Unexpected reader archive artifact')
                            regular(leaf)
                            files.append(leaf)
                    else:
                        raise ValueError('Unexpected reader archive artifact')
            else:
                raise ValueError('Unexpected reader archive artifact')
    return sorted(files)


def active_reader_config_paths():
    """Capture durable reader preparation/rollback files, including partial work.

    No generic recursive tree or arbitrary file is added to an encrypted backup.
    Existing locks serialize this capture with reader prepare/apply/disable.
    """
    path = OWNER / 'personal-beta-readers'
    if not path.exists() and not path.is_symlink():
        return []
    original = path / 'original'
    groups = [(path, {'server.env', 'pinned-image.json', 'effective-compose.json',
                      'manifest.json', 'readers.json', 'access.json', 'prepared.json', 'journal.json'}, {'original'}),
              (original, {'server.env', 'pinned-image.json', 'effective-compose.json',
                          'manifest.json', 'stage.json', 'access.json'}, set())]
    files = []
    for directory, names, children in groups:
        if not directory.exists() and not directory.is_symlink():
            continue
        info = directory.lstat()
        if (directory.resolve() != directory.absolute() or not stat.S_ISDIR(info.st_mode) or
                info.st_uid != UID or stat.S_IMODE(info.st_mode) != 0o700):
            raise ValueError('Original private reader configuration directory required')
        for item in directory.iterdir():
            if item.name in names:
                regular(item)
                files.append(item)
            elif directory == path and re.fullmatch(r'\.upgrade-[a-z0-9_]{8}', item.name):
                # SIGKILL can leave a replacement journal's private temp file.
                # Preserve bounded original bytes as evidence, never as authority.
                regular(item)
                if sum(value.name.startswith('.upgrade-') for value in files) >= 8:
                    raise ValueError('Too many interrupted reader journal artifacts')
                files.append(item)
            elif item.name not in children or not item.is_dir() or item.is_symlink():
                raise ValueError('Unexpected reader preparation artifact')
    return sorted(files)


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


def registry_restore_healthy(value, *, latest=False):
    """Native040 restore evidence is separate from the generic binary restore.

    Legacy serving authority retains its original checks. A native proof must
    match the actual completed root/image and a still-retained archive. Timer
    activation additionally requires today's latest capture and a fresh proof.
    """
    try:
        state = successor_active_state() if successor_roots() else None
        if state is None:
            return True
        candidate = json.loads(regular(state['directory']/'prepared.json'))
        if candidate['operation']['plan']['purpose'] not in {SUCCESSOR_REGISTRY_PURPOSE, SUCCESSOR_REGISTRY_BILLING_PURPOSE}:
            return True
        proof = json.loads(regular(ROOT/'status'/'registry-restore.json'))
        active = proof.get('fundedRuntime', {})
        records = completed_archives(ROOT/'backups')
        record = next((r for r in records if r['manifest']['runId'] == proof.get('backupRunId')), None)
        if (record is None or state['pending'] is not None or proof.get('sourceCommit') != value['sourceCommit']
                or active.get('version') != 'alterward-funded-replay-2' or active.get('schema') != 40
                or active.get('recoveryProfile') != 'registry040'
                or active.get('preparedSha256') != digest(regular(state['directory']/'prepared.json'))
                or active.get('ownerManifestDigest') != digest(regular(OWNER/'manifest.json'))
                or active.get('sourceCommit') != record['manifest'].get('ownerCommit')
                or active.get('imageId') != record['manifest'].get('ownerImage')
                or proof.get('backupManifestSha256') != record['files']['manifest.json']['sha256']
                or proof.get('backupManifestCanonicalSha256') != successor_canonical_hash(record['manifest'])
                or proof.get('tablesMatchedBeforeReplay') != 103 or proof.get('reviewedTables') != 102
                or proof.get('reviewedForeignKeys') != 226 or proof.get('paidAiCalls') != 0
                or any(proof.get(k) is not True for k in ('independentReadOnlyPostReplayVerified',
                    'reviewedSecurityCatalog','dataOnlyOriginalBackupLoaded','temporaryContainersAndPlaintextRemoved',
                    'freshStateEqualBeforeAndAfterReplay','originalIdsImagesPreserved','foreignContainersUnchanged'))
                or any(proof.get(k) is not False for k in ('writerFenceStillHeld','serviceActivationAllowed',
                    'liveDatabaseWrites','authProviderWrites','externalMessagesSent'))):
            return False
        if latest:
            age = (utcnow()-dt.datetime.fromisoformat(proof['capturedAt'].replace('Z','+00:00'))).total_seconds()
            return (0 <= age <= 6*3600 and records
                    and max(records,key=lambda r:r['created'])['manifest']['runId'] == proof['backupRunId'])
        return True
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return False


def alerts_for(health, now):
    alerts = []
    if not health['ownerHealthy']:
        alerts.append('owner_runtime')
    if not health['databaseTlsVerified']:
        alerts.append('database_tls')
    if health.get('queueHealthy', health['pendingJobs'] == 0) is not True:
        alerts.append('personal_queue_unhealthy' if health.get('runtimeMode') == 'personal-beta' else 'unexpected_owner_jobs')
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
    if health.get('registryRestoreHealthy', True) is not True:
        alerts.append('registry_restore_unverified')
    if health.get('personalTransitionHealthy', True) is not True:
        alerts.append('personal_transition_incomplete')
    return alerts


def personal_transition_healthy(mode):
    """Report an incomplete/killed funding transition; never actuate services.

    All values come from root-only files under the same activation lock. No
    provider, participant, preparation bytes or window are emitted in health.
    """
    if not funded_upgrade_healthy(mode):
        return False
    path = OWNER / 'personal-beta'
    try:
        if not path.exists() and not path.is_symlink():
            return mode == 'owner'
        personal_config_paths()  # root-private finite artifact contract
        transition, journal = path / 'transition.json', path / 'journal.json'
        exposed = journal.exists() or journal.is_symlink()
        if not transition.exists() and not transition.is_symlink():
            return mode == 'owner' and not exposed
        record = json.loads(regular(transition))
        state = record.get('state')
        if mode == 'owner':
            return state in {'disabled', 'disabled-after-failure'}
        if mode != 'personal-beta' or state != 'applied' or not exposed:
            return False
        intent = json.loads(regular(journal))
        expected = digest(regular(path / 'prepared.json'))
        return (intent.get('state') == 'exposure-committed' and
                record.get('preparedSha256') == expected == intent.get('preparedSha256'))
    except (OSError, ValueError, KeyError, TypeError):
        return False


def monitor(value):
    baseline = stable_state()
    with exclusive(OWNER / 'activation.lock'):
        clean_work()
        _, services = owner_runtime()
        policy = personal_runtime_policy({service: dict(item.split('=', 1) for item in value['Config']['Env'])
                                          for service, value in services.items()}, utcnow())
        database = json.loads(command(['docker', 'exec', '-i', services['api']['Id'], 'node',
            '--max-old-space-size=128', '--input-type=module', '-e', DATABASE_PROBE, 'monitor'],
            input=json.dumps({'queueAllowed': policy['queueAllowed'], 'userIds': policy['userIds']}).encode()))
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
        health = {'ownerHealthy': True, 'runtimeMode': policy['mode'], **database, **origin,
            'personalTransitionHealthy': personal_transition_healthy(policy['mode']),
            'registryRestoreHealthy': registry_restore_healthy(value),
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
