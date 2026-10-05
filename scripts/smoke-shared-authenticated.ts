import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import {
  connectDatabase,
  Repository,
  LifeJobRepository,
  SharedSafetyRepository,
  DatabaseAiBudget,
  type LifeJob,
  type SharedJob,
} from '@future-flow/database';
import {
  OpenAiProvider,
  ExperimentAiBudget,
  combineAiGuards,
  type AiRequestGuard,
} from '@future-flow/ai';
import { DomainError, hash } from '@future-flow/core';
import type { LifeSetupV2 } from '@future-flow/contracts';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { processSharedJob } from '../apps/worker/src/shared-processor';
import { lifeTestAi } from '../tests/life-fixtures';
import { candidateFor } from '../tests/shared-ai-fixtures';

const require = createRequire(import.meta.url);
const { createApp } =
  require('../apps/api/dist/app.js') as typeof import('../apps/api/src/app');
const { SupabaseAuthProvider } =
  require('../apps/api/dist/auth.js') as typeof import('../apps/api/src/auth');
const { deleteAccount, recoverAccountDeletion } =
  require('../apps/api/dist/account-deletion.js') as typeof import('../apps/api/src/account-deletion');
const mode = process.argv[2];
const foundationOnly = mode === '--preflight' || mode === '--cleanup-preflight';
const refined = mode === '--refined' || mode === '--cleanup-refined';
const directory = resolve(
  '.local/shared-auth-smoke/' +
    (foundationOnly
      ? 's3-foundation-01'
      : refined
        ? 's3-english-02'
        : 's3-english-01'),
);
const manifestFile = resolve(directory, 'accounts.json');
const samplePath = 'docs/examples/AI_SHARED_AUTHENTICATED_ENGLISH_SAMPLE.md';
const ceilingUsd = 0.75;
type Manifest = { runId: string; accounts: string[]; contextId?: string };
type Account = { id: string; email: string; password: string; token: string };

