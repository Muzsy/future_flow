import { readdirSync, readFileSync } from 'node:fs';

export const SERVICE_REGISTRY_MIGRATION = '040_service_access_registry.sql';

// An explicit reviewed source manifest, not a permissive prefix filter. Legacy
// callers may use 001–039 only after this complete040 source was verified.
export function reviewedMigrationManifest() {
  const names = readdirSync('database/migrations')
    .filter((n) => n.endsWith('.sql'))
    .sort();
  if (
    names.length !== 40 ||
    names[38] !== '039_billing_foundation.sql' ||
    names[39] !== SERVICE_REGISTRY_MIGRATION ||
    names.some(
      (name, index) =>
        !name.startsWith(String(index + 1).padStart(3, '0') + '_'),
    )
  )
    throw Error('Exactly reviewed 001–040 source manifest required');
  return names.map((name) => ({
    name,
    sql: readFileSync('database/migrations/' + name, 'utf8').replace(
      /\r\n/g,
      '\n',
    ),
  }));
}
