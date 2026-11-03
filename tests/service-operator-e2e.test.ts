// Rehearsal of the whole host service-operator path: the real Python operator
// (service-profile record, hash-chained journal, persisted intents, lost-apply
// handling) talks to the real TypeScript probe and DB core on PGlite. Nothing
// touches Docker, the network, a provider or any host path outside a temp dir.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TERMS_ACCEPTANCE_VERSION } from '@future-flow/contracts';
import { hash } from '@future-flow/core';
import { ServiceAccessRepository, type Database } from '@future-flow/database';
import { reviewedMigrationManifest } from '../scripts/lib/reviewed-migration-manifest';
import {
  parseServiceProbeInput,
  runServiceProbe,
  type ProbeSession,
} from '../scripts/lib/service-operation-probe';

const posix = process.platform !== 'win32';
const bridge = join(__dirname, 'ops', 'service_operator_bridge.py');
let engine: PGlite, session: ProbeSession, db: Database, base: string;

type Outcome = { code: number | null; result?: any; refused?: string };

// Run one operator command; answer its probe requests with the real probe code.
function operate(command: string[], loseApply = false): Promise<Outcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'python3',
      [
        '-I',
        bridge,
        base,
        ...(loseApply ? ['--lose-apply'] : []),
        '--',
        ...command,
      ],
      { stdio: ['pipe', 'pipe', 'inherit'] },
    );
    const out: Outcome = { code: null };
    let buffer = '';
    let queue = Promise.resolve();
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop()!;
      for (const line of lines) {
        queue = queue.then(async () => {
          if (line.startsWith('PROBE ')) {
            let answer: unknown;
            try {
              const input = parseServiceProbeInput(line.slice(6));
              answer = {
                ok: true,
                value: await runServiceProbe(session, input),
              };
            } catch (error) {
              answer = { ok: false, error: String(error) };
            }
            child.stdin.write(JSON.stringify(answer) + '\n');
          } else if (line.startsWith('RESULT ')) {
            out.result = JSON.parse(line.slice(7));
          } else if (line.startsWith('REFUSED ')) {
            out.refused = line.slice(8);
          }
        });
      }
    });
    child.on('error', reject);
    child.on('close', (code) => {
      queue.then(() => resolve({ ...out, code }), reject);
    });
  });
}

const policy = async () =>
  (
    await db.query<{
      revision: string | number;
      mode: string;
      generation_enabled: boolean;
      checkout_enabled: boolean;
      reconcile_required: boolean;
      admission_capacity: number;
      admission_used: number;
    }>(
      'SELECT revision,mode,generation_enabled,checkout_enabled,reconcile_required,admission_capacity,admission_used FROM aw_service_policy',
    )
  )[0];
const events = () =>
  readFileSync(join(base, 'service-operations', 'journal.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { event: string; operationId: string });

async function admit(count: number) {
  const repo = new ServiceAccessRepository(db);
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = randomUUID();
    ids.push(id);
    expect(
      (await repo.admitOpenAccount(id, TERMS_ACCEPTANCE_VERSION)).status,
    ).toBe('admitted');
  }
  return ids;
}

beforeAll(async () => {
  engine = new PGlite();
  await engine.exec(
    'CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE ff_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());',
  );
  for (const name of readdirSync('database/migrations')
    .filter((name) => name.endsWith('.sql'))
    .sort())
    await engine.exec(readFileSync('database/migrations/' + name, 'utf8'));
  for (const m of reviewedMigrationManifest())
    await engine.query(
      'INSERT INTO ff_migrations(name,checksum) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [m.name, hash(m.sql)],
    );
  session = {
    query: async (sql, values) =>
      (await engine.query(sql, values)) as { rows: Record<string, unknown>[] },
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
  await db.query('TRUNCATE ff_users,ff_consents,aw_service_policy CASCADE');
  base?.length && rmSync(base, { recursive: true, force: true });
  base = mkdtempSync(join(tmpdir(), 'service-operator-e2e-'));
  if (posix) expect((await operate_setup()).code).toBe(0);
});
afterAll(() => base && rmSync(base, { recursive: true, force: true }));

function operate_setup(): Promise<{ code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-I', bridge, base, '--setup'], {
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code }));
  });
}

