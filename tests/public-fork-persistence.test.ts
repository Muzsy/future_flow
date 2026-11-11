import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { INestApplication } from '@nestjs/common';
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
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { lifeTestAi } from './life-fixtures';
import { scenarioFixture } from './scenario-fixtures';
import {
  checkpointsForPreview,
  checkpointTextFields,
  editCheckpointText,
  checkpointStateFacts,
  changeDescription,
} from '../apps/web/lib/fork-preview';

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
  );
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  await engine?.close();
});
async function user() {
  const id = randomUUID();
  users.add(id);
  await repo.ensureUser(id);
  await repo.acceptPrivacy(id);
  return id;
}
const forks = () => new PublicForkCheckpointRepository(db, true);
async function fixture(context?: string) {
  const input = instantiateScenarioTemplate(scenarioFixture());
  if (context) input.environment.description = context;
  const owner = await user(),
    lives = new LifeRepository(db),
    created = await lives.createPrepared(owner, input, randomUUID()),
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
    );
  const [candidate] = await forks().candidates(owner, preview.draftId);
  if (!context) expect(candidate!.checkpoint).not.toBeNull();
  return {
    owner,
    lives,
    created,
    preview,
    checkpoint: candidate!.checkpoint!,
    request: {
      snapshotHash: preview.snapshotHash,
      sourceRevision: preview.sourceRevision,
      checkpoint: candidate!.checkpoint!,
    },
  };
}
describe('private source-bound checkpoint preparation', () => {
  it('binds browser candidates and saved details to the exact displayed copy', async () => {
    const f = await fixture(),
      candidates = await forks().candidates(f.owner, f.preview.draftId),
      saved = await forks().save(
        f.owner,
        f.preview.draftId,
        f.request,
        randomUUID(),
      );
    expect(checkpointsForPreview(candidates, [saved], f.preview).saved).toEqual(
      [saved],
    );
    for (const wrong of [
      { ...saved, draftId: randomUUID() },
      { ...saved, snapshotHash: '0'.repeat(64) },
      { ...saved, sourceRevision: saved.sourceRevision + 1 },
      {
        ...saved,
        checkpoint: {
          ...saved.checkpoint,
          decision: {
            ...saved.checkpoint.decision,
            prompt: 'Another decision question',
          },
        },
      },
    ])
      expect(() =>
        checkpointsForPreview(candidates, [wrong], f.preview),
      ).toThrow();
    expect(() =>
      checkpointsForPreview(candidates, [saved, saved], f.preview),
    ).toThrow();
    expect(() => checkpointsForPreview([], [], f.preview)).toThrow();
    expect(() =>
      checkpointsForPreview(
        [{ ...candidates[0], unavailableReason: 'privacy' }],
        [],
        f.preview,
      ),
    ).toThrow();
    expect(
      checkpointsForPreview(
        [
          {
            decisionKey: candidates[0]!.decisionKey,
            checkpoint: null,
            unavailableReason: 'privacy',
          },
        ],
        [],
        f.preview,
      ).candidates[0]!.checkpoint,
    ).toBeNull();
  });
  it('allows privacy prose edits from the UI while retaining source-bound executable facts', async () => {
    const f = await fixture(),
      before = hash(f.checkpoint);
    let updated = f.checkpoint;
    for (const field of checkpointTextFields(updated))
      updated = editCheckpointText(
        updated,
        field.path,
        'A generalized description',
      );
    expect(hash(f.checkpoint)).toBe(before);
    expect(updated.startingState.finance).toEqual(
      f.checkpoint.startingState.finance,
    );
    expect(updated.decision.prompt).toBe(f.checkpoint.decision.prompt);
    expect(
      updated.decision.options.map((option) => ({
        label: option.label,
        preconditions: option.preconditions,
      })),
    ).toEqual(
      f.checkpoint.decision.options.map((option) => ({
        label: option.label,
        preconditions: option.preconditions,
      })),
    );
    const record = await forks().save(
      f.owner,
      f.preview.draftId,
      { ...f.request, checkpoint: updated },
      randomUUID(),
    );
    expect(record.checkpoint).toEqual(updated);
    expect(record.publicationApproved).toBe(false);
    expect(record.checkpoint.readyForPublicFork).toBe(false);
    expect(
      editCheckpointText(updated, ['identity', 'label'], '   ').identity.label,
    ).toBeNull();
    for (const path of [
      ['startingState', 'finance', 'liquidFunds'],
      ['goals', 0, 'horizonMonths'],
      ['decision', 'prompt'],
      ['decision', 'options', 0, 'label'],
      ['referenceCatalog', 'assetKeys', 0],
      ['__proto__', 'label'],
    ])
      expect(() => editCheckpointText(updated, path, 'Changed')).toThrow();
  });
  it('shows exact numbers, missing values and distinct consequences without applying a choice', async () => {
    const f = await fixture(),
      before = hash(f.checkpoint);
    const financial = changeDescription(
      {
        type: 'finance_set',
        value: { currency: 'USD', monthlyIncome: 0, liquidFunds: -125 },
      },
      f.checkpoint,
    );
    expect(financial).toContain('monthly income: 0 USD');
    expect(financial).toContain('liquid funds: -125 USD');
    expect(
      changeDescription(
        {
          type: 'resources_set',
          value: { energy: 0, availableHoursPerWeek: 0 },
        },
        f.checkpoint,
      ),
    ).toContain('available time: 0 hours per week');
    expect(
      changeDescription(
        {
          type: 'location_set',
          value: { country: null, region: null, housing: null },
        },
        f.checkpoint,
      ),
    ).toContain('Country: Not specified');
    const facts = checkpointStateFacts(f.checkpoint);
    expect(facts.find(([key]) => key === 'Assets')?.[1]).toContain(
      'Asset 1: A business asset',
    );
    expect(facts.find(([key]) => key === 'Assets')?.[1]).toContain(
      'Asset 2: A business asset',
    );
    expect(facts.find(([key]) => key === 'Date')?.[1]).toBe(
      f.checkpoint.startingState.effectiveAt,
    );
    for (const option of f.checkpoint.decision.options)
      for (const change of option.changes)
        expect(changeDescription(change, f.checkpoint).length).toBeGreaterThan(
          10,
        );
    expect(hash(f.checkpoint)).toBe(before);
  });
  it('keeps a point unavailable when preserved context cannot pass the privacy preflight', async () => {
    const f = await fixture(
        'A private context containing owner@example.invalid',
      ),
      [candidate] = await forks().candidates(f.owner, f.preview.draftId);
    expect(candidate).toEqual({
      decisionKey: 'decision-1',
      checkpoint: null,
      unavailableReason: 'privacy',
    });
    expect(await forks().list(f.owner, f.preview.draftId)).toEqual([]);
  });
  it('offers a separate candidate without changing the old coarse snapshot or invoking AI', async () => {
    const f = await fixture(),
      before = hash(f.preview.snapshot),
      [candidate] = await forks().candidates(f.owner, f.preview.draftId);
    expect(candidate!.unavailableReason).toBeNull();
    expect(candidate!.checkpoint!.startingState.ownedAssets).toHaveLength(2);
    expect(candidate!.checkpoint!.startingState.actors[0]!.label).toBe(
      'A friend',
    );
    expect(candidate!.checkpoint!.readyForPublicFork).toBe(false);
    expect(f.preview.snapshot.startingPoint.readyForFork).toBe(false);
    expect(await forks().list(f.owner, f.preview.draftId)).toEqual([]);
    expect(
      hash(
        (await new PublicDraftRepository(db).get(f.owner, f.preview.draftId))
          .snapshot,
      ),
    ).toBe(before);
    const [count] = await db.query(
      'SELECT count(*)::int AS n FROM aw_jobs WHERE user_id=$1',
      [f.owner],
    );
    expect(count!.n).toBe(1);
  });
  it('stores an immutable copy once, binds both hashes and supports free reuse when disabled', async () => {
    const f = await fixture(),
      key = randomUUID(),
      saved = await forks().save(f.owner, f.preview.draftId, f.request, key);
    expect(saved.checkpointHash).toBe(hash(f.checkpoint));
    expect(saved.snapshotHash).toBe(f.preview.snapshotHash);
    expect(saved.publicationApproved).toBe(false);
    const disabled = new PublicForkCheckpointRepository(db),
      reuseKey = randomUUID();
    expect(
      await disabled.save(f.owner, f.preview.draftId, f.request, key),
    ).toEqual(saved);
    expect(
      await disabled.save(f.owner, f.preview.draftId, f.request, reuseKey),
    ).toEqual(saved);
    expect(await disabled.list(f.owner, f.preview.draftId)).toEqual([saved]);
    const changed = structuredClone(f.request);
    changed.checkpoint.goals[0]!.motivation = 'An edited safe motivation.';
    await expect(
      forks().save(f.owner, f.preview.draftId, changed, reuseKey),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      db.query(
        'UPDATE aw_public_fork_checkpoints SET checkpoint_hash=$1 WHERE id=$2',
        ['0'.repeat(64), saved.checkpointId],
      ),
    ).rejects.toThrow();
  });
  it('rejects changed executable facts, private fields and wrong snapshot bindings without storing', async () => {
    const f = await fixture(),
      money = structuredClone(f.request);
    money.checkpoint.startingState.finance.liquidFunds = 6000;
    await expect(
      forks().save(f.owner, f.preview.draftId, money, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLIC_FORK_SEMANTICS' });
    await expect(
      forks().save(
        f.owner,
        f.preview.draftId,
        { ...f.request, snapshotHash: '0'.repeat(64) },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_FORK_SOURCE' });
    const contact = structuredClone(f.request);
    contact.checkpoint.goals[0]!.motivation = 'owner@example.invalid';
    await expect(
      forks().save(f.owner, f.preview.draftId, contact, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLIC_FORK_PRIVACY' });
    await expect(
      forks().save(
        f.owner,
        f.preview.draftId,
        { ...f.request, official: true },
        randomUUID(),
      ),
    ).rejects.toThrow();
    expect(await forks().list(f.owner, f.preview.draftId)).toEqual([]);
  });
  it('defaults to no new saves and keeps every read/write restricted to the actual owner', async () => {
    const f = await fixture(),
      other = await user();
    await expect(
      new PublicForkCheckpointRepository(db).save(
        f.owner,
        f.preview.draftId,
        f.request,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_FORK_DISABLED' });
    await expect(
      forks().candidates(other, f.preview.draftId),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    await expect(
      forks().save(other, f.preview.draftId, f.request, randomUUID()),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    const anon = await fetch(
      `${base}/api/v2/public-previews/${f.preview.draftId}/fork-checkpoint-candidates`,
    );
    expect(anon.status).toBe(401);
    const foreign = await fetch(
      `${base}/api/v2/public-previews/${f.preview.draftId}/fork-checkpoints`,
      { headers: { Authorization: `Bearer ${other}` } },
    );
    expect(foreign.status).toBe(404);
    const response = await fetch(
      `${base}/api/v2/public-previews/${f.preview.draftId}/fork-checkpoints`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${f.owner}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify(f.request),
      },
    );
    expect(response.status).toBe(201);
    expect((await response.json()).publicationApproved).toBe(false);
    const noStart = await fetch(
      `${base}/api/v2/public-previews/${f.preview.draftId}/fork-checkpoints/start`,
      { method: 'POST', headers: { Authorization: `Bearer ${f.owner}` } },
    );
    expect(noStart.status).toBe(404);
  });
  it('invalidates both read and save when the source revision changes or deletion starts', async () => {
    const f = await fixture();
    await forks().save(f.owner, f.preview.draftId, f.request, randomUUID());
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
      forks().list(f.owner, f.preview.draftId),
    ).rejects.toMatchObject({ code: 'LIFE_REVISION_CONFLICT' });
    await expect(
      forks().save(f.owner, f.preview.draftId, f.request, randomUUID()),
    ).rejects.toMatchObject({ code: 'LIFE_REVISION_CONFLICT' });
    await repo.markDeleting(f.owner);
    await expect(
      forks().candidates(f.owner, f.preview.draftId),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DELETING' });
  });
  it('denies expired previews without creating any checkpoint', async () => {
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
    await expect(forks().candidates(f.owner, id)).rejects.toMatchObject({
      code: 'PUBLIC_PREVIEW_EXPIRED',
    });
    await expect(
      forks().save(f.owner, id, f.request, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLIC_PREVIEW_EXPIRED' });
    expect(
      (
        await db.query(
          'SELECT id FROM aw_public_fork_checkpoints WHERE draft_id=$1',
          [id],
        )
      ).length,
    ).toBe(0);
  });
  it('exports/cascades the checkpoint and denies direct client access', async () => {
    const f = await fixture();
    await forks().save(f.owner, f.preview.draftId, f.request, randomUUID());
    expect(
      (await repo.exportAccount(f.owner)).aw_public_fork_checkpoints,
    ).toHaveLength(1);
    const [guard] = await db.query(
      "SELECT c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'INSERT') AS client FROM pg_class c WHERE c.oid='aw_public_fork_checkpoints'::regclass",
    );
    expect(guard).toEqual({ rls: true, anon: false, client: false });
    await repo.deleteAccountData(f.owner);
    expect(
      (
        await db.query(
          'SELECT id FROM aw_public_fork_checkpoints WHERE user_id=$1',
          [f.owner],
        )
      ).length,
    ).toBe(0);
  });
});
