import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { connectDatabase } from '../packages/database/dist/index.js';
import {
  privateReportDirectory,
  privateReportFile,
} from './lib/private-report.js';

// Manual backup/throwaway proof, never a live restore or a schedule installer.
const invoke = promisify(execFile);
const image =
  'sha256:589f742565e4f6d22149176b032974f55f8201a8a37b71ed587ec5c6902e689f';
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
  const secrets = join(process.env.LOCALAPPDATA ?? '', 'FutureFlow', 'secrets');
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
  const script = readFileSync('scripts/ops/contabo-managed-recovery.py');
  const tracked = execFileSync('git', [
    'show',
    `${commit}:scripts/ops/contabo-managed-recovery.py`,
  ]);
  if (!script.equals(tracked))
    throw Error('Committed operator source required');
  const securitySql = script
    .toString()
    .match(/SECURITY_SQL = r"""([\s\S]*?)"""/)?.[1];
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
        library: readFileSync('scripts/ops/contabo-backup.py').toString(
          'base64',
        ),
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
  const identity = readFileSync(identityPath, 'utf8');
  let manifest;
  if (restoreOnly) {
    manifest = JSON.parse(
      readFileSync(join(dir, 'managed-backup-manifest.json'), 'utf8'),
    );
  } else {
    phase = 'source-project-binding';
    const projectUrl = new URL(process.env.SUPABASE_URL ?? ''),
      databaseUrl = new URL(process.env.DATABASE_URL ?? '');
    const projectRef = projectUrl.hostname.split('.')[0]!;
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
        const tables = [];
        for (const table of names) {
          if (!/^[a-z_][a-z0-9_]{0,62}$/.test(table.name))
            throw Error('Unexpected managed table name');
          const [row] = await tx.query(
            `SELECT count(*)::int AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS digest FROM "${table.schema}"."${table.name}" t`,
          );
          tables.push({ ...table, ...row });
        }
        const [security] = await tx.query<{ digest: string }>(securitySql);
        const roles = await tx.query<{ rolname: string }>(
          'SELECT rolname FROM pg_roles ORDER BY rolname',
        );
        const catalog = {
          scope: 'auth-storage-data-and-public-security',
          tables,
          roles: roles.map((r) => r.rolname),
          publicSecurityDigest: security!.digest,
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
    privateReportFile(dir, 'managed-backup-manifest.json', manifest);
  }
  if (
    manifest.schemaVersion !== 'alterward-managed-recovery-1' ||
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
      ? readFileSync(file)
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
  phase = 'isolated-managed-proof';
  const proof = await remote({
    action: 'rehearse',
    runId: manifest.runId,
    commit,
    image,
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
