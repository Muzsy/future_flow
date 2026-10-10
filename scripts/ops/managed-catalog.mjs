// Runs inside the existing API container, using its existing verified TLS.
// The private catalog travels only through the parent's pipe and encryption.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { TLSSocket } from 'node:tls';

const { Client } = createRequire('/app/packages/database/package.json')('pg');
const policy = JSON.parse(process.argv[1]);
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true,
    ca: readFileSync(process.env.DATABASE_SSL_CA_FILE, 'utf8'),
  },
  connectionTimeoutMillis: 10000,
});
let watchdog;
try {
  await client.connect();
  const socket = client.connection.stream;
  const host = new URL(process.env.DATABASE_URL).hostname;
  if (
    !(socket instanceof TLSSocket) ||
    !socket.encrypted ||
    socket.authorized !== true ||
    !new X509Certificate(socket.getPeerCertificate().raw).checkHost(host)
  )
    throw Error('Verified TLS required');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout='15s'");
  await client.query("SET LOCAL timezone='UTC'");
  await client.query('SET LOCAL search_path=public');
  const query = async (sql) => (await client.query(sql)).rows;
  const [version] = await query('SHOW server_version_num');
  if (Math.floor(Number(version.server_version_num) / 10000) !== 17)
    throw Error('Reviewed database major required');
  const [snapshot] = await query('SELECT pg_export_snapshot() AS id');
  const names = await query(
    "SELECT schemaname AS schema,tablename AS name FROM pg_tables WHERE schemaname IN ('auth','storage') ORDER BY schemaname,tablename",
  );
  if (
    !names.length ||
    names.length > 1000 ||
    names.some(
      (t) =>
        !['auth', 'storage'].includes(t.schema) ||
        !/^[a-z_][a-z0-9_]{0,62}$/.test(t.name) ||
        !policy[t.schema === 'auth' ? 'knownAuth' : 'knownStorage'].includes(
          t.name,
        ),
    )
  )
    throw Error('New managed table requires review');
  const columns = await query(
    "SELECT column_name,is_generated,data_type FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' ORDER BY ordinal_position",
  );
  if (
    columns.length !== policy.userColumns.length ||
    columns.some(
      (c) =>
        !policy.userColumns.includes(c.column_name) ||
        c.is_generated !==
          (c.column_name === 'confirmed_at' ? 'ALWAYS' : 'NEVER'),
    )
  )
    throw Error('Changed Auth columns require review');
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
    throw Error('Changed token type requires review');
  const overrides = [...tokenColumns, 'email_change', 'phone_change']
    .map((c) => `'${c}',CASE WHEN u."${c}" IS NULL THEN NULL ELSE '' END`)
    .join(',');
  const sanitizedSql = `SELECT to_jsonb(u)||jsonb_build_object(${overrides},'email_change_confirm_status',0) AS row FROM auth.users u ORDER BY u.id`;
  const sanitizedAuthUsers = (await query(sanitizedSql)).map((r) => r.row);
  const tables = [];
  for (const table of names) {
    const excluded = policy[
      table.schema === 'auth' ? 'excludedAuth' : 'excludedStorage'
    ].includes(table.name);
    const sql = excluded
      ? "SELECT 0::int AS count,md5('') AS digest"
      : table.schema === 'auth' && table.name === 'users'
        ? `SELECT count(*)::int AS count,md5(coalesce(string_agg(md5(row::text),'' ORDER BY md5(row::text)),'')) AS digest FROM (${sanitizedSql}) sanitized`
        : `SELECT count(*)::int AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS digest FROM "${table.schema}"."${table.name}" t`;
    tables.push({ ...table, ...(await query(sql))[0] });
  }
  const [security] = await query(policy.securitySql);
  const roles = await query('SELECT rolname FROM pg_roles ORDER BY rolname');
  const [publicTables] = await query(
    "SELECT count(*)::int AS tables,count(*) FILTER(WHERE c.relrowsecurity)::int AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p')",
  );
  const catalog = {
    scope: 'auth-storage-data-and-public-security',
    tables,
    roles: roles.map((r) => r.rolname),
    publicSecurityDigest: security.digest,
    publicTables: publicTables.tables,
    publicRlsTables: publicTables.rls,
    authUserInsertColumns: columns
      .filter((c) => c.is_generated === 'NEVER')
      .map((c) => c.column_name),
    clearedAuthUserTokenColumns: tokenColumns,
    sanitizedAuthUsers,
  };
  const response = JSON.stringify({
    databaseTlsVerified: true,
    snapshot: snapshot.id,
    catalog,
  });
  if (Buffer.byteLength(response) > 16 * 1024 * 1024)
    throw Error('Private catalog capacity exceeded');
  // The transaction remains open until the original snapshot dump finishes.
  await new Promise((resolve, reject) => {
    watchdog = setTimeout(() => reject(Error('Snapshot expired')), 240000);
    process.stdin.once('data', (data) => {
      if (data.toString() === 'COMMIT\n') resolve();
      else reject(Error('Snapshot cancelled'));
    });
    process.stdin.once('end', () => reject(Error('Snapshot cancelled')));
    process.stdout.write(response + '\n');
  });
  await client.query('COMMIT');
} catch {
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  await client.end();
}
