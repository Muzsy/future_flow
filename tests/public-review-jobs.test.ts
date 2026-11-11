import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  PUBLIC_REVIEW_VERSION,
  publicReviewJobViewSchema,
} from '@future-flow/contracts';
import { DomainError, hash, preparePublicReviewInput } from '@future-flow/core';
import {
  Repository,
  LifeRepository,
  LifeJobRepository,
  PublicDraftRepository,
  PublicReviewRepository,
  PublicReviewJobRepository,
  DatabaseAiBudget,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { processPublicReviewJob } from '../apps/worker/src/public-review-processor';
import { setupFixture, lifeTestAi } from './life-fixtures';
import { reviewJobForPreview } from '../apps/web/lib/public-preview';

let engine: PGlite,
  db: Database,
  repo: Repository,
  app: INestApplication,
  closedApp: INestApplication,
  base: string,
  closedBase: string;
const users = new Set<string>();
const config = { enabled: true, daily: 5, projectUsd: 1, userUsd: 0.5 };
function adapter(
  client: Pick<PGlite, 'query' | 'transaction'>,
  nested = false,
): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await client.query<T>(sql, values)).rows,
    transaction: (run) =>
      nested
        ? run(adapter(client, true))
        : client.transaction((tx) =>
            run(adapter(tx as unknown as PGlite, true)),
          ),
  };
}
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await applyMigrations(engine);
  db = adapter(engine);
  repo = new Repository(db);
  const auth = {
    verify: async (value: string) => {
      if (users.has(value)) return { id: value };
      throw new DomainError('AUTH_INVALID_TOKEN', 'Invalid.', 401);
    },
    deleteUser: async () => {},
  };
  app = await createApp(repo, auth, undefined, undefined, undefined, config);
  closedApp = await createApp(repo, auth, undefined, undefined, undefined, {
    ...config,
    projectUsd: 0,
  });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  await closedApp.listen(0, '127.0.0.1');
  closedBase = await closedApp.getUrl();
});
afterAll(async () => {
  await app?.close();
  await closedApp?.close();
  await engine?.close();
});
async function fixture(locale: 'en' | 'hu' = 'en') {
  const user = randomUUID();
  users.add(user);
  await repo.ensureUser(user);
  await repo.acceptPrivacy(user);
  const lives = new LifeRepository(db),
    jobs = new LifeJobRepository(db),
    drafts = new PublicDraftRepository(db);
  const created = await lives.create(
    user,
    setupFixture(locale, 1),
    randomUUID(),
  );
  await processLifeJob((await jobs.claim())!, jobs, lifeTestAi);
  if (locale === 'hu')
    return { user, created, lives, drafts, preview: null!, request: null! };
  const workspace = await drafts.workspace(user, created.branchId);
  const preview = await drafts.prepare(
    user,
    created.branchId,
    workspace.source.sourceRevision,
    workspace.source.copy,
    randomUUID(),
  );
  const request = {
    snapshotHash: preview.snapshotHash,
    sourceRevision: preview.sourceRevision,
    policyVersion: PUBLIC_REVIEW_VERSION,
    acknowledged: true as const,
  };
  return { user, created, lives, drafts, preview, request };
}
const queues = (daily = 5) =>
  new PublicReviewJobRepository(db, { ...config, daily });
