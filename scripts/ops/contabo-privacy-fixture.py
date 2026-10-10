"""Private, disposable PostgreSQL privacy-replay fixture; no live DB access."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import sys
import tempfile
import time
from alterward_backup import run
from alterward_target import existing_state

LABEL = 'com.alterward.privacy-fixture'
APP = 'sha256:da00119b4257a0def0fde3bc9fe80fe09697f554fea8286f6bba600be621a4f3'
PG = 'sha256:589f742565e4f6d22149176b032974f55f8201a8a37b71ed587ec5c6902e689f'
FILES = {'scripts/lib/privacy-restore.ts', 'scripts/lib/privacy-restore-proof.ts', 'scripts/smoke-privacy-restore.ts'}

def main(request):
    os.umask(0o077)
    if os.geteuid() != 0 or not re.fullmatch('[a-f0-9]{40}', request['sourceCommit']):
        raise ValueError('Pinned root operator required')
    if set(request['files']) != FILES:
        raise ValueError('Exact fixture source required')
    if run(['findmnt', '-no', 'FSTYPE', '--target', '/run']).stdout.strip() != b'tmpfs':
        raise ValueError('Memory-backed scratch required')
    before = existing_state()
    if len(before) != 9:
        raise ValueError('Expected owner-only runtime')
    owner = json.loads(Path('/root/alterward-ops/owner/manifest.json').read_text())
    if owner['imageId'] != APP or owner['commit'] != '9eb7732b69e84583cf7e63c237763b51b9bb4eab':
        raise ValueError('Reviewed base image required')
    for image in [APP, PG]:
        run(['docker', 'image', 'inspect', image])
    nonce = os.urandom(12).hex()
    pg_name, node_name = 'alterward-privacy-pg-' + nonce, 'alterward-privacy-node-' + nonce
    created = []
    with tempfile.TemporaryDirectory(prefix='alterward-privacy-', dir='/run') as temp:
        scratch = Path(temp)
        for filename, value in request['files'].items():
            data = base64.b64decode(value['data'], validate=True)
            if len(data) > 256*1024 or hashlib.sha256(data).hexdigest() != value['sha256']:
                raise ValueError('Source mismatch')
            destination = scratch / filename
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            destination.write_bytes(data)
            destination.chmod(0o644)
        key, cert = scratch/'key.pem', scratch/'cert.pem'
        run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
             '-subj', '/CN=postgres', '-addext', 'subjectAltName=DNS:postgres',
             '-addext', 'basicConstraints=critical,CA:TRUE', '-keyout', str(key), '-out', str(cert)])
        uid = int(run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'id', PG, '-u', 'postgres']).stdout)
        gid = int(run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'id', PG, '-g', 'postgres']).stdout)
        if uid <= 0 or gid <= 0:
            raise ValueError('Nonroot PostgreSQL required')
        os.chown(key, uid, gid); key.chmod(0o600); cert.chmod(0o644)
        hosts = scratch/'hosts'
        hosts.write_text('127.0.0.1 localhost postgres\n::1 localhost\n'); hosts.chmod(0o644)
        try:
            run(['docker', 'run', '-d', '--name', pg_name, '--network', 'none', '--read-only',
                 '--label', LABEL+'='+nonce, '--memory', '512m', '--cpus', '0.5', '--pids-limit', '128',
                 '--security-opt', 'no-new-privileges:true',
                 '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=384m',
                 '--tmpfs', '/var/run/postgresql:rw,noexec,nosuid,size=2m',
                 '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
                 '--mount', 'type=bind,src='+str(key)+',dst=/run/fixture.key,readonly',
                 '--mount', 'type=bind,src='+str(cert)+',dst=/run/fixture.crt,readonly',
                 '-e', 'POSTGRES_PASSWORD=rehearsal_unused', PG,
                 '-c', 'ssl=on', '-c', 'ssl_cert_file=/run/fixture.crt', '-c', 'ssl_key_file=/run/fixture.key'])
            created.append(pg_name)
            deadline=time.monotonic()+45
            while run(['docker','exec',pg_name,'pg_isready','-U','postgres'],check=False).returncode:
                if time.monotonic()>deadline: raise ValueError('PostgreSQL readiness timeout')
                time.sleep(1)
            run(['docker','exec',pg_name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-c',
                 'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;'])
            args=['docker','run','--name',node_name,'--network','container:'+pg_name,'--read-only',
                  '--label',LABEL+'='+nonce,'--user','1000:1000','--cap-drop','ALL',
                  '--security-opt','no-new-privileges:true','--memory','384m','--cpus','0.5','--pids-limit','96',
                  '--tmpfs','/tmp:rw,noexec,nosuid,size=32m',
                  '--mount','type=bind,src='+str(hosts)+',dst=/etc/hosts,readonly',
                  '--mount','type=bind,src='+str(cert)+',dst=/run/secrets/supabase-ca.crt,readonly']
            for filename in sorted(FILES):
                args+=['--mount','type=bind,src='+str(scratch/filename)+',dst=/app/'+filename+',readonly']
            args+=['-e','ALTERWARD_PRIVACY_FIXTURE=true','-e','AI_PROJECT_BUDGET_USD=0','-e','AI_USER_BUDGET_USD=0',
                   '-e','DATABASE_URL=postgresql://postgres:rehearsal_unused@postgres:5432/postgres',
                   '-e','DATABASE_SSL_CA_FILE=/run/secrets/supabase-ca.crt',APP,
                   'node','node_modules/tsx/dist/cli.mjs','--tsconfig','tsconfig.scripts.json','scripts/smoke-privacy-restore.ts']
            created.append(node_name)
            output=run(args,timeout=180).stdout.decode().strip()
            proof=json.loads(output)
            if proof['postgresPrivacyRestore']!='passed' or proof['serviceActivationAllowed'] or proof['paidAiCalls']!=0:
                raise ValueError('Privacy fixture did not pass')
        finally:
            for name in reversed(created):
                inspected=run(['docker','inspect',name],check=False)
                if inspected.returncode: continue
                value=json.loads(inspected.stdout)[0]
                if value['Name']!='/'+name or value['Config'].get('Labels',{}).get(LABEL)!=nonce or value['HostConfig'].get('PortBindings'):
                    raise ValueError('Unexpected fixture identity; refusing cleanup')
                run(['docker','rm','-f',name])
    if existing_state()!=before:
        raise ValueError('Existing runtime changed during fixture')
    return {**proof,'sourceCommit':request['sourceCommit'], 'sourceFileHashes':{k:v['sha256'] for k,v in request['files'].items()},
            'baseApplicationImage':APP,'postgresImage':PG,'databaseTlsVerified':True,
            'networkHasNoExternalInterface':True,'existingContainersUnchanged':True,'temporaryContainersAndPlaintextRemoved':True,
            'liveDatabaseWrites':False,'externalMessagesSent':False}

if __name__=='__main__':
    try:
        signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
        print(json.dumps({'ok':True,'result':main(json.load(sys.stdin))}))
    except (Exception,KeyboardInterrupt):
        print(json.dumps({'ok':False,'phase':'privacy-fixture'}));sys.exit(1)
