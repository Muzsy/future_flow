import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hash } from '@future-flow/core';
import { ServiceAccessRepository, type Database } from '@future-flow/database';
import {
  SERVICE_PROBE_MAX_INPUT_BYTES,
  parseServiceProbeInput,
  runServiceProbe,
  type ProbeSession,
} from '../scripts/lib/service-operation-probe';

let engine: PGlite, session: ProbeSession, db: Database;
const context = () => ({
  sourceCommit: 'a'.repeat(40),
  imageId: 'sha256:' + 'b'.repeat(64),
  authoritySha256: 'c'.repeat(64),
  parentOperationSha256: 'd'.repeat(64),
  operatorSha256: 'e'.repeat(64),
  operationId: randomUUID(),
});
const text = (value: unknown) => JSON.stringify(value);
const parse = (value: unknown) => parseServiceProbeInput(text(value));
async function plan(request: unknown, ctx = context()) {
  const prepared = (await runServiceProbe(
    session,
    parse({ mode: 'service-prepare', context: ctx, request }),
  )) as { intent: Record<string, unknown>; intentSha256: string };
  expect(prepared.intentSha256).toBe(hash(prepared.intent));
  return { ctx, ...prepared };
}
const apply = (p: Awaited<ReturnType<typeof plan>>, sha = p.intentSha256) =>
  runServiceProbe(
    session,
    parse({
      mode: 'service-apply',
      context: p.ctx,
      intent: p.intent,
      intentSha256: sha,
    }),
  );
const reconcile = (p: Awaited<ReturnType<typeof plan>>) =>
  runServiceProbe(
    session,
    parse({
      mode: 'service-reconcile',
      context: p.ctx,
      intent: p.intent,
      intentSha256: p.intentSha256,
    }),
  ) as Promise<{ outcome: string }>;
const policy = async () =>
  (
    await db.query<{
      revision: string | number;
      mode: string;
      generation_enabled: boolean;
      admission_capacity: string | number;
      reconcile_required: boolean;
    }>(
      'SELECT revision,mode,generation_enabled,admission_capacity,reconcile_required FROM aw_service_policy',
    )
  )[0]!;
const revision = async () => Number((await policy()).revision);

beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon;CREATE ROLE authenticated');
  for (const name of readdirSync('database/migrations')
    .filter((name) => name.endsWith('.sql'))
    .sort())
    await engine.exec(readFileSync('database/migrations/' + name, 'utf8'));
  session = {
    query: async (sql, values) =>
      (await engine.query(sql, values)) as {
        rows: Record<string, unknown>[];
      },
  };
  db = {
    query: async (sql: string, values: unknown[] = []) =>
      (await engine.query(sql, values)).rows,
    transaction: (run) =>
      engine.transaction((tx) =>
        run({
          query: async (sql: string, values: unknown[] = []) =>
            (await tx.query(sql, values)).rows,
        } as Database),
      ),
  } as Database;
}, 30000);
afterAll(async () => engine?.close());
beforeEach(async () => {
  await db.query('TRUNCATE ff_users,aw_service_policy CASCADE');
});

