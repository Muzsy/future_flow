import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import {
  OpenAiProvider,
  ExperimentAiBudget,
  combineAiGuards,
  type AiRequestGuard,
} from '@future-flow/ai';
import { DatabaseAiBudget, SharedJobRepository } from '@future-flow/database';
import { DomainError, hash } from '@future-flow/core';
import { processSharedJob } from '../apps/worker/src/shared-processor';
import { sharedAdapter, testInviteSecret } from '../tests/shared-fixtures';
import { sharedAiGroup } from '../tests/shared-ai-fixtures';
import { applyMigrations } from './lib/migrations';

// Real Shared OpenAI pipeline on synthetic profiles in disposable PGlite.
// No production DB/Auth, live memberships, public publishing or feature activation.
async function main() {
  const refined = process.argv[2] === 'refined';
  if (process.argv[2] !== undefined && !refined)
    throw new DomainError(
      'SMOKE_CASE_UNKNOWN',
      'Use the initial or refined sample.',
    );
  const samplePath = refined
    ? 'docs/examples/AI_SHARED_FRIEND_ENGLISH_REFINED_SAMPLE.md'
    : 'docs/examples/AI_SHARED_FRIEND_ENGLISH_SAMPLE.md';
  if (existsSync(samplePath))
    throw new DomainError(
      'SMOKE_CASE_EXISTS',
      'The existing AI sample is immutable.',
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
    'shared-friend-s2-en',
  );
  const engine = new PGlite();
  try {
    await applyMigrations(engine);
    const db = sharedAdapter(engine),
      jobs = new SharedJobRepository(db, testInviteSecret, 180, 172800);
    const g = await sharedAiGroup(db, jobs),
      a = g.people[0]!,
      b = g.people[1]!;
    const branchesBefore = await db.query(
      'SELECT state,revision FROM aw_branches WHERE id=ANY($1::uuid[]) ORDER BY id',
      [g.people.map((p) => p.branchId)],
    );
    const queued = await jobs.enqueue(
        a.id,
        g.contextId,
        g.detail.revision,
        randomUUID(),
      ),
      job = (await jobs.claim())!;
    assert.equal(job.id, queued.jobId);
    const dbBudget = new DatabaseAiBudget(db, a.id, job.id, {
      projectUsd: 5,
      userUsd: 0.2,
      initialProjectSpentUsd: initial,
    });
    let runReserved = 0;
    const ceiling: AiRequestGuard = {
      reserve: async (raw) => {
        const p = raw as { model: string; max_output_tokens: number };
        if (p.model !== 'gpt-6.1-sol')
          throw new DomainError(
            'SMOKE_BUDGET_CONFIG',
            'This smoke pins the existing Sol model.',
          );
        const bound =
          ((Buffer.byteLength(JSON.stringify(raw), 'utf8') + 4096) * 2.5 +
            p.max_output_tokens * 10) /
          1e6;
        if (runReserved + bound > 0.2)
          throw new DomainError(
            'SMOKE_BUDGET_EXCEEDED',
            'This individual smoke is limited to 0.20 USD reserved.',
          );
        runReserved += bound;
        return experiment.reserve(raw);
      },
      settle: (id, usage) => experiment.settle(id, usage),
    };
    const ai = new OpenAiProvider({
      apiKey: process.env.OPENAI_API_KEY ?? '',
      eventModel: 'gpt-6.1-sol',
      storyModel: 'gpt-6.1-sol',
      timeoutMs: 90000,
      maxOutputTokens: 4500,
      guard: combineAiGuards(ceiling, dbBudget),
    });
    await processSharedJob(job, jobs, ai);
    const [event] = await jobs.events(a.id, g.contextId);
    assert(event);
    const [canon] = await db.query(
      'SELECT candidate,canon_hash FROM aw_shared_events WHERE id=$1',
      [job.payload.eventId],
    );
    const candidate = canon!
      .candidate as import('@future-flow/contracts').SharedEventCandidate;
    const revision = (await jobs.detail(a.id, g.contextId)).revision;
    await jobs.submitIntent(
      a.id,
      g.contextId,
      candidate.eventId,
      {
        contextRevision: revision,
        optionId: job.payload.decision.participationOptionId,
      },
      randomUUID(),
    );
    await jobs.submitIntent(
      b.id,
      g.contextId,
      candidate.eventId,
      {
        contextRevision: (await jobs.detail(b.id, g.contextId)).revision,
        optionId: job.payload.decision.optOutOptionId,
      },
      randomUUID(),
    );
    assert.equal((await jobs.pendingImpacts(a.id, a.branchId)).length, 1);
    assert.equal((await jobs.pendingImpacts(b.id, b.branchId)).length, 0);
    assert.deepEqual(
      await db.query(
        'SELECT state,revision FROM aw_branches WHERE id=ANY($1::uuid[]) ORDER BY id',
        [g.people.map((p) => p.branchId)],
      ),
      branchesBefore,
    );
    const receipts = await db.query(
      'SELECT metadata FROM aw_shared_ai_runs WHERE shared_job_id=$1',
      [job.id],
    );
    const after = JSON.parse(readFileSync(ledgerPath, 'utf8')),
      calls = after.calls.slice(before.calls.length);
    assert(
      calls.length > 0 && calls.every((c: { usage?: unknown }) => c.usage),
    );
    const report = {
      sharedAiSmoke: 'passed',
      model: 'gpt-6.1-sol',
      realSharedAiCalls: calls.length,
      repairUsed: Boolean(job.checkpoints.repairStarted),
      receipts: receipts.map((r) => r.metadata),
      canonHash: canon!.canon_hash,
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
      explicitOptInImpacts: 1,
      optOutImpacts: 0,
      privateBranchWrites: 0,
      realSupabaseAuthUsed: false,
      featureActivated: false,
    };
    await mkdir('.local/ai-smoke/shared', { recursive: true });
    await writeFile(
      refined
        ? '.local/ai-smoke/shared/refined-result.json'
        : '.local/ai-smoke/shared/result.json',
      JSON.stringify({ report, input: job.payload, candidate }, null, 2) + '\n',
    );
    const options = candidate
      .decision!.options.map((o) => `- **${o.label}:** ${o.description}`)
      .join('\n');
    const sample = `# alterward — AI Shared friend story (English)\n\n2026-10-04 · Real OpenAI Sol generation, synthetic consenting test profiles in isolated storage. This is a possible fictional opportunity; nobody has accepted it in the story. Shared remains disabled in the product.\n\n## ${candidate.title}\n\n${candidate.summary}\n\n**${candidate.decision!.prompt}**\n\n${options}\n\nTechnical proof: one canonical event, ${calls.length} real Shared AI request(s), ${receipts.length} receipt(s); one scripted opt-in and one scripted opt-out produce respectively one and zero pending memory impacts. Neither personal branch changes. This isolated smoke does not prove real Supabase Auth, personal AI continuation, moderation or launch readiness.\n`;
    await writeFile(samplePath, sample);
    console.log(JSON.stringify({ ...report, sampleHash: hash(sample) }));
  } finally {
    await engine.close();
    experiment.close();
  }
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      sharedAiSmoke: 'failed',
      code: error instanceof DomainError ? error.code : 'SMOKE_FAILED',
    }),
  );
  process.exitCode = 1;
});
