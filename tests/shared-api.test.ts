import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { INestApplication } from '@nestjs/common';
import { Repository, type Database } from '@future-flow/database';
import { DomainError } from '@future-flow/core';
import { createApp } from '../apps/api/src/app';
import { sharedFeaturesFromEnv } from '../apps/api/src/shared-context';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  sharedAdapter,
  sharedParticipant,
  testInviteSecret,
} from './shared-fixtures';

let engine: PGlite,
  db: Database,
  app: INestApplication,
  disabled: INestApplication;
let base: string, disabledBase: string;
type Person = Awaited<ReturnType<typeof sharedParticipant>>;
let owner: Person, guest: Person, outsider: Person, free: Person;
let contextId: string, inviteId: string, token: string;
const unconsentedId = randomUUID();
const headers = (userId: string, key?: string) => ({
  Authorization: `Bearer shared_test_${userId}`,
  'Content-Type': 'application/json',
  ...(key ? { 'Idempotency-Key': key } : {}),
  'Accept-Language': 'hu-HU',
});
async function request(
  userId: string,
  path: string,
  method = 'GET',
  body?: unknown,
  key?: string,
) {
  const response = await fetch(base + '/api/v2/' + path, {
    method,
    headers: headers(userId, key),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { response, body: await response.json() };
}
beforeAll(async () => {
  engine = new PGlite();
  await applyMigrations(engine);
  db = sharedAdapter(engine);
  owner = await sharedParticipant(db);
  guest = await sharedParticipant(db);
  outsider = await sharedParticipant(db);
  free = await sharedParticipant(db, 'free');
  const auth = {
    verify: async (value: string) => {
      const id = value.replace(/^shared_test_/, '');
      if (
        ![owner.id, guest.id, outsider.id, free.id, unconsentedId].includes(id)
      )
        throw new DomainError('AUTH_INVALID_TOKEN', 'Invalid token', 401);
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
  disabled = await createApp(
    new Repository(db),
    auth,
    'http://localhost:3000',
    0,
    sharedFeaturesFromEnv({}),
  );
  await app.listen(0, '127.0.0.1');
  await disabled.listen(0, '127.0.0.1');
  base = await app.getUrl();
  disabledBase = await disabled.getUrl();
});
afterAll(async () => {
  await app?.close();
  await disabled?.close();
  await engine?.close();
});

describe.sequential('Shared foundation HTTP boundaries', () => {
  it('exposes only authenticated server availability, including disabled rollout', async () => {
    const anonymous = await fetch(base + '/api/v2/shared-capabilities');
    expect(anonymous.status).toBe(401);
    const enabled = await request(owner.id, 'shared-capabilities');
    expect(enabled.body).toEqual({ friendEnabled: true });
    expect(enabled.response.headers.get('cache-control')).toBe('no-store');
    const off = await fetch(disabledBase + '/api/v2/shared-capabilities', {
      headers: headers(owner.id),
    });
    expect(off.status).toBe(200);
    expect(await off.json()).toEqual({ friendEnabled: false });
    expect(off.headers.get('cache-control')).toBe('no-store');
  });
  it('requires verified auth and remains inaccessible with the default feature flags', async () => {
    const anonymous = await fetch(base + '/api/v2/shared-contexts');
    expect(anonymous.status).toBe(401);
    const off = await fetch(disabledBase + '/api/v2/shared-contexts', {
      headers: headers(owner.id),
    });
    expect(off.status).toBe(404);
    expect((await off.json()).error.code).toBe('NOT_FOUND');
    expect(off.headers.get('cache-control')).toBe('no-store');
  });
  it('requires privacy consent and rejects attempts to set entitlement or include private fields', async () => {
    const profile = {
      handle: 'http_alias',
      displayName: 'HTTP alias',
      discoverability: 'private',
    };
    expect(
      (await request(unconsentedId, 'social-profile', 'PUT', profile)).response
        .status,
    ).toBe(403);
    expect(
      (
        await request(owner.id, 'social-profile', 'PUT', {
          ...profile,
          tier: 'world',
        })
      ).response.status,
    ).toBe(422);
    const saved = await request(owner.id, 'social-profile', 'PUT', profile);
    expect(saved.response.status).toBe(200);
    expect(saved.body.entitlement).toMatchObject({
      tier: 'explorer',
      activeContexts: 1,
    });
    const create = {
      type: 'friend_group',
      title: 'HTTP group',
      branchId: owner.branchId,
      revision: owner.revision,
      sharingAcknowledged: true,
    };
    expect(
      (
        await request(
          owner.id,
          'shared-contexts',
          'POST',
          { ...create, finance: { income: 9999 } },
          randomUUID(),
        )
      ).response.status,
    ).toBe(422);
    expect(
      (
        await request(
          owner.id,
          'shared-contexts',
          'POST',
          { ...create, sharingAcknowledged: false },
          randomUUID(),
        )
      ).response.status,
    ).toBe(422);
    expect(
      (await request(owner.id, 'shared-contexts', 'POST', create)).response
        .status,
    ).toBe(400);
    const key = randomUUID(),
      created = await request(owner.id, 'shared-contexts', 'POST', create, key);
    expect(created.response.status).toBe(201);
    contextId = created.body.contextId;
    expect(
      (await request(owner.id, 'shared-contexts', 'POST', create, key)).body,
    ).toEqual(created.body);
  });
  it('publishes strict OpenAPI inputs and CORS support for the own profile PUT', async () => {
    const spec = await (await fetch(base + '/api/openapi.json')).json();
    const create = spec.paths['/api/v2/shared-contexts'].post;
    expect(create.security).toContainEqual({ bearer: [] });
    expect(
      create.requestBody.content['application/json'].schema
        .additionalProperties,
    ).toBe(false);
    expect(spec.paths['/api/v2/shared-invites/preview'].get).toBeUndefined();
    const preflight = await fetch(base + '/api/v2/social-profile', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'PUT',
      },
    });
    expect(preflight.headers.get('access-control-allow-methods')).toContain(
      'PUT',
    );
  });
  it('hides contexts and other branch references from outsiders', async () => {
    const denied = await request(outsider.id, 'shared-contexts/' + contextId);
    expect(denied.response.status).toBe(404);
    expect(denied.body.error).toMatchObject({
      code: 'SHARED_CONTEXT_NOT_FOUND',
      message: 'This shared context is unavailable.',
    });
    expect(denied.body.error).not.toHaveProperty('stack');
    expect((await request(outsider.id, 'shared-contexts')).body).toEqual([]);
  });
  it('allows minimal Free preview but refuses joining and returns English plan errors', async () => {
    const i = await request(
      owner.id,
      `shared-contexts/${contextId}/invites`,
      'POST',
      { contextRevision: 0 },
      randomUUID(),
    );
    expect(i.response.status).toBe(201);
    inviteId = i.body.inviteId;
    token = i.body.token;
    const preview = await request(free.id, 'shared-invites/preview', 'POST', {
      token,
    });
    expect(preview.response.status).toBe(201);
    expect(JSON.stringify(preview.body)).not.toContain(owner.id);
    expect(preview.body).not.toHaveProperty('members');
    const refused = await request(
      free.id,
      `shared-invites/${inviteId}/accept`,
      'POST',
      {
        token,
        branchId: free.branchId,
        revision: free.revision,
        contextRevision: 1,
        sharingAcknowledged: true,
      },
      randomUUID(),
    );
    expect(refused.response.status).toBe(403);
    expect(refused.body.error.message).toBe(
      'Your plan does not include this shared context type.',
    );
  });
  it('accepts once, enforces revision and protects other members private data', async () => {
    const input = {
        token,
        branchId: guest.branchId,
        revision: guest.revision,
        contextRevision: 1,
        sharingAcknowledged: true,
      },
      key = randomUUID();
    const stale = await request(
      guest.id,
      `shared-invites/${inviteId}/accept`,
      'POST',
      { ...input, contextRevision: 0 },
      key,
    );
    expect(stale.response.status).toBe(409);
    const joined = await request(
      guest.id,
      `shared-invites/${inviteId}/accept`,
      'POST',
      input,
      key,
    );
    expect(joined.response.status).toBe(201);
    expect(
      (
        await request(
          guest.id,
          `shared-invites/${inviteId}/accept`,
          'POST',
          input,
          key,
        )
      ).body,
    ).toEqual(joined.body);
    const detail = await request(owner.id, 'shared-contexts/' + contextId);
    expect(detail.body.members).toHaveLength(2);
    for (const value of [
      guest.id,
      guest.branchId,
      guest.lifeId,
      'Private goal never shared',
      'Private employer never shared',
      token,
    ])
      expect(JSON.stringify(detail.body)).not.toContain(value);
    const denied = await request(
      guest.id,
      `shared-contexts/${contextId}/end`,
      'POST',
      { contextRevision: 2 },
      randomUUID(),
    );
    expect(denied.response.status).toBe(403);
  });
  it('allows leaving after downgrade while keeping the former member out of subsequent detail', async () => {
    await db.query(
      "UPDATE aw_user_entitlements SET tier='free' WHERE user_id=$1",
      [guest.id],
    );
    const body = { contextRevision: 2 },
      key = randomUUID();
    const left = await request(
      guest.id,
      `shared-contexts/${contextId}/leave`,
      'POST',
      body,
      key,
    );
    expect(left.response.status).toBe(201);
    expect(left.body.status).toBe('paused');
    expect(
      (
        await request(
          guest.id,
          `shared-contexts/${contextId}/leave`,
          'POST',
          body,
          key,
        )
      ).body,
    ).toEqual(left.body);
    expect(
      (await request(guest.id, 'shared-contexts/' + contextId)).response.status,
    ).toBe(404);
  });
});
