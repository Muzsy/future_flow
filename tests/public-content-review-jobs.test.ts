import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type OpenAIClient from 'openai';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PUBLIC_CONTENT_REVIEW_VERSION } from '@future-flow/contracts';
import {
  DomainError,
  hash,
  instantiateScenarioTemplate,
  preparePublicContentScanInput,
} from '@future-flow/core';
import {
  Repository,
  LifeRepository,
  LifeJobRepository,
  PublicDraftRepository,
  PublicForkCheckpointRepository,
  PublicContentRepository,
  PublicContentReviewJobRepository,
  PublicReviewJobRepository,
  DatabaseAiBudget,
  type Database,
} from '@future-flow/database';
import { OpenAiProvider } from '@future-flow/ai';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { processPublicContentReviewJob } from '../apps/worker/src/public-content-review-processor';
import { lifeTestAi } from './life-fixtures';
import { scenarioFixture } from './scenario-fixtures';
import { contentReviewForBundle } from '../apps/web/lib/public-content-review';

const OpenAI = createRequire(import.meta.url)('openai')
  .default as typeof import('openai').default;
let engine: PGlite,
  db: Database,
  repo: Repository,
  app: INestApplication,
  base: string;
const users = new Set<string>(),
  config = { enabled: true, daily: 5, projectUsd: 5, userUsd: 1 };
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
  app = await createApp(
    repo,
    {
      verify: async (token) => {
        if (users.has(token)) return { id: token };
        throw new DomainError('AUTH_INVALID_TOKEN', 'Invalid.', 401);
      },
      deleteUser: async () => {},
    },
    undefined,
    undefined,
    undefined,
    config,
    undefined,
    undefined,
    true,
    true,
    config,
  );
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  await engine?.close();
});
const queues = () => new PublicContentReviewJobRepository(db, config);
async function fixture() {
  const owner = randomUUID();
  users.add(owner);
  await repo.ensureUser(owner);
  await repo.acceptPrivacy(owner);
  const lives = new LifeRepository(db),
    created = await lives.createPrepared(
      owner,
      instantiateScenarioTemplate(scenarioFixture()),
      randomUUID(),
    ),
    jobs = new LifeJobRepository(db);
  await processLifeJob((await jobs.claim())!, jobs, lifeTestAi);
  const drafts = new PublicDraftRepository(db),
    workspace = await drafts.workspace(owner, created.branchId),
    preview = await drafts.prepare(
      owner,
      created.branchId,
      workspace.source.sourceRevision,
      workspace.source.copy,
      randomUUID(),
    ),
    forks = new PublicForkCheckpointRepository(db, true),
    [candidate] = await forks.candidates(owner, preview.draftId);
  const checkpoint = await forks.save(
      owner,
      preview.draftId,
      {
        snapshotHash: preview.snapshotHash,
        sourceRevision: preview.sourceRevision,
        checkpoint: candidate!.checkpoint,
      },
      randomUUID(),
    ),
    bundles = new PublicContentRepository(db, true);
  const bundle = await bundles.save(
    owner,
    preview.draftId,
    {
      snapshotHash: preview.snapshotHash,
      sourceRevision: preview.sourceRevision,
      selectedCheckpointIds: [checkpoint.checkpointId],
      acknowledged: true,
    },
    randomUUID(),
  );
  return {
    owner,
    lives,
    created,
    preview,
    bundle,
    bundles,
    request: {
      contentHash: bundle.contentHash,
      policyVersion: PUBLIC_CONTENT_REVIEW_VERSION,
      acknowledged: true,
    },
  };
}
function fakeAi(
  verdict:
    'no_findings' | 'review_required' | 'unable_to_assess' = 'no_findings',
) {
  return {
    reviewPublicContent: vi.fn(async (input) => {
      const field =
        input.fields.find(
          (f: { path: string }) =>
            f.path === 'checkpoints.0.identity.employment',
        ) ?? input.fields[0];
      const output = {
        policyVersion: PUBLIC_CONTENT_REVIEW_VERSION,
        scope: 'story_and_selected_checkpoints' as const,
        contentHash: hash(input.content),
        publicationApproved: false as const,
        verdict,
        findings:
          verdict === 'review_required'
            ? [
                {
                  fieldKey: field.key,
                  category: 'meaning_mismatch' as const,
                  action: 'manual_review' as const,
                },
              ]
            : [],
      };
      return {
        output,
        receipt: {
          task: 'public_content_review',
          promptVersion: 'public_content_review.v1.en',
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
const http = (owner: string, id: string, body?: unknown, key = randomUUID()) =>
  fetch(`${base}/api/v2/public-content-bundles/${id}/review-job`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${owner}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

describe.sequential('once-only full content review', () => {
  it('rejects oversized complete inputs without truncation or provider calls', async () => {
    const f = await fixture(),
      content = structuredClone(f.bundle.content),
      period = content.snapshot.periods[0]!;
    content.checkpoints = [];
    content.snapshot.periods = Array.from({ length: 8 }, (_, i) => ({
      ...structuredClone(period),
      key: `period-${i + 1}`,
      chapter: {
        ...period.chapter,
        body: 'A quiet fictional moment leaves room to think. '.repeat(210),
      },
      events: period.events.map((event, j) => ({
        ...event,
        key: `event-${i * 5 + j + 1}`,
      })),
      decision: {
        ...period.decision,
        key: `decision-${i + 1}`,
        selectedOptionKey: null,
        options: period.decision.options.map((option, j) => ({
          ...option,
          key: `option-${i * 4 + j + 1}`,
        })),
      },
    }));
    expect(() => preparePublicContentScanInput(content)).toThrowError(
      expect.objectContaining({ code: 'PUBLIC_CONTENT_REVIEW_LIMIT' }),
    );
    const parse = vi.fn(),
      ai = new OpenAiProvider(
        {
          apiKey: 'test',
          eventModel: 'test',
          storyModel: 'test',
          timeoutMs: 1000,
          maxOutputTokens: 12000,
        },
        { responses: { parse } } as unknown as OpenAIClient,
      );
    await expect(
      ai.reviewPublicContent({
        policyVersion: PUBLIC_CONTENT_REVIEW_VERSION,
        content,
        fields: [],
      }),
    ).rejects.toMatchObject({ code: 'PUBLIC_CONTENT_REVIEW_LIMIT' });
    expect(parse).not.toHaveBeenCalled();
  });
  it('binds the whole typed content, claims once, completes once and reuses with the feature disabled', async () => {
    const f = await fixture(),
      q = queues(),
      key = randomUUID(),
      one = await q.enqueue(f.owner, f.bundle.bundleId, f.request, key);
    expect(await q.enqueue(f.owner, f.bundle.bundleId, f.request, key)).toEqual(
      one,
    );
    expect(
      (await q.enqueue(f.owner, f.bundle.bundleId, f.request, randomUUID()))
        .job!.id,
    ).toBe(one.job!.id);
    const job = (await q.claim())!;
    expect(job.id).toBe(one.job!.id);
    expect(await q.claim()).toBeNull();
    await q.heartbeat(job);
    const ai = fakeAi();
    await processPublicContentReviewJob(job, q, ai);
    expect(ai.reviewPublicContent).toHaveBeenCalledTimes(1);
    const input = ai.reviewPublicContent.mock.calls[0]![0];
    expect(input.content).toEqual(f.bundle.content);
    expect(JSON.stringify(input)).not.toContain(f.owner);
    expect(JSON.stringify(input)).not.toContain(f.preview.snapshot.snapshotKey);
    const result = await q.get(f.owner, f.bundle.bundleId);
    expect(result.job!.status).toBe('completed');
    expect(result.report!.scope).toBe('story_and_selected_checkpoints');
    expect(result.publicationApproved).toBe(false);
    expect(await contentReviewForBundle(result, f.bundle)).toEqual(result);
    expect(
      (
        await new PublicContentReviewJobRepository(db).enqueue(
          f.owner,
          f.bundle.bundleId,
          f.request,
          key,
        )
      ).job!.id,
    ).toBe(job.id);
    await expect(
      processPublicContentReviewJob(job, q, ai),
    ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
    expect(ai.reviewPublicContent).toHaveBeenCalledTimes(1);
    await expect(
      db.query(
        'UPDATE aw_public_content_reviews SET report_hash=$1 WHERE id=$2',
        ['0'.repeat(64), job.id],
      ),
    ).rejects.toThrow();
  });
  it('never treats a text-only review as a full review, and shares daily/concurrent limits in both directions', async () => {
    const f = await fixture(),
      old = new PublicReviewJobRepository(db, config),
      request = {
        snapshotHash: f.preview.snapshotHash,
        sourceRevision: f.preview.sourceRevision,
        policyVersion: 'public-review-1' as const,
        acknowledged: true as const,
      };
    const text = await old.enqueue(
      f.owner,
      f.preview.draftId,
      request,
      randomUUID(),
    );
    expect((await queues().get(f.owner, f.bundle.bundleId)).job).toBeNull();
    await expect(
      queues().enqueue(f.owner, f.bundle.bundleId, f.request, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLIC_REVIEW_LIMIT' });
    const textJob = (await old.claim())!;
    expect(textJob.id).toBe(text.job!.id);
    await old.fail(textJob);
    await expect(
      new PublicContentReviewJobRepository(db, { ...config, daily: 1 }).enqueue(
        f.owner,
        f.bundle.bundleId,
        f.request,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_REVIEW_LIMIT' });
    await queues().enqueue(f.owner, f.bundle.bundleId, f.request, randomUUID());
    const another = await f.bundles.save(
      f.owner,
      f.preview.draftId,
      {
        snapshotHash: f.preview.snapshotHash,
        sourceRevision: f.preview.sourceRevision,
        selectedCheckpointIds: [],
        acknowledged: true,
      },
      randomUUID(),
    );
    await expect(
      queues().enqueue(
        f.owner,
        another.bundleId,
        { ...f.request, contentHash: another.contentHash },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_REVIEW_LIMIT' });
    const copy = structuredClone(
      (
        await new PublicDraftRepository(db).workspace(
          f.owner,
          f.created.branchId,
        )
      ).source.copy,
    );
    copy.title = 'Another copy for quota verification';
    const preview = await new PublicDraftRepository(db).prepare(
      f.owner,
      f.created.branchId,
      f.preview.sourceRevision,
      copy,
      randomUUID(),
    );
    await expect(
      old.enqueue(
        f.owner,
        preview.draftId,
        { ...request, snapshotHash: preview.snapshotHash },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_REVIEW_LIMIT' });
    await queues().fail((await queues().claim())!);
  });
  it('fails expired leases without reclaiming, rewriting or automatically paying again', async () => {
    const f = await fixture(),
      q = queues();
    await q.enqueue(f.owner, f.bundle.bundleId, f.request, randomUUID());
    const job = (await q.claim())!;
    await db.query(
      "UPDATE aw_public_content_reviews SET lease_until=now()-interval '1 second' WHERE id=$1",
      [job.id],
    );
    await expect(q.input(job)).rejects.toMatchObject({
      code: 'JOB_LEASE_LOST',
    });
    expect(await q.claim()).toBeNull();
    expect((await q.get(f.owner, f.bundle.bundleId)).job!.status).toBe(
      'failed',
    );
    expect(
      (await q.enqueue(f.owner, f.bundle.bundleId, f.request, randomUUID()))
        .job!.status,
    ).toBe('failed');
    await expect(
      db.query(
        "UPDATE aw_public_content_reviews SET status='queued',finished_at=NULL,failure_code=NULL WHERE id=$1",
        [job.id],
      ),
    ).rejects.toThrow();
  });
  it('rejects wrong owner, missing consent, mutated request, policy or extra approval fields before enqueue', async () => {
    const f = await fixture(),
      other = await fixture();
    expect((await http(other.owner, f.bundle.bundleId)).status).toBe(404);
    expect(
      (
        await fetch(
          `${base}/api/v2/public-content-bundles/${f.bundle.bundleId}/review-job`,
        )
      ).status,
    ).toBe(401);
    for (const request of [
      { ...f.request, contentHash: '0'.repeat(64) },
      { ...f.request, policyVersion: 'public-review-1' },
      { ...f.request, acknowledged: false },
      { ...f.request, publicationApproved: true },
    ])
      expect((await http(f.owner, f.bundle.bundleId, request)).ok).toBe(false);
    await db.query('DELETE FROM ff_consents WHERE user_id=$1', [f.owner]);
    await expect(
      queues().get(f.owner, f.bundle.bundleId),
    ).rejects.toMatchObject({ code: 'PRIVACY_ACKNOWLEDGEMENT_REQUIRED' });
    expect(
      (
        await db.query(
          'SELECT id FROM aw_public_content_reviews WHERE user_id=$1',
          [f.owner],
        )
      ).length,
    ).toBe(0);
  });
  it('requires explicit enablement and positive project/user budgets, rejecting key reuse on another bundle', async () => {
    const f = await fixture();
    for (const options of [
      { ...config, enabled: false },
      { ...config, projectUsd: 0 },
      { ...config, userUsd: 0 },
    ])
      await expect(
        new PublicContentReviewJobRepository(db, options).enqueue(
          f.owner,
          f.bundle.bundleId,
          f.request,
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'PUBLIC_CONTENT_REVIEW_DISABLED' });
    const key = randomUUID();
    await queues().enqueue(f.owner, f.bundle.bundleId, f.request, key);
    const another = await f.bundles.save(
      f.owner,
      f.preview.draftId,
      {
        snapshotHash: f.preview.snapshotHash,
        sourceRevision: f.preview.sourceRevision,
        selectedCheckpointIds: [],
        acknowledged: true,
      },
      randomUUID(),
    );
    await expect(
      queues().enqueue(
        f.owner,
        another.bundleId,
        { ...f.request, contentHash: another.contentHash },
        key,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await queues().fail((await queues().claim())!);
  });
  it('rejects source changes before the provider or before committing its result', async () => {
    for (const stage of ['before_claim', 'before_completion']) {
      const f = await fixture(),
        q = queues();
      await q.enqueue(f.owner, f.bundle.bundleId, f.request, randomUUID());
      const job = stage === 'before_completion' ? (await q.claim())! : null,
        result = job
          ? await fakeAi().reviewPublicContent(await q.input(job))
          : null;
      const branch = await f.lives.branch(f.owner, f.created.branchId),
        decision = branch.pending_decision!;
      await f.lives.choose(
        f.owner,
        branch.id,
        branch.revision,
        decision.id,
        decision.options[0]!.id,
        randomUUID(),
      );
      if (job) {
        await expect(
          q.complete(job, result!.output, result!.receipt),
        ).rejects.toMatchObject({ code: 'LIFE_REVISION_CONFLICT' });
        await q.fail(job);
      } else expect(await q.claim()).toBeNull();
      await expect(q.get(f.owner, f.bundle.bundleId)).rejects.toMatchObject({
        code: 'LIFE_REVISION_CONFLICT',
      });
      expect(
        (
          await db.query(
            'SELECT status FROM aw_public_content_reviews WHERE user_id=$1',
            [f.owner],
          )
        )[0]!.status,
      ).toBe('failed');
    }
  });
  it.each(['review_required', 'unable_to_assess'] as const)(
    'stores %s as a blocked result bound to checkpoint fields',
    async (verdict) => {
      const f = await fixture(),
        q = queues();
      await q.enqueue(f.owner, f.bundle.bundleId, f.request, randomUUID());
      await processPublicContentReviewJob(
        (await q.claim())!,
        q,
        fakeAi(verdict),
      );
      const result = await q.get(f.owner, f.bundle.bundleId);
      expect(result.report!.verdict).toBe(verdict);
      expect(result.publicationApproved).toBe(false);
      expect(await contentReviewForBundle(result, f.bundle)).toEqual(result);
    },
  );
  it('validates report scope, field categories, receipt hashes and immutable server authority', async () => {
    const f = await fixture(),
      q = queues();
    await q.enqueue(f.owner, f.bundle.bundleId, f.request, randomUUID());
    const job = (await q.claim())!,
      result = await fakeAi('review_required').reviewPublicContent(
        await q.input(job),
      ),
      finding = result.output.findings[0]!;
    for (const output of [
      { ...result.output, scope: 'text_only' },
      { ...result.output, contentHash: '0'.repeat(64) },
      { ...result.output, publicationApproved: true },
      {
        ...result.output,
        findings: [{ ...finding, fieldKey: 'field-999999' }],
      },
      {
        ...result.output,
        findings: [finding, { ...finding, action: 'generalize' }],
      },
      { ...result.output, verdict: 'no_findings' },
    ])
      await expect(
        q.complete(job, output, {
          ...result.receipt,
          outputHash: hash(output),
        }),
      ).rejects.toThrow();
    for (const receipt of [
      { ...result.receipt, task: 'public_review' },
      { ...result.receipt, promptVersion: 'unbound' },
      { ...result.receipt, inputHash: '0'.repeat(64) },
      { ...result.receipt, outputHash: '0'.repeat(64) },
    ])
      await expect(q.complete(job, result.output, receipt)).rejects.toThrow();
    await q.complete(job, result.output, result.receipt);
    const view = await q.get(f.owner, f.bundle.bundleId);
    for (const value of [
      { ...view, bundleId: randomUUID() },
      { ...view, fields: view.fields.slice(1) },
      { ...view, report: { ...view.report, contentHash: '0'.repeat(64) } },
      { ...view, job: { ...view.job, status: 'running' } },
      { ...view, report: null },
    ])
      await expect(contentReviewForBundle(value, f.bundle)).rejects.toThrow();
  });
  it('cancels running work on deletion, exports receipts and cascades all full review data', async () => {
    const f = await fixture(),
      q = queues();
    await q.enqueue(f.owner, f.bundle.bundleId, f.request, randomUUID());
    const job = (await q.claim())!;
    await repo.markDeleting(f.owner);
    await expect(q.input(job)).rejects.toMatchObject({
      code: 'JOB_LEASE_LOST',
    });
    await expect(q.heartbeat(job)).rejects.toMatchObject({
      code: 'JOB_LEASE_LOST',
    });
    await repo.restoreActive(f.owner);
    expect((await q.get(f.owner, f.bundle.bundleId)).job!.status).toBe(
      'cancelled',
    );
    expect(
      (await repo.exportAccount(f.owner)).aw_public_content_reviews.length,
    ).toBe(1);
    await repo.deleteAccountData(f.owner);
    expect(
      (
        await db.query(
          'SELECT id FROM aw_public_content_reviews WHERE user_id=$1',
          [f.owner],
        )
      ).length,
    ).toBe(0);
    const guard = await db.query(
      "SELECT relrowsecurity AS rls FROM pg_class WHERE oid='aw_public_content_reviews'::regclass",
    );
    expect(guard[0]!.rls).toBe(true);
    await db.query('SET ROLE authenticated');
    try {
      await expect(
        db.query('SELECT * FROM aw_public_content_reviews'),
      ).rejects.toThrow();
    } finally {
      await db.query('RESET ROLE');
    }
  });
  it('sends all typed fields to the configured checker, with one reservation and no transient retry', async () => {
    const f = await fixture(),
      input = preparePublicContentScanInput(f.bundle.content),
      parse = vi.fn().mockResolvedValue({
        status: 'completed',
        model: 'gpt-6.1-sol',
        output_parsed: { verdict: 'no_findings', findings: [] },
        usage: { input_tokens: 1234, output_tokens: 40 },
      }),
      budget = new DatabaseAiBudget(db, f.owner, randomUUID(), {
        projectUsd: 5,
        userUsd: 1,
      });
    const guard = {
      reserve: vi.fn((parameters) => budget.reserve(parameters)),
      settle: vi.fn((id, usage) => budget.settle(id, usage)),
    };
    const ai = new OpenAiProvider(
      {
        apiKey: 'test-only',
        eventModel: 'gpt-6-luna',
        storyModel: 'gpt-6.1-sol',
        checkModel: 'gpt-6.1-sol',
        timeoutMs: 1000,
        maxOutputTokens: 12000,
        guard,
      },
      { responses: { parse } } as unknown as OpenAIClient,
    );
    const result = await ai.reviewPublicContent(input),
      parameters = parse.mock.calls[0]![0];
    expect(parameters).toMatchObject({
      model: 'gpt-6.1-sol',
      store: false,
      max_output_tokens: 2200,
    });
    expect(JSON.parse(parameters.input[1].content)).toEqual(input);
    expect(result.receipt.inputHash).toBe(hash(input));
    expect(result.receipt.outputHash).toBe(hash(result.output));
    expect(result.receipt.promptVersion).toBe('public_content_review.v1.en');
    expect(guard.reserve).toHaveBeenCalledTimes(1);
    expect(guard.settle).toHaveBeenCalledWith(expect.any(String), {
      input_tokens: 1234,
      output_tokens: 40,
    });
    parse.mockClear();
    await expect(
      ai.reviewPublicContent({ ...input, fields: input.fields.slice(1) }),
    ).rejects.toMatchObject({ code: 'PUBLIC_CONTENT_REVIEW_INVALID' });
    expect(parse).not.toHaveBeenCalled();
    parse.mockRejectedValue(
      new OpenAI.InternalServerError(500, {}, 'temporary', new Headers()),
    );
    await expect(ai.reviewPublicContent(input)).rejects.toMatchObject({
      code: 'AI_PROVIDER_FAILED',
    });
    expect(parse).toHaveBeenCalledTimes(1);
    expect(guard.settle).toHaveBeenLastCalledWith(expect.any(String), null);
    expect(
      (
        await db.query(
          'SELECT status FROM aw_budget_reservations WHERE user_id=$1 ORDER BY created_at',
          [f.owner],
        )
      ).map((r) => r.status),
    ).toEqual(['completed', 'unknown']);
  });
});
