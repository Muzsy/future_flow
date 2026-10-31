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
                   'access.json'}
SUCCESSOR_IMMUTABLE_NAMES = {'prepared.json', 'selection.json', 'terms.json', 'archive.json', 'access.json'}
SUCCESSOR_ARCHIVE_NAME = 'beta-successor-archive'
SUCCESSOR_ARCHIVE_VERSION = 'alterward-beta-successor-archive-1'
SUCCESSOR_PLAN_VERSION = 'alterward-beta-successor-plan-2'
# One finite directory per separately authorized transition. The first is the
# owner-e2e window; each later one has the previous FULLY exposed generation as
# its parent and may never be prepared while an earlier one is still unfinished.
SUCCESSOR_ROOT_NAMES = ('beta-successor', 'beta-successor-2', 'beta-successor-3', 'beta-successor-4')
# purpose -> (participants, projectUsd, userUsd) for allowance-changing purposes.
SUCCESSOR_WINDOW_PURPOSES = {'owner-e2e': (1, '3', '3'), 'tester-beta': (3, '10', '3.33')}
SUCCESSOR_READER_PURPOSE = 'reader-admission'
SUCCESSOR_EMAIL = re.compile(r'[-a-z0-9._+]+@[-a-z0-9.]+')


def successor_json(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


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
    allowed = {'owner-e2e'} if generation == 1 else {SUCCESSOR_READER_PURPOSE, 'tester-beta'}
    if purpose not in allowed or plan.get('purpose') != purpose:
        raise ValueError('Approved successor purpose for this generation required')
    if purpose == 'tester-beta' and 'tester-beta' in context.get('purposes', ()):
        raise ValueError('The tester window may be opened at most once')
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
    purpose = json.loads(regular(root / 'selection.json')).get('purpose')
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
        if set(row) != {'state', 'changedAt', 'previousSha256', 'sha256'} or row['previousSha256'] != previous:
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
        if (not valid or (state == 'database-intent' and attempt != 'apply-intent')
                or (last_state == 'held' and state == 'accounts-committed' and attempt != 'recovery-intent')
                or (state == 'applied' and attempt != 'apply-intent')
                or (state == 'recovered' and attempt != 'recovery-intent')):
            raise ValueError('Ordered successor transition without SQL replay required')
        if state in {'apply-intent', 'recovery-intent'}:
            attempt = state
        last_state = state
        last_time = changed
        previous = row['sha256']
    state = intent['states'][-1]['state']
    if state not in {'applied', 'recovered'}:
        raise SuccessorNotExposed('Successor not fully exposed; keep held')
    role = 'recovery' if state == 'recovered' else 'target'
    proof = json.loads(regular(root / 'readback.json'))
    if (proof.get('version') != SUCCESSOR_VERSION or proof.get('preparedSha256') != intent['preparedSha256']
            or proof.get('sourceCommit') != value['sourceCommit']
            or proof.get('imageId') != value['release'][role]['imageId'] or proof.get('schema') not in (38, 39)
            or proof.get('protectedDataUnchanged') is not True or proof.get('previousSpendPreserved') is not True
            or proof.get('previousAllowanceClosed') is not (
                json.loads(regular(root / 'selection.json')).get('purpose') != SUCCESSOR_READER_PURPOSE)
            or proof.get('browserJourneyPassed') is not False
            or proof.get('operationSha256') != digest(json.dumps(value['operation'],sort_keys=True,separators=(',', ':')).encode())
            or proof.get('operationPaidAiCalls') != 0 or proof.get('paidAiCalls') != 0
            or proof.get('databaseRestored') is not False):
        raise ValueError('Original successor commit/readback proof required')
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
