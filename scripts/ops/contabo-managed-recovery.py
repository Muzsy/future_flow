"""Manual, encrypted managed-schema capture and network-isolated restore proof.

No installer, schedule, live restore, Auth server, email, or provider execution.
Public data is excluded. Ownership, login roles and Vault recovery are not proved.
"""
import base64
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import tempfile
import time
import alterward_backup as backup

ROOT = Path('/root/alterward-ops/managed-recovery')
LABEL = 'com.alterward.managed-recovery'
FILES = {'managed.dump.age', 'catalog.json.age'}
PINNED_PG = 'sha256:589f742565e4f6d22149176b032974f55f8201a8a37b71ed587ec5c6902e689f'
RUN_ID = re.compile(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}')
PHASE = 'validation'
IDENTIFIER = re.compile(r'[a-z_][a-z0-9_]{0,62}')
EXCLUDED_AUTH_DATA = {'audit_log_entries', 'sessions', 'refresh_tokens', 'one_time_tokens',
    'flow_state', 'mfa_amr_claims', 'mfa_challenges', 'mfa_recovery_codes',
    'mfa_recovery_code_sets', 'oauth_authorizations', 'oauth_client_states',
    'oauth_consents', 'saml_relay_states', 'scim_tokens', 'webauthn_challenges'}
KNOWN_AUTH_TABLES = {'audit_log_entries', 'custom_oauth_providers', 'flow_state', 'identities',
    'instances', 'mfa_amr_claims', 'mfa_challenges', 'mfa_factors', 'mfa_recovery_code_sets',
    'mfa_recovery_codes', 'oauth_authorizations', 'oauth_client_states', 'oauth_clients',
    'oauth_consents', 'one_time_tokens', 'refresh_tokens', 'saml_providers', 'saml_relay_states',
    'schema_migrations', 'scim_tokens', 'scim_users', 'sessions', 'sso_domains', 'sso_providers',
    'users', 'webauthn_challenges', 'webauthn_credentials'}
KNOWN_AUTH_USER_COLUMNS = {'instance_id', 'id', 'aud', 'role', 'email', 'encrypted_password',
    'email_confirmed_at', 'invited_at', 'confirmation_token', 'confirmation_sent_at',
    'recovery_token', 'recovery_sent_at', 'email_change_token_new', 'email_change',
    'email_change_sent_at', 'last_sign_in_at', 'raw_app_meta_data', 'raw_user_meta_data',
    'is_super_admin', 'created_at', 'updated_at', 'phone', 'phone_confirmed_at', 'phone_change',
    'phone_change_token', 'phone_change_sent_at', 'confirmed_at', 'email_change_token_current',
    'email_change_confirm_status', 'banned_until', 'reauthentication_token',
    'reauthentication_sent_at', 'is_sso_user', 'deleted_at', 'is_anonymous'}
KNOWN_STORAGE_TABLES = {'buckets', 'buckets_analytics', 'buckets_vectors', 'migrations',
    'objects', 's3_multipart_uploads', 's3_multipart_uploads_parts', 'vector_indexes'}
EXCLUDED_STORAGE_DATA = {'s3_multipart_uploads', 's3_multipart_uploads_parts'}
SECURITY_SQL = r"""SELECT md5(jsonb_build_object(
'columns',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.table_name,x.ordinal_position) FROM (SELECT table_name,column_name,ordinal_position,data_type,udt_schema,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public') x),
'tables',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.relname) FROM (SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p')) x),
'grants',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.table_name,x.grantee,x.privilege_type) FROM (SELECT table_name,grantee,privilege_type,is_grantable FROM information_schema.table_privileges WHERE table_schema='public') x),
'policies',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.tablename,x.policyname) FROM (SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public') x),
'functions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.proname,x.arguments) FROM (SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,p.prosecdef,pg_get_functiondef(p.oid) AS definition,p.proacl::text AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') x),
'triggers',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.relname,x.tgname) FROM (SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal) x),
'indexes',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.tablename,x.indexname) FROM (SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public') x),
'constraints',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.relname,x.conname) FROM (SELECT c.relname,k.conname,k.contype,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') x)
)::text) AS digest"""


def sha(data):
    return hashlib.sha256(data).hexdigest()


