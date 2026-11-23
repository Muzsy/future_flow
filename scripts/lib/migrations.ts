import { readdirSync, readFileSync } from 'node:fs';

export async function applyMigrations(
  engine: { exec: (sql: string) => Promise<unknown> },
  through = Number.POSITIVE_INFINITY,
) {
  for (const file of readdirSync('database/migrations')
    .filter(
      (name) =>
        /^\d+.*\.sql$/.test(name) && Number.parseInt(name, 10) <= through,
    )
    .sort()) {
    await engine.exec(readFileSync(`database/migrations/${file}`, 'utf8'));
  }
}