describe.skipIf(!posix)('service operator end to end (PGlite)', () => {
  it('runs a full wave cycle: bootstrap, open, auto-close at capacity, next wave, revoke, pause and resume', async () => {
    // Nothing yet: status shows the verified record and no policy.
    const empty = await operate(['status']);
    expect(empty.result.serviceProfile.verified).toBe(true);
    expect(empty.result.database.policy).toBeNull();

    expect((await operate(['bootstrap'])).code).toBe(0);
    expect(await policy()).toMatchObject({
      mode: 'invitation',
      admission_capacity: 0,
    });

    // The cost-exposing capacity needs the explicit confirmation of the added places.
    const unconfirmed = await operate(['wave', '--open', '--capacity', '3']);
    expect(unconfirmed.code).toBe(1);
    expect(unconfirmed.refused).toContain('--approve-added 3');
    expect(await policy()).toMatchObject({ mode: 'invitation' });
    expect(
      (
        await operate([
          'wave',
          '--open',
          '--capacity',
          '3',
          '--approve-added',
          '3',
        ])
      ).code,
    ).toBe(0);
    expect(await policy()).toMatchObject({
      mode: 'open',
      admission_capacity: 3,
      admission_used: 0,
    });

    // The registrations fill the wave; the database closes it by itself.
    const first = await admit(3);
    expect(await policy()).toMatchObject({
      mode: 'invitation',
      admission_used: 3,
    });

    // The next wave adds two places for exactly the confirmed amount.
    expect(
      (
        await operate([
          'wave',
          '--open',
          '--capacity',
          '5',
          '--approve-added',
          '1',
        ])
      ).code,
    ).toBe(1);
    expect(
      (
        await operate([
          'wave',
          '--open',
          '--capacity',
          '5',
          '--approve-added',
          '2',
        ])
      ).code,
    ).toBe(0);
    expect(await policy()).toMatchObject({
      mode: 'open',
      admission_capacity: 5,
      admission_used: 3,
    });
    expect((await operate(['wave', '--close'])).code).toBe(0);
    expect(await policy()).toMatchObject({
      mode: 'invitation',
      admission_capacity: 5,
    });

    // Revoking removes access without touching the Auth provider or the counter.
    const target = first[0]!;
    const revoked = await operate(['revoke', '--user', target]);
    expect(revoked.code).toBe(0);
    expect(
      await db.query(
        'SELECT state FROM aw_service_admissions WHERE user_id=$1',
        [target],
      ),
    ).toEqual([{ state: 'revoked' }]);
    expect((await operate(['revoke', '--user', target])).code).toBe(1);
    expect((await policy())?.admission_used).toBe(3);

    // Pause and resume.
    expect((await operate(['resume'])).code).toBe(0);
    expect(await policy()).toMatchObject({
      generation_enabled: true,
      checkout_enabled: true,
    });
    expect((await operate(['pause'])).code).toBe(0);
    expect(await policy()).toMatchObject({
      generation_enabled: false,
      checkout_enabled: false,
    });

    // Every step is on the verified journal chain, SQL always after its intent.
    const rows = events();
    expect(rows.length).toBeGreaterThan(10);
    for (const id of new Set(rows.map((r) => r.operationId))) {
      const names = rows
        .filter((r) => r.operationId === id)
        .map((r) => r.event);
      expect(names).toEqual(['intent-persisted', 'apply-started', 'applied']);
    }
    expect((await operate(['status'])).result.unfinishedOperations).toEqual([]);
  }, 120000);

  it('keeps a restored service closed until an explicit reconcile and a new wave', async () => {
    await operate(['bootstrap']);
    await operate([
      'wave',
      '--open',
      '--capacity',
      '2',
      '--approve-added',
      '2',
    ]);
    await admit(1);
    // What a database restore does: quarantine, closed, and no automatic reopening.
    await db.query(
      "UPDATE aw_service_policy SET reconcile_required=true,mode='invitation',revision=revision+1",
    );
    const resume = await operate(['resume']);
    expect(resume.code).toBe(1);
    expect(resume.refused).toContain('restore-reconcile');
    expect(
      (
        await operate([
          'wave',
          '--open',
          '--capacity',
          '3',
          '--approve-added',
          '1',
        ])
      ).code,
    ).toBe(1);
    expect((await operate(['restore-reconcile'])).code).toBe(0);
    expect(await policy()).toMatchObject({
      reconcile_required: false,
      mode: 'invitation',
      generation_enabled: false,
      checkout_enabled: false,
    });
    expect(
      (
        await operate([
          'wave',
          '--open',
          '--capacity',
          '2',
          '--approve-added',
          '0',
        ])
      ).code,
    ).toBe(0);
    expect(await policy()).toMatchObject({ mode: 'open' });
  }, 120000);

  it('never repeats SQL after a lost response: new operations wait for a read-only reconcile', async () => {
    await operate(['bootstrap']);
    const lost = await operate(['resume'], true);
    expect(lost.code).toBe(1);
    // The database did commit; the operator could not see the answer.
    expect(await policy()).toMatchObject({ generation_enabled: true });
    const blocked = await operate([
      'wave',
      '--open',
      '--capacity',
      '1',
      '--approve-added',
      '1',
    ]);
    expect(blocked.code).toBe(1);
    expect(await policy()).toMatchObject({ mode: 'invitation' });
    // The unknown operation can only be reconciled, never re-applied.
    const pending = events().find((r) => r.event === 'apply-unknown')!;
    const reconciled = await operate([
      'reconcile',
      '--operation-id',
      pending.operationId,
    ]);
    expect(reconciled.refused).toBeUndefined();
    expect(reconciled.code).toBe(0);
    expect(events().at(-1)!.event).toBe('reconciled-committed');
    expect(
      (
        await operate([
          'wave',
          '--open',
          '--capacity',
          '1',
          '--approve-added',
          '1',
        ])
      ).code,
    ).toBe(0);
    const started = events().filter(
      (r) =>
        r.operationId === pending.operationId && r.event === 'apply-started',
    );
    expect(started).toHaveLength(1);
  }, 120000);

  it('keeps emergency stops available while an unknown operation is pending, and refuses a drifted reconcile', async () => {
    await operate(['bootstrap']);
    expect((await operate(['resume'], true)).code).toBe(1);
    const pending = events().find((r) => r.event === 'apply-unknown')!;
    expect((await operate(['pause', '--emergency'])).code).toBe(0);
    expect(await policy()).toMatchObject({ generation_enabled: false });
    // The emergency stop changed the state after the unknown commit: the
    // readback matches neither side of the original intent, so the operator
    // refuses to guess and everything except further emergency stops stays blocked.
    const drifted = await operate([
      'reconcile',
      '--operation-id',
      pending.operationId,
    ]);
    expect(drifted.code).toBe(1);
    expect((await operate(['resume'])).code).toBe(1);
    expect((await operate(['pause', '--emergency'])).code).toBe(0);
    expect(events().filter((r) => r.event === 'apply-started')).toHaveLength(4);
  }, 120000);

  it('refuses to act when the service-profile record is tampered with', async () => {
    await operate(['bootstrap']);
    const head = join(base, 'service-profile', 'head.json');
    const text = readFileSync(head, 'utf8');
    writeFileSync(head, text.replace('"generation":1', '"generation":2'));
    chmodSync(head, 0o600);
    const refused = await operate(['pause']);
    expect(refused.code).toBe(1);
    expect(refused.refused).toContain('not verified');
    expect(await policy()).toMatchObject({ generation_enabled: false });
    const status = await operate(['status']);
    expect(status.result.serviceProfile.verified).toBe(false);
  }, 120000);
});
