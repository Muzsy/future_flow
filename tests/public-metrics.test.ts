// Isolated technical data; no paid provider calls or real Official seed edits.
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import {
  PublicMetricsRepository,
  publicMetricsConfigFromEnv,
  cleanupExpiredPublicReadings,
  publicMetricsSummary,
  PublicationRepository,
  OfficialPublicationRepository,
  SavedLivesRepository,
  PublicSafetyRepository,
  Repository,
  type Database,
} from '@future-flow/database';
import {
  publicReadingStartSchema,
  publicReadingSignalSchema,
  publicReadingSessionSchema,
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
const config = { enabled: true, linkSecret: 'c'.repeat(64) },
  metrics = { enabled: true };
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
const reader = () => new PublicMetricsRepository(db, metrics, config, config);
const totals = () =>
  db.query<{ kind: string; total: number }>(
    'SELECT kind,total FROM aw_public_metrics_daily ORDER BY kind',
  );
async function copy(visibility: 'public' | 'unlisted' = 'public') {
  const f = await publicationFixture(db),
    input = await approvePublicationFixture(db, f);
  if (!input) throw Error('Technical approval missing');
  input.settings.visibility = visibility;
  const repo = new PublicationRepository(db, config, metrics),
    preview = await repo.prepare(f.owner, input, randomUUID()),
    confirm = {
      previewId: preview.previewId,
      previewHash: preview.previewHash,
      acknowledged: true,
    },
    view = await repo.confirm(f.owner, confirm, randomUUID());
  return { ...f, repo, input, preview, confirm, view };
}
async function actor() {
  const id = randomUUID();
  await new Repository(db).ensureUser(id);
  return id;
}
const moderation = (
  f: Awaited<ReturnType<typeof copy>>,
  action: 'hide' | 'remove',
  revision = f.view.revision,
) => ({
  publicationId: f.view.publicationId,
  revision,
  snapshotHash: f.view.snapshotHash,
  action,
  reasonCode: 'privacy',
  actorLabel: 'Isolated technical moderator',
  acknowledged: true,
});
describe('public activity aggregates and short anonymous readings', () => {
  it('defaults off and excludes authority, identity, prose and arbitrary signals from contracts', async () => {
    expect(publicMetricsConfigFromEnv({})).toEqual({ enabled: false });
    expect(() =>
      publicMetricsConfigFromEnv({ PUBLIC_METRICS_ENABLED: 'yes' }),
    ).toThrow();
    await expect(
      new PublicMetricsRepository(db).start('life-' + 'a'.repeat(32), {
        readingId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'PUBLIC_METRICS_DISABLED' });
    for (const field of [
      'userId',
      'ip',
      'referrer',
      'story',
      'prompt',
      'details',
    ])
      expect(() =>
        publicReadingStartSchema.parse({
          readingId: randomUUID(),
          [field]: 'private',
        }),
      ).toThrow();
    for (const signal of ['saved', 'reported', 'published', 'depth_100'])
      expect(() =>
        publicReadingSignalSchema.parse({ readingId: randomUUID(), signal }),
      ).toThrow();
    const f = await copy();
    await new PublicationRepository(db, config, { enabled: false }).moderate(
      moderation(f, 'hide'),
    );
    expect(await totals()).toEqual([{ kind: 'published', total: 1 }]);
  });
  it('counts repeated starts and signals once and keeps the reading bound to one live copy', async () => {
    const f = await copy(),
      other = await copy(),
      id = randomUUID(),
      repo = reader();
    const first = await repo.start(f.view.slug, { readingId: id });
    expect(publicReadingSessionSchema.parse(first).readingId).toBe(id);
    expect(await repo.start(f.view.slug, { readingId: id })).toEqual(first);
    await expect(
      repo.start(other.view.slug, { readingId: id }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      repo.signal(other.view.slug, { readingId: id, signal: 'share_clicked' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (await repo.signal(f.view.slug, { readingId: id, signal: 'depth_25' }))
        .duplicate,
    ).toBe(false);
    expect(
      (await repo.signal(f.view.slug, { readingId: id, signal: 'depth_25' }))
        .duplicate,
    ).toBe(true);
    expect(await totals()).toEqual([
      { kind: 'depth_25', total: 1 },
      { kind: 'published', total: 1 },
      { kind: 'published', total: 1 },
      { kind: 'reading_started', total: 1 },
    ]);
  });
  it('atomically admits the last daily reading and rolls back the next session without blocking a retry', async () => {
    const f = await copy(),
      repo = reader(),
      id = randomUUID();
    await db.query(
      "INSERT INTO aw_public_metrics_daily(community_publication_id,kind,total) VALUES($1,'reading_started',9999)",
      [f.view.publicationId],
    );
    await repo.start(f.view.slug, { readingId: id });
    await expect(
      repo.start(f.view.slug, { readingId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'PUBLIC_METRICS_LIMIT', status: 429 });
    expect((await repo.start(f.view.slug, { readingId: id })).readingId).toBe(
      id,
    );
    expect(
      await db.query('SELECT id FROM aw_public_reading_sessions'),
    ).toHaveLength(1);
    expect(
      (await totals()).find((r) => r.kind === 'reading_started')!.total,
    ).toBe(10000);
  });
  it('requires server elapsed time for end exposure and deduplicates copy success and failure independently', async () => {
    const f = await copy(),
      repo = reader(),
      id = randomUUID();
    await repo.start(f.view.slug, { readingId: id });
    await expect(
      repo.signal(f.view.slug, { readingId: id, signal: 'end_reached' }),
    ).rejects.toMatchObject({ code: 'PUBLIC_READING_TOO_EARLY' });
    const ready = randomUUID();
    await db.query(
      "INSERT INTO aw_public_reading_sessions(id,community_publication_id,created_at,expires_at) VALUES($1,$2,now()-interval '1 minute',now()+interval '19 minutes')",
      [ready, f.view.publicationId],
    );
    for (const signal of [
      'depth_50',
      'depth_75',
      'end_reached',
      'share_clicked',
      'link_copied',
      'copy_failed',
    ]) {
      expect(
        (await repo.signal(f.view.slug, { readingId: ready, signal }))
          .duplicate,
      ).toBe(false);
      expect(
        (await repo.signal(f.view.slug, { readingId: ready, signal }))
          .duplicate,
      ).toBe(true);
    }
    expect(
      (await totals()).filter(
        (r) => !['reading_started', 'published'].includes(r.kind),
      ),
    ).toHaveLength(6);
  });
  it('refuses expired IDs, unlisted readers, withdrawn copies and a disabled publication gate', async () => {
    const f = await copy(),
      repo = reader(),
      id = randomUUID(),
      unlisted = await copy('unlisted');
    await db.query(
      "INSERT INTO aw_public_reading_sessions(id,community_publication_id,created_at,expires_at) VALUES($1,$2,now()-interval '1 hour',now()-interval '40 minutes')",
      [id, f.view.publicationId],
    );
    await expect(
      repo.start(f.view.slug, { readingId: id }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      repo.signal(f.view.slug, { readingId: id, signal: 'share_clicked' }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      repo.start(unlisted.view.slug, { readingId: randomUUID() }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      new PublicMetricsRepository(db, metrics).start(f.view.slug, {
        readingId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 404 });
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
    await expect(
      repo.start(f.view.slug, { readingId: randomUUID() }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await totals()).some((r) => r.kind === 'reading_started')).toBe(
      false,
    );
    expect(
      (await totals()).find((r) => r.kind === 'owner_withdrawn')!.total,
    ).toBe(1);
  });
  it('counts actual saves, unsaves and reports without counting replayed requests', async () => {
    const f = await copy(),
      a = await actor(),
      saves = new SavedLivesRepository(db, metrics, config, config, metrics),
      reports = new PublicSafetyRepository(
        db,
        metrics,
        config,
        config,
        metrics,
      );
    for (let i = 0; i < 3; i++) {
      await saves.save(a, f.view.slug);
      await reports.report(a, f.view.slug, { reason: 'spam' });
    }
    for (let i = 0; i < 3; i++) await saves.remove(a, f.view.slug);
    expect(await totals()).toEqual([
      { kind: 'published', total: 1 },
      { kind: 'reported', total: 1 },
      { kind: 'saved', total: 1 },
      { kind: 'unsaved', total: 1 },
    ]);
    await saves.save(a, f.view.slug);
    expect((await totals()).find((r) => r.kind === 'saved')!.total).toBe(2);
  });
  it('counts publication and moderation state changes once and revalidates hidden readings', async () => {
    const f = await copy(),
      repo = reader(),
      id = randomUUID();
    await f.repo.confirm(f.owner, f.confirm, randomUUID());
    await repo.start(f.view.slug, { readingId: id });
    const request = moderation(f, 'hide');
    await f.repo.moderate(request);
    await f.repo.moderate(request);
    await expect(
      repo.signal(f.view.slug, { readingId: id, signal: 'depth_25' }),
    ).rejects.toMatchObject({ status: 404 });
    const remove = moderation(f, 'remove', f.view.revision + 1);
    await f.repo.moderate(remove);
    await f.repo.moderate(remove);
    expect(await totals()).toEqual([
      { kind: 'hidden', total: 1 },
      { kind: 'published', total: 1 },
      { kind: 'reading_started', total: 1 },
      { kind: 'removed', total: 1 },
    ]);
  });
  it('rechecks full Official evidence rather than treating an Official slug as authority', async () => {
    const f = await officialLifeFixture(db),
      created = await f.official.start(f.owner, f.startRequest, randomUUID());
    await processOfficialFixture(db, f.owner, created.jobId);
    const content = await officialBundleFixture(db, f, created),
      inspected = await f.official.inspect(f.owner, content.bundle.bundleId),
      granted = await f.official.grant(f.owner, officialGrant(inspected)),
      publications = new OfficialPublicationRepository(db, config, metrics),
      preview = await publications.prepare(
        f.owner,
        {
          binding: {
            ...inspected.evidence.binding,
            sourceVersion: 'official-life-source-1',
            grantId: granted.grant!.id,
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
      view = await publications.confirm(
        f.owner,
        {
          previewId: preview.previewId,
          previewHash: preview.previewHash,
          acknowledged: true,
        },
        randomUUID(),
      ),
      id = randomUUID(),
      repo = reader();
    await repo.start(view.slug, { readingId: id });
    await f.official.revoke(f.owner, {
      grantId: granted.grant!.id,
      contentHash: content.bundle.contentHash,
      reasonCode: 'quality',
      actorLabel: 'Isolated technical reviewer',
      acknowledged: true,
    });
    await expect(
      repo.signal(view.slug, { readingId: id, signal: 'share_clicked' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(await totals()).toEqual([
      { kind: 'published', total: 1 },
      { kind: 'reading_started', total: 1 },
    ]);
  });
  it('cleans expired raw IDs independently of flags while preserving aggregate counts and current readings', async () => {
    const f = await copy(),
      repo = reader(),
      current = randomUUID();
    await repo.start(f.view.slug, { readingId: current });
    for (const [created, expires] of [
      ['26 hours', '25 hours 40 minutes'],
      ['1 hour', '40 minutes'],
    ])
      await db.query(
        `INSERT INTO aw_public_reading_sessions(id,community_publication_id,created_at,expires_at) VALUES($1,$2,now()-$3::interval,now()-$4::interval)`,
        [randomUUID(), f.view.publicationId, created, expires],
      );
    expect(await cleanupExpiredPublicReadings(db)).toEqual({
      deleted: 1,
      batchFull: false,
    });
    expect(
      await db.query('SELECT id FROM aw_public_reading_sessions'),
    ).toHaveLength(2);
    expect(
      (await totals()).find((r) => r.kind === 'reading_started')!.total,
    ).toBe(1);
    const summary = await publicMetricsSummary(db);
    expect(summary.daily).toHaveLength(2);
    expect(JSON.stringify(summary)).not.toContain(f.owner);
    expect(JSON.stringify(summary)).not.toContain(current);
    const old: Database = {
      query: async () => [{ present: false }] as never,
      transaction: async (run) => run(old),
    };
    expect(await cleanupExpiredPublicReadings(old)).toEqual({
      deleted: 0,
      batchFull: false,
    });
    expect((await publicMetricsSummary(old)).daily).toEqual([]);
  });
  it('exports only own publisher aggregates and cascades all metrics with publication ownership', async () => {
    const f = await copy(),
      a = await actor(),
      id = randomUUID();
    await reader().start(f.view.slug, { readingId: id });
    const own = await new Repository(db).exportAccount(f.owner),
      other = await new Repository(db).exportAccount(a);
    expect(own.aw_public_metrics_daily).toHaveLength(2);
    expect(other.aw_public_metrics_daily).toEqual([]);
    expect(JSON.stringify(own.aw_public_metrics_daily)).not.toContain(id);
    expect(own).not.toHaveProperty('aw_public_reading_sessions');
    await new Repository(db).deleteAccountData(f.owner);
    expect(await db.query('SELECT id FROM aw_public_metrics_daily')).toEqual(
      [],
    );
    expect(await db.query('SELECT id FROM aw_public_reading_sessions')).toEqual(
      [],
    );
  });
  it('protects immutable session bindings, monotonic signals and direct browser roles', async () => {
    const f = await copy(),
      id = randomUUID();
    await reader().start(f.view.slug, { readingId: id });
    for (const sql of [
      "UPDATE aw_public_reading_sessions SET expires_at=expires_at+interval '1 second' WHERE id=$1",
      'UPDATE aw_public_reading_sessions SET id=gen_random_uuid() WHERE id=$1',
    ])
      await expect(db.query(sql, [id])).rejects.toThrow();
    await reader().signal(f.view.slug, { readingId: id, signal: 'depth_25' });
    await expect(
      db.query('UPDATE aw_public_reading_sessions SET signals=0 WHERE id=$1', [
        id,
      ]),
    ).rejects.toThrow();
    for (const table of [
      'aw_public_metrics_daily',
      'aw_public_reading_sessions',
    ])
      expect(
        (
          await db.query(
            "SELECT relrowsecurity AS rls,has_table_privilege('anon',oid,'SELECT') AS anon,has_table_privilege('authenticated',oid,'INSERT') AS client FROM pg_class WHERE oid=$1::regclass",
            [table],
          )
        )[0],
      ).toEqual({ rls: true, anon: false, client: false });
  });
  it('uses anonymous no-store HTTP, refuses DNT/GPC and exposes no analytics browse or authority endpoint', async () => {
    const f = await copy(),
      app = await createApp(
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
        { enabled: false },
        { enabled: false },
        { enabled: false },
        metrics,
      );
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl(),
      path = '/api/public/reading/' + f.view.slug,
      id = randomUUID();
    const request = (
      suffix: string,
      body: unknown,
      privacy: Record<string, string> = {},
    ) =>
      fetch(base + path + suffix, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...privacy },
        body: JSON.stringify(body),
      });
    try {
      for (const h of [{ DNT: '1' }, { 'Sec-GPC': '1' }])
        expect((await request('', { readingId: id }, h)).status).toBe(404);
      expect(
        await db.query('SELECT id FROM aw_public_reading_sessions'),
      ).toEqual([]);
      expect(
        (await request('', { readingId: id, ip: '127.0.0.1' })).status,
      ).toBe(422);
      const start = await request('', { readingId: id });
      expect(start.status).toBe(201);
      expect(start.headers.get('cache-control')).toContain('no-store');
      expect(
        publicReadingSessionSchema.parse(await start.json()).readingId,
      ).toBe(id);
      expect(
        (
          await request(
            '/signals',
            { readingId: id, signal: 'link_copied' },
            { DNT: '1' },
          )
        ).status,
      ).toBe(404);
      expect(
        (await request('/signals', { readingId: id, signal: 'saved' })).status,
      ).toBe(422);
      expect(
        (await request('/signals', { readingId: id, signal: 'link_copied' }))
          .status,
      ).toBe(201);
      for (const p of ['/api/public/metrics', '/api/v2/public-metrics'])
        expect((await fetch(base + p)).status).toBe(404);
    } finally {
      await app.close();
    }
  });
});
