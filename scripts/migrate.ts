import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { connectDatabase } from '@future-flow/database';
import { questionnaire } from '@future-flow/contracts';
import { hash } from '@future-flow/core';

async function main() {
  const db = connectDatabase(
    process.env.DATABASE_URL ?? '',
    process.env.DATABASE_SSL === 'true',
  );
  try {
    await db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(704203)');
      await tx.query(
        'CREATE TABLE IF NOT EXISTS ff_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
      );
      const applied = await tx.query<{ name: string; checksum: string }>(
        'SELECT name,checksum FROM ff_migrations',
      );
      for (const name of readdirSync(resolve('database/migrations'))
        .filter((file) => file.endsWith('.sql'))
        .sort()) {
        const text = readFileSync(
          resolve('database/migrations', name),
          'utf8',
        ).replace(/\r\n/g, '\n');
        const previous = applied.find((row) => row.name === name);
        if (previous) {
          if (previous.checksum !== hash(text))
            throw new Error(`Applied migration changed: ${name}`);
          continue;
        }
        await tx.query(text);
        await tx.query(
          'INSERT INTO ff_migrations(name,checksum) VALUES($1,$2)',
          [name, hash(text)],
        );
        console.log(`Applied ${name}`);
      }
      await tx.query(
        'INSERT INTO ff_questionnaires(version,definition,definition_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [
          questionnaire.version,
          JSON.stringify(questionnaire),
          hash(questionnaire),
        ],
      );
    });
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    'Migration failed. Check DATABASE_URL, TLS, and the migration history.',
  );
  process.exitCode = 1;
});
