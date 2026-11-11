// Isolated technical receipt fixtures only: never an actual AI seed or public editorial approval.
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  officialPublicationPrepareRequestSchema,
  officialPublicationReaderSchema,
  publicationReaderSchema,
} from '@future-flow/contracts';
import { DomainError, hash } from '@future-flow/core';
import {
  OfficialPublicationRepository,
  OfficialLifeRepository,
  officialPublicationConfigFromEnv,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
import {
  officialLifeFixture,
  processOfficialFixture,
  officialBundleFixture,
  officialGrant,
} from './official-life-fixtures';
import {
  officialPublicationPreviewForBundle,
  verifiedOwnedOfficialPublication,
  reviewedOfficialContent,
  officialPublicationLink,
} from '../apps/web/lib/official-publication';

let engine: PGlite, db: Database, app: INestApplication, base: string;
const config = { enabled: true, linkSecret: 'b'.repeat(64) },
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
  const { Repository } = await import('@future-flow/database');
  app = await createApp(
    new Repository(db),
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
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { enabled: false, linkSecret: '' },
    config,
  );
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  await engine?.close();
});
const publications = () => new OfficialPublicationRepository(db, config);
async function ready(
  visibility: 'public' | 'unlisted' = 'unlisted',
  granted = true,
) {
  const f = await officialLifeFixture(db);
  users.add(f.owner);
  const created = await f.official.start(f.owner, f.startRequest, randomUUID());
  await processOfficialFixture(db, f.owner, created.jobId);
  const content = await officialBundleFixture(db, f, created);
  const inspected = await f.official.inspect(f.owner, content.bundle.bundleId);
  const source = granted
    ? await f.official.grant(f.owner, officialGrant(inspected))
    : inspected.view;
  const input = {
    binding: {
      ...inspected.evidence.binding,
      sourceVersion: 'official-life-source-1',
      grantId: source.grant?.id ?? randomUUID(),
      evidenceHash: inspected.evidenceHash,
    },
    settings: { visibility, authorMode: 'anonymous', indexable: false },
  };
  return { ...f, created, content, source, input };
}
async function published(visibility: 'public' | 'unlisted' = 'unlisted') {
  const f = await ready(visibility),
    preview = await publications().prepare(f.owner, f.input, randomUUID());
  const confirm = {
      previewId: preview.previewId,
      previewHash: preview.previewHash,
      acknowledged: true,
    },
    key = randomUUID();
  const view = await publications().confirm(f.owner, confirm, key);
  return { ...f, preview, confirm, key, view };
}
const action = (v: { revision: number; snapshotHash: string }) => ({
  revision: v.revision,
  snapshotHash: v.snapshotHash,
  acknowledged: true,
});
const revoke = (f: Awaited<ReturnType<typeof ready>>) =>
  f.official.revoke(f.owner, {
    grantId: f.source.grant!.id,
    contentHash: f.content.bundle.contentHash,
    reasonCode: 'quality',
    actorLabel: 'Isolated technical revocation',
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
describe.sequential(
  'separate Official publication with exact grant and confirmation',
  () => {
    it('is default-off, refuses self-assigned badges and never creates a missing source grant', async () => {
      const f = await ready('public', false);
      await expect(
        new OfficialPublicationRepository(db).prepare(
          f.owner,
          f.input,
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'OFFICIAL_PUBLICATION_DISABLED' });
      await expect(
        publications().prepare(f.owner, f.input, randomUUID()),
      ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED' });
      expect(
        await publications().sourceForBundle(
          f.owner,
          f.content.bundle.bundleId,
        ),
      ).toBeNull();
      expect(
        officialPublicationPrepareRequestSchema.safeParse({
          ...f.input,
          classification: 'official',
        }).success,
      ).toBe(false);
      expect(
        await db.query(
          'SELECT id FROM aw_official_life_sources WHERE user_id=$1',
          [f.owner],
        ),
      ).toHaveLength(0);
      await expect(
        new OfficialLifeRepository(db).grant(
          f.owner,
          officialGrant(
            await f.official.inspect(f.owner, f.content.bundle.bundleId),
          ),
        ),
      ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_DISABLED' });
    });
    it('previews the exact reviewed copy and requires separate acknowledgement before publishing', async () => {
      const f = await ready('public'),
        q = publications(),
        key = randomUUID(),
        p = await q.prepare(f.owner, f.input, key);
      expect(await q.prepare(f.owner, f.input, key)).toEqual(p);
      expect(await q.prepare(f.owner, f.input, randomUUID())).toEqual(p);
      expect(await q.forBundle(f.owner, f.content.bundle.bundleId)).toBeNull();
      expect(hash(reviewedOfficialContent(p.snapshot))).toBe(
        f.content.bundle.contentHash,
      );
      expect(p.snapshot.classification).toBe('official');
      expect(p.snapshot.forkEnabled).toBe(false);
      const curator = await f.content.curations.get(
        f.owner,
        f.content.bundle.bundleId,
      );
      expect(
        await officialPublicationPreviewForBundle(
          p,
          f.content.bundle,
          curator,
          f.source,
        ),
      ).toEqual(p);
      await expect(
        officialPublicationPreviewForBundle(
          { ...p, binding: { ...p.binding, evidenceHash: 'c'.repeat(64) } },
          f.content.bundle,
          curator,
          f.source,
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
            previewHash: 'c'.repeat(64),
            acknowledged: true,
          },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'OFFICIAL_PUBLICATION_CONFLICT' });
      const view = await q.confirm(
        f.owner,
        {
          previewId: p.previewId,
          previewHash: p.previewHash,
          acknowledged: true,
        },
        randomUUID(),
      );
      expect(await verifiedOwnedOfficialPublication(view)).toEqual(view);
      expect(officialPublicationLink(view)).toBe(
        `/official-lives/${view.slug}`,
      );
      const publicView = await q.readPublic(view.slug);
      expect(
        officialPublicationReaderSchema.safeParse(publicView).success,
      ).toBe(true);
      expect(publicationReaderSchema.safeParse(publicView).success).toBe(false);
      const text = JSON.stringify(publicView);
      for (const privateValue of [
        f.owner,
        f.created.lifeId,
        f.created.branchId,
        f.source.grant!.id,
        f.content.bundle.bundleId,
        f.input.binding.evidenceHash,
      ])
        expect(text).not.toContain(privateValue);
      expect(Object.keys(publicView).sort()).toEqual([
        'indexable',
        'publishedAt',
        'slug',
        'snapshot',
        'visibility',
      ]);
      expect(
        await db.query('SELECT id FROM aw_publications WHERE user_id=$1', [
          f.owner,
        ]),
      ).toHaveLength(0);
    });
    it('rejects mismatched evidence, cross-owner use, withdrawn sources and obsolete private copies before Confirm', async () => {
      const f = await ready(),
        other = await ready();
      await expect(
        publications().prepare(
          f.owner,
          {
            ...f.input,
            binding: { ...f.input.binding, evidenceHash: 'e'.repeat(64) },
          },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'OFFICIAL_PUBLICATION_CONFLICT' });
      await expect(
        publications().prepare(other.owner, f.input, randomUUID()),
      ).rejects.toMatchObject({ status: 404 });
      const p = await publications().prepare(f.owner, f.input, randomUUID());
      await revoke(f);
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
      ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED' });
      const g = await ready(),
        gp = await publications().prepare(g.owner, g.input, randomUUID()),
        branch = await g.content.lives.branch(g.owner, g.created.branchId),
        d = branch.pending_decision!;
      await g.content.lives.choose(
        g.owner,
        branch.id,
        branch.revision,
        d.id,
        d.options[0]!.id,
        randomUUID(),
      );
      await expect(
        publications().confirm(
          g.owner,
          {
            previewId: gp.previewId,
            previewHash: gp.previewHash,
            acknowledged: true,
          },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'LIFE_REVISION_CONFLICT' });
    });
    it('keeps the released copy immutable after private continuation while rejecting a new outdated preview', async () => {
      const f = await published('public'),
        q = publications(),
        b = await f.content.lives.branch(f.owner, f.created.branchId),
        d = b.pending_decision!;
      await f.content.lives.choose(
        f.owner,
        b.id,
        b.revision,
        d.id,
        d.options[0]!.id,
        randomUUID(),
      );
      const ready = await f.content.lives.branch(f.owner, b.id),
        next = await f.content.lives.continue(
          f.owner,
          b.id,
          ready.revision,
          randomUUID(),
        );
      await processOfficialFixture(db, f.owner, next.jobId);
      expect((await q.readPublic(f.view.slug)).snapshot).toEqual(
        f.view.snapshot,
      );
      expect(await q.confirm(f.owner, f.confirm, f.key)).toEqual(f.view);
      await expect(
        q.prepare(f.owner, f.input, randomUUID()),
      ).rejects.toMatchObject({ code: 'LIFE_REVISION_CONFLICT' });
    });
    it('rotates unlisted bearer links, never serves them by slug, and withdraws without replay reactivation', async () => {
      const f = await published(),
        q = publications(),
        old = f.view.unlistedToken!,
        key = randomUUID();
      expect(officialPublicationLink(f.view)).toBe(`/official-unlisted#${old}`);
      await expect(q.readPublic(f.view.slug)).rejects.toMatchObject({
        status: 404,
      });
      expect((await q.readUnlisted(old)).visibility).toBe('unlisted');
      const rotated = await q.action(
        f.owner,
        f.view.publicationId,
        'rotate',
        action(f.view),
        key,
      );
      expect(rotated.unlistedToken).not.toBe(old);
      expect(
        await q.action(
          f.owner,
          f.view.publicationId,
          'rotate',
          action(f.view),
          key,
        ),
      ).toEqual(rotated);
      await expect(q.readUnlisted(old)).rejects.toMatchObject({ status: 404 });
      const withdrawn = await q.action(
        f.owner,
        rotated.publicationId,
        'withdraw',
        action(rotated),
        randomUUID(),
      );
      expect(withdrawn.status).toBe('withdrawn');
      expect(withdrawn.unlistedToken).toBeNull();
      await expect(
        q.readUnlisted(rotated.unlistedToken!),
      ).rejects.toMatchObject({ status: 404 });
      expect((await q.confirm(f.owner, f.confirm, f.key)).status).toBe(
        'withdrawn',
      );
      const stored = JSON.stringify(
        await db.query('SELECT response FROM ff_idempotency WHERE user_id=$1', [
          f.owner,
        ]),
      );
      expect(stored).not.toContain(old);
      expect(stored).not.toContain(rotated.unlistedToken!);
    });
    it('withdraws public and hidden copies atomically when either trusted origin is revoked', async () => {
      const f = await published('public');
      await revoke(f);
      await expect(
        publications().readPublic(f.view.slug),
      ).rejects.toMatchObject({ status: 404 });
      expect(
        (await publications().forBundle(f.owner, f.content.bundle.bundleId))
          ?.status,
      ).toBe('withdrawn');
      const g = await published(),
        moderation = {
          ...action(g.view),
          publicationId: g.view.publicationId,
          action: 'hide',
          reasonCode: 'privacy',
          actorLabel: 'Isolated technical moderator',
        };
      expect((await publications().moderate(moderation)).status).toBe('hidden');
      await g.release.revoke({
        grantId: g.source.grant ? g.startRequest.scenarioGrantId : '',
        templateHash: g.version.templateHash,
        reasonCode: 'quality',
        actorLabel: 'Isolated technical parent revocation',
        acknowledged: true,
      });
      const view = (await publications().forBundle(
        g.owner,
        g.content.bundle.bundleId,
      ))!;
      expect(view.status).toBe('withdrawn');
      expect(view.unlistedToken).toBeNull();
      const audits = await db.query(
        'SELECT reason_code FROM aw_official_publication_actions WHERE publication_id=$1 ORDER BY revision',
        [view.publicationId],
      );
      expect(audits.map((a) => a.reason_code)).toEqual([
        'privacy',
        'source_revocation',
      ]);
    });
    it('hides readers at the account marker, exports private records and cascades without restoring release on recovery', async () => {
      const f = await published('public'),
        exported = await f.repo.exportAccount(f.owner);
      expect(exported.aw_official_publications).toHaveLength(1);
      expect(exported.aw_official_publication_previews).toHaveLength(1);
      await f.repo.markDeleting(f.owner);
      await expect(
        publications().readPublic(f.view.slug),
      ).rejects.toMatchObject({ status: 404 });
      await f.repo.restoreActive(f.owner);
      expect(
        (await publications().confirm(f.owner, f.confirm, f.key)).status,
      ).toBe('withdrawn');
      expect(
        (
          await db.query(
            'SELECT reason_code FROM aw_official_publication_actions WHERE publication_id=$1',
            [f.view.publicationId],
          )
        )[0]?.reason_code,
      ).toBe('account_deletion');
      await f.repo.deleteAccountData(f.owner);
      for (const table of [
        'aw_official_publication_previews',
        'aw_official_publications',
        'aw_official_publication_actions',
      ])
        expect(
          await db.query(`SELECT id FROM ${table} WHERE user_id=$1`, [f.owner]),
        ).toHaveLength(0);
    });
    it('protects immutable bytes and private RLS, and keeps moderation operator-only', async () => {
      const f = await published('public');
      await expect(
        db.query(
          'UPDATE aw_official_publications SET snapshot_hash=$1,revision=revision+1 WHERE id=$2',
          ['f'.repeat(64), f.view.publicationId],
        ),
      ).rejects.toThrow();
      await expect(
        db.query(
          "UPDATE aw_official_publication_previews SET binding='{}' WHERE id=$1",
          [f.preview.previewId],
        ),
      ).rejects.toThrow();
      const moderated = await publications().moderate({
        ...action(f.view),
        publicationId: f.view.publicationId,
        action: 'remove',
        reasonCode: 'content',
        actorLabel: 'Isolated technical moderator',
      });
      expect(moderated.status).toBe('removed');
      expect(
        (await publications().confirm(f.owner, f.confirm, f.key)).status,
      ).toBe('removed');
      for (const role of ['anon', 'authenticated'])
        for (const table of [
          'aw_official_publication_previews',
          'aw_official_publications',
          'aw_official_publication_actions',
        ]) {
          const [row] = await db.query(
            "SELECT has_table_privilege($1,$2,'SELECT') AS permitted,relrowsecurity FROM pg_class WHERE oid=$2::regclass",
            [role, table],
          );
          expect(row).toMatchObject({ permitted: false, relrowsecurity: true });
        }
    });
    it('routes authenticated prepare/Confirm separately and exposes only the allowlisted anonymous reader', async () => {
      const f = await ready('public');
      expect(
        (await http('v2/official-publication-previews', f.input)).status,
      ).toBe(401);
      const status = await http(
        `v2/public-content-bundles/${f.content.bundle.bundleId}/official-publication`,
        undefined,
        f.owner,
      );
      expect((await status.json()).source.grant.id).toBe(f.source.grant!.id);
      const p = await (
        await http('v2/official-publication-previews', f.input, f.owner)
      ).json();
      expect(
        (
          await http(
            'v2/official-publications/confirm',
            {
              previewId: p.previewId,
              previewHash: p.previewHash,
              acknowledged: false,
            },
            f.owner,
          )
        ).status,
      ).toBe(422);
      const response = await http(
        'v2/official-publications/confirm',
        {
          previewId: p.previewId,
          previewHash: p.previewHash,
          acknowledged: true,
        },
        f.owner,
      );
      expect(response.status).toBe(201);
      const view = await response.json();
      const reader = await http(`public/official-lives/${view.slug}`);
      expect(reader.status).toBe(200);
      expect(reader.headers.get('cache-control')).toBe('no-store');
      expect(
        officialPublicationReaderSchema.safeParse(await reader.json()).success,
      ).toBe(true);
      expect((await http(`public/lives/${view.slug}`)).status).toBe(422);
      expect(
        (await http('v2/official-publications/grant', {}, f.owner)).status,
      ).toBe(404);
      expect(
        (await http('v2/official-publications/moderate', {}, f.owner)).status,
      ).toBe(404);
      await http(
        `v2/official-publications/${view.publicationId}/withdraw`,
        action(view),
        f.owner,
      );
      expect((await http(`public/official-lives/${view.slug}`)).status).toBe(
        404,
      );
    });
    it('expires an unconfirmed preview but keeps an already released copy readable after preparation expires', async () => {
      const f = await ready('public'),
        q = publications(),
        p = await q.prepare(f.owner, f.input, randomUUID());
      const { previewHash: _hash, ...value } = p;
      const expiresAt = new Date(Date.now() - 60000).toISOString(),
        expiredHash = hash({ ...value, expiresAt });
      // Move only this isolated test clock; production preview/source bytes stay immutable.
      await engine.exec(
        'ALTER TABLE aw_official_publication_previews DISABLE TRIGGER aw_official_publication_preview_immutable',
      );
      try {
        await db.query(
          'UPDATE aw_official_publication_previews SET expires_at=$1,preview_hash=$2 WHERE id=$3',
          [expiresAt, expiredHash, p.previewId],
        );
      } finally {
        await engine.exec(
          'ALTER TABLE aw_official_publication_previews ENABLE TRIGGER aw_official_publication_preview_immutable',
        );
      }
      await expect(
        q.confirm(
          f.owner,
          {
            previewId: p.previewId,
            previewHash: expiredHash,
            acknowledged: true,
          },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'OFFICIAL_PUBLICATION_PREVIEW_EXPIRED' });
      const g = await published('public');
      await engine.exec(
        'ALTER TABLE aw_publication_drafts DISABLE TRIGGER aw_publication_drafts_immutable',
      );
      try {
        await db.query(
          'UPDATE aw_publication_drafts SET expires_at=$1 WHERE id=$2',
          [expiresAt, g.content.preview.draftId],
        );
      } finally {
        await engine.exec(
          'ALTER TABLE aw_publication_drafts ENABLE TRIGGER aw_publication_drafts_immutable',
        );
      }
      expect((await q.readPublic(g.view.slug)).snapshot).toEqual(
        g.view.snapshot,
      );
      expect(await q.confirm(g.owner, g.confirm, g.key)).toEqual(g.view);
      expect(
        await q.sourceForBundle(g.owner, g.content.bundle.bundleId),
      ).toBeNull();
      await revoke(g);
      await expect(q.readPublic(g.view.slug)).rejects.toMatchObject({
        status: 404,
      });
    });
    it('requires strict independent release flag and a valid protected link secret', () => {
      const oldFlag = process.env.OFFICIAL_PUBLICATIONS_ENABLED,
        oldSecret = process.env.PUBLICATION_LINK_SECRET;
      try {
        delete process.env.OFFICIAL_PUBLICATIONS_ENABLED;
        delete process.env.PUBLICATION_LINK_SECRET;
        expect(officialPublicationConfigFromEnv()).toEqual({
          enabled: false,
          linkSecret: '',
        });
        process.env.OFFICIAL_PUBLICATIONS_ENABLED = 'true';
        expect(() => officialPublicationConfigFromEnv()).toThrow();
        process.env.PUBLICATION_LINK_SECRET = 'b'.repeat(64);
        expect(officialPublicationConfigFromEnv().enabled).toBe(true);
        process.env.OFFICIAL_PUBLICATIONS_ENABLED = '1';
        expect(() => officialPublicationConfigFromEnv()).toThrow();
      } finally {
        if (oldFlag === undefined)
          delete process.env.OFFICIAL_PUBLICATIONS_ENABLED;
        else process.env.OFFICIAL_PUBLICATIONS_ENABLED = oldFlag;
        if (oldSecret === undefined) delete process.env.PUBLICATION_LINK_SECRET;
        else process.env.PUBLICATION_LINK_SECRET = oldSecret;
      }
    });
  },
);
