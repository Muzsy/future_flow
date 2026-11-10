import { TERMS_ACCEPTANCE_VERSION } from '@future-flow/contracts';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { referralChaptersAvailable, referralGrantKey } from '@future-flow/core';
import {
  ServiceAccessRepository,
  admitReferredAccount,
  billingTx,
  connectDatabase,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';

// Real multi-connection PostgreSQL proof for the subscriber referral: exactly
// one redemption per inviter under concurrency, and no deadlock between a
// redemption and a billing write (refund/dispute) of the same inviter. Skipped
// unless SERVICE_ADMISSION_PG_URL points at a DISPOSABLE local database whose
// name starts with ff_admission_test. It works in its own database
// (ff_admission_test_referral, created and dropped here, so it can run beside
// the other Postgres test files, which reset the base database's schema):
//   createdb ff_admission_test
//   SERVICE_ADMISSION_PG_URL=postgres://localhost/ff_admission_test \
//     pnpm vitest run tests/subscriber-referral-postgres.test.ts
const baseUrl = process.env.SERVICE_ADMISSION_PG_URL ?? '';
const parsed = baseUrl ? new URL(baseUrl) : null;
const DATABASE = 'ff_admission_test_referral';
const url = parsed
  ? ((own) => ((own.pathname = '/' + DATABASE), own.toString()))(
      new URL(baseUrl),
    )
  : '';
const disposable =
  !!parsed &&
  ['localhost', '127.0.0.1', ''].includes(parsed.hostname) &&
  /^\/ff_admission_test/.test(parsed.pathname);
if (baseUrl && !disposable)
  throw Error(
    'SERVICE_ADMISSION_PG_URL must be a local ff_admission_test* database',
  );

describe.skipIf(!disposable)(
  'subscriber referral on real PostgreSQL connections',
  () => {
    const pools: Array<Database & { close(): Promise<void> }> = [];
    let admin: Database & { close(): Promise<void> };
    let server: Database & { close(): Promise<void> };
    const NOW = new Date();
    const day = 86_400_000;
    const pool = (i: number) => pools[i % pools.length]!;

    beforeAll(async () => {
      server = connectDatabase(baseUrl, false);
      await server.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
      await server.query(`CREATE DATABASE ${DATABASE}`);
      admin = connectDatabase(url, false);
      await admin.query('DROP SCHEMA public CASCADE');
      await admin.query('CREATE SCHEMA public');
      await applyMigrations({ exec: (sql) => admin.query(sql) });
      for (let i = 0; i < 4; i++) pools.push(connectDatabase(url, false));
      await new ServiceAccessRepository(pools[0]!).replacePolicy(0, {
        mode: 'invitation',
        generationEnabled: true,
        checkoutEnabled: true,
      });
      await admin.query(
        'UPDATE aw_service_policy SET reconcile_required=false,revision=revision+1',
      );
    }, 120000);
    afterAll(async () => {
      await Promise.all(pools.map((p) => p.close()));
      await admin?.close();
      await server?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
      await server?.close();
    });
    async function subscriber() {
      const id = randomUUID();
      await admin.query('INSERT INTO ff_users(id) VALUES($1)', [id]);
      await admin.query(
        "INSERT INTO aw_service_admissions(user_id,revision,state) VALUES($1,1,'active')",
        [id],
      );
      await admin.query(
        "INSERT INTO aw_billing_subscriptions(subscription_id,user_id,customer_id,status,period_start,period_end,last_state_event_created,paid_invoice_ids) VALUES($1,$2,$3,'active',$4,$5,1,ARRAY[$6]::text[])",
        [
          'sub_' + id,
          id,
          'cus_' + id,
          new Date(NOW.getTime() - day),
          new Date(NOW.getTime() + 29 * day),
          'in_' + id,
        ],
      );
      await admin.query(
        'INSERT INTO aw_billing_grants(key,subscription_id,user_id,cycle_index,amount,expires_at) VALUES($1,$2,$3,1,5,$4)',
        ['in_' + id, 'sub_' + id, id, new Date(NOW.getTime() + 29 * day)],
      );
      return id;
    }

    it('redeems exactly once when many invitees race on one link', async () => {
      const inviter = await subscriber();
      const friends = Array.from({ length: 8 }, () => randomUUID());
      const results = await Promise.all(
        friends.map((friend, i) =>
          admitReferredAccount(
            pool(i),
            friend,
            TERMS_ACCEPTANCE_VERSION,
            inviter,
            { now: NOW },
          ),
        ),
      );
      expect(results.filter((r) => r.status === 'admitted')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'invite-invalid')).toHaveLength(
        7,
      );
      const winner =
        friends[results.findIndex((r) => r.status === 'admitted')]!;
      const admitted = await admin.query<{ user_id: string }>(
        'SELECT user_id FROM aw_service_admissions WHERE user_id=ANY($1::uuid[])',
        [friends],
      );
      expect(admitted.map((r) => r.user_id)).toEqual([winner]);
      expect(
        await admin.query('SELECT 1 FROM ff_users WHERE id=ANY($1::uuid[])', [
          friends,
        ]),
      ).toHaveLength(1);
      expect(
        await admin.query('SELECT 1 FROM aw_billing_grants WHERE key=$1', [
          referralGrantKey(inviter),
        ]),
      ).toHaveLength(1);
      const [policy] = await admin.query<{ used: string }>(
        'SELECT admission_used AS used FROM aw_service_policy',
      );
      expect(Number(policy!.used)).toBe(0);
    });

    it('never deadlocks a redemption against a refund of the same inviter', async () => {
      for (let round = 0; round < 12; round++) {
        const inviter = await subscriber();
        const friend = randomUUID();
        // The refund/dispute path, in the store's own order: the inviter's
        // billing lock first, then the subscription row.
        const refund = pool(1).transaction(async (tx) => {
          await billingTx(tx).lockUser(inviter);
          await tx.query(
            "UPDATE aw_billing_subscriptions SET revoked='refund' WHERE subscription_id=$1",
            ['sub_' + inviter],
          );
        });
        const redeem = admitReferredAccount(
          pool(2),
          friend,
          TERMS_ACCEPTANCE_VERSION,
          inviter,
          { now: NOW },
        );
        const [, outcome] = await Promise.all([refund, redeem]);
        const ledger = await billingTx(admin).loadLedger(inviter);
        // Either the redemption won (a gift that the refund then closed) or the
        // refund won (the invite is refused): never a usable gift afterwards.
        expect(referralChaptersAvailable(ledger, NOW)).toBe(0);
        expect(['admitted', 'invite-invalid']).toContain(outcome.status);
        expect(
          await admin.query('SELECT 1 FROM ff_users WHERE id=$1', [friend]),
        ).toHaveLength(outcome.status === 'admitted' ? 1 : 0);
      }
    });
  },
);
