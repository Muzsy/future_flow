import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomBytes } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  lstatSync,
  realpathSync,
  readdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { connectDatabase } from '../packages/database/dist/index.js';
import {
  privateReportDirectory,
  privateReportFile,
} from './lib/private-report.js';

// Manual backup/throwaway proof, never a live restore or a schedule installer.
const invoke = promisify(execFile);
const image =
  'sha256:589f742565e4f6d22149176b032974f55f8201a8a37b71ed587ec5c6902e689f';
const digest = (data: string | Buffer) =>
  createHash('sha256').update(data).digest('hex');
function regular(file: string) {
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
    throw Error('Private regular input required');
  return readFileSync(file);
}
let phase = 'validation';
async function main() {
  const restoreOnly = process.argv[2] === '--rehearse-existing';
  if (
    process.argv.length !== 3 ||
    (!restoreOnly && process.argv[2] !== '--capture-and-rehearse') ||
    process.platform !== 'win32'
  )
    throw Error('Explicit pinned Windows operator command required');
  const dir = privateReportDirectory('supabase-recovery');
  const secrets = resolve(
    process.env.ALTERWARD_SSH_SECRETS_DIR ??
      join(process.env.LOCALAPPDATA ?? '', 'FutureFlow', 'secrets'),
  );
  if (
    !lstatSync(secrets).isDirectory() ||
    lstatSync(secrets).isSymbolicLink() ||
    realpathSync(secrets).toLowerCase() !== secrets.toLowerCase()
  )
    throw Error('Original absolute secrets directory required');
  const key = join(secrets, 'contabo_alterward_ed25519'),
    pin = join(secrets, 'contabo_known_hosts'),
    identityPath = join(secrets, 'alterward_backup_identity.txt');
  for (const file of [key, pin, identityPath]) {
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
      throw Error('Protected original files required');
  }
  const host = readFileSync(pin, 'utf8').trim().split(/\s+/)[0]!;
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))
    throw Error('Pinned host required');
  const ssh = [
    '-i',
    key,
    '-o',
    `UserKnownHostsFile="${pin.replaceAll('\\', '/')}"`,
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=10',
    `root@${host}`,
  ];
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const sourceHashes: Record<string, string> = {};
  for (const path of [
    'scripts/ops/contabo-managed-recovery.py',
    'scripts/ops/contabo-backup.py',
    'scripts/supabase-managed-recovery.mts',
    'scripts/lib/private-report.ts',
    'pnpm-lock.yaml',
  ]) {
    const bytes = regular(path);
    if (!bytes.equals(execFileSync('git', ['show', `${commit}:${path}`])))
      throw Error('Committed operator sources required');
    sourceHashes[path] = digest(bytes);
  }
  for (const dir of ['packages/database/dist', 'packages/core/dist']) {
    const files = (readdirSync(dir, { recursive: true }) as string[])
      .filter((p) => p.endsWith('.js'))
      .sort();
    sourceHashes[dir] = digest(
      files.map((p) => p + ':' + digest(regular(join(dir, p)))).join('\n'),
    );
  }
  const script = regular('scripts/ops/contabo-managed-recovery.py');
  const library = regular('scripts/ops/contabo-backup.py');
  const sourceText = script.toString().replaceAll('\r\n', '\n');
  const securitySql = sourceText.match(/SECURITY_SQL = r"""([\s\S]*?)"""/)?.[1];
  if (!securitySql || !/^[a-f0-9]{40}$/.test(commit))
    throw Error('Reviewed source required');
  const loader = `python3 -c 'import sys,json,base64,types,io; p=json.load(sys.stdin); m=types.ModuleType("alterward_backup");exec(compile(base64.b64decode(p["library"]),"<backup-library>","exec"),m.__dict__);sys.modules["alterward_backup"]=m;sys.stdin=io.StringIO(json.dumps(p["request"]));exec(compile(base64.b64decode(p["script"]),"<managed-recovery>","exec"),{"__name__":"__main__"})'`;
  async function remote(request: object) {
    const pending = invoke('ssh', [...ssh, loader], {
      encoding: 'utf8',
      timeout: 400000,
      maxBuffer: 2 * 1024 * 1024,
    });
    pending.child.stdin!.end(
      JSON.stringify({
        request,
        library: library.toString('base64'),
        script: script.toString('base64'),
      }),
    );
    try {
      const response = JSON.parse((await pending).stdout);
      if (!response.ok) throw Error('Remote did not accept proof');
      return response.result;
    } catch (error) {
      try {
        const response = JSON.parse(
          (error as { stdout?: string }).stdout ?? '',
        );
        if (/^[a-z-]{1,60}$/.test(response.phase)) phase = response.phase;
      } catch {
        /* No raw SSH, managed-data or provider output. */
      }
      throw Error('Remote managed recovery stopped');
    }
  }
  const identity = regular(identityPath).toString();
  const projectUrl = new URL(process.env.SUPABASE_URL ?? '');
  if (
    projectUrl.protocol !== 'https:' ||
    !/^[a-z]{20}\.supabase\.co$/.test(projectUrl.hostname)
  )
    throw Error('Hosted project binding required');
  const projectRef = projectUrl.hostname.split('.')[0]!;
  const projectBinding = digest(projectRef);
  let manifest;
  if (restoreOnly) {
    const pointer = JSON.parse(
      regular(join(dir, 'managed-backup-latest.json')).toString(),
    );
    if (!/^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$/.test(pointer.runId))
      throw Error('Exact original run pointer required');
    manifest = JSON.parse(
      regular(join(dir, `${pointer.runId}-manifest.json`)).toString(),
    );
  } else {
    phase = 'source-project-binding';
    const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
    if (
      projectUrl.protocol !== 'https:' ||
      !/^[a-z]{20}\.supabase\.co$/.test(projectUrl.hostname) ||
      !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
      databaseUrl.search ||
      process.env.DATABASE_SSL !== 'true' ||
      !process.env.DATABASE_SSL_CA_FILE ||
      !(
        databaseUrl.hostname === `db.${projectRef}.supabase.co` ||
        (databaseUrl.hostname.endsWith('.pooler.supabase.com') &&
          decodeURIComponent(databaseUrl.username) === `postgres.${projectRef}`)
      )
    )
      throw Error('Matching project and verified TLS required');
    const ca = readFileSync(process.env.DATABASE_SSL_CA_FILE, 'utf8');
    phase = 'original-encryption-recipient';
    const recipientPending = invoke(
      'ssh',
      [...ssh, '/root/alterward-ops/tools/usr/bin/age-keygen -y'],
      { encoding: 'utf8', timeout: 30000 },
    );
    recipientPending.child.stdin!.end(identity);
    const recipient = (await recipientPending).stdout.trim();
    if (!/^age1[0-9a-z]{58}$/.test(recipient))
      throw Error('Original public recipient unavailable');
    const db = connectDatabase(process.env.DATABASE_URL!, true);
    try {
      phase = 'read-only-snapshot';
      manifest = await db.transaction(async (tx) => {
        await tx.query(
          'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
        );
        await tx.query("SET LOCAL timezone='UTC'");
        await tx.query('SET LOCAL search_path=public');
        await tx.query("SET LOCAL statement_timeout='15s'");
        const [version] = await tx.query<{ server_version_num: string }>(
          'SHOW server_version_num',
        );
        if (Math.floor(Number(version!.server_version_num) / 10000) !== 17)
          throw Error('Expected PostgreSQL 17');
        const [snapshot] = await tx.query<{ id: string }>(
          'SELECT pg_export_snapshot() AS id',
        );
        const names = await tx.query<{ schema: string; name: string }>(
          "SELECT schemaname AS schema,tablename AS name FROM pg_tables WHERE schemaname IN ('auth','storage') ORDER BY schemaname,tablename",
        );
        phase = 'managed-catalog-review';
        const excludedRaw = sourceText.match(
          /EXCLUDED_AUTH_DATA = (\{[\s\S]*?\})\n/,
        )?.[1];
        if (!excludedRaw) throw Error('Fixed ephemeral table catalog missing');
        const excluded = new Set(
          [...excludedRaw.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!),
        );
        const knownRaw = sourceText.match(
          /KNOWN_AUTH_TABLES = (\{[\s\S]*?\})\n/,
        )?.[1];
        if (!knownRaw) throw Error('Fixed managed table allowlist missing');
        const known = new Set(
          [...knownRaw.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!),
        );
        function fixedSet(name: string) {
          const raw = sourceText.match(
            new RegExp(`${name} = (\\{[\\s\\S]*?\\})\\n`),
          )?.[1];
          if (!raw) throw Error('Reviewed managed allowlist required');
          return new Set([...raw.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!));
        }
        const storage = fixedSet('KNOWN_STORAGE_TABLES');
        const excludedStorage = fixedSet('EXCLUDED_STORAGE_DATA');
        if (
          names.some(
            (t) => !(t.schema === 'auth' ? known : storage).has(t.name),
          )
        )
          throw Error('New managed tables require privacy review');
        const columns = await tx.query<{
          column_name: string;
          is_generated: string;
          data_type: string;
        }>(
          "SELECT column_name,is_generated,data_type FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' ORDER BY ordinal_position",
        );
        const userColumns = fixedSet('KNOWN_AUTH_USER_COLUMNS');
        if (
          columns.length !== userColumns.size ||
          columns.some(
            (c) =>
              !userColumns.has(c.column_name) ||
              c.is_generated !==
                (c.column_name === 'confirmed_at' ? 'ALWAYS' : 'NEVER'),
          )
        )
          throw Error('Changed Auth columns require privacy review');
        const tokenColumns = columns
          .filter((c) => c.column_name.includes('token'))
          .map((c) => c.column_name);
        if (
          columns.some(
            (c) =>
              tokenColumns.includes(c.column_name) &&
              !['text', 'character varying', 'character'].includes(c.data_type),
          )
        )
          throw Error('New Auth token type requires review');
        const cleared = [...tokenColumns, 'email_change', 'phone_change'];
        const overrides = cleared
          .map((c) => `'${c}',CASE WHEN u."${c}" IS NULL THEN NULL ELSE '' END`)
          .join(',');
        const sanitizedSql = `SELECT to_jsonb(u)||jsonb_build_object(${overrides},'email_change_confirm_status',0) AS row FROM auth.users u ORDER BY u.id`;
        const sanitizedAuthUsers = (
          await tx.query<{ row: Record<string, unknown> }>(sanitizedSql)
        ).map((r) => r.row);
        const tables = [];
        for (const table of names) {
          if (!/^[a-z_][a-z0-9_]{0,62}$/.test(table.name))
            throw Error('Unexpected managed table name');
          const excludedTable =
            table.schema === 'auth'
              ? excluded.has(table.name)
              : excludedStorage.has(table.name);
          const query = excludedTable
            ? "SELECT 0::int AS count,md5('') AS digest"
            : table.schema === 'auth' && table.name === 'users'
              ? `SELECT count(*)::int AS count,md5(coalesce(string_agg(md5(row::text),'' ORDER BY md5(row::text)),'')) AS digest FROM (${sanitizedSql}) sanitized`
              : `SELECT count(*)::int AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS digest FROM "${table.schema}"."${table.name}" t`;
          const [row] = await tx.query(query);
          tables.push({ ...table, ...row });
        }
        const [security] = await tx.query<{ digest: string }>(securitySql);
        const roles = await tx.query<{ rolname: string }>(
          'SELECT rolname FROM pg_roles ORDER BY rolname',
        );
        const [publicTables] = await tx.query<{ tables: number; rls: number }>(
          "SELECT count(*)::int AS tables,count(*) FILTER(WHERE c.relrowsecurity)::int AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p')",
        );
        const catalog = {
          scope: 'auth-storage-data-and-public-security',
          tables,
          roles: roles.map((r) => r.rolname),
          publicSecurityDigest: security!.digest,
          publicTables: publicTables!.tables,
          publicRlsTables: publicTables!.rls,
          authUserInsertColumns: columns
            .filter((c) => c.is_generated === 'NEVER')
            .map((c) => c.column_name),
          clearedAuthUserTokenColumns: tokenColumns,
          sanitizedAuthUsers,
        };
        const runId =
          new Date()
            .toISOString()
            .replaceAll('-', '')
            .replaceAll(':', '')
            .slice(0, 15) +
          'Z-' +
          randomBytes(4).toString('hex');
        phase = 'encrypted-managed-capture';
        return remote({
          action: 'capture',
          runId,
          commit,
          image,
          sourceHashes,
          projectRef,
          snapshot: snapshot!.id,
          recipient,
          ca,
          catalog,
          database: {
            host: databaseUrl.hostname,
            port: databaseUrl.port || '5432',
            name: decodeURIComponent(databaseUrl.pathname.slice(1)),
            user: decodeURIComponent(databaseUrl.username),
            password: decodeURIComponent(databaseUrl.password),
          },
        });
      });
    } finally {
      await db.close();
    }
  }
  if (
    manifest.schemaVersion !== 'alterward-managed-recovery-2' ||
    manifest.projectBinding !== projectBinding ||
    !/^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$/.test(manifest.runId) ||
    Object.keys(manifest.encryptedFiles).sort().join(',') !==
      'catalog.json.age,managed.dump.age'
  )
    throw Error('Exact manifest required');
  phase = 'offsite-cipher-copy';
  const files: Record<string, string> = {};
  for (const [name, expected] of Object.entries(manifest.encryptedFiles) as [
    string,
    { sha256: string; bytes: number },
  ][]) {
    const file = join(dir, `${manifest.runId}-${name}`);
    const cipher = restoreOnly
      ? regular(file)
      : (
          await invoke(
            'ssh',
            [
              ...ssh,
              `cat /root/alterward-ops/managed-recovery/${manifest.runId}/${name}`,
            ],
            {
              encoding: 'buffer',
              timeout: 60000,
              maxBuffer: 128 * 1024 * 1024,
            },
          )
        ).stdout;
    if (
      cipher.length !== expected.bytes ||
      createHash('sha256').update(cipher).digest('hex') !== expected.sha256
    )
      throw Error('Offsite cipher differs');
    if (!restoreOnly) writeFileSync(file, cipher, { mode: 0o600, flag: 'wx' });
    else {
      const info = lstatSync(file);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
        throw Error('Private cipher cannot be linked');
    }
    files[name] = cipher.toString('base64');
  }
  if (!restoreOnly) {
    writeFileSync(
      join(dir, `${manifest.runId}-manifest.json`),
      JSON.stringify(manifest, null, 2) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
    privateReportFile(dir, 'managed-backup-latest.json', {
      runId: manifest.runId,
    });
  }
  phase = 'isolated-managed-proof';
  const proof = await remote({
    action: 'rehearse',
    runId: manifest.runId,
    commit,
    image,
    sourceHashes,
    projectBinding,
    manifest,
    files,
    identity,
  });
  privateReportFile(dir, 'managed-restore-proof.json', {
    ...proof,
    capturedAt: new Date().toISOString(),
    operatorScriptSha256: createHash('sha256').update(script).digest('hex'),
  });
  console.log(JSON.stringify(proof));
}
main().catch(() => {
  console.error(
    `Managed recovery stopped safely (${phase}); no live restore, messages or activation.`,
  );
  process.exitCode = 1;
});
