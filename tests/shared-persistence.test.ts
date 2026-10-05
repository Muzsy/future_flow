import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import {
  Repository,
  SharedContextRepository,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  deleteAccount,
  recoverAccountDeletion,
} from '../apps/api/src/account-deletion';
import {
  sharedAdapter,
  sharedParticipant,
  testInviteSecret,
} from './shared-fixtures';

let engine: PGlite,
  db: Database,
  shared: SharedContextRepository,
  repo: Repository;
type Person = Awaited<ReturnType<typeof sharedParticipant>>;
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await applyMigrations(engine);
  db = sharedAdapter(engine);
  shared = new SharedContextRepository(db, testInviteSecret);
  repo = new Repository(db);
});
afterAll(async () => {
  await engine?.close();
});
async function group(person: Person) {
  return shared.create(
    person.id,
    {
      type: 'friend_group',
      title: 'Private weekend group',
      branchId: person.branchId,
      revision: person.revision,
      sharingAcknowledged: true,
    },
    randomUUID(),
  );
}
async function invitation(
  owner: Person,
  contextId: string,
  targetUserId?: string,
) {
  const c = await shared.detail(owner.id, contextId);
  return shared.createInvite(
    owner.id,
    contextId,
    { contextRevision: c.revision, ...(targetUserId ? { targetUserId } : {}) },
    randomUUID(),
  );
}
async function accept(
  person: Person,
  i: Awaited<ReturnType<typeof invitation>>,
  key = randomUUID(),
) {
  const p = await shared.previewInvite(person.id, i.token);
  return shared.acceptInvite(
    person.id,
    i.inviteId,
    {
      token: i.token,
      branchId: person.branchId,
      revision: person.revision,
      contextRevision: p.contextRevision,
      sharingAcknowledged: true,
    },
    key,
  );
}
describe.sequential('Shared Context private foundation persistence', () => {
  it('keeps private account export and deletion usable before the additive Shared migrations are applied', async () => {
    const old = new PGlite();
    try {
      for (const name of readdirSync('database/migrations')
        .filter((n) => /^00[1-7]_.*\.sql$/.test(n))
        .sort())
        await old.exec(readFileSync('database/migrations/' + name, 'utf8'));
      const legacy = new Repository(sharedAdapter(old)),
        id = randomUUID();
      await legacy.ensureUser(id);
      await legacy.acceptPrivacy(id);
      const exported = await legacy.exportAccount(id);
      expect(exported.shared).toBeNull();
      expect(exported.ff_consents).toHaveLength(1);
      await legacy.markDeleting(id);
      await legacy.confirmAuthDeleted(id);
      await legacy.deleteAccountData(id);
      expect(
        (await old.query('SELECT id FROM ff_users WHERE id=$1', [id])).rows,
      ).toEqual([]);
    } finally {
      await old.close();
    }
  });
  it('requires privacy before storing a social profile and rejects handle/private field injection', async () => {
    const u = randomUUID();
    await repo.ensureUser(u);
    const profile = {
      handle: 'privacy_check',
      displayName: 'Alias',
      discoverability: 'private',
    };
    await expect(shared.saveSocialProfile(u, profile)).rejects.toMatchObject({
      code: 'PRIVACY_ACKNOWLEDGEMENT_REQUIRED',
    });
    await repo.acceptPrivacy(u);
    await shared.saveSocialProfile(u, profile);
    await expect(
      shared.saveSocialProfile(u, { ...profile, tier: 'world' }),
    ).rejects.toThrow();
    const other = await sharedParticipant(db);
    await expect(
      shared.saveSocialProfile(other.id, profile),
    ).rejects.toMatchObject({ code: 'SHARED_HANDLE_UNAVAILABLE' });
  });
  it('defaults missing/expired entitlement to Free and commits nothing on rejection', async () => {
    const u = await sharedParticipant(db, 'free');
    await expect(group(u)).rejects.toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
    });
    await db.query(
      "INSERT INTO aw_user_entitlements(user_id,tier,source,valid_until) VALUES($1,'world','test',now()-interval '1 second')",
      [u.id],
    );
    expect(await shared.tier(u.id)).toBe('free');
    expect(await shared.list(u.id)).toEqual([]);
  });
  it('binds an owned English branch, counts the creator slot and preserves create idempotency', async () => {
    const u = await sharedParticipant(db),
      outsider = await sharedParticipant(db);
    await expect(
      shared.create(
        u.id,
        {
          type: 'friend_group',
          title: 'Friends',
          branchId: outsider.branchId,
          revision: outsider.revision,
          sharingAcknowledged: true,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    const input = {
        type: 'friend_group' as const,
        title: 'Friends',
        branchId: u.branchId,
        revision: u.revision,
        sharingAcknowledged: true as const,
      },
      key = randomUUID();
    const created = await shared.create(u.id, input, key);
    expect(await shared.create(u.id, input, key)).toEqual(created);
    await expect(
      shared.create(u.id, { ...input, title: 'Different' }, key),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(group(u)).rejects.toMatchObject({
      code: 'SHARED_CONTEXT_LIMIT',
    });
    const c = await shared.detail(u.id, created.contextId);
    expect(c.status).toBe('inviting');
    expect(c.members[0]!.interactionProfile).toEqual({
      displayName: 'Shared alias',
      ageBand: null,
      country: null,
      occupationLabel: null,
      sharedRole: null,
    });
    await expect(
      shared.detail(outsider.id, created.contextId),
    ).rejects.toMatchObject({ code: 'SHARED_CONTEXT_NOT_FOUND' });
  });
  it('never stores invitation bearer tokens, including in idempotency JSON; retries return the same invitation', async () => {
    const u = await sharedParticipant(db),
      c = await group(u),
      key = randomUUID();
    const input = { contextRevision: 0 };
    const i = await shared.createInvite(u.id, c.contextId, input, key);
    expect(i.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await shared.createInvite(u.id, c.contextId, input, key)).toEqual(i);
    const rows = await db.query('SELECT * FROM aw_shared_invites WHERE id=$1', [
      i.inviteId,
    ]);
    const cached = await db.query(
      'SELECT * FROM ff_idempotency WHERE user_id=$1',
      [u.id],
    );
    expect(JSON.stringify([...rows, ...cached])).not.toContain(i.token);
    expect((await shared.detail(u.id, c.contextId)).revision).toBe(1);
    const other = await sharedParticipant(db, 'free');
    expect(await shared.previewInvite(other.id, i.token)).toMatchObject({
      contextId: c.contextId,
      title: 'Private weekend group',
    });
    await expect(accept(other, i)).rejects.toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
    });
  });
  it('uses explicit token, recipient, branch revision and context revision before accepting exactly once', async () => {
    const a = await sharedParticipant(db),
      b = await sharedParticipant(db),
      wrong = await sharedParticipant(db);
    const c = await group(a),
      i = await invitation(a, c.contextId, b.id),
      key = randomUUID();
    await expect(shared.previewInvite(wrong.id, i.token)).rejects.toMatchObject(
      { code: 'SHARED_INVITE_INVALID' },
    );
    await expect(
      shared.previewInvite(b.id, 'A'.repeat(43)),
    ).rejects.toMatchObject({ code: 'SHARED_INVITE_INVALID' });
    await expect(
      shared.acceptInvite(
        b.id,
        i.inviteId,
        {
          token: i.token,
          branchId: b.branchId,
          revision: b.revision,
          contextRevision: 0,
          sharingAcknowledged: true,
        },
        key,
      ),
    ).rejects.toMatchObject({ code: 'SHARED_REVISION_CONFLICT' });
    await expect(
      shared.acceptInvite(
        b.id,
        i.inviteId,
        {
          token: i.token,
          branchId: b.branchId,
          revision: 99,
          contextRevision: 1,
          sharingAcknowledged: true,
        },
        key,
      ),
    ).rejects.toMatchObject({ code: 'LIFE_REVISION_CONFLICT' });
    const input = {
      token: i.token,
      branchId: b.branchId,
      revision: b.revision,
      contextRevision: 1,
      sharingAcknowledged: true as const,
    };
    const result = await shared.acceptInvite(b.id, i.inviteId, input, key);
    expect(await shared.acceptInvite(b.id, i.inviteId, input, key)).toEqual(
      result,
    );
    await expect(
      shared.acceptInvite(b.id, i.inviteId, input, randomUUID()),
    ).rejects.toMatchObject({ code: 'SHARED_INVITE_ALREADY_USED' });
    expect((await shared.detail(a.id, c.contextId)).members).toHaveLength(2);
    expect((await shared.detail(a.id, c.contextId)).status).toBe('active');
  });
  it('rejects expired, revoked and blocked invites; a bearer reader cannot decline somebody else’s link', async () => {
    const a = await sharedParticipant(db),
      b = await sharedParticipant(db),
      c = await group(a);
    const expired = await invitation(a, c.contextId);
    await db.query(
      "UPDATE aw_shared_invites SET expires_at=now()-interval '1 second' WHERE id=$1",
      [expired.inviteId],
    );
    await expect(
      shared.previewInvite(b.id, expired.token),
    ).rejects.toMatchObject({ code: 'SHARED_INVITE_EXPIRED' });
    const revoked = await invitation(a, c.contextId);
    await shared.revokeInvite(
      a.id,
      c.contextId,
      revoked.inviteId,
      revoked.revision,
      randomUUID(),
    );
    await expect(accept(b, revoked)).rejects.toMatchObject({
      code: 'SHARED_INVITE_ALREADY_USED',
    });
    const link = await invitation(a, c.contextId);
    await expect(
      shared.declineInvite(b.id, link.inviteId, link.token, randomUUID()),
    ).rejects.toMatchObject({ code: 'SHARED_PERMISSION_DENIED' });
    await db.query(
      'INSERT INTO aw_user_blocks(user_id,blocked_user_id) VALUES($1,$2)',
      [b.id, a.id],
    );
    await expect(shared.previewInvite(b.id, link.token)).rejects.toMatchObject({
      code: 'SHARED_BLOCKED',
    });
    await expect(
      shared.createInvite(
        a.id,
        c.contextId,
        { contextRevision: link.revision, targetUserId: b.id },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'SHARED_BLOCKED' });
  });
  it('allows an explicitly targeted recipient to decline without consuming a slot', async () => {
    const a = await sharedParticipant(db),
      b = await sharedParticipant(db),
      c = await group(a),
      i = await invitation(a, c.contextId, b.id),
      key = randomUUID();
    expect(await shared.declineInvite(b.id, i.inviteId, i.token, key)).toEqual({
      declined: true,
    });
    expect(await shared.declineInvite(b.id, i.inviteId, i.token, key)).toEqual({
      declined: true,
    });
    expect(await shared.list(b.id)).toEqual([]);
  });
  it('accepts owned branches on different days in the same month without advancing either personal branch', async () => {
    const a = await sharedParticipant(db),
      b = await sharedParticipant(db),
      c = await group(a),
      i = await invitation(a, c.contextId),
      later = b.date.slice(0, 8) + '28';
    await db.query(
      "UPDATE aw_branches SET state=jsonb_set(state,'{effectiveAt}',to_jsonb($2::text)) WHERE id=$1",
      [b.branchId, later],
    );
    const before = await db.query(
      'SELECT id,state,revision FROM aw_branches WHERE id=ANY($1::uuid[]) ORDER BY id',
      [[a.branchId, b.branchId]],
    );
    await accept(b, i);
    expect((await shared.detail(a.id, c.contextId)).simulationAt).toBe(later);
    expect(
      await db.query(
        'SELECT id,state,revision FROM aw_branches WHERE id=ANY($1::uuid[]) ORDER BY id',
        [[a.branchId, b.branchId]],
      ),
    ).toEqual(before);
  });
  it('fails closed on different simulation months and already-advanced participants', async () => {
    const a = await sharedParticipant(db),
      b = await sharedParticipant(db),
      c = await group(a),
      i = await invitation(a, c.contextId);
    await db.query(
      "UPDATE aw_branches SET state=jsonb_set(state,'{effectiveAt}',to_jsonb((($2::date+interval '1 month')::date)::text)) WHERE id=$1",
      [b.branchId, b.date],
    );
    await expect(accept(b, i)).rejects.toMatchObject({
      code: 'SHARED_TIME_MISMATCH',
    });
    await db.query(
      "UPDATE aw_branches SET state=jsonb_set(state,'{effectiveAt}',to_jsonb($2::text)) WHERE id=$1",
      [b.branchId, b.date],
    );
    await db.query(
      "UPDATE aw_branches SET state=jsonb_set(state,'{effectiveAt}',to_jsonb((($2::date+interval '1 month')::date)::text)) WHERE id=$1",
      [a.branchId, a.date],
    );
    await expect(accept(b, i)).rejects.toMatchObject({
      code: 'SHARED_TIME_MISMATCH',
    });
  });
  it('exposes only the member allowlist, own branch references and own export projections', async () => {
    const a = await sharedParticipant(db, 'explorer', 'Alice alias'),
      b = await sharedParticipant(db, 'explorer', 'Bob alias'),
      c = await group(a);
    await accept(b, await invitation(a, c.contextId));
    const text = JSON.stringify(await shared.detail(a.id, c.contextId));
    for (const forbidden of [
      b.id,
      b.branchId,
      b.lifeId,
      'Private goal never shared',
      'Private employer never shared',
      'monthlyIncome',
      'liquidFunds',
      'token_hash',
      'finance',
      'user_id',
    ])
      expect(text).not.toContain(forbidden);
    expect(text).toContain('Bob alias');
    expect(text).toContain(a.branchId);
    const exported = JSON.stringify((await repo.exportAccount(a.id)).shared);
    for (const forbidden of [
      b.id,
      b.branchId,
      b.lifeId,
      'Bob alias',
      'token_hash',
    ])
      expect(exported).not.toContain(forbidden);
  });
  it('serializes two competing last-slot accepts and keeps archived contexts out of the slot count', async () => {
    const a = await sharedParticipant(db),
      b = await sharedParticipant(db),
      recipient = await sharedParticipant(db);
    const ca = await group(a),
      cb = await group(b),
      ia = await invitation(a, ca.contextId),
      ib = await invitation(b, cb.contextId);
    const inputs = [ia, ib].map((i) => ({
      token: i.token,
      branchId: recipient.branchId,
      revision: recipient.revision,
      contextRevision: i.revision,
      sharingAcknowledged: true as const,
    }));
    const results = await Promise.allSettled([
      shared.acceptInvite(recipient.id, ia.inviteId, inputs[0]!, randomUUID()),
      shared.acceptInvite(recipient.id, ib.inviteId, inputs[1]!, randomUUID()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (results.find((r) => r.status === 'rejected') as PromiseRejectedResult)
        .reason.code,
    ).toBe('SHARED_CONTEXT_LIMIT');
    const ended = await shared.lifecycle(
      a.id,
      ca.contextId,
      (await shared.detail(a.id, ca.contextId)).revision,
      'end',
      randomUUID(),
    );
    await shared.lifecycle(
      a.id,
      ca.contextId,
      ended.revision,
      'archive',
      randomUUID(),
    );
    expect((await group(a)).contextId).not.toBe(ca.contextId);
  });
  it('enforces the ten-member cap again at acceptance, even for previously issued invites', async () => {
    const owner = await sharedParticipant(db),
      c = await group(owner);
    const extra = await sharedParticipant(db),
      early = await invitation(owner, c.contextId);
    for (let n = 0; n < 9; n++)
      await accept(
        await sharedParticipant(db),
        await invitation(owner, c.contextId),
      );
    const latest = (await shared.detail(owner.id, c.contextId)).revision;
    await expect(
      shared.acceptInvite(
        extra.id,
        early.inviteId,
        {
          token: early.token,
          branchId: extra.branchId,
          revision: extra.revision,
          contextRevision: latest,
          sharingAcknowledged: true,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'SHARED_CONTEXT_FULL' });
    expect((await shared.detail(owner.id, c.contextId)).members).toHaveLength(
      10,
    );
  });
  it('supports idempotent leave without entitlement and does not grant access to later members', async () => {
    const a = await sharedParticipant(db),
      b = await sharedParticipant(db),
      c = await group(a);
    await accept(b, await invitation(a, c.contextId));
    await db.query(
      "UPDATE aw_user_entitlements SET tier='free' WHERE user_id=$1",
      [b.id],
    );
    expect((await shared.detail(b.id, c.contextId)).members).toHaveLength(2);
    const revision = (await shared.detail(b.id, c.contextId)).revision,
      key = randomUUID();
    const result = await shared.lifecycle(
      b.id,
      c.contextId,
      revision,
      'leave',
      key,
    );
    expect(
      await shared.lifecycle(b.id, c.contextId, revision, 'leave', key),
    ).toEqual(result);
    expect(result.status).toBe('paused');
    await expect(shared.detail(b.id, c.contextId)).rejects.toMatchObject({
      code: 'SHARED_CONTEXT_NOT_FOUND',
    });
  });
  it('checks direct DB ownership and RLS and preserves immutable canon without user cascades', async () => {
    const a = await sharedParticipant(db),
      b = await sharedParticipant(db),
      c = await group(a);
    await expect(
      db.query(
        "INSERT INTO aw_shared_members(id,context_id,context_type,user_id,life_id,branch_id,status,admin_role,interaction_profile,sharing_policy_version) VALUES($1,$2,'friend_group',$3,$4,$5,'active','member','{}','shared-profile-v1')",
        [randomUUID(), c.contextId, b.id, a.lifeId, a.branchId],
      ),
    ).rejects.toThrow('ownership mismatch');
    await expect(
      db.query("UPDATE aw_shared_contexts SET type='sports_team' WHERE id=$1", [
        c.contextId,
      ]),
    ).rejects.toThrow();
    const tables = await db.query(
      "SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'aw_shared_%' OR tablename IN ('aw_social_profiles','aw_user_entitlements','aw_user_blocks'))",
    );
    expect(tables).toHaveLength(16);
    for (const t of tables) {
      expect(t.rowsecurity).toBe(true);
      const [p] = await db.query(
        "SELECT has_table_privilege('anon',$1,'SELECT') AS anon,has_table_privilege('authenticated',$1,'INSERT') AS client",
        [t.tablename],
      );
      expect(p).toEqual({ anon: false, client: false });
    }
    const eventId = randomUUID();
    await db.query(
      'INSERT INTO aw_shared_events(id,context_id,sequence,base_revision,effective_at,candidate,state_before,state_after_event,canon_hash) VALUES($1,$2,1,0,$3,$4,$5,$5,$6)',
      [
        eventId,
        c.contextId,
        a.date,
        JSON.stringify({ summary: 'Generic shared fact' }),
        JSON.stringify({ type: 'friend_group' }),
        'test-canon-hash',
      ],
    );
    await expect(
      db.query("UPDATE aw_shared_events SET canon_hash='changed' WHERE id=$1", [
        eventId,
      ]),
    ).rejects.toThrow('immutable');
  });
  it('keeps a paused romantic slot reserved and releases it on end without deleting historical membership', async () => {
    const a = await sharedParticipant(db, 'connected'),
      first = randomUUID(),
      second = randomUUID();
    for (const id of [first, second])
      await db.query(
        "INSERT INTO aw_shared_contexts(id,type,title,state,simulation_at,governance,content_locale) VALUES($1,'romantic_relationship','Private relationship','{\"type\":\"romantic_relationship\"}',$2,'{}','en')",
        [id, a.date],
      );
    const insert = (contextId: string) =>
      db.query(
        "INSERT INTO aw_shared_members(id,context_id,context_type,user_id,life_id,branch_id,status,admin_role,interaction_profile,sharing_policy_version) VALUES($1,$2,'romantic_relationship',$3,$4,$5,'active','owner','{}','shared-profile-v1')",
        [randomUUID(), contextId, a.id, a.lifeId, a.branchId],
      );
    await insert(first);
    await db.query(
      "UPDATE aw_shared_contexts SET status='paused' WHERE id=$1",
      [first],
    );
    await expect(insert(second)).rejects.toThrow();
    await db.query("UPDATE aw_shared_contexts SET status='ended' WHERE id=$1", [
      first,
    ]);
    await insert(second);
    expect(
      await db.query(
        'SELECT context_live FROM aw_shared_members WHERE context_id=$1',
        [first],
      ),
    ).toEqual([{ context_live: false }]);
    await expect(
      db.query("UPDATE aw_shared_contexts SET status='active' WHERE id=$1", [
        first,
      ]),
    ).rejects.toThrow();
  });
  it('hands over administration on owner leave and deletion without changing in-world roles', async () => {
    const a = await sharedParticipant(db),
      b = await sharedParticipant(db),
      d = await sharedParticipant(db),
      c = await group(a);
    await accept(b, await invitation(a, c.contextId));
    await accept(d, await invitation(a, c.contextId));
    await shared.lifecycle(
      a.id,
      c.contextId,
      (await shared.detail(a.id, c.contextId)).revision,
      'leave',
      randomUUID(),
    );
    const owner = await db.query(
      "SELECT user_id,world_role FROM aw_shared_members WHERE context_id=$1 AND admin_role='owner' AND status='active'",
      [c.contextId],
    );
    expect(owner).toHaveLength(1);
    expect(owner[0]!.world_role).toBeNull();
    await repo.markDeleting(String(owner[0]!.user_id));
    await repo.deleteAccountData(String(owner[0]!.user_id));
    expect(
      await db.query(
        "SELECT world_role FROM aw_shared_members WHERE context_id=$1 AND admin_role='owner' AND status='active'",
        [c.contextId],
      ),
    ).toEqual([{ world_role: null }]);
  });
  it('revokes targeted invitations when an account is deleted before ever joining', async () => {
    const owner = await sharedParticipant(db),
      target = await sharedParticipant(db),
      outsider = await sharedParticipant(db),
      c = await group(owner),
      i = await invitation(owner, c.contextId, target.id);
    await repo.markDeleting(target.id);
    await repo.deleteAccountData(target.id);
    expect(
      (
        await db.query(
          'SELECT status,target_user_id FROM aw_shared_invites WHERE id=$1',
          [i.inviteId],
        )
      )[0],
    ).toEqual({ status: 'revoked', target_user_id: null });
    await expect(
      shared.previewInvite(outsider.id, i.token),
    ).rejects.toMatchObject({ code: 'SHARED_INVITE_ALREADY_USED' });
  });
  it('cancels shared jobs and recovers deletion while the other two members retain anonymized history', async () => {
    const a = await sharedParticipant(db),
      b = await sharedParticipant(db, 'explorer', 'Delete this alias'),
      d = await sharedParticipant(db),
      c = await group(a);
    await accept(b, await invitation(a, c.contextId));
    await accept(d, await invitation(a, c.contextId));
    const pending = await invitation(a, c.contextId, b.id),
      jobId = randomUUID();
    await db.query(
      "INSERT INTO aw_shared_jobs(id,context_id,requested_by_user_id,base_revision,status,payload,lease_token,lease_until) VALUES($1,$2,$3,0,'running','{}',$4,now()+interval '1 minute')",
      [jobId, c.contextId, a.id, randomUUID()],
    );
    const failOnce = vi
      .spyOn(repo, 'deleteAccountData')
      .mockRejectedValueOnce(new Error('Synthetic interruption'));
    const auth = {
      verify: async () => ({ id: b.id }),
      deleteUser: vi.fn(async () => {}),
      userExists: async () => false,
    };
    await expect(deleteAccount(repo, auth, b.id)).rejects.toThrow(
      'Synthetic interruption',
    );
    expect(
      (
        await db.query(
          'SELECT status,lease_token FROM aw_shared_jobs WHERE id=$1',
          [jobId],
        )
      )[0],
    ).toEqual({ status: 'cancelled', lease_token: null });
    await recoverAccountDeletion(repo, auth, b.id);
    failOnce.mockRestore();
    await repo.deleteAccountData(b.id); // Cleanup is repeatable after recovery.
    const detail = await shared.detail(a.id, c.contextId),
      text = JSON.stringify(detail);
    expect(detail.members).toHaveLength(3);
    expect(text).toContain('Former member');
    for (const forbidden of [b.id, b.lifeId, b.branchId, 'Delete this alias'])
      expect(text).not.toContain(forbidden);
    expect(detail.status).toBe('active');
    expect(
      (
        await db.query('SELECT status FROM aw_shared_invites WHERE id=$1', [
          pending.inviteId,
        ])
      )[0]!.status,
    ).toBe('revoked');
    expect(
      await db.query(
        'SELECT user_id FROM aw_social_profiles WHERE user_id=$1',
        [b.id],
      ),
    ).toEqual([]);
    expect(
      await db.query('SELECT id FROM aw_shared_contexts WHERE id=$1', [
        c.contextId,
      ]),
    ).toHaveLength(1);
  });
});
