"""Owner-only writer-fence preflight and fail-closed state machine.

The public CLI intentionally exposes plan only until the capture/held-fence
transport is audited. Plan never stops services or emits a restorable authority.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import types

SERVICES = ('web', 'api', 'worker')
ROOT = Path('/root/alterward-ops')
OWNER = ROOT / 'owner'
DAILY = ROOT / 'daily'


def identity(value):
    return (value['Id'], value['Image'], value['RestartCount'],
            value['HostConfig']['RestartPolicy']['Name'])


def runtime(value):
    # Health-check logs tick without a restart. Preserve service identity and
    # lifecycle, not volatile probe output or credentials from Docker inspect.
    state = value['State']
    return (identity(value), value['Config'].get('Labels'),
            state['Status'], state['Running'], state.get('OOMKilled'),
            state.get('StartedAt'), state.get('FinishedAt'))


def validate_services(services):
    if set(services) != set(SERVICES):
        raise ValueError('Exactly three original owner services required')
    ids = set()
    for name, item in services.items():
        if (not re.fullmatch('[a-f0-9]{64}', item['Id']) or item['Id'] in ids or
                not re.fullmatch('sha256:[a-f0-9]{64}', item['Image']) or
                item['State']['Status'] != 'running' or not item['State']['Running'] or
                item['State'].get('OOMKilled') or item['RestartCount'] != 0 or
                item['HostConfig']['RestartPolicy']['Name'] != 'unless-stopped' or
                item['Config']['Labels'].get('com.docker.compose.project') != 'alterward-owner' or
                item['Config']['Labels'].get('com.docker.compose.service') != name):
            raise ValueError('Original owner identity and non-autostart policy required')
        ids.add(item['Id'])
    return ids


def quiet(proof):
    return (proof.get('databaseTlsVerified') is True and
            all(type(proof.get(key)) is int and proof[key] == 0
                for key in ('pendingJobs', 'liveLeases', 'foreignActiveSessions')))


def run_fence(mode, services, *, inspect, observe, stop, start, capture, verify,
              settle, checkpoint):
    """Callbacks are the root transport boundary, never a web request handler.

    Capture must return an encrypted bundle with a stable state digest. Recovery
    never resumes a writer; drill emits no authority until scoped resume passes.
    A dead operator/SIGKILL has no automatic restart path.
    """
    if mode not in {'drill', 'recovery'}:
        raise ValueError('Explicit drill or recovery mode required')
    original = copy.deepcopy(services)
    own = validate_services(original)
    baseline = inspect()
    if not own.issubset(baseline) or any(runtime(baseline[item['Id']]) != runtime(item)
                                        for item in original.values()):
        raise ValueError('Original fence baseline differs')
    foreign = {key: runtime(value) for key, value in baseline.items() if key not in own}
    if not quiet(observe()):
        raise ValueError('Idle source and no foreign active writer sessions required')
    stopped = []
    result = None

    def record(stage, values):
        # Never persist Docker Env, mounted credentials or foreign configuration.
        checkpoint(stage, {name: {'id': item['Id'], 'image': item['Image'],
                                  'restarts': item['RestartCount'],
                                  'restartPolicy': item['HostConfig']['RestartPolicy']['Name'],
                                  'status': item['State']['Status'],
                                  'finishedAt': item['State'].get('FinishedAt')}
                           for name, item in values.items()})

    def bundle(value):
        cipher = value.get('encryptedAuthority')
        return (set(value) == {'mode', 'stateDigest', 'encryptedAuthority'} and
                re.fullmatch('[a-f0-9]{64}', value.get('stateDigest', '')) and
                value.get('mode') == mode and isinstance(cipher, bytes) and
                cipher.startswith(b'age-encryption.org/v1\n') and
                32 < len(cipher) <= 32*1024**2)

    def own_values(values):
        return {name: values[item['Id']] for name, item in original.items()}

    def unchanged_stopped(allow_unstopped=False):
        current = inspect()
        if {key: runtime(value) for key, value in current.items() if key not in own} != foreign:
            raise ValueError('Foreign runtime changed; refusing automated resume')
        for name in SERVICES:
            previous = original[name]
            value = current.get(previous['Id'])
            if name not in stopped or (allow_unstopped and value and value['State']['Running']):
                if not value or runtime(value) != runtime(previous):
                    raise ValueError('Original running writer changed')
                continue
            if (not value or identity(value) != identity(previous) or value['Config'].get('Labels') != previous['Config'].get('Labels') or
                    value['State']['Status'] != 'exited' or value['State']['Running'] or
                    value['State'].get('OOMKilled') or not value['State'].get('FinishedAt') or
                    value['State'].get('StartedAt') != previous['State'].get('StartedAt')):
                raise ValueError('Stopped original writer changed')
        return current

    try:
        record('stopping', original)
        for name in ('web', 'api'):
            # Register before stop: partial transport failure cannot omit a
            # stopped service from the mandatory scoped resume check.
            stopped.append(name)
            stop(original[name]['Id'])
        for attempt in range(4):
            if quiet(observe()):
                break
            if attempt == 3:
                raise ValueError('Writer drain exceeded its bound')
            settle(2)
        stopped.append('worker')
        stop(original['worker']['Id'])
        unchanged_stopped()
        settle(30)
        unchanged_stopped()
        if not quiet(observe()):
            raise ValueError('Stopped-writer source is not quiet')
        record('held', own_values(unchanged_stopped()))
        first = capture(mode)
        if not bundle(first):
            raise ValueError('Bounded encrypted authority required')
        settle(2)
        unchanged_stopped()
        second = capture(mode)
        if (first['stateDigest'] != second.get('stateDigest') or
                not bundle(second) or
                not quiet(observe())):
            raise ValueError('Independent authority changed under the fence')
        unchanged_stopped()
        result = second
        record('captured-held', own_values(unchanged_stopped()))
    finally:
        if stopped and mode == 'drill':
            held = unchanged_stopped(allow_unstopped=True)
            for name in reversed(stopped):
                if not held[original[name]['Id']]['State']['Running']:
                    start(original[name]['Id'])
            if not verify():
                raise ValueError('Owner resume and origin boundary not verified')
            resumed = inspect()
            if {key: runtime(value) for key, value in resumed.items() if key not in own} != foreign or any(
                    not resumed[item['Id']]['State']['Running'] or identity(resumed[item['Id']]) != identity(item)
                    for item in original.values()):
                raise ValueError('Original resume identities changed')
            record('drill-resumed', own_values(resumed))
        elif stopped and mode == 'recovery':
            # A late queue failure must not leave the worker writing while
            # ingress is held. Do not attempt a restart even on an exception.
            # Drift must invalidate the proof, not prevent stopping a known
            # original writer. Stop attempts are scoped by immutable Id/image/
            # ownership; even a foreign restart cannot leave our worker live.
            current = inspect()
            errors = []
            for name in SERVICES:
                item = current.get(original[name]['Id'])
                if (not item or item['Image'] != original[name]['Image'] or
                        item['Config'].get('Labels') != original[name]['Config'].get('Labels')):
                    errors.append('Original stop ownership changed')
                    continue
                if item['State']['Running']:
                    if name not in stopped:
                        stopped.append(name)
                    try:
                        stop(original[name]['Id'])
                    except Exception:
                        errors.append('Original stop attempt failed')
            if errors:
                raise ValueError('Recovery hold could not be verified')
            record('recovery-held', own_values(unchanged_stopped()))
    if result is None:
        raise ValueError('No verified authority produced')
    return {**result, 'serviceActivationAllowed': False,
            'replayEligibleWhileFenceHeld': mode == 'recovery',
            'drillResumed': mode == 'drill'}


def original(path):
    before = path.lstat()
    if (path.resolve() != path or not stat.S_ISREG(before.st_mode) or before.st_uid != 0 or
            before.st_nlink != 1 or stat.S_IMODE(before.st_mode) != 0o600 or before.st_size > 2*1024**2):
        raise ValueError('Original bounded root file required')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        def stable(value):
            return (value.st_dev,value.st_ino,value.st_uid,value.st_gid,value.st_mode,value.st_nlink,
                    value.st_size,value.st_mtime_ns,value.st_ctime_ns)
        if stable(before) != stable(opened):
            raise ValueError('Original root file replaced')
        data = os.read(fd, 2*1024**2 + 1)
        if stable(os.fstat(fd)) != stable(before) or stable(path.lstat()) != stable(before) or len(data) != before.st_size:
            raise ValueError('Original root file changed')
        return data
    finally:
        os.close(fd)


def installed_daily():
    config = json.loads(original(DAILY / 'config.json'))
    source = original(DAILY / 'scripts/contabo-daily.py')
    if hashlib.sha256(source).hexdigest() != config['scriptHashes']['contabo-daily.py']:
        raise ValueError('Reviewed installed daily source required')
    library = original(DAILY / 'scripts/backup_lib.py')
    if hashlib.sha256(library).hexdigest() != config['scriptHashes']['backup_lib.py']:
        raise ValueError('Reviewed installed backup library required')
    # Execute the installed, hash-verified dependency rather than silently
    # inheriting a different client loader's alterward_backup module.
    backup = types.ModuleType('alterward_backup')
    exec(compile(library, '<installed-fence-backup>', 'exec'), backup.__dict__)
    module = types.ModuleType('alterward_fence_daily')
    previous = sys.modules.get('alterward_backup')
    try:
        sys.modules['alterward_backup'] = backup
        exec(compile(source, '<installed-fence-daily>', 'exec'), module.__dict__)
        module.config()  # Verify all installed source/unit hashes before Docker.
    finally:
        if previous is None:
            del sys.modules['alterward_backup']
        else:
            sys.modules['alterward_backup'] = previous
    return module


PROBE = r"""import{createRequire}from'node:module';import{readFileSync}from'node:fs';import{TLSSocket}from'node:tls';import{X509Certificate}from'node:crypto';
const{Client}=createRequire('/app/packages/database/package.json')('pg');const client=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:readFileSync(process.env.DATABASE_SSL_CA_FILE,'utf8')},connectionTimeoutMillis:10000});
try{await client.connect();const socket=client.connection.stream;if(!(socket instanceof TLSSocket)||!socket.encrypted||socket.authorized!==true||!new X509Certificate(socket.getPeerCertificate().raw).checkHost(new URL(process.env.DATABASE_URL).hostname))throw Error('TLS');await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='10s'");await client.query("SET LOCAL search_path=pg_catalog,public");let pendingJobs=0,liveLeases=0;
for(const table of ['ff_jobs','aw_jobs','aw_shared_jobs','aw_public_review_jobs','aw_public_content_reviews','aw_scenario_reviews']){const{rows}=await client.query(`SELECT count(*) FILTER(WHERE status IN('queued','running','validating'))::int AS pending,count(*) FILTER(WHERE lease_token IS NOT NULL OR lease_until IS NOT NULL)::int AS leases FROM public.${table}`);pendingJobs+=rows[0].pending;liveLeases+=rows[0].leases;}
pendingJobs+=(await client.query("SELECT count(*)::int AS n FROM public.aw_public_draft_reviews WHERE status='running'")).rows[0].n;
pendingJobs+=(await client.query("SELECT count(*)::int AS n FROM public.aw_branches WHERE status='generating'")).rows[0].n;
const foreignActiveSessions=(await client.query("SELECT count(*)::int AS n FROM pg_catalog.pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend' AND state IS DISTINCT FROM 'idle'")).rows[0].n;await client.query('COMMIT');console.log(JSON.stringify({pendingJobs,liveLeases,foreignActiveSessions,databaseTlsVerified:true}));}catch{process.exitCode=1;}finally{await client.end();}"""


def plan(request):
    if (os.geteuid() != 0 or set(request) != {'mode', 'sourceCommit', 'ownerManifestDigest'} or
            request['mode'] != 'plan' or not re.fullmatch('[a-f0-9]{40}', request['sourceCommit']) or
            not re.fullmatch('[a-f0-9]{64}', request['ownerManifestDigest'])):
        raise ValueError('Explicit root writer-fence plan required')
    daily = installed_daily()
    # Acquire existing kernel locks, in the original order, before Docker.
    for path in (DAILY / 'job.lock', OWNER / 'activation.lock'):
        original(path)
    with daily.exclusive(DAILY / 'job.lock'), daily.exclusive(OWNER / 'activation.lock'):
        if hashlib.sha256(original(OWNER / 'manifest.json')).hexdigest() != request['ownerManifestDigest']:
            raise ValueError('Owner manifest changed')
        before = daily.stable_state()
        manifest, services = daily.owner_runtime()
        validate_services(services)
        all_containers = daily.containers()
        if any(re.search('watchtower|autoheal', item['Config'].get('Image', ''), re.I) for item in all_containers):
            raise ValueError('External container restart supervisor not reviewed')
        proof = json.loads(daily.command(['docker', 'exec', services['api']['Id'], 'node',
                                         '--input-type=module', '-e', PROBE]))
        if not quiet(proof) or daily.stable_state() != before:
            raise ValueError('Source is not quiet or preflight changed runtime')
        return {'sourceCommit': request['sourceCommit'], 'ownerApplicationCommit': manifest['commit'],
                'originalServicesVerified': 3, 'nonAutostartRestartPolicyVerified': True,
                **proof, 'servicesStopped': 0, 'existingContainersUnchanged': True,
                'writerFenceEstablished': False, 'authorityCreated': False,
                'serviceActivationAllowed': False, 'paidAiCalls': 0, 'liveDatabaseWrites': False}


if __name__ == '__main__':
    try:
        print(json.dumps({'ok': True, 'result': plan(json.load(sys.stdin))}))
    except Exception:
        print(json.dumps({'ok': False, 'phase': 'writer-fence-plan'}))
        sys.exit(1)
