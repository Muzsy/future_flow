import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import {
  PublicationRefreshRepository,
  publicationRefreshConfigFromEnv,
  PublicationRepository,
  PublicExposureRepository,
  Repository,
  type Database,
} from '@future-flow/database';
import { publicationRefreshRequestSchema } from '@future-flow/contracts';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  publicationFixture,
  approvePublicationFixture,
} from './publication-fixtures';
import {
  refreshedPublicationFixture,
  officialRefreshFixture,
} from './publication-refresh-fixtures';
import { createApp } from '../apps/api/src/app';
const config = { enabled: true, linkSecret: 'f'.repeat(64) };
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
  await db.query('DELETE FROM ff_users');
});
afterAll(async () => {
  await engine?.close();
});
const refreshes = (database = db, enabled = true) =>
  new PublicationRefreshRepository(database, { enabled }, config, config, {
    enabled: false,
  });
async function pair(
  oldVisibility: 'public' | 'unlisted' = 'public',
  newVisibility: 'public' | 'unlisted' = 'public',
) {
  const f = await publicationFixture(db),
    input = await approvePublicationFixture(db, f);
  if (!input) throw Error('Technical approval missing');
  input.settings.visibility = oldVisibility;
  const pubs = new PublicationRepository(db, config, { enabled: false }),
    firstPreview = await pubs.prepare(f.owner, input, randomUUID()),
    previous = await pubs.confirm(
      f.owner,
      {
        previewId: firstPreview.previewId,
        previewHash: firstPreview.previewHash,
        acknowledged: true,
      },
      randomUUID(),
    ),
    next = await refreshedPublicationFixture(db, f);
  next.input.settings.visibility = newVisibility;
  const preview = await pubs.prepare(f.owner, next.input, randomUUID());
  return { f, pubs, previous, next, preview };
}
const request = (p: Awaited<ReturnType<typeof pair>>) => ({
  previousPublicationId: p.previous.publicationId,
  previousRevision: p.previous.revision,
  previousSnapshotHash: p.previous.snapshotHash,
  previewId: p.preview.previewId,
  previewHash: p.preview.previewHash,
  acknowledged: true,
});
describe('explicit snapshot replacement transaction', () => {
  it('refreshes Official copies only with a new full exact source grant and honors its subsequent revocation', async () => {
    const p = await officialRefreshFixture(db, config),
      repo = refreshes(),
      input = {
        previousPublicationId: p.previous.publicationId,
        previousRevision: p.previous.revision,
        previousSnapshotHash: p.previous.snapshotHash,
        previewId: p.preview.previewId,
        previewHash: p.preview.previewHash,
        acknowledged: true,
      };
    expect(
      (await repo.targets(p.f.owner, p.next.copy.bundle.bundleId, 'official'))
        .items[0]!.publicationId,
    ).toBe(p.previous.publicationId);
    await expect(
      repo.refresh(p.f.owner, 'community', input, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
    const result = await repo.refresh(
      p.f.owner,
      'official',
      input,
      randomUUID(),
    );
    expect(result.publication.snapshot.classification).toBe('official');
    expect(result.publication.snapshot.story.title).toBe(
      'A fully reviewed revised Official title',
    );
    await expect(p.pubs.readPublic(p.previous.slug)).rejects.toMatchObject({
      status: 404,
    });
    await p.f.official.revoke(p.f.owner, {
      grantId: p.next.grant.grant!.id,
      contentHash: p.next.copy.bundle.contentHash,
      reasonCode: 'quality',
      actorLabel: 'Isolated technical curator',
      acknowledged: true,
    });
    await expect(
      p.pubs.readPublic(result.publication.slug),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('leaves the prior Official copy active if the new source grant is revoked before refresh', async () => {
    const p = await officialRefreshFixture(db, config);
    await p.f.official.revoke(p.f.owner, {
      grantId: p.next.grant.grant!.id,
      contentHash: p.next.copy.bundle.contentHash,
      reasonCode: 'quality',
      actorLabel: 'Isolated technical curator',
      acknowledged: true,
    });
    await expect(
      refreshes().refresh(
        p.f.owner,
        'official',
        {
          previousPublicationId: p.previous.publicationId,
          previousRevision: p.previous.revision,
          previousSnapshotHash: p.previous.snapshotHash,
          previewId: p.preview.previewId,
          previewHash: p.preview.previewHash,
          acknowledged: true,
        },
        randomUUID(),
      ),
    ).rejects.toThrow();
    expect((await p.pubs.readPublic(p.previous.slug)).slug).toBe(
      p.previous.slug,
    );
    expect(await p.pubs.forBundle(p.f.owner, p.next.copy.bundle.bundleId)).toBe(
      null,
    );
    expect(await db.query('SELECT id FROM aw_publication_refreshes')).toEqual(
      [],
    );
  });
  it('defaults off, requires strict explicit consent and filters own same-branch active copies', async () => {
    expect(publicationRefreshConfigFromEnv({})).toEqual({ enabled: false });
    expect(() =>
      publicationRefreshConfigFromEnv({ PUBLICATION_REFRESH_ENABLED: 'yes' }),
    ).toThrow();
    const p = await pair(),
      repo = refreshes();
    expect(
      (
        await repo.targets(p.f.owner, p.next.f.bundle.bundleId, 'community')
      ).items.map((i) => i.publicationId),
    ).toEqual([p.previous.publicationId]);
    expect(
      (
        await refreshes(db, false).targets(
          p.f.owner,
          p.next.f.bundle.bundleId,
          'community',
        )
      ).items,
    ).toEqual([]);
    await expect(
      refreshes(db, false).refresh(
        p.f.owner,
        'community',
        request(p),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLICATION_REFRESH_DISABLED' });
    expect(() =>
      publicationRefreshRequestSchema.parse({ ...request(p), force: true }),
    ).toThrow();
    await expect(
      repo.targets(randomUUID(), p.next.f.bundle.bundleId, 'community'),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('creates a distinct immutable copy and atomically withdraws the old link without carrying external permissions', async () => {
    const p = await pair(),
      repo = refreshes(),
      exposure = new PublicExposureRepository(
        db,
        { enabled: true },
        config,
        config,
      );
    await exposure.setOwner(p.f.owner, p.previous.slug, {
      publicationRevision: p.previous.revision,
      snapshotHash: p.previous.snapshotHash,
      permissionRevision: 0,
      mode: 'index',
      acknowledged: true,
    });
    const before = await db.query('SELECT * FROM aw_branches WHERE id=$1', [
      p.f.created.branchId,
    ]);
    const result = await repo.refresh(
      p.f.owner,
      'community',
      request(p),
      randomUUID(),
    );
    expect(result.publication).toMatchObject({
      bundleId: p.next.f.bundle.bundleId,
      status: 'active',
      snapshotHash: p.preview.snapshotHash,
    });
    expect(result.publication.slug).not.toBe(p.previous.slug);
    expect(
      (await p.pubs.forBundle(p.f.owner, p.previous.bundleId))!.snapshot,
    ).toEqual(p.previous.snapshot);
    await expect(p.pubs.readPublic(p.previous.slug)).rejects.toMatchObject({
      status: 404,
    });
    await expect(exposure.project(p.previous.slug)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      (await exposure.ownerView(p.f.owner, result.publication.slug))
        .effectiveMode,
    ).toBe('none');
    expect(
      (await p.pubs.readPublic(result.publication.slug)).snapshot.story.title,
    ).toBe('A reviewed replacement title');
    expect(
      await db.query('SELECT * FROM aw_branches WHERE id=$1', [
        p.f.created.branchId,
      ]),
    ).toEqual(before);
  });
  it('reuses exact refresh with same or new request key and never reactivates a subsequently withdrawn replacement', async () => {
    const p = await pair(),
      repo = refreshes(),
      key = randomUUID(),
      result = await repo.refresh(p.f.owner, 'community', request(p), key);
    expect(await repo.refresh(p.f.owner, 'community', request(p), key)).toEqual(
      result,
    );
    expect(
      await repo.refresh(p.f.owner, 'community', request(p), randomUUID()),
    ).toEqual(result);
    await expect(
      repo.refresh(
        p.f.owner,
        'community',
        { ...request(p), previousRevision: 2 },
        key,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await p.pubs.action(
      p.f.owner,
      result.publication.publicationId,
      'withdraw',
      {
        revision: result.publication.revision,
        snapshotHash: result.publication.snapshotHash,
        acknowledged: true,
      },
      randomUUID(),
    );
    expect(
      (
        await refreshes(db, false).refresh(
          p.f.owner,
          'community',
          request(p),
          key,
        )
      ).publication.status,
    ).toBe('withdrawn');
    expect(
      (await db.query('SELECT id FROM aw_publication_refreshes')).length,
    ).toBe(1);
  });
  it('rolls back the new copy when the old binding, preview, source branch or fresh review is wrong', async () => {
    const p = await pair(),
      repo = refreshes();
    for (const raw of [
      { ...request(p), previousRevision: 2 },
      { ...request(p), previousSnapshotHash: '0'.repeat(64) },
      { ...request(p), previewHash: '0'.repeat(64) },
    ])
      await expect(
        repo.refresh(p.f.owner, 'community', raw, randomUUID()),
      ).rejects.toMatchObject({ status: 409 });
    const foreign = await publicationFixture(db, p.f.owner),
      foreignInput = await approvePublicationFixture(db, foreign);
    if (!foreignInput) throw Error('Missing technical approval');
    const wrong = await p.pubs.prepare(p.f.owner, foreignInput, randomUUID());
    await expect(
      repo.refresh(
        p.f.owner,
        'community',
        {
          ...request(p),
          previewId: wrong.previewId,
          previewHash: wrong.previewHash,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await db.query(
      'DELETE FROM aw_public_content_reviews WHERE user_id=$1 AND bundle_id=$2',
      [p.f.owner, p.next.f.bundle.bundleId],
    );
    await expect(
      repo.refresh(p.f.owner, 'community', request(p), randomUUID()),
    ).rejects.toThrow();
    expect((await p.pubs.readPublic(p.previous.slug)).slug).toBe(
      p.previous.slug,
    );
    expect(await p.pubs.forBundle(p.f.owner, p.next.f.bundle.bundleId)).toBe(
      null,
    );
    expect(await db.query('SELECT id FROM aw_publication_refreshes')).toEqual(
      [],
    );
  });
  it('rejects a hidden or already published replacement and revoked old unlisted tokens stop working on refresh', async () => {
    const p = await pair('unlisted', 'public'),
      repo = refreshes();
    const result = await repo.refresh(
      p.f.owner,
      'community',
      request(p),
      randomUUID(),
    );
    await expect(
      p.pubs.readUnlisted(p.previous.unlistedToken!),
    ).rejects.toMatchObject({ status: 404 });
    expect(result.publication.settings.visibility).toBe('public');
    const q = await pair();
    await q.pubs.confirm(
      q.f.owner,
      {
        previewId: q.preview.previewId,
        previewHash: q.preview.previewHash,
        acknowledged: true,
      },
      randomUUID(),
    );
    await expect(
      repo.refresh(q.f.owner, 'community', request(q), randomUUID()),
    ).rejects.toMatchObject({ status: 409 });
    const r = await pair();
    await r.pubs.moderate({
      publicationId: r.previous.publicationId,
      revision: r.previous.revision,
      snapshotHash: r.previous.snapshotHash,
      action: 'hide',
      reasonCode: 'privacy',
      actorLabel: 'Isolated technical moderator',
      acknowledged: true,
    });
    await expect(
      repo.refresh(r.f.owner, 'community', request(r), randomUUID()),
    ).rejects.toMatchObject({ status: 409 });
    expect(await r.pubs.forBundle(r.f.owner, r.next.f.bundle.bundleId)).toBe(
      null,
    );
  });
  it('requires the owner, disallows foreign preview substitution and rolls back publisher restrictions', async () => {
    const p = await pair(),
      repo = refreshes();
    await expect(
      repo.refresh(randomUUID(), 'community', request(p), randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
    await db.query(
      "INSERT INTO aw_publication_restrictions(user_id,active,revision,reason,actor_label) VALUES($1,true,1,'spam','Isolated technical moderator')",
      [p.f.owner],
    );
    await expect(
      repo.refresh(p.f.owner, 'community', request(p), randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLICATION_RESTRICTED' });
    expect((await p.pubs.readPublic(p.previous.slug)).slug).toBe(
      p.previous.slug,
    );
  });
  it('exports only own immutable refresh history, protects clients and cascades both versions on account deletion', async () => {
    const p = await pair();
    await refreshes().refresh(p.f.owner, 'community', request(p), randomUUID());
    const own = await new Repository(db).exportAccount(p.f.owner);
    expect(own.aw_publication_refreshes).toHaveLength(1);
    await expect(
      db.query('UPDATE aw_publication_refreshes SET request_hash=$1', [
        '0'.repeat(64),
      ]),
    ).rejects.toThrow();
    const [guard] = await db.query(
      "SELECT relrowsecurity AS rls,has_table_privilege('anon',oid,'SELECT') AS anon,has_table_privilege('authenticated',oid,'INSERT') AS client FROM pg_class WHERE oid='aw_publication_refreshes'::regclass",
    );
    expect(guard).toEqual({ rls: true, anon: false, client: false });
    await new Repository(db).deleteAccountData(p.f.owner);
    expect(await db.query('SELECT id FROM aw_publication_refreshes')).toEqual(
      [],
    );
    expect(await db.query('SELECT id FROM aw_publications')).toEqual([]);
  });
  it('requires Auth on HTTP targets and apply, validates origin/query and exposes no public refresh API', async () => {
    const p = await pair(),
      app = await createApp(
        new Repository(db),
        {
          verify: async () => ({ id: p.f.owner }),
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
        { enabled: true },
      );
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl(),
      headers = {
        Authorization: 'Bearer ' + 'a'.repeat(30),
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      path = '/api/v2/publication-refresh/community';
    try {
      expect(
        (
          await fetch(
            base + path + '/bundles/' + p.next.f.bundle.bundleId + '/targets',
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await fetch(
            base +
              path +
              '/bundles/' +
              p.next.f.bundle.bundleId +
              '/targets?owner=other',
            { headers },
          )
        ).status,
      ).toBe(422);
      const r = await fetch(base + path, {
        method: 'POST',
        headers,
        body: JSON.stringify(request(p)),
      });
      expect(r.status).toBe(201);
      expect(r.headers.get('cache-control')).toBe('no-store');
      expect((await r.json()).previousStatus).toBe('withdrawn');
      expect(
        (
          await fetch(base + '/api/public/publication-refresh/community', {
            method: 'POST',
          })
        ).status,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });
});
