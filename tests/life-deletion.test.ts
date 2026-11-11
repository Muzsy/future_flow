import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import {
  LifeDeletionRepository,
  LifeRepository,
  LifeJobRepository,
  Repository,
  PublicationRepository,
  PublicationRefreshRepository,
  PublicExposureRepository,
  SavedLivesRepository,
  SharedJobRepository,
  cleanupExpiredLifeAdmissions,
  type Database,
} from '@future-flow/database';
import { lifeDeletionRequestSchema } from '@future-flow/contracts';
import { publicReviewLimits } from '../packages/database/src/public-review-limits';
import { applyMigrations } from '../scripts/lib/migrations';
import { setupFixture } from './life-fixtures';
import { testInviteSecret } from './shared-fixtures';
import { sharedAiGroup } from './shared-ai-fixtures';
import { sharedEventFixture } from './shared-engine-fixtures';
import {
  publicationFixture,
  approvePublicationFixture,
} from './publication-fixtures';
import { refreshedPublicationFixture } from './publication-refresh-fixtures';
import { createApp } from '../apps/api/src/app';
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
const config = { enabled: true, linkSecret: 'd'.repeat(64) };
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
  await applyMigrations(engine);
  db = adapter(engine);
});
afterEach(async () => {
  for (const owner of await db.query<{ id: string }>(
    'SELECT id FROM ff_users ORDER BY id',
  ))
    await new Repository(db).deleteAccountData(owner.id);
});
afterAll(async () => {
  await engine?.close();
});
async function fresh() {
  const owner = randomUUID(),
    repo = new Repository(db);
  await repo.ensureUser(owner);
  await repo.acceptPrivacy(owner);
  const lives = new LifeRepository(db),
    created = await lives.create(owner, setupFixture(), randomUUID());
  return { owner, repo, lives, created };
}
const input = (branchId: string, revision = 0) => ({
  branchId,
  revision,
  confirmation: 'DELETE LIFE',
});
describe('explicit whole-life deletion and public/shared cleanup', () => {
  it('requires exact typed confirmation, owned life/branch and revision, without deleting another life', async () => {
    const a = await fresh(),
      b = await fresh(),
      deletion = new LifeDeletionRepository(db);
    expect(
      lifeDeletionRequestSchema.safeParse({
        ...input(a.created.branchId),
        confirmation: 'DELETE ACCOUNT',
      }).success,
    ).toBe(false);
    await expect(
      deletion.remove(
        b.owner,
        a.created.lifeId,
        input(a.created.branchId),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      deletion.remove(
        a.owner,
        a.created.lifeId,
        input(a.created.branchId, 1),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'LIFE_REVISION_CONFLICT' });
    await expect(
      deletion.remove(
        a.owner,
        a.created.lifeId,
        input(b.created.branchId),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect((await a.lives.list(a.owner)).length).toBe(1);
  });
  it('deletes every branch and both refreshed publications, old tokens, external rights, saved pointers and source review data', async () => {
    const f = await publicationFixture(db),
      pubs = new PublicationRepository(db, config),
      approved = await approvePublicationFixture(db, f);
    expect(approved).toBeTruthy();
    approved!.settings.visibility = 'unlisted';
    const preview = await pubs.prepare(f.owner, approved, randomUUID()),
      previous = await pubs.confirm(
        f.owner,
        {
          previewId: preview.previewId,
          previewHash: preview.previewHash,
          acknowledged: true,
        },
        randomUUID(),
      ),
      next = await refreshedPublicationFixture(db, f);
    next.input.settings.visibility = 'public';
    const nextPreview = await pubs.prepare(f.owner, next.input, randomUUID()),
      replacement = await new PublicationRefreshRepository(
        db,
        { enabled: true },
        config,
        config,
      ).refresh(
        f.owner,
        'community',
        {
          previousPublicationId: previous.publicationId,
          previousRevision: previous.revision,
          previousSnapshotHash: previous.snapshotHash,
          previewId: nextPreview.previewId,
          previewHash: nextPreview.previewHash,
          acknowledged: true,
        },
        randomUUID(),
      );
    const exposure = new PublicExposureRepository(
      db,
      { enabled: true },
      config,
      config,
    );
    await exposure.setOwner(f.owner, replacement.publication.slug, {
      publicationRevision: replacement.publication.revision,
      snapshotHash: replacement.publication.snapshotHash,
      permissionRevision: 0,
      mode: 'index',
      acknowledged: true,
    });
    const reader = await fresh(),
      saved = new SavedLivesRepository(db, { enabled: true }, config, config);
    await saved.save(reader.owner, replacement.publication.slug);
    const lives = new LifeRepository(db),
      detail = await lives.detail(f.owner, f.created.branchId),
      period = detail.periods[0]!,
      decision = (
        period.events as { decision?: { options: { id: string }[] } }[]
      ).find((e) => e.decision)?.decision;
    expect(decision).toBeTruthy();
    await lives.fork(
      f.owner,
      detail.branch.id,
      String(period.id),
      detail.branch.revision,
      decision!.options[0]!.id,
      randomUUID(),
    );
    const current = await lives.branch(f.owner, f.created.branchId),
      receipt = await new LifeDeletionRepository(db).remove(
        f.owner,
        f.created.lifeId,
        input(current.id, current.revision),
        randomUUID(),
      );
    expect(receipt.deletedBranchCount).toBe(2);
    for (const table of [
      'aw_lives',
      'aw_branches',
      'aw_periods',
      'aw_jobs',
      'aw_publication_drafts',
      'aw_public_content_bundles',
      'aw_public_content_reviews',
      'aw_publications',
      'aw_publication_refreshes',
    ])
      expect(
        await db.query(`SELECT * FROM ${table} WHERE user_id=$1`, [f.owner]),
      ).toEqual([]);
    await expect(
      pubs.readPublic(replacement.publication.slug),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      pubs.readUnlisted(previous.unlistedToken!),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      exposure.project(replacement.publication.slug),
    ).rejects.toMatchObject({ status: 404 });
    expect((await saved.list(reader.owner)).items).toEqual([]);
    expect((await lives.list(reader.owner)).length).toBe(1);
    expect(
      (await db.query('SELECT status FROM ff_users WHERE id=$1', [f.owner]))[0]!
        .status,
    ).toBe('active');
  });
  it('replays the same deletion without extra admissions and rejects input substitution or another request key', async () => {
    const f = await fresh(),
      deletion = new LifeDeletionRepository(db),
      key = randomUUID(),
      body = input(f.created.branchId),
      first = await deletion.remove(f.owner, f.created.lifeId, body, key);
    expect(await deletion.remove(f.owner, f.created.lifeId, body, key)).toEqual(
      first,
    );
    expect(
      (
        await db.query(
          'SELECT id FROM aw_deleted_life_admissions WHERE user_id=$1',
          [f.owner],
        )
      ).length,
    ).toBe(1);
    await expect(
      deletion.remove(f.owner, f.created.lifeId, { ...body, revision: 1 }, key),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      deletion.remove(f.owner, f.created.lifeId, body, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('invalidates an actually claimed job and removes create replay so no deleted canon can be committed', async () => {
    const owner = randomUUID(),
      repo = new Repository(db);
    await repo.ensureUser(owner);
    await repo.acceptPrivacy(owner);
    const lives = new LifeRepository(db),
      key = randomUUID(),
      created = await lives.create(owner, setupFixture(), key),
      jobs = new LifeJobRepository(db),
      job = await jobs.claim();
    expect(job?.id).toBe(created.jobId);
    await new LifeDeletionRepository(db).remove(
      owner,
      created.lifeId,
      input(created.branchId),
      randomUUID(),
    );
    await expect(
      jobs.checkpoint(job!, 'EVENTS', { anything: 'should never persist' }),
    ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
    expect(
      await db.query(
        "SELECT key FROM ff_idempotency WHERE user_id=$1 AND scope='v2:create'",
        [owner],
      ),
    ).toEqual([]);
  });
  it('preserves generation and public-review admission counts after content deletion', async () => {
    const f = await publicationFixture(db);
    await approvePublicationFixture(db, f);
    const b = await new LifeRepository(db).branch(f.owner, f.created.branchId);
    await new LifeDeletionRepository(db).remove(
      f.owner,
      f.created.lifeId,
      input(b.id, b.revision),
      randomUUID(),
    );
    await expect(
      new LifeRepository(db, { daily: 1, concurrent: 2 }).create(
        f.owner,
        setupFixture(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'GENERATION_LIMIT' });
    expect((await publicReviewLimits(db, f.owner)).daily).toBe('1');
    expect(
      (await new Repository(db).exportAccount(f.owner))
        .aw_deleted_life_admissions,
    ).toHaveLength(2);
  });
  it('expires minimal quota records independently of feature flags, denies client access and cascades on account deletion', async () => {
    const f = await fresh();
    await new LifeDeletionRepository(db).remove(
      f.owner,
      f.created.lifeId,
      input(f.created.branchId),
      randomUUID(),
    );
    await db.query(
      "INSERT INTO aw_deleted_life_admissions(user_id,kind,admitted_at) VALUES($1,'generation',now()-interval '25 hours')",
      [f.owner],
    );
    expect(await cleanupExpiredLifeAdmissions(db)).toEqual({
      deleted: 1,
      batchFull: false,
    });
    const [r] = await db.query(
      "SELECT c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'INSERT') AS client FROM pg_class c WHERE c.oid='aw_deleted_life_admissions'::regclass",
    );
    expect(r).toEqual({ rls: true, anon: false, client: false });
    await expect(
      db.query(
        'UPDATE aw_deleted_life_admissions SET admitted_at=now() WHERE user_id=$1',
        [f.owner],
      ),
    ).rejects.toThrow();
    const exported = (await f.repo.exportAccount(f.owner))
      .aw_deleted_life_admissions as Record<string, unknown>[];
    expect(Object.keys(exported[0]!).sort()).toEqual(['admitted_at', 'kind']);
    await f.repo.deleteAccountData(f.owner);
    expect(await db.query('SELECT id FROM aw_deleted_life_admissions')).toEqual(
      [],
    );
  });
  it('detaches only the deleted life membership, cancels pending shared decisions, hides affected prose and preserves immutable dates/canon', async () => {
    const shared = new SharedJobRepository(db, testInviteSecret),
      g = await sharedAiGroup(db, shared),
      a = g.people[0]!,
      b = g.people[1]!,
      event = sharedEventFixture(
        g.contextId,
        g.detail.revision,
        a.date,
        g.detail.members.map((m) => m.id),
        null,
      );
    event.candidate.title = 'Private obsolete detail';
    await shared.commitCandidate(
      a.id,
      g.contextId,
      event.candidate,
      randomUUID(),
      event.rules,
    );
    const before = await db.query(
      'SELECT canon_hash,effective_at FROM aw_shared_events WHERE id=$1',
      [event.candidate.eventId],
    );
    await new LifeDeletionRepository(db).remove(
      a.id,
      a.lifeId,
      input(a.branchId, a.revision),
      randomUUID(),
    );
    const after = await shared.detail(b.id, g.contextId);
    expect(after.status).toBe('paused');
    expect(after.pendingEventId).toBeNull();
    expect(
      JSON.stringify(await shared.events(b.id, g.contextId)),
    ).not.toContain('Private obsolete detail');
    expect(
      await db.query(
        'SELECT canon_hash,effective_at FROM aw_shared_events WHERE id=$1',
        [event.candidate.eventId],
      ),
    ).toEqual(before);
    expect(
      (
        await db.query(
          'SELECT status,user_id,branch_id FROM aw_shared_members WHERE id=$1',
          [
            g.detail.members.find(
              (m) => m.interactionProfile.displayName === 'Test Rowan',
            )!.id,
          ],
        )
      )[0],
    ).toMatchObject({ status: 'deleted', user_id: null, branch_id: null });
    expect((await new LifeRepository(db).list(b.id)).length).toBe(1);
  });
  it('scrubs an in-flight shared generation involving the deleted life without deleting another participant account', async () => {
    const shared = new SharedJobRepository(db, testInviteSecret),
      g = await sharedAiGroup(db, shared),
      a = g.people[0]!,
      b = g.people[1]!,
      queued = await shared.enqueue(
        a.id,
        g.contextId,
        g.detail.revision,
        randomUUID(),
      ),
      job = await shared.claim();
    expect(job?.id).toBe(queued.jobId);
    await new LifeDeletionRepository(db).remove(
      a.id,
      a.lifeId,
      input(a.branchId, a.revision),
      randomUUID(),
    );
    expect(
      (
        await db.query(
          'SELECT status,payload,checkpoints,lease_token FROM aw_shared_jobs WHERE id=$1',
          [queued.jobId],
        )
      )[0],
    ).toEqual({
      status: 'cancelled',
      payload: {},
      checkpoints: {},
      lease_token: null,
    });
    await expect(shared.verify(job!)).rejects.toThrow();
    expect(
      (await db.query('SELECT status FROM ff_users WHERE id=$1', [b.id]))[0]!
        .status,
    ).toBe('active');
  });
  it('requires fresh verified Auth for HTTP deletion and accepts an exact fresh retry', async () => {
    const f = await fresh(),
      now = Math.floor(Date.now() / 1000),
      token = (at: number) =>
        'test.' +
        Buffer.from(
          JSON.stringify({ amr: [{ method: 'password', timestamp: at }] }),
        ).toString('base64url') +
        '.synthetic',
      freshToken = token(now),
      oldToken = token(now - 3600),
      app = await createApp(f.repo, {
        verify: async (t) => {
          if ([freshToken, oldToken].includes(t)) return { id: f.owner };
          throw Error('Invalid token');
        },
        deleteUser: async () => {},
      });
    await app.listen(0, '127.0.0.1');
    try {
      const base = await app.getUrl(),
        key = randomUUID(),
        request = async (auth?: string) => {
          const r = await fetch(base + '/api/v2/lives/' + f.created.lifeId, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': key,
              ...(auth ? { Authorization: 'Bearer ' + auth } : {}),
            },
            body: JSON.stringify(input(f.created.branchId)),
          });
          return { status: r.status, body: await r.json() };
        };
      expect((await request()).status).toBe(401);
      expect((await request(oldToken)).body.error.code).toBe(
        'AUTH_REAUTH_REQUIRED',
      );
      const first = await request(freshToken);
      expect(first.status).toBe(200);
      expect(await request(freshToken)).toEqual(first);
    } finally {
      await app.close();
    }
  });
});
