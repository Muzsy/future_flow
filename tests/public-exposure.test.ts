// Isolated technical copies, never real provider calls or editorial seed content.
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import {
  PublicExposureRepository,
  publicExposureConfigFromEnv,
  PublicationRepository,
  OfficialPublicationRepository,
  Repository,
  type Database,
} from '@future-flow/database';
import {
  publicExposureRequestSchema,
  publicExposureSchema,
} from '@future-flow/contracts';
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
import {
  externalWebConfig,
  externalProjection,
  externalMetadata,
  externalSitemap,
} from '../apps/web/lib/public-exposure';
const config = { enabled: true, linkSecret: 'e'.repeat(64) };
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
const exposure = (database = db, enabled = true) =>
  new PublicExposureRepository(database, { enabled }, config, config);
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
const request = (
  view: { revision: number; snapshotHash: string },
  mode: 'none' | 'preview' | 'index' = 'preview',
  permissionRevision = 0,
) => ({
  publicationRevision: view.revision,
  snapshotHash: view.snapshotHash,
  permissionRevision,
  mode,
  acknowledged: true,
});
const webEnv = {
  PUBLIC_EXTERNAL_EXPOSURE_ENABLED: 'true',
  PUBLIC_SITE_URL: 'https://alterward.example',
  API_INTERNAL_URL: 'http://api:4000/api/public',
};
describe('external exposure permission separate from immutable publication', () => {
  it('defaults off and rejects unknown permission fields, wrong copies and unlisted grants', async () => {
    expect(publicExposureConfigFromEnv({})).toEqual({ enabled: false });
    expect(() =>
      publicExposureConfigFromEnv({ PUBLIC_EXTERNAL_EXPOSURE_ENABLED: 'yes' }),
    ).toThrow();
    const f = await copy(),
      repo = exposure();
    expect((await repo.ownerView(f.owner, f.view.slug)).effectiveMode).toBe(
      'none',
    );
    await expect(repo.project(f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      exposure(db, false).setOwner(f.owner, f.view.slug, request(f.view)),
    ).rejects.toMatchObject({ code: 'PUBLIC_EXPOSURE_DISABLED' });
    await expect(
      repo.setOwner(randomUUID(), f.view.slug, request(f.view)),
    ).rejects.toMatchObject({ status: 404 });
    expect(() =>
      publicExposureRequestSchema.parse({
        ...request(f.view),
        ownerId: f.owner,
      }),
    ).toThrow();
    const secret = await copy('unlisted');
    await expect(
      repo.setOwner(secret.owner, secret.view.slug, request(secret.view)),
    ).rejects.toMatchObject({ status: 404 });
    expect((await db.query('SELECT id FROM aw_public_exposures')).length).toBe(
      0,
    );
  });
  it('applies explicit preview/index separately, replays once and leaves source/canon/jobs/legacy reader unchanged', async () => {
    const f = await copy(),
      repo = exposure(),
      ownerRepo = new Repository(db),
      before = await ownerRepo.exportAccount(f.owner);
    const preview = await repo.setOwner(f.owner, f.view.slug, request(f.view));
    expect(preview).toMatchObject({
      mode: 'preview',
      effectiveMode: 'preview',
      permissionRevision: 1,
    });
    expect(await repo.setOwner(f.owner, f.view.slug, request(f.view))).toEqual(
      preview,
    );
    const projection = await repo.project(f.view.slug);
    expect(projection).toMatchObject({
      indexable: false,
      mode: 'preview',
      classification: 'community',
    });
    expect(JSON.stringify(projection)).not.toContain(f.owner);
    expect(JSON.stringify(projection)).not.toContain(f.view.snapshotHash);
    expect((await repo.sitemap({})).items).toEqual([]);
    await repo.setOwner(f.owner, f.view.slug, request(f.view, 'index', 1));
    expect((await repo.sitemap({})).items).toHaveLength(1);
    expect((await f.repo.readPublic(f.view.slug)).indexable).toBe(false); // Legacy contract is immutable and describes its original permission.
    const after = await ownerRepo.exportAccount(f.owner);
    for (const key of Object.keys(before))
      if (
        ![
          'exportedAt',
          'aw_public_exposures',
          'aw_public_exposure_actions',
        ].includes(key)
      )
        expect(after[key]).toEqual(before[key]);
    expect(after.aw_public_exposures).toHaveLength(1);
    expect(after.aw_public_exposure_actions).toHaveLength(2);
    const foreign = await copy();
    expect(
      (await ownerRepo.exportAccount(foreign.owner)).aw_public_exposures,
    ).toEqual([]);
  });
  it('binds permission CAS to exact publication hash/revision and rolls back stale expansion', async () => {
    const f = await copy(),
      repo = exposure();
    for (const raw of [
      { ...request(f.view), snapshotHash: '0'.repeat(64) },
      { ...request(f.view), publicationRevision: 2 },
      { ...request(f.view), permissionRevision: 1 },
    ])
      await expect(
        repo.setOwner(f.owner, f.view.slug, raw),
      ).rejects.toMatchObject({ code: 'PUBLIC_EXPOSURE_CONFLICT' });
    await repo.setOwner(f.owner, f.view.slug, request(f.view));
    await expect(
      repo.setOwner(f.owner, f.view.slug, request(f.view, 'index')),
    ).rejects.toMatchObject({ status: 409 });
    expect((await repo.project(f.view.slug)).mode).toBe('preview');
    expect(
      (await db.query('SELECT id FROM aw_public_exposure_actions')).length,
    ).toBe(1);
  });
  it('rejects new exposure for a restricted publisher and allows explicit revocation even when the feature or reader is off', async () => {
    const f = await copy(),
      repo = exposure();
    await repo.setOwner(f.owner, f.view.slug, request(f.view, 'index'));
    await db.query(
      "INSERT INTO aw_publication_restrictions(user_id,active,revision,reason,actor_label) VALUES($1,true,1,'spam','Isolated technical moderator')",
      [f.owner],
    );
    await expect(
      repo.setOwner(f.owner, f.view.slug, request(f.view, 'preview', 1)),
    ).rejects.toMatchObject({ code: 'PUBLICATION_RESTRICTED' });
    const revoked = await new PublicExposureRepository(db, {
      enabled: false,
    }).setOwner(f.owner, f.view.slug, request(f.view, 'none', 1));
    expect(revoked).toMatchObject({
      mode: 'none',
      effectiveMode: 'none',
      permissionRevision: 2,
    });
    expect((await exposure(db, false).sitemap({})).items).toEqual([]);
    await expect(repo.project(f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('withdrawal immediately invalidates metadata and a fresh owner view can revoke the dormant permission', async () => {
    const f = await copy(),
      repo = exposure();
    await repo.setOwner(f.owner, f.view.slug, request(f.view, 'index'));
    const withdrawn = await f.repo.action(
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
    await expect(repo.project(f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    expect((await repo.sitemap({})).items).toEqual([]);
    expect((await repo.ownerView(f.owner, f.view.slug)).effectiveMode).toBe(
      'none',
    );
    await expect(
      repo.setOwner(f.owner, f.view.slug, request(f.view, 'none', 1)),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await exposure(db, false).setOwner(
          f.owner,
          f.view.slug,
          request(withdrawn, 'none', 1),
        )
      ).mode,
    ).toBe('none');
  });
  it('requires trusted Official opt-in, validates live source evidence and allows owner revocation', async () => {
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
      repo = exposure();
    await expect(
      repo.setOwner(f.owner, view.slug, request(view, 'index')),
    ).rejects.toMatchObject({ code: 'PUBLIC_EXPOSURE_CURATOR_REQUIRED' });
    await repo.setOfficial({
      ...request(view, 'index'),
      slug: view.slug,
      actorLabel: 'Isolated technical curator',
    });
    expect((await repo.project(view.slug)).classification).toBe('official');
    await repo.setOwner(f.owner, view.slug, request(view, 'none', 1));
    await expect(repo.project(view.slug)).rejects.toMatchObject({
      status: 404,
    });
    await repo.setOfficial({
      ...request(view, 'index', 2),
      slug: view.slug,
      actorLabel: 'Isolated technical curator',
    });
    await f.official.revoke(f.owner, {
      grantId: grant.grant!.id,
      contentHash: c.bundle.contentHash,
      reasonCode: 'quality',
      actorLabel: 'Isolated technical curator',
      acknowledged: true,
    });
    await expect(repo.project(view.slug)).rejects.toMatchObject({
      status: 404,
    });
    expect((await repo.sitemap({})).items).toEqual([]);
  });
  it('uses bounded slug keyset pages and excludes copies that lose permission between lookup and projection', async () => {
    const a = await copy(),
      b = await copy(),
      repo = exposure();
    for (const f of [a, b])
      await repo.setOwner(f.owner, f.view.slug, request(f.view, 'index'));
    const first = await repo.sitemap({ limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBe(first.items[0]!.slug);
    const second = await repo.sitemap({ limit: 1, cursor: first.nextCursor });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]!.slug > first.items[0]!.slug).toBe(true);
    expect(second.nextCursor).toBe(null);
    let changed = false;
    const raced: Database = {
      ...db,
      query: async <T extends Record<string, unknown>>(
        sql: string,
        values: unknown[] = [],
      ) => {
        const result = await db.query<T>(sql, values);
        if (!changed && sql.includes("WHERE e.mode='index'")) {
          changed = true;
          await db.query(
            "UPDATE aw_publications SET status='hidden',revision=revision+1 WHERE user_id=$1",
            [a.owner],
          );
        }
        return result;
      },
    };
    expect(
      (await exposure(raced).sitemap({})).items.map((i) => i.slug),
    ).toEqual([b.view.slug]);
    await expect(repo.sitemap({ limit: 101 })).rejects.toThrow();
    await expect(repo.sitemap({ identity: 'x' })).rejects.toThrow();
  });
  it('keeps exposure actions immutable/private and cascades both permission and history on publisher deletion', async () => {
    const f = await copy(),
      repo = exposure();
    await repo.setOwner(f.owner, f.view.slug, request(f.view, 'index'));
    await expect(
      db.query("UPDATE aw_public_exposure_actions SET mode='none'"),
    ).rejects.toThrow();
    for (const table of ['aw_public_exposures', 'aw_public_exposure_actions']) {
      const [row] = await db.query(
        "SELECT relrowsecurity AS rls,has_table_privilege('anon',oid,'SELECT') AS anon,has_table_privilege('authenticated',oid,'INSERT') AS client FROM pg_class WHERE oid=$1::regclass",
        [table],
      );
      expect(row).toEqual({ rls: true, anon: false, client: false });
    }
    await new Repository(db).markDeleting(f.owner);
    await expect(repo.project(f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    await new Repository(db).restoreActive(f.owner);
    await expect(repo.project(f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    await new Repository(db).deleteAccountData(f.owner);
    expect(await db.query('SELECT id FROM aw_public_exposures')).toEqual([]);
    expect(await db.query('SELECT id FROM aw_public_exposure_actions')).toEqual(
      [],
    );
  });
  it('serves anonymous no-store allowlisted metadata but requires owner Auth for permission writes and has no curator HTTP route', async () => {
    const f = await copy(),
      repo = exposure();
    await repo.setOwner(f.owner, f.view.slug, request(f.view));
    const app = await createApp(
      new Repository(db),
      {
        verify: async () => ({ id: f.owner }),
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
      { enabled: true },
    );
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    try {
      const res = await fetch(base + '/api/public/external/' + f.view.slug);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      expect(publicExposureSchema.parse(await res.json()).mode).toBe('preview');
      expect(
        (await fetch(base + '/api/public/external/' + f.view.slug + '?token=x'))
          .status,
      ).toBe(422);
      expect(
        (await fetch(base + '/api/v2/public-exposure/' + f.view.slug)).status,
      ).toBe(401);
      expect(
        (
          await fetch(base + '/api/v2/public-exposure/' + f.view.slug, {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + 'a'.repeat(30),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(request(f.view, 'index', 1)),
          })
        ).status,
      ).toBe(201);
      expect(
        (await fetch(base + '/api/public/external/sitemap?limit[]=1')).status,
      ).toBe(422);
      expect(
        (
          await fetch(base + '/api/v2/public-exposure/curator/apply', {
            method: 'POST',
          })
        ).status,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });
});
describe('server metadata and external previews', () => {
  it('requires explicit server configuration and ignores invalid origins or credentialed API URLs', () => {
    expect(externalWebConfig({})).toBe(null);
    expect(externalWebConfig(webEnv)).toEqual({
      site: 'https://alterward.example',
      api: 'http://api:4000/api/public',
    });
    for (const site of [
      'http://alterward.example',
      'https://user:secret@alterward.example',
      'https://alterward.example/path',
      'https://alterward.example/?token=x',
    ])
      expect(externalWebConfig({ ...webEnv, PUBLIC_SITE_URL: site })).toBe(
        null,
      );
    expect(
      externalWebConfig({
        ...webEnv,
        API_INTERNAL_URL: 'https://user:secret@api.example/api/public',
      }),
    ).toBe(null);
    expect(
      externalWebConfig({
        ...webEnv,
        PUBLIC_SITE_URL: 'http://localhost:3000',
      }),
    ).not.toBe(null);
  });
  it('uses fresh credential-free requests, rejects wrong slugs and falls back to generic noindex after revocation or API failure', async () => {
    const f = await copy(),
      repo = exposure();
    await repo.setOwner(f.owner, f.view.slug, request(f.view));
    const item = await repo.project(f.view.slug);
    let options: RequestInit | undefined;
    const fetcher = (async (url, init) => {
      options = init;
      expect(String(url)).toBe(
        webEnv.API_INTERNAL_URL + '/external/' + f.view.slug,
      );
      return Response.json(item);
    }) as typeof fetch;
    expect(await externalProjection(f.view.slug, webEnv, fetcher)).toEqual(
      item,
    );
    expect(options).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
    });
    const failure = (async () =>
      new Response('', { status: 404 })) as typeof fetch;
    expect(await externalProjection(f.view.slug, webEnv, failure)).toBe(null);
    const wrong = (async () =>
      Response.json({
        ...item,
        slug: 'life-' + '0'.repeat(32),
      })) as typeof fetch;
    expect(await externalProjection(f.view.slug, webEnv, wrong)).toBe(null);
    const fallback = externalMetadata(null, webEnv.PUBLIC_SITE_URL);
    expect(fallback.robots).toMatchObject({ index: false, follow: false });
    expect(fallback.openGraph).toBeUndefined();
    expect(fallback.alternates).toBeUndefined();
    const preview = externalMetadata(item, webEnv.PUBLIC_SITE_URL);
    expect(preview.robots).toMatchObject({ index: false });
    expect(preview.openGraph).toMatchObject({
      title: item.title,
      url: webEnv.PUBLIC_SITE_URL + '/lives/' + f.view.slug,
    });
    expect(
      externalMetadata(
        { ...item, mode: 'index', indexable: true },
        webEnv.PUBLIC_SITE_URL,
      ).robots,
    ).toMatchObject({ index: true, follow: true });
  });
  it('paginates authorized index entries and fails explicitly for outages, repeated cursors and over-capacity sitemap', async () => {
    const f = await copy(),
      repo = exposure();
    await repo.setOwner(f.owner, f.view.slug, request(f.view, 'index'));
    const item = await repo.project(f.view.slug);
    let calls = 0;
    const fetcher = (async () =>
      Response.json({
        schemaVersion: 'public-exposure-1',
        items: calls === 0 ? [item] : [],
        nextCursor: calls++ === 0 ? item.slug : null,
      })) as typeof fetch;
    expect(await externalSitemap(webEnv, fetcher)).toHaveLength(1);
    expect(calls).toBe(2);
    expect(await externalSitemap({}, fetcher)).toEqual([]);
    const failure = (async () =>
      new Response('', { status: 503 })) as typeof fetch;
    await expect(externalSitemap(webEnv, failure)).rejects.toThrow();
    const loop = (async () =>
      Response.json({
        schemaVersion: 'public-exposure-1',
        items: [],
        nextCursor: item.slug,
      })) as typeof fetch;
    await expect(externalSitemap(webEnv, loop)).rejects.toThrow(
      'Unstable sitemap cursor',
    );
    let cursor = 0;
    const full = (async () =>
      Response.json({
        schemaVersion: 'public-exposure-1',
        items: [],
        nextCursor: 'life-' + String(++cursor).padStart(32, '0'),
      })) as typeof fetch;
    await expect(externalSitemap(webEnv, full)).rejects.toThrow(
      'Sitemap exceeds pilot capacity',
    );
  });
});
