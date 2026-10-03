import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { applyMigrations } from '../scripts/lib/migrations';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Repository, type Database } from '@future-flow/database';
import { questionnaire } from '@future-flow/contracts';
import { DomainError, hash } from '@future-flow/core';
import { createApp } from '../apps/api/src/app';
import { requireRecentAuthentication } from '../apps/api/src/auth';

let engine: PGlite, app: INestApplication, base: string;
const userId = randomUUID();
const token = `test.${Buffer.from(JSON.stringify({ amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }] })).toString('base64url')}.testsignature`;
beforeAll(async () => {
  engine = new PGlite();
  await applyMigrations(engine);
  function adapter(client: Pick<PGlite, 'query' | 'transaction'>): Database {
    return {
      query: async <T extends Record<string, unknown>>(
        text: string,
        values: unknown[] = [],
      ) => (await client.query<T>(text, values)).rows,
      transaction: (run) =>
        client.transaction((tx) => run(adapter(tx as unknown as PGlite))),
    };
  }
  const db = adapter(engine);
  await db.query(
    'INSERT INTO ff_questionnaires(version,definition,definition_hash) VALUES($1,$2,$3)',
    [questionnaire.version, JSON.stringify(questionnaire), hash(questionnaire)],
  );
  app = await createApp(new Repository(db), {
    verify: async (value) => {
      if (value !== token)
        throw new DomainError('AUTH_INVALID_TOKEN', 'Érvénytelen token.', 401);
      return { id: userId };
    },
    deleteUser: async () => {},
  });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  await engine?.close();
});
describe('API ownership boundary', () => {
  it('serves a public health check', async () => {
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
  });
  it('requires authentication for profile', async () => {
    const response = await fetch(`${base}/api/v1/profile`);
    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatchObject({
      code: 'AUTH_REQUIRED',
      message: 'Please sign in to continue.',
    });
  });
  it('localizes safe errors for Hungarian requests', async () => {
    const response = await fetch(`${base}/api/v1/profile`, {
      headers: { 'Accept-Language': 'hu-HU' },
    });
    expect((await response.json()).error.message).toBe(
      'Jelentkezz be a folytatáshoz.',
    );
  });
  it('does not trust an unverified token', async () => {
    const response = await fetch(`${base}/api/v1/profile`, {
      headers: { Authorization: 'Bearer invalid-token-with-enough-length' },
    });
    expect(response.status).toBe(401);
  });
  it('serves the actual shared questionnaire', async () => {
    const response = await fetch(`${base}/api/v1/questionnaires/current`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();
    expect(body.version).toBe(questionnaire.version);
    expect(body.locale).toBe('en-GB');
    const hungarian = await fetch(`${base}/api/v1/questionnaires/current`, {
      headers: { Authorization: `Bearer ${token}`, 'Accept-Language': 'hu' },
    });
    expect((await hungarian.json()).locale).toBe('hu-HU');
  });
  it('rejects invalid IDs with a safe error envelope', async () => {
    const response = await fetch(`${base}/api/v1/jobs/not-an-id`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(body.error.requestId).toBeTruthy();
    expect(body.error).not.toHaveProperty('stack');
  });
  it('publishes OpenAPI with bearer auth and request schema', async () => {
    const response = await fetch(`${base}/api/openapi.json`);
    const body = await response.json();
    expect(body.paths['/api/v1/futures'].post.requestBody).toBeTruthy();
    expect(body.components.securitySchemes.bearer).toBeTruthy();
  });
  it('does not let token refresh stand in for reauthentication', () => {
    const refreshed = `test.${Buffer.from(
      JSON.stringify({
        iat: Math.floor(Date.now() / 1000),
        amr: [
          { method: 'password', timestamp: 1 },
          { method: 'token_refresh', timestamp: Math.floor(Date.now() / 1000) },
        ],
      }),
    ).toString('base64url')}.test`;
    expect(() => requireRecentAuthentication(refreshed)).toThrow(
      'jelentkezz be újra',
    );
    expect(() => requireRecentAuthentication(token)).not.toThrow();
  });
});
