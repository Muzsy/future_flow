import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  PUBLIC_CURATION_VERSION,
  publicCurationDecisionSchema,
} from '@future-flow/contracts';
import { DomainError, hash } from '@future-flow/core';
import {
  Repository,
  LifeRepository,
  LifeJobRepository,
  PublicDraftRepository,
  PublicReviewRepository,
  PublicCurationRepository,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { setupFixture, lifeTestAi } from './life-fixtures';
import { curationForPreview } from '../apps/web/lib/public-preview';

let engine: PGlite,
  db: Database,
  repo: Repository,
  app: INestApplication,
  base: string;
const users = new Set<string>();
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
    undefined,
    true,
  );
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  await engine?.close();
});
async function fixture() {
  const user = randomUUID();
  users.add(user);
  await repo.ensureUser(user);
  await repo.acceptPrivacy(user);
  const created = await new LifeRepository(db).create(
    user,
    setupFixture('en', 1),
    randomUUID(),
  );
  const jobs = new LifeJobRepository(db);
  await processLifeJob((await jobs.claim())!, jobs, lifeTestAi);
  const drafts = new PublicDraftRepository(db),
    workspace = await drafts.workspace(user, created.branchId);
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
    curationVersion: PUBLIC_CURATION_VERSION,
    acknowledged: true,
  };
  return { user, created, drafts, preview, request };
}
async function reviewed(
  f: Awaited<ReturnType<typeof fixture>>,
  verdict = 'no_findings',
) {
  const reviews = new PublicReviewRepository(db),
    started = await reviews.start(f.user, f.preview.draftId);
  const output =
    verdict === 'no_findings'
      ? { verdict, findings: [] }
      : {
          verdict,
          findings: [
            {
              fieldKey: 'field-1',
              category: 'person_name',
              action: 'generalize',
            },
          ],
        };
  await reviews.complete(f.user, f.preview.draftId, started.reviewId, output, {
    task: 'public_review',
    promptVersion: 'isolated-curation-fixture',
    locale: 'en',
    model: 'isolated-no-provider',
    requestId: null,
    inputHash: hash(started.input),
    outputHash: hash(output),
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
  });
}
const curations = () => new PublicCurationRepository(db, true);
function decision(f: Awaited<ReturnType<typeof fixture>>, id: string) {
  return {
    curationId: id,
    snapshotHash: f.preview.snapshotHash,
    sourceRevision: f.preview.sourceRevision,
    status: 'text_reviewed',
    reasonCode: null,
    actorLabel: 'Isolated technical test',
    privacyChecked: true,
    contentChecked: true,
  };
}
function http(
  f: Awaited<ReturnType<typeof fixture>>,
  body?: unknown,
  user = f.user,
  path = '',
) {
  return fetch(
    `${base}/api/v2/public-previews/${f.preview.draftId}/curation${path}`,
    {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${user}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}
describe.sequential('owner-submitted trusted text curation', () => {
  it('requires clear completed AI review, consent and exact copy binding', async () => {
    const f = await fixture(),
      q = curations();
    expect((await q.get(f.user, f.preview.draftId)).curation).toBeNull();
    await expect(
      q.submit(f.user, f.preview.draftId, f.request, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLIC_CURATION_AI_REQUIRED' });
    await reviewed(f);
    await expect(
      q.submit(
        f.user,
        f.preview.draftId,
        { ...f.request, acknowledged: false },
        randomUUID(),
      ),
    ).rejects.toThrow();
    await expect(
      q.submit(
        f.user,
        f.preview.draftId,
        { ...f.request, snapshotHash: '0'.repeat(64) },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_CURATION_INVALID' });
    await expect(
      q.submit(
        f.user,
        f.preview.draftId,
        { ...f.request, status: 'text_reviewed' },
        randomUUID(),
      ),
    ).rejects.toThrow();
    expect(
      (
        await db.query(
          'SELECT id FROM aw_public_text_curations WHERE user_id=$1',
          [f.user],
        )
      ).length,
    ).toBe(0);
  });
  it('blocks findings and interrupted reviews', async () => {
    const f = await fixture();
    await reviewed(f, 'review_required');
    await expect(
      curations().submit(f.user, f.preview.draftId, f.request, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLIC_CURATION_AI_REQUIRED' });
    const interrupted = await fixture(),
      reviews = new PublicReviewRepository(db);
    const started = await reviews.start(
      interrupted.user,
      interrupted.preview.draftId,
    );
    await reviews.fail(
      interrupted.user,
      interrupted.preview.draftId,
      started.reviewId,
    );
    await expect(
      curations().submit(
        interrupted.user,
        interrupted.preview.draftId,
        interrupted.request,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_CURATION_AI_REQUIRED' });
  });
  it('deduplicates consented submissions and keeps finalized decisions private and immutable', async () => {
    const f = await fixture(),
      q = curations(),
      key = randomUUID();
    await reviewed(f);
    const one = await q.submit(f.user, f.preview.draftId, f.request, key);
    expect(await q.submit(f.user, f.preview.draftId, f.request, key)).toEqual(
      one,
    );
    expect(
      await q.submit(f.user, f.preview.draftId, f.request, randomUUID()),
    ).toEqual(one);
    const input = decision(f, one.curation!.id),
      final = await q.decide(input);
    expect(final).toMatchObject({
      scope: 'text_only',
      publicationApproved: false,
      curation: { status: 'text_reviewed', reasonCode: null },
    });
    expect(await q.decide(input)).toEqual(final);
    await expect(
      q.decide({ ...input, status: 'rejected', reasonCode: 'content' }),
    ).rejects.toMatchObject({ code: 'PUBLIC_CURATION_DECIDED' });
    await expect(
      db.query(
        'UPDATE aw_public_text_curations SET actor_label=$1 WHERE id=$2',
        ['Replacement', one.curation!.id],
      ),
    ).rejects.toThrow('immutable');
    expect(
      (await repo.exportAccount(f.user)).aw_public_text_curations,
    ).toHaveLength(1);
    expect((await f.drafts.get(f.user, f.preview.draftId)).status).toBe(
      'awaiting_review',
    );
    expect(curationForPreview(final, f.preview)).toEqual(final);
    expect(() =>
      curationForPreview(
        { ...final, sourceRevision: final.sourceRevision + 1 },
        f.preview,
      ),
    ).toThrow();
  });
  it.each(['changes_requested', 'rejected'])(
    'records %s without modifying source or snapshot',
    async (status) => {
      const f = await fixture(),
        q = curations();
      await reviewed(f);
      const one = await q.submit(
        f.user,
        f.preview.draftId,
        f.request,
        randomUUID(),
      );
      const final = await q.decide({
        ...decision(f, one.curation!.id),
        status,
        reasonCode: 'quality',
      });
      expect(final.curation).toMatchObject({ status, reasonCode: 'quality' });
      expect((await f.drafts.get(f.user, f.preview.draftId)).snapshot).toEqual(
        f.preview.snapshot,
      );
    },
  );
  it('requires explicit operator checks and a decision-compatible reason', async () => {
    const f = await fixture(),
      input = decision(f, randomUUID());
    for (const patch of [
      { privacyChecked: false },
      { contentChecked: false },
      { actorLabel: '' },
      { status: 'rejected' },
      { reasonCode: 'privacy' },
      { publicationApproved: true },
    ])
      expect(
        publicCurationDecisionSchema.safeParse({ ...input, ...patch }).success,
      ).toBe(false);
  });
  it('restricts HTTP to own submit/read and has no approval route', async () => {
    const f = await fixture(),
      stranger = await fixture();
    await reviewed(f);
    expect(
      (
        await fetch(
          `${base}/api/v2/public-previews/${f.preview.draftId}/curation`,
        )
      ).status,
    ).toBe(401);
    expect((await http(f, undefined, stranger.user)).status).toBe(404);
    expect(
      (await http(f, { ...f.request, status: 'text_reviewed' })).status,
    ).toBe(422);
    const submit = await http(f, f.request);
    expect(submit.status).toBe(201);
    expect(await submit.json()).toMatchObject({
      publicationApproved: false,
      curation: { status: 'pending' },
    });
    expect(
      (await http(f, decision(f, randomUUID()), f.user, '/approve')).status,
    ).toBe(404);
  });
  it('defaults disabled and permits only free reuse when submissions are disabled', async () => {
    const f = await fixture(),
      disabled = new PublicCurationRepository(db);
    await reviewed(f);
    await expect(
      disabled.submit(f.user, f.preview.draftId, f.request, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLIC_CURATION_DISABLED' });
    const one = await curations().submit(
      f.user,
      f.preview.draftId,
      f.request,
      randomUUID(),
    );
    expect(
      (
        await disabled.submit(
          f.user,
          f.preview.draftId,
          f.request,
          randomUUID(),
        )
      ).curation?.id,
    ).toBe(one.curation?.id);
  });
  it('rejects a reused key bound to another copy', async () => {
    const f = await fixture(),
      q = curations(),
      key = randomUUID();
    await reviewed(f);
    await q.submit(f.user, f.preview.draftId, f.request, key);
    const next = await f.drafts.prepare(
      f.user,
      f.created.branchId,
      f.preview.sourceRevision,
      {
        ...(await f.drafts.workspace(f.user, f.created.branchId)).source.copy,
        title: 'Another private copy',
      },
      randomUUID(),
    );
    await expect(
      q.submit(
        f.user,
        next.draftId,
        { ...f.request, snapshotHash: next.snapshotHash },
        key,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('lists only submitted valid copies, invalidates source changes and rejects deletion', async () => {
    const f = await fixture(),
      q = curations();
    await reviewed(f);
    expect(
      (await q.pending()).some((x) => 'ownerId' in x && x.ownerId === f.user),
    ).toBe(false);
    const one = await q.submit(
      f.user,
      f.preview.draftId,
      f.request,
      randomUUID(),
    );
    const listed = (await q.pending()).find(
      (x) => x.curationId === one.curation!.id,
    )!;
    expect(listed).toHaveProperty('snapshot', f.preview.snapshot);
    expect(JSON.stringify(listed)).not.toMatch(
      /"(?:world|memory|receipt|privateInput)":/,
    );
    await db.query('UPDATE aw_branches SET revision=revision+1 WHERE id=$1', [
      f.created.branchId,
    ]);
    await expect(q.decide(decision(f, one.curation!.id))).rejects.toMatchObject(
      { code: 'LIFE_REVISION_CONFLICT' },
    );
    expect(
      (await q.pending()).some((x) => x.curationId === one.curation!.id),
    ).toBe(false);
    await repo.markDeleting(f.user);
    await expect(q.decide(decision(f, one.curation!.id))).rejects.toMatchObject(
      { code: 'ACCOUNT_DELETING' },
    );
    await repo.deleteAccountData(f.user);
    expect(
      await db.query(
        'SELECT id FROM aw_public_text_curations WHERE user_id=$1',
        [f.user],
      ),
    ).toHaveLength(0);
  });
  it('blocks an expired copy even when it has recorded AI and curation rows', async () => {
    const f = await fixture(),
      expired = randomUUID(),
      reviewId = randomUUID(),
      curationId = randomUUID();
    await reviewed(f);
    await db.query(
      "INSERT INTO aw_publication_drafts(id,user_id,life_id,branch_id,source_revision,snapshot,snapshot_hash,scan_version,expires_at) SELECT $1,user_id,life_id,branch_id,source_revision,snapshot,snapshot_hash,scan_version,now()-interval '1 minute' FROM aw_publication_drafts WHERE id=$2",
      [expired, f.preview.draftId],
    );
    await db.query(
      'INSERT INTO aw_public_draft_reviews(id,user_id,draft_id,source_revision,snapshot_hash,input_hash,policy_version,status,report,report_hash,receipt,finished_at) SELECT $1,user_id,$2,source_revision,snapshot_hash,input_hash,policy_version,status,report,report_hash,receipt,finished_at FROM aw_public_draft_reviews WHERE draft_id=$3',
      [reviewId, expired, f.preview.draftId],
    );
    await db.query(
      'INSERT INTO aw_public_text_curations(id,user_id,draft_id,review_id,source_revision,snapshot_hash,curation_version) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        curationId,
        f.user,
        expired,
        reviewId,
        f.preview.sourceRevision,
        f.preview.snapshotHash,
        PUBLIC_CURATION_VERSION,
      ],
    );
    await expect(
      curations().decide(decision(f, curationId)),
    ).rejects.toMatchObject({ code: 'PUBLIC_PREVIEW_EXPIRED' });
    expect(
      (await curations().pending()).some((x) => x.curationId === curationId),
    ).toBe(false);
    expect(
      (
        await db.query(
          'SELECT status FROM aw_public_text_curations WHERE id=$1',
          [curationId],
        )
      )[0].status,
    ).toBe('pending');
  });
  it('enforces owner/review foreign keys and database client denial', async () => {
    const f = await fixture(),
      stranger = await fixture();
    await reviewed(f);
    const one = await curations().submit(
      f.user,
      f.preview.draftId,
      f.request,
      randomUUID(),
    );
    await expect(
      db.query(
        'INSERT INTO aw_public_text_curations(id,user_id,draft_id,review_id,source_revision,snapshot_hash,curation_version) SELECT $1,$2,draft_id,review_id,source_revision,snapshot_hash,curation_version FROM aw_public_text_curations WHERE id=$3',
        [randomUUID(), stranger.user, one.curation!.id],
      ),
    ).rejects.toThrow();
    const [guard] = await db.query(
      "SELECT c.relrowsecurity AS rls,has_table_privilege('anon','aw_public_text_curations','SELECT') AS anon,has_table_privilege('authenticated','aw_public_text_curations','INSERT') AS client FROM pg_class c WHERE c.oid='aw_public_text_curations'::regclass",
    );
    expect(guard).toEqual({ rls: true, anon: false, client: false });
  });
});
