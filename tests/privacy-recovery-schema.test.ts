import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { Database } from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { assertReviewedPrivacyRecoverySchema } from '../scripts/lib/privacy-recovery-schema';

let engine: PGlite;
function db(client: Pick<PGlite, 'query'>): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await client.query<T>(sql, values)).rows,
    transaction: (run) => run(db(client)),
  };
}
beforeAll(async () => {
  engine = new PGlite();
  await engine.waitReady;
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await applyMigrations(engine);
}, 60000);
afterAll(async () => {
  await engine?.close();
});
const check = () =>
  engine.transaction((tx) => assertReviewedPrivacyRecoverySchema(db(tx)));
const changed = (sql: string) =>
  engine.transaction(async (tx) => {
    await tx.exec(sql);
    return assertReviewedPrivacyRecoverySchema(db(tx));
  });
describe('reviewed schema before privacy capture/replay', () => {
  it('accepts the actual immutable migration baseline', async () => {
    expect(await check()).toEqual({
      reviewedTables: 96,
      migrationLedgerPresent: false,
      reviewedColumns: 855,
      reviewedForeignKeys: 219,
    });
  });
  it('rejects an unclassified user-data table even outside aw/ff prefixes', async () => {
    await expect(
      changed(
        'CREATE TABLE hidden_personal_data(owner_id uuid REFERENCES ff_users(id),private_text text)',
      ),
    ).rejects.toThrow('table set');
    expect((await check()).reviewedTables).toBe(96); // Failed DDL transaction rolled back.
  });
  it('rejects a catalog-shadowing view and materialized personal data', async () => {
    await expect(
      changed(
        "CREATE VIEW public.pg_tables AS SELECT schemaname,tablename FROM pg_catalog.pg_tables WHERE tablename<>'hidden_personal_data'",
      ),
    ).rejects.toThrow('table set');
    await expect(
      changed(
        'CREATE MATERIALIZED VIEW retained_user_data AS SELECT id,status FROM ff_users',
      ),
    ).rejects.toThrow('table set');
    expect((await check()).reviewedTables).toBe(96);
  });
  it('rejects new data on a known table and a changed deletion graph', async () => {
    await expect(
      changed(
        'ALTER TABLE aw_feedback ADD COLUMN unreviewed_personal_text text',
      ),
    ).rejects.toThrow('columns or foreign-key');
    await expect(
      changed(
        'ALTER TABLE aw_feedback DROP CONSTRAINT aw_feedback_user_id_fkey',
      ),
    ).rejects.toThrow('columns or foreign-key');
    expect((await check()).reviewedForeignKeys).toBe(219);
  });
  it('permits only the optional three-column metadata ledger', async () => {
    await engine.exec(
      'CREATE TABLE ff_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    expect((await check()).migrationLedgerPresent).toBe(true);
    await expect(
      changed('ALTER TABLE ff_migrations ADD COLUMN hidden_personal_text text'),
    ).rejects.toThrow('migration ledger');
    expect((await check()).reviewedTables).toBe(96);
  });
});
