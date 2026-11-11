import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { INestApplication } from '@nestjs/common';
import {
  LifeRepository,
  Repository,
  type Database,
} from '@future-flow/database';
import { questionnaire } from '@future-flow/contracts';
import { hash } from '@future-flow/core';
import { createApp } from '../apps/api/src/app';
import { applyMigrations } from '../scripts/lib/migrations';
import { answers } from './fixtures';
import { setupFixture } from './life-fixtures';

let engine: PGlite,
  app: INestApplication,
  base: string,
  repo: Repository,
  lives: LifeRepository;
const userId = randomUUID();
const token = `test.${Buffer.from(JSON.stringify({ amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }] })).toString('base64url')}.testsignature`;
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
  repo = new Repository(db, { daily: 20, concurrent: 8 });
  lives = new LifeRepository(db);
  app = await createApp(repo, {
    verify: async () => ({ id: userId }),
    deleteUser: async () => {},
  });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  await repo.ensureUser(userId);
  await repo.acceptPrivacy(userId);
  await db.query(
    'INSERT INTO ff_questionnaires(version,definition,definition_hash) VALUES($1,$2,$3)',
    [questionnaire.version, JSON.stringify(questionnaire), hash(questionnaire)],
  );
});
afterAll(async () => {
  await app?.close();
  await engine?.close();
});
function request(path: string, method = 'GET', body?: unknown) {
  return fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept-Language': 'hu',
      'Idempotency-Key': randomUUID(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
describe.sequential('English release boundary', () => {
  it('rejects Hungarian creates and drafts before queuing generation', async () => {
    expect(
      (await request('/api/v2/lives', 'POST', setupFixture('hu'))).status,
    ).toBe(422);
    expect(
      (
        await request('/api/v2/draft', 'PATCH', {
          revision: 0,
          payload: setupFixture('hu'),
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request('/api/v1/futures', 'POST', {
          profileVersionId: randomUUID(),
          horizonYears: 10,
          mode: 'baseline',
          locale: 'hu',
        })
      ).status,
    ).toBe(422);
    expect((await engine.query('SELECT id FROM aw_jobs')).rows).toHaveLength(0);
    expect((await engine.query('SELECT id FROM ff_jobs')).rows).toHaveLength(0);
  });
  it('hides stored Hungarian lives and blocks direct reads and paid mutations', async () => {
    const hidden = await lives.create(
      userId,
      setupFixture('hu'),
      'hidden-hu-life',
    );
    const english = await lives.create(
      userId,
      setupFixture('en'),
      'visible-en-life',
    );
    const saved = await lives.branch(userId, hidden.branchId);
    const list = await (await request('/api/v2/lives')).json();
    expect(list.map((item: { id: string }) => item.id)).toEqual([
      english.lifeId,
    ]);
    expect((await request(`/api/v2/branches/${hidden.branchId}`)).status).toBe(
      404,
    );
    for (const [path, body] of [
      [`/api/v2/branches/${hidden.branchId}/continue`, { revision: 0 }],
      [
        `/api/v2/branches/${hidden.branchId}/public-preview/check`,
        {
          revision: 0,
          copy: {
            title: 'An English copy',
            summary: 'A fictional life with an English preview.',
            category: 'career',
            goalDescription: 'Explore a new career',
            periods: [
              {
                chapter: {
                  title: 'A first chapter',
                  body: 'A technical test story. '.repeat(30),
                },
                events: [
                  {
                    title: 'A first step',
                    summary: 'A small technical test step.',
                  },
                  {
                    title: 'A second step',
                    summary: 'A further technical test step.',
                  },
                ],
                decision: {
                  prompt: 'Which step should be considered?',
                  options: [
                    {
                      label: 'A possible first choice',
                      description: 'An uncertain technical choice.',
                    },
                    {
                      label: 'A possible second choice',
                      description: 'A different technical choice.',
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
      [
        `/api/v2/branches/${hidden.branchId}/choice`,
        { revision: 0, decisionId: randomUUID(), optionId: randomUUID() },
      ],
      [
        `/api/v2/branches/${hidden.branchId}/periods/${randomUUID()}/fork`,
        { revision: 0, optionId: randomUUID() },
      ],
      [`/api/v2/jobs/${hidden.jobId}/retry`, { revision: 0 }],
    ] as const)
      expect((await request(path, 'POST', body)).status).toBe(404);
    expect(await lives.branch(userId, hidden.branchId)).toEqual(saved);
    expect((await engine.query('SELECT id FROM aw_jobs')).rows).toHaveLength(2);
    const exported = await (await request('/api/v1/me/export')).json();
    expect(exported.aw_lives.map((item: { id: string }) => item.id)).toContain(
      hidden.lifeId,
    );
  });
  it('hides Hungarian legacy branches, futures, jobs and timelines without changing canon', async () => {
    await repo.saveDraft(userId, 0, answers, []);
    const { profileVersionId } = await repo.commitProfile(userId, 1);
    const hidden = await repo.createFuture(
      userId,
      profileVersionId,
      'hidden-hu-future',
      'hu',
    );
    const english = await repo.createFuture(
      userId,
      profileVersionId,
      'visible-en-future',
      'en',
    );
    const saved = await repo.future(userId, hidden.futureId);
    const list = await (await request('/api/v1/futures')).json();
    expect(list.map((item: { id: string }) => item.id)).toEqual([
      english.futureId,
    ]);
    for (const path of [
      `/api/v1/futures/${hidden.futureId}`,
      `/api/v1/branches/${hidden.branchId}`,
      `/api/v1/branches/${hidden.branchId}/timeline`,
      `/api/v1/jobs/${hidden.jobId}`,
    ])
      expect((await request(path)).status).toBe(404);
    expect(await repo.future(userId, hidden.futureId)).toEqual(saved);
  });
  it('uses the English deletion confirmation shown by the interface', async () => {
    expect(
      (await request('/api/v1/me', 'DELETE', { confirmation: 'FIÓK TÖRLÉSE' }))
        .status,
    ).toBe(422);
    expect(
      (
        await request('/api/v1/me', 'DELETE', {
          confirmation: 'DELETE ACCOUNT',
        })
      ).status,
    ).toBe(200);
    expect(
      (await engine.query('SELECT id FROM aw_lives WHERE user_id=$1', [userId]))
        .rows,
    ).toHaveLength(0);
  });
});
