import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  Repository,
  LifeRepository,
  LifeJobRepository,
  DatabaseAiBudget,
  type Database,
} from '@future-flow/database';
import { DomainError, hash } from '@future-flow/core';
import { processLifeJob } from '../apps/worker/src/life-processor';
import {
  deleteAccount,
  recoverAccountDeletion,
  noAccountDeletionBilling,
} from '../apps/api/src/account-deletion';
import { setupFixture, lifeTestAi, periodFixture } from './life-fixtures';

let engine: PGlite,
  db: Database,
  repo: Repository,
  lives: LifeRepository,
  jobs: LifeJobRepository;
const userId = randomUUID(),
  otherId = randomUUID();
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
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await applyMigrations(engine);
  db = adapter(engine);
  repo = new Repository(db);
  lives = new LifeRepository(db, { daily: 100, concurrent: 10 });
  jobs = new LifeJobRepository(db);
  for (const id of [userId, otherId]) {
    await repo.ensureUser(id);
    await repo.acceptPrivacy(id);
  }
});
afterAll(async () => {
  await engine?.close();
});
async function finish() {
  const job = (await jobs.claim())!;
  expect(job).toBeTruthy();
  await processLifeJob(job, jobs, lifeTestAi);
  return job;
}
describe.sequential('durable period life loop', () => {
  it('stores incomplete drafts, detects stale revisions and requires consent', async () => {
    const s = setupFixture();
    s.goal.description = '';
    expect(await lives.saveDraft(userId, 0, s)).toEqual({ revision: 1 });
    await expect(lives.saveDraft(userId, 0, s)).rejects.toMatchObject({
      code: 'LIFE_REVISION_CONFLICT',
    });
    expect((await lives.draft(userId)).payload).toEqual(s);
    await expect(lives.create(userId, s, 'invalid-goal')).rejects.toThrow();
    const noConsent = randomUUID();
    await repo.ensureUser(noConsent);
    await expect(lives.saveDraft(noConsent, 0, s)).rejects.toMatchObject({
      code: 'PRIVACY_ACKNOWLEDGEMENT_REQUIRED',
    });
  });
  it.each(Array.from({ length: 20 }, (_, i) => i))(
    'continues synthetic case %i through three periods without rewriting history',
    async (caseNo) => {
      const owner = randomUUID();
      await repo.ensureUser(owner);
      await repo.acceptPrivacy(owner);
      const setup = setupFixture(caseNo % 2 ? 'hu' : 'en', caseNo),
        key = `create-case-${caseNo}`;
      const created = await lives.create(owner, setup, key);
      expect(await lives.create(owner, setup, key)).toEqual(created);
      await expect(
        lives.create(owner, { ...setup, context: 'changed' }, key),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
      let firstHash: string | undefined;
      for (let periodNo = 0; periodNo < 3; periodNo++) {
        const job = await finish();
        expect(job.branch_id).toBe(created.branchId);
        expect(job.payload.input.locale).toBe(setup.locale);
        const detail = await lives.detail(owner, created.branchId);
        expect(detail.periods).toHaveLength(periodNo + 1);
        if (!firstHash) firstHash = hash(detail.periods[0]);
        else expect(hash(detail.periods[0])).toBe(firstHash);
        const b = detail.branch,
          d = b.pending_decision!;
        await expect(
          lives.continue(
            owner,
            b.id,
            b.revision,
            `pending-${caseNo}-${periodNo}`,
          ),
        ).rejects.toMatchObject({ code: 'LIFE_PENDING_DECISION' });
        await expect(
          lives.choose(
            otherId,
            b.id,
            b.revision,
            d.id,
            d.options[0]!.id,
            'foreign-choice',
          ),
        ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
        const option = d.options[(caseNo + periodNo) % 2]!,
          choiceKey = `choice-${caseNo}-${periodNo}`;
        const chosen = await lives.choose(
          owner,
          b.id,
          b.revision,
          d.id,
          option.id,
          choiceKey,
        );
        expect(
          await lives.choose(
            owner,
            b.id,
            b.revision,
            d.id,
            option.id,
            choiceKey,
          ),
        ).toEqual(chosen);
        await expect(
          lives.choose(
            owner,
            b.id,
            b.revision,
            d.id,
            option.id,
            `stale-${choiceKey}`,
          ),
        ).rejects.toMatchObject({ code: 'LIFE_REVISION_CONFLICT' });
        const after = await lives.branch(owner, b.id);
        expect(after.pending_decision).toBeNull();
        expect(after.revision).toBe((periodNo + 1) * 2);
        if (periodNo === 2) expect(after.state.ownedAssets).toEqual([]);
        if (periodNo < 2) {
          const queued = await lives.continue(
            owner,
            b.id,
            after.revision,
            `continue-${caseNo}-${periodNo}`,
          );
          expect(queued.branchId).toBe(created.branchId);
          expect(
            await lives.continue(
              owner,
              b.id,
              after.revision,
              `continue-${caseNo}-${periodNo}`,
            ),
          ).toEqual(queued);
        }
      }
      const metrics = await db.query(
        'SELECT kind FROM aw_metrics WHERE user_id=$1',
        [owner],
      );
      expect(
        metrics.filter((m) => m.kind === 'continuation_completed'),
      ).toHaveLength(2);
    },
  );
  it('forks an earlier decision separately and preserves parent canon/head', async () => {
    const created = await lives.create(
      userId,
      setupFixture(),
      'fork-source-create',
    );
    await finish();
    const first = await lives.detail(userId, created.branchId),
      d = first.branch.pending_decision!;
    await lives.choose(
      userId,
      created.branchId,
      first.branch.revision,
      d.id,
      d.options[0]!.id,
      'fork-source-choice',
    );
    await lives.continue(userId, created.branchId, 2, 'fork-source-continue');
    await finish();
    const parent = await lives.detail(userId, created.branchId),
      before = hash({
        branch: parent.branch,
        periods: parent.periods,
        choices: parent.choices,
      });
    const fork = await lives.fork(
      userId,
      created.branchId,
      String(parent.periods[0]!.id),
      parent.branch.revision,
      d.options[1]!.id,
      'historical-fork-001',
    );
    expect(fork.branchId).not.toBe(created.branchId);
    const unchanged = await lives.detail(userId, created.branchId);
    expect(
      hash({
        branch: unchanged.branch,
        periods: unchanged.periods,
        choices: unchanged.choices,
      }),
    ).toBe(before);
    await finish();
    const child = await lives.detail(userId, fork.branchId);
    expect(child.periods).toHaveLength(2);
    expect(child.periods[0]!.inherited).toBe(true);
    expect(child.branch.state.ownedAssets).toHaveLength(1);
    await expect(
      db.query('UPDATE aw_periods SET canon_hash=$2 WHERE id=$1', [
        parent.periods[0]!.id,
        'changed',
      ]),
    ).rejects.toThrow('immutable');
    await expect(
      db.query(
        'INSERT INTO aw_history(user_id,life_id,branch_id,period_id,position) VALUES($1,$2,$3,$4,9)',
        [otherId, created.lifeId, fork.branchId, parent.periods[0]!.id],
      ),
    ).rejects.toThrow();
  });
  it('rejects expired/stolen leases and resumes canon after narrator failure', async () => {
    const created = await lives.create(
      otherId,
      setupFixture(),
      'resume-source-create',
    );
    const job = (await jobs.claim())!;
    const period = vi.fn(lifeTestAi.period),
      chapter = vi
        .fn()
        .mockRejectedValue(
          new DomainError('AI_PROVIDER_FAILED', 'Test interruption.'),
        );
    await expect(
      processLifeJob(job, jobs, {
        ...lifeTestAi,
        period,
        periodChapter: chapter,
      }),
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_FAILED' });
    await jobs.fail(
      job,
      new DomainError('AI_PROVIDER_FAILED', 'Test interruption.'),
    );
    expect(
      (await lives.branch(otherId, created.branchId)).state.effectiveAt,
    ).toBe(job.payload.startDate);
    await lives.retry(otherId, job.id, 0, 'retry-after-narrator');
    const resumed = (await jobs.claim())!;
    await processLifeJob(resumed, jobs, { ...lifeTestAi, period });
    expect(period).toHaveBeenCalledTimes(1);
    await expect(
      jobs.complete(
        job,
        periodFixture(job.payload),
        { title: 'test', body: 'test', eventIds: [], decisionId: randomUUID() },
        [],
      ),
    ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
    const next = await lives.create(
      otherId,
      setupFixture(),
      'lease-source-create',
    );
    const expired = (await jobs.claim())!;
    await db.query(
      "UPDATE aw_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",
      [expired.id],
    );
    await expect(jobs.checkpoint(expired, 'OLD', {})).rejects.toMatchObject({
      code: 'JOB_LEASE_LOST',
    });
    const reclaimed = (await jobs.claim())!;
    expect(reclaimed.id).toBe(expired.id);
    expect(reclaimed.lease_token).not.toBe(expired.lease_token);
    await expect(jobs.heartbeat(expired)).rejects.toMatchObject({
      code: 'JOB_LEASE_LOST',
    });
    await processLifeJob(reclaimed, jobs, lifeTestAi);
    expect((await lives.branch(otherId, next.branchId)).revision).toBe(1);
  });
  it('repairs only the rejected chapter, with one automatic repair maximum', async () => {
    await lives.create(userId, setupFixture(), 'repair-source-create');
    const job = (await jobs.claim())!;
    const period = vi.fn(lifeTestAi.period),
      chapter = vi.fn(lifeTestAi.periodChapter),
      checker = vi
        .fn()
        .mockResolvedValueOnce({
          output: {
            valid: false,
            issues: [
              { chapterNo: 1, reason: 'Invented job outcome after decision.' },
            ],
          },
          receipt: (
            await lifeTestAi.checkPeriodChapter(
              {
                locale: 'en',
                identity: job.payload.input.identity,
                goals: [],
                events: [],
              },
              {
                title: 'test',
                body: 'test',
                eventIds: [],
                decisionId: randomUUID(),
              },
            )
          ).receipt,
        })
        .mockImplementation(lifeTestAi.checkPeriodChapter);
    await processLifeJob(job, jobs, {
      period,
      periodChapter: chapter,
      checkPeriodChapter: checker,
    });
    expect(period).toHaveBeenCalledTimes(1);
    expect(chapter).toHaveBeenCalledTimes(2);
    expect(chapter.mock.calls[1]![1]).toContain('Invented job');
  });
  it('exports v2 data, cancels workers during deletion and erases the complete graph', async () => {
    const owner = randomUUID();
    await repo.ensureUser(owner);
    await repo.acceptPrivacy(owner);
    const created = await lives.create(
      owner,
      setupFixture(),
      'delete-life-source',
    );
    const job = (await jobs.claim())!;
    const exported = await repo.exportAccount(owner);
    expect(exported.aw_lives).toHaveLength(1);
    await repo.markDeleting(owner);
    await expect(jobs.checkpoint(job, 'DELETED', {})).rejects.toMatchObject({
      code: 'JOB_LEASE_LOST',
    });
    await repo.deleteAccountData(owner);
    expect(
      await db.query('SELECT id FROM aw_lives WHERE id=$1', [created.lifeId]),
    ).toEqual([]);
    expect(
      await db.query('SELECT id FROM aw_jobs WHERE user_id=$1', [owner]),
    ).toEqual([]);
  });
});
describe.sequential('account deletion recovery and minimal metrics', () => {
  it('records only allowed interaction data once and enforces branch ownership', async () => {
    const branch = (await lives.list(userId))[0]!;
    const input = {
      eventId: randomUUID(),
      sessionId: randomUUID(),
      branchId: branch.root_branch_id,
      kind: 'continuation_clicked',
    };
    await lives.interaction(userId, input);
    await lives.interaction(userId, input);
    expect(
      await db.query('SELECT kind FROM aw_interactions WHERE id=$1', [
        input.eventId,
      ]),
    ).toHaveLength(1);
    await expect(
      lives.interaction(otherId, { ...input, eventId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    await expect(
      lives.interaction(userId, { ...input, prompt: 'private content' }),
    ).rejects.toThrow();
  });
  it('recovers Auth success followed by a database failure without resurrecting jobs', async () => {
    const owner = randomUUID();
    await repo.ensureUser(owner);
    await repo.acceptPrivacy(owner);
    await lives.create(owner, setupFixture(), 'recovery-database-failure');
    const deletion = vi
      .spyOn(repo, 'deleteAccountData')
      .mockRejectedValueOnce(new Error('Synthetic database interruption.'));
    const auth = {
      verify: async () => ({ id: owner }),
      deleteUser: vi.fn(async () => {}),
      userExists: vi.fn(async () => false),
    };
    await expect(
      deleteAccount(repo, auth, owner, noAccountDeletionBilling),
    ).rejects.toThrow('Synthetic');
    expect(
      (
        await db.query(
          'SELECT status FROM aw_account_deletions WHERE user_id=$1',
          [owner],
        )
      )[0]!.status,
    ).toBe('auth_deleted');
    await recoverAccountDeletion(repo, auth, owner, noAccountDeletionBilling);
    expect(auth.deleteUser).toHaveBeenCalledTimes(1);
    expect(
      await db.query('SELECT id FROM ff_users WHERE id=$1', [owner]),
    ).toEqual([]);
    deletion.mockRestore();
  });
  it('retains a rejected Auth deletion until recovery can finish it', async () => {
    const owner = randomUUID();
    await repo.ensureUser(owner);
    await repo.acceptPrivacy(owner);
    const created = await lives.create(
      owner,
      setupFixture(),
      'recovery-auth-rejection',
    );
    const failed = {
      verify: async () => ({ id: owner }),
      deleteUser: async () => {
        throw new DomainError(
          'PRIVACY_AUTH_DELETE_FAILED',
          'Synthetic Auth failure.',
        );
      },
      userExists: async () => true,
    };
    await expect(
      deleteAccount(repo, failed, owner, noAccountDeletionBilling),
    ).rejects.toMatchObject({
      code: 'PRIVACY_AUTH_DELETE_FAILED',
    });
    expect(
      (await db.query('SELECT status FROM ff_users WHERE id=$1', [owner]))[0]!
        .status,
    ).toBe('deleting');
    expect(
      (
        await db.query('SELECT status FROM aw_jobs WHERE branch_id=$1', [
          created.branchId,
        ])
      )[0]!.status,
    ).toBe('cancelled');
    expect(
      (
        await db.query(
          'SELECT status FROM aw_account_deletions WHERE user_id=$1',
          [owner],
        )
      )[0]!.status,
    ).toBe('awaiting_auth');
    const successfulRetry = vi.fn(async () => {});
    await recoverAccountDeletion(
      repo,
      { ...failed, deleteUser: successfulRetry },
      owner,
      noAccountDeletionBilling,
    );
    expect(successfulRetry).toHaveBeenCalledOnce();
    expect(
      await db.query('SELECT id FROM ff_users WHERE id=$1', [owner]),
    ).toEqual([]);
  });
  it('keeps the marker when a timed-out Auth deletion finishes after the existence check', async () => {
    const owner = randomUUID();
    await repo.ensureUser(owner);
    let authExists = true;
    const auth = {
      verify: async () => ({ id: owner }),
      deleteUser: vi.fn(async () => {
        throw new Error('Synthetic timeout.');
      }),
      userExists: vi.fn(async () => {
        const observed = authExists;
        authExists = false; // Auth completes immediately after the point-in-time check.
        return observed;
      }),
    };
    await expect(
      deleteAccount(repo, auth, owner, noAccountDeletionBilling),
    ).rejects.toThrow('Synthetic timeout');
    expect(
      (await db.query('SELECT status FROM ff_users WHERE id=$1', [owner]))[0]!
        .status,
    ).toBe('deleting');
    expect(
      (
        await db.query(
          'SELECT status FROM aw_account_deletions WHERE user_id=$1',
          [owner],
        )
      )[0]!.status,
    ).toBe('awaiting_auth');
    await recoverAccountDeletion(repo, auth, owner, noAccountDeletionBilling);
    expect(auth.deleteUser).toHaveBeenCalledOnce();
    expect(
      await db.query('SELECT id FROM ff_users WHERE id=$1', [owner]),
    ).toEqual([]);
  });
  it('retains an uncertain Auth deletion if the existence check also fails', async () => {
    const owner = randomUUID();
    await repo.ensureUser(owner);
    const failed = {
      verify: async () => ({ id: owner }),
      deleteUser: async () => {
        throw new Error('Synthetic timeout.');
      },
    };
    await expect(
      deleteAccount(
        repo,
        {
          ...failed,
          userExists: async () => {
            throw new Error('Unknown network state.');
          },
        },
        owner,
        noAccountDeletionBilling,
      ),
    ).rejects.toThrow();
    expect(
      (await db.query('SELECT status FROM ff_users WHERE id=$1', [owner]))[0]!
        .status,
    ).toBe('deleting');
    await recoverAccountDeletion(
      repo,
      { ...failed, userExists: async () => false },
      owner,
      noAccountDeletionBilling,
    );
    expect(
      await db.query('SELECT id FROM ff_users WHERE id=$1', [owner]),
    ).toEqual([]);
  });
});
describe.sequential('concurrent application budget reservations', () => {
  it('reserves atomically, holds unknown usage, and settles receipts once', async () => {
    const guard = new DatabaseAiBudget(db, userId, randomUUID(), {
      projectUsd: 0.04,
      userUsd: 0.04,
      initialProjectSpentUsd: 0.001,
    });
    const parameters = {
      model: 'gpt-6.1-sol',
      max_output_tokens: 1000,
      input: [{ role: 'user', content: 'Synthetic' }],
    };
    const results = await Promise.allSettled([
      guard.reserve(parameters),
      guard.reserve(parameters),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const id = (
      results.find(
        (r) => r.status === 'fulfilled',
      ) as PromiseFulfilledResult<string>
    ).value;
    const before = await db.query(
      "SELECT accounted_micro FROM aw_budget_accounts WHERE id='project'",
    );
    await guard.settle(id, null);
    expect(
      await db.query(
        "SELECT accounted_micro FROM aw_budget_accounts WHERE id='project'",
      ),
    ).toEqual(before);
    await guard.settle(id, { input_tokens: 100, output_tokens: 20 });
    const after = await db.query(
      "SELECT accounted_micro FROM aw_budget_accounts WHERE id='project'",
    );
    expect(Number(after[0]!.accounted_micro)).toBe(1450);
    await guard.settle(id, { input_tokens: 100, output_tokens: 20 });
    await guard.settle(id, null);
    expect(
      await db.query(
        "SELECT accounted_micro FROM aw_budget_accounts WHERE id='project'",
      ),
    ).toEqual(after);
    await expect(
      guard.reserve({ ...parameters, model: 'unpriced' }),
    ).rejects.toMatchObject({ code: 'AI_BUDGET_CONFIG' });
  });
  it('disables spending with a zero configured allowance despite retained positive database limits', async () => {
    const before = await db.query(
      'SELECT * FROM aw_budget_accounts ORDER BY id',
    );
    expect(before.some((account) => Number(account.limit_micro) > 0)).toBe(
      true,
    );
    const reservations = await db.query(
      'SELECT id FROM aw_budget_reservations ORDER BY id',
    );
    for (const config of [
      { projectUsd: 0, userUsd: 1 },
      { projectUsd: 1, userUsd: 0 },
    ]) {
      const guard = new DatabaseAiBudget(db, userId, randomUUID(), config);
      await expect(
        guard.reserve({
          model: 'gpt-6.1-sol',
          max_output_tokens: 1000,
          input: [],
        }),
      ).rejects.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
    }
    expect(
      await db.query('SELECT * FROM aw_budget_accounts ORDER BY id'),
    ).toEqual(before);
    expect(
      await db.query('SELECT id FROM aw_budget_reservations ORDER BY id'),
    ).toEqual(reservations);
  });
});
