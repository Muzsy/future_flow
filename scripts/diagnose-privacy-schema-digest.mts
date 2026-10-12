import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

function hash(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, val]) => [key, normalize(val)]),
      );
    return item;
  };
  return createHash('sha256')
    .update(JSON.stringify(normalize(value)))
    .digest('hex');
}

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
  JSON.stringify({
    baselineColumns: before.rows.length,
    baselineDigest: hash(before.rows),
  }),
);

for (const file of files.filter((name) => name.startsWith('037_')))
  await db.exec(readFileSync(`database/migrations/${file}`, 'utf8'));
const after = await db.query(columnsSql);
console.log(
  JSON.stringify({
    nextColumns: after.rows.length,
    nextDigest: hash(after.rows),
  }),
);
await db.close();
