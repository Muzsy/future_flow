import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import {
  Repository,
  SharedEventRepository,
  type Database,
} from '@future-flow/database';
import { hash } from '@future-flow/core';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  sharedAdapter,
  sharedParticipant,
  testInviteSecret,
} from './shared-fixtures';
import { sharedEventFixture } from './shared-engine-fixtures';

let engine: PGlite,
  db: Database,
  shared: SharedEventRepository,
  repo: Repository;
type Person = Awaited<ReturnType<typeof sharedParticipant>>;
let people: Person[];
const contexts: string[] = [];
let now = new Date('2030-01-01T10:00:00.000Z');
beforeAll(async () => {
  engine = new PGlite();
  await applyMigrations(engine);
  db = sharedAdapter(engine);
  shared = new SharedEventRepository(db, testInviteSecret, () => new Date(now));
  repo = new Repository(db);
  people = [];
  for (let i = 0; i < 4; i++)
    people.push(await sharedParticipant(db, 'world', 'Synthetic alias ' + i));
});
afterEach(async () => {
  for (const id of contexts.splice(0)) {
    const [owner] = await db.query(
      "SELECT m.user_id,c.revision,c.status FROM aw_shared_contexts c JOIN aw_shared_members m ON m.context_id=c.id AND m.admin_role='owner' AND m.status='active' WHERE c.id=$1",
      [id],
    );
    if (
      owner &&
      ['active', 'inviting', 'paused'].includes(String(owner.status))
    )
      await shared.lifecycle(
        String(owner.user_id),
        id,
        Number(owner.revision),
        'end',
        randomUUID(),
      );
  }
  now = new Date('2030-01-01T10:00:00.000Z');
});
afterAll(async () => {
  await engine?.close();
});
async function group(selected = people.slice(0, 3)) {
  const a = selected[0]!,
    c = await shared.create(
      a.id,
      {
        type: 'friend_group',
        title: 'Synthetic S1 group',
        branchId: a.branchId,
        revision: a.revision,
        sharingAcknowledged: true,
      },
      randomUUID(),
    );
  contexts.push(c.contextId);
  for (const p of selected.slice(1)) {
    const current = await shared.detail(a.id, c.contextId),
      invite = await shared.createInvite(
        a.id,
        c.contextId,
        { contextRevision: current.revision, targetUserId: p.id },
        randomUUID(),
      );
    await shared.acceptInvite(
      p.id,
      invite.inviteId,
      {
        token: invite.token,
        branchId: p.branchId,
        revision: p.revision,
        contextRevision: invite.revision,
        sharingAcknowledged: true,
      },
      randomUUID(),
    );
  }
  const detail = await shared.detail(a.id, c.contextId),
    ids = selected.map(
      (p) => detail.members.find((m) => m.branchId === p.branchId)?.id,
    );
  // DTO only exposes the current user's references. Resolve fixture IDs on the trusted test DB.
  const members = await db.query(
    'SELECT id,user_id FROM aw_shared_members WHERE context_id=$1',
    [c.contextId],
  );
  const memberIds = selected.map((p) =>
    String(members.find((m) => m.user_id === p.id)!.id),
  );
  expect(ids[0]).toBe(memberIds[0]);
  const f = sharedEventFixture(
    c.contextId,
    detail.revision,
    detail.simulationAt,
    memberIds,
  );
  return {
    ...f,
    id: c.contextId,
    people: selected,
    memberIds,
    revision: detail.revision,
  };
}
const latest = async (g: { id: string; people: Person[] }) =>
  (await shared.detail(g.people[0]!.id, g.id)).revision;
const submit = async (
  g: Awaited<ReturnType<typeof group>>,
  index: number,
  optionId: string,
  key = randomUUID(),
) =>
  shared.submitIntent(
    g.people[index]!.id,
    g.id,
    g.candidate.eventId,
    { contextRevision: await latest(g), optionId },
    key,
  );
async function commit(g: Awaited<ReturnType<typeof group>>) {
  return shared.commitCandidate(
    g.people[0]!.id,
    g.id,
    g.candidate,
    randomUUID(),
    g.rules,
  );
}
async function eventImpacts(
  g: Awaited<ReturnType<typeof group>>,
  index: number,
) {
  return (
    await shared.pendingImpacts(g.people[index]!.id, g.people[index]!.branchId)
  ).filter((i) => i.event_id === g.candidate.eventId);
}

