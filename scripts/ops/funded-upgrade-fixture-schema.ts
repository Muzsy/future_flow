// Fixture-only inverse of the purely additive 039 billing foundation, used by the
// synthetic Linux/root Docker fixture to put its disposable database back on the
// exact reviewed 038 catalog so the schema-039 generation can migrate it for real.
// It is reachable only through the fixture companion, which refuses to run
// without the explicit fixture marker and the fixed synthetic database.
import type { Database } from '@future-flow/database';

export const billingFoundationTables = [
  // Children first: grants and reservations point at the subscriptions.
  'aw_billing_events',
  'aw_billing_reservations',
  'aw_billing_grants',
  'aw_billing_subscriptions',
] as const;
export const billingFoundationMigration = '039_billing_foundation.sql';

export async function downgradeFixtureTo038(tx: Database) {
  const applied = await tx.query<{ name: string }>(
    'SELECT name FROM public.ff_migrations ORDER BY name',
  );
  if (
    applied.length !== 39 ||
    applied.at(-1)?.name !== billingFoundationMigration
  )
    throw Error('A fixture database at exactly schema 039 is required');
  for (const table of billingFoundationTables) {
    const [row] = await tx.query<{ populated: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM public.${table}) AS populated`,
    );
    if (row?.populated !== false)
      throw Error('Only an empty billing foundation may be removed');
    await tx.query(`DROP TABLE public.${table}`);
  }
  await tx.query('DELETE FROM public.ff_migrations WHERE name=$1', [
    billingFoundationMigration,
  ]);
}

// What the fixture asserts after the real migration: the billing foundation exists
// again, is empty and stays closed to the browser roles.
export async function billingFoundationState(tx: Database) {
  const rows = await tx.query<{
    name: string;
    rls: boolean;
    populated: boolean;
  }>(
    `SELECT c.relname::text AS name,c.relrowsecurity AS rls,false AS populated
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'aw_billing_%'
     ORDER BY c.relname`,
  );
  for (const row of rows)
    row.populated = (
      await tx.query<{ populated: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM public.${row.name}) AS populated`,
      )
    )[0]!.populated;
  return rows;
}
