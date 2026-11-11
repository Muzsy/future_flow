import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import {
  publicScenarioPrepareRequestSchema,
  publicScenarioReaderSchema,
} from '@future-flow/contracts';
import { DomainError, hash } from '@future-flow/core';
import {
  Repository,
  PublicScenarioPublicationRepository,
  publicScenarioConfigFromEnv,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
import { publicScenarioFixture } from './public-scenario-publication-fixtures';
import {
  scenarioReleaseFixture,
  completeScenarioFixture,
} from './scenario-release-fixtures';
const flags = { enabled: true, operatorEnabled: true };
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
  for (const u of await db.query<{ id: string }>('SELECT id FROM ff_users'))
    await new Repository(db).deleteAccountData(u.id);
});
afterAll(async () => {
  await engine?.close();
});
describe('separate reviewed public Scenario snapshots', () => {
  it('defaults off, rejects malformed config and never queries the database on disabled public reads', async () => {
    expect(publicScenarioConfigFromEnv({})).toEqual({
      enabled: false,
      operatorEnabled: false,
    });
    expect(() =>
      publicScenarioConfigFromEnv({ PUBLIC_SCENARIOS_ENABLED: 'yes' }),
    ).toThrow();
    expect(() =>
      publicScenarioConfigFromEnv({
        SCENARIO_PUBLICATION_OPERATOR_ENABLED: '1',
      }),
    ).toThrow();
    let calls = 0;
    const off = new PublicScenarioPublicationRepository({
      ...db,
      query: async () => {
        calls++;
        throw Error('Unexpected database read');
      },
    });
    await expect(off.read('scenario-' + 'a'.repeat(32))).rejects.toMatchObject({
      status: 404,
    });
    expect(calls).toBe(0);
    const f = await publicScenarioFixture(db);
    await expect(
      new PublicScenarioPublicationRepository(db).prepare(
        f.owner,
        f.version.id,
        f.request,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_SCENARIO_DISABLED' });
    expect(() =>
      publicScenarioPrepareRequestSchema.parse({
        ...f.request,
        officialLifeApproved: true,
      }),
    ).toThrow();
  });
  it('does not turn a source grant or a private preview into a publication, job or spending permission', async () => {
    const f = await publicScenarioFixture(db),
      before = await db.query('SELECT * FROM aw_budget_accounts ORDER BY id');
    expect(f.preview).toMatchObject({
      publicationApproved: false,
      officialLifeApproved: false,
    });
    expect(await db.query('SELECT id FROM aw_scenario_publications')).toEqual(
      [],
    );
    expect(await db.query('SELECT id FROM aw_jobs')).toEqual([]);
    await f.pubs.prepare(f.owner, f.version.id, f.request, randomUUID());
    expect(
      await db.query('SELECT * FROM aw_budget_accounts ORDER BY id'),
    ).toEqual(before);
    expect(
      await db.query('SELECT life_id FROM aw_official_life_starts'),
    ).toEqual([]);
  });
  it('requires complete current source evidence, independent curator/grant and owned version', async () => {
    const f = await scenarioReleaseFixture(db),
      pubs = new PublicScenarioPublicationRepository(db, flags),
      request = {
        templateHash: f.version.templateHash,
        sourceGrantId: randomUUID(),
        allowPersonalization: true,
      };
    await expect(
      pubs.prepare(f.owner, f.version.id, request, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLIC_SCENARIO_CHANGED' });
    await completeScenarioFixture(db, f, false);
    await expect(
      pubs.prepare(f.owner, f.version.id, request, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLIC_SCENARIO_CHANGED' });
    const foreign = randomUUID();
    await f.repo.ensureUser(foreign);
    await f.repo.acceptPrivacy(foreign);
    await expect(
      pubs.prepare(foreign, f.version.id, request, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('requires two exact explicit confirmations and refuses altered hashes, fields, keys and foreign previews', async () => {
    const f = await publicScenarioFixture(db),
      foreign = randomUUID();
    await f.repo.ensureUser(foreign);
    await f.repo.acceptPrivacy(foreign);
    for (const changed of [
      { acknowledged: false },
      { personalizationAcknowledged: false },
      { previewHash: '0'.repeat(64) },
      { officialScenario: true },
    ])
      await expect(
        f.pubs.confirm(f.owner, { ...f.confirm, ...changed }, randomUUID()),
      ).rejects.toThrow();
    await expect(
      f.pubs.confirm(foreign, f.confirm, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
    await expect(f.pubs.confirm(f.owner, f.confirm, '')).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
    expect(await db.query('SELECT id FROM aw_scenario_publications')).toEqual(
      [],
    );
  });
  it('replays once, reports stopped history even with flags off and never reactivates an old confirmation', async () => {
    const f = await publicScenarioFixture(db),
      key = randomUUID(),
      view = await f.pubs.confirm(f.owner, f.confirm, key),
      off = new PublicScenarioPublicationRepository(db);
    expect(await f.pubs.confirm(f.owner, f.confirm, key)).toEqual(view);
    expect(await f.pubs.confirm(f.owner, f.confirm, randomUUID())).toEqual(
      view,
    );
    await expect(
      f.pubs.confirm(
        f.owner,
        { ...f.confirm, previewHash: '0'.repeat(64) },
        key,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await off.confirm(f.owner, f.confirm, key)).toEqual(view);
    const stopped = await off.withdraw(f.owner, view.id);
    expect(stopped.status).toBe('withdrawn');
    expect(await off.confirm(f.owner, f.confirm, key)).toEqual(stopped);
    expect(await f.pubs.confirm(f.owner, f.confirm, randomUUID())).toEqual(
      stopped,
    );
    await expect(f.pubs.read(view.slug)).rejects.toMatchObject({ status: 404 });
    expect(
      (await db.query('SELECT id FROM aw_scenario_publications')).length,
    ).toBe(1);
  });
  it('keeps the source unchanged and exposes only the complete allowlisted fictional template without owner/review/private authority', async () => {
    const f = await publicScenarioFixture(db, false),
      original = hash(await f.scenarios.get(f.owner, f.version.id)),
      view = await f.pubs.confirm(f.owner, f.confirm, randomUUID()),
      reader = await f.pubs.read(view.slug);
    expect(reader).toMatchObject({
      allowPersonalization: false,
      officialScenario: true,
      officialLifeApproved: false,
    });
    expect(reader.template).toEqual(f.version.template);
    expect(publicScenarioReaderSchema.parse(reader)).toEqual(reader);
    for (const privateValue of [
      f.owner,
      f.version.id,
      f.version.scenarioId,
      f.request.sourceGrantId,
      f.preview.id,
      f.preview.previewHash,
    ])
      expect(JSON.stringify(reader)).not.toContain(privateValue);
    expect(JSON.stringify(reader)).not.toMatch(
      /receipt|profileVersion|inputTokens|sharedEvents|userId/,
    );
    expect(hash(await f.scenarios.get(f.owner, f.version.id))).toBe(original);
    expect((await db.query('SELECT id FROM aw_jobs')).length).toBe(0);
  });
  it('refuses an expired preview using the database clock after all source checks', async () => {
    const f = await publicScenarioFixture(db),
      clockDb: Database = {
        ...db,
        transaction: (run) =>
          db.transaction((tx) =>
            run({
              ...tx,
              query: async (sql, values) =>
                sql.includes("clock_timestamp()+interval '30 minutes'")
                  ? ([{ until: new Date(Date.now() + 1500) }] as never)
                  : tx.query(sql, values),
            }),
          ),
      },
      short = new PublicScenarioPublicationRepository(clockDb, flags);
    const preview = await short.prepare(
      f.owner,
      f.version.id,
      f.request,
      randomUUID(),
    );
    await new Promise((resolve) => setTimeout(resolve, 1700));
    await expect(
      f.pubs.confirm(
        f.owner,
        {
          ...f.confirm,
          previewId: preview.id,
          previewHash: preview.previewHash,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_SCENARIO_PREVIEW_EXPIRED' });
    expect(await db.query('SELECT id FROM aw_scenario_publications')).toEqual(
      [],
    );
  });
  it('invalidates both new confirmation and existing reader on source revision or terminal revoke', async () => {
    const f = await publicScenarioFixture(db),
      view = await f.pubs.confirm(f.owner, f.confirm, randomUUID());
    await f.scenarios.revise(
      f.owner,
      f.version.scenarioId,
      {
        expectedVersion: 1,
        expectedHash: f.version.templateHash,
        template: {
          ...f.version.template,
          title: 'A new reviewed version will be required',
        },
      },
      randomUUID(),
    );
    await expect(f.pubs.read(view.slug)).rejects.toMatchObject({ status: 404 });
    await expect(
      f.pubs.prepare(f.owner, f.version.id, f.request, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLIC_SCENARIO_CHANGED' });
    const g = await publicScenarioFixture(db),
      v = await g.pubs.confirm(g.owner, g.confirm, randomUUID());
    await g.release.revoke({
      grantId: g.request.sourceGrantId,
      templateHash: g.request.templateHash,
      acknowledged: true,
      reasonCode: 'privacy',
      actorLabel: 'Technical revoke fixture',
    });
    await expect(g.pubs.read(v.slug)).rejects.toMatchObject({ status: 404 });
    expect((await g.pubs.own(g.owner, v.id)).status).toBe('active');
  });
  it('keeps terminal moderation trusted, audited and immutable with no permission restoration', async () => {
    const f = await publicScenarioFixture(db),
      view = await f.pubs.confirm(f.owner, f.confirm, randomUUID()),
      action = {
        status: 'hidden',
        reason: 'privacy',
        actorLabel: 'Technical moderator fixture',
      };
    await expect(
      new PublicScenarioPublicationRepository(db, {
        enabled: true,
        operatorEnabled: false,
      }).moderate(f.owner, view.id, action),
    ).rejects.toMatchObject({ code: 'PUBLIC_SCENARIO_OPERATOR_DISABLED' });
    expect((await f.pubs.moderate(f.owner, view.id, action)).status).toBe(
      'hidden',
    );
    expect((await f.pubs.moderate(f.owner, view.id, action)).status).toBe(
      'hidden',
    );
    expect(
      (await db.query('SELECT id FROM aw_scenario_publication_moderation'))
        .length,
    ).toBe(1);
    await expect(f.pubs.read(view.slug)).rejects.toMatchObject({ status: 404 });
    expect(
      (
        await f.pubs.moderate(f.owner, view.id, {
          ...action,
          status: 'removed',
        })
      ).status,
    ).toBe('removed');
    await expect(
      db.query(
        "UPDATE aw_scenario_publications SET status='active',stopped_at=NULL WHERE id=$1",
        [view.id],
      ),
    ).rejects.toThrow();
    await expect(
      db.query("UPDATE aw_scenario_publication_moderation SET reason='other'"),
    ).rejects.toThrow();
  });
  it('allows only one active copy of a version and requires a fresh explicit preview to publish after withdrawal', async () => {
    const f = await publicScenarioFixture(db),
      view = await f.pubs.confirm(f.owner, f.confirm, randomUUID()),
      p = await f.pubs.prepare(
        f.owner,
        f.version.id,
        { ...f.request, allowPersonalization: false },
        randomUUID(),
      ),
      confirm = {
        previewId: p.id,
        previewHash: p.previewHash,
        acknowledged: true,
        personalizationAcknowledged: false,
      };
    await expect(
      f.pubs.confirm(f.owner, confirm, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLIC_SCENARIO_CHANGED' });
    await f.pubs.withdraw(f.owner, view.id);
    const next = await f.pubs.confirm(f.owner, confirm, randomUUID());
    expect(next.slug).not.toBe(view.slug);
    expect(next.allowPersonalization).toBe(false);
    await expect(f.pubs.read(view.slug)).rejects.toMatchObject({ status: 404 });
    expect((await f.pubs.read(next.slug)).allowPersonalization).toBe(false);
  });
  it('enforces immutable previews/snapshots, export, RLS and cascade while account recovery cannot restore revoked source access', async () => {
    const f = await publicScenarioFixture(db),
      view = await f.pubs.confirm(f.owner, f.confirm, randomUUID());
    await expect(
      db.query(
        'UPDATE aw_public_scenario_previews SET allow_personalization=false WHERE id=$1',
        [f.preview.id],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        'UPDATE aw_scenario_publications SET allow_personalization=false WHERE id=$1',
        [view.id],
      ),
    ).rejects.toThrow();
    const exported = await f.repo.exportAccount(f.owner);
    expect(exported.aw_public_scenario_previews).toHaveLength(1);
    expect(exported.aw_scenario_publications).toHaveLength(1);
    for (const table of [
      'aw_public_scenario_previews',
      'aw_scenario_publications',
      'aw_scenario_publication_moderation',
    ]) {
      const [guard] = await db.query(
        "SELECT relrowsecurity AS rls,has_table_privilege('anon',oid,'SELECT') AS anon,has_table_privilege('authenticated',oid,'INSERT') AS client FROM pg_class WHERE oid=$1::regclass",
        [table],
      );
      expect(guard).toEqual({ rls: true, anon: false, client: false });
    }
    await f.repo.markDeleting(f.owner);
    await expect(f.pubs.read(view.slug)).rejects.toMatchObject({ status: 404 });
    await f.repo.restoreActive(f.owner);
    await expect(f.pubs.read(view.slug)).rejects.toMatchObject({ status: 404 });
    await f.repo.deleteAccountData(f.owner);
    expect(await db.query('SELECT id FROM aw_scenario_publications')).toEqual(
      [],
    );
    await expect(
      f.pubs.confirm(f.owner, f.confirm, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('provides guarded owner HTTP and an anonymous minimal no-store/noindex reader, with no HTTP moderation or personalization start', async () => {
    const f = await publicScenarioFixture(db),
      foreign = randomUUID();
    await f.repo.ensureUser(foreign);
    await f.repo.acceptPrivacy(foreign);
    const args: Parameters<typeof createApp> = [
      f.repo,
      {
        verify: async (token) => {
          if ([f.owner, foreign].includes(token)) return { id: token };
          throw new DomainError('AUTH_INVALID_TOKEN', 'Invalid.', 401);
        },
        deleteUser: async () => {},
      },
    ];
    args[22] = flags;
    const app = await createApp(...args);
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl(),
      auth = {
        Authorization: `Bearer ${f.owner}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      };
    try {
      expect(
        (
          await fetch(`${base}/api/v2/scenario-publications/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(f.confirm),
          })
        ).status,
      ).toBe(401);
      const confirmed = await fetch(
        `${base}/api/v2/scenario-publications/confirm`,
        { method: 'POST', headers: auth, body: JSON.stringify(f.confirm) },
      );
      expect(confirmed.status).toBe(201);
      const view = (await confirmed.json()) as { id: string; slug: string };
      expect(
        (
          await fetch(`${base}/api/v2/scenario-publications/${view.id}`, {
            headers: { Authorization: `Bearer ${foreign}` },
          })
        ).status,
      ).toBe(404);
      const read = await fetch(`${base}/api/public/scenarios/${view.slug}`);
      expect(read.status).toBe(200);
      expect(read.headers.get('cache-control')).toBe('no-store');
      expect(read.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      const body = await read.json();
      expect(JSON.stringify(body)).not.toContain(f.owner);
      expect(body.officialLifeApproved).toBe(false);
      expect(
        (
          await fetch(
            `${base}/api/public/scenarios/${view.slug}?userId=${f.owner}`,
          )
        ).status,
      ).toBe(422);
      expect(
        (
          await fetch(
            `${base}/api/v2/scenario-publications/${view.id}/moderate`,
            { method: 'POST', headers: auth, body: '{}' },
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await fetch(`${base}/api/v2/scenario-publications/${view.id}/start`, {
            method: 'POST',
            headers: auth,
            body: '{}',
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await fetch(
            `${base}/api/v2/scenario-publications/${view.id}/withdraw`,
            { method: 'POST', headers: auth, body: '{}' },
          )
        ).status,
      ).toBe(201);
      expect(
        (await fetch(`${base}/api/public/scenarios/${view.slug}`)).status,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });
});
