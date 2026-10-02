import { connectDatabase } from '@future-flow/database';
import { existsSync } from 'node:fs';

async function main() {
  console.log(
    `Database CA file: ${process.env.DATABASE_SSL_CA_FILE && existsSync(process.env.DATABASE_SSL_CA_FILE) ? 'present' : 'not configured or missing'}`,
  );
  const db = connectDatabase(
    process.env.DATABASE_URL ?? '',
    process.env.DATABASE_SSL === 'true',
  );
  try {
    await db.query('SELECT 1 AS connected');
    console.log('Database: connected, TLS certificate verified when enabled.');
    const tables = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND left(tablename,3)='ff_'",
    );
    console.log(`Application tables: ${tables[0]?.count ?? 0}`);
  } catch (error) {
    // Never log provider errors, URLs, passwords, or raw credential files.
    const code = (error as { code?: unknown }).code;
    console.error(
      `Database: failed (${typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? code : 'CONNECTION_FAILED'}).`,
    );
    process.exitCode = 1;
  } finally {
    await db.close();
  }
  const url = process.env.SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) {
    try {
      const response = await fetch(`${url}/auth/v1/settings`, {
        headers: { apikey: key },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Auth unavailable');
      const settings = (await response.json()) as {
        external?: { email?: boolean };
      };
      console.log(
        `Supabase Auth: reachable; email login ${settings.external?.email ? 'enabled' : 'disabled'}.`,
      );
    } catch {
      console.error('Supabase Auth: verification failed.');
      process.exitCode = 1;
    }
  } else {
    console.log('Supabase Auth: missing public configuration.');
    process.exitCode = 1;
  }
  console.log(
    `OpenAI key: ${process.env.OPENAI_API_KEY ? 'configured' : 'missing'}`,
  );
  console.log(
    `Supabase administrative key: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'configured' : 'missing'}`,
  );
}
main().catch(() => {
  console.error(
    'Infrastructure verification failed. Check the local environment.',
  );
  process.exitCode = 1;
});
