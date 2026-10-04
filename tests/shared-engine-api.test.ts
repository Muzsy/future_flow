import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  Repository,
  SharedEventRepository,
  type Database,
} from '@future-flow/database';
import { DomainError } from '@future-flow/core';
import { createApp } from '../apps/api/src/app';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  sharedAdapter,
  sharedParticipant,
  testInviteSecret,
} from './shared-fixtures';
import { sharedEventFixture } from './shared-engine-fixtures';

let engine: PGlite,
  db: Database,
  app: INestApplication,
  off: INestApplication,
  shared: SharedEventRepository,
  base: string,
  offBase: string;
type Person = Awaited<ReturnType<typeof sharedParticipant>>;
let people: Person[],
  contextId: string,
  eventId: string,
  yes: string,
  no: string,
  revision: number;
const key = randomUUID();
const headers = (person: Person, k?: string) => ({
  Authorization: 'Bearer isolated_' + person.id,
  'Content-Type': 'application/json',
  'Accept-Language': 'hu-HU',
  ...(k ? { 'Idempotency-Key': k } : {}),
});
async function request(
  index: number,
  path: string,
  method = 'GET',
  body?: unknown,
  k?: string,
  disabled = false,
) {
  const response = await fetch(
    (disabled ? offBase : base) + '/api/v2/' + path,
    {
      method,
      headers: headers(people[index]!, k),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  return {
    status: response.status,
    cache: response.headers.get('cache-control'),
    body: await response.json(),
  };
}
const eventPath = () => `shared-contexts/${contextId}/events/${eventId}`;
beforeAll(async () => {
  engine = new PGlite();
  await applyMigrations(engine);
  db = sharedAdapter(engine);
  shared = new SharedEventRepository(db, testInviteSecret);
  people = [];
  for (let i = 0; i < 4; i++)
    people.push(
      await sharedParticipant(db, 'world', 'Isolated HTTP member ' + i),
    );
  const owner = people[0]!,
    created = await shared.create(
      owner.id,
      {
        type: 'friend_group',
        title: 'Synthetic HTTP group',
        branchId: owner.branchId,
        revision: owner.revision,
        sharingAcknowledged: true,
      },
      randomUUID(),
    );
  contextId = created.contextId;
  for (const p of people.slice(1, 3)) {
    const detail = await shared.detail(owner.id, contextId),
      invite = await shared.createInvite(
        owner.id,
        contextId,
        { contextRevision: detail.revision, targetUserId: p.id },
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
  const detail = await shared.detail(owner.id, contextId),
    members = await db.query(
      'SELECT id,user_id FROM aw_shared_members WHERE context_id=$1',
      [contextId],
    );
  const ids = people
    .slice(0, 2)
    .map((p) => String(members.find((m) => m.user_id === p.id)!.id));
  const f = sharedEventFixture(
    contextId,
    detail.revision,
    detail.simulationAt,
    ids,
  );
  eventId = f.candidate.eventId;
  yes = f.yes;
  no = f.no;
  const committed = await shared.commitCandidate(
    owner.id,
    contextId,
    f.candidate,
    randomUUID(),
    f.rules,
  );
  revision = committed.revision;
  const auth = {
    verify: async (token: string) => {
      const p = people.find((p) => 'isolated_' + p.id === token);
      if (!p) throw new DomainError('AUTH_INVALID_TOKEN', 'Invalid token', 401);
      return { id: p.id };
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
  off = await createApp(new Repository(db), auth);
  await app.listen(0, '127.0.0.1');
  await off.listen(0, '127.0.0.1');
  base = await app.getUrl();
  offBase = await off.getUrl();
});
afterAll(async () => {
  await app?.close();
  await off?.close();
  await engine?.close();
});
describe.sequential('Shared S1 disabled HTTP decision boundaries', () => {
  it('keeps new endpoints behind verified auth and default-off flags and exposes no fixture generator', async () => {
    expect(
      (await fetch(base + '/api/v2/shared-contexts/' + contextId + '/events'))
        .status,
    ).toBe(401);
    expect(
      (
        await request(
          0,
          `shared-contexts/${contextId}/events`,
          'GET',
          undefined,
          undefined,
          true,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          0,
          eventPath() + '/intents',
          'POST',
          { contextRevision: revision, optionId: yes },
          randomUUID(),
          true,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          0,
          `shared-contexts/${contextId}/events`,
          'POST',
          { fixture: true },
          randomUUID(),
        )
      ).status,
    ).toBe(404);
  });
  it('returns safe canonical events to members, hides private option effects and rejects outsiders/foreign branches', async () => {
    const events = await request(1, `shared-contexts/${contextId}/events`);
    expect(events.status).toBe(200);
    expect(events.cache).toBe('no-store');
    expect(events.body[0]).toMatchObject({
      id: eventId,
      ownResponse: null,
      responseCount: 0,
    });
    expect(JSON.stringify(events.body)).not.toMatch(
      /impactProposals|UNTRUSTED|Private employer|Private goal|user_id|branch_id/,
    );
    expect(
      (await request(3, `shared-contexts/${contextId}/events`)).status,
    ).toBe(404);
    expect(
      (await request(0, `branches/${people[1]!.branchId}/shared-impacts`))
        .status,
    ).toBe(404);
  });
  it('requires strict own intent, current revision and idempotency without accepting forged user/impact payload', async () => {
    expect(
      (
        await request(0, eventPath() + '/intents', 'POST', {
          contextRevision: revision,
          optionId: yes,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          0,
          eventPath() + '/intents',
          'POST',
          { contextRevision: revision, optionId: yes, memberId: randomUUID() },
          randomUUID(),
        )
      ).status,
    ).toBe(422);
    const stale = await request(
      0,
      eventPath() + '/intents',
      'POST',
      { contextRevision: revision - 1, optionId: yes },
      randomUUID(),
    );
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('SHARED_REVISION_CONFLICT');
    expect(stale.body.error.message).toContain('shared context changed');
    expect(
      (
        await request(
          2,
          eventPath() + '/intents',
          'POST',
          { contextRevision: revision, optionId: yes },
          randomUUID(),
        )
      ).status,
    ).toBe(403);
    const own = await request(
      0,
      eventPath() + '/intents',
      'POST',
      { contextRevision: revision, optionId: yes },
      key,
    );
    expect(own.status).toBe(201);
    expect(own.body.status).toBe('waiting');
    expect(
      (
        await request(
          0,
          eventPath() + '/intents',
          'POST',
          { contextRevision: revision, optionId: yes },
          key,
        )
      ).body,
    ).toEqual(own.body);
    revision = own.body.revision;
    const other = await request(1, `shared-contexts/${contextId}/events`);
    expect(other.body[0]).toMatchObject({
      ownResponse: null,
      responseCount: 1,
      resolution: null,
    });
  });
  it('cannot force a resolution or decide for missing members and resolves actual opt-in choices exactly once', async () => {
    expect(
      (
        await request(
          0,
          eventPath() + '/resolve',
          'POST',
          { contextRevision: revision, force: true },
          randomUUID(),
        )
      ).status,
    ).toBe(422);
    const waiting = await request(
      2,
      eventPath() + '/resolve',
      'POST',
      { contextRevision: revision },
      randomUUID(),
    );
    expect(waiting.body.status).toBe('waiting');
    const result = await request(
      1,
      eventPath() + '/intents',
      'POST',
      { contextRevision: revision, optionId: no },
      randomUUID(),
    );
    expect(result.status).toBe(201);
    expect(result.body.status).toBe('resolved');
    revision = result.body.revision;
    const repeated = await request(
      2,
      eventPath() + '/resolve',
      'POST',
      { contextRevision: revision },
      randomUUID(),
    );
    expect(repeated.body.status).toBe('closed');
    expect(
      await db.query('SELECT id FROM aw_shared_resolutions WHERE event_id=$1', [
        eventId,
      ]),
    ).toHaveLength(1);
    const own = await request(
        0,
        `branches/${people[0]!.branchId}/shared-impacts`,
      ),
      declined = await request(
        1,
        `branches/${people[1]!.branchId}/shared-impacts`,
      ),
      unaffected = await request(
        2,
        `branches/${people[2]!.branchId}/shared-impacts`,
      );
    expect(own.body).toHaveLength(1);
    expect(own.body[0].payload.ownOptionId).toBe(yes);
    expect(declined.body).toEqual([]);
    expect(unaffected.body).toEqual([]);
  });
  it('documents the strict intent schema and keeps canonical input out of HTTP requests', async () => {
    const r = await fetch(base + '/api/openapi.json'),
      openapi = await r.json();
    const intent =
      openapi.paths['/api/v2/shared-contexts/{id}/events/{eventId}/intents']
        .post;
    expect(
      intent.requestBody.content['application/json'].schema
        .additionalProperties,
    ).toBe(false);
    expect(
      openapi.paths['/api/v2/shared-contexts/{id}/events'].post,
    ).toBeUndefined();
    expect(
      openapi.paths['/api/v2/shared-contexts/{id}/continue'],
    ).toBeUndefined();
  });
});
