import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PUBLIC_CONTENT_REVIEW_VERSION } from '@future-flow/contracts';
import {
  DomainError,
  hash,
  instantiateScenarioTemplate,
  assemblePublicContent,
  validatePublicContent,
  preparePublicContentReviewInput,
  validatePublicContentReviewReport,
} from '@future-flow/core';
import {
  Repository,
  LifeRepository,
  LifeJobRepository,
  PublicDraftRepository,
  PublicForkCheckpointRepository,
  PublicContentRepository,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { lifeTestAi } from './life-fixtures';
import { scenarioFixture } from './scenario-fixtures';
import { contentBundlesForPreview } from '../apps/web/lib/public-content';

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
    undefined,
    undefined,
    true,
    true,
  );
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  await engine?.close();
});
const bundles = () => new PublicContentRepository(db, true);
async function user() {
  const id = randomUUID();
  users.add(id);
  await repo.ensureUser(id);
  await repo.acceptPrivacy(id);
  return id;
}
async function fixture() {
  const owner = await user(),
    lives = new LifeRepository(db),
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
  );
  return {
    owner,
    lives,
    created,
    preview,
    forks,
    checkpoint,
    request: {
      snapshotHash: preview.snapshotHash,
      sourceRevision: preview.sourceRevision,
      selectedCheckpointIds: [checkpoint.checkpointId],
      acknowledged: true,
    },
  };
}
describe('full immutable public preparation', () => {
  it('verifies browser bundle hashes, selections and copy binding before displaying', async () => {
    const f = await fixture(),
      saved = await bundles().save(
        f.owner,
        f.preview.draftId,
        f.request,
        randomUUID(),
      ),
      raw = { enabled: true, bundles: [saved] };
    expect(
      (await contentBundlesForPreview(raw, [f.checkpoint], f.preview)).data
        .bundles,
    ).toEqual([saved]);
    const variants = [
      { ...saved, draftId: randomUUID() },
      { ...saved, snapshotHash: '0'.repeat(64) },
      { ...saved, sourceRevision: saved.sourceRevision + 1 },
      { ...saved, contentHash: '0'.repeat(64) },
      { ...saved, selection: [] },
      {
        ...saved,
        selection: [{ ...saved.selection[0], checkpointId: randomUUID() }],
      },
      {
        ...saved,
        content: {
          ...saved.content,
          snapshot: {
            ...saved.content.snapshot,
            summary: 'Another seemingly safe summary',
          },
        },
      },
    ];
    for (const changed of variants)
      await expect(
        contentBundlesForPreview(
          { enabled: true, bundles: [changed] },
          [f.checkpoint],
          f.preview,
        ),
      ).rejects.toThrow();
    await expect(
      contentBundlesForPreview(
        { enabled: true, bundles: [saved, saved] },
        [f.checkpoint],
        f.preview,
      ),
    ).rejects.toThrow();
    await expect(
      contentBundlesForPreview(raw, [], f.preview),
    ).rejects.toThrow();
    await expect(
      contentBundlesForPreview(
        { enabled: true, bundles: [] },
        [{ ...f.checkpoint, draftId: randomUUID() }],
        f.preview,
      ),
    ).rejects.toThrow();
  });
  it('includes every typed scalar, excludes private IDs and distinguishes story-only content', async () => {
    const f = await fixture(),
      content = assemblePublicContent(f.preview.snapshot, [
        f.checkpoint.checkpoint,
      ]);
    content.checkpoints[0]!.startingState.resources.energy = 0;
    content.checkpoints[0]!.decision.options[1]!.preconditions.push({
      type: 'asset_is_owned',
      assetKey: 'asset-1',
      owned: true,
    });
    const input = preparePublicContentReviewInput(content);
    expect(input.content).toEqual(content);
    expect(input.policyVersion).toBe(PUBLIC_CONTENT_REVIEW_VERSION);
    const text = JSON.stringify(input);
    for (const id of [
      f.owner,
      f.created.lifeId,
      f.created.branchId,
      f.preview.draftId,
      f.preview.snapshot.snapshotKey,
      f.checkpoint.checkpointId,
    ])
      expect(text).not.toContain(id);
    const values = input.fields.map((field) =>
      field.path
        .split('.')
        .reduce<unknown>(
          (value, key) => (value as Record<string, unknown>)[key],
          content,
        ),
    );
    expect(values).toContain(false);
    expect(values).toContain(null);
    expect(values).toContain(0);
    expect(input.fields.some((f) => f.path.includes('.preconditions.'))).toBe(
      true,
    );
    expect(input.fields.some((f) => f.path.includes('.changes.'))).toBe(true);
    expect(
      input.fields.some((f) => f.path.includes('.finance.liquidFunds')),
    ).toBe(true);
    expect(new Set(input.fields.map((f) => f.path)).size).toBe(
      input.fields.length,
    );
    expect(hash(assemblePublicContent(f.preview.snapshot, []))).not.toBe(
      hash(content),
    );
    expect(content.publicationApproved).toBe(false);
    expect(content.checkpoints[0]!.readyForPublicFork).toBe(false);
  });
  it('changes the content hash for prose, numeric facts, conditions and effects', async () => {
    const f = await fixture(),
      original = assemblePublicContent(f.preview.snapshot, [
        f.checkpoint.checkpoint,
      ]);
    const prose = structuredClone(original);
    prose.checkpoints[0]!.goals[0]!.motivation =
      'Another generalized motivation';
    const numbers = structuredClone(original);
    numbers.checkpoints[0]!.startingState.finance.liquidFunds! += 1;
    const changes = structuredClone(original);
    changes.checkpoints[0]!.decision.options[0]!.changes.push({
      type: 'skill_add',
      value: 'A different practical skill',
    });
    const conditions = structuredClone(original);
    conditions.checkpoints[0]!.decision.options[0]!.preconditions.push({
      type: 'asset_is_owned',
      assetKey: 'asset-999',
      owned: true,
    });
    // Even an invalid proposed condition has a distinct digest; it cannot silently reuse a review.
    for (const changed of [prose, numbers, changes, conditions])
      expect(hash(changed)).not.toBe(hash(original));
    expect(validatePublicContent(numbers)).toEqual(numbers);
    expect(validatePublicContent(prose)).toEqual(prose);
  });
  it('rejects different displayed decisions, invalid dates, duplicate points and extra private fields', async () => {
    const f = await fixture(),
      content = assemblePublicContent(f.preview.snapshot, [
        f.checkpoint.checkpoint,
      ]);
    const prompt = structuredClone(content);
    prompt.checkpoints[0]!.decision.prompt = 'A different public question';
    const date = structuredClone(content);
    date.checkpoints[0]!.startingState.effectiveAt = '2050-01-01';
    const choice = structuredClone(content);
    choice.snapshot.periods[0]!.decision.selectedOptionKey = 'option-999';
    for (const invalid of [
      prompt,
      date,
      choice,
      {
        ...content,
        checkpoints: [...content.checkpoints, ...content.checkpoints],
      },
      { ...content, privateProfile: { name: 'Private owner' } },
      {
        ...content,
        snapshot: { ...content.snapshot, snapshotKey: randomUUID() },
      },
    ])
      expect(() => validatePublicContent(invalid)).toThrow();
  });
  it('fails closed on identifying content and oversized content without truncating it', async () => {
    const f = await fixture(),
      content = assemblePublicContent(f.preview.snapshot, []);
    expect(() =>
      validatePublicContent({
        ...content,
        snapshot: {
          ...content.snapshot,
          summary: 'Contact owner@example.invalid',
        },
      }),
    ).toThrowError(expect.objectContaining({ code: 'PUBLIC_CONTENT_PRIVACY' }));
    const large = structuredClone(content),
      period = large.snapshot.periods[0]!;
    large.snapshot.periods = Array.from({ length: 12 }, (_, i) => ({
      ...structuredClone(period),
      key: `period-${i + 1}`,
      chapter: { title: 'A long fictional chapter', body: '漢'.repeat(10000) },
      events: period.events.map((e, j) => ({
        ...e,
        key: `event-${i * 5 + j + 1}`,
      })),
      decision: {
        ...structuredClone(period.decision),
        key: `decision-${i + 1}`,
        selectedOptionKey: null,
        options: period.decision.options.map((o, j) => ({
          ...o,
          key: `option-${i * 4 + j + 1}`,
        })),
      },
    }));
    expect(() => validatePublicContent(large)).toThrowError(
      expect.objectContaining({ code: 'PUBLIC_CONTENT_LIMIT' }),
    );
  });
  it('requires the new full scope, exact hash and valid findings, independently of text review', async () => {
    const f = await fixture(),
      content = assemblePublicContent(f.preview.snapshot, [
        f.checkpoint.checkpoint,
      ]),
      input = preparePublicContentReviewInput(content),
      report = {
        policyVersion: PUBLIC_CONTENT_REVIEW_VERSION,
        scope: 'story_and_selected_checkpoints',
        contentHash: hash(content),
        publicationApproved: false,
        verdict: 'no_findings',
        findings: [],
      };
    expect(
      validatePublicContentReviewReport(report, content).publicationApproved,
    ).toBe(false);
    const finding = {
      fieldKey: input.fields[0]!.key,
      category: 'unverifiable_structure',
      action: 'manual_review',
    };
    expect(
      validatePublicContentReviewReport(
        { ...report, verdict: 'review_required', findings: [finding] },
        content,
      ).verdict,
    ).toBe('review_required');
    for (const invalid of [
      { verdict: 'no_findings', findings: [] },
      { ...report, contentHash: '0'.repeat(64) },
      { ...report, scope: 'text_only' },
      { ...report, publicationApproved: true },
      { ...report, findings: [finding] },
      { ...report, verdict: 'review_required' },
      {
        ...report,
        verdict: 'review_required',
        findings: [{ ...finding, fieldKey: 'field-99999' }],
      },
      { ...report, verdict: 'review_required', findings: [finding, finding] },
    ])
      expect(() =>
        validatePublicContentReviewReport(invalid, content),
      ).toThrow();
  });
  it('records explicit selection once and supports free reads/reuse when disabled', async () => {
    const f = await fixture(),
      key = randomUUID(),
      saved = await bundles().save(f.owner, f.preview.draftId, f.request, key),
      disabled = new PublicContentRepository(db);
    expect(saved.contentHash).toBe(hash(saved.content));
    expect(saved.selection[0]!.checkpointId).toBe(f.checkpoint.checkpointId);
    expect(
      await disabled.save(f.owner, f.preview.draftId, f.request, key),
    ).toEqual(saved);
    expect(
      await disabled.save(f.owner, f.preview.draftId, f.request, randomUUID()),
    ).toEqual(saved);
    expect(
      (await disabled.workspace(f.owner, f.preview.draftId)).bundles,
    ).toEqual([saved]);
    const changed = { ...f.request, selectedCheckpointIds: [] };
    await expect(
      bundles().save(f.owner, f.preview.draftId, changed, key),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      disabled.save(f.owner, f.preview.draftId, changed, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLIC_CONTENT_DISABLED' });
  });
  it('creates new immutable bundles for removal and replacement of a checkpoint', async () => {
    const f = await fixture(),
      first = await bundles().save(
        f.owner,
        f.preview.draftId,
        f.request,
        randomUUID(),
      ),
      story = await bundles().save(
        f.owner,
        f.preview.draftId,
        { ...f.request, selectedCheckpointIds: [] },
        randomUUID(),
      );
    const next = structuredClone(f.checkpoint.checkpoint);
    next.goals[0]!.motivation = 'A newly generalized motivation';
    const cp = await f.forks.save(
      f.owner,
      f.preview.draftId,
      {
        snapshotHash: f.preview.snapshotHash,
        sourceRevision: f.preview.sourceRevision,
        checkpoint: next,
      },
      randomUUID(),
    );
    const third = await bundles().save(
      f.owner,
      f.preview.draftId,
      { ...f.request, selectedCheckpointIds: [cp.checkpointId] },
      randomUUID(),
    );
    expect(new Set([first, story, third].map((b) => b.contentHash)).size).toBe(
      3,
    );
    expect(
      (await bundles().workspace(f.owner, f.preview.draftId)).bundles,
    ).toContainEqual(first);
    for (const table of [
      'aw_public_content_bundles',
      'aw_public_content_bundle_checkpoints',
    ])
      await expect(
        db.query(`UPDATE ${table} SET user_id=$1 WHERE user_id=$1`, [f.owner]),
      ).rejects.toThrow();
  });
  it('rejects unacknowledged, duplicate, foreign and wrong-copy selections', async () => {
    const f = await fixture(),
      foreign = await fixture();
    for (const changed of [
      { ...f.request, acknowledged: false },
      {
        ...f.request,
        selectedCheckpointIds: [
          f.checkpoint.checkpointId,
          f.checkpoint.checkpointId,
        ],
      },
      {
        ...f.request,
        selectedCheckpointIds: [foreign.checkpoint.checkpointId],
      },
      { ...f.request, snapshotHash: '0'.repeat(64) },
      { ...f.request, sourceRevision: f.request.sourceRevision + 1 },
      { ...f.request, publicationApproved: true },
    ])
      await expect(
        bundles().save(f.owner, f.preview.draftId, changed, randomUUID()),
      ).rejects.toThrow();
    expect(
      (await bundles().workspace(f.owner, f.preview.draftId)).bundles,
    ).toHaveLength(0);
  });
  it('rejects two versions of one decision', async () => {
    const f = await fixture(),
      next = structuredClone(f.checkpoint.checkpoint);
    next.identity.label = 'A fictional creative adult';
    const cp = await f.forks.save(
      f.owner,
      f.preview.draftId,
      {
        snapshotHash: f.preview.snapshotHash,
        sourceRevision: f.preview.sourceRevision,
        checkpoint: next,
      },
      randomUUID(),
    );
    await expect(
      bundles().save(
        f.owner,
        f.preview.draftId,
        {
          ...f.request,
          selectedCheckpointIds: [cp.checkpointId, f.checkpoint.checkpointId],
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_CONTENT_INVALID' });
  });
  it('uses owner-only HTTP endpoints and has no publication or start endpoint', async () => {
    const f = await fixture(),
      other = await user(),
      url = `${base}/api/v2/public-previews/${f.preview.draftId}/content-bundles`;
    expect((await fetch(url)).status).toBe(401);
    expect(
      (await fetch(url, { headers: { Authorization: `Bearer ${other}` } }))
        .status,
    ).toBe(404);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${f.owner}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify(f.request),
    });
    expect(response.status).toBe(201);
    expect((await response.json()).publicationApproved).toBe(false);
    expect(
      (
        await fetch(url + '/start', {
          method: 'POST',
          headers: { Authorization: `Bearer ${f.owner}` },
        })
      ).status,
    ).toBe(404);
  });
  it('invalidates both free reads and idempotent reuse after a source choice', async () => {
    const f = await fixture(),
      key = randomUUID();
    await bundles().save(f.owner, f.preview.draftId, f.request, key);
    const branch = await f.lives.branch(f.owner, f.created.branchId),
      decision = branch.pending_decision!;
    await f.lives.choose(
      f.owner,
      branch.id,
      branch.revision,
      decision.id,
      decision.options[1]!.id,
      randomUUID(),
    );
    await expect(
      bundles().workspace(f.owner, f.preview.draftId),
    ).rejects.toMatchObject({ code: 'LIFE_REVISION_CONFLICT' });
    await expect(
      bundles().save(f.owner, f.preview.draftId, f.request, key),
    ).rejects.toMatchObject({ code: 'LIFE_REVISION_CONFLICT' });
  });
  it('denies deletion and missing consent before replay', async () => {
    const f = await fixture(),
      key = randomUUID();
    await bundles().save(f.owner, f.preview.draftId, f.request, key);
    await repo.markDeleting(f.owner);
    await expect(
      bundles().save(f.owner, f.preview.draftId, f.request, key),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DELETING' });
    await expect(
      bundles().workspace(f.owner, f.preview.draftId),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DELETING' });
    await repo.restoreActive(f.owner);
    await db.query('DELETE FROM ff_consents WHERE user_id=$1', [f.owner]);
    await expect(
      bundles().workspace(f.owner, f.preview.draftId),
    ).rejects.toMatchObject({ code: 'PRIVACY_ACKNOWLEDGEMENT_REQUIRED' });
  });
  it('denies expired copies before story-only save or free read', async () => {
    const f = await fixture(),
      id = randomUUID();
    await db.query(
      "INSERT INTO aw_publication_drafts(id,user_id,life_id,branch_id,source_revision,snapshot,snapshot_hash,scan_version,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()-interval '1 minute')",
      [
        id,
        f.owner,
        f.created.lifeId,
        f.created.branchId,
        f.preview.sourceRevision,
        JSON.stringify(f.preview.snapshot),
        f.preview.snapshotHash,
        f.preview.scanVersion,
      ],
    );
    await expect(
      bundles().save(
        f.owner,
        id,
        { ...f.request, selectedCheckpointIds: [] },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_PREVIEW_EXPIRED' });
    await expect(bundles().workspace(f.owner, id)).rejects.toMatchObject({
      code: 'PUBLIC_PREVIEW_EXPIRED',
    });
  });
  it('exports and cascades both tables with RLS and no client grants', async () => {
    const f = await fixture();
    await bundles().save(f.owner, f.preview.draftId, f.request, randomUUID());
    const exported = await repo.exportAccount(f.owner);
    for (const table of [
      'aw_public_content_bundles',
      'aw_public_content_bundle_checkpoints',
    ]) {
      expect(exported[table]).toHaveLength(1);
      const [guard] = await db.query(
        "SELECT c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'INSERT') AS client FROM pg_class c WHERE c.oid=$1::regclass",
        [table],
      );
      expect(guard).toEqual({ rls: true, anon: false, client: false });
    }
    await repo.deleteAccountData(f.owner);
    for (const table of [
      'aw_public_content_bundles',
      'aw_public_content_bundle_checkpoints',
    ])
      expect(
        await db.query(`SELECT * FROM ${table} WHERE user_id=$1`, [f.owner]),
      ).toHaveLength(0);
  });
});
