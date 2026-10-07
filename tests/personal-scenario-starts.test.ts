import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { DomainError, hash } from '@future-flow/core';
import {
  Repository,
  LifeRepository,
  LifeJobRepository,
  LifeDeletionRepository,
  PersonalScenarioRepository,
  PublicScenarioPublicationRepository,
  personalScenarioConfigFromEnv,
  cleanupExpiredPersonalScenarioPreviews,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
import { publicScenarioFixture } from './public-scenario-publication-fixtures';
import { personalScenarioFixture } from './scenario-personalization-fixtures';
import { lifeTestAi } from './life-fixtures';
import { processLifeJob } from '../apps/worker/src/life-processor';

const publicFlags = { enabled: true, operatorEnabled: false };
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
  for (const user of await db.query<{ id: string }>('SELECT id FROM ff_users'))
    await new Repository(db).deleteAccountData(user.id);
});
afterAll(async () => {
  await engine?.close();
});
async function target() {
  const user = randomUUID(),
    repo = new Repository(db);
  await repo.ensureUser(user);
  await repo.acceptPrivacy(user);
  return user;
}
const personal = (database = db, limits = { daily: 10, concurrent: 2 }) =>
  new PersonalScenarioRepository(
    database,
    { enabled: true },
    publicFlags,
    limits,
  );
async function fixture(allowed = true, database = db) {
  const f = await publicScenarioFixture(db, allowed),
    publication = await f.pubs.confirm(f.owner, f.confirm, randomUUID()),
    user = await target(),
    request = {
      templateHash: f.version.templateHash,
      profile: personalScenarioFixture(),
      acknowledged: true,
    },
    key = randomUUID(),
    preview = allowed
      ? await personal(database).prepare(user, publication.slug, request, key)
      : null;
  return { ...f, publication, user, request, key, preview };
}
const body = (f: Awaited<ReturnType<typeof fixture>>) => ({
  previewId: f.preview!.id,
  previewHash: f.preview!.previewHash,
  profile: f.request.profile,
  acknowledged: true,
});

