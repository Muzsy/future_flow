import { readdirSync, readFileSync } from 'node:fs';

export const SERVICE_REGISTRY_MIGRATION = '040_service_access_registry.sql';
export const POLITICAL_START_HISTORY_MIGRATION =
  '041_political_start_history.sql';

// An explicit reviewed source manifest, not a permissive prefix filter. Legacy
// callers may use 001–039 only after this complete040 source was verified.
export function reviewedMigrationManifest(through: 40 | 41 = 40) {
  const names = readdirSync('database/migrations')
    .filter((n) => n.endsWith('.sql'))
    .sort();
  if (
    (names.length !== 40 &&
      !(
        names.length === 41 && names[40] === POLITICAL_START_HISTORY_MIGRATION
      )) ||
    names.length < through ||
    names[38] !== '039_billing_foundation.sql' ||
    names[39] !== SERVICE_REGISTRY_MIGRATION ||
    names.some(
      (name, index) =>
        !name.startsWith(String(index + 1).padStart(3, '0') + '_'),
    )
  )
    throw Error(`Exactly reviewed 001–0${through} source manifest required`);
  return names.slice(0, through).map((name) => ({
    name,
    sql: readFileSync('database/migrations/' + name, 'utf8').replace(
      /\r\n/g,
      '\n',
    ),
  }));
}
