import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { scenarioTemplateSchema } from '@future-flow/contracts';
import {
  DomainError,
  hash,
  instantiateScenarioTemplate,
  validateScenarioTemplate,
  applyFactChangesV2,
} from '@future-flow/core';
import {
  Repository,
  ScenarioRepository,
  LifeRepository,
  LifeJobRepository,
  scenarioVersionsEnabledFromEnv,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { lifeTestAi } from './life-fixtures';
import { scenarioFixture } from './scenario-fixtures';

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
    true,
  );
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  await engine?.close();
});
async function user(consent = true) {
  const id = randomUUID();
  users.add(id);
  await repo.ensureUser(id);
  if (consent) await repo.acceptPrivacy(id);
  return id;
}
const scenarios = (limits = { daily: 10, concurrent: 2 }) =>
  new ScenarioRepository(db, true, limits);
async function fixture() {
  const owner = await user(),
    template = scenarioFixture(),
    version = await scenarios().create(owner, { template }, randomUUID());
  return {
    owner,
    template,
    version,
    request: { templateHash: version.templateHash, acknowledged: true },
  };
}
describe('closed executable scenario templates', () => {
  it('materializes fresh private IDs with full facts and internally consistent references', () => {
    const template = scenarioFixture(),
      before = hash(template),
      a = instantiateScenarioTemplate(template),
      b = instantiateScenarioTemplate(template);
    expect(hash(template)).toBe(before);
    expect(a.visibility).toBe('private');
    expect(a.identity.baseProfileVersionId).toBeNull();
    expect(a.locale).toBe('en');
    const ids = (input: typeof a) => [
      input.lifeId,
      input.branchId,
      ...input.goals.map((x) => x.id),
      ...input.initialState.ownedAssets.map((x) => x.id),
      ...input.initialState.actors.map((x) => x.id),
      ...input.initialState.opportunities.map((x) => x.id),
      ...input.constraints.map((x) => x.id),
    ];
    expect(ids(a).some((id) => ids(b).includes(id))).toBe(false);
    expect(a.initialState.goals.map((x) => x.goalId)).toEqual(
      a.goals.map((x) => x.id),
    );
    expect(a.constraints[0]!.branchId).toBe(a.branchId);
    expect(a.constraints[1]!.branchId).toBeNull();
    expect(a.constraints[0]!.predicate).toEqual({
      type: 'asset_is_owned',
      assetId: a.initialState.ownedAssets[0]!.id,
      owned: true,
    });
    expect(a.initialState.opportunities[0]!.expiresAt).toBe('2027-04-05');
    expect(JSON.stringify(a)).not.toContain('asset-1');
  });
  it('rejects private DTO fields, UUID placeholders and unavailable languages', () => {
    for (const extra of [
      { lifeId: randomUUID() },
      { visibility: 'public' },
      { sharedMemberships: [] },
      { profile: {} },
      { memory: {} },
    ])
      expect(
        scenarioTemplateSchema.safeParse({ ...scenarioFixture(), ...extra })
          .success,
      ).toBe(false);
    expect(
      scenarioTemplateSchema.safeParse({
        ...scenarioFixture(),
        contentLocale: 'hu',
      }).success,
    ).toBe(false);
    const template = scenarioFixture();
    template.startingState.actors[0]!.key = randomUUID();
    expect(() => validateScenarioTemplate(template)).toThrow();
  });
  it.each([
    'owner@example.invalid',
    'https://example.invalid/private',
    '+441234567890',
    randomUUID(),
  ])('blocks contact/reference data in all nested prose: %s', (text) => {
    const template = scenarioFixture();
    template.goals[1]!.motivation = text;
    expect(() => validateScenarioTemplate(template)).toThrowError(
      expect.objectContaining({ code: 'SCENARIO_PRIVACY_PREFLIGHT' }),
    );
  });
  it('rejects duplicate placeholders, missing assets and inconsistent primary goals', () => {
    const duplicate = scenarioFixture();
    duplicate.goals[1]!.key = 'goal-1';
    const missing = scenarioFixture();
    missing.startingState.ownedAssets = [];
    const primary = scenarioFixture();
    primary.goals[0]!.status = 'achieved';
    const two = scenarioFixture();
    two.goals[1]!.priority = 'primary';
    for (const template of [duplicate, missing, primary, two])
      expect(() => validateScenarioTemplate(template)).toThrowError(
        expect.objectContaining({ code: 'SCENARIO_REFERENCE' }),
      );
  });
  it('checks hard constraints, intervals, real calendar dates and expired opportunities', () => {
    const hard = scenarioFixture();
    hard.constraints[0]!.predicate = { type: 'country_is', value: 'US' };
    expect(() => validateScenarioTemplate(hard)).toThrowError(
      expect.objectContaining({ code: 'LIFE_HARD_CONSTRAINT' }),
    );
    const interval = scenarioFixture();
    interval.constraints[0]!.validUntil = interval.constraints[0]!.validFrom;
    expect(() => validateScenarioTemplate(interval)).toThrowError(
      expect.objectContaining({ code: 'LIFE_CONSTRAINT_INTERVAL' }),
    );
    const date = scenarioFixture();
    date.startingState.effectiveAt = '2026-02-30';
    expect(() => validateScenarioTemplate(date)).toThrow();
    const expiry = scenarioFixture();
    expiry.startingState.opportunities[0]!.expiresAt =
      expiry.startingState.effectiveAt;
    expect(() => validateScenarioTemplate(expiry)).toThrowError(
      expect.objectContaining({ code: 'SCENARIO_INTERVAL' }),
    );
  });
  it('preserves the exclusive expiry of a remapped asset constraint', () => {
    const input = instantiateScenarioTemplate(scenarioFixture()),
      scope = {
        lifeId: input.lifeId,
        branchId: input.branchId,
        acceptedDecisionIds: [],
      };
    const change = {
      type: 'asset_remove' as const,
      assetId: input.initialState.ownedAssets[0]!.id,
    };
    expect(() =>
      applyFactChangesV2(
        input.initialState,
        [change],
        '2027-04-04',
        [],
        input.constraints,
        scope,
      ),
    ).toThrowError(expect.objectContaining({ code: 'LIFE_HARD_CONSTRAINT' }));
    expect(
      applyFactChangesV2(
        input.initialState,
        [change],
        '2027-04-05',
        [],
        input.constraints,
        scope,
      ).state.ownedAssets,
    ).toEqual([]);
  });
  it('defaults to disabled and refuses invalid configuration', () => {
    expect(scenarioVersionsEnabledFromEnv({})).toBe(false);
    expect(
      scenarioVersionsEnabledFromEnv({ SCENARIO_VERSIONS_ENABLED: 'true' }),
    ).toBe(true);
    expect(() =>
      scenarioVersionsEnabledFromEnv({ SCENARIO_VERSIONS_ENABLED: 'yes' }),
    ).toThrow();
  });
});
describe('owner-only scenario versions and guarded private starts', () => {
  it('stores immutable versions, lists only the current version and replays idempotent saves', async () => {
    const owner = await user(),
      key = randomUUID(),
      template = scenarioFixture(),
      first = await scenarios().create(owner, { template }, key);
    expect(await scenarios().create(owner, { template }, key)).toEqual(first);
    const next = {
        expectedVersion: 1,
        expectedHash: first.templateHash,
        template: { ...template, title: 'A revised synthetic template' },
      },
      revisionKey = randomUUID();
    const second = await scenarios().revise(
      owner,
      first.scenarioId,
      next,
      revisionKey,
    );
    expect(second.version).toBe(2);
    expect(
      await scenarios().revise(owner, first.scenarioId, next, revisionKey),
    ).toEqual(second);
    expect(await scenarios().get(owner, first.id)).toEqual(first);
    expect(await scenarios().list(owner)).toEqual([second]);
    await expect(
      scenarios().revise(owner, first.scenarioId, next, randomUUID()),
    ).rejects.toMatchObject({ code: 'SCENARIO_REVISION_CONFLICT' });
    await expect(
      db.query('UPDATE aw_scenario_versions SET template_hash=$1 WHERE id=$2', [
        '0'.repeat(64),
        first.id,
      ]),
    ).rejects.toThrow();
    expect(first.publicationApproved).toBe(false);
  });
  it('keeps all reads and writes owner scoped and rejects undeclared fields at the API', async () => {
    const f = await fixture(),
      other = await user();
    await expect(scenarios().get(other, f.version.id)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    await expect(
      scenarios().start(other, f.version.id, f.request, randomUUID()),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    expect(await scenarios().list(other)).toEqual([]);
    const anon = await fetch(
      `${base}/api/v2/scenario-versions/${f.version.id}`,
    );
    expect(anon.status).toBe(401);
    const foreign = await fetch(
      `${base}/api/v2/scenario-versions/${f.version.id}`,
      { headers: { Authorization: `Bearer ${other}` } },
    );
    expect(foreign.status).toBe(404);
    const invalid = await fetch(`${base}/api/v2/scenarios`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${f.owner}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify({ template: f.template, official: true }),
    });
    expect(invalid.status).toBe(422);
  });
  it('requires account privacy consent and feature opt-in even on reads', async () => {
    const owner = await user(false);
    await expect(
      scenarios().create(owner, { template: scenarioFixture() }, randomUUID()),
    ).rejects.toMatchObject({ code: 'PRIVACY_ACKNOWLEDGEMENT_REQUIRED' });
    const f = await fixture();
    await expect(
      new ScenarioRepository(db).get(f.owner, f.version.id),
    ).rejects.toMatchObject({ code: 'SCENARIO_DISABLED' });
    await repo.markDeleting(f.owner);
    await expect(scenarios().get(f.owner, f.version.id)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETING',
    });
  });
  it('binds explicit generation acknowledgement to the exact version hash', async () => {
    const f = await fixture();
    await expect(
      scenarios().start(
        f.owner,
        f.version.id,
        { ...f.request, acknowledged: false },
        randomUUID(),
      ),
    ).rejects.toThrow();
    await expect(
      scenarios().start(
        f.owner,
        f.version.id,
        { ...f.request, templateHash: '0'.repeat(64) },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'SCENARIO_REVISION_CONFLICT' });
    expect(
      (await db.query('SELECT id FROM aw_jobs WHERE user_id=$1', [f.owner]))
        .length,
    ).toBe(0);
  });
  it('starts exactly one new private life and job with bounded ownership-free memory', async () => {
    const f = await fixture(),
      key = randomUUID(),
      created = await scenarios().start(f.owner, f.version.id, f.request, key);
    expect(
      await scenarios().start(f.owner, f.version.id, f.request, key),
    ).toEqual(created);
    const branch = await new LifeRepository(db).branch(
      f.owner,
      created.branchId,
    );
    expect(branch.input.goals).toHaveLength(2);
    expect(branch.state.ownedAssets).toHaveLength(1);
    expect(branch.state.actors).toHaveLength(1);
    const [job] = await db.query(
      'SELECT payload FROM aw_jobs WHERE user_id=$1',
      [f.owner],
    );
    const payload = job!.payload as Record<string, unknown>;
    expect(payload.memory).toMatchObject({ recentEvents: [], choices: [] });
    expect(
      (payload.memory as Record<string, unknown>).sharedEvents,
    ).toBeUndefined();
    expect(branch.accepted_decision_ids).toEqual([]);
    expect(
      (
        await db.query(
          'SELECT life_id FROM aw_scenario_starts WHERE user_id=$1',
          [f.owner],
        )
      ).length,
    ).toBe(1);
    await expect(
      scenarios().start(
        f.owner,
        f.version.id,
        { ...f.request, templateHash: '1'.repeat(64) },
        key,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('uses the normal generation quotas and atomically rolls back refused starts', async () => {
    const f = await fixture(),
      limited = scenarios({ daily: 1, concurrent: 1 });
    await limited.start(f.owner, f.version.id, f.request, randomUUID());
    await expect(
      limited.start(f.owner, f.version.id, f.request, randomUUID()),
    ).rejects.toMatchObject({ code: 'GENERATION_LIMIT' });
    expect(
      (await db.query('SELECT id FROM aw_lives WHERE user_id=$1', [f.owner]))
        .length,
    ).toBe(1);
    expect(
      (
        await db.query(
          'SELECT life_id FROM aw_scenario_starts WHERE user_id=$1',
          [f.owner],
        )
      ).length,
    ).toBe(1);
  });
  it('continues three technical periods without altering the version or dropping template facts', async () => {
    const f = await fixture(),
      created = await scenarios().start(
        f.owner,
        f.version.id,
        f.request,
        randomUUID(),
      ),
      jobs = new LifeJobRepository(db),
      lives = new LifeRepository(db);
    const original = await lives.branch(f.owner, created.branchId),
      studioId = original.state.ownedAssets[0]!.id;
    let jobId = created.jobId;
    for (let i = 0; i < 3; i++) {
      // Claim this fixture directly; other tests deliberately leave queued jobs.
      await db.query("UPDATE aw_jobs SET created_at='2000-01-01' WHERE id=$1", [
        jobId,
      ]);
      const claimed = (await jobs.claim())!;
      expect(claimed.branch_id).toBe(created.branchId);
      await processLifeJob(claimed, jobs, lifeTestAi);
      const branch = await lives.branch(f.owner, created.branchId);
      expect(branch.status).toBe('decision');
      expect(branch.state.goals).toHaveLength(2);
      expect(branch.state.actors).toHaveLength(1);
      expect(branch.state.ownedAssets.some((x) => x.id === studioId)).toBe(
        true,
      );
      const decision = branch.pending_decision!;
      await lives.choose(
        f.owner,
        created.branchId,
        branch.revision,
        decision.id,
        decision.options[1]!.id,
        randomUUID(),
      );
      if (i < 2) {
        const ready = await lives.branch(f.owner, created.branchId);
        jobId = (
          await lives.continue(
            f.owner,
            created.branchId,
            ready.revision,
            randomUUID(),
          )
        ).jobId;
      }
    }
    expect(
      (await lives.detail(f.owner, created.branchId)).periods,
    ).toHaveLength(3);
    expect(await scenarios().get(f.owner, f.version.id)).toEqual(f.version);
  });
  it('exports and cascades the entire scenario graph; clients cannot read or mint versions', async () => {
    const f = await fixture();
    await scenarios().start(f.owner, f.version.id, f.request, randomUUID());
    const exported = await repo.exportAccount(f.owner);
    expect(exported.aw_scenarios).toHaveLength(1);
    expect(exported.aw_scenario_versions).toHaveLength(1);
    expect(exported.aw_scenario_starts).toHaveLength(1);
    for (const table of [
      'aw_scenarios',
      'aw_scenario_versions',
      'aw_scenario_starts',
    ]) {
      const [guard] = await db.query(
        "SELECT c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'INSERT') AS client FROM pg_class c WHERE c.oid=$1::regclass",
        [table],
      );
      expect(guard).toEqual({ rls: true, anon: false, client: false });
    }
    await repo.deleteAccountData(f.owner);
    for (const table of [
      'aw_scenarios',
      'aw_scenario_versions',
      'aw_scenario_starts',
    ])
      expect(
        (await db.query(`SELECT * FROM ${table} WHERE user_id=$1`, [f.owner]))
          .length,
      ).toBe(0);
  });
});