describe('private starts from explicitly approved personal Scenario previews', () => {
  it('exposes only a current public capability, requiring both runtime and source personalization permission', async () => {
    const f = await fixture();
    expect(await personal().capability(f.publication.slug)).toEqual({
      schemaVersion: 'scenario-ui-1',
      slug: f.publication.slug,
      templateHash: f.version.templateHash,
      personalizationEnabled: true,
    });
    const off = new PersonalScenarioRepository(
      db,
      { enabled: false },
      publicFlags,
    );
    expect(
      (await off.capability(f.publication.slug)).personalizationEnabled,
    ).toBe(false);
    const denied = await fixture(false);
    expect(
      (await personal().capability(denied.publication.slug))
        .personalizationEnabled,
    ).toBe(false);
    await f.pubs.withdraw(f.owner, f.publication.id);
    await expect(
      personal().capability(f.publication.slug),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('provides private current publication context and permits own withdrawal history while publication is off', async () => {
    const f = await fixture(),
      foreign = await target();
    const source = await f.pubs.publicationSource(f.owner, f.version.id);
    expect(source.templateHash).toBe(f.version.templateHash);
    expect(hash(source.template)).toBe(source.templateHash);
    expect(source.officialLifeApproved).toBe(false);
    await expect(
      f.pubs.publicationSource(foreign, f.version.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      f.pubs.forVersion(foreign, f.version.id),
    ).rejects.toMatchObject({ status: 404 });
    const off = new PublicScenarioPublicationRepository(db);
    await expect(
      off.publicationSource(f.owner, f.version.id),
    ).rejects.toMatchObject({ status: 404 });
    expect((await off.forVersion(f.owner, f.version.id)).publications).toEqual([
      f.publication,
    ]);
    await off.withdraw(f.owner, f.publication.id);
    expect(
      (await off.forVersion(f.owner, f.version.id)).publications[0]!.status,
    ).toBe('withdrawn');
  });
  it('binds new UI support endpoints to verified ownership and strict query projections without exposing private profiles', async () => {
    const f = await fixture(),
      foreign = await target(),
      args: Parameters<typeof createApp> = [
        new Repository(db),
        {
          verify: async (token) => {
            if ([f.user, f.owner, foreign].includes(token))
              return { id: token };
            throw new DomainError('AUTH_INVALID', 'Invalid token.', 401);
          },
          deleteUser: async () => {},
        },
      ];
    args[22] = publicFlags;
    args[23] = { enabled: true };
    const app = await createApp(...args);
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    try {
      const capability = await fetch(
        `${base}/api/public/scenario-personalization/${f.publication.slug}`,
      );
      expect(capability.status).toBe(200);
      expect(capability.headers.get('cache-control')).toBe('no-store');
      expect(Object.keys(await capability.json()).sort()).toEqual(
        [
          'personalizationEnabled',
          'schemaVersion',
          'slug',
          'templateHash',
        ].sort(),
      );
      expect(
        (
          await fetch(
            `${base}/api/public/scenario-personalization/${f.publication.slug}?profile=secret`,
          )
        ).status,
      ).toBe(422);
      for (const suffix of ['source', 'publications']) {
        const endpoint = `${base}/api/v2/scenario-publications/versions/${f.version.id}/${suffix}`;
        expect((await fetch(endpoint)).status).toBe(401);
        expect(
          (
            await fetch(endpoint, {
              headers: { Authorization: `Bearer ${foreign}` },
            })
          ).status,
        ).toBe(404);
        expect(
          (
            await fetch(endpoint + '?userId=' + foreign, {
              headers: { Authorization: `Bearer ${f.owner}` },
            })
          ).status,
        ).toBe(422);
        const response = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${f.owner}` },
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(JSON.stringify(await response.json())).not.toContain(
          f.request.profile.identity.label,
        );
      }
    } finally {
      await app.close();
    }
  });
  it('continues three normal technical periods after source deletion, using only its own approved starting canon', async () => {
    const f = await fixture(),
      receipt = await personal().start(
        f.user,
        f.publication.slug,
        body(f),
        randomUUID(),
      ),
      lives = new LifeRepository(db),
      initial = await lives.branch(f.user, receipt.branchId);
    await new Repository(db).deleteAccountData(f.owner);
    let jobId = receipt.jobId;
    for (let i = 0; i < 3; i++) {
      const [job] = await db.query<LifeJob>(
        "UPDATE aw_jobs SET status='running',attempt=1,lease_token=$1,lease_until=now()+interval '10 minutes' WHERE id=$2 AND user_id=$3 AND status='queued' RETURNING *",
        [randomUUID(), jobId, f.user],
      );
      expect(job).toBeTruthy();
      await processLifeJob(job!, new LifeJobRepository(db), lifeTestAi);
      const detail = await lives.detail(f.user, receipt.branchId);
      expect(detail.periods).toHaveLength(i + 1);
      if (i === 0)
        expect(detail.periods[0]!.start_state).toEqual(initial.state);
      const branch = await lives.branch(f.user, receipt.branchId);
      expect(branch.state.location.country).toBe('DE');
      if (branch.pending_decision)
        await lives.choose(
          f.user,
          branch.id,
          branch.revision,
          branch.pending_decision.id,
          branch.pending_decision.options[0]!.id,
          randomUUID(),
        );
      if (i < 2) {
        const ready = await lives.branch(f.user, receipt.branchId);
        jobId = (
          await lives.continue(f.user, ready.id, ready.revision, randomUUID())
        ).jobId;
      }
    }
    expect(
      (await personal().attribution(f.user, receipt.lifeId)).source,
    ).toBeNull();
  });
  it('defaults off, requires public support, rejects extra authority and isolates consent', async () => {
    expect(personalScenarioConfigFromEnv({})).toEqual({ enabled: false });
    for (const env of [
      { SCENARIO_PERSONALIZATION_ENABLED: 'yes' },
      { SCENARIO_PERSONALIZATION_ENABLED: 'true' },
    ])
      expect(() => personalScenarioConfigFromEnv(env)).toThrow();
    const f = await fixture(false);
    await expect(
      personal().prepare(f.user, f.publication.slug, f.request, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
    const t = await fixture(),
      outsider = randomUUID();
    await new Repository(db).ensureUser(outsider);
    await expect(
      personal().prepare(outsider, t.publication.slug, t.request, randomUUID()),
    ).rejects.toMatchObject({ code: 'PRIVACY_ACKNOWLEDGEMENT_REQUIRED' });
    await expect(
      new PersonalScenarioRepository(db).prepare(
        t.user,
        t.publication.slug,
        t.request,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PERSONAL_SCENARIO_DISABLED' });
    await expect(
      personal().prepare(
        t.user,
        t.publication.slug,
        { ...t.request, officialLifeApproved: true },
        randomUUID(),
      ),
    ).rejects.toThrow();
    await expect(
      personal().preview(f.user, t.preview!.id),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('keeps preparation private, free and immutable; idempotency stores no profile copy', async () => {
    const f = await fixture(),
      before = hash(
        await db.query('SELECT * FROM aw_scenario_publications ORDER BY id'),
      ),
      budget = hash(
        await db.query('SELECT * FROM aw_budget_accounts ORDER BY id'),
      );
    expect(
      await personal().prepare(f.user, f.publication.slug, f.request, f.key),
    ).toEqual(f.preview);
    expect(await personal().preview(f.user, f.preview!.id)).toEqual(f.preview);
    expect(f.preview!.profile).toEqual(f.request.profile);
    expect(
      await db.query('SELECT id FROM aw_lives WHERE user_id=$1', [f.user]),
    ).toEqual([]);
    expect(await db.query('SELECT id FROM aw_jobs')).toEqual([]);
    expect(
      hash(await db.query('SELECT * FROM aw_budget_accounts ORDER BY id')),
    ).toBe(budget);
    expect(
      hash(
        await db.query('SELECT * FROM aw_scenario_publications ORDER BY id'),
      ),
    ).toBe(before);
    expect(
      (
        await db.query(
          'SELECT response FROM ff_idempotency WHERE user_id=$1 AND key=$2',
          [f.user, f.key],
        )
      )[0]!.response,
    ).toEqual({ id: f.preview!.id });
    await expect(
      db.query(
        "UPDATE aw_personal_scenario_previews SET profile='{}' WHERE id=$1",
        [f.preview!.id],
      ),
    ).rejects.toThrow();
  });
  it('requires the complete unchanged profile and preview; creates fresh private canon and one normal job', async () => {
    const f = await fixture(),
      r = personal(),
      key = randomUUID(),
      before = hash(
        await db.query('SELECT * FROM aw_scenario_versions ORDER BY id'),
      );
    for (const request of [
      { ...body(f), acknowledged: false },
      { ...body(f), previewHash: '0'.repeat(64) },
      {
        ...body(f),
        profile: {
          ...f.request.profile,
          context: 'A changed personal context.',
        },
      },
      { ...body(f), preparedLife: {} },
    ])
      await expect(
        r.start(f.user, f.publication.slug, request, randomUUID()),
      ).rejects.toThrow();
    const receipt = await r.start(f.user, f.publication.slug, body(f), key),
      branch = await new LifeRepository(db).branch(f.user, receipt.branchId);
    expect(await r.start(f.user, f.publication.slug, body(f), key)).toEqual(
      receipt,
    );
    expect(branch.input.identity.label).toBe(f.request.profile.identity.label);
    expect(branch.input.identity.baseProfileVersionId).toBeNull();
    expect(branch.input.initialState.location.country).toBe('DE');
    expect(branch.input.initialState.ownedAssets).toEqual([]);
    expect(branch.input.initialState.opportunities).toEqual([]);
    expect(branch.input.initialState.actors[0]!.label).toBe('My partner');
    expect(branch.input.goals.map((g) => g.priority)).toEqual([
      'primary',
      'secondary',
    ]);
    expect(branch.input.locale).toBe('en');
    expect(
      await db.query('SELECT id FROM aw_jobs WHERE user_id=$1', [f.user]),
    ).toHaveLength(1);
    expect(
      await db.query(
        'SELECT life_id FROM aw_official_life_starts WHERE user_id=$1',
        [f.user],
      ),
    ).toEqual([]);
    expect(
      await db.query('SELECT life_id FROM aw_shared_members WHERE user_id=$1', [
        f.user,
      ]),
    ).toEqual([]);
    expect(
      hash(await db.query('SELECT * FROM aw_scenario_versions ORDER BY id')),
    ).toBe(before);
    await expect(
      r.start(f.user, f.publication.slug, body(f), randomUUID()),
    ).rejects.toMatchObject({ code: 'PERSONAL_SCENARIO_ALREADY_STARTED' });
    await expect(
      r.start(
        f.user,
        f.publication.slug,
        { ...body(f), profile: { ...f.request.profile, context: null } },
        key,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('stops new starts on withdrawal while preserving a free receipt and detached independent life', async () => {
    const f = await fixture(),
      r = personal(),
      key = randomUUID(),
      receipt = await r.start(f.user, f.publication.slug, body(f), key),
      pending = await r.prepare(
        f.user,
        f.publication.slug,
        f.request,
        randomUUID(),
      );
    expect((await r.attribution(f.user, receipt.lifeId)).source?.slug).toBe(
      f.publication.slug,
    );
    await f.pubs.withdraw(f.owner, f.publication.id);
    await expect(
      r.start(
        f.user,
        f.publication.slug,
        { ...body(f), previewId: pending.id, previewHash: pending.previewHash },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(await r.start(f.user, f.publication.slug, body(f), key)).toEqual(
      receipt,
    );
    expect(
      await new PersonalScenarioRepository(db).start(
        f.user,
        f.publication.slug,
        body(f),
        key,
      ),
    ).toEqual(receipt);
    expect((await r.attribution(f.user, receipt.lifeId)).source).toBeNull();
    await new Repository(db).deleteAccountData(f.owner);
    expect(await r.start(f.user, f.publication.slug, body(f), key)).toEqual(
      receipt,
    );
    expect(
      await db.query(
        'SELECT id FROM aw_personal_scenario_previews WHERE user_id=$1',
        [f.user],
      ),
    ).toEqual([]);
    expect(await new LifeRepository(db).list(f.user)).toHaveLength(1);
    expect(
      (
        await db.query(
          'SELECT publication_id,preview_id FROM aw_personal_scenario_starts WHERE user_id=$1',
          [f.user],
        )
      )[0],
    ).toEqual({ publication_id: null, preview_id: null });
  });
  it('checks database time, and expires the prepared permission without queuing or spending', async () => {
    const short = (base: Database): Database => ({
        query: (sql, values) =>
          base.query(
            sql.includes("clock_timestamp()+interval '30 minutes'")
              ? sql.replace('30 minutes', '1 second')
              : sql,
            values,
          ),
        transaction: (run) => base.transaction((tx) => run(short(tx))),
      }),
      f = await fixture(true, short(db));
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await expect(
      personal().start(f.user, f.publication.slug, body(f), randomUUID()),
    ).rejects.toMatchObject({ code: 'PERSONAL_SCENARIO_PREVIEW_EXPIRED' });
    await expect(
      personal().preview(f.user, f.preview!.id),
    ).rejects.toMatchObject({ code: 'PERSONAL_SCENARIO_PREVIEW_EXPIRED' });
    expect(await db.query('SELECT id FROM aw_jobs')).toEqual([]);
  });
  it('rolls back all private creation on normal quota limits, and deletion removes previews without resurrecting a request', async () => {
    const f = await fixture(),
      r = personal(),
      key = randomUUID(),
      receipt = await r.start(f.user, f.publication.slug, body(f), key),
      second = await r.prepare(
        f.user,
        f.publication.slug,
        f.request,
        randomUUID(),
      );
    await expect(
      personal(db, { daily: 1, concurrent: 1 }).start(
        f.user,
        f.publication.slug,
        { ...body(f), previewId: second.id, previewHash: second.previewHash },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'GENERATION_LIMIT' });
    expect(await new LifeRepository(db).list(f.user)).toHaveLength(1);
    const branch = await new LifeRepository(db).branch(
      f.user,
      receipt.branchId,
    );
    await new LifeDeletionRepository(db).remove(
      f.user,
      receipt.lifeId,
      {
        branchId: branch.id,
        revision: branch.revision,
        confirmation: 'DELETE LIFE',
      },
      randomUUID(),
    );
    await expect(
      r.start(f.user, f.publication.slug, body(f), key),
    ).rejects.toMatchObject({ code: 'PERSONAL_SCENARIO_DELETED', status: 410 });
    await expect(
      r.start(f.user, f.publication.slug, body(f), randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      r.prepare(f.user, f.publication.slug, f.request, f.key),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (
        await db.query(
          'SELECT response FROM ff_idempotency WHERE user_id=$1 AND key=$2',
          [f.user, key],
        )
      )[0]!.response,
    ).toEqual({ deleted: true });
    expect(
      await db.query(
        'SELECT id FROM aw_personal_scenario_previews WHERE id=$1',
        [f.preview!.id],
      ),
    ).toEqual([]);
    expect(await f.pubs.read(f.publication.slug)).toBeTruthy();
  });
  it('exports only owned profiles, enforces RLS and immutable origins, and cascades target deletion', async () => {
    const f = await fixture(),
      receipt = await personal().start(
        f.user,
        f.publication.slug,
        body(f),
        randomUUID(),
      ),
      data = await new Repository(db).exportAccount(f.user),
      sourceData = await new Repository(db).exportAccount(f.owner);
    expect(data.aw_personal_scenario_previews).toHaveLength(1);
    expect(data.aw_personal_scenario_starts).toHaveLength(1);
    expect(sourceData.aw_personal_scenario_previews).toEqual([]);
    expect(sourceData.aw_personal_scenario_starts).toEqual([]);
    for (const table of [
      'aw_personal_scenario_previews',
      'aw_personal_scenario_starts',
    ]) {
      expect(
        (
          await db.query(
            "SELECT relrowsecurity AS rls,has_table_privilege('anon',oid,'SELECT') AS anon,has_table_privilege('authenticated',oid,'INSERT') AS client FROM pg_class WHERE oid=$1::regclass",
            [table],
          )
        )[0],
      ).toEqual({ rls: true, anon: false, client: false });
    }
    await expect(
      db.query(
        'UPDATE aw_personal_scenario_starts SET source_slug=$1 WHERE life_id=$2',
        ['scenario-' + 'f'.repeat(32), receipt.lifeId],
      ),
    ).rejects.toThrow();
    await new Repository(db).deleteAccountData(f.user);
    expect(
      await db.query('SELECT life_id FROM aw_personal_scenario_starts'),
    ).toEqual([]);
    expect(
      await db.query('SELECT id FROM aw_personal_scenario_previews'),
    ).toEqual([]);
    expect(await f.pubs.read(f.publication.slug)).toBeTruthy();
  });
  it('clears expired profile payloads in bounded housekeeping; a stale request cannot reconstruct them', async () => {
    const old = (base: Database): Database => ({
        query: (sql, values) =>
          base.query(
            sql.includes("clock_timestamp()+interval '30 minutes'")
              ? sql.replace("+interval '30 minutes'", "-interval '25 hours'")
              : sql.startsWith('INSERT INTO aw_personal_scenario_previews(')
                ? sql
                    .replace(
                      'composition,expires_at)',
                      'composition,expires_at,created_at)',
                    )
                    .replace(
                      '$9,$10)',
                      "$9,$10,clock_timestamp()-interval '26 hours')",
                    )
                : sql,
            values,
          ),
        transaction: (run) => base.transaction((tx) => run(old(tx))),
      }),
      f = await fixture(true, old(db));
    expect(await cleanupExpiredPersonalScenarioPreviews(db)).toEqual({
      deleted: 1,
      batchFull: false,
    });
    expect(await cleanupExpiredPersonalScenarioPreviews(db)).toEqual({
      deleted: 0,
      batchFull: false,
    });
    await expect(
      personal().prepare(f.user, f.publication.slug, f.request, f.key),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (
        await db.query(
          'SELECT response FROM ff_idempotency WHERE user_id=$1 AND key=$2',
          [f.user, f.key],
        )
      )[0]!.response,
    ).toEqual({ id: f.preview!.id });
  });
  it('requires verified Auth, strict bodies and ownership at HTTP boundary and never accepts public profile writes', async () => {
    const f = await fixture(),
      foreign = await target(),
      args: Parameters<typeof createApp> = [
        new Repository(db),
        {
          verify: async (token) => {
            if ([f.user, foreign].includes(token)) return { id: token };
            throw new DomainError('AUTH_INVALID', 'Invalid token.', 401);
          },
          deleteUser: async () => {},
        },
      ];
    args[22] = publicFlags;
    args[23] = { enabled: true };
    const app = await createApp(...args);
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl(),
      endpoint = `${base}/api/v2/personal-scenarios/sources/${f.publication.slug}/start`,
      headers = {
        Authorization: `Bearer ${f.user}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      };
    try {
      expect(
        (
          await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body(f)),
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await fetch(endpoint, {
            method: 'POST',
            headers: { ...headers, Authorization: `Bearer ${foreign}` },
            body: JSON.stringify(body(f)),
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await fetch(endpoint + '?userId=' + foreign, {
            method: 'POST',
            headers,
            body: JSON.stringify(body(f)),
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...body(f), profileId: foreign }),
          })
        ).status,
      ).toBe(422);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body(f)),
      });
      expect(response.status).toBe(201);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const receipt = (await response.json()) as { lifeId: string };
      expect(
        (
          await fetch(
            `${base}/api/v2/personal-scenarios/lives/${receipt.lifeId}/attribution`,
            { headers: { Authorization: `Bearer ${foreign}` } },
          )
        ).status,
      ).toBe(404);
      const source = await fetch(
        `${base}/api/public/scenarios/${f.publication.slug}`,
      );
      expect(JSON.stringify(await source.json())).not.toContain(
        f.request.profile.identity.label,
      );
      expect(
        (
          await fetch(
            `${base}/api/public/scenarios/${f.publication.slug}/profile`,
            { method: 'POST', headers, body: '{}' },
          )
        ).status,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });
});
