import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  PUBLIC_CONTENT_CURATION_VERSION,
  PUBLIC_CONTENT_REVIEW_VERSION,
  publicContentCurationDecisionSchema,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  instantiateScenarioTemplate,
} from '@future-flow/core';
import {
  Repository,
  LifeRepository,
  LifeJobRepository,
  PublicDraftRepository,
  PublicForkCheckpointRepository,
  PublicContentRepository,
  PublicContentReviewJobRepository,
  PublicContentCurationRepository,
  PublicReviewRepository,
  PublicCurationRepository,
  publicContentCurationEnabledFromEnv,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { lifeTestAi } from './life-fixtures';
import { scenarioFixture } from './scenario-fixtures';
import { contentCurationForBundle } from '../apps/web/lib/public-content-curation';

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
    true,
    undefined,
    true,
    true,
    config,
    true,
  );
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  await engine?.close();
});
const curations = () => new PublicContentCurationRepository(db, true),
  reviews = () => new PublicContentReviewJobRepository(db, config);
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
  return { owner, lives, created, drafts, preview, bundles, bundle };
}
async function reviewed(
  f: Awaited<ReturnType<typeof fixture>>,
  verdict:
    'no_findings' | 'review_required' | 'unable_to_assess' = 'no_findings',
) {
  const q = reviews();
  await q.enqueue(
    f.owner,
    f.bundle.bundleId,
    {
      contentHash: f.bundle.contentHash,
      policyVersion: PUBLIC_CONTENT_REVIEW_VERSION,
      acknowledged: true,
    },
    randomUUID(),
  );
  const job = (await q.claim())!,
    input = await q.input(job),
    output = {
      policyVersion: PUBLIC_CONTENT_REVIEW_VERSION,
      scope: 'story_and_selected_checkpoints',
      publicationApproved: false,
      contentHash: f.bundle.contentHash,
      verdict,
      findings:
        verdict === 'review_required'
          ? [
              {
                fieldKey: input.fields[0]!.key,
                category: 'meaning_mismatch',
                action: 'manual_review',
              },
            ]
          : [],
    };
  await q.complete(job, output, {
    task: 'public_content_review',
    promptVersion: 'public_content_review.v1.en',
    locale: 'en',
    model: 'isolated-no-provider',
    requestId: null,
    inputHash: hash(input),
    outputHash: hash(output),
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
  });
  const request = {
    contentHash: f.bundle.contentHash,
    reviewId: job.id,
    reviewHash: hash(output),
    policyVersion: PUBLIC_CONTENT_REVIEW_VERSION,
    curationVersion: PUBLIC_CONTENT_CURATION_VERSION,
    acknowledged: true,
  };
  return { request, job, review: await q.get(f.owner, f.bundle.bundleId) };
}
function decision(
  f: Awaited<ReturnType<typeof fixture>>,
  r: Awaited<ReturnType<typeof reviewed>>,
  id: string,
) {
  return {
    bundleId: f.bundle.bundleId,
    draftId: f.bundle.draftId,
    snapshotHash: f.bundle.snapshotHash,
    sourceRevision: f.bundle.sourceRevision,
    contentHash: f.bundle.contentHash,
    policyVersion: PUBLIC_CONTENT_REVIEW_VERSION,
    curationVersion: PUBLIC_CONTENT_CURATION_VERSION,
    curationId: id,
    reviewId: r.job.id,
    reviewHash: r.request.reviewHash,
    status: 'content_reviewed',
    reasonCode: null,
    actorLabel: 'Isolated technical test',
    privacyChecked: true,
    contentChecked: true,
    consistencyChecked: true,
  };
}
const http = (owner: string, id: string, body?: unknown, suffix = '') =>
  fetch(`${base}/api/v2/public-content-bundles/${id}/curation${suffix}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${owner}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

describe.sequential('private full-scope curator review', () => {
  it('keeps text-only approvals separate and requires a complete clear AI result', async () => {
    const f = await fixture(),
      q = curations();
    expect(await q.get(f.owner, f.bundle.bundleId)).toMatchObject({
      eligible: false,
      reviewId: null,
      reviewHash: null,
      curation: null,
      scope: 'story_and_selected_checkpoints',
      publicationApproved: false,
    });
    const text = new PublicReviewRepository(db),
      start = await text.start(f.owner, f.preview.draftId),
      output = { verdict: 'no_findings', findings: [] };
    await text.complete(f.owner, f.preview.draftId, start.reviewId, output, {
      task: 'public_review',
      promptVersion: 'isolated-fixture',
      locale: 'en',
      model: 'isolated-no-provider',
      requestId: null,
      inputHash: hash(start.input),
      outputHash: hash(output),
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
    });
    const textCurator = new PublicCurationRepository(db, true),
      submitted = await textCurator.submit(
        f.owner,
        f.preview.draftId,
        {
          snapshotHash: f.preview.snapshotHash,
          sourceRevision: f.preview.sourceRevision,
          curationVersion: 'text-curation-1',
          acknowledged: true,
        },
        randomUUID(),
      );
    await textCurator.decide({
      curationId: submitted.curation!.id,
      snapshotHash: f.preview.snapshotHash,
      sourceRevision: f.preview.sourceRevision,
      status: 'text_reviewed',
      reasonCode: null,
      actorLabel: 'Isolated technical test',
      privacyChecked: true,
      contentChecked: true,
    });
    await expect(
      q.submit(
        f.owner,
        f.bundle.bundleId,
        {
          contentHash: f.bundle.contentHash,
          reviewId: start.reviewId,
          reviewHash: hash(output),
          policyVersion: PUBLIC_CONTENT_REVIEW_VERSION,
          curationVersion: PUBLIC_CONTENT_CURATION_VERSION,
          acknowledged: true,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_CONTENT_CURATION_AI_REQUIRED' });
    expect((await q.get(f.owner, f.bundle.bundleId)).curation).toBeNull();
    const r = await reviewed(f);
    expect(
      (await q.submit(f.owner, f.bundle.bundleId, r.request, randomUUID()))
        .curation?.status,
    ).toBe('pending');
  });
  it.each(['review_required', 'unable_to_assess'] as const)(
    'blocks %s complete results',
    async (verdict) => {
      const f = await fixture(),
        r = await reviewed(f, verdict);
      await expect(
        curations().submit(f.owner, f.bundle.bundleId, r.request, randomUUID()),
      ).rejects.toMatchObject({ code: 'PUBLIC_CONTENT_CURATION_AI_REQUIRED' });
      expect((await curations().get(f.owner, f.bundle.bundleId)).eligible).toBe(
        false,
      );
    },
  );
  it('requires consent, exact review/content binding and a separate closed policy', async () => {
    const f = await fixture(),
      r = await reviewed(f),
      q = curations();
    for (const patch of [
      { acknowledged: false },
      { policyVersion: 'privacy-review-1' },
      { curationVersion: 'text-curation-1' },
      { status: 'content_reviewed' },
      { publicationApproved: true },
    ])
      await expect(
        q.submit(
          f.owner,
          f.bundle.bundleId,
          { ...r.request, ...patch },
          randomUUID(),
        ),
      ).rejects.toThrow();
    for (const patch of [
      { contentHash: '0'.repeat(64) },
      { reviewId: randomUUID() },
      { reviewHash: '0'.repeat(64) },
    ])
      await expect(
        q.submit(
          f.owner,
          f.bundle.bundleId,
          { ...r.request, ...patch },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'PUBLIC_CONTENT_CURATION_INVALID' });
    await expect(
      q.submit(f.owner, f.bundle.bundleId, r.request, 'short'),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    await db.query('DELETE FROM ff_consents WHERE user_id=$1', [f.owner]);
    await expect(
      q.submit(f.owner, f.bundle.bundleId, r.request, randomUUID()),
    ).rejects.toMatchObject({ code: 'PRIVACY_ACKNOWLEDGEMENT_REQUIRED' });
    expect(
      (
        await db.query(
          'SELECT id FROM aw_public_content_curations WHERE user_id=$1',
          [f.owner],
        )
      ).length,
    ).toBe(0);
  });
  it('deduplicates and preserves final full decisions without publication or source mutation', async () => {
    const f = await fixture(),
      r = await reviewed(f),
      q = curations(),
      key = randomUUID(),
      one = await q.submit(f.owner, f.bundle.bundleId, r.request, key);
    expect(await q.submit(f.owner, f.bundle.bundleId, r.request, key)).toEqual(
      one,
    );
    expect(
      await q.submit(f.owner, f.bundle.bundleId, r.request, randomUUID()),
    ).toEqual(one);
    const input = decision(f, r, one.curation!.id),
      final = await q.decide(input);
    expect(final).toMatchObject({
      eligible: true,
      scope: 'story_and_selected_checkpoints',
      publicationApproved: false,
      curation: { status: 'content_reviewed', reasonCode: null },
    });
    expect(await q.decide(input)).toEqual(final);
    await expect(
      q.decide({ ...input, status: 'rejected', reasonCode: 'content' }),
    ).rejects.toMatchObject({ code: 'PUBLIC_CONTENT_CURATION_DECIDED' });
    await expect(
      db.query(
        'UPDATE aw_public_content_curations SET actor_label=$1 WHERE id=$2',
        ['Replacement', one.curation!.id],
      ),
    ).rejects.toThrow('immutable');
    expect(await f.bundles.get(f.owner, f.bundle.bundleId)).toEqual(f.bundle);
    expect((await f.drafts.get(f.owner, f.preview.draftId)).status).toBe(
      'awaiting_review',
    );
    expect(await contentCurationForBundle(final, f.bundle, r.review)).toEqual(
      final,
    );
    for (const patch of [
      { sourceRevision: final.sourceRevision + 1 },
      { contentHash: '0'.repeat(64) },
      { reviewHash: '0'.repeat(64) },
      { reviewId: randomUUID() },
      { eligible: false },
      { scope: 'text_only' },
      { publicationApproved: true },
      { curation: { ...final.curation, reasonCode: 'quality' } },
    ])
      await expect(
        contentCurationForBundle({ ...final, ...patch }, f.bundle, r.review),
      ).rejects.toThrow();
  });
  it.each(['changes_requested', 'rejected'])(
    'records %s once with a safe reason code',
    async (status) => {
      const f = await fixture(),
        r = await reviewed(f),
        q = curations(),
        one = await q.submit(
          f.owner,
          f.bundle.bundleId,
          r.request,
          randomUUID(),
        ),
        input = {
          ...decision(f, r, one.curation!.id),
          status,
          reasonCode: 'story_consistency',
        },
        final = await q.decide(input);
      expect(final.curation).toMatchObject({
        status,
        reasonCode: 'story_consistency',
      });
      expect(await q.decide(input)).toEqual(final);
      expect((await f.bundles.get(f.owner, f.bundle.bundleId)).content).toEqual(
        f.bundle.content,
      );
    },
  );
  it('requires all operator checks and matches every source and review binding', async () => {
    const f = await fixture(),
      r = await reviewed(f),
      q = curations(),
      one = await q.submit(f.owner, f.bundle.bundleId, r.request, randomUUID()),
      input = decision(f, r, one.curation!.id);
    for (const patch of [
      { privacyChecked: false },
      { contentChecked: false },
      { consistencyChecked: false },
      { actorLabel: '' },
      { status: 'rejected' },
      { reasonCode: 'quality' },
      { publicationApproved: true },
    ])
      expect(
        publicContentCurationDecisionSchema.safeParse({ ...input, ...patch })
          .success,
      ).toBe(false);
    for (const patch of [
      { bundleId: randomUUID() },
      { draftId: randomUUID() },
      { snapshotHash: '0'.repeat(64) },
      { sourceRevision: input.sourceRevision + 1 },
      { contentHash: '0'.repeat(64) },
      { reviewHash: '0'.repeat(64) },
      { reviewId: randomUUID() },
    ])
      await expect(q.decide({ ...input, ...patch })).rejects.toMatchObject({
        code: 'PUBLIC_CONTENT_CURATION_INVALID',
      });
    expect((await q.get(f.owner, f.bundle.bundleId)).curation?.status).toBe(
      'pending',
    );
  });
  it('restricts HTTP to own read/submit with no approval endpoint', async () => {
    const f = await fixture(),
      other = await fixture(),
      r = await reviewed(f);
    expect(
      (
        await fetch(
          `${base}/api/v2/public-content-bundles/${f.bundle.bundleId}/curation`,
        )
      ).status,
    ).toBe(401);
    expect((await http(other.owner, f.bundle.bundleId)).status).toBe(404);
    expect(
      (
        await http(f.owner, f.bundle.bundleId, {
          ...r.request,
          status: 'content_reviewed',
        })
      ).status,
    ).toBe(422);
    expect(
      (await http(f.owner, f.bundle.bundleId, r.request, '/approve')).status,
    ).toBe(404);
    const response = await http(f.owner, f.bundle.bundleId, r.request);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      publicationApproved: false,
      curation: { status: 'pending' },
    });
  });
  it('defaults disabled; reuses submissions freely and keeps selection versions separate', async () => {
    const f = await fixture(),
      r = await reviewed(f),
      q = curations(),
      disabled = new PublicContentCurationRepository(db),
      key = randomUUID();
    await expect(
      disabled.submit(f.owner, f.bundle.bundleId, r.request, key),
    ).rejects.toMatchObject({ code: 'PUBLIC_CONTENT_CURATION_DISABLED' });
    const one = await q.submit(f.owner, f.bundle.bundleId, r.request, key);
    expect(
      (await disabled.submit(f.owner, f.bundle.bundleId, r.request, key))
        .curation,
    ).toEqual(one.curation);
    const changed = await f.bundles.save(
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
    expect((await q.get(f.owner, changed.bundleId)).curation).toBeNull();
    await expect(
      q.submit(
        f.owner,
        changed.bundleId,
        { ...r.request, contentHash: changed.contentHash },
        key,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('operator listing returns the whole submitted content only and blocks changed or expired sources', async () => {
    const f = await fixture(),
      r = await reviewed(f),
      q = curations();
    expect(
      (await q.pending()).some((x) => 'ownerId' in x && x.ownerId === f.owner),
    ).toBe(false);
    const one = await q.submit(
        f.owner,
        f.bundle.bundleId,
        r.request,
        randomUUID(),
      ),
      item = (await q.pending()).find((x) => x.curationId === one.curation!.id);
    expect(item).toMatchObject({
      ownerId: f.owner,
      bundle: f.bundle,
      review: { ...r.review, enabled: false },
      reviewHash: r.request.reviewHash,
      publicationApproved: false,
    });
    // Insert an expired graph as a clock fixture; production rows remain immutable.
    const expired = randomUUID(),
      expiredBundle = randomUUID(),
      expiredReview = randomUUID(),
      expiredCuration = randomUUID();
    await db.query(
      "INSERT INTO aw_publication_drafts(id,user_id,life_id,branch_id,source_revision,snapshot,snapshot_hash,scan_version,expires_at) SELECT $1,user_id,life_id,branch_id,source_revision,snapshot,snapshot_hash,scan_version,now()-interval '1 second' FROM aw_publication_drafts WHERE id=$2",
      [expired, f.preview.draftId],
    );
    await db.query(
      'INSERT INTO aw_public_content_bundles(id,user_id,draft_id,source_revision,snapshot_hash,content_hash,content) SELECT $1,user_id,$2,source_revision,snapshot_hash,content_hash,content FROM aw_public_content_bundles WHERE id=$3',
      [expiredBundle, expired, f.bundle.bundleId],
    );
    await db.query(
      'INSERT INTO aw_public_content_reviews(id,user_id,draft_id,bundle_id,source_revision,snapshot_hash,content_hash,input_hash,policy_version,status,report,report_hash,receipt,finished_at) SELECT $1,user_id,$2,$3,source_revision,snapshot_hash,content_hash,input_hash,policy_version,status,report,report_hash,receipt,finished_at FROM aw_public_content_reviews WHERE id=$4',
      [expiredReview, expired, expiredBundle, r.job.id],
    );
    await db.query(
      'INSERT INTO aw_public_content_curations(id,user_id,draft_id,bundle_id,review_id,source_revision,snapshot_hash,content_hash,review_hash,policy_version,curation_version) SELECT $1,user_id,$2,$3,$4,source_revision,snapshot_hash,content_hash,review_hash,policy_version,curation_version FROM aw_public_content_curations WHERE id=$5',
      [
        expiredCuration,
        expired,
        expiredBundle,
        expiredReview,
        one.curation!.id,
      ],
    );
    await expect(
      q.decide({
        ...decision(f, r, expiredCuration),
        draftId: expired,
        bundleId: expiredBundle,
        reviewId: expiredReview,
      }),
    ).rejects.toMatchObject({ code: 'PUBLIC_PREVIEW_EXPIRED' });
    expect(
      (await q.pending()).some((x) => x.curationId === expiredCuration),
    ).toBe(false);
    const changed = await fixture(),
      cr = await reviewed(changed),
      cs = await q.submit(
        changed.owner,
        changed.bundle.bundleId,
        cr.request,
        randomUUID(),
      );
    await db.query('UPDATE aw_branches SET revision=revision+1 WHERE id=$1', [
      changed.created.branchId,
    ]);
    await expect(
      q.decide(decision(changed, cr, cs.curation!.id)),
    ).rejects.toMatchObject({ code: 'LIFE_REVISION_CONFLICT' });
    expect(
      (await q.pending()).some((x) => x.curationId === cs.curation!.id),
    ).toBe(false);
  });
  it('exports, blocks deleting owners, cascades records and prevents direct client access', async () => {
    const f = await fixture(),
      r = await reviewed(f),
      q = curations(),
      one = await q.submit(f.owner, f.bundle.bundleId, r.request, randomUUID());
    expect(
      (await repo.exportAccount(f.owner)).aw_public_content_curations,
    ).toHaveLength(1);
    await repo.markDeleting(f.owner);
    await expect(q.get(f.owner, f.bundle.bundleId)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETING',
    });
    await expect(
      q.decide(decision(f, r, one.curation!.id)),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DELETING' });
    expect(
      (await q.pending()).some((x) => x.curationId === one.curation!.id),
    ).toBe(false);
    await repo.deleteAccountData(f.owner);
    expect(
      await db.query(
        'SELECT id FROM aw_public_content_curations WHERE user_id=$1',
        [f.owner],
      ),
    ).toHaveLength(0);
    expect(
      await db.query(
        "SELECT c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'INSERT') AS client FROM pg_class c WHERE c.oid='aw_public_content_curations'::regclass",
      ),
    ).toEqual([{ rls: true, anon: false, client: false }]);
    const old = process.env.PUBLIC_CONTENT_CURATION_ENABLED;
    delete process.env.PUBLIC_CONTENT_CURATION_ENABLED;
    expect(publicContentCurationEnabledFromEnv()).toBe(false);
    process.env.PUBLIC_CONTENT_CURATION_ENABLED = 'invalid';
    expect(() => publicContentCurationEnabledFromEnv()).toThrow();
    if (old === undefined) delete process.env.PUBLIC_CONTENT_CURATION_ENABLED;
    else process.env.PUBLIC_CONTENT_CURATION_ENABLED = old;
  });
});
