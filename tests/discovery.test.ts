// Fully isolated technical publication fixtures. No paid provider call or genuine seed.
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import {
  discoveryPageSchema,
  discoveryQuerySchema,
  parseDiscoveryWireQuery,
} from '@future-flow/contracts';
import {
  DiscoveryRepository,
  discoveryConfigFromEnv,
  PublicationRepository,
  OfficialPublicationRepository,
  Repository,
  type Database,
} from '@future-flow/database';
import { DomainError, hash } from '@future-flow/core';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
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
import {
  discoveryPageLink,
  discoveryLifeLink,
  discoverySearch,
} from '../apps/web/lib/discovery';
let engine: PGlite,
  db: Database,
  app: Awaited<ReturnType<typeof createApp>>,
  base: string;
const config = { enabled: true, linkSecret: 'c'.repeat(64) },
  disabled = { enabled: false, linkSecret: '' };
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
  app = await createApp(
    new Repository(db),
    {
      verify: async () => {
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
    undefined,
    undefined,
    undefined,
    undefined,
    config,
    config,
    { enabled: true },
  );
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterEach(async () => {
  await db.query('DELETE FROM ff_users');
});
afterAll(async () => {
  await app?.close();
  await engine?.close();
});
const discovery = (community = config, official = config, database = db) =>
  new DiscoveryRepository(database, { enabled: true }, community, official);
async function community(visibility: 'public' | 'unlisted' = 'public') {
  const f = await publicationFixture(db),
    input = await approvePublicationFixture(db, f);
  if (!input) throw Error('Technical review missing');
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
async function official(visibility: 'public' | 'unlisted' = 'public') {
  const f = await officialLifeFixture(db),
    created = await f.official.start(f.owner, f.startRequest, randomUUID());
  await processOfficialFixture(db, f.owner, created.jobId);
  const content = await officialBundleFixture(db, f, created),
    inspected = await f.official.inspect(f.owner, content.bundle.bundleId),
    grant = await f.official.grant(f.owner, officialGrant(inspected));
  const repo = new OfficialPublicationRepository(db, config),
    preview = await repo.prepare(
      f.owner,
      {
        binding: {
          ...inspected.evidence.binding,
          sourceVersion: 'official-life-source-1',
          grantId: grant.grant!.id,
          evidenceHash: inspected.evidenceHash,
        },
        settings: { visibility, authorMode: 'anonymous', indexable: false },
      },
      randomUUID(),
    ),
    view = await repo.confirm(
      f.owner,
      {
        previewId: preview.previewId,
        previewHash: preview.previewHash,
        acknowledged: true,
      },
      randomUUID(),
    );
  return { ...f, created, content, grant, repo, view };
}
describe('read-only English Discovery permission foundation', () => {
  it('defaults off, validates the bounded query and rejects extra origin or language claims', async () => {
    expect(discoveryConfigFromEnv({})).toEqual({ enabled: false });
    expect(() =>
      discoveryConfigFromEnv({ DISCOVERY_ENABLED: 'yes' }),
    ).toThrow();
    await expect(new DiscoveryRepository(db).list()).rejects.toMatchObject({
      code: 'DISCOVERY_DISABLED',
      status: 404,
    });
    for (const q of [
      { locale: 'hu' },
      { category: 'anything' },
      { classification: 'admin' },
      { page: 0 },
      { pageSize: 25 },
      { ownerId: randomUUID() },
      { q: 'x'.repeat(81) },
    ])
      expect(() => discoveryQuerySchema.parse(q)).toThrow();
  });
  it('uses a shared strict search parser and preserves escaped filters and reader origin in links', () => {
    const query = parseDiscoveryWireQuery({
      q: '  course & practice  ',
      category: 'education',
      classification: 'official',
      pageSize: '8',
    });
    expect(discoverySearch(query)).toBe(
      'q=course+%26+practice&category=education&classification=official&pageSize=8',
    );
    expect(discoveryPageLink(query, 2)).toContain('&page=2&');
    expect(parseDiscoveryWireQuery({ category: '' }).category).toBe(null);
    for (const raw of [
      { page: '01' },
      { q: ['injected'] },
      { q: 'x', ownerId: 'ignored' },
    ])
      expect(() => parseDiscoveryWireQuery(raw)).toThrow();
    const card = {
      slug: 'official-' + 'a'.repeat(32),
      classification: 'official',
      contentLocale: 'en',
      title: 'A course and a choice',
      summary: 'A fictional person considers an evening course.',
      category: 'education',
      periodCount: 3,
      publishedAt: new Date().toISOString(),
      aiGenerated: true,
      userEdited: false,
    };
    expect(discoveryLifeLink(card as never)).toBe(
      '/official-lives/' + card.slug,
    );
    expect(() =>
      discoveryLifeLink({ ...card, classification: 'community' } as never),
    ).toThrow();
  });
  it('lists only strict card projections from active public readers, keeps private canon and jobs unchanged', async () => {
    const f = await official(),
      g = await community();
    const privateState = async () => {
      const { exportedAt: _timestamp, ...data } = await new Repository(
        db,
      ).exportAccount(f.owner);
      return hash(data);
    };
    const privateBefore = await privateState();
    const page = discoveryPageSchema.parse(await discovery().list());
    expect(page.items).toHaveLength(2);
    expect(page.items.map((c) => c.classification).sort()).toEqual([
      'community',
      'official',
    ]);
    const text = JSON.stringify(page);
    for (const secret of [
      f.owner,
      f.created.lifeId,
      f.created.branchId,
      f.content.bundle.bundleId,
      f.grant.grant!.id,
      f.grant.grant!.evidenceHash,
      g.owner,
    ])
      expect(text).not.toContain(secret);
    expect(text).not.toContain('checkpoints');
    expect(text).not.toContain('"chapter":');
    expect(text).not.toContain('requestId');
    expect(await privateState()).toBe(privateBefore);
    expect(
      (await discovery(config, disabled).list()).items.map((c) => c.slug),
    ).toEqual([g.view.slug]);
    expect(
      (await discovery(disabled, config).list()).items.map((c) => c.slug),
    ).toEqual([f.view.slug]);
    expect((await discovery(disabled, disabled).list()).items).toEqual([]);
  });
  it('filters English category, literal search and classification, with bounded stable pages', async () => {
    const f = await community(),
      g = await community();
    const all = await discovery().list({ pageSize: 1 });
    expect(all.items).toHaveLength(1);
    expect(all.hasMore).toBe(true);
    const next = await discovery().list({ pageSize: 1, page: 2 });
    expect(next.items).toHaveLength(1);
    expect(next.items[0]!.slug).not.toBe(all.items[0]!.slug);
    expect(next.hasMore).toBe(false);
    expect(
      (await discovery().list({ classification: 'official' })).items,
    ).toEqual([]);
    expect(
      (
        await discovery().list({
          category: f.view.snapshot.story.category,
          q: f.view.snapshot.story.title.toUpperCase(),
        })
      ).items,
    ).toHaveLength(2);
    for (const q of ['%', '_', "'; DROP TABLE ff_users; --", 'NO_MATCH_VALUE'])
      expect((await discovery().list({ q })).items).toEqual([]);
    expect(
      await db.query('SELECT id FROM ff_users WHERE id=$1', [g.owner]),
    ).toHaveLength(1);
  });
  it('excludes unlisted, withdrawn, hidden, removed and deleting owners', async () => {
    await official('unlisted');
    const unlisted = await community('unlisted'),
      withdrawn = await community(),
      hidden = await community(),
      removed = await official();
    await withdrawn.repo.action(
      withdrawn.owner,
      withdrawn.view.publicationId,
      'withdraw',
      {
        revision: withdrawn.view.revision,
        snapshotHash: withdrawn.view.snapshotHash,
        acknowledged: true,
      },
      randomUUID(),
    );
    await hidden.repo.moderate({
      publicationId: hidden.view.publicationId,
      revision: hidden.view.revision,
      snapshotHash: hidden.view.snapshotHash,
      action: 'hide',
      reasonCode: 'privacy',
      actorLabel: 'Isolated technical moderation',
      acknowledged: true,
    });
    await removed.repo.moderate({
      publicationId: removed.view.publicationId,
      revision: removed.view.revision,
      snapshotHash: removed.view.snapshotHash,
      action: 'remove',
      reasonCode: 'content',
      actorLabel: 'Isolated technical moderation',
      acknowledged: true,
    });
    expect((await discovery().list()).items).toEqual([]);
    expect(unlisted.view.unlistedToken).toBeTruthy();
    const active = await community();
    await new Repository(db).markDeleting(active.owner);
    expect((await discovery().list()).items).toEqual([]);
  });
  it('rechecks full Official provenance and does not keep a card when a source or copy is revoked', async () => {
    const f = await official();
    expect((await discovery().list()).items).toHaveLength(1);
    await f.official.revoke(f.owner, {
      grantId: f.grant.grant!.id,
      contentHash: f.content.bundle.contentHash,
      reasonCode: 'quality',
      actorLabel: 'Isolated technical source revocation',
      acknowledged: true,
    });
    expect((await discovery().list()).items).toEqual([]);
    const g = await community();
    let race = true;
    const raced: Database = {
      ...db,
      query: async <T extends Record<string, unknown>>(
        sql: string,
        values: unknown[] = [],
      ) => {
        const rows = await db.query<T>(sql, values);
        if (race && sql.includes('ORDER BY published_at DESC')) {
          race = false;
          await g.repo.action(
            g.owner,
            g.view.publicationId,
            'withdraw',
            {
              revision: g.view.revision,
              snapshotHash: g.view.snapshotHash,
              acknowledged: true,
            },
            randomUUID(),
          );
        }
        return rows;
      },
    };
    expect((await discovery(config, config, raced).list()).items).toEqual([]);
  });
  it('serves anonymous no-store HTTP cards and rejects operator, locale, paging and unknown query injection', async () => {
    await community();
    const r = await fetch(base + '/api/public/discovery');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('no-store');
    expect(discoveryPageSchema.parse(await r.json()).items).toHaveLength(1);
    for (const q of [
      'locale=hu',
      'page=0',
      'pageSize=25',
      'classification=admin',
      'ownerId=ignored',
      'q[]=anything',
      'page=1.5',
    ])
      expect((await fetch(base + '/api/public/discovery?' + q)).status).toBe(
        422,
      );
    expect(
      (
        await fetch(base + '/api/public/discovery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(404);
  });
});
