// Isolated reviewed technical copies and simulated continuations. No paid AI or seed.
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import {
  PublicForkStartRepository,
  PublicForkPermissionRepository,
  LifeRepository,
  LifeJobRepository,
  LifeDeletionRepository,
  Repository,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import {
  publicForkStartRequestSchema,
  publicForkStartReceiptSchema,
} from '@future-flow/contracts';
import { hash, addMonths } from '@future-flow/core';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  communityForkCopy,
  officialForkCopy,
} from './public-fork-permission-fixtures';
import { lifeTestAi } from './life-fixtures';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { createApp } from '../apps/api/src/app';
const config = { enabled: true, linkSecret: 'b'.repeat(64) },
  flags = { enabled: true, startsEnabled: true };
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
  await engine.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
  await applyMigrations(engine);
  db = adapter(engine);
});
afterEach(async () => {
  for (const row of await db.query<{ id: string }>('SELECT id FROM ff_users'))
    await new Repository(db).deleteAccountData(row.id);
});
afterAll(async () => {
  await engine?.close();
});
const starts = (enabled = true, limits = { daily: 10, concurrent: 2 }) =>
  new PublicForkStartRepository(
    db,
    { enabled, startsEnabled: enabled },
    config,
    config,
    limits,
  );
async function target(privacy = true) {
  const id = randomUUID(),
    repo = new Repository(db);
  await repo.ensureUser(id);
  if (privacy) await repo.acceptPrivacy(id);
  return id;
}
async function granted() {
  const f = await communityForkCopy(db, config),
    permissions = new PublicForkPermissionRepository(db, flags, config, config);
  await permissions.setOwner(f.owner, f.view.slug, {
    publicationRevision: f.view.revision,
    snapshotHash: f.view.snapshotHash,
    permissionRevision: 0,
    allowed: true,
    acknowledged: true,
  });
  const capability = await permissions.capability(f.view.slug),
    body = {
      capabilityHash: capability.capabilityHash,
      checkpointIndex: 0,
      optionKey: capability.checkpoints[0]!.options[0]!.key,
      acknowledged: true,
    };
  return { ...f, permissions, capability, body };
}
async function process(userId: string, jobId: string) {
  const [job] = await db.query<LifeJob>(
    "UPDATE aw_jobs SET status='running',attempt=1,lease_token=$1,lease_until=now()+interval '10 minutes' WHERE id=$2 AND user_id=$3 AND status='queued' RETURNING *",
    [randomUUID(), jobId, userId],
  );
  if (!job) throw Error('Technical own job missing');
  await processLifeJob(job, new LifeJobRepository(db), lifeTestAi);
}
describe('independent private starts from reviewed public checkpoints', () => {
  it('requires server start gate, owner consent, current capability, privacy and a strict selected option', async () => {
    const f = await granted(),
      user = await target(),
      r = starts();
    await expect(
      starts(false).start(user, f.view.slug, f.body, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLIC_FORK_START_DISABLED' });
    expect(() =>
      publicForkStartRequestSchema.parse({
        ...f.body,
        privateBranchId: f.created.branchId,
      }),
    ).toThrow();
    for (const body of [
      { ...f.body, capabilityHash: '0'.repeat(64) },
      { ...f.body, checkpointIndex: 1 },
      { ...f.body, optionKey: 'option-999' },
    ])
      await expect(
        r.start(user, f.view.slug, body, randomUUID()),
      ).rejects.toMatchObject({ status: 409 });
    const noConsent = await target(false);
    await expect(
      r.start(noConsent, f.view.slug, f.body, randomUUID()),
    ).rejects.toMatchObject({ code: 'PRIVACY_ACKNOWLEDGEMENT_REQUIRED' });
    expect(await new LifeRepository(db).list(noConsent)).toEqual([]);
    expect(await db.query('SELECT id FROM aw_public_fork_starts')).toEqual([]);
    await f.permissions.setOwner(f.owner, f.view.slug, {
      publicationRevision: f.view.revision,
      snapshotHash: f.view.snapshotHash,
      permissionRevision: 1,
      allowed: false,
      acknowledged: true,
    });
    await expect(
      r.start(user, f.view.slug, f.body, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('applies the selected change once, creates fresh references and a normal owned AI job without source history or live Shared membership', async () => {
    const f = await granted(),
      user = await target(),
      before = await f.lives.detail(f.owner, f.created.branchId),
      reader = await f.pubs.readPublic(f.view.slug),
      receipt = publicForkStartReceiptSchema.parse(
        await starts().start(user, f.view.slug, f.body, randomUUID()),
      ),
      detail = await new LifeRepository(db).detail(user, receipt.branchId),
      [initial] = await db.query<any>(
        'SELECT * FROM aw_initial_choices WHERE life_id=$1',
        [receipt.lifeId],
      ),
      [job] = await db.query<LifeJob>('SELECT * FROM aw_jobs WHERE id=$1', [
        receipt.jobId,
      ]);
    expect(receipt.lifeId).not.toBe(f.created.lifeId);
    expect(receipt.branchId).not.toBe(f.created.branchId);
    expect(detail.branch.input.visibility).toBe('private');
    expect(detail.branch.input.identity.baseProfileVersionId).toBeNull();
    expect(detail.branch).toMatchObject({
      parent_branch_id: null,
      fork_period_id: null,
      pending_decision: null,
      revision: 0,
      status: 'generating',
    });
    expect(detail.periods).toEqual([]);
    expect(detail.choices).toEqual([]);
    expect(detail.initialChoice?.optionId).toBe(initial.option_id);
    expect(detail.branch.state).toEqual(initial.state_after);
    expect(detail.branch.accepted_decision_ids).toEqual([initial.decision_id]);
    expect(job!.payload.state).toEqual(initial.state_after);
    expect(job!.payload.memory.choices).toHaveLength(1);
    expect(job!.payload.acceptedDecisionIds).toEqual([initial.decision_id]);
    expect(job!.payload.memory.recentEvents).toEqual([]);
    expect(job!.payload.memory).not.toHaveProperty('sharedEvents');
    for (const id of [
      f.owner,
      f.created.lifeId,
      f.created.branchId,
      f.preview.draftId,
      f.bundle.bundleId,
    ])
      expect(JSON.stringify(detail)).not.toContain(id);
    expect(await f.lives.detail(f.owner, f.created.branchId)).toEqual(before);
    expect(await f.pubs.readPublic(f.view.slug)).toEqual(reader);
    expect(
      await db.query('SELECT id FROM aw_shared_members WHERE life_id=$1', [
        receipt.lifeId,
      ]),
    ).toEqual([]);
  });
  it('replays the exact start once, rejects changed choices and enforces normal concurrent quotas atomically', async () => {
    const f = await granted(),
      user = await target(),
      r = starts(),
      key = randomUUID(),
      a = await Promise.all(
        [1, 2, 3].map(() => r.start(user, f.view.slug, f.body, key)),
      );
    expect(a[0]).toEqual(a[1]);
    expect(a[1]).toEqual(a[2]);
    expect(
      await db.query(
        'SELECT life_id FROM aw_public_fork_starts WHERE user_id=$1',
        [user],
      ),
    ).toHaveLength(1);
    expect(
      await db.query('SELECT id FROM aw_jobs WHERE user_id=$1', [user]),
    ).toHaveLength(1);
    await expect(
      r.start(user, f.view.slug, { ...f.body, optionKey: 'option-2' }, key),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await r.start(user, f.view.slug, f.body, randomUUID());
    await expect(
      r.start(user, f.view.slug, f.body, randomUUID()),
    ).rejects.toMatchObject({ code: 'GENERATION_LIMIT' });
    expect(await new LifeRepository(db).list(user)).toHaveLength(2);
    expect(
      await db.query('SELECT id FROM aw_initial_choices WHERE user_id=$1', [
        user,
      ]),
    ).toHaveLength(2);
  });
  it('continues three normal technical periods, retains the initial decision memory and never reapplies its effect', async () => {
    const f = await granted(),
      user = await target(),
      receipt = await starts().start(user, f.view.slug, f.body, randomUUID()),
      lives = new LifeRepository(db),
      initial = await lives.branch(user, receipt.branchId);
    let jobId = receipt.jobId;
    for (let i = 0; i < 3; i++) {
      await process(user, jobId);
      const detail = await lives.detail(user, receipt.branchId);
      expect(detail.periods).toHaveLength(i + 1);
      if (i === 0)
        expect(detail.periods[0]!.start_state).toEqual(initial.state);
      const branch = await lives.branch(user, receipt.branchId);
      if (branch.pending_decision)
        await lives.choose(
          user,
          branch.id,
          branch.revision,
          branch.pending_decision.id,
          branch.pending_decision.options[0]!.id,
          randomUUID(),
        );
      if (i < 2) {
        const ready = await lives.branch(user, receipt.branchId);
        jobId = (
          await lives.continue(user, ready.id, ready.revision, randomUUID())
        ).jobId;
        const [job] = await db.query<LifeJob>(
          'SELECT * FROM aw_jobs WHERE id=$1',
          [jobId],
        );
        expect(
          job!.payload.memory.choices.some(
            (c: any) => c.decision_id === initial.accepted_decision_ids[0],
          ),
        ).toBe(true);
      }
    }
    expect(
      await db.query('SELECT id FROM aw_initial_choices WHERE life_id=$1', [
        receipt.lifeId,
      ]),
    ).toHaveLength(1);
    expect((await lives.branch(user, receipt.branchId)).state.effectiveAt).toBe(
      addMonths(initial.state.effectiveAt, 18),
    );
    expect(
      (await f.lives.detail(f.owner, f.created.branchId)).periods,
    ).toHaveLength(1);
  });
  it('stops new starts on withdrawal while allowing a free exact retry and detaches attribution on physical source-life deletion', async () => {
    const f = await granted(),
      user = await target(),
      r = starts(),
      key = randomUUID(),
      receipt = await r.start(user, f.view.slug, f.body, key),
      before = await new LifeRepository(db).detail(user, receipt.branchId);
    expect((await r.attribution(user, receipt.lifeId)).source?.slug).toBe(
      f.view.slug,
    );
    await f.pubs.action(
      f.owner,
      f.view.publicationId,
      'withdraw',
      {
        revision: f.view.revision,
        snapshotHash: f.view.snapshotHash,
        acknowledged: true,
      },
      randomUUID(),
    );
    await expect(
      r.start(user, f.view.slug, f.body, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
    expect(await starts(false).start(user, f.view.slug, f.body, key)).toEqual(
      receipt,
    );
    expect((await r.attribution(user, receipt.lifeId)).source).toBeNull();
    const branch = await f.lives.branch(f.owner, f.created.branchId);
    await new LifeDeletionRepository(db).remove(
      f.owner,
      f.created.lifeId,
      {
        branchId: branch.id,
        revision: branch.revision,
        confirmation: 'DELETE LIFE',
      },
      randomUUID(),
    );
    expect(
      (
        await db.query(
          'SELECT community_publication_id,official_publication_id FROM aw_public_fork_starts WHERE life_id=$1',
          [receipt.lifeId],
        )
      )[0],
    ).toEqual({
      community_publication_id: null,
      official_publication_id: null,
    });
    expect(await r.start(user, f.view.slug, f.body, key)).toEqual(receipt);
    expect(await new LifeRepository(db).detail(user, receipt.branchId)).toEqual(
      before,
    );
    expect((await r.attribution(user, receipt.lifeId)).source).toBeNull();
  });
  it('uses curator-approved Official checkpoints but never inherits Official generation provenance or source permissions', async () => {
    const f = await officialForkCopy(db, config),
      user = await target(),
      permissions = new PublicForkPermissionRepository(
        db,
        flags,
        config,
        config,
      );
    await permissions.setOfficial({
      slug: f.view.slug,
      publicationRevision: f.view.revision,
      snapshotHash: f.view.snapshotHash,
      permissionRevision: 0,
      allowed: true,
      acknowledged: true,
      actorLabel: 'Isolated curator',
    });
    const c = await permissions.capability(f.view.slug),
      body = {
        capabilityHash: c.capabilityHash,
        checkpointIndex: 0,
        optionKey: c.checkpoints[0]!.options[0]!.key,
        acknowledged: true,
      },
      receipt = await starts().start(user, f.view.slug, body, randomUUID());
    expect(
      (await starts().attribution(user, receipt.lifeId)).source?.classification,
    ).toBe('official');
    expect(
      await db.query(
        'SELECT life_id FROM aw_official_life_starts WHERE user_id=$1',
        [user],
      ),
    ).toEqual([]);
    await f.official.revoke(f.owner, {
      grantId: f.grant.grant!.id,
      contentHash: f.grant.contentHash,
      reasonCode: 'privacy',
      actorLabel: 'Isolated curator',
      acknowledged: true,
    });
    await expect(
      starts().start(user, f.view.slug, body, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (await starts().attribution(user, receipt.lifeId)).source,
    ).toBeNull();
    expect((await new LifeRepository(db).list(user))[0]!.id).toBe(
      receipt.lifeId,
    );
  });
  it('deletes own fork and records a minimal old-request tombstone so retry cannot recreate it; export/account cascade contains no foreign IDs', async () => {
    const f = await granted(),
      user = await target(),
      r = starts(),
      key = randomUUID(),
      receipt = await r.start(user, f.view.slug, f.body, key),
      repo = new Repository(db),
      exported = await repo.exportAccount(user),
      foreign = await repo.exportAccount(f.owner);
    expect(exported.aw_public_fork_starts).toHaveLength(1);
    expect(exported.aw_initial_choices).toHaveLength(1);
    expect(foreign.aw_public_fork_starts).toEqual([]);
    for (const hidden of [
      f.owner,
      f.created.lifeId,
      f.created.branchId,
      f.view.publicationId,
    ])
      expect(JSON.stringify(exported.aw_public_fork_starts)).not.toContain(
        hidden,
      );
    for (const table of ['aw_public_fork_starts', 'aw_initial_choices']) {
      expect(
        (
          await db.query(
            "SELECT relrowsecurity AS rls,has_table_privilege('anon',oid,'SELECT') AS anon,has_table_privilege('authenticated',oid,'INSERT') AS client FROM pg_class WHERE oid=$1::regclass",
            [table],
          )
        )[0],
      ).toEqual({ rls: true, anon: false, client: false });
      await expect(
        db.query(`UPDATE ${table} SET user_id=$1`, [f.owner]),
      ).rejects.toThrow();
    }
    const branch = await new LifeRepository(db).branch(user, receipt.branchId);
    await new LifeDeletionRepository(db).remove(
      user,
      receipt.lifeId,
      {
        branchId: branch.id,
        revision: branch.revision,
        confirmation: 'DELETE LIFE',
      },
      randomUUID(),
    );
    await expect(r.start(user, f.view.slug, f.body, key)).rejects.toMatchObject(
      { code: 'PUBLIC_FORK_START_DELETED', status: 410 },
    );
    expect(await new LifeRepository(db).list(user)).toEqual([]);
    expect(
      (
        await db.query(
          'SELECT response FROM ff_idempotency WHERE user_id=$1 AND key=$2',
          [user, key],
        )
      )[0]!.response,
    ).toEqual({ deleted: true });
    expect(
      await db.query(
        'SELECT life_id FROM aw_initial_choices WHERE user_id=$1',
        [user],
      ),
    ).toEqual([]);
    await repo.deleteAccountData(user);
    expect(
      await db.query('SELECT key FROM ff_idempotency WHERE user_id=$1', [user]),
    ).toEqual([]);
    expect(await f.pubs.readPublic(f.view.slug)).toBeTruthy();
  });
  it('requires verified Auth, strict query/body and request key at HTTP boundary, and isolates private attribution', async () => {
    const f = await granted(),
      user = await target(),
      app = await createApp(
        new Repository(db),
        {
          verify: async (token) => ({
            id: token.startsWith('b') ? f.owner : user,
          }),
          deleteUser: async () => {},
          userExists: async () => true,
        },
        'http://localhost:3000',
        0,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        config,
        config,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        flags,
      );
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl(),
      path = '/api/v2/public-forks/' + f.view.slug,
      headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + 'a'.repeat(30),
        'Idempotency-Key': randomUUID(),
      };
    try {
      expect(
        (
          await fetch(base + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(f.body),
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await fetch(base + path + '?target=x', {
            method: 'POST',
            headers,
            body: JSON.stringify(f.body),
          })
        ).status,
      ).toBe(422);
      const response = await fetch(base + path, {
        method: 'POST',
        headers,
        body: JSON.stringify(f.body),
      });
      expect(response.status).toBe(201);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const receipt = publicForkStartReceiptSchema.parse(await response.json()),
        source = '/api/v2/public-forks/lives/' + receipt.lifeId + '/source';
      expect((await fetch(base + source, { headers })).status).toBe(200);
      expect(
        (
          await fetch(base + source, {
            headers: { ...headers, Authorization: 'Bearer ' + 'b'.repeat(30) },
          })
        ).status,
      ).toBe(404);
      expect((await fetch(base + source)).status).toBe(401);
    } finally {
      await app.close();
    }
  });
});
