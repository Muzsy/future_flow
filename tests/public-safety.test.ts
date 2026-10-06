// Isolated technical data. No paid provider call or real Official seed changes.
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import {
  PublicSafetyRepository,
  publicReportsConfigFromEnv,
  PublicationRepository,
  SavedLivesRepository,
  DiscoveryRepository,
  Repository,
  type Database,
} from '@future-flow/database';
import {
  publicReportRequestSchema,
  publicReportReceiptSchema,
  publicSafetyViewSchema,
  publicReportModerationSchema,
} from '@future-flow/contracts';
import { DomainError, hash } from '@future-flow/core';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  publicationFixture,
  approvePublicationFixture,
} from './publication-fixtures';
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
});
afterAll(async () => {
  await engine?.close();
});
const safety = (database = db) =>
  new PublicSafetyRepository(database, { enabled: true }, config, config);
async function actor() {
  const id = randomUUID();
  await new Repository(db).ensureUser(id);
  return id;
}
async function copy(visibility: 'public' | 'unlisted' = 'public') {
  const f = await publicationFixture(db),
    input = await approvePublicationFixture(db, f);
  if (!input) throw Error('Missing technical approval');
  input.settings.visibility = visibility;
  const repo = new PublicationRepository(db, config),
    preview = await repo.prepare(f.owner, input, randomUUID());
  const confirm = {
      previewId: preview.previewId,
      previewHash: preview.previewHash,
      acknowledged: true,
    },
    view = await repo.confirm(f.owner, confirm, randomUUID());
  return { ...f, input, repo, preview, confirm, view };
}
const decision = (
  f: Awaited<ReturnType<typeof copy>>,
  reportId: string,
  action: 'dismiss' | 'warn' | 'hide' | 'remove' = 'warn',
) => ({
  reportId,
  reportRevision: 1,
  publicationRevision: f.view.revision,
  snapshotHash: f.view.snapshotHash,
  action,
  reasonCode: 'personal_data',
  actorLabel: 'Isolated technical moderator',
  restrictPublishing: false,
  acknowledged: true,
});
describe('public report queue and trusted safety decisions', () => {
  it('defaults off, rejects spoofed authority and bounds report text and decisions', async () => {
    expect(publicReportsConfigFromEnv({})).toEqual({ enabled: false });
    expect(() =>
      publicReportsConfigFromEnv({ PUBLIC_REPORTS_ENABLED: 'yes' }),
    ).toThrow();
    await expect(
      new PublicSafetyRepository(db).report(
        randomUUID(),
        'life-' + 'a'.repeat(32),
        { reason: 'spam' },
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_REPORTS_DISABLED' });
    for (const raw of [
      { reason: 'anything' },
      { reason: 'spam', userId: randomUUID() },
      { reason: 'spam', details: 'x'.repeat(1001) },
      { reason: 'spam', action: 'remove' },
    ])
      expect(() => publicReportRequestSchema.parse(raw)).toThrow();
    const f = await copy(),
      a = await actor(),
      r = await safety().report(a, f.view.slug, { reason: 'personal_data' });
    expect(() =>
      publicReportModerationSchema.parse({
        ...decision(f, r.reportId, 'dismiss'),
        restrictPublishing: true,
      }),
    ).toThrow();
  });
  it('deduplicates own reason without overwriting details, leaking identity or hiding content', async () => {
    const f = await copy(),
      a = await actor(),
      b = await actor(),
      repo = safety(),
      r = await repo.report(a, f.view.slug, {
        reason: 'spam',
        details: 'First note',
      });
    const repeat = await repo.report(a, f.view.slug, {
      reason: 'spam',
      details: 'Changed note',
    });
    expect(repeat.reportId).toBe(r.reportId);
    expect(repeat.duplicate).toBe(true);
    const [row] = await db.query<{ details: string }>(
      'SELECT details FROM aw_public_reports WHERE id=$1',
      [r.reportId],
    );
    expect(row!.details).toBe('First note');
    const other = await repo.report(b, f.view.slug, { reason: 'spam' });
    expect(other.reportId).not.toBe(r.reportId);
    expect((await f.repo.readPublic(f.view.slug)).slug).toBe(f.view.slug);
    expect(JSON.stringify(r)).not.toContain(f.owner);
    expect(JSON.stringify(r)).not.toContain(f.view.publicationId);
    expect((await repo.queue()).length).toBe(2);
  });
  it('enforces ten new reports per rolling day after free duplicate reuse', async () => {
    const f = await copy(),
      a = await actor(),
      repo = safety();
    await repo.report(a, f.view.slug, { reason: 'spam' });
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
                ? ([{ count: '10' }] as unknown as T[])
                : tx.query<T>(sql, values),
          }),
        ),
    };
    expect(
      (await safety(capped).report(a, f.view.slug, { reason: 'spam' }))
        .duplicate,
    ).toBe(true);
    await expect(
      safety(capped).report(a, f.view.slug, { reason: 'harassment' }),
    ).rejects.toMatchObject({ code: 'PUBLIC_REPORT_LIMIT', status: 429 });
    expect(await db.query('SELECT id FROM aw_public_reports')).toHaveLength(1);
  });
  it('rejects unlisted, wrong slugs, withdrawn copies and disabled reader gates', async () => {
    const a = await actor(),
      f = await copy('unlisted');
    await expect(
      safety().report(a, f.view.slug, { reason: 'spam' }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      safety().report(a, 'x'.repeat(43), { reason: 'spam' }),
    ).rejects.toThrow();
    const p = await copy();
    await expect(
      new PublicSafetyRepository(db, { enabled: true }).report(a, p.view.slug, {
        reason: 'spam',
      }),
    ).rejects.toMatchObject({ status: 404 });
    await p.repo.action(
      p.owner,
      p.view.publicationId,
      'withdraw',
      {
        revision: p.view.revision,
        snapshotHash: p.view.snapshotHash,
        acknowledged: true,
      },
      randomUUID(),
    );
    await expect(
      safety().report(a, p.view.slug, { reason: 'spam' }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('warns only the publisher, resolves once, preserves private canon and permits explicit dismissal', async () => {
    const f = await copy(),
      a = await actor(),
      repo = safety(),
      r = await repo.report(a, f.view.slug, {
        reason: 'personal_data',
        details: 'Technical private report',
      }),
      input = decision(f, r.reportId);
    const before = await new Repository(db).exportAccount(f.owner);
    await repo.resolve(input);
    expect(await repo.resolve(input)).toMatchObject({ action: 'warn' });
    expect((await repo.ownSafety(f.owner)).warnings).toHaveLength(1);
    expect((await repo.ownSafety(a)).warnings).toEqual([]);
    await expect(
      repo.resolve({ ...input, action: 'remove' }),
    ).rejects.toMatchObject({ code: 'PUBLIC_MODERATION_CONFLICT' });
    const after = await new Repository(db).exportAccount(f.owner);
    for (const key of [
      'aw_periods',
      'aw_history',
      'aw_lives',
      'aw_branches',
      'aw_choices',
      'aw_ai_runs',
    ])
      expect(hash(after[key])).toBe(hash(before[key]));
    expect((await repo.queue()).length).toBe(0);
    const other = await repo.report(a, f.view.slug, { reason: 'spam' });
    await repo.resolve(decision(f, other.reportId, 'dismiss'));
    expect((await repo.ownSafety(f.owner)).warnings).toHaveLength(1);
    expect((await f.repo.readPublic(f.view.slug)).slug).toBe(f.view.slug);
  });
  it('uses existing soft hide and hard remove and immediately invalidates Discovery and saved cards', async () => {
    const f = await copy(),
      a = await actor(),
      repo = safety(),
      saved = new SavedLivesRepository(db, { enabled: true }, config, config),
      discovery = new DiscoveryRepository(
        db,
        { enabled: true },
        config,
        config,
      );
    await saved.save(a, f.view.slug);
    const r = await repo.report(a, f.view.slug, { reason: 'personal_data' }),
      next = await repo.report(a, f.view.slug, { reason: 'spam' });
    await repo.resolve(decision(f, r.reportId, 'hide'));
    await expect(f.repo.readPublic(f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    expect((await discovery.list()).items).toEqual([]);
    expect((await saved.list(a)).items[0]!.card).toBeNull();
    await repo.resolve({
      ...decision(f, next.reportId, 'remove'),
      publicationRevision: f.view.revision + 1,
    });
    const [row] = await db.query<{ status: string }>(
      'SELECT status FROM aw_publications WHERE id=$1',
      [f.view.publicationId],
    );
    expect(row!.status).toBe('removed');
    expect((await repo.ownSafety(f.owner)).warnings).toHaveLength(2);
  });
  it('requires an explicit trusted restriction, blocks both prepare and Confirm, and audits restoration', async () => {
    const f = await copy(),
      a = await actor(),
      repo = safety(),
      r = await repo.report(a, f.view.slug, { reason: 'spam' });
    const fresh = await publicationFixture(db, f.owner),
      freshInput = await approvePublicationFixture(db, fresh);
    if (!freshInput) throw Error('Missing new technical copy');
    freshInput.settings.visibility = 'public';
    await repo.resolve({
      ...decision(f, r.reportId),
      reasonCode: 'spam',
      restrictPublishing: true,
    });
    expect((await repo.ownSafety(f.owner)).publishingRestricted).toBe(true);
    await expect(
      f.repo.prepare(f.owner, freshInput, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLICATION_RESTRICTED' });
    await expect(
      f.repo.confirm(f.owner, f.confirm, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLICATION_RESTRICTED' });
    const release = {
      userId: f.owner,
      revision: 1,
      active: false,
      reasonCode: 'spam',
      actorLabel: 'Technical restriction review',
      acknowledged: true,
    };
    await repo.setRestriction(release);
    await repo.setRestriction(release);
    expect((await repo.ownSafety(f.owner)).publishingRestricted).toBe(false);
    expect(
      await db.query(
        'SELECT id FROM aw_publication_restriction_actions WHERE user_id=$1',
        [f.owner],
      ),
    ).toHaveLength(2);
    await expect(
      f.repo.prepare(f.owner, freshInput, randomUUID()),
    ).resolves.toMatchObject({ previewId: expect.any(String) });
  });
  it('exports only own reports, retains owner warnings after reporter deletion and cascades publisher cleanup', async () => {
    const f = await copy(),
      a = await actor(),
      repo = safety(),
      r = await repo.report(a, f.view.slug, {
        reason: 'personal_data',
        details: 'Own note',
      });
    await repo.resolve(decision(f, r.reportId));
    const reporter = await new Repository(db).exportAccount(a),
      publisher = await new Repository(db).exportAccount(f.owner);
    expect((reporter.aw_public_reports as any[])[0].details).toBe('Own note');
    expect(publisher.aw_public_reports).toEqual([]);
    expect(JSON.stringify(publisher.aw_public_warnings)).not.toContain(a);
    expect(JSON.stringify(publisher.aw_public_warnings)).not.toContain(
      'Own note',
    );
    await new Repository(db).deleteAccountData(a);
    expect(await db.query('SELECT id FROM aw_public_reports')).toEqual([]);
    expect((await repo.ownSafety(f.owner)).warnings).toHaveLength(1);
    await new Repository(db).deleteAccountData(f.owner);
    expect(await db.query('SELECT id FROM aw_public_warnings')).toEqual([]);
  });
  it('enforces immutable report decisions and denies direct browser roles', async () => {
    const f = await copy(),
      a = await actor(),
      repo = safety(),
      r = await repo.report(a, f.view.slug, { reason: 'personal_data' });
    await expect(
      db.query('UPDATE aw_public_reports SET details=$1 WHERE id=$2', [
        'Changed',
        r.reportId,
      ]),
    ).rejects.toThrow();
    await repo.resolve(decision(f, r.reportId));
    await expect(
      db.query('UPDATE aw_public_reports SET decision=$1 WHERE id=$2', [
        '{}',
        r.reportId,
      ]),
    ).rejects.toThrow();
    for (const table of [
      'aw_public_reports',
      'aw_public_warnings',
      'aw_publication_restrictions',
      'aw_publication_restriction_actions',
    ]) {
      const [guard] = await db.query<{
        rls: boolean;
        anon: boolean;
        client: boolean;
      }>(
        "SELECT relrowsecurity AS rls,has_table_privilege('anon',oid,'SELECT') AS anon,has_table_privilege('authenticated',oid,'INSERT') AS client FROM pg_class WHERE oid=$1::regclass",
        [table],
      );
      expect(guard).toEqual({ rls: true, anon: false, client: false });
    }
  });
  it('has no browser moderation endpoint and exposes only authenticated report receipts and own notices', async () => {
    const f = await copy(),
      a = await actor(),
      token = 'a'.repeat(30),
      app = await createApp(
        new Repository(db),
        { verify: async () => ({ id: a }), deleteUser: async () => {} },
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
        { enabled: true },
      );
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl(),
      path = '/api/v2/public-reports/' + f.view.slug;
    const request = (p: string, body?: unknown, authenticated = true) =>
      fetch(base + p, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          ...(authenticated ? { Authorization: 'Bearer ' + token } : {}),
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    try {
      expect((await request(path, { reason: 'spam' }, false)).status).toBe(401);
      expect(
        (await request(path, { reason: 'spam', userId: f.owner })).status,
      ).toBe(422);
      const submitted = await request(path, { reason: 'spam' });
      expect(submitted.status).toBe(201);
      expect(submitted.headers.get('cache-control')).toContain('no-store');
      expect(
        publicReportReceiptSchema.parse(await submitted.json()).received,
      ).toBe(true);
      const notices = await request('/api/v2/public-safety');
      expect(notices.status).toBe(200);
      expect(
        publicSafetyViewSchema.parse(await notices.json()).warnings,
      ).toEqual([]);
      for (const p of [
        '/api/v2/public-reports/moderate',
        '/api/v2/public-safety/resolve',
        '/api/v2/public-safety/restriction',
      ])
        expect((await request(p, {})).status).toBeOneOf([404, 422]);
    } finally {
      await app.close();
    }
  });
});
