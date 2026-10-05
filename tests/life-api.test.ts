import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  Repository,
  LifeJobRepository,
  type Database,
} from '@future-flow/database';
import { DomainError } from '@future-flow/core';
import { createApp } from '../apps/api/src/app';
import { applyMigrations } from '../scripts/lib/migrations';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { setupFixture, lifeTestAi } from './life-fixtures';

let engine: PGlite,
  app: INestApplication,
  base: string,
  jobs: LifeJobRepository;
const owner = randomUUID(),
  other = randomUUID(),
  token = 'synthetic-test-token-abcdefghijkl',
  otherToken = 'synthetic-test-token-other-abcdef';
function adapter(client: Pick<PGlite, 'query' | 'transaction'>): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await client.query<T>(sql, values)).rows,
    transaction: (run) =>
      client.transaction((tx) => run(adapter(tx as unknown as PGlite))),
  };
}
beforeAll(async () => {
  engine = new PGlite();
  await applyMigrations(engine);
  const db = adapter(engine);
  jobs = new LifeJobRepository(db);
  app = await createApp(new Repository(db), {
    verify: async (value) => {
      if (value === token) return { id: owner };
      if (value === otherToken) return { id: other };
      throw new DomainError('AUTH_INVALID_TOKEN', 'Invalid.', 401);
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
function request(
  path: string,
  method = 'GET',
  body?: unknown,
  key = 'api-test-key-001',
  auth = token,
  locale = 'en',
) {
  return fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${auth}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
      'Accept-Language': locale,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
describe.sequential('versioned private life API', () => {
  let created: { lifeId: string; branchId: string; jobId: string };
  it('requires real verified authentication and consent at the API boundary', async () => {
    expect((await fetch(base + '/api/v2/lives')).status).toBe(401);
    expect(
      (await request('/api/v2/lives', 'POST', setupFixture())).status,
    ).toBe(403);
    expect(
      (
        await request('/api/v1/me/consent', 'POST', {
          adult: true,
          acknowledged: true,
        })
      ).status,
    ).toBe(201);
  });
  it('keeps short drafts separate from the legacy profile', async () => {
    const s = setupFixture();
    s.goal.description = '';
    expect(
      (await request('/api/v2/draft', 'PATCH', { revision: 0, payload: s }))
        .status,
    ).toBe(200);
    const draft = await (await request('/api/v2/draft')).json();
    expect(draft.revision).toBe(1);
    expect(
      (await request('/api/v2/draft', 'PATCH', { revision: 0, payload: s }))
        .status,
    ).toBe(409);
  });
  it('creates privately once, rejects unknown fields and protects ownership', async () => {
    const s = setupFixture('en');
    const first = await request('/api/v2/lives', 'POST', s);
    expect(first.status).toBe(201);
    created = await first.json();
    expect(await (await request('/api/v2/lives', 'POST', s)).json()).toEqual(
      created,
    );
    expect(
      (
        await request(
          '/api/v2/lives',
          'POST',
          { ...s, visibility: 'public' },
          'unknown-field-key',
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await request(
          `/api/v2/branches/${created.branchId}`,
          'GET',
          undefined,
          'unused',
          otherToken,
        )
      ).status,
    ).toBe(404);
  });
  it('chooses and continues in the same branch with explicit revisions', async () => {
    const job = (await jobs.claim())!;
    await processLifeJob(job, jobs, lifeTestAi);
    const detail = await (
        await request(`/api/v2/branches/${created.branchId}`)
      ).json(),
      d = detail.branch.pending_decision;
    const pending = await request(
      `/api/v2/branches/${created.branchId}/continue`,
      'POST',
      { revision: 1 },
      'pending-continue-api',
      token,
      'hu',
    );
    expect(pending.status).toBe(409);
    expect((await pending.json()).error.message).toContain('Choose');
    const choice = await request(
      `/api/v2/branches/${created.branchId}/choice`,
      'POST',
      { revision: 1, decisionId: d.id, optionId: d.options[0].id },
      'choice-api-001',
    );
    expect(choice.status).toBe(201);
    const continued = await request(
      `/api/v2/branches/${created.branchId}/continue`,
      'POST',
      { revision: 2 },
      'continue-api-001',
    );
    expect((await continued.json()).branchId).toBe(created.branchId);
  });
  it('keeps a public preview private with no publish action or anonymous reader', async () => {
    await processLifeJob((await jobs.claim())!, jobs, lifeTestAi);
    const detail = await (
      await request(`/api/v2/branches/${created.branchId}`)
    ).json();
    const copy = {
      title: 'An alternative working life',
      summary: 'A fictional adult explores a possible career through choices.',
      category: 'career',
      goalDescription: 'Explore a different career',
      periods: detail.periods.map((p: any) => ({
        chapter: { title: p.chapter.title, body: p.chapter.body },
        events: p.candidate.events.map((e: any) => ({
          title: e.title,
          summary: e.summary,
        })),
        decision: {
          prompt: p.candidate.events.at(-1).decision.prompt,
          options: p.candidate.events.at(-1).decision.options.map((o: any) => ({
            label: o.label,
            description: o.description,
          })),
        },
      })),
    };
    const response = await request(
      `/api/v2/branches/${created.branchId}/public-preview`,
      'POST',
      { revision: detail.branch.revision, copy },
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const preview = await response.json();
    expect(preview.status).toBe('awaiting_review');
    expect(preview.snapshot.startingPoint.readyForFork).toBe(false);
    const reviewPath = `/api/v2/public-previews/${preview.draftId}/review`;
    const review = await request(reviewPath);
    expect(review.status).toBe(200);
    expect(review.headers.get('cache-control')).toBe('no-store');
    expect(await review.json()).toEqual({
      status: 'not_started',
      publicationApproved: false,
    });
    expect((await fetch(base + reviewPath)).status).toBe(401);
    expect(
      (await request(reviewPath, 'GET', undefined, 'unused', otherToken))
        .status,
    ).toBe(404);
    expect((await request(reviewPath, 'POST', {})).status).toBe(404);
    expect(
      (await request(`/api/v2/public-previews/${preview.draftId}`)).status,
    ).toBe(200);
    expect(
      (await fetch(base + `/api/v2/public-previews/${preview.draftId}`)).status,
    ).toBe(401);
    expect(
      (
        await request(
          `/api/v2/public-previews/${preview.draftId}`,
          'GET',
          undefined,
          'unused',
          otherToken,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/api/v2/public-previews/${preview.draftId}/publish`,
          'POST',
          {},
        )
      ).status,
    ).toBe(404);
  });
});