describe('service operation probe input', () => {
  const ctx = context();
  it('accepts only the exact keys of each mode', () => {
    const request = { kind: 'bootstrap', members: [] };
    expect(() =>
      parse({ mode: 'service-prepare', context: ctx, request }),
    ).not.toThrow();
    for (const bad of [
      { mode: 'service-prepare', context: ctx, request, extra: 1 },
      { mode: 'service-prepare', context: ctx },
      { mode: 'service-prepare', request },
      { mode: 'registry-prepare', context: ctx, request },
      { mode: 'capture', context: ctx, request },
      { context: ctx, request },
      { mode: 'service-apply', context: ctx, intent: {} },
      {
        mode: 'service-apply',
        context: ctx,
        intent: {},
        intentSha256: 'xyz',
      },
      {
        mode: 'service-reconcile',
        context: ctx,
        intent: {},
        intentSha256: 'a'.repeat(64),
        request,
      },
      { mode: 'service-prepare', context: { ...ctx, extra: 1 }, request },
      { mode: 'service-prepare', context: ctx, request: 'bootstrap' },
    ])
      expect(() => parse(bad), text(bad)).toThrow();
    expect(() => parseServiceProbeInput('not json')).toThrow();
    expect(() => parseServiceProbeInput('null')).toThrow();
  });
  it('bounds the input size', () => {
    expect(() =>
      parseServiceProbeInput(' '.repeat(SERVICE_PROBE_MAX_INPUT_BYTES + 1)),
    ).toThrow('Bounded');
  });
  it('permits only auth-free kinds and refuses anything that would grant an account', () => {
    const ok = [
      { kind: 'policy', expectedPolicyRevision: 1 },
      { kind: 'wave', expectedPolicyRevision: 1, capacity: 10, open: true },
      { kind: 'restore-reconcile', expectedPolicyRevision: 1 },
      { kind: 'bootstrap', members: [] },
      {
        kind: 'admission',
        expectedPolicyRevision: 1,
        members: [
          { userId: randomUUID(), expectedRevision: 1, state: 'revoked' },
        ],
      },
    ];
    for (const request of ok)
      expect(() =>
        parse({ mode: 'service-prepare', context: ctx, request }),
      ).not.toThrow();
    const member = (state: string) => ({
      userId: randomUUID(),
      expectedRevision: 0,
      state,
    });
    for (const request of [
      { kind: 'bootstrap', members: [member('active')] },
      { kind: 'bootstrap', members: [member('revoked')] },
      { kind: 'bootstrap' },
      {
        kind: 'admission',
        expectedPolicyRevision: 1,
        members: [member('active')],
      },
      {
        kind: 'admission',
        expectedPolicyRevision: 1,
        members: [member('revoked'), member('active')],
      },
      { kind: 'admission', expectedPolicyRevision: 1, members: [] },
      { kind: 'admission', expectedPolicyRevision: 1 },
      { kind: 'sql', statement: 'DROP TABLE ff_users' },
      { expectedPolicyRevision: 1 },
    ])
      expect(
        () => parse({ mode: 'service-prepare', context: ctx, request }),
        text(request),
      ).toThrow('not permitted');
    // The same rule guards apply and reconcile, which carry the intent.
    expect(() =>
      parse({
        mode: 'service-apply',
        context: ctx,
        intent: { request: { kind: 'bootstrap', members: [member('active')] } },
        intentSha256: 'a'.repeat(64),
      }),
    ).toThrow('not permitted');
    expect(() =>
      parse({
        mode: 'service-reconcile',
        context: ctx,
        intent: {},
        intentSha256: 'a'.repeat(64),
      }),
    ).toThrow('not permitted');
  });
});

