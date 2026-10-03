import { connectDatabase, Repository } from '@future-flow/database';
import { SupabaseAuthProvider } from './auth';
import { createApp } from './app';

async function main() {
  const db = connectDatabase(
    process.env.DATABASE_URL ?? '',
    process.env.DATABASE_SSL === 'true',
  );
  const auth = new SupabaseAuthProvider(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      '',
  );
  const repo = new Repository(db, {
    daily: Number(process.env.GENERATION_DAILY_LIMIT ?? 10),
    concurrent: Number(process.env.GENERATION_CONCURRENT_LIMIT ?? 2),
  });
  await db.query('SELECT version FROM ff_questionnaires LIMIT 1');
  const app = await createApp(
    repo,
    auth,
    process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  );
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen(port, process.env.API_HOST ?? '127.0.0.1');
  const close = () => {
    void db.close();
  };
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
  console.log(`API listening on port ${port}`);
}
main().catch(() => {
  console.error(
    'API startup failed. Check the server environment and run database migrations.',
  );
  process.exitCode = 1;
});