// Explicit synthetic integration only: real Auth, DB and AI, no email, public
// publishing, global queue claim or normal feature activation. One paid attempt;
// --cleanup resumes only the accounts/context recorded by this smoke.
function protectDirectory() {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    const sid = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], {
      encoding: 'utf8',
    }).match(/S-1-5-[0-9-]+/)?.[0];
    if (!sid) throw Error('Private ACL unavailable');
    execFileSync('icacls', [directory, '/reset'], { stdio: 'ignore' });
    execFileSync(
      'icacls',
      [
        directory,
        '/inheritance:r',
        '/grant:r',
        `*${sid}:(OI)(CI)F`,
        '*S-1-5-18:(OI)(CI)F',
      ],
      { stdio: 'ignore' },
    );
  } else chmodSync(directory, 0o700);
}
function save(name: string, content: unknown) {
  writeFileSync(
    resolve(directory, name),
    JSON.stringify(content, null, 2) + '\n',
    { mode: 0o600 },
  );
}
async function main() {
  const cleanupOnly = mode?.startsWith('--cleanup') === true;
  if (
    !mode ||
    ![
      '--run',
      '--refined',
      '--preflight',
      '--cleanup',
      '--cleanup-refined',
      '--cleanup-preflight',
    ].includes(mode)
  )
    throw Error('Explicit supported smoke mode required');
  if (process.argv.length !== 3) throw Error('Unexpected argument');
  if (
    !cleanupOnly &&
    !foundationOnly &&
    (existsSync(resolve(directory, 'attempt.json')) || existsSync(samplePath))
  )
    throw new DomainError(
      'SMOKE_CASE_EXISTS',
      'This paid case cannot be silently repeated.',
    );
  if (cleanupOnly && !existsSync(manifestFile)) {
    console.log(JSON.stringify({ sharedAuthCleanup: 'already_clean' }));
    return;
  }
  protectDirectory();
  if (process.env.DATABASE_SSL !== 'true')
    throw Error('Verified database TLS required');
  const url = process.env.SUPABASE_URL ?? '',
    adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  const auth = new SupabaseAuthProvider(url, adminKey);
  auth.assertDeletionConfigured();
  const admin = createClient(url, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const db = connectDatabase(process.env.DATABASE_URL ?? '', true),
    repo = new Repository(db);
  const manifest: Manifest = cleanupOnly
    ? JSON.parse(readFileSync(manifestFile, 'utf8'))
    : { runId: randomUUID(), accounts: [] };
  const accounts: Account[] = [],
    checks: string[] = [];
  let app: Awaited<ReturnType<typeof createApp>> | undefined,
    experiment: ExperimentAiBudget | undefined;
  const check = (condition: unknown, label: string) => {
    assert(condition, label);
    if (foundationOnly)
      label = label
        .replaceAll('real shared AI', 'fixture shared engine')
        .replaceAll('personal real AI', 'fixture personal engine')
        .replaceAll('real personal AI', 'fixture personal engine');
    checks.push(label);
    console.log(`Passed: ${label}`);
  };
  async function cleanup() {
    const failures: string[] = [];
    for (const id of manifest.accounts) {
      try {
        const exists = await auth.userExists!(id);
        if (exists) {
          const found = await admin.auth.admin.getUserById(id);
          if (
            found.data.user?.user_metadata.alterward_shared_auth_smoke !==
            manifest.runId
          )
            throw Error('Synthetic provenance differs');
        }
        const rows = await db.query('SELECT status FROM ff_users WHERE id=$1', [
          id,
        ]);
        if (rows[0]?.status === 'deleting')
          await recoverAccountDeletion(repo, auth, id);
        else if (rows.length || exists) {
          if (!rows.length) await repo.ensureUser(id);
          await deleteAccount(repo, auth, id);
        }
        if (await auth.userExists!(id)) throw Error('Auth remains');
        assert.equal(
          (await db.query('SELECT id FROM ff_users WHERE id=$1', [id])).length,
          0,
        );
      } catch {
        failures.push('synthetic_account');
      }
    }
    if (!failures.length && manifest.contextId) {
      try {
        await db.transaction(async (tx) => {
          const [context] = await tx.query(
            'SELECT title FROM aw_shared_contexts WHERE id=$1 FOR UPDATE',
            [manifest.contextId],
          );
          if (!context) return;
          assert.equal(
            context.title,
            'Synthetic authenticated group ' + manifest.runId,
          );
          assert.equal(
            (
              await tx.query(
                'SELECT id FROM aw_shared_members WHERE context_id=$1 AND user_id IS NOT NULL',
                [manifest.contextId],
              )
            ).length,
            0,
          );
          assert.equal(
            (
              await tx.query(
                'SELECT id FROM aw_shared_jobs WHERE context_id=$1 AND status IN ($2,$3)',
                [manifest.contextId, 'queued', 'running'],
              )
            ).length,
            0,
          );
          // These are only this manifest's isolated synthetic records. Canon
          // triggers prohibit UPDATE; deletion is an explicit fixture cleanup.
          for (const table of [
            'aw_shared_moderation_audit',
            'aw_shared_reports',
            'aw_shared_ai_runs',
            'aw_shared_jobs',
            'aw_shared_impacts',
            'aw_shared_intents',
            'aw_shared_resolutions',
            'aw_shared_event_participants',
            'aw_shared_events',
            'aw_shared_invites',
            'aw_shared_members',
          ]) {
            const column =
              table === 'aw_shared_ai_runs'
                ? 'shared_job_id IN (SELECT id FROM aw_shared_jobs WHERE context_id=$1)'
                : table === 'aw_shared_intents'
                  ? 'event_id IN (SELECT id FROM aw_shared_events WHERE context_id=$1)'
                  : 'context_id=$1';
            await tx.query(`DELETE FROM ${table} WHERE ${column}`, [
              manifest.contextId,
            ]);
          }
          await tx.query('DELETE FROM aw_shared_contexts WHERE id=$1', [
            manifest.contextId,
          ]);
        });
      } catch {
        failures.push('synthetic_context');
      }
    }
    if (failures.length) {
      save('cleanup-result.json', { complete: false, failures });
      throw Error('Synthetic cleanup pending');
    }
    if (existsSync(manifestFile)) unlinkSync(manifestFile);
    save('cleanup-result.json', {
      complete: true,
      createdAuthAccountsDeleted: manifest.accounts.length,
      ownSyntheticContextRemoved: true,
      credentialsPersisted: false,
    });
    console.log(
      JSON.stringify({
        sharedAuthCleanup: 'passed',
        accounts: manifest.accounts.length,
        syntheticContextRemoved: true,
      }),
    );
  }
  try {
    if (cleanupOnly) {
      await cleanup();
      return;
    }
    save('attempt.json', {
      startedAt: new Date().toISOString(),
      runId: manifest.runId,
      ceilingUsd: foundationOnly ? 0 : ceilingUsd,
      model: foundationOnly ? 'fixture_only' : 'gpt-6.1-sol',
    });
    save('accounts.json', manifest);
    const ledgerPath = '.local/ai-smoke/usage.json',
      before = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    if (!foundationOnly)
      experiment = new ExperimentAiBudget(
        ledgerPath,
        5,
        refined ? 'shared-auth-s3-en-02' : 'shared-auth-s3-en-01',
      );
    const localGuard: AiRequestGuard = {
      reserve: async (raw) => {
        const p = raw as { model: string; max_output_tokens: number };
        const cost =
          ((Buffer.byteLength(JSON.stringify(raw), 'utf8') + 4096) * 2.5 +
            p.max_output_tokens * 10) /
          1e6;
        const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
        if (
          p.model !== 'gpt-6.1-sol' ||
          ledger.accountedUsd - before.accountedUsd + cost > ceilingUsd
        )
          throw new DomainError(
            'SMOKE_BUDGET_EXCEEDED',
            'This run is limited to 0.75 USD, including unknown calls.',
          );
        return experiment!.reserve(raw);
      },
      settle: (id, usage) => experiment!.settle(id, usage),
    };
    const inviteSecret = randomBytes(32).toString('hex');
    const shared = new SharedSafetyRepository(db, inviteSecret, 600);
    const provider = (userId: string, jobId: string, maxOutputTokens: number) =>
      new OpenAiProvider({
        apiKey: process.env.OPENAI_API_KEY ?? '',
        eventModel: 'gpt-6.1-sol',
        storyModel: 'gpt-6.1-sol',
        checkModel: 'gpt-6.1-sol',
        timeoutMs: 90000,
        maxOutputTokens,
        guard: combineAiGuards(
          localGuard,
          new DatabaseAiBudget(db, userId, jobId, {
            projectUsd: 5,
            userUsd: ceilingUsd,
            initialProjectSpentUsd: before.accountedUsd,
          }),
        ),
      });
    async function startApp() {
      app = await createApp(repo, auth, 'http://localhost:3000', 0, {
        enabled: true,
        friend: true,
        connected: false,
        world: false,
        inviteSecret,
      });
      await app.listen(0, '127.0.0.1');
    }
    await startApp();
    async function signIn(account: Account) {
      const client = createClient(url, publicKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const signed = await client.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      });
      assert(signed.data.session, 'Synthetic sign-in');
      account.token = signed.data.session.access_token;
    }
    for (let i = 0; i < 2; i++) {
      const email = `alterward-shared-${manifest.runId}-${i}@example.invalid`,
        password = randomBytes(24).toString('base64url') + 'A1!';
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { alterward_shared_auth_smoke: manifest.runId },
      });
      assert(created.data.user, 'Synthetic account creation');
      const a = { id: created.data.user.id, email, password, token: '' };
      accounts.push(a);
      manifest.accounts.push(a.id);
      save('accounts.json', manifest);
      await signIn(a);
    }
    check(
      accounts.length === 2,
      'two real confirmed synthetic accounts and password sign-in',
    );
    async function request(
      path: string,
      method = 'GET',
      body?: unknown,
      owner = 0,
      key = randomUUID(),
      expected?: number,
    ) {
      const response = await fetch((await app!.getUrl()) + path, {
        method,
        headers: {
          Authorization: `Bearer ${accounts[owner]!.token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      assert.equal(
        response.headers.get('cache-control'),
        'no-store',
        'Private response cache',
      );
      if (expected !== undefined) {
        assert.equal(response.status, expected);
        return result;
      }
      if (!response.ok)
        throw Error(
          `HTTP ${response.status} ${result.error?.code ?? 'REQUEST_FAILED'}`,
        );
      return result;
    }
    async function generateLife(jobId: string, owner: number) {
      const userId = accounts[owner]!.id;
      const [job] = await db.query<LifeJob>(
        "UPDATE aw_jobs SET status='running',attempt=attempt+1,lease_token=$3,lease_until=now()+interval '10 minutes' WHERE id=$1 AND user_id=$2 AND status='queued' RETURNING *",
        [jobId, userId, randomUUID()],
      );
      assert(job, 'Own queued life job');
      const jobs = new LifeJobRepository(db, 600);
      const ai = provider(userId, job.id, 6500),
        fidelity = provider(userId, job.id, 1200);
      try {
        await processLifeJob(
          job,
          jobs,
          foundationOnly
            ? lifeTestAi
            : {
                period: (i, r) => ai.period(i, r),
                periodChapter: (i, r) => ai.periodChapter(i, r),
                checkPeriodChapter: (i, c) => fidelity.checkPeriodChapter(i, c),
              },
        );
      } catch (e) {
        await jobs.fail(job, e);
        throw e;
      }
      save(
        'life-output-' + job.id + '.json',
        await db.query(
          'SELECT candidate,chapter FROM aw_periods WHERE branch_id=$1 AND user_id=$2 ORDER BY period_no',
          [job.branch_id, userId],
        ),
      );
      return job;
    }
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
        category: 'personal_growth',
        description:
          'Build a regular drawing practice without overcrowding the workweek.',
        horizonMonths: 24,
        motivation: 'Make room for a creative habit.',
        acceptableTradeoffs: ['Use one evening a week.'],
        unacceptableTradeoffs: ['Promise time I do not have.'],
      },
      stayInCountry: true,
      context: null,
    };
    const people: { branchId: string; lifeId: string }[] = [];
    for (let i = 0; i < 2; i++) {
      await request(
        '/api/v1/me/consent',
        'POST',
        { adult: true, acknowledged: true },
        i,
      );
      const alias = i === 0 ? 'Synthetic Rowan' : 'Synthetic Casey';
      await request(
        '/api/v2/social-profile',
        'PUT',
        {
          handle: `s3_${manifest.runId.replaceAll('-', '').slice(0, 20)}_${i}`,
          displayName: alias,
          discoverability: 'private',
        },
        i,
      );
      // Explicit operator fixture grant to these synthetic users only, never a client-paid flag.
      await db.query(
        "INSERT INTO aw_user_entitlements(user_id,tier,source) VALUES($1,'world','synthetic_shared_auth_smoke')",
        [accounts[i]!.id],
      );
      const key = randomUUID(),
        created = await request('/api/v2/lives', 'POST', setup, i, key);
      assert.equal(
        hash(await request('/api/v2/lives', 'POST', setup, i, key)),
        hash(created),
      );
      people.push(created);
      await generateLife(created.jobId, i);
    }
    check(
      true,
      foundationOnly
        ? 'isolated fixture initial periods for zero-paid HTTP preflight'
        : 'both private initial English periods generated by real AI',
    );
    const a = people[0]!,
      b = people[1]!;
    await request(
      `/api/v2/branches/${a.branchId}`,
      'GET',
      undefined,
      1,
      randomUUID(),
      404,
    );
    check(true, 'another authenticated account cannot read the private branch');
    const own = await request(`/api/v2/branches/${a.branchId}`);
    const context = await request('/api/v2/shared-contexts', 'POST', {
      type: 'friend_group',
      title: 'Synthetic authenticated group ' + manifest.runId,
      branchId: a.branchId,
      revision: own.branch.revision,
      sharingAcknowledged: true,
    });
    manifest.contextId = context.contextId;
    save('accounts.json', manifest);
    await request(
      `/api/v2/shared-contexts/${context.contextId}`,
      'GET',
      undefined,
      1,
      randomUUID(),
      404,
    );
    const invite = await request(
      `/api/v2/shared-contexts/${context.contextId}/invites`,
      'POST',
      { contextRevision: context.revision, targetUserId: accounts[1]!.id },
    );
    const preview = await request(
      '/api/v2/shared-invites/preview',
      'POST',
      { token: invite.token },
      1,
    );
    const peer = await request(
      `/api/v2/branches/${b.branchId}`,
      'GET',
      undefined,
      1,
    );
    await request(
      `/api/v2/shared-invites/${preview.inviteId}/accept`,
      'POST',
      {
        token: invite.token,
        branchId: b.branchId,
        revision: peer.branch.revision,
        contextRevision: preview.contextRevision,
        sharingAcknowledged: true,
      },
      1,
    );
    check(
      true,
      'targeted secure invite preview, own branch consent and acceptance',
    );
    let group = await request(`/api/v2/shared-contexts/${context.contextId}`);
    const generationKey = randomUUID(),
      generationBody = { contextRevision: group.revision };
    const queued = await request(
      `/api/v2/shared-contexts/${context.contextId}/continue`,
      'POST',
      generationBody,
      0,
      generationKey,
    );
    assert.equal(
      hash(
        await request(
          `/api/v2/shared-contexts/${context.contextId}/continue`,
          'POST',
          generationBody,
          0,
          generationKey,
        ),
      ),
      hash(queued),
    );
    const [sharedJob] = await db.query<SharedJob>(
      "UPDATE aw_shared_jobs SET status='running',attempt=attempt+1,lease_token=$3,lease_until=now()+interval '10 minutes' WHERE id=$1 AND requested_by_user_id=$2 AND status='queued' RETURNING *",
      [queued.jobId, accounts[0]!.id, randomUUID()],
    );
    assert(sharedJob);
    try {
      if (foundationOnly)
        await shared.complete(sharedJob, candidateFor(sharedJob.payload));
      else
        await processSharedJob(
          sharedJob,
          shared,
          provider(accounts[0]!.id, sharedJob.id, 4500),
        );
    } catch (e) {
      await shared.fail(sharedJob, e);
      throw e;
    }
    const eventId = sharedJob.payload.eventId;
    const [canon] = await db.query(
      'SELECT candidate,canon_hash FROM aw_shared_events WHERE id=$1',
      [eventId],
    );
    const immutableCanon = hash(canon);
    check(true, 'real shared AI opportunity and generation idempotency');
    async function intent(owner: number, optionId: string) {
      group = await request(
        `/api/v2/shared-contexts/${context.contextId}`,
        'GET',
        undefined,
        owner,
      );
      return request(
        `/api/v2/shared-contexts/${context.contextId}/events/${eventId}/intents`,
        'POST',
        { contextRevision: group.revision, optionId },
        owner,
      );
    }
    await intent(0, sharedJob.payload.decision.participationOptionId);
    const peerEvents = await request(
      `/api/v2/shared-contexts/${context.contextId}/events`,
      'GET',
      undefined,
      1,
    );
    assert.equal(peerEvents[0].ownResponse, null);
    assert.equal(peerEvents[0].responseCount, 1);
    assert.equal(peerEvents[0].resolution, null);
    assert(!JSON.stringify(peerEvents).includes(accounts[0]!.id));
    check(true, 'pending responses stay private to their owner');
    async function chooseAndContinue() {
      let detail = await request(`/api/v2/branches/${a.branchId}`);
      await request(`/api/v2/branches/${a.branchId}/choice`, 'POST', {
        revision: detail.branch.revision,
        decisionId: detail.branch.pending_decision.id,
        optionId: detail.branch.pending_decision.options[0].id,
      });
      detail = await request(`/api/v2/branches/${a.branchId}`);
      return request(`/api/v2/branches/${a.branchId}/continue`, 'POST', {
        revision: detail.branch.revision,
      });
    }
    const pendingPersonal = await chooseAndContinue(),
      pendingJob = await generateLife(pendingPersonal.jobId, 0);
    assert.equal(pendingJob.payload.memory.sharedEvents, undefined);
    const beforeResolution = await request(`/api/v2/branches/${a.branchId}`);
    const peerBefore = await request(
      `/api/v2/branches/${b.branchId}`,
      'GET',
      undefined,
      1,
    );
    await intent(1, sharedJob.payload.decision.optOutOptionId);
    assert.equal(
      hash(await request(`/api/v2/branches/${a.branchId}`)),
      hash(beforeResolution),
    );
    const impacts = await request(
      `/api/v2/branches/${a.branchId}/shared-impacts`,
    );
    assert.equal(impacts.length, 1);
    check(
      true,
      'personal real AI can continue while shared decision waits, without retroactive writes',
    );
    const next = await chooseAndContinue();
    // API/repository recreation keeps the queued memory and immutable history.
    await app!.close();
    await startApp();
    const personalJob = await generateLife(next.jobId, 0);
    const memory = personalJob.payload.memory.sharedEvents![0]!;
    assert.equal(memory.eventId, eventId);
    assert(memory.effectiveAt < memory.knownAt);
    const detail = await request(`/api/v2/branches/${a.branchId}`);
    assert.deepEqual(detail.periods.slice(0, -1), beforeResolution.periods);
    assert.equal(
      hash(
        await request(`/api/v2/branches/${b.branchId}`, 'GET', undefined, 1),
      ),
      hash(peerBefore),
    );
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_shared_personal_memories WHERE user_id=$1 AND branch_id=$2',
          [accounts[0]!.id, a.branchId],
        )
      ).length,
      1,
    );
    assert.equal(
      hash(
        (
          await db.query(
            'SELECT candidate,canon_hash FROM aw_shared_events WHERE id=$1',
            [eventId],
          )
        )[0],
      ),
      immutableCanon,
    );
    check(
      true,
      'late shared memory applied once and used in a real personal AI period after restart',
    );
    const last = detail.periods.at(-1),
      fork = await request(
        `/api/v2/branches/${a.branchId}/periods/${last.id}/fork`,
        'POST',
        {
          revision: detail.branch.revision,
          optionId: last.candidate.events.at(-1).decision.options[1].id,
        },
      );
    assert.equal(
      (
        await db.query('SELECT id FROM aw_shared_members WHERE branch_id=$1', [
          fork.branchId,
        ])
      ).length,
      0,
    );
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_shared_personal_memories WHERE branch_id=$1',
          [fork.branchId],
        )
      ).length,
      1,
    );
    check(
      true,
      'own historical fork inherits known memory without a live shared membership',
    );
    await signIn(accounts[0]!);
    await signIn(accounts[1]!);
    const exported = await request('/api/v1/me/export');
    assert.equal(exported.shared.canon.events.length, 1);
    assert.equal(exported.shared.personalMemories.length, 2);
    assert(!JSON.stringify(exported.shared).includes(accounts[1]!.id));
    assert(!JSON.stringify(exported.shared).includes(invite.token));
    check(
      true,
      'fresh-auth export contains own shared canon and memories without peer private IDs or invite token',
    );
    const sample =
      '# alterward — authenticated Shared and personal AI (English)\n\nReal Supabase Auth, PostgreSQL and OpenAI integration on two synthetic profiles. Every story below is generated by Sol; scripted responses express interest, not attendance. Earlier periods stay unchanged. No public release or real user assessment is claimed.\n\n## Shared opportunity\n\n' +
      (canon!.candidate as { title: string; summary: string }).title +
      '\n\n' +
      (canon!.candidate as { summary: string }).summary +
      '\n\nOriginal shared date: ' +
      memory.effectiveAt +
      '. Learned later in the own story: ' +
      memory.knownAt +
      '.\n\n' +
      detail.periods
        .map(
          (p: { chapter: { title: string; body: string } }) =>
            '## ' + p.chapter.title + '\n\n' + p.chapter.body,
        )
        .join('\n\n') +
      '\n';
    // Controlled interruption after real Auth deletion, before DB confirmation;
    // this proves the recovery path, not a real DB outage or backup restoration.
    await repo.markDeleting(accounts[1]!.id);
    await auth.deleteUser(accounts[1]!.id);
    assert.equal(await auth.userExists!(accounts[1]!.id), false);
    assert.equal(
      (
        await db.query('SELECT status FROM ff_users WHERE id=$1', [
          accounts[1]!.id,
        ])
      )[0]?.status,
      'deleting',
    );
    await new Promise<void>((ok, fail) => {
      const child = spawn(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'scripts/recover-account-deletion.ts',
          accounts[1]!.id,
        ],
        {
          env: process.env,
          windowsHide: true,
          stdio: 'ignore',
          timeout: 60000,
        },
      );
      child.once('error', fail);
      child.once('exit', (code) =>
        code === 0 ? ok() : fail(Error('Recovery CLI failed')),
      );
    });
    assert.equal(
      (await db.query('SELECT id FROM ff_users WHERE id=$1', [accounts[1]!.id]))
        .length,
      0,
    );
    group = await request(`/api/v2/shared-contexts/${context.contextId}`);
    assert.equal(group.privacyRedacted, true);
    const retainedEvents = await request(
      `/api/v2/shared-contexts/${context.contextId}/events`,
    );
    assert.equal(retainedEvents[0].privacyRedacted, true);
    assert.equal(retainedEvents[0].effectiveAt, memory.effectiveAt);
    assert.equal(retainedEvents[0].resolution.participatingCount, 1);
    assert.equal(
      retainedEvents[0].title,
      'Shared opportunity (details hidden)',
    );
    const retainedExport = await request('/api/v1/me/export');
    assert(
      retainedExport.shared.personalMemories.every(
        (m: { payload: { title: string } }) =>
          m.payload.title === 'Shared opportunity (details hidden)',
      ),
    );
    check(
      true,
      'deleted participant prose hidden in authenticated event, context, export and inherited memory; original date and opt-in count retained',
    );
    assert(
      group.members.some(
        (m: { status: string; interactionProfile: { displayName: string } }) =>
          m.status === 'deleted' &&
          m.interactionProfile.displayName === 'Former member',
      ),
    );
    assert.equal(
      hash(
        (
          await db.query(
            'SELECT candidate,canon_hash FROM aw_shared_events WHERE id=$1',
            [eventId],
          )
        )[0],
      ),
      immutableCanon,
    );
    check(
      true,
      'controlled real Auth deletion interruption recovered, peer canon retained and membership detached',
    );
    await signIn(accounts[0]!);
    await request('/api/v1/me', 'DELETE', { confirmation: 'DELETE ACCOUNT' });
    assert.equal(await auth.userExists!(accounts[0]!.id), false);
    assert.equal(
      (await db.query('SELECT id FROM ff_users WHERE id=$1', [accounts[0]!.id]))
        .length,
      0,
    );
    check(true, 'real owner Auth and database account deletion');
    const after = JSON.parse(readFileSync(ledgerPath, 'utf8')),
      calls = after.calls.slice(before.calls.length);
    const report = {
      sharedAuthenticatedSmoke: foundationOnly
        ? 'technical_fixture_passed'
        : 'passed',
      checks,
      model: foundationOnly ? 'fixture_only' : 'gpt-6.1-sol',
      realAiCalls: calls.length,
      inputTokens: calls.reduce(
        (n: number, c: { usage?: { input_tokens: number } }) =>
          n + (c.usage?.input_tokens ?? 0),
        0,
      ),
      outputTokens: calls.reduce(
        (n: number, c: { usage?: { output_tokens: number } }) =>
          n + (c.usage?.output_tokens ?? 0),
        0,
      ),
      unknownUsageCalls: calls.filter((c: { usage?: unknown }) => !c.usage)
        .length,
      estimatedUsd: calls.reduce(
        (n: number, c: { estimatedUsd?: number }) => n + (c.estimatedUsd ?? 0),
        0,
      ),
      guardUsd: after.accountedUsd - before.accountedUsd,
      cumulativeGuardUsd: after.accountedUsd,
      remainingOpenAiUsd: 5 - after.accountedUsd,
      realSupabaseAuthUsed: true,
      realPostgresUsed: true,
      paidCeilingUsd: foundationOnly ? 0 : ceilingUsd,
      normalFeatureActivated: false,
      earlierChaptersUnchanged: true,
      ownSharedMemoryAppliedOnce: true,
      peerPrivateBranchChanged: false,
      controlledRecovery: true,
      actualDatabaseOutageTested: false,
      backupRestoreTested: false,
      retainedDisplayPolicy: 'hide_text_keep_verified_dates_results',
      retainedProsePrivacyImplemented: true,
      samplePath: foundationOnly ? null : samplePath,
    };
    assert(
      (foundationOnly ? calls.length === 0 : calls.length >= 13) &&
        report.unknownUsageCalls === 0,
    );
    save('result.json', {
      report,
      ownPeriods: detail.periods,
      sharedCandidate: canon!.candidate,
      personalInput: personalJob.payload,
    });
    await cleanup();
    if (!foundationOnly) writeFileSync(samplePath, sample, { flag: 'wx' });
    console.log(JSON.stringify(report));
  } catch (error: unknown) {
    const e = error as { name?: string; message?: string; stack?: string };
    const http = /^HTTP \d{3} [A-Z_]+$/.test(e.message ?? '')
      ? e.message
      : undefined;
    const frames = e.stack
      ?.split('\n')
      .filter((l) => l.includes('smoke-shared-authenticated.ts:'))
      .map((l) => l.match(/smoke-shared-authenticated\.ts:\d+:\d+/)?.[0])
      .filter(Boolean);
    save('failure.json', {
      lastCheck: checks.at(-1),
      type: e.name,
      http,
      sourceFrames: frames,
    });
    console.error(JSON.stringify({ http, sourceFrames: frames }));
    throw error;
  } finally {
    experiment?.close();
    if (existsSync(manifestFile))
      await cleanup().catch(() => {
        console.error(
          'Synthetic cleanup pending; use --cleanup before another run.',
        );
        process.exitCode = 1;
      });
    await app?.close();
    await db.close();
  }
}
main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      sharedAuthenticatedSmoke: 'failed',
      code:
        error instanceof DomainError ? error.code : 'SHARED_AUTH_SMOKE_FAILED',
    }),
  );
  process.exitCode = 1;
});