describe('service operation probe against the DB core', () => {
  async function bootstrap() {
    const p = await plan({ kind: 'bootstrap', members: [] });
    await apply(p);
    return p;
  }
  it('creates the closed paused policy, opens a wave, pauses, resumes and closes', async () => {
    await bootstrap();
    expect(await policy()).toMatchObject({
      mode: 'invitation',
      generation_enabled: false,
    });
    const open = await plan({
      kind: 'wave',
      expectedPolicyRevision: await revision(),
      capacity: 10,
      open: true,
    });
    await apply(open);
    expect(await policy()).toMatchObject({
      mode: 'open',
      admission_capacity: 10,
    });
    // Pause and resume during a wave keep the wave open.
    for (const generationEnabled of [true, false]) {
      const p = await plan({
        kind: 'policy',
        expectedPolicyRevision: await revision(),
        generationEnabled,
        checkoutEnabled: false,
      });
      await apply(p);
      expect(await policy()).toMatchObject({
        mode: 'open',
        generation_enabled: generationEnabled,
      });
    }
    const close = await plan({
      kind: 'wave',
      expectedPolicyRevision: await revision(),
      capacity: 10,
      open: false,
    });
    await apply(close);
    expect(await policy()).toMatchObject({ mode: 'invitation' });
  });
  it('revokes an admitted account without any provider call', async () => {
    await bootstrap();
    const id = randomUUID();
    await db.query('INSERT INTO ff_users(id) VALUES($1)', [id]);
    await new ServiceAccessRepository(db).replaceAdmission(id, 0, 'active');
    const p = await plan({
      kind: 'admission',
      expectedPolicyRevision: await revision(),
      members: [{ userId: id, expectedRevision: 1, state: 'revoked' }],
    });
    const receipt = (await apply(p)) as {
      authProviderWrites: boolean;
      paidAiCalls: number;
    };
    expect(receipt).toMatchObject({
      authProviderWrites: false,
      paidAiCalls: 0,
    });
    expect(
      await db.query(
        'SELECT state FROM aw_service_admissions WHERE user_id=$1',
        [id],
      ),
    ).toEqual([{ state: 'revoked' }]);
  });
  it('releases a restore quarantine only through restore-reconcile', async () => {
    await bootstrap();
    await db.query('UPDATE aw_service_policy SET reconcile_required=true');
    // An ordinary policy change cannot release the quarantine, already at
    // the prepare step.
    await expect(
      plan({
        kind: 'policy',
        expectedPolicyRevision: await revision(),
        generationEnabled: true,
        checkoutEnabled: true,
      }),
    ).rejects.toThrow('cannot release restore quarantine');
    expect((await policy()).reconcile_required).toBe(true);
    const release = await plan({
      kind: 'restore-reconcile',
      expectedPolicyRevision: await revision(),
    });
    await apply(release);
    expect(await policy()).toMatchObject({
      reconcile_required: false,
      mode: 'invitation',
      generation_enabled: false,
    });
  });
  it('reconciles read-only to committed or uncommitted and never retries SQL', async () => {
    await bootstrap();
    const p = await plan({
      kind: 'wave',
      expectedPolicyRevision: await revision(),
      capacity: 5,
      open: true,
    });
    const before = await revision();
    expect((await reconcile(p)).outcome).toBe('uncommitted');
    expect(await revision()).toBe(before);
    await apply(p);
    const after = await revision();
    expect((await reconcile(p)).outcome).toBe('committed');
    expect(await revision()).toBe(after);
    // A second apply of the same intent finds the state moved and refuses.
    await expect(apply(p)).rejects.toThrow();
    expect(await revision()).toBe(after);
  });
  it('refuses a different persisted-intent hash and a changed context before SQL', async () => {
    await bootstrap();
    const p = await plan({
      kind: 'wave',
      expectedPolicyRevision: await revision(),
      capacity: 5,
      open: true,
    });
    const before = await policy();
    await expect(apply(p, 'f'.repeat(64))).rejects.toThrow();
    await expect(
      runServiceProbe(
        session,
        parse({
          mode: 'service-apply',
          context: { ...p.ctx, operationId: randomUUID() },
          intent: p.intent,
          intentSha256: p.intentSha256,
        }),
      ),
    ).rejects.toThrow();
    expect(await policy()).toEqual(before);
  });
  it('rolls the read-only observation back and writes nothing in prepare or reconcile', async () => {
    await bootstrap();
    const state = async () =>
      hash([
        await policy(),
        await db.query('SELECT * FROM aw_service_admissions'),
      ]);
    const before = await state();
    const p = await plan({
      kind: 'wave',
      expectedPolicyRevision: await revision(),
      capacity: 5,
      open: true,
    });
    await reconcile(p);
    expect(await state()).toBe(before);
    // The session is left outside any transaction.
    const [row] = (await session.query('SHOW transaction_read_only')).rows;
    expect(row).toEqual({ transaction_read_only: 'off' });
  });
  it('has no Auth provider: an intent that would grant an account cannot be applied', async () => {
    await bootstrap();
    // Prepared by the DB core directly, bypassing the host-path input check.
    const id = randomUUID();
    const { prepareServiceOperation } =
      await import('../scripts/lib/service-operations');
    const ctx = context();
    const expectedPolicyRevision = await revision();
    const intent = await db.transaction(async (tx) => {
      await tx.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      );
      return prepareServiceOperation(
        tx,
        {
          kind: 'admission',
          expectedPolicyRevision,
          members: [{ userId: id, expectedRevision: 0, state: 'active' }],
        },
        ctx,
      );
    });
    await expect(
      runServiceProbe(session, {
        mode: 'service-apply',
        context: ctx,
        intent: intent as unknown as Record<string, unknown>,
        intentSha256: hash(intent),
      }),
    ).rejects.toThrow('not available on the host path');
    expect(await db.query('SELECT 1 FROM ff_users WHERE id=$1', [id])).toEqual(
      [],
    );
    expect(await db.query('SELECT 1 FROM aw_service_admissions')).toEqual([]);
  });
});