def command(args, *, input=None, timeout=90, check=True):
    # Never surface pg_restore/psql stderr, which may contain password hashes,
    # recovery tokens, emails or other managed user data.
    result = backup.run(args, input=input, timeout=timeout, check=False)
    if check and result.returncode:
        raise RuntimeError('Managed recovery command failed')
    return result


def existing_state():
    ids = command(['docker', 'ps', '-aq']).stdout.decode().split()
    inspected = json.loads(command(['docker', 'inspect', *ids]).stdout)
    return {c['Id']: {'image': c['Image'], 'status': c['State']['Status'],
                      'restarts': c['RestartCount'],
                      'ports': c['HostConfig']['PortBindings']}
            for c in inspected}


def cleanup(name, run_id):
    result = command(['docker', 'inspect', name], check=False)
    if result.returncode:
        return
    container = json.loads(result.stdout)[0]
    if (container['Config'].get('Labels', {}).get(LABEL) != run_id or
            container['HostConfig']['PortBindings'] or
            container['Image'] != PINNED_PG):
        raise ValueError('Refusing unrelated container cleanup')
    command(['docker', 'rm', '-f', container['Id']])


def private_existing(path):
    value = path.lstat()
    if (path.resolve() != path or not stat.S_ISREG(value.st_mode) or
            value.st_uid != 0 or value.st_nlink != 1 or stat.S_IMODE(value.st_mode) != 0o600):
        raise ValueError('Original private regular file required')
    return path.read_bytes()


@contextlib.contextmanager
def operator_locks():
    import fcntl
    with contextlib.ExitStack() as stack:
        for path in [Path('/root/alterward-ops/daily/job.lock'),
                     Path('/root/alterward-ops/owner/activation.lock')]:
            private_existing(path)
            fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
            stack.callback(os.close, fd)
            value = os.fstat(fd)
            if value.st_uid != 0 or value.st_nlink != 1 or not stat.S_ISREG(value.st_mode):
                raise ValueError('Private original operator lock required')
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def assert_live_recipient(recipient):
    config = json.loads(private_existing(Path('/root/alterward-ops/daily/config.json')))
    if config['recipient'] != recipient or config['postgresImage'] != PINNED_PG:
        raise ValueError('Original daily recipient and image must match')


def validate_manifest(manifest, request):
    required = {'capturedAt', 'expiresAt', 'schemaVersion', 'runId', 'postgresImage',
                'projectBinding', 'sourceCommit', 'encryptedFiles', 'scope', 'sourceHashes'}
    if not required.issubset(manifest):
        raise ValueError('Complete source manifest required')
    captured = dt.datetime.fromisoformat(manifest['capturedAt'])
    expires = dt.datetime.fromisoformat(manifest['expiresAt'])
    now = dt.datetime.now(dt.timezone.utc)
    if (manifest['schemaVersion'] != 'alterward-managed-recovery-2' or
            manifest['runId'] != request['runId'] or
            manifest['postgresImage'] != PINNED_PG or
            manifest['projectBinding'] != request['projectBinding'] or
            not re.fullmatch(r'[a-f0-9]{64}', manifest['projectBinding']) or
            not re.fullmatch(r'[a-f0-9]{40}', manifest['sourceCommit']) or
            set(manifest['encryptedFiles']) != FILES or
            manifest['scope'] != 'auth-storage-data-and-public-security' or
            captured.utcoffset() != dt.timedelta(0) or expires.utcoffset() != dt.timedelta(0) or
            captured > now + dt.timedelta(seconds=30) or expires <= now or
            expires - captured != dt.timedelta(days=7)):
        raise ValueError('Project-bound unexpired ciphertext manifest required')


def validate_base(request):
    if (os.geteuid() != 0 or not RUN_ID.fullmatch(request['runId']) or
            request['image'] != PINNED_PG or
            not re.fullmatch(r'[a-f0-9]{40}', request['commit'])):
        raise ValueError('Root, exact source and cached image required')
    if command(['findmnt', '-n', '-o', 'FSTYPE', '-T', '/run']).stdout.strip() != b'tmpfs':
        raise ValueError('Actual memory filesystem required')
    if ROOT.is_symlink():
        raise ValueError('Linked archive root refused')
    ROOT.mkdir(mode=0o700, exist_ok=True)
    if ROOT.resolve() != ROOT or ROOT.stat().st_uid != 0:
        raise ValueError('Protected archive root required')
    os.chmod(ROOT, 0o700)


