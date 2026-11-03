import { TERMS_ACCEPTANCE_VERSION } from '@future-flow/contracts';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ServiceAccessRepository,
  connectDatabase,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';

// Real multi-connection PostgreSQL proof for the bounded open admission. It is
// skipped unless SERVICE_ADMISSION_PG_URL points at a DISPOSABLE local
// database whose name starts with ff_admission_test: the schema is dropped.
//   createdb ff_admission_test
//   SERVICE_ADMISSION_PG_URL=postgres://localhost/ff_admission_test \
//     pnpm vitest run tests/service-admission-postgres.test.ts
const url = process.env.SERVICE_ADMISSION_PG_URL ?? '';
const parsed = url ? new URL(url) : null;
const disposable =
  !!parsed &&
  ['localhost', '127.0.0.1', ''].includes(parsed.hostname) &&
  /^\/ff_admission_test/.test(parsed.pathname);
if (url && !disposable)
  throw Error(
    'SERVICE_ADMISSION_PG_URL must be a local ff_admission_test* database',
  );

describe.skipIf(!disposable)(
  'bounded open admission on real PostgreSQL connections',
  () => {
    // Several independent pools model several API/worker processes.
    const pools: Array<Database & { close(): Promise<void> }> = [];
    let admin: Database & { close(): Promise<void> };
    let operator: ServiceAccessRepository;
    const stores = () => pools.map((pool) => new ServiceAccessRepository(pool));

    beforeAll(async () => {
      admin = connectDatabase(url, false);
      await admin.query('DROP SCHEMA public CASCADE');
      await admin.query('CREATE SCHEMA public');
      await applyMigrations({ exec: (sql) => admin.query(sql) });
      for (let i = 0; i < 4; i++) pools.push(connectDatabase(url, false));
      operator = new ServiceAccessRepository(pools[0]!);
      await operator.replacePolicy(0, {
        mode: 'invitation',
        generationEnabled: true,
        checkoutEnabled: true,
      });
    }, 120000);
    afterAll(async () => {
      await Promise.all(pools.map((pool) => pool.close()));
      await admin?.close();
    });
    async function wave(capacity: number) {
      await admin.query('DELETE FROM ff_users');
      await admin.query(
        "UPDATE aw_service_policy SET mode='invitation',admission_capacity=0,admission_used=0,generation_enabled=true,checkout_enabled=true,reconcile_required=false,revision=revision+1",
      );
      const [row] = await admin.query<{ revision: number }>(
        'SELECT revision::int AS revision FROM aw_service_policy',
      );
      await operator.configureAdmission(row!.revision, {
        capacity,
        open: true,
      });
    }
    const counts = async () =>
      (
        await admin.query<{
          mode: string;
          used: number;
          capacity: number;
          admissions: number;
          roots: number;
          consents: number;
        }>(
          `SELECT p.mode,p.admission_used::int AS used,p.admission_capacity::int AS capacity,
             (SELECT count(*)::int FROM aw_service_admissions) AS admissions,
             (SELECT count(*)::int FROM ff_users) AS roots,
             (SELECT count(*)::int FROM ff_consents) AS consents
           FROM aw_service_policy p`,
        )
      )[0]!;
    beforeEach(() => wave(10));

    it('admits exactly the capacity out of many parallel registrations on separate connections', async () => {
      const users = Array.from({ length: 80 }, () => randomUUID());
      const available = stores();
      const outcomes = await Promise.all(
        users.map((id, i) =>
          available[i % available.length]!.admitOpenAccount(
            id,
            TERMS_ACCEPTANCE_VERSION,
          ),
        ),
      );
      expect(outcomes.filter((o) => o.status === 'admitted')).toHaveLength(10);
      expect(outcomes.filter((o) => o.status === 'closed')).toHaveLength(70);
      expect(
        outcomes
          .filter((o) => o.status === 'admitted')
          .map((o) => (o as { position: number }).position)
          .sort((a, b) => a - b),
      ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(await counts()).toEqual({
        mode: 'invitation',
        used: 10,
        capacity: 10,
        admissions: 10,
        roots: 10,
        consents: 20,
      });
      // Capacity 10: all ten are the first ten, exactly.
      const [flags] = await admin.query<{ n: number }>(
        'SELECT count(*) FILTER (WHERE launch_discount_eligible)::int AS n FROM aw_service_admissions',
      );
      expect(flags!.n).toBe(10);
    }, 60000);

    it('counts the same account once when it arrives on several connections at once', async () => {
      const id = randomUUID();
      const available = stores();
      const outcomes = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          available[i % available.length]!.admitOpenAccount(
            id,
            TERMS_ACCEPTANCE_VERSION,
          ),
        ),
      );
      expect(outcomes.filter((o) => o.status === 'admitted')).toHaveLength(1);
      expect(
        outcomes.filter((o) => o.status === 'already-admitted'),
      ).toHaveLength(11);
      expect(await counts()).toMatchObject({
        used: 1,
        admissions: 1,
        roots: 1,
      });
    }, 60000);

    it('survives operator pause/resume, revoke, deletion and wave changes racing with registrations without deadlock or overshoot', async () => {
      const first = Array.from({ length: 4 }, () => randomUUID());
      for (const id of first)
        await operator.admitOpenAccount(id, TERMS_ACCEPTANCE_VERSION);
      const newcomers = Array.from({ length: 40 }, () => randomUUID());
      const available = stores();
      const work: Array<Promise<unknown>> = newcomers.map((id, i) =>
        available[i % available.length]!.admitOpenAccount(
          id,
          TERMS_ACCEPTANCE_VERSION,
        ),
      );
      // Revoke and delete already admitted accounts while others register.
      work.push(
        operator.replaceAdmission(first[0], 1, 'revoked'),
        admin.query('DELETE FROM ff_users WHERE id=$1', [first[1]]),
      );
      // Operator pause/resume with a fresh revision each time; a conflict
      // (the automatic close moved the revision) is an acceptable outcome.
      for (let i = 0; i < 6; i++)
        work.push(
          (async () => {
            const state = await operator.admissionCapacity();
            await operator
              .replacePolicy(state!.revision, {
                mode: state!.mode,
                generationEnabled: i % 2 === 0,
                checkoutEnabled: true,
              })
              .catch((error: { code?: string }) => {
                if (
                  ![
                    'SERVICE_ACCESS_CONFLICT',
                    'SERVICE_ACCESS_INPUT_INVALID',
                  ].includes(error.code ?? '')
                )
                  throw error;
              });
          })(),
        );
      await Promise.all(work);
      const state = await counts();
      // 4 first admissions + at most 6 more; the deleted account's slot is
      // not given back, so used is exactly 10 and never above.
      expect(state.used).toBe(10);
      expect(state.mode).toBe('invitation');
      expect(state.admissions).toBeLessThanOrEqual(10);
      const [orphans] = await admin.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM aw_service_admissions a LEFT JOIN ff_users u ON u.id=a.user_id WHERE u.id IS NULL',
      );
      expect(orphans!.n).toBe(0);
    }, 90000);

    it('marks exactly ten accounts launch-discount eligible under a larger wave of parallel registrations', async () => {
      await wave(25);
      const available = stores();
      const outcomes = await Promise.all(
        Array.from({ length: 60 }, (_, i) =>
          available[i % available.length]!.admitOpenAccount(
            randomUUID(),
            TERMS_ACCEPTANCE_VERSION,
          ),
        ),
      );
      expect(outcomes.filter((o) => o.status === 'admitted')).toHaveLength(25);
      const rows = await admin.query<{ eligible: boolean }>(
        'SELECT launch_discount_eligible AS eligible FROM aw_service_admissions',
      );
      expect(rows).toHaveLength(25);
      expect(rows.filter((r) => r.eligible)).toHaveLength(10);
    }, 60000);

    it('does not admit anyone while a restore quarantine is set and reopens only through an explicit wave', async () => {
      await admin.query('UPDATE aw_service_policy SET reconcile_required=true');
      const outcomes = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          stores()[i % 4]!.admitOpenAccount(
            randomUUID(),
            TERMS_ACCEPTANCE_VERSION,
          ),
        ),
      );
      expect(outcomes.every((o) => o.status === 'unavailable')).toBe(true);
      expect(await counts()).toMatchObject({
        used: 0,
        admissions: 0,
        roots: 0,
      });
    }, 60000);

    it('holds the lock order of the operator batch: policy first, then roots', async () => {
      // Hold the policy row lock like the operator batch does, start
      // registrations that must queue behind it, then release.
      let release!: () => void;
      let locked!: () => void;
      const lockTaken = new Promise<void>((resolve) => (locked = resolve));
      const hold = new Promise<void>((resolve) => (release = resolve));
      const holder = pools[3]!.transaction(async (tx) => {
        await tx.query(
          'SELECT id FROM aw_service_policy WHERE id=1 FOR UPDATE',
        );
        locked();
        await hold;
      });
      await lockTaken;
      const pending = Array.from({ length: 6 }, () =>
        stores()[0]!.admitOpenAccount(randomUUID(), TERMS_ACCEPTANCE_VERSION),
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect((await counts()).admissions).toBe(0);
      release();
      await holder;
      const outcomes = await Promise.all(pending);
      expect(outcomes.every((o) => o.status === 'admitted')).toBe(true);
      expect((await counts()).used).toBe(6);
    }, 60000);
  },
);
