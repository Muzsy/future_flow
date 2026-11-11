import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import {
  Repository,
  PublicScenarioPublicationRepository,
  type Database,
} from '@future-flow/database';
import {
  parseScenarioDiscoveryWireQuery,
  scenarioDiscoveryPageSchema,
} from '@future-flow/contracts';
import { applyMigrations } from '../scripts/lib/migrations';
import { publicScenarioFixture } from './public-scenario-publication-fixtures';
import { createApp } from '../apps/api/src/app';
import {
  scenarioDiscoverySearch,
  scenarioDiscoveryPageLink,
  scenarioDiscoveryReaderLink,
  verifiedScenarioDiscoveryPage,
} from '../apps/web/lib/scenario-discovery';
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
async function published(allow = true) {
  const f = await publicScenarioFixture(db, allow),
    publication = await f.pubs.confirm(f.owner, f.confirm, randomUUID());
  return { ...f, publication };
}
describe('live English Scenario discovery', () => {
  it('defaults off before any database lookup and rejects invalid typed query limits', async () => {
    let queries = 0;
    const off = new PublicScenarioPublicationRepository({
      ...db,
      query: async () => {
        queries++;
        throw Error('Unexpected query');
      },
    });
    await expect(off.list()).rejects.toMatchObject({
      code: 'PUBLIC_SCENARIO_DISABLED',
    });
    expect(queries).toBe(0);
    const on = new PublicScenarioPublicationRepository(db, {
      enabled: true,
      operatorEnabled: false,
    });
    for (const query of [
      { page: 0 },
      { page: 101 },
      { pageSize: 25 },
      { locale: 'hu' },
      { q: 'x'.repeat(81) },
      { ownerId: randomUUID() },
    ])
      await expect(on.list(query)).rejects.toThrow();
  });
  it('returns only live minimal public cards, ordered and paged, without jobs or new spending', async () => {
    const a = await published(true),
      b = await published(false),
      ledger = await db.query('SELECT * FROM aw_budget_accounts ORDER BY id');
    const first = await a.pubs.list({ pageSize: 1 }),
      second = await a.pubs.list({ pageSize: 1, page: 2 });
    expect(first.hasMore).toBe(true);
    expect(second.hasMore).toBe(false);
    expect(first.items[0]!.slug).toBe(b.publication.slug);
    expect(second.items[0]!.slug).toBe(a.publication.slug);
    expect(first.items[0]).toMatchObject({
      officialScenario: true,
      officialLifeApproved: false,
      allowPersonalization: false,
      contentLocale: 'en',
    });
    for (const value of [
      a.owner,
      b.owner,
      a.version.id,
      a.request.sourceGrantId,
      a.preview.id,
    ])
      expect(JSON.stringify(first)).not.toContain(value);
    expect(JSON.stringify(first)).not.toMatch(
      /templateHash|startingState|monthlyIncome|actorKeys|receipt|profileVersion|inputTokens|userId|sourceGrantId/,
    );
    expect(
      await db.query('SELECT * FROM aw_budget_accounts ORDER BY id'),
    ).toEqual(ledger);
    expect(await db.query('SELECT id FROM aw_jobs')).toEqual([]);
  });
  it('treats search metacharacters literally and bounds old and empty pages', async () => {
    const f = await published();
    expect((await f.pubs.list({ q: 'STUDIO' })).items).toHaveLength(1);
    for (const q of ['%', '_', "' OR true --", 'no-such-situation'])
      expect((await f.pubs.list({ q })).items).toHaveLength(0);
    expect(await f.pubs.list({ page: 100 })).toMatchObject({
      page: 100,
      hasMore: false,
      items: [],
    });
  });
  it('drops withdrawals, moderation and source revocation from live browsing', async () => {
    const a = await published(),
      b = await published(),
      c = await published();
    await a.pubs.withdraw(a.owner, a.publication.id);
    await b.pubs.moderate(b.owner, b.publication.id, {
      status: 'hidden',
      reason: 'privacy',
      actorLabel: 'Technical catalog moderator',
    });
    await c.release.revoke({
      grantId: c.request.sourceGrantId,
      templateHash: c.request.templateHash,
      acknowledged: true,
      reasonCode: 'privacy',
      actorLabel: 'Technical catalog revoke',
    });
    expect((await a.pubs.list()).items).toEqual([]);
  });
  it('hides superseded sources, missing consent and deleting owners through the full reader', async () => {
    const a = await published(),
      b = await published(),
      c = await published();
    await a.scenarios.revise(
      a.owner,
      a.version.scenarioId,
      {
        expectedVersion: 1,
        expectedHash: a.version.templateHash,
        template: {
          ...a.version.template,
          title: 'A later version needs its own review',
        },
      },
      randomUUID(),
    );
    await db.query('DELETE FROM ff_consents WHERE user_id=$1', [b.owner]);
    await c.repo.markDeleting(c.owner);
    expect((await a.pubs.list()).items).toEqual([]);
  });
  it('rechecks the pagination sentinel and refuses a stale card after candidate lookup', async () => {
    const a = await published(),
      b = await published();
    let changed = false;
    const race: Database = {
      ...db,
      query: async <T extends Record<string, unknown>>(
        sql: string,
        values: unknown[] = [],
      ) => {
        const rows = await db.query<T>(sql, values);
        if (
          sql.includes('SELECT p.slug FROM aw_scenario_publications') &&
          !changed
        ) {
          changed = true;
          await a.pubs.withdraw(a.owner, a.publication.id);
        }
        return rows;
      },
    };
    const page = await new PublicScenarioPublicationRepository(race, {
      enabled: true,
      operatorEnabled: false,
    }).list({ pageSize: 1 });
    expect(page.items.map((i) => i.slug)).toEqual([b.publication.slug]);
    expect(page.hasMore).toBe(false);
  });
  it('provides an anonymous no-store/noindex HTTP list with strict wire input and no credentials', async () => {
    const f = await published(),
      args: Parameters<typeof createApp> = [
        f.repo,
        {
          verify: async () => {
            throw Error('Anonymous list must not authenticate');
          },
          deleteUser: async () => {},
        },
      ];
    args[22] = { enabled: true, operatorEnabled: false };
    const app = await createApp(...args);
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    try {
      const response = await fetch(
        base + '/api/public/scenarios?q=studio&pageSize=1',
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-robots-tag')).toContain('noindex');
      expect(
        scenarioDiscoveryPageSchema.parse(await response.json()).items[0]!.slug,
      ).toBe(f.publication.slug);
      for (const suffix of [
        '?q=x&q=y',
        '?page=0',
        '?page=1e2',
        '?pageSize=25',
        '?locale=hu',
        '?ownerId=foreign',
      ])
        expect(
          (await fetch(base + '/api/public/scenarios' + suffix)).status,
        ).toBe(422);
    } finally {
      await app.close();
    }
  });
});
describe('Scenario search links and browser response validation', () => {
  it('uses the same bounded wire query for forms, links and API requests', () => {
    const query = parseScenarioDiscoveryWireQuery({
      q: ' a & b ',
      page: '2',
      pageSize: '24',
    });
    expect(query).toEqual({ q: 'a & b', locale: 'en', page: 2, pageSize: 24 });
    expect(scenarioDiscoverySearch(query)).toBe('q=a+%26+b&page=2&pageSize=24');
    expect(scenarioDiscoveryPageLink(query, 3)).toBe(
      '/scenarios?q=a+%26+b&page=3&pageSize=24',
    );
    for (const raw of [
      { q: ['one', 'two'] },
      { page: '02' },
      { locale: 'hu' },
      { templateHash: 'private' },
      { page: '101' },
      { pageSize: '0' },
    ])
      expect(() => parseScenarioDiscoveryWireQuery(raw)).toThrow();
  });
  it('refuses wrong page, injected private metadata, wrong locale and duplicate cards before display', () => {
    const query = parseScenarioDiscoveryWireQuery({}),
      card = {
        slug: 'scenario-' + 'a'.repeat(32),
        contentLocale: 'en',
        title: 'A fictional beginning',
        summary: 'An adult making a bounded decision.',
        goalDescription: 'Explore a different routine.',
        officialScenario: true,
        officialLifeApproved: false,
        allowPersonalization: true,
        publishedAt: '2026-10-08T00:00:00Z',
      },
      page = {
        schemaVersion: 'scenario-discovery-1',
        contentLocale: 'en',
        ranking: 'newest',
        page: 1,
        pageSize: 12,
        hasMore: false,
        items: [card],
      };
    expect(verifiedScenarioDiscoveryPage(page, query).items).toHaveLength(1);
    expect(scenarioDiscoveryReaderLink(card as never)).toBe(
      '/scenarios/' + card.slug,
    );
    for (const invalid of [
      { ...page, page: 2 },
      { ...page, items: [{ ...card, ownerId: randomUUID() }] },
      { ...page, items: [{ ...card, contentLocale: 'hu' }] },
      { ...page, items: [{ ...card, officialLifeApproved: true }] },
      { ...page, items: [card, card] },
    ])
      expect(() => verifiedScenarioDiscoveryPage(invalid, query)).toThrow();
    expect(() =>
      scenarioDiscoveryReaderLink({
        ...card,
        slug: 'https://example.com',
      } as never),
    ).toThrow();
  });
});