def safe_catalog(catalog):
    if catalog.get('scope') != 'auth-storage-data-and-public-security':
        raise ValueError('Exact catalog scope required')
    roles = catalog['roles']
    tables = catalog['tables']
    if (not 1 <= len(roles) <= 100 or not 1 <= len(tables) <= 1000 or
            len(set(roles)) != len(roles) or
            any(not IDENTIFIER.fullmatch(role) for role in roles) or
            not re.fullmatch(r'[a-f0-9]{32}', catalog['publicSecurityDigest'])):
        raise ValueError('Bounded role catalog required')
    if any(t['schema'] not in {'auth', 'storage'} or
           (t['schema'] == 'auth' and t['name'] not in KNOWN_AUTH_TABLES) or
           (t['schema'] == 'storage' and t['name'] not in KNOWN_STORAGE_TABLES) or
           not IDENTIFIER.fullmatch(t['name']) or
           not re.fullmatch(r'[a-f0-9]{32}', t['digest']) or
           not isinstance(t['count'], int) or t['count'] < 0 for t in tables):
        raise ValueError('Managed table catalog required')
    keys = [(t['schema'], t['name']) for t in tables]
    if len(set(keys)) != len(keys) or ('auth', 'users') not in keys:
        raise ValueError('Complete distinct managed table catalog required')
    columns = catalog['authUserInsertColumns']
    token_columns = catalog['clearedAuthUserTokenColumns']
    users = catalog['sanitizedAuthUsers']
    if (not 1 <= catalog['publicTables'] <= 1000 or catalog['publicRlsTables'] != catalog['publicTables'] or
            set(columns) != KNOWN_AUTH_USER_COLUMNS - {'confirmed_at'} or len(set(columns)) != len(columns) or
            set(token_columns) != {c for c in KNOWN_AUTH_USER_COLUMNS if 'token' in c} or
            any(not IDENTIFIER.fullmatch(c) for c in columns + token_columns) or
            not 0 <= len(users) <= 10000 or
            len({u['id'] for u in users}) != len(users) or
            any(set(u) != KNOWN_AUTH_USER_COLUMNS for u in users) or
            any(u['email_change'] not in {None, ''} or u['phone_change'] not in {None, ''} or
                u['email_change_confirm_status'] != 0 for u in users) or
            any(u.get(c) not in {None, ''} for u in users for c in token_columns) or
            any(value not in {None, ''} for u in users for key, value in u.items() if 'token' in key) or
            any(t['count'] != 0 for t in tables if
                (t['schema'] == 'auth' and t['name'] in EXCLUDED_AUTH_DATA) or
                (t['schema'] == 'storage' and t['name'] in EXCLUDED_STORAGE_DATA))):
        raise ValueError('Sanitized Auth identities and empty ephemeral data required')
    return catalog


