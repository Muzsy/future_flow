import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { hash } from '@future-flow/core';

const columnsSql =
  "SELECT table_name,column_name,data_type,udt_name,is_nullable,ordinal_position FROM information_schema.columns WHERE table_schema='public' AND table_name<>'ff_migrations' ORDER BY table_name,ordinal_position";

const db = new PGlite();
const files = readdirSync('database/migrations')
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .sort();

for (const file of files) {
  if (file.startsWith('037_')) break;
  await db.exec(readFileSync(`database/migrations/${file}`, 'utf8'));
}
const before = await db.query(columnsSql);
console.log(
  JSON.stringify({ baselineColumns: before.rows.length, baselineDigest: hash(before.rows) }),
);

for (const file of files.filter((name) => name.startsWith('037_')))
  await db.exec(readFileSync(`database/migrations/${file}`, 'utf8'));
const after = await db.query(columnsSql);
console.log(
  JSON.stringify({ nextColumns: after.rows.length, nextDigest: hash(after.rows) }),
);
await db.close();
