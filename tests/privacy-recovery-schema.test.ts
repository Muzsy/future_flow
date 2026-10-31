import { randomUUID } from 'node:crypto';
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
      reviewedTables: 100,
      migrationLedgerPresent: false,
      reviewedColumns: 892,
      reviewedForeignKeys: 225,
    });
  });
  it('rejects an unclassified user-data table even outside aw/ff prefixes', async () => {
    await expect(
      changed(
        'CREATE TABLE hidden_personal_data(owner_id uuid REFERENCES ff_users(id),private_text text)',
      ),
    ).rejects.toThrow('table set');
    expect((await check()).reviewedTables).toBe(100); // Failed DDL transaction rolled back.
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
    expect((await check()).reviewedTables).toBe(100);
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
    expect((await check()).reviewedForeignKeys).toBe(225);
  });
  it('pins the billing tables: extra data, a missing account link and a missing table are all rejected', async () => {
    await expect(
      changed(
        'ALTER TABLE aw_billing_subscriptions ADD COLUMN customer_email text',
      ),
    ).rejects.toThrow('columns or foreign-key');
    await expect(
      changed(
        'ALTER TABLE aw_billing_subscriptions DROP CONSTRAINT aw_billing_subscriptions_user_id_fkey',
      ),
    ).rejects.toThrow('columns or foreign-key');
    await expect(changed('DROP TABLE aw_billing_events')).rejects.toThrow(
      'table set',
    );
    expect((await check()).reviewedForeignKeys).toBe(225);
  });
  it('keeps billing children on the same account as their parent', async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    const run = (sql: string) =>
      engine.transaction(async (tx) => {
        await tx.query('INSERT INTO ff_users(id) VALUES($1),($2)', [a, b]);
        await tx.query(
          "INSERT INTO aw_billing_subscriptions(subscription_id,user_id,customer_id,status,last_state_event_created) VALUES('sub_a',$1,'cus_a','active',1)",
          [a],
        );
        await tx.query(
          "INSERT INTO aw_billing_grants(key,subscription_id,user_id,cycle_index,amount,expires_at) VALUES('in_a','sub_a',$1,1,5,now())",
          [a],
        );
        await tx.query(sql, [b]);
        throw Error('rollback');
      });
    // A grant of another account's subscription, and a reservation that draws
    // on another account's grant, are both refused by the schema itself.
    await expect(
      run(
        "INSERT INTO aw_billing_grants(key,subscription_id,user_id,cycle_index,amount,expires_at) VALUES('in_x','sub_a',$1,1,5,now())",
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      run(
        "INSERT INTO aw_billing_reservations(user_id,key,bucket,grant_key,state) VALUES($1,'k1','paid','in_a','reserved')",
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      run(
        "INSERT INTO aw_billing_reservations(user_id,key,bucket,state) VALUES($1,'k1','taster','reserved')",
      ),
    ).rejects.toThrow('rollback');
  });
  it('permits only the optional three-column metadata ledger', async () => {
    await engine.exec(
      'CREATE TABLE ff_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    expect((await check()).migrationLedgerPresent).toBe(true);
    await expect(
      changed('ALTER TABLE ff_migrations ADD COLUMN hidden_personal_text text'),
    ).rejects.toThrow('migration ledger');
    expect((await check()).reviewedTables).toBe(100);
  });
});
