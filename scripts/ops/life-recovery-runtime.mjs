import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// Only the disposable, internally networked CI/Contabo PostgreSQL fixture.
// The production application never imports this runner or its synthetic AI.
assert.equal(process.platform, 'linux');
assert.equal(process.env.ALTERWARD_RECOVERY_FIXTURE, 'true');
assert(
  [
    'postgresql://postgres:rehearsal_unused@postgres:5432/postgres',
    'postgresql://postgres:ci_unused_outside_fixture@postgres:5432/postgres',
  ].includes(process.env.DATABASE_URL),
);
assert.equal(process.env.DATABASE_SSL_CA_FILE, '/run/secrets/supabase-ca.crt');
assert(
  [undefined, 'rehearsal_openai_unused', 'ci_openai_unused'].includes(
    process.env.OPENAI_API_KEY,
  ),
);
assert.equal(process.env.AI_PROJECT_BUDGET_USD, '0');
assert.equal(process.env.AI_USER_BUDGET_USD, '0');
assert(!process.env.ANTHROPIC_API_KEY);

const require = createRequire('/app/package.json');
const {
  connectDatabase,
  Repository,
  LifeRepository,
  LifeJobRepository,
} = require('@future-flow/database');
const { setupFixture } = await import('/app/tests/life-fixtures.ts');
const db = connectDatabase(process.env.DATABASE_URL, true);
const children = new Set();

// Each invocation is a separate Node process running the pinned image's actual
// compiled processor, repositories and cost guard, with a test-only AI adapter.
async function workerProcess() {
  const { createRequire } = await import('node:module');
  const require = createRequire('/app/package.json');
  const {
    connectDatabase,
    LifeJobRepository,
    DatabaseAiBudget,
  } = require('@future-flow/database');
  const { processLifeJob } = createRequire('/app/apps/worker/package.json')(
    './dist/life-processor.js',
  );
  const { lifeTestAi } = await import('/app/tests/life-fixtures.ts');
  const stopAt = process.env.RECOVERY_STOP_AT;
  const database = connectDatabase(process.env.DATABASE_URL, true);
  let heartbeat;
  async function barrier() {
    console.log('RECOVERY_BARRIER');
    await new Promise(() => {});
  }
  function instrument(client) {
    return {
      query: async (sql, values = []) => {
        const result = await client.query(sql, values);
        if (
          stopAt === 'COMMIT_INSERT' &&
          sql.startsWith('INSERT INTO aw_periods(')
        )
          await barrier();
        return result;
      },
      transaction: (run) => client.transaction((tx) => run(instrument(tx))),
    };
  }
  class InterruptedJobs extends LifeJobRepository {
    async checkpoint(job, stage, patch) {
      await super.checkpoint(job, stage, patch);
      if (stage === stopAt) await barrier();
    }
  }
  const jobs = new InterruptedJobs(instrument(database), 5);
  try {
    const job = await jobs.claim();
    if (!job || job.id !== process.env.RECOVERY_JOB_ID)
      throw Error('Unexpected fixture claim');
    console.log(JSON.stringify({ type: 'claim', lease: job.lease_token }));
    heartbeat = setInterval(() => {
      jobs.heartbeat(job).catch(() => {});
    }, 500);
    const guard = new DatabaseAiBudget(
      database,
      job.user_id,
      job.id,
      { projectUsd: 10, userUsd: 0.5 },
      job.lease_token,
    );
    async function call(task, run) {
      const id = await guard.reserve({
        model: 'gpt-6.1-sol',
        max_output_tokens: 100,
        input: [],
        text: { format: { name: task } },
      });
      const result = await run();
      await guard.settle(id, { input_tokens: 10, output_tokens: 20 });
      return result;
    }
    const ai = {
      period: (input, repair) =>
        call('life_period', () => lifeTestAi.period(input, repair)),
      periodChapter: (input, repair) =>
        call('life_chapter', async () => {
          const result = await lifeTestAi.periodChapter(input, repair);
          if (stopAt === 'CHAPTER_REJECTED' && !repair)
            result.output.body = Array.from(
              { length: 100 },
              (_, i) => `invalid${i}`,
            ).join(' ');
          if (process.env.RECOVERY_EXPECT_REPAIR === 'true' && !repair)
            throw Error('Lost repair instruction');
          return result;
        }),
      checkPeriodChapter: (input, chapter) =>
        call('life_fidelity', () =>
          lifeTestAi.checkPeriodChapter(input, chapter),
        ),
    };
    await processLifeJob(job, jobs, ai);
    console.log('RECOVERY_COMPLETE');
  } finally {
    clearInterval(heartbeat);
    await database.close();
  }
}

