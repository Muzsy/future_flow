"""Data-only replay in a clean pinned PostgreSQL; never a serving recovery."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import time

APP = 'sha256:da00119b4257a0def0fde3bc9fe80fe09697f554fea8286f6bba600be621a4f3'
APP_COMMIT = '9eb7732b69e84583cf7e63c237763b51b9bb4eab'
PG = 'sha256:589f742565e4f6d22149176b032974f55f8201a8a37b71ed587ec5c6902e689f'
LABEL = 'com.alterward.quarantine-rehearsal'
# /tmp is 16 MiB; refuse larger input BEFORE the original services stop.
MAX_DUMP = 12 * 1024**2


def selected_table_data(toc, tables):
    """Archive definitions never enter the replay list, even if present."""
    if len(toc) > 2 * 1024**2 or not 1 <= len(tables) <= 97 or len(set(tables)) != len(tables):
        raise ValueError('Bounded reviewed restore table list required')
    if any(not re.fullmatch(r'(?:aw_|ff_)[a-z0-9_]+', n) for n in tables):
        raise ValueError('Reviewed public application tables only')
    entries, seen = [], set()
    for line in toc.decode('utf8').splitlines():
        if not line or line.startswith(';'):
            continue
        if ' TABLE DATA ' not in line:
            continue
        match = re.fullmatch(r'([0-9]+); [0-9]+ [0-9]+ TABLE DATA public ((?:aw_|ff_)[a-z0-9_]+) [a-zA-Z_][a-zA-Z0-9_]*', line)
        if not match or match[2] not in tables or match[2] in seen:
            raise ValueError('Unexpected or duplicated table data archive entry')
        seen.add(match[2]); entries.append(line)
    if seen != set(tables):
        raise ValueError('Complete reviewed data-only archive required')
    return ('\n'.join(entries)+'\n').encode()


def prepare_backup(daily, request, scratch, *, reviewed_releases=None):
    identity = request.get('recoveryIdentity')
    if not isinstance(identity, str) or len(identity) > 4096 or '\0' in identity:
        raise ValueError('Bounded protected recovery identity required')
    path = scratch/'recovery-identity.txt'
    path.write_text(identity); path.chmod(0o600)
    try:
        recipient = daily.command([daily.backup.age_path('age-keygen'), '-y', str(path)], timeout=10).decode().strip()
        if recipient != daily.config()['recipient']:
            raise ValueError('Original daily recipient identity required')
        records = daily.completed_archives(daily.ROOT/'backups')
        eligible = [r for r in records if 0 <= (daily.utcnow()-r['created']).total_seconds() <= daily.RETENTION_SECONDS]
        if not eligible:
            raise ValueError('No original unexpired daily backup')
        selected = max(eligible, key=lambda r:r['created'])
        manifest = selected['manifest']
        releases={(APP_COMMIT,APP)} if reviewed_releases is None else reviewed_releases
        if ((manifest.get('ownerCommit'),manifest['ownerImage']) not in releases or manifest['postgresImage'] != PG or
                not re.fullmatch('[a-f0-9]{64}',manifest['dumpSha256'])):
            raise ValueError('Reviewed original backup images and dump digest required')
        cipher, observed = daily.expiry_file(selected['path']/'application.dump.age')
        if (observed['bytes'] > MAX_DUMP or
                {k:observed[k] for k in ('bytes','sha256')} != manifest['encryptedFiles']['application.dump.age']):
            raise ValueError('Bounded original ciphertext binding required')
        dump = daily.command([daily.backup.age_path(), '-d', '-i', str(path)], input=cipher, timeout=20)
        if not 0 < len(dump) <= MAX_DUMP or hashlib.sha256(dump).hexdigest() != manifest['dumpSha256']:
            raise ValueError('Original plaintext dump digest required')
        return {'dump':dump, 'manifest':manifest, 'runId':manifest['runId'],
                'cipherSha256':observed['sha256'], 'backupManifestSha256':selected['files']['manifest.json']['sha256']}
    finally:
        path.unlink()


def replay(daily, scratch, files, node_files, nonce, backup, envelope, held, checkpoint, cleanup, phase=lambda _:None, *, funded_runtime=None):
    pg_name = 'alterward-quarantine-pg-'+nonce
    target = 'aw_restore_'+nonce
    created = []
    app = APP
    if funded_runtime is not None:
        if (funded_runtime.get('version') != 'alterward-funded-replay-1' or
                funded_runtime.get('sourceCommit') != backup['manifest'].get('ownerCommit') or
                funded_runtime.get('imageId') != backup['manifest'].get('ownerImage') or
                not re.fullmatch(r'sha256:[a-f0-9]{64}', funded_runtime.get('imageId', ''))):
            raise ValueError('Funded replay requires the same verified active backup image')
        app = funded_runtime['imageId']
    # Only names/label are durable; no identity, envelope or personal data.
    def register(name, image):
        created.append((name,image)); checkpoint([n for n,_ in created])
    for image in [app,PG]:
        daily.command(['docker','image','inspect',image], timeout=10)
    key,cert = scratch/'quarantine.key',scratch/'quarantine.crt'
    daily.command(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1',
                   '-subj','/CN=postgres','-addext','subjectAltName=DNS:postgres',
                   '-addext','basicConstraints=critical,CA:TRUE','-keyout',str(key),'-out',str(cert)], timeout=10)
    # Original pinned PG image's known nonroot account, not a host user.
    os.chown(key,999,999); key.chmod(0o600); cert.chmod(0o644)
    hosts = scratch/'quarantine.hosts'
    hosts.write_text('127.0.0.1 localhost postgres\n::1 localhost\n'); hosts.chmod(0o644)
    request = {'quarantineDatabase':target,'backupCapturedAt':backup['manifest']['capturedAt'].replace('+00:00','Z'),
               'backupDumpSha256':backup['manifest']['dumpSha256'],'envelope':envelope,'held':held,
               **({'fundedRuntime':'v9'} if funded_runtime is not None else {})}
    def psql(sql):
        return daily.command(['docker','exec','-i',pg_name,'psql','-X','-A','-t','-U','postgres','-d',target,'-v','ON_ERROR_STOP=1'],input=sql.encode(),timeout=25)
    def node(action):
        phase('quarantine-'+action)
        name='alterward-quarantine-'+action+'-'+nonce
        args=['docker','run','-i','--name',name,'--network','container:'+pg_name,'--read-only',
              '--log-driver','none','--label',LABEL+'='+nonce,'--user','1000:1000','--cap-drop','ALL',
              '--security-opt','no-new-privileges:true','--memory','384m','--cpus','0.5','--pids-limit','96',
              '--workdir','/app','--tmpfs','/tmp:rw,noexec,nosuid,size=32m',
              '--mount','type=bind,src='+str(hosts)+',dst=/etc/hosts,readonly',
              '--mount','type=bind,src='+str(cert)+',dst=/run/quarantine-ca.crt,readonly']
        for filename in sorted(node_files):
            args+=['--mount','type=bind,src='+str(scratch/filename)+',dst=/app/'+filename+',readonly']
        args+=['-e','ALTERWARD_QUARANTINE_REHEARSAL=true','-e','AI_PROJECT_BUDGET_USD=0','-e','AI_USER_BUDGET_USD=0',
               '-e','DATABASE_URL=postgresql://postgres:rehearsal_unused@postgres:5432/'+target,
               '-e','DATABASE_SSL_CA_FILE=/run/quarantine-ca.crt',app,
               'node','node_modules/tsx/dist/cli.mjs','--tsconfig','tsconfig.scripts.json','scripts/replay-fenced-backup.ts','--'+action]
        register(name,app)
        raw=daily.command(args,input=json.dumps({**request,'action':action},separators=(',',':')).encode(),timeout=165)
        if not 0 < len(raw) <= 8192:
            raise ValueError('Bounded aggregate quarantine result required')
        value=json.loads(raw)
        if value.get('action')!=action or value.get('databaseTlsVerified') is not True or value.get('serviceActivationAllowed') is not False:
            raise ValueError('Isolated quarantine operation refused')
        return value
    try:
        phase('quarantine-start')
        register(pg_name,PG)
        daily.command(['docker','run','-d','--name',pg_name,'--network','none','--read-only','--log-driver','none',
            '--label',LABEL+'='+nonce,'--memory','512m','--cpus','0.5','--pids-limit','128',
            '--security-opt','no-new-privileges:true','--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,size=384m',
            '--tmpfs','/var/run/postgresql:rw,noexec,nosuid,size=2m','--tmpfs','/tmp:rw,noexec,nosuid,size=16m',
            '--mount','type=bind,src='+str(key)+',dst=/run/fixture.key,readonly',
            '--mount','type=bind,src='+str(cert)+',dst=/run/fixture.crt,readonly',
            '-e','POSTGRES_PASSWORD=rehearsal_unused',PG,'-c','ssl=on','-c','ssl_cert_file=/run/fixture.crt','-c','ssl_key_file=/run/fixture.key'],timeout=30)
        until=time.monotonic()+45
        while True:
            try:
                daily.command(['docker','exec',pg_name,'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=5)
                break
            except Exception:
                if time.monotonic()>=until: raise ValueError('Quarantine TCP readiness timeout')
                time.sleep(1)
        daily.command(['docker','exec',pg_name,'psql','-X','-U','postgres','-v','ON_ERROR_STOP=1','-c',
            'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;'],timeout=10)
        daily.command(['docker','exec',pg_name,'createdb','-U','postgres',target],timeout=10)
        prepared=node('prepare')
        if prepared.get('cleanCatalogHardenedBeforeDataLoad') is not True or prepared.get('cleanMigrationSeedRowsRemoved') != 3:
            raise ValueError('Clean executable catalog must pass before old data')
        tables=psql("SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname").decode().strip().splitlines()
        if len(tables)!=97 or set(tables)!=set(t['name'] for t in backup['manifest']['expectedTables']):
            raise ValueError('Original dump and clean migrated table coverage differ')
        # docker cp may refuse a read-only rootfs despite /tmp being tmpfs.
        # Write via the container's own writable mount, with fixed shell text.
        daily.command(['docker','exec','-i','--user','999:999',pg_name,'sh','-c',
            'umask 077; cat > /tmp/application.dump'],input=backup['dump'],timeout=15)
        toc=daily.command(['docker','exec',pg_name,'pg_restore','--list','/tmp/application.dump'],timeout=15)
        listing=selected_table_data(toc,tables)
        daily.command(['docker','exec','-i','--user','999:999',pg_name,'sh','-c',
            'umask 077; cat > /tmp/table-data.list'],input=listing,timeout=10)
        # Disable known triggers only inside one atomic isolated load; no old
        # code, schema, ACL, owner, sequence or large object is restored. The
        # strict catalog and every FK relationship are checked after the load.
        phase('quarantine-load')
        daily.command(['docker','exec',pg_name,'pg_restore','-U','postgres','-d',target,
            '--data-only','--no-owner','--no-acl','--disable-triggers','--single-transaction','--exit-on-error',
            '--use-list=/tmp/table-data.list','/tmp/application.dump'],timeout=45)
        phase('quarantine-digest')
        for table in backup['manifest']['expectedTables']:
            sql="SET timezone='UTC'; SELECT count(*)::int,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.\""+table['name']+'\" t;'
            observed=psql(sql).decode().strip().splitlines()[-1]
            if observed!=str(table['count'])+'|'+table['digest']:
                raise ValueError('Data-only loaded rows differ from original manifest')
        proof=node('replay')
        if (proof.get('independentReadOnlyPostReplayVerified') is not True or proof.get('reviewedSecurityCatalog') is not True or
                proof.get('reviewedTables')!=100 or proof.get('reviewedForeignKeys')!=225 or
                proof.get('paidAiCalls')!=0 or proof.get('authProviderWrites') is not False):
            raise ValueError('Committed replay needs independent complete verification')
        return {**proof,'cleanCatalogHardenedBeforeDataLoad':True,'dataOnlyOriginalBackupLoaded':True,
                'tablesMatchedBeforeReplay':len(tables),
                'backupRunId':backup['runId'],'backupCipherSha256':backup['cipherSha256'],
                'backupManifestSha256':backup['backupManifestSha256'],'networkHasNoExternalInterface':True,
                'publicPorts':0,'temporaryContainersAndPlaintextRemoved':True}
    finally:
        with cleanup():
            for name,image in reversed(created):
                observed=[c for c in daily.containers() if c['Name']=='/'+name]
                if not observed: continue
                c=observed[0]
                if (c['Image']!=image or c['Config'].get('Labels',{}).get(LABEL)!=nonce or
                        c['HostConfig'].get('PortBindings') or c['HostConfig']['LogConfig']['Type']!='none' or
                        not (c['HostConfig']['NetworkMode']=='none' if name==pg_name else c['HostConfig']['NetworkMode'].startswith('container:'))):
                    raise ValueError('Quarantine cleanup identity differs')
                daily.command(['docker','rm','-f',c['Id']],timeout=15)
            checkpoint([])
