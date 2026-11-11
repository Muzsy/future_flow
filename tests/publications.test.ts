import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  publicationPrepareRequestSchema,
  publicationConfirmRequestSchema,
  publicationReaderSchema,
} from '@future-flow/contracts';
import { DomainError, hash, releasePublicContent } from '@future-flow/core';
import {
  Repository,
  PublicationRepository,
  publicationConfigFromEnv,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
import {
  publicationFixture,
  approvePublicationFixture,
  publicationReviewConfig,
} from './publication-fixtures';
import {
  publicationPreviewForBundle,
  verifiedOwnedPublication,
  reviewedContent,
  publicationLink,
} from '../apps/web/lib/publication';
let engine: PGlite,
  db: Database,
  repo: Repository,
  app: INestApplication,
  base: string;
const config = { enabled: true, linkSecret: 'a'.repeat(64) },
  users = new Set<string>();
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
  repo = new Repository(db);
  app = await createApp(
    repo,
    {
      verify: async (token) => {
        if (users.has(token)) return { id: token };
        throw new DomainError('AUTH_INVALID_TOKEN', 'Invalid.', 401);
      },
      deleteUser: async () => {},
    },
    undefined,
    undefined,
    undefined,
    publicationReviewConfig,
    true,
    undefined,
    true,
    true,
    publicationReviewConfig,
    true,
    config,
  );
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  await engine?.close();
});
const publications = () => new PublicationRepository(db, config);
async function fixture() {
  const f = await publicationFixture(db);
  users.add(f.owner);
  return f;
}
async function ready(visibility: 'public' | 'unlisted' = 'unlisted') {
  const f = await fixture(),
    input = (await approvePublicationFixture(db, f))!;
  input.settings.visibility = visibility;
  return { ...f, input };
}
async function published(visibility: 'public' | 'unlisted' = 'unlisted') {
  const f = await ready(visibility),
    preview = await publications().prepare(f.owner, f.input, randomUUID());
  const confirm = {
      previewId: preview.previewId,
      previewHash: preview.previewHash,
      acknowledged: true,
    },
    key = randomUUID(),
    view = await publications().confirm(f.owner, confirm, key);
  return { ...f, releasePreview: preview, confirm, key, view };
}
const actionInput = (view: { revision: number; snapshotHash: string }) => ({
  revision: view.revision,
  snapshotHash: view.snapshotHash,
  acknowledged: true,
});
const http = (
  path: string,
  body?: unknown,
  owner?: string,
  key = randomUUID(),
) =>
  fetch(`${base}/api/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
      ...(owner ? { Authorization: `Bearer ${owner}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
describe.sequential('reviewed publication and explicit confirmation', () => {
  it('requires a complete AI and independent curator approval, with default-off release', async () => {
    const f = await fixture();
    const input = {
      binding: {
        bundleId: f.bundle.bundleId,
        sourceRevision: f.bundle.sourceRevision,
        contentHash: f.bundle.contentHash,
        reviewId: randomUUID(),
        reviewHash: 'a'.repeat(64),
        policyVersion: 'public-content-review-1',
        curationId: randomUUID(),
        curationVersion: 'public-content-curation-1',
      },
      settings: {
        visibility: 'public',
        authorMode: 'anonymous',
        indexable: false,
      },
    };
    await expect(
      publications().prepare(f.owner, input, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLICATION_CONFLICT' });
    await expect(
      new PublicationRepository(db).prepare(f.owner, input, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLICATION_DISABLED' });
    await approvePublicationFixture(db, f, 'unable_to_assess');
    await expect(
      publications().prepare(f.owner, input, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLICATION_CONFLICT' });
    expect(
      (
        await db.query('SELECT id FROM aw_publications WHERE user_id=$1', [
          f.owner,
        ])
      ).length,
    ).toBe(0);
  });
  it('prepares only a private final copy, verifies every reviewed fact and requires separate consent', async () => {
    const f = await ready('public'),
      q = publications(),
      key = randomUUID();
    const p = await q.prepare(f.owner, f.input, key);
    expect(await q.prepare(f.owner, f.input, key)).toEqual(p);
    expect(await q.prepare(f.owner, f.input, randomUUID())).toEqual(p);
    expect(await q.forBundle(f.owner, f.bundle.bundleId)).toBeNull();
    expect(hash(reviewedContent(p.snapshot))).toBe(f.bundle.contentHash);
    const curator = await f.curations.get(f.owner, f.bundle.bundleId);
    expect(await publicationPreviewForBundle(p, f.bundle, curator)).toEqual(p);
    await expect(
      publicationPreviewForBundle(
        { ...p, snapshotHash: 'b'.repeat(64) },
        f.bundle,
        curator,
      ),
    ).rejects.toThrow();
    await expect(
      q.confirm(
        f.owner,
        {
          previewId: p.previewId,
          previewHash: p.previewHash,
          acknowledged: false,
        },
        randomUUID(),
      ),
    ).rejects.toThrow();
    await expect(
      q.confirm(
        f.owner,
        {
          previewId: p.previewId,
          previewHash: 'b'.repeat(64),
          acknowledged: true,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLICATION_CONFLICT' });
    const view = await q.confirm(
      f.owner,
      {
        previewId: p.previewId,
        previewHash: p.previewHash,
        acknowledged: true,
      },
      randomUUID(),
    );
    expect(view.unlistedToken).toBeNull();
    expect(view.snapshot.classification).toBe('community');
    expect(view.snapshot.forkEnabled).toBe(false);
    expect(await verifiedOwnedPublication(view)).toEqual(view);
    expect(view.snapshot).toEqual(releasePublicContent(f.bundle.content, null));
  });
  it('reuses confirmation exactly once and never permits permission or Official spoofing', async () => {
    const f = await published('public'),
      q = publications();
    expect(await q.confirm(f.owner, f.confirm, f.key)).toEqual(f.view);
    expect(await q.confirm(f.owner, f.confirm, randomUUID())).toEqual(f.view);
    expect(
      (
        await db.query('SELECT id FROM aw_publications WHERE user_id=$1', [
          f.owner,
        ])
      ).length,
    ).toBe(1);
    await expect(
      q.prepare(f.owner, f.input, randomUUID()),
    ).rejects.toMatchObject({ code: 'PUBLICATION_CONFLICT' });
    await expect(
      q.confirm(f.owner, { ...f.confirm, previewHash: 'a'.repeat(64) }, f.key),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    for (const extra of [
      { official: true },
      { classification: 'official' },
      { ownerId: f.owner },
    ])
      expect(
        publicationPrepareRequestSchema.safeParse({ ...f.input, ...extra })
          .success,
      ).toBe(false);
    expect(
      publicationPrepareRequestSchema.safeParse({
        ...f.input,
        settings: { ...f.input.settings, indexable: true },
      }).success,
    ).toBe(false);
    expect(
      publicationConfirmRequestSchema.safeParse({
        ...f.confirm,
        settings: f.input.settings,
      }).success,
    ).toBe(false);
  });
  it('binds preparation and confirmation to the source revision and active consent', async () => {
    const f = await ready(),
      p = await publications().prepare(f.owner, f.input, randomUUID());
    const branch = await f.lives.branch(f.owner, f.created.branchId);
    await f.lives.choose(
      f.owner,
      branch.id,
      branch.revision,
      branch.pending_decision!.id,
      branch.pending_decision!.options[0]!.id,
      randomUUID(),
    );
    await expect(
      publications().confirm(
        f.owner,
        {
          previewId: p.previewId,
          previewHash: p.previewHash,
          acknowledged: true,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'LIFE_REVISION_CONFLICT' });
    const noConsent = await ready();
    await db.query('DELETE FROM ff_consents WHERE user_id=$1', [
      noConsent.owner,
    ]);
    await expect(
      publications().prepare(noConsent.owner, noConsent.input, randomUUID()),
    ).rejects.toMatchObject({ code: 'PRIVACY_ACKNOWLEDGEMENT_REQUIRED' });
  });
  it('requires a fresh final preview when expired and enforces immutable copy storage', async () => {
    const f = await ready(),
      q = publications(),
      original = await q.prepare(f.owner, f.input, randomUUID());
    const expiresAt = new Date(Date.now() - 60000).toISOString(),
      id = randomUUID(),
      { previewHash: _hash, ...value } = {
        ...original,
        previewId: id,
        expiresAt,
      };
    await db.query(
      'INSERT INTO aw_publication_previews(id,user_id,bundle_id,curation_id,binding,settings,snapshot,snapshot_hash,preview_hash,expires_at) SELECT $1,user_id,bundle_id,curation_id,binding,settings,snapshot,snapshot_hash,$2,$3 FROM aw_publication_previews WHERE id=$4',
      [id, hash(value), expiresAt, original.previewId],
    );
    await expect(
      q.confirm(
        f.owner,
        { previewId: id, previewHash: hash(value), acknowledged: true },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLICATION_PREVIEW_EXPIRED' });
    await expect(
      db.query(
        'UPDATE aw_publication_previews SET expires_at=now() WHERE id=$1',
        [id],
      ),
    ).rejects.toThrow(/immutable/i);
    const actual = await q.confirm(
      f.owner,
      {
        previewId: original.previewId,
        previewHash: original.previewHash,
        acknowledged: true,
      },
      randomUUID(),
    );
    await expect(
      db.query('UPDATE aw_publications SET snapshot=$1 WHERE id=$2', [
        {},
        actual.publicationId,
      ]),
    ).rejects.toThrow(/immutable/i);
    await expect(
      db.query("UPDATE aw_publications SET status='withdrawn' WHERE id=$1", [
        actual.publicationId,
      ]),
    ).rejects.toThrow(/invalid/i);
  });
  it('offers public handle credit only from the owned profile and binds changed credit to a new preview', async () => {
    const f = await ready('public'),
      input = {
        ...f.input,
        settings: { ...f.input.settings, authorMode: 'handle' },
      },
      q = publications();
    await expect(q.prepare(f.owner, input, randomUUID())).rejects.toMatchObject(
      { code: 'PUBLICATION_HANDLE_REQUIRED' },
    );
    await db.query(
      "INSERT INTO aw_social_profiles(user_id,handle,display_name,discoverability) VALUES($1,$2,'Private real name','private')",
      [f.owner, `test_${randomUUID().replaceAll('-', '').slice(0, 15)}`],
    );
    const p = await q.prepare(f.owner, input, randomUUID());
    expect(p.snapshot.author.handle).toMatch(/^test_/);
    expect(JSON.stringify(p.snapshot)).not.toContain('Private real name');
    await db.query('UPDATE aw_social_profiles SET handle=$1 WHERE user_id=$2', [
      `changed_${randomUUID().slice(0, 8)}`,
      f.owner,
    ]);
    await expect(
      q.confirm(
        f.owner,
        {
          previewId: p.previewId,
          previewHash: p.previewHash,
          acknowledged: true,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLICATION_CONFLICT' });
  });
  it('serves only the released safe projection and remains unchanged when the private source continues', async () => {
    const f = await published('public'),
      q = publications(),
      reader = await q.readPublic(f.view.slug);
    expect(publicationReaderSchema.parse(reader)).toEqual(reader);
    for (const privateValue of [
      f.owner,
      f.created.lifeId,
      f.created.branchId,
      f.bundle.bundleId,
      f.view.publicationId,
      f.view.snapshotHash,
      f.bundle.contentHash,
    ])
      expect(JSON.stringify(reader)).not.toContain(privateValue);
    const branch = await f.lives.branch(f.owner, f.created.branchId);
    await f.lives.choose(
      f.owner,
      branch.id,
      branch.revision,
      branch.pending_decision!.id,
      branch.pending_decision!.options[0]!.id,
      randomUUID(),
    );
    await f.lives.continue(
      f.owner,
      f.created.branchId,
      (await f.lives.branch(f.owner, branch.id)).revision,
      randomUUID(),
    );
    await f.jobs.fail((await f.jobs.claim())!, 'TECHNICAL_FIXTURE');
    expect(await q.readPublic(f.view.slug)).toEqual(reader);
    expect(await q.confirm(f.owner, f.confirm, f.key)).toEqual(f.view);
    expect((await q.list(f.owner))[0]).toEqual(f.view);
    await expect(
      new PublicationRepository(db).readPublic(f.view.slug),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('protects unlisted content from public routes and rotates the fragment credential without storing plaintext', async () => {
    const f = await published(),
      q = publications(),
      token = f.view.unlistedToken!;
    expect(token).toHaveLength(43);
    expect(publicationLink(f.view)).toBe(`/unlisted#${token}`);
    await expect(q.readPublic(f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    expect((await q.readUnlisted(token)).snapshot).toEqual(f.view.snapshot);
    await expect(q.readUnlisted('x'.repeat(43))).rejects.toMatchObject({
      status: 404,
    });
    const key = randomUUID(),
      next = await q.action(
        f.owner,
        f.view.publicationId,
        'rotate',
        actionInput(f.view),
        key,
      );
    expect(next.unlistedToken).not.toBe(token);
    expect(next.revision).toBe(2);
    expect(
      await q.action(
        f.owner,
        f.view.publicationId,
        'rotate',
        actionInput(f.view),
        key,
      ),
    ).toEqual(next);
    await expect(q.readUnlisted(token)).rejects.toMatchObject({ status: 404 });
    expect((await q.readUnlisted(next.unlistedToken!)).snapshot).toEqual(
      f.view.snapshot,
    );
    const storage =
      JSON.stringify(
        await db.query('SELECT * FROM aw_publications WHERE id=$1', [
          f.view.publicationId,
        ]),
      ) +
      JSON.stringify(
        await db.query('SELECT * FROM ff_idempotency WHERE user_id=$1', [
          f.owner,
        ]),
      ) +
      JSON.stringify(
        await db.query(
          'SELECT * FROM aw_publication_actions WHERE user_id=$1',
          [f.owner],
        ),
      );
    expect(storage).not.toContain(token);
    expect(storage).not.toContain(next.unlistedToken);
    const changedSecret = new PublicationRepository(db, {
      ...config,
      linkSecret: 'b'.repeat(64),
    });
    expect((await changedSecret.list(f.owner))[0]!.unlistedToken).toBeNull();
    expect(
      (await changedSecret.readUnlisted(next.unlistedToken!)).snapshot,
    ).toEqual(f.view.snapshot);
  });
  it('withdraws access even with feature disabled and never reactivates on old confirmation retries', async () => {
    const f = await published(),
      q = new PublicationRepository(db),
      key = randomUUID();
    const next = await q.action(
      f.owner,
      f.view.publicationId,
      'withdraw',
      actionInput(f.view),
      key,
    );
    expect(next.status).toBe('withdrawn');
    expect(next.unlistedToken).toBeNull();
    expect(
      await q.action(
        f.owner,
        f.view.publicationId,
        'withdraw',
        actionInput(f.view),
        key,
      ),
    ).toEqual(next);
    await expect(
      publications().readUnlisted(f.view.unlistedToken!),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (await publications().confirm(f.owner, f.confirm, f.key)).status,
    ).toBe('withdrawn');
    await expect(
      publications().action(
        f.owner,
        f.view.publicationId,
        'rotate',
        actionInput(next),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'PUBLICATION_CONFLICT' });
  });
  it('moderates a specific immutable copy and keeps operator decisions away from user HTTP', async () => {
    const f = await published('public'),
      q = publications(),
      input = {
        ...actionInput(f.view),
        publicationId: f.view.publicationId,
        action: 'hide',
        reasonCode: 'privacy',
        actorLabel: 'Technical operator',
      };
    await expect(
      q.moderate({ ...input, snapshotHash: 'b'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'PUBLICATION_CONFLICT' });
    const next = await q.moderate(input);
    expect(next.status).toBe('hidden');
    expect(await q.moderate(input)).toEqual(next);
    await expect(q.readPublic(f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    expect((await q.confirm(f.owner, f.confirm, f.key)).status).toBe('hidden');
    expect(
      (
        await http(
          `v2/publications/${f.view.publicationId}/moderate`,
          input,
          f.owner,
        )
      ).status,
    ).toBe(404);
    await expect(
      q.moderate({ ...input, actorLabel: 'Different operator' }),
    ).rejects.toMatchObject({ code: 'PUBLICATION_CONFLICT' });
    expect(
      await q.moderate({ ...input, revision: next.revision, action: 'remove' }),
    ).toMatchObject({ status: 'removed', revision: 3 });
    await expect(
      db.query(
        "UPDATE aw_publication_actions SET reason_code='other' WHERE publication_id=$1",
        [f.view.publicationId],
      ),
    ).rejects.toThrow(/immutable/i);
  });
  it('enforces authenticated ownership and anonymous reader cache/robot/referrer policy', async () => {
    const f = await published(),
      other = await fixture();
    expect((await http('v2/publications')).status).toBe(401);
    expect(
      (await http('v2/publications/confirm', f.confirm, other.owner)).status,
    ).toBe(404);
    expect(
      (
        await http(
          `v2/publications/${f.view.publicationId}/withdraw`,
          actionInput(f.view),
          other.owner,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await http(
          `v2/public-content-bundles/${f.bundle.bundleId}/publication`,
          undefined,
          other.owner,
        )
      ).status,
    ).toBe(200);
    expect(
      await (
        await http(
          `v2/public-content-bundles/${f.bundle.bundleId}/publication`,
          undefined,
          other.owner,
        )
      ).json(),
    ).toEqual({ enabled: true, publication: null });
    const response = await fetch(`${base}/api/public/unlisted`, {
      headers: { Authorization: `Bearer ${f.view.unlistedToken}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(JSON.stringify(await response.json())).not.toContain(
      f.view.unlistedToken,
    );
    expect((await http(`public/lives/${f.view.slug}`)).status).toBe(404);
  });
  it('includes owner export, invalidates on deleting marker, and never restores old grants on deletion recovery', async () => {
    const f = await published('public'),
      q = publications(),
      exported = await repo.exportAccount(f.owner);
    for (const table of ['aw_publication_previews', 'aw_publications'])
      expect(exported[table]).toHaveLength(1);
    await repo.markDeleting(f.owner);
    await expect(q.readPublic(f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      (
        await db.query(
          'SELECT status,token_hash FROM aw_publications WHERE user_id=$1',
          [f.owner],
        )
      )[0],
    ).toEqual({ status: 'withdrawn', token_hash: null });
    await repo.restoreActive(f.owner);
    await expect(q.readPublic(f.view.slug)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      (await repo.exportAccount(f.owner)).aw_publication_actions,
    ).toHaveLength(1);
    await repo.deleteAccountData(f.owner);
    for (const table of [
      'aw_publication_previews',
      'aw_publications',
      'aw_publication_actions',
    ])
      expect(
        await db.query(`SELECT id FROM ${table} WHERE user_id=$1`, [f.owner]),
      ).toEqual([]);
  });
  it('cascades on source life removal and exposes no direct Supabase table grants', async () => {
    const f = await published();
    await db.query('DELETE FROM aw_lives WHERE id=$1 AND user_id=$2', [
      f.created.lifeId,
      f.owner,
    ]);
    await expect(
      publications().readUnlisted(f.view.unlistedToken!),
    ).rejects.toMatchObject({ status: 404 });
    for (const table of [
      'aw_publication_previews',
      'aw_publications',
      'aw_publication_actions',
    ]) {
      expect(
        await db.query(`SELECT id FROM ${table} WHERE user_id=$1`, [f.owner]),
      ).toEqual([]);
      const [row] = await db.query(
        "SELECT c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'INSERT') AS client FROM pg_class c WHERE c.oid=$1::regclass",
        [table],
      );
      expect(row).toEqual({ rls: true, anon: false, client: false });
    }
  });
  it('validates independent secret/configuration and rejects malformed or private release contracts', () => {
    const env = {
      flag: process.env.PUBLICATIONS_ENABLED,
      secret: process.env.PUBLICATION_LINK_SECRET,
    };
    try {
      delete process.env.PUBLICATIONS_ENABLED;
      delete process.env.PUBLICATION_LINK_SECRET;
      expect(publicationConfigFromEnv()).toEqual({
        enabled: false,
        linkSecret: '',
      });
      process.env.PUBLICATIONS_ENABLED = 'true';
      expect(publicationConfigFromEnv).toThrow();
      process.env.PUBLICATION_LINK_SECRET = config.linkSecret;
      expect(publicationConfigFromEnv()).toEqual(config);
      process.env.PUBLICATIONS_ENABLED = 'yes';
      expect(publicationConfigFromEnv).toThrow();
    } finally {
      if (env.flag === undefined) delete process.env.PUBLICATIONS_ENABLED;
      else process.env.PUBLICATIONS_ENABLED = env.flag;
      if (env.secret === undefined) delete process.env.PUBLICATION_LINK_SECRET;
      else process.env.PUBLICATION_LINK_SECRET = env.secret;
    }
  });
});
