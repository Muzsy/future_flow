import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import {
  Repository,
  LifeRepository,
  LifeJobRepository,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { claimCatalogJob } from '../scripts/lib/closed-beta-catalog';
import { setupFixture } from './life-fixtures';

it('prevents an expired catalog lease from charging an ordinary worker or allowing user retry', async () => {
  const engine = new PGlite();
  function adapter(client: Pick<PGlite, 'query' | 'transaction'>): Database {
    return {
      query: async <T extends Record<string, unknown>>(
        sql: string,
        values: unknown[] = [],
      ) => (await client.query<T>(sql, values)).rows,
      transaction: (run) =>
        client.transaction((tx) => run(adapter(tx as unknown as PGlite))),
    };
  }
  try {
    await applyMigrations(engine);
    const db = adapter(engine),
      repo = new Repository(db),
      lives = new LifeRepository(db),
      jobs = new LifeJobRepository(db);
    const sourceOwner = randomUUID(),
      normalOwner = randomUUID();
    for (const owner of [sourceOwner, normalOwner]) {
      await repo.ensureUser(owner);
      await repo.acceptPrivacy(owner);
    }
    const created = await lives.create(
      sourceOwner,
      setupFixture('en'),
      randomUUID(),
    );
    const operator = await db.transaction((tx) =>
      claimCatalogJob(tx, sourceOwner, created.jobId, randomUUID()),
    );
    expect(operator.attempt).toBe(5);
    expect(operator.checkpoints.catalogOperatorLease).toBe(true);
    const normal = await lives.create(
      normalOwner,
      setupFixture('en'),
      randomUUID(),
    );
    await db.query(
      "UPDATE aw_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",
      [operator.id],
    );
    expect(await jobs.claim()).toBeNull();
    expect(
      (
        await db.query('SELECT status FROM aw_jobs WHERE id=$1', [operator.id])
      )[0]?.status,
    ).toBe('failed');
    await expect(
      lives.retry(sourceOwner, operator.id, 0, randomUUID()),
    ).rejects.toMatchObject({ code: 'LIFE_RETRY_UNAVAILABLE' });
    expect((await jobs.claim())?.id).toBe(normal.jobId);
    expect(
      (
        await db.query(
          'SELECT count(*)::int AS count FROM aw_budget_reservations',
        )
      )[0]?.count,
    ).toBe(0);
  } finally {
    await engine.close();
  }
}, 30000);