describe.sequential(
  'Shared S1 durable friend decisions and safe projections',
  () => {
    it('commits immutable canon exactly once, keeps personal state untouched and hides other intents/proposals', async () => {
      const g = await group(),
        key = randomUUID(),
        before = await db.query(
          'SELECT id,state,revision FROM aw_branches WHERE id=ANY($1::uuid[]) ORDER BY id',
          [g.people.map((p) => p.branchId)],
        );
      const result = await shared.commitCandidate(
        g.people[0]!.id,
        g.id,
        g.candidate,
        key,
        g.rules,
      );
      expect(
        await shared.commitCandidate(
          g.people[0]!.id,
          g.id,
          g.candidate,
          key,
          g.rules,
        ),
      ).toEqual(result);
      const [event] = await shared.events(g.people[1]!.id, g.id);
      expect(event!.canonHash).toBe(result.canonHash);
      expect(event!.ownResponse).toBeNull();
      expect(JSON.stringify(event)).not.toMatch(
        /impactProposals|UNTRUSTED|Private employer|Private goal|finance|user_id|branch_id/,
      );
      expect(await eventImpacts(g, 0)).toEqual([]);
      expect(
        await db.query(
          'SELECT id,state,revision FROM aw_branches WHERE id=ANY($1::uuid[]) ORDER BY id',
          [g.people.map((p) => p.branchId)],
        ),
      ).toEqual(before);
      await expect(
        db.query(
          "UPDATE aw_shared_events SET canon_hash='changed' WHERE id=$1",
          [g.candidate.eventId],
        ),
      ).rejects.toThrow('immutable');
    });
    it('rejects stale, forged, duplicate and overlapping events before changing canon', async () => {
      const g = await group(),
        before = hash((await shared.detail(g.people[0]!.id, g.id)).state);
      await expect(
        shared.commitCandidate(
          g.people[0]!.id,
          g.id,
          { ...g.candidate, baseRevision: 99 },
          randomUUID(),
          g.rules,
        ),
      ).rejects.toMatchObject({ code: 'SHARED_REVISION_CONFLICT' });
      await expect(
        shared.commitCandidate(
          g.people[0]!.id,
          g.id,
          { ...g.candidate, participantMemberIds: [randomUUID()] },
          randomUUID(),
          g.rules,
        ),
      ).rejects.toThrow();
      expect(hash((await shared.detail(g.people[0]!.id, g.id)).state)).toBe(
        before,
      );
      await commit(g);
      await expect(
        shared.commitCandidate(
          g.people[0]!.id,
          g.id,
          {
            ...g.candidate,
            eventId: randomUUID(),
            baseRevision: await latest(g),
          },
          randomUUID(),
          g.rules,
        ),
      ).rejects.toMatchObject({ code: 'SHARED_PENDING_DECISION' });
      expect(
        await db.query('SELECT id FROM aw_shared_events WHERE context_id=$1', [
          g.id,
        ]),
      ).toHaveLength(1);
    });
    it('records only the own intent, retries idempotently and hides it from others until closure', async () => {
      const g = await group();
      await commit(g);
      const input = { contextRevision: await latest(g), optionId: g.yes },
        key = randomUUID();
      const result = await shared.submitIntent(
        g.people[0]!.id,
        g.id,
        g.candidate.eventId,
        input,
        key,
      );
      expect(result.status).toBe('waiting');
      expect(
        await shared.submitIntent(
          g.people[0]!.id,
          g.id,
          g.candidate.eventId,
          input,
          key,
        ),
      ).toEqual(result);
      await expect(
        shared.submitIntent(
          g.people[0]!.id,
          g.id,
          g.candidate.eventId,
          { ...input, optionId: g.no },
          key,
        ),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
      await expect(submit(g, 0, g.no)).rejects.toMatchObject({
        code: 'SHARED_INTENT_ALREADY_SUBMITTED',
      });
      const [own] = await shared.events(g.people[0]!.id, g.id),
        [other] = await shared.events(g.people[1]!.id, g.id);
      expect(own!.ownResponse).toMatchObject({ optionId: g.yes });
      expect(other!.ownResponse).toBeNull();
      expect(other!.responseCount).toBe(1);
      expect(other!.resolution).toBeNull();
      expect(JSON.stringify(other)).not.toContain('responses');
    });
    it('resolves an opt-in subset once, excludes opt-outs and never promotes proposal text to private canon', async () => {
      const g = await group();
      await commit(g);
      await submit(g, 0, g.yes);
      await submit(g, 1, g.no);
      const result = await submit(g, 2, g.yes);
      expect(result.status).toBe('resolved');
      const [context] = await db.query(
        'SELECT pending_event_id FROM aw_shared_contexts WHERE id=$1',
        [g.id],
      );
      expect(context!.pending_event_id).toBeNull();
      const [r] = await db.query(
        'SELECT id,result FROM aw_shared_resolutions WHERE event_id=$1',
        [g.candidate.eventId],
      );
      expect(r!.result).toMatchObject({
        participatingMemberIds: [g.memberIds[0], g.memberIds[2]].sort(),
      });
      expect(await eventImpacts(g, 1)).toEqual([]);
      for (const index of [0, 2]) {
        const impacts = await eventImpacts(g, index);
        expect(impacts).toHaveLength(1);
        expect(JSON.stringify(impacts)).toContain(
          'Your recorded response: Join the walk',
        );
        expect(JSON.stringify(impacts)).not.toContain('UNTRUSTED');
      }
      await shared.resolvePending(
        g.people[0]!.id,
        g.id,
        g.candidate.eventId,
        await latest(g),
        randomUUID(),
      );
      expect(
        await db.query(
          'SELECT id FROM aw_shared_resolutions WHERE event_id=$1',
          [g.candidate.eventId],
        ),
      ).toHaveLength(1);
      expect(
        await db.query('SELECT id FROM aw_shared_impacts WHERE event_id=$1', [
          g.candidate.eventId,
        ]),
      ).toHaveLength(2);
      await expect(
        db.query(
          "UPDATE aw_shared_intents SET payload='{}' WHERE event_id=$1",
          [g.candidate.eventId],
        ),
      ).rejects.toThrow('immutable');
      await expect(
        db.query(
          "UPDATE aw_shared_resolutions SET result='{}' WHERE event_id=$1",
          [g.candidate.eventId],
        ),
      ).rejects.toThrow('immutable');
      await expect(
        db.query(
          "UPDATE aw_shared_impacts SET payload='{}' WHERE event_id=$1",
          [g.candidate.eventId],
        ),
      ).rejects.toThrow('immutable');
    });
    it('resolves at a wall-clock deadline without fabricating responses, survives repository restart and rejects late intent', async () => {
      const g = await group();
      await commit(g);
      await submit(g, 0, g.yes);
      now = new Date(now.getTime() + 172800000);
      await expect(submit(g, 1, g.yes)).rejects.toMatchObject({
        code: 'SHARED_DECISION_CLOSED',
      });
      const restarted = new SharedEventRepository(
        db,
        testInviteSecret,
        () => new Date(now),
      );
      expect(
        (
          await restarted.resolvePending(
            g.people[1]!.id,
            g.id,
            g.candidate.eventId,
            await latest(g),
            randomUUID(),
          )
        ).status,
      ).toBe('resolved');
      expect(
        await db.query('SELECT id FROM aw_shared_intents WHERE event_id=$1', [
          g.candidate.eventId,
        ]),
      ).toHaveLength(1);
      expect(
        await db.query(
          'SELECT member_id FROM aw_shared_impacts WHERE event_id=$1',
          [g.candidate.eventId],
        ),
      ).toEqual([{ member_id: g.memberIds[0] }]);
    });
    it('rejects outsider reads, another private branch, non-eligible voters and changed entitlements', async () => {
      const g = await group(),
        outside = people[3]!;
      g.candidate.participantMemberIds = g.memberIds.slice(0, 2);
      g.candidate.decision!.eligibleMemberIds = g.memberIds.slice(0, 2);
      g.candidate.decision!.options[0]!.impactProposals =
        g.candidate.decision!.options[0]!.impactProposals.slice(0, 2);
      await commit(g);
      await expect(shared.events(outside.id, g.id)).rejects.toMatchObject({
        code: 'SHARED_CONTEXT_NOT_FOUND',
      });
      await expect(
        shared.pendingImpacts(g.people[0]!.id, g.people[1]!.branchId),
      ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      await expect(submit(g, 2, g.yes)).rejects.toMatchObject({
        code: 'SHARED_INTENT_NOT_ELIGIBLE',
      });
      await db.query(
        "UPDATE aw_user_entitlements SET tier='free' WHERE user_id=$1",
        [g.people[1]!.id],
      );
      await expect(submit(g, 1, g.yes)).rejects.toMatchObject({
        code: 'SUBSCRIPTION_REQUIRED',
      });
      expect(await shared.events(g.people[1]!.id, g.id)).toHaveLength(1);
      await db.query(
        "UPDATE aw_user_entitlements SET tier='world' WHERE user_id=$1",
        [g.people[1]!.id],
      );
    });
    it('fails closed if a branch advanced or a blocked pair would receive a common effect', async () => {
      const g = await group(people.slice(0, 2));
      await commit(g);
      await submit(g, 0, g.yes);
      const [b] = await db.query('SELECT state FROM aw_branches WHERE id=$1', [
        g.people[1]!.branchId,
      ]);
      await db.query(
        "UPDATE aw_branches SET state=jsonb_set(state,'{effectiveAt}','\"2040-01-01\"') WHERE id=$1",
        [g.people[1]!.branchId],
      );
      await expect(submit(g, 1, g.yes)).rejects.toMatchObject({
        code: 'SHARED_TIME_MISMATCH',
      });
      await db.query('UPDATE aw_branches SET state=$2 WHERE id=$1', [
        g.people[1]!.branchId,
        JSON.stringify(b!.state),
      ]);
      await db.query(
        'INSERT INTO aw_user_blocks(user_id,blocked_user_id) VALUES($1,$2)',
        [g.people[0]!.id, g.people[1]!.id],
      );
      await expect(submit(g, 1, g.yes)).rejects.toMatchObject({
        code: 'SHARED_BLOCKED',
      });
      expect(
        await db.query('SELECT id FROM aw_shared_intents WHERE event_id=$1', [
          g.candidate.eventId,
        ]),
      ).toHaveLength(1);
      expect(
        await db.query('SELECT id FROM aw_shared_impacts WHERE event_id=$1', [
          g.candidate.eventId,
        ]),
      ).toHaveLength(0);
      await db.query(
        'DELETE FROM aw_user_blocks WHERE user_id=$1 AND blocked_user_id=$2',
        [g.people[0]!.id, g.people[1]!.id],
      );
    });
    it('cancels pending decisions atomically on participant leave and permits remaining canon history', async () => {
      const g = await group();
      await commit(g);
      await submit(g, 0, g.yes);
      const left = await shared.lifecycle(
        g.people[1]!.id,
        g.id,
        await latest(g),
        'leave',
        randomUUID(),
      );
      const [r] = await db.query(
        'SELECT result FROM aw_shared_resolutions WHERE event_id=$1',
        [g.candidate.eventId],
      );
      expect(r!.result).toMatchObject({
        status: 'cancelled',
        reason: 'participant_unavailable',
      });
      expect((await shared.detail(g.people[0]!.id, g.id)).revision).toBe(
        left.revision,
      );
      expect(await eventImpacts(g, 0)).toHaveLength(0);
      await expect(shared.events(g.people[1]!.id, g.id)).rejects.toMatchObject({
        code: 'SHARED_CONTEXT_NOT_FOUND',
      });
      expect(await shared.events(g.people[2]!.id, g.id)).toHaveLength(1);
    });
    it('cancels on account deletion, preserves shared canon and never creates a deleted participant effect', async () => {
      const temporary = await sharedParticipant(
          db,
          'world',
          'Temporary synthetic member',
        ),
        g = await group([people[0]!, temporary, people[2]!]);
      await commit(g);
      await submit(g, 1, g.yes);
      await repo.markDeleting(temporary.id);
      await repo.confirmAuthDeleted(temporary.id);
      await repo.deleteAccountData(temporary.id);
      const [event] = await shared.events(people[0]!.id, g.id);
      expect(event!.resolution).toMatchObject({
        status: 'cancelled',
        reason: 'participant_unavailable',
      });
      const detail = await shared.detail(people[0]!.id, g.id),
        former = detail.members.find((m) => m.id === g.memberIds[1]);
      expect(former!.interactionProfile.displayName).toBe('Former member');
      expect(
        await db.query('SELECT id FROM aw_shared_impacts WHERE event_id=$1', [
          g.candidate.eventId,
        ]),
      ).toHaveLength(0);
      expect(
        await db.query('SELECT id FROM aw_shared_events WHERE id=$1', [
          g.candidate.eventId,
        ]),
      ).toHaveLength(1);
    });
    it('exports only own responses/impacts and retains own historical participation after leaving', async () => {
      const g = await group();
      await commit(g);
      await submit(g, 0, g.yes);
      await submit(g, 1, g.yes);
      await submit(g, 2, g.yes);
      await shared.lifecycle(
        g.people[0]!.id,
        g.id,
        await latest(g),
        'leave',
        randomUUID(),
      );
      const exported = await repo.exportAccount(g.people[0]!.id),
        sharedExport = exported.shared as {
          canon: { events: unknown[]; impacts: unknown[] };
        };
      const event = sharedExport.canon.events.find(
        (e) => (e as { id: string }).id === g.candidate.eventId,
      );
      expect(event).toBeDefined();
      const serialized = JSON.stringify(sharedExport.canon);
      expect(serialized).not.toContain(g.people[1]!.branchId);
      expect(serialized).not.toContain(g.people[1]!.id);
      expect(serialized).not.toContain('responses');
      expect(serialized).not.toContain('UNTRUSTED');
      expect(
        sharedExport.canon.impacts.filter(
          (i) => (i as { event_id: string }).event_id === g.candidate.eventId,
        ),
      ).toHaveLength(1);
    });
    it('creates memory only for a non-decision participant subset and rejects ID reuse and active jobs', async () => {
      const g = await group();
      g.candidate.decision = null;
      g.candidate.participantMemberIds = g.memberIds.slice(0, 2);
      const committed = await shared.commitCandidate(
        g.people[0]!.id,
        g.id,
        g.candidate,
        randomUUID(),
      );
      expect(committed.pendingDecision).toBe(false);
      expect(await eventImpacts(g, 2)).toHaveLength(0);
      await expect(
        shared.commitCandidate(
          g.people[0]!.id,
          g.id,
          { ...g.candidate, baseRevision: committed.revision },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'SHARED_CANDIDATE_INVALID' });
      await db.query(
        "INSERT INTO aw_shared_jobs(id,context_id,requested_by_user_id,base_revision,payload) VALUES($1,$2,$3,$4,'{}')",
        [randomUUID(), g.id, g.people[0]!.id, committed.revision],
      );
      await expect(
        shared.commitCandidate(
          g.people[0]!.id,
          g.id,
          {
            ...g.candidate,
            eventId: randomUUID(),
            baseRevision: committed.revision,
          },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'SHARED_GENERATION_ACTIVE' });
    });
    it('allows only one same-revision concurrent intent and recovers with a fresh revision without duplicate resolution', async () => {
      const g = await group(people.slice(0, 2));
      await commit(g);
      const revision = await latest(g);
      const attempts = await Promise.allSettled(
        g.people.map((p) =>
          shared.submitIntent(
            p.id,
            g.id,
            g.candidate.eventId,
            { contextRevision: revision, optionId: g.yes },
            randomUUID(),
          ),
        ),
      );
      expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
      expect(
        (attempts.find((a) => a.status === 'rejected') as PromiseRejectedResult)
          .reason.code,
      ).toBe('SHARED_REVISION_CONFLICT');
      const index = attempts.findIndex((a) => a.status === 'rejected');
      await submit(g, index, g.yes);
      expect(
        await db.query('SELECT id FROM aw_shared_intents WHERE event_id=$1', [
          g.candidate.eventId,
        ]),
      ).toHaveLength(2);
      expect(
        await db.query(
          'SELECT id FROM aw_shared_resolutions WHERE event_id=$1',
          [g.candidate.eventId],
        ),
      ).toHaveLength(1);
      expect(
        await db.query('SELECT id FROM aw_shared_impacts WHERE event_id=$1', [
          g.candidate.eventId,
        ]),
      ).toHaveLength(2);
    });
  },
);
