import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import {
  LifeRepository,
  LifeJobRepository,
  Repository,
  SharedContextRepository,
  type Database,
} from '@future-flow/database';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { lifeTestAi, setupFixture } from './life-fixtures';

// Local test configuration only; never a production invitation key or provider.
export const testInviteSecret = '1'.repeat(64);
export function sharedAdapter(
  client: Pick<PGlite, 'query' | 'transaction'>,
): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await client.query<T>(sql, values)).rows,
    transaction: (run) =>
      client.transaction((tx) => run(sharedAdapter(tx as unknown as PGlite))),
  };
}
export async function sharedParticipant(
  db: Database,
  tier: 'free' | 'explorer' | 'connected' | 'world' = 'explorer',
  name = 'Shared alias',
  goalDescription?: string,
) {
  const id = randomUUID(),
    repo = new Repository(db),
    lives = new LifeRepository(db),
    shared = new SharedContextRepository(db, testInviteSecret);
  await repo.ensureUser(id);
  await repo.acceptPrivacy(id);
  if (tier !== 'free')
    await db.query(
      "INSERT INTO aw_user_entitlements(user_id,tier,source) VALUES($1,$2,'isolated-test')",
      [id, tier],
    );
  await shared.saveSocialProfile(id, {
    handle: 'test_' + id.replace(/-/g, '').slice(0, 12),
    displayName: name,
    discoverability: 'private',
  });
  const input = setupFixture();
  input.goal.description = goalDescription ?? 'Private goal never shared';
  if (goalDescription) input.goal.category = 'personal_growth';
  input.employment.employerLabel = 'Private employer never shared';
  input.finance = { currency: 'EUR', monthlyIncome: 2123, liquidFunds: 4765 };
  const created = await lives.create(id, input, randomUUID());
  const jobs = new LifeJobRepository(db),
    job = await jobs.claim();
  if (!job || job.id !== created.jobId)
    throw new Error('Unexpected fixture job');
  await processLifeJob(job, jobs, lifeTestAi);
  const branch = await lives.branch(id, created.branchId);
  return {
    id,
    branchId: created.branchId,
    lifeId: created.lifeId,
    revision: branch.revision,
    date: branch.state.effectiveAt,
  };
}
