// Isolated technical fixtures; no paid provider calls or genuine seed writes.
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import {
  savedLifeStatusSchema,
  savedLivesPageSchema,
  parseSavedLivesWireQuery,
} from '@future-flow/contracts';
import {
  SavedLivesRepository,
  savedLivesConfigFromEnv,
  Repository,
  PublicationRepository,
  OfficialPublicationRepository,
  type Database,
} from '@future-flow/database';
import { DomainError } from '@future-flow/core';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
import {
  publicLifeShareUrl,
  publicLifePath,
} from '../apps/web/lib/public-life-link';
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
const config = { enabled: true, linkSecret: 'c'.repeat(64) },
  off = { enabled: false, linkSecret: '' };
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
});
afterAll(async () => {
  await engine?.close();
});
const saved = (community = config, official = config, database = db) =>
  new SavedLivesRepository(database, { enabled: true }, community, official);
async function actor() {
  const id = randomUUID();
  await new Repository(db).ensureUser(id);
  return id;
}
async function community(visibility: 'public' | 'unlisted' = 'public') {
  const f = await publicationFixture(db),
    input = await approvePublicationFixture(db, f);
  if (!input) throw Error('Missing fixture approval');
  input.settings.visibility = visibility;
  const repo = new PublicationRepository(db, config),
    preview = await repo.prepare(f.owner, input, randomUUID());
  const view = await repo.confirm(
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
async function official() {
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
        settings: {
          visibility: 'public',
          authorMode: 'anonymous',
          indexable: false,
        },
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
describe('authenticated saved public lives', () => {
  it('shares only a validated public origin and origin-specific slug without secrets or tracking', () => {
    const official = 'official-' + 'a'.repeat(32),
      community = 'life-' + 'b'.repeat(32);
    expect(publicLifeShareUrl('https://example.com', official)).toBe(
      'https://example.com/official-lives/' + official,
    );
    expect(publicLifePath(community)).toBe('/lives/' + community);
    for (const origin of [
      'https://example.com/?secret=x',
      'https://example.com/#secret',
      'https://u:p@example.com',
      'javascript:alert(1)',
    ])
      expect(() => publicLifeShareUrl(origin, official)).toThrow();
    for (const slug of [
      'x'.repeat(43),
      official + '?token=x',
      community + '#secret',
      '../../unlisted',
    ])
      expect(() => publicLifeShareUrl('https://example.com', slug)).toThrow();
  });
  it('defaults off and strictly bounds routes, empty mutations and pagination', async () => {
    expect(savedLivesConfigFromEnv({})).toEqual({ enabled: false });
    expect(() =>
      savedLivesConfigFromEnv({ SAVED_LIVES_ENABLED: 'yes' }),
    ).toThrow();
    await expect(
      new SavedLivesRepository(db).list(randomUUID()),
    ).rejects.toMatchObject({ code: 'SAVED_LIVES_DISABLED', status: 404 });
    for (const q of [
      { page: '0' },
      { page: '01' },
      { page: ['1'] },
      { pageSize: '25' },
      { ownerId: randomUUID() },
    ])
      expect(() => parseSavedLivesWireQuery(q)).toThrow();
    expect(parseSavedLivesWireQuery({})).toEqual({ page: 1, pageSize: 12 });
  });
  it('idempotently saves one pointer, isolates users and projects minimal export metadata', async () => {
    const f = await community(),
      a = await actor(),
      b = await actor(),
      repo = saved();
    await repo.save(a, f.view.slug);
    await repo.save(a, f.view.slug);
    expect(await db.query('SELECT id FROM aw_saved_lives')).toHaveLength(1);
    expect((await repo.getStatus(a, f.view.slug)).saved).toBe(true);
    expect((await repo.getStatus(b, f.view.slug)).saved).toBe(false);
    expect((await repo.list(b)).items).toEqual([]);
    await repo.remove(b, f.view.slug);
    expect((await repo.list(a)).items).toHaveLength(1);
    const page = savedLivesPageSchema.parse(await repo.list(a));
    expect(page.items[0]!.card!.slug).toBe(f.view.slug);
    const exported = await new Repository(db).exportAccount(a),
      metadata = exported.aw_saved_lives as Record<string, unknown>[];
    expect(Object.keys(metadata[0]!).sort()).toEqual(['saved_at', 'slug']);
    expect(JSON.stringify(metadata)).not.toContain(f.owner);
    expect(JSON.stringify(metadata)).not.toContain(f.view.publicationId);
    await repo.remove(a, f.view.slug);
    await repo.remove(a, f.view.slug);
    expect((await repo.list(a)).items).toEqual([]);
  });
  it('rejects secret links, unlisted copies, missing targets and independently disabled publishers', async () => {
    const f = await community('unlisted'),
      a = await actor();
    await expect(saved().save(a, f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    await expect(saved().save(a, 'x'.repeat(43))).rejects.toThrow();
    await expect(
      saved().save(a, 'life-' + 'a'.repeat(32)),
    ).rejects.toMatchObject({ status: 404 });
    const p = await community();
    await expect(saved(off).save(a, p.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    expect(await db.query('SELECT id FROM aw_saved_lives')).toEqual([]);
  });
  it('removes story text and titles on withdrawal, hide and publisher deletion while allowing unsave', async () => {
    const a = await actor(),
      f = await community(),
      repo = saved();
    await repo.save(a, f.view.slug);
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
    expect((await repo.list(a)).items[0]!.card).toBeNull();
    await expect(repo.getStatus(a, f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    await expect(repo.save(a, f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    await repo.remove(a, f.view.slug);
    expect((await repo.list(a)).items).toEqual([]);
    const h = await community();
    await repo.save(a, h.view.slug);
    await h.repo.moderate({
      publicationId: h.view.publicationId,
      revision: h.view.revision,
      snapshotHash: h.view.snapshotHash,
      acknowledged: true,
      action: 'hide',
      reasonCode: 'privacy',
      actorLabel: 'Fixture moderation',
    });
    expect((await repo.list(a)).items[0]!.card).toBeNull();
    await new Repository(db).markDeleting(h.owner);
    expect((await repo.list(a)).items[0]!.card).toBeNull();
    await new Repository(db).deleteAccountData(h.owner);
    expect((await repo.list(a)).items).toEqual([]);
  });
  it('clears own saves on account deletion and forbids operations while deleting', async () => {
    const f = await community(),
      a = await actor(),
      repo = saved();
    await repo.save(a, f.view.slug);
    await new Repository(db).markDeleting(a);
    for (const call of [
      repo.list(a),
      repo.save(a, f.view.slug),
      repo.remove(a, f.view.slug),
    ])
      await expect(call).rejects.toMatchObject({ status: 404 });
    await new Repository(db).deleteAccountData(a);
    expect(await db.query('SELECT id FROM aw_saved_lives')).toEqual([]);
  });
  it('checks full Official provenance on every read and hides saved revoked copies', async () => {
    const f = await official(),
      a = await actor(),
      repo = saved();
    await repo.save(a, f.view.slug);
    expect((await repo.list(a)).items[0]!.card!.classification).toBe(
      'official',
    );
    expect((await saved(config, off).list(a)).items[0]!.card).toBeNull();
    await f.official.revoke(f.owner, {
      grantId: f.grant.grant!.id,
      contentHash: f.content.bundle.contentHash,
      reasonCode: 'quality',
      actorLabel: 'Fixture revocation',
      acknowledged: true,
    });
    expect((await repo.list(a)).items[0]!.card).toBeNull();
    await expect(repo.save(a, f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    await repo.remove(a, f.view.slug);
    expect((await repo.list(a)).items).toEqual([]);
  });
  it('enforces the 500-save quota after the duplicate check', async () => {
    const f = await community(),
      a = await actor(),
      repo = saved();
    await repo.save(a, f.view.slug);
    // Count injection exercises the server quota without manufacturing hundreds of reviewed copies.
    const capped: Database = {
      ...db,
      transaction: (run) =>
        db.transaction((tx) =>
          run({
            ...tx,
            query: async <T extends Record<string, unknown>>(
              sql: string,
              values?: unknown[],
            ) =>
              sql.startsWith('SELECT count(*)')
                ? ([{ count: '500' }] as unknown as T[])
                : tx.query<T>(sql, values),
          }),
        ),
    };
    await expect(
      saved(config, config, capped).save(a, f.view.slug),
    ).resolves.toMatchObject({ saved: true });
    const other = await community();
    await expect(
      saved(config, config, capped).save(a, other.view.slug),
    ).rejects.toMatchObject({ code: 'SAVED_LIVES_LIMIT' });
    expect(
      await db.query('SELECT id FROM aw_saved_lives WHERE user_id=$1', [a]),
    ).toHaveLength(1);
  });
  it('denies direct browser roles and enforces pointer constraints and cascades', async () => {
    const f = await community(),
      a = await actor();
    await saved().save(a, f.view.slug);
    const [row] = await db.query<{ relrowsecurity: boolean }>(
      'SELECT relrowsecurity FROM pg_class WHERE relname=$1',
      ['aw_saved_lives'],
    );
    expect(row!.relrowsecurity).toBe(true);
    for (const role of ['anon', 'authenticated']) {
      await engine.exec('SET ROLE ' + role);
      try {
        await expect(
          db.query('SELECT * FROM aw_saved_lives'),
        ).rejects.toThrow();
      } finally {
        await engine.exec('RESET ROLE');
      }
    }
    await expect(
      db.query('INSERT INTO aw_saved_lives(user_id) VALUES($1)', [a]),
    ).rejects.toThrow();
  });
  it('authenticates all HTTP methods, rejects injected body/query and returns no-store allowlisted data', async () => {
    const f = await community(),
      a = await actor(),
      token = 'a'.repeat(30),
      auth = {
        verify: async (t: string) => {
          if (t !== token)
            throw new DomainError('AUTH_INVALID_TOKEN', 'Invalid', 401);
          return { id: a };
        },
        deleteUser: async () => {},
      };
    const app = await createApp(
      new Repository(db),
      auth,
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
      { enabled: false },
      { enabled: true },
    );
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl(),
      path = '/api/v2/saved-lives/' + f.view.slug;
    const request = (
      p: string,
      method = 'GET',
      body?: unknown,
      authenticated = true,
    ) =>
      fetch(base + p, {
        method,
        headers: {
          ...(authenticated ? { Authorization: 'Bearer ' + token } : {}),
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    try {
      for (const method of ['GET', 'PUT', 'DELETE'])
        expect(
          (
            await request(
              path,
              method,
              method === 'PUT' ? {} : undefined,
              false,
            )
          ).status,
        ).toBe(401);
      expect((await request(path, 'PUT', { userId: f.owner })).status).toBe(
        422,
      );
      const first = await request(path, 'PUT', {});
      expect(first.status).toBe(200);
      expect(first.headers.get('cache-control')).toContain('no-store');
      expect(savedLifeStatusSchema.parse(await first.json()).saved).toBe(true);
      const page = await request('/api/v2/saved-lives');
      expect(page.status).toBe(200);
      expect(savedLivesPageSchema.parse(await page.json()).items).toHaveLength(
        1,
      );
      expect(
        (await request('/api/v2/saved-lives?ownerId=' + f.owner)).status,
      ).toBe(422);
      expect((await request(path, 'DELETE')).status).toBe(200);
      expect((await request(path, 'DELETE')).status).toBe(200);
    } finally {
      await app.close();
    }
  });
});
