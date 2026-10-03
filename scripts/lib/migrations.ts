import { readdirSync, readFileSync } from 'node:fs';

export async function applyMigrations(engine: {
  exec: (sql: string) => Promise<unknown>;
}) {
  for (const file of readdirSync('database/migrations')
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort()) {
    await engine.exec(readFileSync(`database/migrations/${file}`, 'utf8'));
  }
}
