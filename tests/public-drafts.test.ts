import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import {
  publicSnapshotDraftSchema,
  type PublicPreviewCopy,
} from '@future-flow/contracts';
import {
  publicDraftIssues,
  hash,
  preparePublicReviewInput,
  validatePublicReview,
} from '@future-flow/core';
import type { PublicReviewAiProvider } from '@future-flow/ai';
import { runPublicDraftReview } from '../scripts/lib/public-review';
import {
  Repository,
  LifeRepository,
  LifeJobRepository,
  PublicDraftRepository,
  PublicReviewRepository,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { setupFixture, lifeTestAi } from './life-fixtures';
let engine: PGlite,
  db: Database,
  repo: Repository,
  lives: LifeRepository,
  jobs: LifeJobRepository,
  drafts: PublicDraftRepository;
const user = randomUUID(),
  other = randomUUID();
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
  lives = new LifeRepository(db, { daily: 100, concurrent: 2 });
  jobs = new LifeJobRepository(db);
  drafts = new PublicDraftRepository(db);
  for (const id of [user, other]) {
    await repo.ensureUser(id);
    await repo.acceptPrivacy(id);
  }
});
afterAll(async () => {
  await engine.close();
});
async function source(locale: 'en' | 'hu' = 'en') {
  const setup = setupFixture(locale, 1);
  setup.identity.label = 'Private Person';
  setup.location.region = 'Private Region';
  setup.employment.employerLabel = 'Secret Employer';
  const created = await lives.create(user, setup, randomUUID());
  await processLifeJob((await jobs.claim())!, jobs, lifeTestAi);
  const detail = await lives.detail(user, created.branchId);
  const period = detail.periods[0] as any;
  const copy: PublicPreviewCopy = {
    title: 'A different working life',
    summary:
      'A fictional adult explores an alternative career through meaningful choices.',
    category: 'career',
    goalDescription: 'Explore a different career',
    periods: [
      {
        chapter: { title: period.chapter.title, body: period.chapter.body },
        events: period.candidate.events.map((e: any) => ({
          title: e.title,
          summary: e.summary,
        })),
        decision: {
          prompt: period.candidate.events.at(-1).decision.prompt,
          options: period.candidate.events
            .at(-1)
            .decision.options.map((o: any) => ({
              label: o.label,
              description: o.description,
            })),
        },
      },
    ],
  };
  return { created, detail, period, copy };
}
describe.sequential('owner-only public preparation', () => {
  it('detects email, link, phone, private names and original IDs without disclosing values', () => {
    expect(
      publicDraftIssues(
        {
          text: `Private Person name@example.com https://example.com +36 30 123 4567 ${randomUUID()}`,
        },
        ['Private Person'],
      ),
    ).toEqual([
      'email',
      'internal_reference',
      'link',
      'phone_or_identifier',
      'private_label',
    ]);
  });
  it.each(['en', 'hu'] as const)(
    'projects %s canon into a separate allowlist without private references or facts',
    async (locale) => {
      const { created, detail, copy, period } = await source(locale);
      const preview = await drafts.prepare(
        user,
        created.branchId,
        detail.branch.revision,
        copy,
      );
      expect(preview.status).toBe('awaiting_review');
      expect(preview.snapshot.locale).toBe(locale);
      expect(preview.snapshot.origin).toEqual({
        aiGenerated: true,
        userEdited: false,
        classification: 'unreviewed',
      });
      const text = JSON.stringify(preview.snapshot);
      for (const forbidden of [
        user,
        created.lifeId,
        created.branchId,
        period.id,
        'Private Person',
        'Private Region',
        'Secret Employer',
        'monthlyIncome',
        'liquidFunds',
        'memory',
        'state_after',
        'constraints',
      ])
        expect(text).not.toContain(forbidden);
      expect(preview.snapshot.startingPoint.readyForFork).toBe(false);
      expect(
        publicSnapshotDraftSchema.safeParse({
          ...preview.snapshot,
          privateState: detail.branch.state,
        }).success,
      ).toBe(false);
      expect(await drafts.get(user, preview.draftId)).toMatchObject({
        snapshotHash: preview.snapshotHash,
      });
      await expect(drafts.get(other, preview.draftId)).rejects.toMatchObject({
        code: 'RESOURCE_NOT_FOUND',
      });
      await expect(
        drafts.prepare(other, created.branchId, detail.branch.revision, copy),
      ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      const [privileges] = await db.query<{
        anon: boolean;
        authenticated: boolean;
      }>(
        "SELECT has_table_privilege('anon','aw_publication_drafts','SELECT') AS anon,has_table_privilege('authenticated','aw_scenario_drafts','SELECT') AS authenticated",
      );
      expect(privileges).toEqual({ anon: false, authenticated: false });
    },
  );
  it('rejects source revision, copied private names and client badges; records edited copy accurately', async () => {
    const { created, detail, copy } = await source();
    await expect(
      drafts.prepare(user, created.branchId, 0, copy),
    ).rejects.toMatchObject({ code: 'LIFE_REVISION_CONFLICT' });
    await expect(
      drafts.prepare(user, created.branchId, detail.branch.revision, {
        ...copy,
        title: 'Private Person life',
      }),
    ).rejects.toMatchObject({ code: 'PUBLIC_PRIVACY_REVIEW_REQUIRED' });
    await expect(
      drafts.prepare(user, created.branchId, detail.branch.revision, {
        ...copy,
        official: true,
      }),
    ).rejects.toThrow();
    copy.periods[0]!.chapter.title = 'A revised public title';
    const p = await drafts.prepare(
      user,
      created.branchId,
      detail.branch.revision,
      copy,
    );
    expect(p.snapshot.origin.userEdited).toBe(true);
    await expect(
      db.query(
        "UPDATE aw_publication_drafts SET status='awaiting_review' WHERE id=$1",
        [p.draftId],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "INSERT INTO aw_scenario_drafts(id,user_id,source_draft_id,version,content_locale,template,template_hash) VALUES($1,$2,$3,2,'en','{}','hash')",
        [randomUUID(), other, p.draftId],
      ),
    ).rejects.toThrow();
  });
  it('invalidates the preview when the source changes and keeps old snapshot content immutable', async () => {
    const { created, detail, copy, period } = await source();
    const p = await drafts.prepare(
      user,
      created.branchId,
      detail.branch.revision,
      copy,
    );
    const d = period.candidate.events.at(-1).decision;
    await lives.choose(
      user,
      created.branchId,
      detail.branch.revision,
      d.id,
      d.options[0].id,
      randomUUID(),
    );
    await expect(drafts.get(user, p.draftId)).rejects.toMatchObject({
      code: 'LIFE_REVISION_CONFLICT',
    });
    const [row] = await db.query<{ snapshot_hash: string }>(
      'SELECT snapshot_hash FROM aw_publication_drafts WHERE id=$1',
      [p.draftId],
    );
    expect(row!.snapshot_hash).toBe(p.snapshotHash);
  });
  it('rejects an expired preview without changing its immutable content', async () => {
    const { created, detail, copy } = await source();
    const p = await drafts.prepare(
      user,
      created.branchId,
      detail.branch.revision,
      copy,
    );
    const expired = randomUUID();
    await db.query(
      "INSERT INTO aw_publication_drafts(id,user_id,life_id,branch_id,source_revision,snapshot,snapshot_hash,scan_version,expires_at) SELECT $1,user_id,life_id,branch_id,source_revision,snapshot,snapshot_hash,scan_version,now()-interval '1 minute' FROM aw_publication_drafts WHERE id=$2",
      [expired, p.draftId],
    );
    await expect(drafts.get(user, expired)).rejects.toMatchObject({
      code: 'PUBLIC_PREVIEW_EXPIRED',
    });
  });
  it('reviews every copy field without private source data; blocks inconsistent findings', async () => {
    const { created, detail, copy } = await source();
    const p = await drafts.prepare(
      user,
      created.branchId,
      detail.branch.revision,
      copy,
    );
    const input = preparePublicReviewInput(p.snapshot);
    expect(input.fields).toHaveLength(14);
    for (const forbidden of [
      user,
      created.lifeId,
      created.branchId,
      p.snapshot.snapshotKey,
      'Private Person',
      'Private Region',
      'Secret Employer',
    ])
      expect(JSON.stringify(input)).not.toContain(forbidden);
    expect(input.fields.map((f) => f.text)).toContain(
      copy.periods[0]!.chapter.body,
    );
    expect(input.fields.map((f) => f.path)).toContain(
      'period-1.option-2.description',
    );
    expect(() =>
      validatePublicReview(input, {
        verdict: 'no_findings',
        findings: [
          {
            fieldKey: 'field-1',
            category: 'person_name',
            action: 'generalize',
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      validatePublicReview(input, { verdict: 'review_required', findings: [] }),
    ).toThrow();
    expect(() =>
      validatePublicReview(input, {
        verdict: 'review_required',
        findings: [
          {
            fieldKey: 'field-999',
            category: 'person_name',
            action: 'generalize',
          },
        ],
      }),
    ).toThrow();
    const finding = {
      fieldKey: 'field-1',
      category: 'person_name',
      action: 'generalize',
    };
    expect(() =>
      validatePublicReview(input, {
        verdict: 'review_required',
        findings: [finding, finding],
      }),
    ).toThrow();
    expect(() =>
      validatePublicReview(input, {
        verdict: 'unable_to_assess',
        findings: [],
        approved: true,
      }),
    ).toThrow();
  });
  it('stores a bound private pre-screen once, reuses it without AI, and never approves publication', async () => {
    const { created, detail, copy } = await source();
    const p = await drafts.prepare(
      user,
      created.branchId,
      detail.branch.revision,
      copy,
    );
    const reviews = new PublicReviewRepository(db);
    expect(await reviews.get(user, p.draftId)).toEqual({
      status: 'not_started',
      publicationApproved: false,
    });
    let calls = 0;
    const ai: PublicReviewAiProvider = {
      reviewPublicCopy: async (input) => {
        calls++;
        const output = { verdict: 'no_findings' as const, findings: [] };
        return {
          output,
          receipt: {
            task: 'public_review',
            promptVersion: 'public_review.v2.en',
            locale: 'en',
            model: 'isolated-test-double',
            requestId: null,
            inputHash: hash(input),
            outputHash: hash(output),
            inputTokens: 0,
            outputTokens: 0,
            latencyMs: 0,
          },
        };
      },
    };
    const result = await runPublicDraftReview(db, ai, user, p.draftId);
    expect(result).toMatchObject({
      reused: false,
      review: {
        status: 'completed',
        publicationApproved: false,
        report: { verdict: 'no_findings' },
      },
    });
    expect(await runPublicDraftReview(db, ai, user, p.draftId)).toMatchObject({
      reused: true,
    });
    expect(calls).toBe(1);
    expect(await drafts.get(user, p.draftId)).toMatchObject({
      status: 'awaiting_review',
      snapshotHash: p.snapshotHash,
    });
    await expect(reviews.get(other, p.draftId)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    await expect(reviews.start(other, p.draftId)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    await expect(
      db.query(
        "UPDATE aw_public_draft_reviews SET report='{}' WHERE draft_id=$1",
        [p.draftId],
      ),
    ).rejects.toThrow();
    const [grants] = await db.query(
      "SELECT has_table_privilege('anon','aw_public_draft_reviews','SELECT') AS anon,has_table_privilege('authenticated','aw_public_draft_reviews','INSERT') AS client",
    );
    expect(grants).toEqual({ anon: false, client: false });
    const row = (
      await db.query(
        'SELECT receipt FROM aw_public_draft_reviews WHERE draft_id=$1',
        [p.draftId],
      )
    )[0]!;
    expect(JSON.stringify(row.receipt)).not.toContain(
      copy.periods[0]!.chapter.body,
    );
  });
  it('rejects forged receipt bindings and makes interrupted/failed attempts explicit without automatic paid retry', async () => {
    const { created, detail, copy } = await source();
    const p = await drafts.prepare(
      user,
      created.branchId,
      detail.branch.revision,
      copy,
    );
    const reviews = new PublicReviewRepository(db),
      started = await reviews.start(user, p.draftId);
    const output = { verdict: 'no_findings', findings: [] };
    const receipt = {
      task: 'public_review',
      promptVersion: 'public_review.v2.en',
      locale: 'en',
      model: 'isolated-test-double',
      requestId: null,
      inputHash: hash({ wrong: true }),
      outputHash: hash(output),
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
    };
    await expect(
      reviews.complete(user, p.draftId, started.reviewId, output, receipt),
    ).rejects.toMatchObject({ code: 'PUBLIC_REVIEW_INVALID' });
    await expect(reviews.start(user, p.draftId)).rejects.toMatchObject({
      code: 'PUBLIC_REVIEW_ALREADY_STARTED',
    });
    await reviews.fail(user, p.draftId, started.reviewId);
    expect(await reviews.get(user, p.draftId)).toMatchObject({
      status: 'failed',
      report: null,
      publicationApproved: false,
    });
    await expect(reviews.start(user, p.draftId)).rejects.toMatchObject({
      code: 'PUBLIC_REVIEW_ALREADY_STARTED',
    });
    const next = await drafts.prepare(
      user,
      created.branchId,
      detail.branch.revision,
      copy,
    );
    await expect(
      runPublicDraftReview(
        db,
        {
          reviewPublicCopy: async () => {
            throw Error('private provider error text');
          },
        },
        user,
        next.draftId,
      ),
    ).rejects.toThrow();
    const [failed] = await db.query(
      'SELECT report,receipt,failure_code FROM aw_public_draft_reviews WHERE draft_id=$1',
      [next.draftId],
    );
    expect(failed).toEqual({
      report: null,
      receipt: null,
      failure_code: 'PUBLIC_REVIEW_FAILED',
    });
  });
  it('cannot commit a review after the source choice changes during the provider call', async () => {
    const { created, detail, copy, period } = await source();
    const p = await drafts.prepare(
      user,
      created.branchId,
      detail.branch.revision,
      copy,
    );
    const d = period.candidate.events.at(-1).decision;
    await expect(
      runPublicDraftReview(
        db,
        {
          reviewPublicCopy: async (input) => {
            await lives.choose(
              user,
              created.branchId,
              detail.branch.revision,
              d.id,
              d.options[0].id,
              randomUUID(),
            );
            const output = { verdict: 'no_findings' as const, findings: [] };
            return {
              output,
              receipt: {
                task: 'public_review',
                promptVersion: 'public_review.v2.en',
                locale: 'en',
                model: 'isolated-test-double',
                requestId: null,
                inputHash: hash(input),
                outputHash: hash(output),
                inputTokens: 0,
                outputTokens: 0,
                latencyMs: 0,
              },
            };
          },
        },
        user,
        p.draftId,
      ),
    ).rejects.toMatchObject({ code: 'LIFE_REVISION_CONFLICT' });
    const [row] = await db.query(
      'SELECT status,report FROM aw_public_draft_reviews WHERE draft_id=$1',
      [p.draftId],
    );
    expect(row).toEqual({ status: 'failed', report: null });
  });
  it('keeps Hungarian archived copies but rejects new AI reviews before any provider call', async () => {
    const { created, detail, copy } = await source('hu');
    const p = await drafts.prepare(
      user,
      created.branchId,
      detail.branch.revision,
      copy,
    );
    await expect(
      new PublicReviewRepository(db).start(user, p.draftId),
    ).rejects.toMatchObject({ code: 'CONTENT_LANGUAGE_UNAVAILABLE' });
  });
  it('blocks completing a pending review immediately at the deleting marker', async () => {
    const { created, detail, copy } = await source();
    const p = await drafts.prepare(
      user,
      created.branchId,
      detail.branch.revision,
      copy,
    );
    const reviews = new PublicReviewRepository(db),
      started = await reviews.start(user, p.draftId);
    await repo.markDeleting(user);
    await expect(
      reviews.complete(user, p.draftId, started.reviewId, {}, {}),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DELETING' });
    await db.query("UPDATE ff_users SET status='active' WHERE id=$1", [user]);
  });
  it('exports and deletes all owner preview/scenario records with the account graph', async () => {
    const exported = await repo.exportAccount(user);
    expect(
      (exported.aw_publication_drafts as unknown[]).length,
    ).toBeGreaterThan(0);
    expect((exported.aw_scenario_drafts as unknown[]).length).toBeGreaterThan(
      0,
    );
    expect(
      (exported.aw_public_draft_reviews as unknown[]).length,
    ).toBeGreaterThan(0);
    await repo.markDeleting(user);
    await repo.deleteAccountData(user);
    const [count] = await db.query<{ count: number }>(
      'SELECT (SELECT count(*) FROM aw_publication_drafts WHERE user_id=$1)+(SELECT count(*) FROM aw_scenario_drafts WHERE user_id=$1)+(SELECT count(*) FROM aw_public_draft_reviews WHERE user_id=$1) AS count',
      [user],
    );
    expect(Number(count!.count)).toBe(0);
  });
});
