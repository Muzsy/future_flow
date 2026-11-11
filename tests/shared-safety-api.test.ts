import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
} from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  Repository,
  SharedSafetyRepository,
  type Database,
} from '@future-flow/database';
import { DomainError } from '@future-flow/core';
import { createApp } from '../apps/api/src/app';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  sharedAdapter,
  testInviteSecret,
  sharedParticipant,
} from './shared-fixtures';
import { sharedAiGroup } from './shared-ai-fixtures';
let engine: PGlite,
  db: Database,
  app: INestApplication,
  off: INestApplication,
  base: string,
  offBase: string,
  shared: SharedSafetyRepository,
  g: Awaited<ReturnType<typeof sharedAiGroup>>;
const allowed = new Set<string>();
beforeAll(async () => {
  engine = new PGlite();
  await applyMigrations(engine);
  db = sharedAdapter(engine);
  shared = new SharedSafetyRepository(db, testInviteSecret);
  const auth = {
    verify: async (token: string) => {
      const id = token.replace(/^isolated_safety_/, '');
      if (!allowed.has(id))
        throw new DomainError(
          'AUTH_INVALID_TOKEN',
          'Invalid synthetic token',
          401,
        );
      return { id };
    },
    deleteUser: async () => {},
  };
  app = await createApp(new Repository(db), auth, 'http://localhost:3000', 0, {
    enabled: true,
    friend: true,
    connected: false,
    world: false,
    inviteSecret: testInviteSecret,
  });
  off = await createApp(new Repository(db), auth, 'http://localhost:3000', 0, {
    enabled: false,
    friend: false,
    connected: false,
    world: false,
  });
  await app.listen(0, '127.0.0.1');
  await off.listen(0, '127.0.0.1');
  base = await app.getUrl();
  offBase = await off.getUrl();
});
beforeEach(async () => {
  g = await sharedAiGroup(db, shared);
  g.people.forEach((p) => allowed.add(p.id));
});
afterEach(async () => {
  const d = await shared.detail(g.people[0]!.id, g.contextId);
  if (['active', 'inviting', 'paused'].includes(d.status))
    await shared.lifecycle(
      g.people[0]!.id,
      g.contextId,
      d.revision,
      'end',
      randomUUID(),
    );
});
afterAll(async () => {
  await app?.close();
  await off?.close();
  await engine?.close();
});
async function req(
  index: number,
  path: string,
  method = 'GET',
  body?: unknown,
  key?: string,
  disabled = false,
) {
  const r = await fetch((disabled ? offBase : base) + '/api/v2/' + path, {
    method,
    headers: {
      Authorization: 'Bearer isolated_safety_' + g.people[index]!.id,
      'Content-Type': 'application/json',
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: r.status,
    body: await r.json(),
    cache: r.headers.get('cache-control'),
  };
}
const path = () => `shared-contexts/${g.contextId}`;
const concern = {
  targetType: 'context',
  reason: 'privacy',
  details: 'Synthetic private report in an isolated API test.',
};
describe('S3 disabled and authenticated safety HTTP boundaries', () => {
  it('requires authentication, respects flags and rejects forged reporter/member identity', async () => {
    const anonymous = await fetch(base + '/api/v2/' + path() + '/safety');
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('cache-control')).toContain('no-store');
    expect(
      (await req(0, path() + '/safety', 'GET', undefined, undefined, true))
        .status,
    ).toBe(404);
    expect(
      (await req(0, path() + '/reports', 'POST', concern, randomUUID(), true))
        .status,
    ).toBe(404);
    const r = await req(
      0,
      path() + '/reports',
      'POST',
      { ...concern, reporterUserId: g.people[1]!.id },
      randomUUID(),
    );
    expect(r.status).toBe(422);
    expect(
      (
        await req(
          0,
          path() + '/block',
          'POST',
          {
            contextRevision: g.detail.revision,
            memberId: g.detail.ownMemberId,
            userId: g.people[1]!.id,
          },
          randomUUID(),
        )
      ).status,
    ).toBe(422);
  });
  it('returns only own report state, retries once and exposes no user moderation endpoint', async () => {
    const key = randomUUID(),
      r = await req(0, path() + '/reports', 'POST', concern, key);
    expect(r.status).toBe(201);
    expect(
      (await req(0, path() + '/reports', 'POST', concern, key)).body,
    ).toEqual(r.body);
    const self = await req(0, path() + '/safety');
    expect(self.cache).toContain('no-store');
    expect(self.body.reports).toHaveLength(1);
    expect((await req(1, path() + '/safety')).body.reports).toEqual([]);
    expect(
      (
        await req(
          0,
          path() + '/moderate',
          'POST',
          { action: 'hold' },
          randomUUID(),
        )
      ).status,
    ).toBe(404);
    expect(JSON.stringify(self.body)).not.toContain(g.people[1]!.id);
  });
  it('validates revisions for blocking and keeps the private life usable', async () => {
    const input = {
      contextRevision: g.detail.revision,
      memberId: g.detail.members.find((m) => m.id !== g.detail.ownMemberId)!.id,
    };
    expect(
      (
        await req(
          0,
          path() + '/block',
          'POST',
          { ...input, contextRevision: 0 },
          randomUUID(),
        )
      ).status,
    ).toBe(409);
    const blocked = await req(
      0,
      path() + '/block',
      'POST',
      input,
      randomUUID(),
    );
    expect(blocked.status).toBe(201);
    expect(blocked.body.blocked).toBe(true);
    expect(
      (
        await req(
          1,
          path() + '/continue',
          'POST',
          { contextRevision: blocked.body.revision },
          randomUUID(),
        )
      ).body.error.code,
    ).toBe('SHARED_BLOCKED');
    expect((await req(1, 'branches/' + g.people[1]!.branchId)).status).toBe(
      200,
    );
    expect(
      (
        await req(
          0,
          path() + '/unblock',
          'POST',
          { ...input, contextRevision: blocked.body.revision },
          randomUUID(),
        )
      ).body.blocked,
    ).toBe(false);
  });
  it('allows a known bearer invitation to be reported by a Free account without joining or leaking its code', async () => {
    const free = await sharedParticipant(db, 'free', 'Synthetic free reader');
    allowed.add(free.id);
    g.people.push(free);
    const i = await shared.createInvite(
      g.people[0]!.id,
      g.contextId,
      { contextRevision: g.detail.revision, targetUserId: free.id },
      randomUUID(),
    );
    expect(
      (
        await req(
          1,
          'shared-invites/reports',
          'POST',
          { token: i.token, reason: 'spam', details: concern.details },
          randomUUID(),
        )
      ).status,
    ).toBe(404);
    const r = await req(
      2,
      'shared-invites/reports',
      'POST',
      { token: i.token, reason: 'spam', details: concern.details },
      randomUUID(),
    );
    expect(r.status).toBe(201);
    expect(JSON.stringify(r.body)).not.toContain(i.token);
    expect(await shared.list(free.id)).toEqual([]);
  });
  it('projects an operator hold, invalidates a paid-job lease and allows reading, reporting and leaving', async () => {
    const q = await shared.enqueue(
        g.people[0]!.id,
        g.contextId,
        g.detail.revision,
        randomUUID(),
      ),
      j = (await shared.claim())!;
    const held = await shared.moderate(g.contextId, {
      actionId: randomUUID(),
      contextRevision: q.revision,
      action: 'hold',
      actorLabel: 'synthetic-operator',
      reason: 'Isolated review',
    });
    expect((await req(0, path())).body.moderationHold).toBe(true);
    expect(
      (
        await req(
          1,
          path() + '/continue',
          'POST',
          { contextRevision: held.revision },
          randomUUID(),
        )
      ).body.error.code,
    ).toBe('SHARED_MODERATION_HOLD');
    expect(
      (await req(1, path() + '/reports', 'POST', concern, randomUUID())).status,
    ).toBe(201);
    expect((await req(1, path() + '/events')).status).toBe(200);
    await expect(shared.verify(j)).rejects.toThrow();
    expect((await shared.job(g.people[0]!.id, q.jobId)).status).toBe(
      'cancelled',
    );
    expect(
      (
        await req(
          1,
          path() + '/leave',
          'POST',
          { contextRevision: held.revision },
          randomUUID(),
        )
      ).status,
    ).toBe(201);
  });
});
