import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import {
  OfficialLifeRepository,
  officialLifeOperatorEnabledFromEnv,
  DatabaseAiBudget,
  type Database,
} from '@future-flow/database';
import { officialLifeGrantRequestSchema } from '@future-flow/contracts';
import { hash } from '@future-flow/core';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  officialLifeFixture,
  processOfficialFixture,
  officialBundleFixture,
  officialGrant,
} from './official-life-fixtures';
import { scenarioFixture } from './scenario-fixtures';
let engine: PGlite, db: Database;
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
});
afterAll(async () => {
  await engine?.close();
});
async function prepared(
  accounted = true,
  reviewAccounted = true,
  repair = false,
) {
  const f = await officialLifeFixture(db),
    created = await f.official.start(f.owner, f.startRequest, randomUUID());
  const job = await processOfficialFixture(
    db,
    f.owner,
    created.jobId,
    accounted,
    repair,
  );
  const content = await officialBundleFixture(db, f, created, reviewAccounted);
  return { ...f, created, job, content };
}
describe('Prospective Official life provenance, never a publication permission', () => {
  it('defaults operator off, requires consent/current trusted source and strict exact binding', async () => {
    const f = await officialLifeFixture(db);
    expect(officialLifeOperatorEnabledFromEnv({})).toBe(false);
    expect(() =>
      officialLifeOperatorEnabledFromEnv({
        OFFICIAL_LIFE_OPERATOR_ENABLED: 'yes',
      }),
    ).toThrow();
    await expect(
      new OfficialLifeRepository(db).start(
        f.owner,
        f.startRequest,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_DISABLED' });
    for (const request of [
      { ...f.startRequest, templateHash: '1'.repeat(64) },
      { ...f.startRequest, scenarioGrantId: randomUUID() },
    ])
      await expect(
        f.official.start(f.owner, request, randomUUID()),
      ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED' });
    await expect(
      f.official.start(
        f.owner,
        { ...f.startRequest, acknowledged: false },
        randomUUID(),
      ),
    ).rejects.toThrow();
    await db.query('DELETE FROM ff_consents WHERE user_id=$1', [f.owner]);
    await expect(
      f.official.start(f.owner, f.startRequest, randomUUID()),
    ).rejects.toMatchObject({ code: 'PRIVACY_ACKNOWLEDGEMENT_REQUIRED' });
    expect(
      await db.query(
        'SELECT life_id FROM aw_official_life_starts WHERE user_id=$1',
        [f.owner],
      ),
    ).toHaveLength(0);
  });
  it('atomically starts once with normal AI job/limits and cannot retroactively bless a private start', async () => {
    const f = await officialLifeFixture(db),
      key = randomUUID();
    const created = await f.official.start(f.owner, f.startRequest, key);
    expect(await f.official.start(f.owner, f.startRequest, key)).toEqual(
      created,
    );
    expect(
      await db.query(
        'SELECT life_id FROM aw_official_life_starts WHERE user_id=$1',
        [f.owner],
      ),
    ).toHaveLength(1);
    await expect(
      f.official.start(
        f.owner,
        { ...f.startRequest, scenarioGrantId: randomUUID() },
        key,
      ),
    ).rejects.toThrow();
    await expect(
      new OfficialLifeRepository(db, true, { daily: 1, concurrent: 1 }).start(
        f.owner,
        f.startRequest,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'GENERATION_LIMIT' });
    expect(
      await db.query(
        'SELECT life_id FROM aw_official_life_starts WHERE user_id=$1',
        [f.owner],
      ),
    ).toHaveLength(1);
    await db.query("UPDATE aw_jobs SET status='cancelled' WHERE id=$1", [
      created.jobId,
    ]);
    const normal = await f.scenarios.start(
      f.owner,
      f.version.id,
      { templateHash: f.version.templateHash, acknowledged: true },
      randomUUID(),
    );
    await processOfficialFixture(db, f.owner, normal.jobId);
    const copy = await officialBundleFixture(db, f, normal);
    await expect(
      f.official.inspect(f.owner, copy.bundle.bundleId),
    ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED' });
  });
  it('blocks technical/zero-token generation and full-content review, despite clear curator decisions', async () => {
    for (const [generation, review] of [
      [false, true],
      [true, false],
    ] as const) {
      const f = await prepared(generation, review);
      await expect(
        f.official.inspect(f.owner, f.content.bundle.bundleId),
      ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED' });
      expect(
        await db.query(
          'SELECT id FROM aw_official_life_sources WHERE user_id=$1',
          [f.owner],
        ),
      ).toHaveLength(0);
    }
  });
  it('binds every period/canon/chapter/fidelity and exact bundle, separates grant, keeps immutable replay', async () => {
    const f = await prepared(),
      inspected = await f.official.inspect(f.owner, f.content.bundle.bundleId),
      request = officialGrant(inspected);
    expect(inspected.evidence.periods).toHaveLength(1);
    expect(inspected.evidence.periods[0]!.receipts.map((r) => r.task)).toEqual([
      'life_period',
      'life_chapter',
      'life_fidelity',
    ]);
    expect(hash(inspected.evidence)).toBe(inspected.evidenceHash);
    expect(inspected.view.grant).toBeNull();
    expect(
      officialLifeGrantRequestSchema.safeParse({
        ...request,
        qualityChecked: false,
      }).success,
    ).toBe(false);
    for (const raw of [
      { ...request, evidenceHash: '2'.repeat(64) },
      { ...request, binding: { ...request.binding, curationId: randomUUID() } },
    ])
      await expect(f.official.grant(f.owner, raw)).rejects.toMatchObject({
        code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED',
      });
    const granted = await f.official.grant(f.owner, request);
    expect(granted.grant).toMatchObject({ status: 'active', usable: true });
    expect(granted.publicationApproved).toBe(false);
    expect(await f.official.grant(f.owner, request)).toEqual(granted);
    await expect(
      f.official.grant(f.owner, { ...request, actorLabel: 'Changed actor' }),
    ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED' });
    expect(
      await db.query('SELECT id FROM aw_publications WHERE user_id=$1', [
        f.owner,
      ]),
    ).toHaveLength(0);
  });
  it('preserves accepted repair input hashes and accounts the rejected call as well', async () => {
    const f = await prepared(true, true, true),
      inspected = await f.official.inspect(f.owner, f.content.bundle.bundleId);
    expect(inspected.evidence.periods[0]!.receipts).toHaveLength(4);
    expect(
      inspected.evidence.periods[0]!.receipts.filter(
        (r) => r.task === 'life_chapter',
      ),
    ).toHaveLength(2);
    expect(inspected.evidence.periods[0]!.generation.chapterInputHash).toBe(
      inspected.evidence.periods[0]!.receipts.filter(
        (r) => r.task === 'life_chapter',
      ).at(-1)!.inputHash,
    );
  });
  it('requires the separate full-scope curator and refuses generation evidence from a different source', async () => {
    const f = await prepared();
    const [job] = await db.query<{ payload: Record<string, unknown> }>(
      'SELECT payload FROM aw_jobs WHERE id=$1',
      [f.created.jobId],
    );
    await db.query('UPDATE aw_jobs SET payload=$2 WHERE id=$1', [
      f.created.jobId,
      { ...job!.payload, revision: 99 },
    ]);
    await expect(
      f.official.inspect(f.owner, f.content.bundle.bundleId),
    ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED' });
    await db.query('UPDATE aw_jobs SET payload=$2 WHERE id=$1', [
      f.created.jobId,
      job!.payload,
    ]);
    await db.query(
      'DELETE FROM aw_public_content_curations WHERE bundle_id=$1',
      [f.content.bundle.bundleId],
    );
    await expect(
      f.official.inspect(f.owner, f.content.bundle.bundleId),
    ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED' });
  });
  it('allows terminal revocation after the private preparation expires', async () => {
    const f = await prepared(),
      inspected = await f.official.inspect(f.owner, f.content.bundle.bundleId),
      granted = await f.official.grant(f.owner, officialGrant(inspected));
    // Move only the isolated test clock; the production copy remains immutable.
    await engine.exec(
      'ALTER TABLE aw_publication_drafts DISABLE TRIGGER aw_publication_drafts_immutable',
    );
    try {
      await db.query(
        "UPDATE aw_publication_drafts SET expires_at=now()-interval '1 second' WHERE id=$1",
        [f.content.preview.draftId],
      );
    } finally {
      await engine.exec(
        'ALTER TABLE aw_publication_drafts ENABLE TRIGGER aw_publication_drafts_immutable',
      );
    }
    await expect(
      f.official.inspect(f.owner, f.content.bundle.bundleId),
    ).rejects.toMatchObject({ code: 'PUBLIC_PREVIEW_EXPIRED' });
    const revoked = await f.official.revoke(f.owner, {
      grantId: granted.grant!.id,
      contentHash: granted.contentHash,
      reasonCode: 'privacy',
      actorLabel: 'Isolated expired source moderator',
      acknowledged: true,
    });
    expect(revoked.grant?.status).toBe('revoked');
  });
  it('rejects missing/unknown/mismatched/extra accounting and altered receipt or generation hashes', async () => {
    const f = await prepared(),
      original = await db.query(
        'SELECT * FROM aw_budget_reservations WHERE user_id=$1 AND job_id=$2',
        [f.owner, f.created.jobId],
      );
    await db.query(
      "UPDATE aw_budget_reservations SET status='unknown' WHERE id=$1",
      [original[0]!.id],
    );
    await expect(
      f.official.inspect(f.owner, f.content.bundle.bundleId),
    ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED' });
    await db.query(
      "UPDATE aw_budget_reservations SET status='completed',input_tokens=999 WHERE id=$1",
      [original[0]!.id],
    );
    await expect(
      f.official.inspect(f.owner, f.content.bundle.bundleId),
    ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED' });
    await db.query(
      'UPDATE aw_budget_reservations SET input_tokens=32 WHERE id=$1',
      [original[0]!.id],
    );
    const extra = new DatabaseAiBudget(db, f.owner, f.created.jobId, {
      projectUsd: 5,
      userUsd: 1,
    });
    const reservation = await extra.reserve({
      model: 'gpt-6.1-sol',
      max_output_tokens: 2200,
      text: { format: { name: 'life_chapter' } },
    });
    await extra.settle(reservation, { input_tokens: 0, output_tokens: 0 });
    await expect(
      f.official.inspect(f.owner, f.content.bundle.bundleId),
    ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED' });
    await db.query('DELETE FROM aw_budget_reservations WHERE id=$1', [
      reservation,
    ]);
    const [job] = await db.query<{ checkpoints: Record<string, unknown> }>(
      'SELECT checkpoints FROM aw_jobs WHERE id=$1',
      [f.created.jobId],
    );
    await db.query('UPDATE aw_jobs SET checkpoints=$2 WHERE id=$1', [
      f.created.jobId,
      {
        ...job!.checkpoints,
        generationBinding: {
          ...(job!.checkpoints.generationBinding as object),
          fidelityInputHash: '3'.repeat(64),
        },
      },
    ]);
    await expect(
      f.official.inspect(f.owner, f.content.bundle.bundleId),
    ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED' });
    await db.query('UPDATE aw_jobs SET checkpoints=$2 WHERE id=$1', [
      f.created.jobId,
      job!.checkpoints,
    ]);
    await db.query(
      "UPDATE aw_ai_runs SET metadata=jsonb_set(metadata,'{outputHash}',to_jsonb($3::text)) WHERE job_id=$1 AND metadata->>'task'=$2",
      [f.created.jobId, 'life_chapter', '4'.repeat(64)],
    );
    await expect(
      f.official.inspect(f.owner, f.content.bundle.bundleId),
    ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED' });
  });
  it('covers a continued normal chain and refuses obsolete bundles or arbitrary/forked branches', async () => {
    const f = await prepared(),
      branch = await f.content.lives.branch(f.owner, f.created.branchId);
    const decision = branch.pending_decision!;
    await f.content.lives.choose(
      f.owner,
      branch.id,
      branch.revision,
      decision.id,
      decision.options[0]!.id,
      randomUUID(),
    );
    await expect(
      f.official.inspect(f.owner, f.content.bundle.bundleId),
    ).rejects.toMatchObject({ code: 'LIFE_REVISION_CONFLICT' });
    const ready = await f.content.lives.branch(f.owner, branch.id),
      next = await f.content.lives.continue(
        f.owner,
        branch.id,
        ready.revision,
        randomUUID(),
      );
    await processOfficialFixture(db, f.owner, next.jobId);
    const copy = await officialBundleFixture(db, f, f.created),
      inspected = await f.official.inspect(f.owner, copy.bundle.bundleId);
    expect(inspected.evidence.periods.map((p) => p.position)).toEqual([1, 2]);
    expect(inspected.evidence.periods[0]!.jobId).toBe(f.created.jobId);
    const [period] = await db.query<{ id: string }>(
      'SELECT id FROM aw_periods WHERE branch_id=$1 ORDER BY period_no',
      [branch.id],
    );
    const current = await f.content.lives.branch(f.owner, branch.id);
    const fork = await f.content.lives.fork(
      f.owner,
      branch.id,
      period!.id,
      current.revision,
      decision.options[1]!.id,
      randomUUID(),
    );
    await processOfficialFixture(db, f.owner, fork.jobId);
    const forkCopy = await officialBundleFixture(db, f, fork);
    await expect(
      f.official.inspect(f.owner, forkCopy.bundle.bundleId),
    ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED' });
  });
  it('enforces ownership, template revision/revocation and deletion without restoring grants', async () => {
    const f = await prepared(),
      other = await officialLifeFixture(db),
      inspected = await f.official.inspect(f.owner, f.content.bundle.bundleId),
      request = officialGrant(inspected);
    await expect(
      f.official.inspect(other.owner, f.content.bundle.bundleId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(f.official.grant(other.owner, request)).rejects.toMatchObject({
      status: 404,
    });
    await f.official.grant(f.owner, request);
    const exported = await f.repo.exportAccount(f.owner);
    expect(exported.aw_official_life_starts).toHaveLength(1);
    expect(exported.aw_official_life_sources).toHaveLength(1);
    await f.repo.markDeleting(f.owner);
    await expect(
      f.official.inspect(f.owner, f.content.bundle.bundleId),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DELETING' });
    await f.repo.restoreActive(f.owner);
    expect(
      (
        await db.query(
          'SELECT status FROM aw_official_life_sources WHERE user_id=$1',
          [f.owner],
        )
      )[0]!.status,
    ).toBe('revoked');
    await expect(f.official.grant(f.owner, request)).rejects.toMatchObject({
      code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED',
    });
    await f.repo.deleteAccountData(f.owner);
    for (const table of ['aw_official_life_starts', 'aw_official_life_sources'])
      expect(
        await db.query(`SELECT * FROM ${table} WHERE user_id=$1`, [f.owner]),
      ).toHaveLength(0);
  });
  it('revokes permanently, including after source expiry, and rejects source changes/replay reactivation', async () => {
    const f = await prepared(),
      inspected = await f.official.inspect(f.owner, f.content.bundle.bundleId),
      request = officialGrant(inspected),
      granted = await f.official.grant(f.owner, request);
    const revoke = {
      grantId: granted.grant!.id,
      contentHash: granted.contentHash,
      reasonCode: 'quality',
      actorLabel: 'Isolated technical moderator',
      acknowledged: true,
    };
    expect((await f.official.revoke(f.owner, revoke)).grant?.status).toBe(
      'revoked',
    );
    expect((await f.official.grant(f.owner, request)).grant?.usable).toBe(
      false,
    );
    await f.scenarios.revise(
      f.owner,
      f.version.scenarioId,
      {
        expectedVersion: 1,
        expectedHash: f.version.templateHash,
        template: { ...scenarioFixture(), title: 'New technical template' },
      },
      randomUUID(),
    );
    expect((await f.official.revoke(f.owner, revoke)).grant?.status).toBe(
      'revoked',
    );
    await expect(
      f.official.inspect(f.owner, f.content.bundle.bundleId),
    ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED' });
    await expect(
      f.official.start(f.owner, f.startRequest, randomUUID()),
    ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED' });
    await expect(
      db.query(
        "UPDATE aw_official_life_sources SET status='active' WHERE id=$1",
        [granted.grant!.id],
      ),
    ).rejects.toThrow();
  });
  it('enforces immutable binding, RLS/revoked client access and source cascades', async () => {
    const f = await prepared(),
      inspected = await f.official.inspect(f.owner, f.content.bundle.bundleId);
    await f.official.grant(f.owner, officialGrant(inspected));
    for (const table of [
      'aw_official_life_starts',
      'aw_official_life_sources',
    ]) {
      const [row] = await db.query(
        "SELECT c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'INSERT') AS client FROM pg_class c WHERE c.oid=$1::regclass",
        [table],
      );
      expect(row).toEqual({ rls: true, anon: false, client: false });
    }
    await expect(
      db.query(
        'UPDATE aw_official_life_starts SET initial_input_hash=$1 WHERE life_id=$2',
        ['5'.repeat(64), f.created.lifeId],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        'UPDATE aw_official_life_sources SET evidence_hash=$1 WHERE user_id=$2',
        ['6'.repeat(64), f.owner],
      ),
    ).rejects.toThrow();
    await db.query('DELETE FROM aw_scenarios WHERE id=$1', [
      f.version.scenarioId,
    ]);
    for (const table of ['aw_official_life_starts', 'aw_official_life_sources'])
      expect(
        await db.query(`SELECT * FROM ${table} WHERE user_id=$1`, [f.owner]),
      ).toHaveLength(0);
  });
});