def capture(request):
    global PHASE
    validate_base(request)
    catalog = safe_catalog(request['catalog'])
    pg = request['database']
    ref = request['projectRef']
    if (not re.fullmatch(r'[a-z]{20}', ref) or
            not (pg['host'] == 'db.' + ref + '.supabase.co' or
                 (pg['host'].endswith('.pooler.supabase.com') and
                  pg['user'] == 'postgres.' + ref)) or
            pg['name'] != 'postgres' or str(pg['port']) != '5432' or
            any('\n' in str(v) or '\r' in str(v) for v in pg.values()) or
            not re.fullmatch(r'[0-9A-Fa-f-]{8,100}', request['snapshot']) or
            not re.fullmatch(r'age1[0-9a-z]{58}', request['recipient'])):
        raise ValueError('Project-bound verified snapshot required')
    assert_live_recipient(request['recipient'])
    before = existing_state()
    target = ROOT / request['runId']
    target.mkdir(mode=0o700)  # never replace an existing capture
    name = 'alterward-managed-capture-' + request['runId'].lower()
    try:
        with tempfile.TemporaryDirectory(dir='/run', prefix='alterward-managed-') as temporary:
            scratch = Path(temporary)
            os.chmod(scratch, 0o700)
            escaped = [str(pg[k]).replace('\\', '\\\\').replace(':', '\\:') for k in
                       ['host', 'port', 'name', 'user', 'password']]
            backup.private_file(scratch / 'pgpass', (':'.join(escaped) + '\n').encode())
            backup.private_file(scratch / 'ca.crt', request['ca'].encode())
            env = {'PGHOST': pg['host'], 'PGPORT': '5432', 'PGDATABASE': 'postgres',
                   'PGUSER': pg['user'], 'PGPASSFILE': '/private/pgpass',
                   'PGSSLMODE': 'verify-full', 'PGSSLROOTCERT': '/private/ca.crt',
                   'PGCONNECT_TIMEOUT': '10',
                   'PGOPTIONS': '-c default_transaction_read_only=on -c statement_timeout=120000 -c timezone=UTC'}
            backup.private_file(scratch / 'client.env', ''.join(k + '=' + v + '\n' for k, v in env.items()).encode())
            try:
                PHASE = 'read-only-capture'
                dump = command(['docker', 'run', '--rm', '--name', name,
                    '--label', LABEL + '=' + request['runId'], '--read-only',
                    '--memory', '256m', '--cpus', '0.5', '--pids-limit', '64',
                    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
                    '--mount', 'type=bind,src=' + str(scratch) + ',dst=/private,readonly',
                    '--env-file', str(scratch / 'client.env'), '--entrypoint', 'pg_dump',
                    PINNED_PG, '--format=custom', '--schema=public', '--schema=auth',
                    '--schema=storage', '--exclude-table-data=public.*',
                    '--exclude-table-data=auth.users',
                    *['--exclude-table-data=auth.' + n for n in sorted(EXCLUDED_AUTH_DATA)],
                    *['--exclude-table-data=storage.' + n for n in sorted(EXCLUDED_STORAGE_DATA)],
                    '--lock-wait-timeout=5000', '--snapshot=' + request['snapshot']], timeout=180).stdout
            finally:
                cleanup(name, request['runId'])
            if not dump.startswith(b'PGDMP') or len(dump) > 128 * 1024**2:
                raise ValueError('Bounded custom dump required')
            catalog_bytes = json.dumps(catalog, sort_keys=True).encode()
            PHASE = 'encryption'
            encrypted = {}
            for raw, filename in [(dump, 'managed.dump.age'), (catalog_bytes, 'catalog.json.age')]:
                cipher = command([backup.age_path(), '-r', request['recipient']], input=raw).stdout
                backup.private_file(target / filename, cipher)
                encrypted[filename] = {'sha256': sha(cipher), 'bytes': len(cipher)}
            if existing_state() != before:
                raise ValueError('Existing services changed; capture not accepted')
            captured = dt.datetime.now(dt.timezone.utc)
            manifest = {'schemaVersion': 'alterward-managed-recovery-2',
                'runId': request['runId'], 'sourceCommit': request['commit'],
                'capturedAt': captured.isoformat(),
                'expiresAt': (captured + dt.timedelta(days=7)).isoformat(),
                'scope': catalog['scope'], 'postgresImage': PINNED_PG,
                'projectBinding': sha(ref.encode()), 'dumpSha256': sha(dump),
                'sourceHashes': request['sourceHashes'],
                'originalDailyRecipientMatched': True,
                'ephemeralAuthDataExcludedAtCapture': True,
                'ephemeralStorageUploadDataExcludedAtCapture': True,
                'authUserTokenColumnsClearedAtCapture': True,
                'catalogSha256': sha(catalog_bytes), 'encryptedFiles': encrypted,
                'managedTables': len(catalog['tables']),
                'managedRows': sum(t['count'] for t in catalog['tables']),
                'publicDataIncluded': False, 'liveDatabaseWrites': False,
                'restoreOrActivationAllowed': False,
                'automaticRetentionConfigured': False}
            backup.private_file(target / 'manifest.json', json.dumps(manifest, sort_keys=True).encode())
            return manifest
    except Exception:
        # Dedicated, newly created incomplete capture only; no historical purge.
        shutil.rmtree(backup.confined(ROOT, target))
        raise


