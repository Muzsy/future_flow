import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import {
  publicSnapshotDraftSchema,
  type PublicPreviewCopy,
} from '@future-flow/contracts';
import { publicDraftIssues } from '@future-flow/core';
import {
  Repository,
  LifeRepository,
  LifeJobRepository,
  PublicDraftRepository,
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
  lives = new LifeRepository(db);
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
  it('exports and deletes all owner preview/scenario records with the account graph', async () => {
    const exported = await repo.exportAccount(user);
    expect(
      (exported.aw_publication_drafts as unknown[]).length,
    ).toBeGreaterThan(0);
    expect((exported.aw_scenario_drafts as unknown[]).length).toBeGreaterThan(
      0,
    );
    await repo.markDeleting(user);
    await repo.deleteAccountData(user);
    const [count] = await db.query<{ count: number }>(
      'SELECT (SELECT count(*) FROM aw_publication_drafts WHERE user_id=$1)+(SELECT count(*) FROM aw_scenario_drafts WHERE user_id=$1) AS count',
      [user],
    );
    expect(Number(count!.count)).toBe(0);
  });
});