function testAi() {
  return {
    reviewPublicCopy: vi.fn(async (input) => {
      const output = { verdict: 'no_findings' as const, findings: [] };
      return {
        output,
        receipt: {
          task: 'public_review',
          promptVersion: 'isolated-test',
          locale: 'en' as const,
          model: 'isolated-no-provider',
          requestId: null,
          inputHash: hash(input),
          outputHash: hash(output),
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
        },
      };
    }),
  };
}
function http(
  user: string,
  id: string,
  body?: unknown,
  key = randomUUID(),
  origin = base,
) {
  return fetch(`${origin}/api/v2/public-previews/${id}/review-job`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${user}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
describe.sequential('explicit paid public-copy review queue', () => {
  it('deduplicates requests, claims once, completes once and reuses the result for free', async () => {
    const f = await fixture(),
      q = queues(),
      key = randomUUID();
    const one = await q.enqueue(f.user, f.preview.draftId, f.request, key);
    expect(await q.enqueue(f.user, f.preview.draftId, f.request, key)).toEqual(
      one,
    );
    expect(
      (await q.enqueue(f.user, f.preview.draftId, f.request, randomUUID())).job
        ?.id,
    ).toBe(one.job?.id);
    const job = (await q.claim())!;
    expect(await q.claim()).toBeNull();
    const ai = testAi();
    await processPublicReviewJob(job, q, ai);
    expect(ai.reviewPublicCopy).toHaveBeenCalledTimes(1);
    expect((await q.get(f.user, f.preview.draftId)).job?.status).toBe(
      'completed',
    );
    expect(
      (await q.enqueue(f.user, f.preview.draftId, f.request, key)).job?.status,
    ).toBe('completed');
    expect(await q.claim()).toBeNull();
    expect(
      (await new PublicReviewRepository(db).get(f.user, f.preview.draftId))
        .publicationApproved,
    ).toBe(false);
    expect(
      (await repo.exportAccount(f.user)).aw_public_review_jobs,
    ).toHaveLength(1);
    expect(await f.lives.detail(f.user, f.created.branchId)).toMatchObject({
      branch: { revision: f.request.sourceRevision },
    });
    expect(() =>
      reviewJobForPreview({ ...one, snapshotHash: 'a'.repeat(64) }, f.preview),
    ).toThrow();
    expect(() =>
      publicReviewJobViewSchema.parse({ ...one, publicationApproved: true }),
    ).toThrow();
  });
  it('requires explicit consent, own current binding, unique request key and authenticated HTTP', async () => {
    const f = await fixture(),
      other = await fixture(),
      key = randomUUID();
    expect(
      (
        await fetch(
          `${base}/api/v2/public-previews/${f.preview.draftId}/review-job`,
        )
      ).status,
    ).toBe(401);
    expect((await http(other.user, f.preview.draftId, f.request)).status).toBe(
      404,
    );
    expect(
      (
        await http(f.user, f.preview.draftId, {
          ...f.request,
          acknowledged: false,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await http(f.user, f.preview.draftId, {
          ...f.request,
          sourceRevision: 999,
        })
      ).status,
    ).toBe(409);
    expect(
      (await http(f.user, f.preview.draftId, { ...f.request, approval: true }))
        .status,
    ).toBe(422);
    expect(
      (await http(f.user, f.preview.draftId, f.request, 'short')).status,
    ).toBe(400);
    const response = await http(f.user, f.preview.draftId, f.request, key);
    expect(response.status).toBe(201);
    expect(
      publicReviewJobViewSchema.parse(await response.json()).job?.status,
    ).toBe('queued');
    expect(
      (await http(f.user, f.preview.draftId)).headers.get('cache-control'),
    ).toBe('no-store');
    const next = await f.drafts.prepare(
      f.user,
      f.created.branchId,
      f.request.sourceRevision,
      {
        ...(await f.drafts.workspace(f.user, f.created.branchId)).source.copy,
        title: 'Another copy',
      },
    );
    await expect(
      queues().enqueue(
        f.user,
        next.draftId,
        { ...f.request, snapshotHash: next.snapshotHash },
        key,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await repo.markDeleting(f.user);
  });
  it('has one pending job per owner and a rolling daily quota; neither denial creates a review', async () => {
    const f = await fixture(),
      q = queues(1);
    await q.enqueue(f.user, f.preview.draftId, f.request, randomUUID());
    const copy = (await f.drafts.workspace(f.user, f.created.branchId)).source
      .copy;
    const next = await f.drafts.prepare(
      f.user,
      f.created.branchId,
      f.request.sourceRevision,
      { ...copy, title: 'A second copy' },
    );
    await expect(
      q.enqueue(
        f.user,
        next.draftId,
        { ...f.request, snapshotHash: next.snapshotHash },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_REVIEW_LIMIT' });
    const job = (await q.claim())!;
    await q.fail(job);
    await expect(
      q.enqueue(
        f.user,
        next.draftId,
        { ...f.request, snapshotHash: next.snapshotHash },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_REVIEW_LIMIT' });
    expect(
      (await new PublicReviewRepository(db).get(f.user, next.draftId)).status,
    ).toBe('not_started');
    expect(await q.claim()).toBeNull();
  });
  it('zero allowance and a disabled flag prevent enqueue and spending even after a positive DB limit', async () => {
    const f = await fixture(),
      q = new PublicReviewJobRepository(db, { ...config, projectUsd: 0 });
    expect((await q.get(f.user, f.preview.draftId)).enabled).toBe(false);
    expect(
      (
        await http(
          f.user,
          f.preview.draftId,
          f.request,
          randomUUID(),
          closedBase,
        )
      ).status,
    ).toBe(503);
    await expect(
      new PublicReviewJobRepository(db, { ...config, enabled: false }).enqueue(
        f.user,
        f.preview.draftId,
        f.request,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_REVIEW_DISABLED' });
    const budget = new DatabaseAiBudget(db, f.user, randomUUID(), config);
    const reservation = await budget.reserve({
      model: 'gpt-6.1-sol',
      input: [],
      max_output_tokens: 100,
    });
    await budget.settle(reservation, { input_tokens: 20, output_tokens: 10 });
    const zero = new DatabaseAiBudget(db, f.user, randomUUID(), {
      projectUsd: 0,
      userUsd: 0,
    });
    await expect(
      zero.reserve({ model: 'gpt-6.1-sol', input: [], max_output_tokens: 100 }),
    ).rejects.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
    expect(
      (await new PublicReviewRepository(db).get(f.user, f.preview.draftId))
        .status,
    ).toBe('not_started');
  });
  it('fails stale queued source without invoking the provider', async () => {
    const f = await fixture(),
      q = queues();
    await q.enqueue(f.user, f.preview.draftId, f.request, randomUUID());
    const detail = await f.lives.detail(f.user, f.created.branchId),
      decision = detail.periods[0]!.candidate.events.at(-1)!.decision!;
    await f.lives.choose(
      f.user,
      f.created.branchId,
      f.request.sourceRevision,
      decision.id,
      decision.options[0]!.id,
      randomUUID(),
    );
    expect(await q.claim()).toBeNull();
    expect(
      await db.query(
        'SELECT status FROM aw_public_review_jobs WHERE user_id=$1',
        [f.user],
      ),
    ).toEqual([{ status: 'failed' }]);
  });
  it('marks an expired running lease failed without provider retry and refuses late completion', async () => {
    const f = await fixture(),
      q = queues();
    await q.enqueue(f.user, f.preview.draftId, f.request, randomUUID());
    const job = (await q.claim())!;
    await db.query(
      "UPDATE aw_public_review_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",
      [job.id],
    );
    expect(await q.claim()).toBeNull();
    expect((await q.get(f.user, f.preview.draftId)).job?.status).toBe('failed');
    const ai = testAi();
    await expect(processPublicReviewJob(job, q, ai)).rejects.toMatchObject({
      code: 'JOB_LEASE_LOST',
    });
    expect(ai.reviewPublicCopy).not.toHaveBeenCalled();
    expect(
      (await q.enqueue(f.user, f.preview.draftId, f.request, randomUUID())).job
        ?.status,
    ).toBe('failed');
    expect(await q.claim()).toBeNull();
  });
  it('discards an expired queued preview before a provider can be called', async () => {
    const f = await fixture(),
      q = queues(),
      draftId = randomUUID(),
      reviewId = randomUUID();
    // Isolated clock fixture: production expiry/binding is immutable.
    await db.query(
      "INSERT INTO aw_publication_drafts(id,user_id,life_id,branch_id,source_revision,snapshot,snapshot_hash,scan_version,expires_at) SELECT $1,user_id,life_id,branch_id,source_revision,snapshot,snapshot_hash,scan_version,now()-interval '1 minute' FROM aw_publication_drafts WHERE id=$2",
      [draftId, f.preview.draftId],
    );
    await db.query(
      'INSERT INTO aw_public_draft_reviews(id,user_id,draft_id,source_revision,snapshot_hash,input_hash,policy_version) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        reviewId,
        f.user,
        draftId,
        f.preview.sourceRevision,
        f.preview.snapshotHash,
        hash(preparePublicReviewInput(f.preview.snapshot)),
        PUBLIC_REVIEW_VERSION,
      ],
    );
    await db.query(
      'INSERT INTO aw_public_review_jobs(id,user_id,draft_id,review_id) VALUES($1,$2,$3,$4)',
      [randomUUID(), f.user, draftId, reviewId],
    );
    expect(await q.claim()).toBeNull();
    expect(
      await db.query(
        'SELECT status FROM aw_public_review_jobs WHERE draft_id=$1',
        [draftId],
      ),
    ).toEqual([{ status: 'failed' }]);
    await expect(q.get(f.user, draftId)).rejects.toMatchObject({
      code: 'PUBLIC_PREVIEW_EXPIRED',
    });
  });
  it('cancels deletion and discards results after source mutation, with no automatic new attempt', async () => {
    const f = await fixture(),
      q = queues();
    await q.enqueue(f.user, f.preview.draftId, f.request, randomUUID());
    const job = (await q.claim())!;
    const ai = testAi(),
      result = await ai.reviewPublicCopy(await q.input(job));
    const detail = await f.lives.detail(f.user, f.created.branchId),
      decision = detail.periods[0]!.candidate.events.at(-1)!.decision!;
    await f.lives.choose(
      f.user,
      f.created.branchId,
      f.request.sourceRevision,
      decision.id,
      decision.options[0]!.id,
      randomUUID(),
    );
    await expect(
      q.complete(job, result.output, result.receipt),
    ).rejects.toMatchObject({ code: 'LIFE_REVISION_CONFLICT' });
    await q.fail(job);
    const deleted = await fixture();
    await q.enqueue(
      deleted.user,
      deleted.preview.draftId,
      deleted.request,
      randomUUID(),
    );
    const lost = (await q.claim())!;
    await repo.markDeleting(deleted.user);
    await expect(q.heartbeat(lost)).rejects.toMatchObject({
      code: 'JOB_LEASE_LOST',
    });
    await expect(
      q.complete(lost, result.output, result.receipt),
    ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
    await repo.restoreActive(deleted.user);
    expect(
      (await q.get(deleted.user, deleted.preview.draftId)).job?.status,
    ).toBe('cancelled');
    await repo.deleteAccountData(deleted.user);
    expect(
      await db.query('SELECT id FROM aw_public_review_jobs WHERE user_id=$1', [
        deleted.user,
      ]),
    ).toEqual([]);
  });
  it('keeps Hungarian hidden and the new queue inaccessible to direct clients', async () => {
    const f = await fixture('hu');
    expect(
      (
        await fetch(
          `${base}/api/v2/branches/${f.created.branchId}/public-preview`,
          { headers: { Authorization: `Bearer ${f.user}` } },
        )
      ).status,
    ).toBe(404);
    const [rls] = await db.query<{ relrowsecurity: boolean }>(
      "SELECT relrowsecurity FROM pg_class WHERE relname='aw_public_review_jobs'",
    );
    expect(rls!.relrowsecurity).toBe(true);
    for (const role of ['anon', 'authenticated']) {
      const [rights] = await db.query<{ allowed: boolean }>(
        "SELECT has_table_privilege($1,'aw_public_review_jobs','SELECT') AS allowed",
        [role],
      );
      expect(rights!.allowed).toBe(false);
    }
  });
});