def rehearse(request):
    global PHASE
    validate_base(request)
    manifest = request['manifest']
    validate_manifest(manifest, request)
    before = existing_state()
    name = 'alterward-managed-restore-' + request['runId'].lower()
    with tempfile.TemporaryDirectory(dir='/run', prefix='alterward-managed-') as temporary:
        scratch = Path(temporary)
        os.chmod(scratch, 0o700)
        PHASE = 'decrypt-offsite'
        plaintext = {}
        for filename in sorted(FILES):
            encrypted = base64.b64decode(request['files'][filename], validate=True)
            if len(encrypted) > 128 * 1024**2 or sha(encrypted) != manifest['encryptedFiles'][filename]['sha256']:
                raise ValueError('Offsite cipher hash differs')
            cipher_file = scratch / filename
            backup.private_file(cipher_file, encrypted)
            # Identity is stdin only. It never becomes a server-side key file.
            plaintext[filename] = command([backup.age_path(), '-d', '-i', '-', str(cipher_file)], input=request['identity'].encode()).stdout
            corrupt = bytearray(encrypted)
            corrupt[-1] ^= 1
            corrupt_file = scratch / ('tampered-' + filename)
            backup.private_file(corrupt_file, bytes(corrupt))
            if command([backup.age_path(), '-d', '-i', '-', str(corrupt_file)], input=request['identity'].encode(), check=False).returncode == 0:
                raise ValueError('Tampered cipher accepted')
        if sha(plaintext['managed.dump.age']) != manifest['dumpSha256'] or sha(plaintext['catalog.json.age']) != manifest['catalogSha256']:
            raise ValueError('Plaintext hash differs')
        catalog = safe_catalog(json.loads(plaintext['catalog.json.age']))
        try:
            PHASE = 'isolated-bootstrap'
            command(['docker', 'run', '-d', '--name', name, '--network', 'none',
                '--label', LABEL + '=' + request['runId'], '--read-only',
                '--memory', '512m', '--cpus', '0.5', '--pids-limit', '128',
                '--security-opt', 'no-new-privileges:true',
                '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=384m',
                '--tmpfs', '/var/run/postgresql:rw,noexec,nosuid,size=2m',
                '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
                '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', PINNED_PG])
            deadline = time.monotonic() + 60
            while command(['docker', 'exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], check=False).returncode:
                if time.monotonic() > deadline:
                    raise RuntimeError('Final database listener not ready')
                time.sleep(1)
            roles = ''.join('CREATE ROLE "' + role + '" NOLOGIN;\n' for role in catalog['roles']
                            if role != 'postgres' and not role.startswith('pg_'))
            sql = roles + 'DROP SCHEMA public; CREATE SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION pg_stat_statements WITH SCHEMA extensions;'
            psql = ['docker', 'exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq']
            command(psql, input=sql.encode())
            PHASE = 'isolated-managed-schema'
            command(['docker', 'exec', '-i', name, 'pg_restore', '-U', 'postgres',
                     '-d', 'postgres', '--no-owner', '--section=pre-data', '--exit-on-error', '--single-transaction'],
                    input=plaintext['managed.dump.age'], timeout=180)
            schemas = command(psql, input=b"SELECT count(*) FROM pg_namespace WHERE nspname IN('public','auth','storage');").stdout.decode().strip()
            if schemas != '3':
                raise ValueError('Required schemas were not created')
            PHASE = 'isolated-sanitized-identities'
            columns = catalog['authUserInsertColumns']
            column_sql = ','.join('"' + c + '"' for c in columns)
            selection = ','.join('u."' + c + '"' for c in columns)
            insert = 'BEGIN;\n'
            for user in catalog['sanitizedAuthUsers']:
                encoded = base64.b64encode(json.dumps(user).encode()).decode()
                insert += 'INSERT INTO auth.users (' + column_sql + ') SELECT ' + selection + ' FROM jsonb_populate_record(NULL::auth.users,convert_from(decode(\'' + encoded + '\',\'base64\'),\'UTF8\')::jsonb) u;\n'
            command(psql, input=(insert + 'COMMIT;').encode())
            PHASE = 'isolated-managed-data'
            command(['docker', 'exec', '-i', name, 'pg_restore', '-U', 'postgres',
                     '-d', 'postgres', '--no-owner', '--section=data', '--section=post-data',
                     '--exit-on-error', '--single-transaction'],
                    input=plaintext['managed.dump.age'], timeout=180)
            PHASE = 'data-comparison'
            restored_tables = command(psql, input=b"SELECT schemaname||'.'||tablename FROM pg_tables WHERE schemaname IN ('auth','storage') ORDER BY schemaname,tablename;").stdout.decode().split()
            if restored_tables != sorted(t['schema'] + '.' + t['name'] for t in catalog['tables']):
                raise ValueError('Managed table set differs')
            for table in catalog['tables']:
                query = 'SET timezone=\'UTC\'; SELECT count(*)::int,md5(coalesce(string_agg(md5(to_jsonb(t)::text),\'\' ORDER BY md5(to_jsonb(t)::text)),\'\')) FROM "' + table['schema'] + '"."' + table['name'] + '" t;'
                restored = command(psql, input=query.encode()).stdout.decode().strip()
                if restored != str(table['count']) + '|' + table['digest']:
                    raise ValueError('Managed data differs')
            names = command(psql, input=b"SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;").stdout.decode().split()
            if not names or any(not IDENTIFIER.fullmatch(n) or not n.startswith(('aw_', 'ff_')) for n in names):
                raise ValueError('Unexpected public table catalog')
            count_sql = 'SELECT ' + '+'.join('(SELECT count(*) FROM public."' + n + '")' for n in names) + ';'
            if command(psql, input=count_sql.encode()).stdout.decode().strip() != '0':
                raise ValueError('Public data was unexpectedly restored')
            PHASE = 'security-comparison'
            security = command(psql, input=("SET timezone='UTC'; SET search_path=public;" + SECURITY_SQL + ';').encode()).stdout.decode().strip()
            if security != catalog['publicSecurityDigest']:
                raise ValueError('Public security metadata differs')
            protected = command(psql, input=b"SELECT count(*)||'|'||count(*) FILTER(WHERE relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p');").stdout.decode().strip()
            if protected != str(catalog['publicTables']) + '|' + str(catalog['publicRlsTables']):
                raise ValueError('Public RLS schema differs')
            browser = command(psql, input=b"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'));").stdout.decode().strip()
            if browser != '0':
                raise ValueError('Browser table access differs')
            proof = {'schemaVersion': 'alterward-managed-restore-proof-1',
                'runId': request['runId'], 'sourceCommit': request['commit'],
                'captureSourceCommit': manifest['sourceCommit'],
                'captureSourceHashes': manifest['sourceHashes'],
                'rehearsalSourceHashes': request['sourceHashes'],
                'projectBinding': manifest['projectBinding'], 'backupCapturedAt': manifest['capturedAt'],
                'backupExpiresAt': manifest['expiresAt'],
                'offsiteCiphertextVerified': True, 'tamperedCiphertextRejected': True,
                'managedTablesAndAllRowHashesMatched': len(catalog['tables']),
                'managedRowsMatched': sum(t['count'] for t in catalog['tables']),
                'publicSchemaRlsAndBrowserBoundaryMatched': True,
                'publicColumnsGrantsPoliciesFunctionsTriggersIndexesConstraintsMatched': True,
                'publicTablesVerifiedEmpty': len(names),
                'ephemeralAuthTablesVerifiedEmpty': True,
                'ephemeralStorageUploadTablesVerifiedEmpty': True,
                'authUserTokenColumnsClearedAtCapture': True, 'publicPorts': 0,
                'networkMode': 'none', 'authServerStarted': False,
                'liveDatabaseWrites': False, 'externalMessagesSent': False,
                'paidAiCalls': 0, 'restoreOrActivationAllowed': False,
                'fullHostedAuthRecoveryVerified': False,
                'ownershipAndGlobalRolesRestored': False,
                'vaultAndExternalStorageObjectsIncluded': False}
        finally:
            cleanup(name, request['runId'])
    if existing_state() != before:
        raise ValueError('Existing services changed')
    return {**proof, 'existingContainersUnchanged': len(before),
            'temporaryContainersRemoved': True, 'temporaryPlaintextRemoved': True}


def main():
    os.umask(0o077)
    def interrupted(_signal, _frame):
        raise RuntimeError('Operator interrupted')
    for interruption in [signal.SIGTERM, signal.SIGHUP]:
        signal.signal(interruption, interrupted)
    request = json.load(__import__('sys').stdin)
    if request['action'] in {'capture', 'rehearse'}:
        with operator_locks():
            return capture(request) if request['action'] == 'capture' else rehearse(request)
    raise ValueError('Explicit manual action required')


if __name__ == '__main__':
    try:
        print(json.dumps({'ok': True, 'result': main()}))
    except Exception:
        print(json.dumps({'ok': False, 'reason': 'MANAGED_RECOVERY_STOPPED', 'phase': PHASE}))
        __import__('sys').exit(1)
