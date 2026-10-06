// Isolated technical fixtures only; never actual provider calls or real editorial selections.
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import {
  PublicCollectionsRepository,
  publicCollectionsConfigFromEnv,
  PublicationRepository,
  OfficialPublicationRepository,
  Repository,
  type Database,
} from '@future-flow/database';
import {
  publicCollectionRequestSchema,
  publicCollectionPageSchema,
} from '@future-flow/contracts';
import { hash } from '@future-flow/core';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  publicationFixture,
  approvePublicationFixture,
} from './publication-fixtures';
import {
  officialLifeFixture,
  processOfficialFixture,
  officialBundleFixture,
  officialGrant,
} from './official-life-fixtures';
import { createApp } from '../apps/api/src/app';
const config = { enabled: true, linkSecret: 'c'.repeat(64) };
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
afterEach(async () => {
  await db.query('DELETE FROM ff_users');
  await db.query('DELETE FROM aw_public_collection_actions');
  await db.query(
    'UPDATE aw_public_collections SET revision=1,last_request_hash=NULL',
  );
});
afterAll(async () => {
  await engine?.close();
});
const collections = (database = db) =>
  new PublicCollectionsRepository(
    database,
    { enabled: true },
    { enabled: true },
    config,
    config,
  );
async function copy(visibility: 'public' | 'unlisted' = 'public') {
  const f = await publicationFixture(db),
    input = await approvePublicationFixture(db, f);
  if (!input) throw Error('Technical approval missing');
  input.settings.visibility = visibility;
  const repo = new PublicationRepository(db, config),
    preview = await repo.prepare(f.owner, input, randomUUID()),
    view = await repo.confirm(
      f.owner,
      {
        previewId: preview.previewId,
        previewHash: preview.previewHash,
        acknowledged: true,
      },
      randomUUID(),
    );
  return { ...f, repo, view };
}
const entry = (f: Awaited<ReturnType<typeof copy>>) => ({
  slug: f.view.slug,
  publicationRevision: f.view.revision,
  snapshotHash: f.view.snapshotHash,
});
const request = (
  entries: unknown[],
  collectionId = 'featured',
  revision = 1,
) => ({
  collectionId,
  revision,
  entries,
  actorLabel: 'Isolated technical editor',
  acknowledged: true,
});
describe('trusted public collections and live English card projection', () => {
  it('defaults off, closes Discovery and rejects arbitrary keys, identity, duplicates and overlong selections', async () => {
    expect(publicCollectionsConfigFromEnv({})).toEqual({ enabled: false });
    expect(() =>
      publicCollectionsConfigFromEnv({ PUBLIC_COLLECTIONS_ENABLED: 'yes' }),
    ).toThrow();
    await expect(
      new PublicCollectionsRepository(db).list('featured'),
    ).rejects.toMatchObject({ code: 'PUBLIC_COLLECTIONS_DISABLED' });
    await expect(
      new PublicCollectionsRepository(db, { enabled: true }).list('featured'),
    ).rejects.toMatchObject({ status: 404 });
    const f = await copy();
    for (const raw of [
      request([entry(f)], 'trending'),
      request([entry(f), entry(f)]),
      { ...request([]), userId: f.owner },
      request(Array.from({ length: 25 }, () => entry(f))),
    ])
      expect(() => publicCollectionRequestSchema.parse(raw)).toThrow();
  });
  it('applies the exact selection in curated order once without changing source, jobs or own export', async () => {
    const a = await copy(),
      b = await copy(),
      repo = collections(),
      input = request([entry(b), entry(a)]),
      before = await new Repository(db).exportAccount(a.owner);
    const receipt = await repo.set(input);
    expect(receipt.revision).toBe(2);
    expect(await repo.set(input)).toEqual(receipt);
    const page = await repo.list('featured');
    expect(page.items.map((c) => c.slug)).toEqual([b.view.slug, a.view.slug]);
    expect(page.ranking).toBe('curated');
    expect(
      await db.query('SELECT id FROM aw_public_collection_actions'),
    ).toHaveLength(1);
    const { exportedAt: _t, ...prior } = before,
      { exportedAt: _a, ...after } = await new Repository(db).exportAccount(
        a.owner,
      );
    expect(hash(prior)).toBe(hash(after));
    const dto = JSON.stringify(page);
    for (const secret of [
      a.owner,
      a.view.publicationId,
      a.view.snapshotHash,
      a.bundle.bundleId,
    ])
      expect(dto).not.toContain(secret);
  });
  it('rejects stale collection and publication bindings and rolls back an invalid full replacement', async () => {
    const f = await copy(),
      repo = collections();
    await repo.set(request([entry(f)]));
    await expect(repo.set(request([], 'featured'))).rejects.toMatchObject({
      code: 'PUBLIC_COLLECTION_CONFLICT',
    });
    for (const e of [
      { ...entry(f), publicationRevision: 2 },
      { ...entry(f), snapshotHash: '7'.repeat(64) },
      { ...entry(f), slug: 'life-' + 'a'.repeat(32) },
    ])
      await expect(repo.set(request([e], 'featured', 2))).rejects.toThrow();
    expect((await repo.list('featured')).items.map((c) => c.slug)).toEqual([
      f.view.slug,
    ]);
    expect(
      await db.query('SELECT id FROM aw_public_collection_actions'),
    ).toHaveLength(1);
  });
  it('permits explicit replacement and clearing with the current revision and keeps the prior audit', async () => {
    const a = await copy(),
      b = await copy(),
      repo = collections();
    await repo.set(request([entry(a)]));
    await repo.set(request([entry(b)], 'featured', 2));
    expect((await repo.list('featured')).items[0]!.slug).toBe(b.view.slug);
    const cleared = await repo.set(request([], 'featured', 3));
    expect(cleared.revision).toBe(4);
    expect((await repo.list('featured')).items).toEqual([]);
    expect(
      await db.query('SELECT id FROM aw_public_collection_actions'),
    ).toHaveLength(3);
  });
  it('requires current public readers at curation and rechecks hide and withdrawal for every card', async () => {
    const f = await copy(),
      u = await copy('unlisted'),
      repo = collections();
    await expect(repo.set(request([entry(u)]))).rejects.toMatchObject({
      status: 404,
    });
    await repo.set(request([entry(f)]));
    await f.repo.action(
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
    expect((await repo.list('featured')).items).toEqual([]);
    await expect(
      repo.set(request([entry(f)], 'featured', 2)),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('rejects cards withdrawn after candidate lookup without retaining title or summary', async () => {
    const f = await copy();
    await collections().set(request([entry(f)]));
    let run = true;
    const raced: Database = {
      ...db,
      query: async <T extends Record<string, unknown>>(
        sql: string,
        values: unknown[] = [],
      ) => {
        const rows = await db.query<T>(sql, values);
        if (run && sql.includes('FROM aw_public_collection_entries e')) {
          run = false;
          await f.repo.moderate({
            publicationId: f.view.publicationId,
            revision: f.view.revision,
            snapshotHash: f.view.snapshotHash,
            action: 'hide',
            reasonCode: 'privacy',
            actorLabel: 'Isolated technical editor',
            acknowledged: true,
          });
        }
        return rows;
      },
    };
    expect((await collections(raced).list('featured')).items).toEqual([]);
  });
  it('admits Community picks and reviewed decision points without claiming metrics-based ranking', async () => {
    const f = await copy(),
      repo = collections();
    await repo.set(request([entry(f)], 'community-picks'));
    await repo.set(request([entry(f)], 'turning-points'));
    expect((await repo.list('community-picks')).items[0]!.classification).toBe(
      'community',
    );
    expect((await repo.list('turning-points')).items).toHaveLength(1);
    const page = await repo.list('turning-points');
    expect(() =>
      publicCollectionPageSchema.parse({ ...page, title: 'Wrong title' }),
    ).toThrow();
  });
  it('requires full Official source permission and excludes Official from Community picks', async () => {
    const f = await officialLifeFixture(db),
      created = await f.official.start(f.owner, f.startRequest, randomUUID());
    await processOfficialFixture(db, f.owner, created.jobId);
    const c = await officialBundleFixture(db, f, created),
      inspected = await f.official.inspect(f.owner, c.bundle.bundleId),
      grant = await f.official.grant(f.owner, officialGrant(inspected)),
      pubs = new OfficialPublicationRepository(db, config),
      preview = await pubs.prepare(
        f.owner,
        {
          binding: {
            ...inspected.evidence.binding,
            sourceVersion: 'official-life-source-1',
            grantId: grant.grant!.id,
            evidenceHash: inspected.evidenceHash,
          },
          settings: {
            visibility: 'public',
            authorMode: 'anonymous',
            indexable: false,
          },
        },
        randomUUID(),
      ),
      view = await pubs.confirm(
        f.owner,
        {
          previewId: preview.previewId,
          previewHash: preview.previewHash,
          acknowledged: true,
        },
        randomUUID(),
      ),
      e = {
        slug: view.slug,
        publicationRevision: view.revision,
        snapshotHash: view.snapshotHash,
      },
      repo = collections();
    for (const key of ['community-picks', 'turning-points'])
      await expect(repo.set(request([e], key))).rejects.toMatchObject({
        code: 'PUBLIC_COLLECTION_INELIGIBLE',
      });
    await repo.set(request([e]));
    expect((await repo.list('featured')).items[0]!.classification).toBe(
      'official',
    );
    await f.official.revoke(f.owner, {
      grantId: grant.grant!.id,
      contentHash: c.bundle.contentHash,
      reasonCode: 'quality',
      actorLabel: 'Isolated technical editor',
      acknowledged: true,
    });
    expect((await repo.list('featured')).items).toEqual([]);
  });
  it('keeps platform audit immutable, denies browser table access and cascades publisher membership', async () => {
    const f = await copy();
    await collections().set(request([entry(f)]));
    const [audit] = await db.query<{ id: string }>(
      'SELECT id FROM aw_public_collection_actions',
    );
    await expect(
      db.query(
        'UPDATE aw_public_collection_actions SET actor_label=$1 WHERE id=$2',
        ['changed', audit!.id],
      ),
    ).rejects.toThrow();
    for (const table of [
      'aw_public_collections',
      'aw_public_collection_entries',
      'aw_public_collection_actions',
    ])
      expect(
        (
          await db.query(
            "SELECT relrowsecurity AS rls,has_table_privilege('anon',oid,'SELECT') AS anon,has_table_privilege('authenticated',oid,'INSERT') AS client FROM pg_class WHERE oid=$1::regclass",
            [table],
          )
        )[0],
      ).toEqual({ rls: true, anon: false, client: false });
    await new Repository(db).markDeleting(f.owner);
    expect((await collections().list('featured')).items).toEqual([]);
    await new Repository(db).deleteAccountData(f.owner);
    expect(
      await db.query('SELECT id FROM aw_public_collection_entries'),
    ).toEqual([]);
    expect(
      await db.query('SELECT id FROM aw_public_collection_actions'),
    ).toHaveLength(1);
  });
  it('exposes anonymous no-store cards while rejecting browser curation, query injection and unknown collections', async () => {
    const f = await copy();
    await collections().set(request([entry(f)]));
    const app = await createApp(
      new Repository(db),
      { verify: async () => ({ id: f.owner }), deleteUser: async () => {} },
      undefined,
      undefined,
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
      { enabled: true },
      { enabled: false },
      { enabled: false },
      { enabled: false },
      { enabled: true },
    );
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    try {
      const response = await fetch(base + '/api/public/collections/featured');
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(
        publicCollectionPageSchema.parse(await response.json()).items,
      ).toHaveLength(1);
      for (const suffix of [
        'featured?userId=' + f.owner,
        'featured?page=0',
        'trending',
      ])
        expect(
          (await fetch(base + '/api/public/collections/' + suffix)).status,
        ).toBe(422);
      for (const path of [
        '/api/public/collections/featured',
        '/api/v2/collections/apply',
      ])
        expect(
          (
            await fetch(base + path, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(request([])),
            })
          ).status,
        ).toBe(404);
    } finally {
      await app.close();
    }
  });
});
