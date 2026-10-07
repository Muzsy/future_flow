// Isolated reviewed fixtures only: no real AI, editorial seed or paid calls.
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import {
  PublicForkPermissionRepository,
  publicForkPermissionConfigFromEnv,
  PublicationRepository,
  PublicationRefreshRepository,
  LifeDeletionRepository,
  LifeRepository,
  Repository,
  type Database,
} from '@future-flow/database';
import {
  publicForkPermissionRequestSchema,
  publicForkCapabilitySchema,
} from '@future-flow/contracts';
import { hash } from '@future-flow/core';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  publicationFixture,
  approvePublicationFixture,
} from './publication-fixtures';
import {
  officialRefreshFixture,
  refreshedPublicationFixture,
} from './publication-refresh-fixtures';
import { createApp } from '../apps/api/src/app';
const config = { enabled: true, linkSecret: 'f'.repeat(64) },
  flags = { enabled: true, startsEnabled: false };
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
const forks = (enabled = true) =>
  new PublicForkPermissionRepository(db, { ...flags, enabled }, config, config);
const request = (
  v: { revision: number; snapshotHash: string },
  allowed = true,
  permissionRevision = 0,
) => ({
  publicationRevision: v.revision,
  snapshotHash: v.snapshotHash,
  permissionRevision,
  allowed,
  acknowledged: true,
});
async function copy(visibility: 'public' | 'unlisted' = 'public') {
  const f = await publicationFixture(db),
    input = await approvePublicationFixture(db, f);
  if (!input) throw Error('Missing technical review');
  input.settings.visibility = visibility;
  const pubs = new PublicationRepository(db, config),
    preview = await pubs.prepare(f.owner, input, randomUUID()),
    view = await pubs.confirm(
      f.owner,
      {
        previewId: preview.previewId,
        previewHash: preview.previewHash,
        acknowledged: true,
      },
      randomUUID(),
    );
  return { ...f, pubs, view };
}
describe('explicit independent private-start permission', () => {
  it('defaults off and refuses premature start activation, wrong owner, unlisted and unknown fields', async () => {
    expect(publicForkPermissionConfigFromEnv({})).toEqual({
      enabled: false,
      startsEnabled: false,
    });
    for (const env of [
      { PUBLIC_FORK_PERMISSION_ENABLED: 'yes' },
      { PUBLIC_FORK_STARTS_ENABLED: 'true' },
      {
        PUBLIC_FORK_PERMISSION_ENABLED: 'true',
        PUBLIC_FORK_STARTS_ENABLED: 'true',
      },
    ])
      expect(() => publicForkPermissionConfigFromEnv(env)).toThrow();
    expect(
      () =>
        new PublicForkPermissionRepository(db, {
          enabled: true,
          startsEnabled: true,
        }),
    ).toThrow();
    const f = await copy(),
      r = forks();
    expect(await r.own(f.owner, f.view.slug)).toMatchObject({
      allowed: false,
      effectiveAllowed: false,
      permissionRevision: 0,
      startsEnabled: false,
    });
    await expect(r.capability(f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      forks(false).setOwner(f.owner, f.view.slug, request(f.view)),
    ).rejects.toMatchObject({ code: 'PUBLIC_FORK_PERMISSION_DISABLED' });
    await expect(
      r.setOwner(randomUUID(), f.view.slug, request(f.view)),
    ).rejects.toMatchObject({ status: 404 });
    expect(() =>
      publicForkPermissionRequestSchema.parse({
        ...request(f.view),
        ownerId: f.owner,
      }),
    ).toThrow();
    const unlisted = await copy('unlisted');
    await expect(
      r.setOwner(unlisted.owner, unlisted.view.slug, request(unlisted.view)),
    ).rejects.toMatchObject({ status: 404 });
    expect(await db.query('SELECT id FROM aw_public_fork_permissions')).toEqual(
      [],
    );
  });
  it('requires explicit grant, exposes only reviewed choices, replays once and preserves private canon and immutable reader', async () => {
    const f = await copy(),
      r = forks(),
      lives = new LifeRepository(db),
      before = await lives.detail(f.owner, f.created.branchId),
      reader = await f.pubs.readPublic(f.view.slug),
      input = request(f.view);
    const p = await r.setOwner(f.owner, f.view.slug, input);
    expect(p).toMatchObject({
      allowed: true,
      effectiveAllowed: true,
      permissionRevision: 1,
      startsEnabled: false,
    });
    expect(await r.setOwner(f.owner, f.view.slug, input)).toEqual(p);
    const c = publicForkCapabilitySchema.parse(await r.capability(f.view.slug));
    expect(c.checkpoints).toHaveLength(1);
    expect(c.checkpoints[0]!.options).toHaveLength(2);
    expect(c.title).toBe(reader.snapshot.story.title);
    expect(c.startsEnabled).toBe(false);
    const serialized = JSON.stringify(c);
    for (const secret of [
      f.owner,
      f.created.lifeId,
      f.created.branchId,
      f.bundle.bundleId,
      f.view.snapshotHash,
      f.preview.draftId,
    ])
      expect(serialized).not.toContain(secret);
    expect(await lives.detail(f.owner, f.created.branchId)).toEqual(before);
    expect(await f.pubs.readPublic(f.view.slug)).toEqual(reader);
    expect(reader.snapshot.forkEnabled).toBe(false);
    expect(
      await db.query('SELECT id FROM aw_public_fork_permission_actions'),
    ).toHaveLength(1);
  });
  it('binds consent to exact copy and revision, permits revoke with feature off, and never replays an old enable across a revoke', async () => {
    const f = await copy(),
      r = forks(),
      initial = request(f.view);
    await r.setOwner(f.owner, f.view.slug, initial);
    await expect(
      r.setOwner(f.owner, f.view.slug, request(f.view, false, 0)),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      r.setOwner(f.owner, f.view.slug, {
        ...request(f.view, false, 1),
        snapshotHash: '0'.repeat(64),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await forks(false).setOwner(
        f.owner,
        f.view.slug,
        request(f.view, false, 1),
      ),
    ).toMatchObject({
      allowed: false,
      effectiveAllowed: false,
      permissionRevision: 2,
    });
    await expect(r.capability(f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      r.setOwner(f.owner, f.view.slug, initial),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await r.setOwner(f.owner, f.view.slug, request(f.view, true, 2)))
        .permissionRevision,
    ).toBe(3);
  });
  it('does not transfer consent to a refreshed copy and rejects a reviewed copy with no checkpoint', async () => {
    const f = await copy(),
      r = forks();
    await r.setOwner(f.owner, f.view.slug, request(f.view));
    const next = await refreshedPublicationFixture(db, f);
    next.input.settings.visibility = 'public';
    const preview = await f.pubs.prepare(f.owner, next.input, randomUUID()),
      refreshed = await new PublicationRefreshRepository(
        db,
        { enabled: true },
        config,
        config,
      ).refresh(
        f.owner,
        'community',
        {
          previousPublicationId: f.view.publicationId,
          previousRevision: f.view.revision,
          previousSnapshotHash: f.view.snapshotHash,
          previewId: preview.previewId,
          previewHash: preview.previewHash,
          acknowledged: true,
        },
        randomUUID(),
      );
    await expect(r.capability(f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    expect(await r.own(f.owner, refreshed.publication.slug)).toMatchObject({
      allowed: false,
      permissionRevision: 0,
    });
    await expect(
      r.setOwner(
        f.owner,
        refreshed.publication.slug,
        request(refreshed.publication),
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_FORK_CHECKPOINT_REQUIRED' });
    expect(
      await db.query('SELECT id FROM aw_public_fork_permission_actions'),
    ).toHaveLength(1);
  });
  it('requires trusted Official curator approval and allows owner revocation without granting Official provenance', async () => {
    const f = await officialRefreshFixture(db, config, true),
      r = forks();
    await expect(
      r.setOwner(f.f.owner, f.previous.slug, request(f.previous)),
    ).rejects.toMatchObject({ code: 'PUBLIC_FORK_CURATOR_REQUIRED' });
    await r.setOfficial({
      ...request(f.previous),
      slug: f.previous.slug,
      actorLabel: 'Isolated curator',
    });
    expect((await r.capability(f.previous.slug)).classification).toBe(
      'official',
    );
    expect(
      await r.setOwner(
        f.f.owner,
        f.previous.slug,
        request(f.previous, false, 1),
      ),
    ).toMatchObject({ allowed: false, permissionRevision: 2 });
    await expect(r.capability(f.previous.slug)).rejects.toMatchObject({
      status: 404,
    });
    await r.setOfficial({
      ...request(f.previous, true, 2),
      slug: f.previous.slug,
      actorLabel: 'Isolated curator',
    });
    const [source] = await db.query<{ id: string; content_hash: string }>(
      'SELECT s.id,s.content_hash FROM aw_official_life_sources s JOIN aw_official_publications p ON p.source_grant_id=s.id WHERE p.id=$1 AND s.user_id=$2',
      [f.previous.publicationId, f.f.owner],
    );
    await f.f.official.revoke(f.f.owner, {
      grantId: source!.id,
      contentHash: source!.content_hash,
      reasonCode: 'privacy',
      actorLabel: 'Isolated curator',
      acknowledged: true,
    });
    await expect(r.capability(f.previous.slug)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('rechecks hidden, withdrawn and deleting sources and never restores a publication after account recovery', async () => {
    const f = await copy(),
      r = forks();
    await r.setOwner(f.owner, f.view.slug, request(f.view));
    await db.query(
      "UPDATE aw_publications SET status='hidden',revision=revision+1 WHERE id=$1",
      [f.view.publicationId],
    );
    await expect(r.capability(f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      db.query(
        "UPDATE aw_publications SET status='active',revision=revision+1 WHERE id=$1",
        [f.view.publicationId],
      ),
    ).rejects.toThrow();
    expect((await r.own(f.owner, f.view.slug)).effectiveAllowed).toBe(false);
    await expect(r.capability(f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    const hidden = (await f.pubs.list(f.owner))[0]!;
    await r.setOwner(f.owner, hidden.slug, request(hidden, false, 1));
    const active = await copy();
    await r.setOwner(active.owner, active.view.slug, request(active.view));
    await new Repository(db).markDeleting(active.owner);
    await expect(r.capability(active.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    await new Repository(db).restoreActive(active.owner);
    await expect(r.capability(active.view.slug)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('exports only own permissions, keeps immutable private actions and cascades a whole life without deleting a foreign account', async () => {
    const f = await copy(),
      r = forks(),
      other = randomUUID(),
      repo = new Repository(db);
    await repo.ensureUser(other);
    await r.setOwner(f.owner, f.view.slug, request(f.view));
    const exported = await repo.exportAccount(f.owner),
      foreign = await repo.exportAccount(other);
    expect(exported.aw_public_fork_permissions).toHaveLength(1);
    expect(foreign.aw_public_fork_permissions).toEqual([]);
    for (const row of exported.aw_public_fork_permission_actions as Record<
      string,
      unknown
    >[])
      for (const forbidden of [
        'actor_label',
        'request_hash',
        'permission_id',
        'user_id',
      ])
        expect(row).not.toHaveProperty(forbidden);
    await expect(
      db.query('UPDATE aw_public_fork_permission_actions SET allowed=false'),
    ).rejects.toThrow();
    for (const table of [
      'aw_public_fork_permissions',
      'aw_public_fork_permission_actions',
    ])
      expect(
        (
          await db.query(
            "SELECT relrowsecurity AS rls,has_table_privilege('anon',oid,'SELECT') AS anon,has_table_privilege('authenticated',oid,'INSERT') AS client FROM pg_class WHERE oid=$1::regclass",
            [table],
          )
        )[0],
      ).toEqual({ rls: true, anon: false, client: false });
    const branch = await f.lives.branch(f.owner, f.created.branchId);
    await new LifeDeletionRepository(db).remove(
      f.owner,
      f.created.lifeId,
      {
        branchId: branch.id,
        revision: branch.revision,
        confirmation: 'DELETE LIFE',
      },
      randomUUID(),
    );
    await expect(r.capability(f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    expect(await db.query('SELECT id FROM aw_public_fork_permissions')).toEqual(
      [],
    );
    expect(
      await db.query('SELECT id FROM aw_public_fork_permission_actions'),
    ).toEqual([]);
    expect(
      await db.query('SELECT status FROM ff_users WHERE id=$1', [other]),
    ).toEqual([{ status: 'active' }]);
  });
  it('provides no-store anonymous choices but protects owner consent, rejects query substitutions and has no curator or premature start route', async () => {
    const f = await copy(),
      r = forks();
    await r.setOwner(f.owner, f.view.slug, request(f.view));
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
      undefined,
      undefined,
      flags,
    );
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    try {
      const response = await fetch(
        base + '/api/public/fork-capabilities/' + f.view.slug,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      expect(hash(await response.json())).toBe(
        hash(await r.capability(f.view.slug)),
      );
      expect(
        (
          await fetch(
            base + '/api/public/fork-capabilities/' + f.view.slug + '?token=x',
          )
        ).status,
      ).toBe(422);
      expect(
        (await fetch(base + '/api/v2/public-fork-permission/' + f.view.slug))
          .status,
      ).toBe(401);
      for (const path of [
        '/api/v2/public-fork-permission/' + f.view.slug + '?owner=x',
        '/api/v2/public-fork-permission/curator/apply',
        '/api/v2/public-forks/' + f.view.slug,
      ]) {
        const response = await fetch(base + path, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + 'a'.repeat(30),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request(f.view, false, 1)),
        });
        expect(response.status).toBe(path.includes('?') ? 422 : 404);
      }
      const revoked = await fetch(
        base + '/api/v2/public-fork-permission/' + f.view.slug,
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + 'a'.repeat(30),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request(f.view, false, 1)),
        },
      );
      expect(revoked.status).toBe(201);
      expect(
        (await fetch(base + '/api/public/fork-capabilities/' + f.view.slug))
          .status,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });
});
