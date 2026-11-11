import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  Repository,
  LifeRepository,
  LifeJobRepository,
  privateMetricsSummary,
  type Database,
} from '@future-flow/database';
import { DomainError } from '@future-flow/core';
import { createApp } from '../apps/api/src/app';
import { applyMigrations } from '../scripts/lib/migrations';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { setupFixture, lifeTestAi } from './life-fixtures';
let engine: PGlite,
  db: Database,
  app: INestApplication,
  base: string,
  lives: LifeRepository,
  repo: Repository,
  jobs: LifeJobRepository;
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
const tokens = new Map<string, string>();
function token(userId: string) {
  const value = `synthetic.${Buffer.from(JSON.stringify({ sub: userId, amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }] })).toString('base64url')}.signature`;
  tokens.set(value, userId);
  return value;
}
function request(
  userId: string,
  path: string,
  method = 'GET',
  body?: unknown,
  key = randomUUID(),
) {
  return fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${token(userId)}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function account() {
  const id = randomUUID();
  await repo.ensureUser(id);
  await repo.acceptPrivacy(id);
  return id;
}
async function finishedLife(userId: string) {
  const created = await lives.create(userId, setupFixture(), randomUUID());
  const job = (await jobs.claim())!;
  expect(job.id).toBe(created.jobId);
  await processLifeJob(job, jobs, lifeTestAi);
  return { created, detail: await lives.detail(userId, created.branchId) };
}
beforeAll(async () => {
  engine = new PGlite();
  await applyMigrations(engine);
  db = adapter(engine);
  repo = new Repository(db);
  lives = new LifeRepository(db);
  jobs = new LifeJobRepository(db);
  app = await createApp(repo, {
    verify: async (value) => {
      const id = tokens.get(value);
      if (!id) throw new DomainError('AUTH_INVALID_TOKEN', 'Invalid.', 401);
      return { id };
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
describe.sequential(
  'private English beta feedback and session measurements',
  () => {
    it('requires authentication, validates feedback, and rejects another owner or unrelated chapter', async () => {
      const owner = await account(),
        other = await account(),
        { created, detail } = await finishedLife(owner);
      const input = {
        feedbackId: randomUUID(),
        branchId: created.branchId,
        periodId: String(detail.periods[0]!.id),
        category: 'language',
        wouldContinue: null,
        message: 'This sentence was difficult to follow.',
      };
      expect(
        (
          await fetch(base + '/api/v2/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
          })
        ).status,
      ).toBe(401);
      expect(
        (await request(other, '/api/v2/feedback', 'POST', input)).status,
      ).toBe(404);
      expect(
        (
          await request(owner, '/api/v2/feedback', 'POST', {
            ...input,
            periodId: randomUUID(),
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await request(owner, '/api/v2/feedback', 'POST', {
            ...input,
            message: null,
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await request(owner, '/api/v2/feedback', 'POST', {
            ...input,
            rawProfile: 'unexpected',
          })
        ).status,
      ).toBe(422);
      expect(
        (await request(owner, '/api/v2/feedback', 'POST', input)).status,
      ).toBe(201);
      expect((await request(owner, '/api/v2/feedback', 'GET')).status).toBe(
        404,
      );
    });
    it('retries feedback once, limits new submissions, and exports and deletes all feedback/session data', async () => {
      const owner = await account();
      const input = {
        feedbackId: randomUUID(),
        branchId: null,
        periodId: null,
        category: 'experience',
        wouldContinue: 'yes',
        message: null,
      };
      const first = await (
        await request(owner, '/api/v2/feedback', 'POST', input)
      ).json();
      expect(
        await (await request(owner, '/api/v2/feedback', 'POST', input)).json(),
      ).toEqual(first);
      expect(
        (
          await request(owner, '/api/v2/feedback', 'POST', {
            ...input,
            wouldContinue: 'no',
          })
        ).status,
      ).toBe(409);
      for (let i = 0; i < 4; i++)
        expect(
          (
            await request(owner, '/api/v2/feedback', 'POST', {
              ...input,
              feedbackId: randomUUID(),
            })
          ).status,
        ).toBe(201);
      expect(
        (
          await request(owner, '/api/v2/feedback', 'POST', {
            ...input,
            feedbackId: randomUUID(),
          })
        ).status,
      ).toBe(429);
      expect(
        (await request(owner, '/api/v2/feedback', 'POST', input)).status,
      ).toBe(201);
      await lives.interaction(owner, {
        eventId: randomUUID(),
        sessionId: randomUUID(),
        branchId: null,
        kind: 'onboarding_started',
      });
      const exported = await (await request(owner, '/api/v1/me/export')).json();
      expect(exported.aw_feedback).toHaveLength(5);
      expect(exported.aw_activity_sessions).toHaveLength(1);
      expect(
        (
          await request(owner, '/api/v1/me', 'DELETE', {
            confirmation: 'DELETE ACCOUNT',
          })
        ).status,
      ).toBe(200);
      for (const table of [
        'aw_feedback',
        'aw_activity_sessions',
        'aw_interactions',
      ])
        expect(
          await db.query(`SELECT * FROM ${table} WHERE user_id=$1`, [owner]),
        ).toEqual([]);
    });
    it('records chapter-specific signals once and enforces period ownership', async () => {
      const owner = await account(),
        { created, detail } = await finishedLife(owner),
        sessionId = randomUUID();
      const input = {
        eventId: randomUUID(),
        sessionId,
        branchId: created.branchId,
        periodId: String(detail.periods[0]!.id),
        kind: 'chapter_end_reached',
      };
      expect(
        (await request(owner, '/api/v2/interactions', 'POST', input)).status,
      ).toBe(201);
      expect(
        (await request(owner, '/api/v2/interactions', 'POST', input)).status,
      ).toBe(201);
      expect(
        (
          await request(owner, '/api/v2/interactions', 'POST', {
            ...input,
            kind: 'life_opened',
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await request(owner, '/api/v2/interactions', 'POST', {
            ...input,
            eventId: randomUUID(),
            periodId: randomUUID(),
          })
        ).status,
      ).toBe(404);
      expect(
        await db.query('SELECT id FROM aw_interactions WHERE id=$1', [
          input.eventId,
        ]),
      ).toHaveLength(1);
    });
    it('uses server inactivity boundaries and keeps identical browser identifiers separate across accounts', async () => {
      const owner = await account(),
        other = await account(),
        clientId = randomUUID();
      const interaction = (userId: string) =>
        lives.interaction(userId, {
          eventId: randomUUID(),
          sessionId: clientId,
          branchId: null,
          kind: 'onboarding_started',
        });
      await interaction(owner);
      await interaction(owner);
      await interaction(other);
      expect(
        await db.query('SELECT id FROM aw_activity_sessions WHERE user_id=$1', [
          owner,
        ]),
      ).toHaveLength(1);
      await db.query(
        "UPDATE aw_activity_sessions SET started_at=now()-interval '40 minutes',last_seen_at=now()-interval '31 minutes' WHERE user_id=$1",
        [owner],
      );
      await interaction(owner);
      expect(
        await db.query('SELECT id FROM aw_activity_sessions WHERE user_id=$1', [
          owner,
        ]),
      ).toHaveLength(2);
      expect(
        await db.query('SELECT id FROM aw_activity_sessions WHERE user_id=$1', [
          other,
        ]),
      ).toHaveLength(1);
    });
    it('separates clicks, failed jobs, successful continuations, and later sessions with immutable retry attribution', async () => {
      const before = await privateMetricsSummary(db),
        owner = await account(),
        { created, detail } = await finishedLife(owner),
        clientId = randomUUID();
      await lives.interaction(owner, {
        eventId: randomUUID(),
        sessionId: clientId,
        branchId: created.branchId,
        kind: 'life_opened',
      });
      await lives.interaction(owner, {
        eventId: randomUUID(),
        sessionId: clientId,
        branchId: created.branchId,
        periodId: String(detail.periods[0]!.id),
        kind: 'chapter_end_reached',
      });
      await lives.interaction(owner, {
        eventId: randomUUID(),
        sessionId: clientId,
        branchId: created.branchId,
        kind: 'continuation_clicked',
      });
      const decision = detail.branch.pending_decision!;
      await lives.choose(
        owner,
        created.branchId,
        1,
        decision.id,
        decision.options[0]!.id,
        randomUUID(),
      );
      const continuationKey = randomUUID(),
        queued = await lives.continue(
          owner,
          created.branchId,
          2,
          continuationKey,
          clientId,
        );
      expect(
        await lives.continue(
          owner,
          created.branchId,
          2,
          continuationKey,
          clientId,
        ),
      ).toEqual(queued);
      await expect(
        lives.continue(
          owner,
          created.branchId,
          2,
          continuationKey,
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
      const pending = await privateMetricsSummary(db);
      expect(pending.continuedLifeSessions).toBe(before.continuedLifeSessions);
      const claimed = (await jobs.claim())!;
      await jobs.fail(claimed, new DomainError('TEST_FAILURE', 'Synthetic.'));
      expect(
        Number((await privateMetricsSummary(db)).failed_session_continuations),
      ).toBe(Number(before.failed_session_continuations) + 1);
      await lives.retry(owner, queued.jobId, 2, randomUUID());
      await processLifeJob((await jobs.claim())!, jobs, lifeTestAi);
      const after = await privateMetricsSummary(db);
      expect(after.continuedLifeSessions).toBe(
        before.continuedLifeSessions + 1,
      );
      expect(after.laterContinuedLifeSessions).toBe(
        before.laterContinuedLifeSessions,
      );
      expect(Number(after.read_cohort_continued_lives)).toBe(
        Number(before.read_cohort_continued_lives) + 1,
      );
      await db.query(
        "UPDATE aw_activity_sessions SET started_at=now()-interval '40 minutes',last_seen_at=now()-interval '31 minutes' WHERE user_id=$1",
        [owner],
      );
      await lives.interaction(owner, {
        eventId: randomUUID(),
        sessionId: clientId,
        branchId: created.branchId,
        kind: 'life_opened',
      });
      const next = await lives.detail(owner, created.branchId),
        d = next.branch.pending_decision!;
      await lives.choose(
        owner,
        created.branchId,
        next.branch.revision,
        d.id,
        d.options[0]!.id,
        randomUUID(),
      );
      const ready = await lives.branch(owner, created.branchId);
      await lives.continue(
        owner,
        created.branchId,
        ready.revision,
        randomUUID(),
        clientId,
      );
      await processLifeJob((await jobs.claim())!, jobs, lifeTestAi);
      const returned = await privateMetricsSummary(db);
      expect(returned.continuedLifeSessions).toBe(
        before.continuedLifeSessions + 2,
      );
      expect(returned.laterContinuedLifeSessions).toBe(
        before.laterContinuedLifeSessions + 1,
      );
      expect(Number(returned.returned_lives)).toBe(
        Number(before.returned_lives) + 1,
      );
    });
    it('protects the new tables and blocks feedback from deleting accounts or hidden Hungarian lives', async () => {
      const owner = await account();
      const hu = await lives.create(owner, setupFixture('hu'), randomUUID());
      const input = {
        feedbackId: randomUUID(),
        branchId: hu.branchId,
        periodId: null,
        category: 'experience',
        wouldContinue: 'yes',
        message: null,
      };
      expect(
        (await request(owner, '/api/v2/feedback', 'POST', input)).status,
      ).toBe(404);
      await db.query("UPDATE aw_jobs SET status='cancelled' WHERE id=$1", [
        hu.jobId,
      ]);
      await repo.markDeleting(owner);
      expect(
        (
          await request(owner, '/api/v2/feedback', 'POST', {
            ...input,
            branchId: null,
          })
        ).status,
      ).toBe(403);
      const protectedTables = await db.query(
        "SELECT tablename,rowsecurity FROM pg_tables WHERE tablename IN ('aw_feedback','aw_activity_sessions')",
      );
      expect(protectedTables).toHaveLength(2);
      expect(protectedTables.every((row) => row.rowsecurity === true)).toBe(
        true,
      );
    });
  },
);
