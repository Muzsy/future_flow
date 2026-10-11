"""Root-only, scoped writer-fence drill. No production replay or activation."""
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import sys
import tempfile
import time
import types

ROOT = Path('/root/alterward-ops')
STATE = ROOT / 'writer-fence'
LABEL = 'com.alterward.writer-fence'
ENGINE = 'scripts/ops/contabo-writer-fence.py'
EXECUTOR = 'scripts/ops/contabo-fence-drill.py'
NODE_FILES = {
    'scripts/capture-privacy-authority.ts', 'scripts/lib/privacy-fence-envelope.ts',
    'scripts/lib/verified-privacy-authority.ts', 'scripts/lib/privacy-restore.ts',
    'scripts/lib/privacy-recovery-schema.ts', 'scripts/lib/privacy-recovery-coverage.ts',
    'scripts/lib/recovery-auth-inventory.ts',
}
OWNER_COMMIT = '9eb7732b69e84583cf7e63c237763b51b9bb4eab'
OWNER_IMAGE = 'sha256:da00119b4257a0def0fde3bc9fe80fe09697f554fea8286f6bba600be621a4f3'


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def sources(request):
    if set(request['files']) != NODE_FILES | {ENGINE, EXECUTOR}:
        raise ValueError('Exact reviewed capture source set required')
    result = {}
    for name, value in request['files'].items():
        if set(value) != {'data', 'sha256'} or not re.fullmatch('[a-f0-9]{64}', value['sha256']):
            raise ValueError('Source digest required')
        data = base64.b64decode(value['data'], validate=True)
        if not 0 < len(data) <= 256*1024 or hashlib.sha256(data).hexdigest() != value['sha256']:
            raise ValueError('Reviewed source bytes differ')
        result[name] = data
    return result