function launch(jobId, stopAt = '', expectRepair = false) {
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `(${workerProcess.toString()})().catch((e) => { console.error('RECOVERY_CHILD_FAILED', e?.name, e?.code ?? '', String(e?.message).slice(0, 500)); process.exitCode = 1; });`,
    ],
    {
      cwd: '/app',
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        DATABASE_URL: process.env.DATABASE_URL,
        DATABASE_SSL_CA_FILE: process.env.DATABASE_SSL_CA_FILE,
        RECOVERY_JOB_ID: jobId,
        RECOVERY_STOP_AT: stopAt,
        RECOVERY_EXPECT_REPAIR: String(expectRepair),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  children.add(child);
  const state = {
    stdout: '',
    stderr: '',
    lease: null,
    closed: false,
    code: null,
    signal: null,
  };
  child.stdout.on('data', (data) => {
    state.stdout = (state.stdout + data).slice(-8192);
    for (const line of state.stdout.split('\n')) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'claim') state.lease = entry.lease;
      } catch {}
    }
  });
  child.stderr.on('data', (data) => {
    state.stderr = (state.stderr + data).slice(-4096);
  });
  child.on('error', () => {
    state.closed = true;
    state.code = 1;
  });
  child.on('close', (code, signal) => {
    state.closed = true;
    state.code = code;
    state.signal = signal;
    children.delete(child);
  });
  return { child, state };
}
async function waitFor(check) {
  const deadline = Date.now() + 30000;
  while (!(await check())) {
    if (Date.now() > deadline) throw Error('Fixture recovery timeout');
    await delay(100);
  }
}
async function snapshot(jobId) {
  const [job] = await db.query(
    'SELECT status,stage,attempt,lease_token,checkpoints,lease_until>clock_timestamp() AS live_lease FROM aw_jobs WHERE id=$1',
    [jobId],
  );
  return job;
}
try {
  const [ssl] = await db.query(
    'SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()',
  );
  assert.equal(ssl.ssl, true);
  const [busy] = await db.query(
    "SELECT count(*)::int AS count FROM aw_jobs WHERE status IN ('queued','running')",
  );
  assert.equal(busy.count, 0, 'Fixture must have no competing life worker');
  const cases = [];
  for (const stage of [
    'EVENT_VALIDATION',
    'CHAPTER_REJECTED',
    'FIDELITY_CHECK',
    'COMMIT_INSERT',
  ]) {
    const userId = randomUUID();
    const repository = new Repository(db);
    await repository.ensureUser(userId);
    await repository.acceptPrivacy(userId);
    const lives = new LifeRepository(db);
    const created = await lives.create(userId, setupFixture(), randomUUID());
    const first = launch(created.jobId, stage);
    await waitFor(() => {
      if (first.state.closed)
        throw Error('Worker exited before barrier: ' + first.state.stderr);
      return first.state.stdout.includes('RECOVERY_BARRIER');
    });
    const before = await snapshot(created.jobId);
    assert.equal(before.status, 'running');
    assert.equal(before.attempt, 1);
    assert.equal(before.live_lease, true);
    assert.equal(before.lease_token, first.state.lease);
    const [uncommitted] = await db.query(
      'SELECT count(*)::int AS count FROM aw_periods WHERE life_id=$1',
      [created.lifeId],
    );
    assert.equal(uncommitted.count, 0);
    first.child.kill('SIGKILL');
    await waitFor(() => first.state.closed);
    assert.equal(first.state.signal, 'SIGKILL');
    assert.equal(
      await new LifeJobRepository(db, 5).claim(),
      null,
      'Live lease must not be stolen',
    );
    await waitFor(async () => !(await snapshot(created.jobId)).live_lease);
    const [rolledBack] = await db.query(
      'SELECT count(*)::int AS count FROM aw_periods WHERE life_id=$1',
      [created.lifeId],
    );
    assert.equal(rolledBack.count, 0);
    const second = launch(created.jobId, '', stage === 'CHAPTER_REJECTED');
    await waitFor(() => second.state.closed);
    assert.equal(
      second.state.code,
      0,
      'Restarted fixture worker failed: ' + second.state.stderr,
    );
    assert(second.state.stdout.includes('RECOVERY_COMPLETE'));
    assert.notEqual(second.state.lease, first.state.lease);
    const completed = await snapshot(created.jobId);
    assert.equal(completed.status, 'completed');
    const freeFinish = ['FIDELITY_CHECK', 'COMMIT_INSERT'].includes(stage);
    assert.equal(completed.attempt, freeFinish ? 1 : 2);
    const [counts] = await db.query(
      `SELECT
      (SELECT count(*)::int FROM aw_periods WHERE life_id=$1) AS periods,
      (SELECT count(*)::int FROM aw_history WHERE life_id=$1) AS history,
      (SELECT revision FROM aw_branches WHERE id=$2) AS revision,
      (SELECT count(*)::int FROM aw_budget_reservations WHERE job_id=$3) AS reservations,
      (SELECT count(*)::int FROM aw_budget_reservations WHERE job_id=$3 AND status<>'completed') AS unsettled`,
      [created.lifeId, created.branchId, created.jobId],
    );
    assert.deepEqual(counts, {
      periods: 1,
      history: 1,
      revision: 1,
      reservations: stage === 'CHAPTER_REJECTED' ? 4 : 3,
      unsettled: 0,
    });
    assert.equal(await new LifeJobRepository(db, 5).claim(), null);
    cases.push({
      stage,
      killedWith: 'SIGKILL',
      earlyTakeoverDenied: true,
      newLeaseVerified: true,
      singleCommit: true,
      reservations: counts.reservations,
      fundedAttempts: completed.attempt,
      repairInstructionPreserved: stage === 'CHAPTER_REJECTED',
      cachedValidationFinishedWithoutNewReservation: freeFinish,
      openTransactionRolledBack: stage === 'COMMIT_INSERT',
    });
  }
  console.log(
    JSON.stringify({
      processRecovery: 'passed',
      compiledProcessor: true,
      realPostgres: true,
      databaseTls: true,
      isolatedNodeProcesses: true,
      containerMainKilled: false,
      fixtureLeaseSeconds: 5,
      elapsedLeaseExpiry: true,
      syntheticAiOnly: true,
      paidAiCalls: 0,
      cases,
    }),
  );
} finally {
  for (const child of children) child.kill('SIGKILL');
  await db.close();
}
