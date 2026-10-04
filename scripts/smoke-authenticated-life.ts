import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import {
  connectDatabase,
  Repository,
  LifeJobRepository,
  DatabaseAiBudget,
  type LifeJob,
} from '@future-flow/database';
import {
  OpenAiProvider,
  ExperimentAiBudget,
  combineAiGuards,
} from '@future-flow/ai';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { hash } from '@future-flow/core';
import type { LifeSetupV2 } from '@future-flow/contracts';
const require = createRequire(import.meta.url);
const { SupabaseAuthProvider } =
  require('../apps/api/dist/auth.js') as typeof import('../apps/api/src/auth');
const { createApp } =
  require('../apps/api/dist/app.js') as typeof import('../apps/api/src/app');
const { deleteAccount } =
  require('../apps/api/dist/account-deletion.js') as typeof import('../apps/api/src/account-deletion');

// Explicit developer smoke command: real Supabase and OpenAI, entirely synthetic accounts.
// It never emails anyone, never claims unrelated jobs, and deletes only accounts it creates.
async function main() {
  if (process.argv[2] !== '--run')
    throw new Error('Pass --run for this paid synthetic smoke.');
  const url = process.env.SUPABASE_URL ?? '',
    key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  const auth = new SupabaseAuthProvider(url, key);
  auth.assertDeletionConfigured();
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const db = connectDatabase(
      process.env.DATABASE_URL ?? '',
      process.env.DATABASE_SSL === 'true',
    ),
    repo = new Repository(db),
    jobs = new LifeJobRepository(db, 600);
  const runId = randomUUID(),
    directory = resolve('.local/auth-smoke', runId);
  mkdirSync(directory, { recursive: true });
  const accounts: {
      id: string;
      email: string;
      password: string;
      token: string;
    }[] = [],
    checks: string[] = [];
  let app: Awaited<ReturnType<typeof createApp>> | undefined,
    experiment: ExperimentAiBudget | undefined;
  const check = (condition: unknown, label: string) => {
    if (!condition) throw new Error(label);
    checks.push(label);
    console.log(`Passed: ${label}`);
  };
  try {
    for (let i = 0; i < 2; i++) {
      const email = `alterward-test-${runId}-${i}@example.invalid`,
        password = randomBytes(24).toString('base64url') + 'A1!';
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { alterward_synthetic_smoke: runId },
      });
      if (created.error || !created.data.user)
        throw new Error('Synthetic account creation failed.');
      accounts.push({ id: created.data.user.id, email, password, token: '' });
      const client = createClient(url, publicKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const signed = await client.auth.signInWithPassword({ email, password });
      if (signed.error || !signed.data.session)
        throw new Error('Password sign-in failed.');
      accounts[i]!.token = signed.data.session.access_token;
    }
    check(
      accounts.length === 2,
      'two real confirmed synthetic accounts, password sign-in',
    );
    app = await createApp(repo, auth);
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    async function request(
      path: string,
      method = 'GET',
      body?: unknown,
      owner = 0,
      keyValue = randomUUID(),
    ) {
      const response = await fetch(base + path, {
        method,
        headers: {
          Authorization: `Bearer ${accounts[owner]!.token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': keyValue,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          `HTTP ${response.status} ${result.error?.code ?? 'REQUEST_FAILED'}`,
        );
      return result;
    }
    await request('/api/v1/me/consent', 'POST', {
      adult: true,
      acknowledged: true,
    });
    const setup: LifeSetupV2 = {
      locale: 'en',
      identity: { mode: 'alternate', label: null, ageBand: '25_34' },
      location: { country: 'IE', region: null, housing: null },
      employment: {
        status: 'employed',
        employerLabel: 'Current team',
        workDomain: 'operations',
      },
      finance: { currency: 'EUR', monthlyIncome: 2200, liquidFunds: 3500 },
      skills: ['planning'],
      relationships: [],
      resources: { energy: null, availableHoursPerWeek: 6 },
      goal: {
        category: 'education',
        description: 'Build the skills to move into a data analysis role.',
        horizonMonths: 24,
        motivation: 'Work on problems that interest me.',
        acceptableTradeoffs: ['Use some evenings for study.'],
        unacceptableTradeoffs: [
          'Leave my job before there is a clear next step.',
        ],
      },
      stayInCountry: true,
      context: null,
    };
    await request('/api/v2/draft', 'PATCH', { revision: 0, payload: setup });
    check(
      (await request('/api/v2/draft')).revision === 1,
      'draft saved and restored',
    );
    const keyValue = randomUUID(),
      created = await request('/api/v2/lives', 'POST', setup, 0, keyValue);
    check(
      hash(await request('/api/v2/lives', 'POST', setup, 0, keyValue)) ===
        hash(created),
      'creation idempotency',
    );
    const forbidden = await fetch(
      base + `/api/v2/branches/${created.branchId}`,
      { headers: { Authorization: `Bearer ${accounts[1]!.token}` } },
    );
    check(
      forbidden.status === 404,
      'second account cannot read the private life',
    );
    const ledgerPath = resolve('.local/ai-smoke/usage.json'),
      before = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    experiment = new ExperimentAiBudget(
      ledgerPath,
      5,
      `authenticated-english-${runId}`,
    );
    async function generate(jobId: string) {
      const row = (
        await db.query<LifeJob>(
          "UPDATE aw_jobs SET status='running',attempt=attempt+1,lease_token=$3,lease_until=now()+interval '10 minutes' WHERE id=$1 AND user_id=$2 AND status='queued' RETURNING *",
          [jobId, accounts[0]!.id, randomUUID()],
        )
      )[0];
      if (!row) throw new Error('Synthetic job unavailable.');
      const guard = combineAiGuards(
        experiment!,
        new DatabaseAiBudget(db, accounts[0]!.id, row.id, {
          projectUsd: 5,
          userUsd: 1,
          initialProjectSpentUsd: before.accountedUsd,
        }),
      );
      const ai = new OpenAiProvider({
        apiKey: process.env.OPENAI_API_KEY ?? '',
        eventModel: process.env.AI_EVENT_MODEL ?? 'gpt-6.1-sol',
        storyModel: process.env.AI_STORY_MODEL ?? 'gpt-6.1-sol',
        checkModel: process.env.AI_CHECK_MODEL || 'gpt-6.1-sol',
        timeoutMs: 90000,
        maxOutputTokens: 8000,
        guard,
      });
      try {
        await processLifeJob(row, jobs, ai);
      } catch (error) {
        await jobs.fail(row, error);
        throw error;
      }
    }
    await generate(created.jobId);
    let detail = await request(`/api/v2/branches/${created.branchId}`);
    check(
      detail.periods.length === 1 && detail.branch.status === 'decision',
      'first real English AI period saved',
    );
    const sessionId = randomUUID(),
      firstPeriodId = detail.periods[0].id;
    for (const kind of ['life_opened', 'chapter_end_reached'])
      await request('/api/v2/interactions', 'POST', {
        eventId: randomUUID(),
        sessionId,
        branchId: created.branchId,
        periodId: kind === 'chapter_end_reached' ? firstPeriodId : null,
        kind,
      });
    const firstDecision = detail.branch.pending_decision;
    await request(`/api/v2/branches/${created.branchId}/choice`, 'POST', {
      revision: detail.branch.revision,
      decisionId: firstDecision.id,
      optionId: firstDecision.options[0].id,
    });
    detail = await request(`/api/v2/branches/${created.branchId}`);
    const continued = await request(
      `/api/v2/branches/${created.branchId}/continue`,
      'POST',
      { revision: detail.branch.revision, sessionId },
    );
    await generate(continued.jobId);
    detail = await request(`/api/v2/branches/${created.branchId}`);
    check(
      detail.periods.length === 2,
      'same-branch continuation and saved return state',
    );
    const parentHash = hash({
      branch: detail.branch,
      periods: detail.periods,
      choices: detail.choices,
    });
    const fork = await request(
      `/api/v2/branches/${created.branchId}/periods/${firstPeriodId}/fork`,
      'POST',
      {
        revision: detail.branch.revision,
        optionId: firstDecision.options[1].id,
      },
    );
    await generate(fork.jobId);
    const forkDetail = await request(`/api/v2/branches/${fork.branchId}`);
    const parentAfter = await request(`/api/v2/branches/${created.branchId}`);
    check(
      forkDetail.periods.length === 2 &&
        hash({
          branch: parentAfter.branch,
          periods: parentAfter.periods,
          choices: parentAfter.choices,
        }) === parentHash,
      'historical fork and unchanged parent',
    );
    await request('/api/v2/feedback', 'POST', {
      feedbackId: randomUUID(),
      branchId: created.branchId,
      periodId: firstPeriodId,
      category: 'experience',
      wouldContinue: 'yes',
      message: 'Synthetic integration check, not a real user assessment.',
    });
    // Reauthenticate: long AI calls must not bypass the five-minute privacy gate.
    const signed = await createClient(url, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth.signInWithPassword({
      email: accounts[0]!.email,
      password: accounts[0]!.password,
    });
    if (!signed.data.session) throw new Error('Reauthentication failed.');
    accounts[0]!.token = signed.data.session.access_token;
    const exported = await request('/api/v1/me/export');
    check(
      exported.aw_lives.length === 1 && exported.aw_feedback.length === 1,
      'fresh-auth export includes life, feedback and sessions',
    );
    writeFileSync(
      resolve(directory, 'synthetic-story.json'),
      JSON.stringify(
        {
          branch: detail.branch,
          periods: exported.aw_periods.filter(
            (p: { branch_id: string }) => p.branch_id === created.branchId,
          ),
          choices: exported.aw_choices,
        },
        null,
        2,
      ) + '\n',
    );
    writeFileSync(
      resolve(directory, 'story.md'),
      '# Authenticated English AI smoke\n\n' +
        detail.periods
          .map(
            (p: { chapter: { title: string; body: string } }) =>
              `## ${p.chapter.title}\n\n${p.chapter.body}`,
          )
          .join('\n\n') +
        '\n',
    );
    await request('/api/v1/me', 'DELETE', { confirmation: 'DELETE ACCOUNT' });
    check(
      !(await auth.userExists!(accounts[0]!.id)) &&
        !(
          await db.query('SELECT id FROM ff_users WHERE id=$1', [
            accounts[0]!.id,
          ])
        ).length,
      'real Auth and complete database account deletion',
    );
    for (const table of [
      'aw_feedback',
      'aw_activity_sessions',
      'aw_jobs',
      'aw_lives',
    ])
      check(
        !(
          await db.query(`SELECT user_id FROM ${table} WHERE user_id=$1`, [
            accounts[0]!.id,
          ])
        ).length,
        `${table} cleanup`,
      );
    const after = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    writeFileSync(
      resolve(directory, 'report.json'),
      JSON.stringify(
        {
          runId,
          checks,
          accountedDeltaUsd: after.accountedUsd - before.accountedUsd,
          remainingUsd: 5 - after.accountedUsd,
          scope:
            'HTTP integration with real Supabase/Auth/DB and OpenAI; browser UI and backup restore are separate checks.',
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`Report: .local/auth-smoke/${runId}/report.json`);
  } finally {
    experiment?.close();
    for (const account of accounts) {
      try {
        if (await auth.userExists!(account.id)) {
          await repo.ensureUser(account.id);
          await deleteAccount(repo, auth, account.id);
        }
      } catch {
        console.error(
          'Synthetic account cleanup needs attention; inspect this run before retrying.',
        );
        process.exitCode = 1;
      }
    }
    await app?.close();
    await db.close();
  }
}
main().catch((error: unknown) => {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === 'string' && /^[A-Z0-9_]+$/.test(code))
    console.error(`Failure code: ${code}`);
  if (error instanceof Error && /^HTTP \d{3} [A-Z_]+$/.test(error.message))
    console.error(error.message);
  console.error(
    'Authenticated smoke failed. Secrets and provider errors are withheld.',
  );
  process.exitCode = 1;
});
