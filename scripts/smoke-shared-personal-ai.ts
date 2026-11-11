import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
  OpenAiProvider,
  ExperimentAiBudget,
  combineAiGuards,
  type AiRequestGuard,
} from '@future-flow/ai';
import {
  DatabaseAiBudget,
  LifeRepository,
  LifeJobRepository,
  SharedJobRepository,
} from '@future-flow/database';
import { DomainError, hash } from '@future-flow/core';
import { processSharedJob } from '../apps/worker/src/shared-processor';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { sharedAdapter, testInviteSecret } from '../tests/shared-fixtures';
import { sharedAiGroup } from '../tests/shared-ai-fixtures';
import { lifeTestAi } from '../tests/life-fixtures';
import { applyMigrations } from './lib/migrations';

// Real Shared + next-personal-period AI. Synthetic profiles and preceding private
// chapters are fixtures in disposable storage. No real Auth, publishing or release.
async function main() {
  const timeline = process.argv[2] === 'timeline';
  if (process.argv[2] !== undefined && !timeline)
    throw new DomainError(
      'SMOKE_CASE_UNKNOWN',
      'Only the explicit timeline refinement is supported.',
    );
  const samplePath = 'docs/examples/AI_SHARED_PERSONAL_ENGLISH_SAMPLE.md',
    directory =
      '.local/ai-smoke/shared-personal' + (timeline ? '-timeline' : '');
  if (existsSync(samplePath) || existsSync(directory + '/attempt.json'))
    throw new DomainError(
      'SMOKE_CASE_EXISTS',
      'This paid case cannot be silently repeated.',
    );
  await mkdir(directory, { recursive: true });
  await writeFile(
    directory + '/attempt.json',
    JSON.stringify({
      startedAt: new Date().toISOString(),
      ceilingUsd: 0.6,
      model: 'gpt-6.1-sol',
    }),
    { flag: 'wx' },
  );
  const ledgerPath = '.local/ai-smoke/usage.json',
    before = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  const initial = before.calls.reduce(
    (sum: number, c: { accountedUsd: number }) => sum + c.accountedUsd,
    0,
  );
  const experiment = new ExperimentAiBudget(
    ledgerPath,
    5,
    'shared-personal-s3-en' + (timeline ? '.timeline' : ''),
  );
  const engine = new PGlite();
  try {
    await applyMigrations(engine);
    const db = sharedAdapter(engine),
      shared = new SharedJobRepository(db, testInviteSecret, 600),
      lives = new LifeRepository(db),
      jobs = new LifeJobRepository(db, 600);
    const g = await sharedAiGroup(
        db,
        shared,
        'Build a regular drawing practice without overcrowding the workweek',
      ),
      a = g.people[0]!,
      b = g.people[1]!;
    let runReserved = 0;
    const ceiling: AiRequestGuard = {
      reserve: async (raw) => {
        const p = raw as { model: string; max_output_tokens: number };
        if (p.model !== 'gpt-6.1-sol')
          throw new DomainError('SMOKE_BUDGET_CONFIG', 'This smoke pins Sol.');
        const bound =
          ((Buffer.byteLength(JSON.stringify(raw), 'utf8') + 4096) * 2.5 +
            p.max_output_tokens * 10) /
          1e6;
        if (runReserved + bound > 0.6)
          throw new DomainError(
            'SMOKE_BUDGET_EXCEEDED',
            'This smoke reserves at most 0.60 USD.',
          );
        runReserved += bound;
        return experiment.reserve(raw);
      },
      settle: (id, usage) => experiment.settle(id, usage),
    };
    const provider = (jobId: string, maxOutputTokens = 6500) =>
      new OpenAiProvider({
        apiKey: process.env.OPENAI_API_KEY ?? '',
        eventModel: 'gpt-6.1-sol',
        storyModel: 'gpt-6.1-sol',
        checkModel: 'gpt-6.1-sol',
        timeoutMs: 90000,
        maxOutputTokens,
        guard: combineAiGuards(
          ceiling,
          new DatabaseAiBudget(db, a.id, jobId, {
            projectUsd: 5,
            userUsd: 0.6,
            initialProjectSpentUsd: initial,
          }),
        ),
      });
    const queued = await shared.enqueue(
        a.id,
        g.contextId,
        g.detail.revision,
        randomUUID(),
      ),
      sharedJob = (await shared.claim())!;
    assert.equal(sharedJob.id, queued.jobId);
    const sharedAi = provider(sharedJob.id);
    let sharedCalls = 0;
    await processSharedJob(sharedJob, shared, {
      sharedEvent: async (i, r) => {
        const result = await sharedAi.sharedEvent(i, r);
        await writeFile(
          directory + `/shared-output-${++sharedCalls}.json`,
          JSON.stringify({ input: i, result }, null, 2),
          { flag: 'wx' },
        );
        return result;
      },
    });
    await shared.submitIntent(
      a.id,
      g.contextId,
      sharedJob.payload.eventId,
      {
        contextRevision: (await shared.detail(a.id, g.contextId)).revision,
        optionId: sharedJob.payload.decision.participationOptionId,
      },
      randomUUID(),
    );
    async function chooseOwn() {
      const branch = await lives.branch(a.id, a.branchId);
      return lives.choose(
        a.id,
        a.branchId,
        branch.revision,
        branch.pending_decision!.id,
        branch.pending_decision!.options[0]!.id,
        randomUUID(),
      );
    }
    await chooseOwn();
    const ready = await lives.branch(a.id, a.branchId);
    await lives.continue(a.id, a.branchId, ready.revision, randomUUID());
    const previousJob = (await jobs.claim())!;
    assert.equal(previousJob.payload.memory.sharedEvents, undefined);
    await processLifeJob(previousJob, jobs, lifeTestAi);
    const historyBefore = (await lives.detail(a.id, a.branchId)).periods;
    const advanced = await lives.branch(a.id, a.branchId),
      peerBefore = await lives.branch(b.id, b.branchId);
    await shared.submitIntent(
      b.id,
      g.contextId,
      sharedJob.payload.eventId,
      {
        contextRevision: (await shared.detail(b.id, g.contextId)).revision,
        optionId: sharedJob.payload.decision.optOutOptionId,
      },
      randomUUID(),
    );
    assert.deepEqual(await lives.branch(a.id, a.branchId), advanced);
    await chooseOwn();
    const learned = await lives.branch(a.id, a.branchId);
    assert.equal(learned.revision, advanced.revision + 2);
    await lives.continue(a.id, a.branchId, learned.revision, randomUUID());
    const personalJob = (await jobs.claim())!,
      personalAi = provider(personalJob.id),
      fidelityAi = provider(personalJob.id, 1200);
    assert.equal(personalJob.payload.memory.sharedEvents!.length, 1);
    const memory = personalJob.payload.memory.sharedEvents![0]!;
    assert.equal(memory.effectiveAt, g.detail.simulationAt);
    assert.equal(memory.knownAt, advanced.state.effectiveAt);
    assert(memory.knownAt > memory.effectiveAt);
    let periodCalls = 0,
      chapterCalls = 0,
      fidelityCalls = 0;
    await processLifeJob(personalJob, jobs, {
      period: async (i, r) => {
        const result = await personalAi.period(i, r);
        await writeFile(
          directory + `/period-output-${++periodCalls}.json`,
          JSON.stringify({ input: i, result }, null, 2),
          { flag: 'wx' },
        );
        return result;
      },
      periodChapter: async (i, r) => {
        const result = await personalAi.periodChapter(i, r);
        await writeFile(
          directory + `/chapter-output-${++chapterCalls}.json`,
          JSON.stringify({ input: i, result }, null, 2),
          { flag: 'wx' },
        );
        return result;
      },
      checkPeriodChapter: async (i, c) => {
        const result = await fidelityAi.checkPeriodChapter(i, c);
        await writeFile(
          directory + `/fidelity-output-${++fidelityCalls}.json`,
          JSON.stringify({ input: i, result }, null, 2),
          { flag: 'wx' },
        );
        return result;
      },
    });
    const detail = await lives.detail(a.id, a.branchId),
      period = detail.periods.at(-1)!;
    assert.deepEqual(detail.periods.slice(0, -1), historyBefore);
    assert.deepEqual(await lives.branch(b.id, b.branchId), peerBefore);
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_shared_personal_memories WHERE branch_id=$1',
          [a.branchId],
        )
      ).length,
      1,
    );
    const [canon] = await db.query(
      'SELECT candidate,canon_hash FROM aw_shared_events WHERE id=$1',
      [sharedJob.payload.eventId],
    );
    const after = JSON.parse(readFileSync(ledgerPath, 'utf8')),
      calls = after.calls.slice(before.calls.length);
    assert(
      calls.length >= 4 && calls.every((c: { usage?: unknown }) => c.usage),
    );
    const report = {
      sharedPersonalAiSmoke: 'passed',
      model: 'gpt-6.1-sol',
      realAiCalls: calls.length,
      inputTokens: calls.reduce(
        (n: number, c: { usage: { input_tokens: number } }) =>
          n + c.usage.input_tokens,
        0,
      ),
      outputTokens: calls.reduce(
        (n: number, c: { usage: { output_tokens: number } }) =>
          n + c.usage.output_tokens,
        0,
      ),
      sharedRepairUsed: Boolean(sharedJob.checkpoints.repairStarted),
      personalRepairUsed: Boolean(personalJob.checkpoints.repairUsed),
      estimatedUsd: calls.reduce(
        (n: number, c: { estimatedUsd: number }) => n + c.estimatedUsd,
        0,
      ),
      guardUsd: calls.reduce(
        (n: number, c: { accountedUsd: number }) => n + c.accountedUsd,
        0,
      ),
      cumulativeGuardUsd: after.accountedUsd,
      remainingOpenAiUsd: 5 - after.accountedUsd,
      canonicalDate: memory.effectiveAt,
      learnedDate: memory.knownAt,
      immutableEarlierChapters: true,
      ownMemoryAppliedOnce: true,
      peerBranchChanged: false,
      realSupabaseAuthUsed: false,
      featureActivated: false,
    };
    await writeFile(
      directory + '/result.json',
      JSON.stringify(
        {
          report,
          sharedInput: sharedJob.payload,
          sharedCandidate: canon!.candidate,
          personalInput: personalJob.payload,
          period,
          receipts: await db.query(
            'SELECT metadata FROM aw_ai_runs WHERE job_id=$1',
            [personalJob.id],
          ),
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    );
    const sharedCandidate = canon!
        .candidate as import('@future-flow/contracts').SharedEventCandidate,
      chapter =
        period.chapter as import('@future-flow/contracts').PeriodChapterV2;
    const sample = `# alterward — Shared canon in a later personal chapter (English)\n\n${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())} · Real OpenAI Sol Shared opportunity and personal continuation, with automatic canon/fidelity checks. Synthetic profiles and preceding personal chapters are isolated test fixtures. Shared remains disabled. This does not prove real Supabase Auth, moderation or launch readiness.\n\n## Shared opportunity: ${sharedCandidate.title}\n\n${sharedCandidate.summary}\n\nOriginal common date: ${memory.effectiveAt}. One scripted reader opted in; another opted out. The response records interest, not attendance. The reader continued privately before the common decision closed. The following chapter learns it as background on ${memory.knownAt}.\n\n## ${chapter.title}\n\n${chapter.body}\n\n**${(period.candidate as import('@future-flow/contracts').PeriodCandidateV2).events.at(-1)!.decision!.prompt}**\n\n${(
      period.candidate as import('@future-flow/contracts').PeriodCandidateV2
    ).events
      .at(-1)!
      .decision!.options.map((o) => `- **${o.label}:** ${o.description}`)
      .join(
        '\n',
      )}\n\nTechnical evidence: ${calls.length} real AI calls; one own memory application; earlier chapters and the other member's branch remain unchanged.\n`;
    await writeFile(samplePath, sample, { flag: 'wx' });
    console.log(JSON.stringify({ ...report, sampleHash: hash(sample) }));
  } finally {
    await engine.close();
    experiment.close();
  }
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      sharedPersonalAiSmoke: 'failed',
      code: error instanceof DomainError ? error.code : 'SMOKE_FAILED',
    }),
  );
  process.exitCode = 1;
});