def main(request):
    os.umask(0o077)
    if (os.geteuid() != 0 or set(request) != {'mode', 'sourceCommit', 'ownerManifestDigest', 'files'} or
            request['mode'] not in {'plan','drill'} or not re.fullmatch('[a-f0-9]{40}', request['sourceCommit']) or
            not re.fullmatch('[a-f0-9]{64}', request['ownerManifestDigest'])):
        raise ValueError('Explicit pinned root drill required')
    files = sources(request)
    if hashlib.sha256(files[EXECUTOR]).hexdigest() != globals().get('__operator_source_sha256__'):
        raise ValueError('Executing transport source differs')
    fence = types.ModuleType('alterward_fence')
    exec(compile(files[ENGINE], '<reviewed-writer-fence>', 'exec'), fence.__dict__)
    daily = fence.installed_daily()
    for path in (fence.DAILY/'job.lock', fence.OWNER/'activation.lock'):
        fence.original(path)
    with daily.exclusive(fence.DAILY/'job.lock'), daily.exclusive(fence.OWNER/'activation.lock'):
        if hashlib.sha256(fence.original(fence.OWNER/'manifest.json')).hexdigest() != request['ownerManifestDigest']:
            raise ValueError('Original owner manifest differs')
        manifest, services = daily.owner_runtime()
        if manifest['commit'] != OWNER_COMMIT or manifest['imageId'] != OWNER_IMAGE:
            raise ValueError('Reviewed owner-only image required')
        fence.validate_services(services)
        baseline = {c['Id']: c for c in daily.containers()}
        if any(re.search('watchtower|autoheal', c['Config'].get('Image', ''), re.I) or
               c['Config'].get('Labels', {}).get(LABEL) is not None for c in baseline.values()):
            raise ValueError('Unreviewed restart supervisor or stale fence helper')
        daily.private_dir(STATE)
        pointer = STATE/'current.json'
        if pointer.exists() or pointer.is_symlink():
            previous = json.loads(fence.original(pointer))
            if not ((previous.get('mode') == 'drill' and previous.get('stage') == 'drill-resumed') or
                    (previous.get('mode') == 'plan' and previous.get('stage') == 'plan-complete' and
                     previous.get('writerFenceEstablished') is False)):
                raise ValueError('Previous fence requires manual investigation')
        if daily.command(['findmnt','-no','FSTYPE','--target','/run']).strip() != b'tmpfs':
            raise ValueError('Memory-backed temporary transport required')
        # Reuse only a network already attached to the original owner worker and
        # verified against its effective compose network key and Docker labels.
        effective = json.loads(fence.original(fence.OWNER/'effective-compose.json'))
        declared = effective['networks']
        candidates = []
        for name in services['worker']['NetworkSettings']['Networks']:
            network = json.loads(daily.command(['docker','network','inspect',name]))[0]
            labels = network.get('Labels') or {}
            key = labels.get('com.docker.compose.network')
            if (not network['Internal'] and labels.get('com.docker.compose.project') == 'alterward-owner' and
                    key in declared and declared[key].get('name') == name):
                candidates.append((name, network['Id']))
        if len(candidates) != 1:
            raise ValueError('One existing owner egress network required')
        network_name, network_id = candidates[0]
        env = {}
        for line in fence.original(fence.OWNER/'server.env').decode().splitlines():
            if not line or line.startswith('#'):
                continue
            matched = re.fullmatch(r"([A-Z][A-Z0-9_]*)='([^'\r\n\\]*)'", line)
            if not matched or matched[1] in env:
                raise ValueError('Original protected environment required')
            env[matched[1]] = matched[2]
        needed = ('DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY')
        if any(not env.get(key) or '\n' in env[key] or '\r' in env[key] for key in needed):
            raise ValueError('Existing server-side capture credentials required')
        from urllib.parse import urlsplit
        project_host = urlsplit(env['SUPABASE_URL']).hostname
        if not project_host or not re.fullmatch(r'[a-z]{20}\.supabase\.co', project_host):
            raise ValueError('Original hosted project required')
        nonce = os.urandom(12).hex()
        started = dt.datetime.now(dt.timezone.utc)
        expires = started+dt.timedelta(minutes=15)
        core = {'schemaVersion':'alterward-root-fence-2','mode':request['mode'],'nonce':nonce,
                'sourceCommit':request['sourceCommit'],
                'sourceFilesDigest':digest({k:hashlib.sha256(v).hexdigest() for k,v in files.items()}),
                'ownerManifestDigest':request['ownerManifestDigest'],
                'projectBinding':digest(project_host),
                'createdAt':started.isoformat().replace('+00:00','Z'),
                'expiresAt':expires.isoformat().replace('+00:00','Z'),
                'originalServices':{name:{'id':c['Id'],'image':c['Image'],
                    'startedAt':c['State']['StartedAt'],'restarts':c['RestartCount'],
                    'restartPolicy':c['HostConfig']['RestartPolicy']['Name']} for name,c in services.items()}}
        record = {**core,'stage':'prepared','writerFenceEstablished':False,'replayAllowed':False,
                  'serviceActivationAllowed':False}
        daily.atomic(pointer,record)
        captures = []
        calls = 0
        held_binding = None
        with tempfile.TemporaryDirectory(prefix='alterward-fence-'+nonce+'-',dir='/run') as tmp:
            scratch = Path(tmp)
            # Source code is public; only the bounded root-owned env file is
            # private. Docker reads it; it is never mounted into the container.
            for name in NODE_FILES:
                destination=scratch/name
                destination.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
                destination.write_bytes(files[name]);destination.chmod(0o644)
            selected = {key:env[key] for key in needed}
            selected.update(DATABASE_SSL='true',DATABASE_SSL_CA_FILE='/run/secrets/supabase-ca.crt',
                            ALTERWARD_FENCE_OPERATOR='true',AI_PROJECT_BUDGET_USD='0',AI_USER_BUDGET_USD='0')
            client_env=scratch/'client.env'
            client_env.write_text(''.join(key+'='+value+'\n' for key,value in selected.items()))
            client_env.chmod(0o600)

            def inspect():
                values = {c['Id']:c for c in daily.containers()}
                if set(values) != set(baseline):
                    raise ValueError('Unrelated container appeared or disappeared')
                return values

            def helper(mode, payload=None):
                nonlocal calls
                calls+=1
                name='alterward-fence-probe-'+nonce+'-'+str(calls)
                record['temporaryHelperName']=name
                daily.atomic(pointer,record)  # Durable identity before Docker.
                current_network=json.loads(daily.command(['docker','network','inspect',network_name]))[0]
                if current_network['Id'] != network_id:
                    raise ValueError('Original egress network replaced')
                args=['docker','run','--name',name,'--network',network_name,'--read-only',
                      '--log-driver','none','--label',LABEL+'='+nonce,'--label','com.alterward.source='+request['sourceCommit'],
                      '--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true',
                      '--memory','384m','--cpus','0.5','--pids-limit','96','--workdir','/app',
                      '--tmpfs','/tmp:rw,noexec,nosuid,size=32m','--env-file',str(client_env),
                      '--mount','type=bind,src=/etc/alterward/supabase-ca.crt,dst=/run/secrets/supabase-ca.crt,readonly']
                if payload is not None:
                    args+=['-i']
                for filename in sorted(NODE_FILES):
                    args+=['--mount','type=bind,src='+str(scratch/filename)+',dst=/app/'+filename+',readonly']
                args += [OWNER_IMAGE,'node','node_modules/tsx/dist/cli.mjs','--tsconfig',
                         'tsconfig.scripts.json','scripts/capture-privacy-authority.ts','--'+mode]
                try:
                    data=daily.command(args,input=json.dumps(payload).encode() if payload is not None else None,timeout=135)
                    if not 0 < len(data) <= 32*1024**2:
                        raise ValueError('Bounded capture response required')
                    return json.loads(data)
                finally:
                    observed = daily.command(['docker','inspect',name],timeout=10) if name in [c['Name'].lstrip('/') for c in daily.containers()] else None
                    if observed:
                        item=json.loads(observed)[0]
                        if (item['Name'] != '/'+name or item['Image'] != OWNER_IMAGE or
                                item['Config'].get('Labels',{}).get(LABEL) != nonce or
                                item['HostConfig'].get('PortBindings') or
                                item['HostConfig']['LogConfig']['Type'] != 'none'):
                            raise ValueError('Helper cleanup identity differs')
                        daily.command(['docker','rm','-f',item['Id']])
                    record.pop('temporaryHelperName',None)
                    daily.atomic(pointer,record)

            def checkpoint(stage, values):
                nonlocal held_binding
                record.update(stage=stage,services=values,checkedAt=dt.datetime.now(dt.timezone.utc).isoformat())
                if stage=='held':
                    held_core={**core,'stoppedServices':values}
                    held_binding={key:core[key] for key in ['mode','nonce','sourceCommit','sourceFilesDigest',
                                  'ownerManifestDigest','projectBinding','expiresAt']}
                    held_binding['writerFenceDigest']=digest(held_core)
                    record.update(writerFenceEstablished=True,heldCore=held_core,writerFenceDigest=held_binding['writerFenceDigest'])
                if stage=='drill-resumed':
                    record['writerFenceEstablished']=False
                daily.atomic(pointer,record)

            def capture(mode):
                if mode != 'drill' or held_binding is None or dt.datetime.now(dt.timezone.utc) >= expires:
                    raise ValueError('Current drill fence required')
                envelope=helper('capture',{'binding':held_binding,'projectBinding':core['projectBinding']})
                if (envelope.get('schemaVersion') != 'privacy-fence-envelope-2' or
                        envelope.get('binding') != held_binding or envelope.get('serviceActivationAllowed') is not False or
                        not re.fullmatch('[a-f0-9]{64}',envelope.get('stateDigest','')) or
                        not re.fullmatch('[a-f0-9]{64}',envelope.get('authStateDigest',''))):
                    raise ValueError('Bound complete observer response required')
                plaintext=json.dumps(envelope,separators=(',',':')).encode()
                cipher=daily.command(['age','-r',daily.config()['recipient']],input=plaintext,timeout=20)
                captures.append({'stateDigest':envelope['stateDigest'],'cipherSha256':hashlib.sha256(cipher).hexdigest(),
                                 'cipherBytes':len(cipher),'capturedAt':envelope['authority']['capturedAt']})
                return {'mode':mode,'stateDigest':envelope['stateDigest'],'encryptedAuthority':cipher}

            def verify():
                until=time.monotonic()+60
                while True:
                    try:
                        daily.owner_runtime()
                        proof=json.loads(daily.command(['docker','exec',services['api']['Id'],'node','-e',daily.ORIGIN_PROBE]))
                        return proof.get('anonymousDenied')==4
                    except Exception:
                        if time.monotonic()>=until:
                            return False
                        time.sleep(2)

            if request['mode']=='plan':
                observation=helper('observe')
                current=inspect()
                if not fence.quiet(observation) or any(fence.runtime(current[cid]) != fence.runtime(value)
                                                     for cid,value in baseline.items()):
                    raise ValueError('Transport preflight changed runtime or is not quiet')
                record.update(stage='plan-complete',checkedAt=dt.datetime.now(dt.timezone.utc).isoformat())
                daily.atomic(pointer,record)
                return {'sourceCommit':request['sourceCommit'],'ownerApplicationCommit':manifest['commit'],
                        'mode':'plan','sourceFilesVerified':len(files),'servicesStopped':0,
                        'originalOwnerEgressNetworkVerified':True,'dockerLoggingDisabled':True,
                        'temporaryContainersAndPlaintextRemoved':True,'existingContainersUnchanged':True,
                        **observation,'writerFenceEstablished':False,'authorityCreated':False,
                        'serviceActivationAllowed':False,'paidAiCalls':0,'liveDatabaseWrites':False}
            else:
                result=fence.run_fence('drill',services,inspect=inspect,observe=lambda:helper('observe'),
                    stop=lambda cid:daily.command(['docker','stop','--time','20',cid],timeout=30),
                    start=lambda cid:daily.command(['docker','start',cid],timeout=30),capture=capture,verify=verify,
                    settle=time.sleep,checkpoint=checkpoint)
        return {'sourceCommit':request['sourceCommit'],'ownerApplicationCommit':manifest['commit'],
                'servicesStoppedAndResumed':3,'originalIdsImagesPreserved':True,'foreignContainersUnchanged':True,
                'independentEncryptedCaptures':len(captures),'matchingStateDigest':result['stateDigest'],
                'captureProofs':captures,'mode':'drill','replayAllowed':False,'serviceActivationAllowed':False,
                'writerFenceStillHeld':False,'ownerOriginBoundaryVerified':True,
                'temporaryContainersAndPlaintextRemoved':True,'liveDatabaseWrites':False,
                'authProviderWrites':False,'externalMessagesSent':False,'paidAiCalls':0}


if __name__=='__main__':
    try:
        signal.signal(signal.SIGTERM,lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
        print(json.dumps({'ok':True,'result':main(json.load(sys.stdin))}))
    except (Exception,KeyboardInterrupt):
        print(json.dumps({'ok':False,'phase':'writer-fence-drill'}));sys.exit(1)
