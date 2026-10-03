import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { OpenAiProvider } from '@future-flow/ai';
import {
  questionnaire,
  traitKeys,
  localeSchema,
  type ChapterOutput,
} from '@future-flow/contracts';
import { DomainError, hash } from '@future-flow/core';
import {
  Repository,
  JobRepository,
  type Database,
} from '@future-flow/database';
import { processJob } from '../apps/worker/src/processor';
import { applyMigrations } from './lib/migrations';
import {
  reserveSmokeCall,
  recordSmokeUsage,
  smokePrices,
  smokeModelPrices,
  type SmokeCall,
} from './lib/ai-smoke-budget';

// Match the SDK used by the CommonJS AI package, including its error classes.
const OpenAI = createRequire(import.meta.url)('openai')
  .default as typeof import('openai').default;

// Real OpenAI requests, synthetic profile, isolated PostgreSQL engine.
// Never creates Supabase Auth accounts or writes personal data to Supabase.
const caseName = process.argv[2] ?? 'family';
const locale = localeSchema.parse(process.argv[3] ?? 'hu');
const outputRoot = resolve('.local/ai-smoke');
const outputDirectory =
  locale === 'hu' && caseName === 'family'
    ? outputRoot
    : resolve(outputRoot, 'cases', `${caseName}-${locale}`);
function adapter(client: Pick<PGlite, 'query' | 'transaction'>): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      text: string,
      values: unknown[] = [],
    ) => (await client.query<T>(text, values)).rows,
    transaction: (run) =>
      client.transaction((tx) => run(adapter(tx as unknown as PGlite))),
  };
}
async function main() {
  if (!['family', 'creative', 'career-change'].includes(caseName))
    throw new DomainError('SMOKE_CASE_UNKNOWN', 'Unknown synthetic profile.');
  await mkdir(resolve(outputDirectory, 'responses'), { recursive: true });
  const ledgerPath = resolve(outputRoot, 'usage.json');
  const calls: SmokeCall[] = existsSync(ledgerPath)
    ? JSON.parse(readFileSync(ledgerPath, 'utf8')).calls
    : [];
  for (const call of calls) {
    call.caseName ??= 'family';
    if (call.usage) recordSmokeUsage(call, call.usage);
  }
  const budgetUsd = Number(process.env.SMOKE_BUDGET_USD ?? 1);
  const ledger = () => ({
    budgetUsd,
    pricesPerMillionTokens: smokePrices,
    pricesByModel: smokeModelPrices,
    calls,
    estimatedUsd: calls.reduce(
      (sum, call) => sum + (call.estimatedUsd ?? 0),
      0,
    ),
    accountedUsd: calls.reduce((sum, call) => sum + call.accountedUsd, 0),
    unknownUsageCalls: calls.filter((call) => !call.usage).length,
  });
  const saveLedger = () =>
    writeFile(ledgerPath, JSON.stringify(ledger(), null, 2) + '\n');
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? '',
    timeout: Math.max(180000, Number(process.env.AI_TIMEOUT_MS ?? 90000)),
    maxRetries: 0,
    fetch: async (...args) => {
      const [url, init] = args;
      if (!String(url).endsWith('/v1/responses')) return fetch(...args);
      const parameters = JSON.parse(String(init?.body));
      const counted = await client.responses.inputTokens.count({
        model: parameters.model,
        input: parameters.input,
        text: parameters.text,
      });
      const call = reserveSmokeCall(
        calls,
        budgetUsd,
        parameters.model,
        parameters.text?.format?.name ?? 'unknown',
        counted.input_tokens,
        parameters.max_output_tokens,
      );
      call.caseName = `${caseName}-${locale}`;
      await saveLedger();
      console.log(
        `Live AI request ${calls.length}: ${call.task}; preflight ceiling $${call.reservedUsd.toFixed(4)}.`,
      );
      try {
        const response = await fetch(...args);
        const body = await response.clone().json();
        call.status = body.status ?? `http_${response.status}`;
        if (body.usage) recordSmokeUsage(call, body.usage);
        await writeFile(
          resolve(
            outputDirectory,
            'responses',
            `${String(calls.length).padStart(3, '0')}.json`,
          ),
          JSON.stringify(
            response.ok
              ? body
              : {
                  status: call.status,
                  error: { code: body.error?.code, type: body.error?.type },
                },
            null,
            2,
          ) + '\n',
        );
        await saveLedger();
        console.log(
          `Live AI response ${calls.length}: ${call.status}; cumulative token cost estimate $${ledger().estimatedUsd.toFixed(4)}.`,
        );
        return response;
      } catch (error) {
        call.status = 'response_unavailable';
        await saveLedger();
        throw error;
      }
    },
  });
  const ai = new OpenAiProvider(
    {
      apiKey: process.env.OPENAI_API_KEY ?? '',
      eventModel: process.env.AI_EVENT_MODEL ?? '',
      storyModel: process.env.AI_STORY_MODEL ?? '',
      checkModel: process.env.AI_CHECK_MODEL || undefined,
      timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 90000),
      maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 12000),
    },
    client,
  );
  const engine = new PGlite(),
    db = adapter(engine),
    repo = new Repository(db),
    jobs = new JobRepository(db);
  let lastJobId: string | null = null;
  await mkdir(outputDirectory, { recursive: true });
  try {
    await applyMigrations(engine);
    await db.query(
      'INSERT INTO ff_questionnaires(version,definition,definition_hash) VALUES($1,$2,$3)',
      [
        questionnaire.version,
        JSON.stringify(questionnaire),
        hash(questionnaire),
      ],
    );
    const userId = randomUUID();
    await repo.ensureUser(userId);
    await repo.acceptPrivacy(userId);
    const answers: Record<string, unknown> = {
      ageBand: '35_44',
      region: 'Pest',
      regionType: 'small_town',
      relationshipStatus: 'partnered',
      children: 1,
      employmentStatus: 'employed',
      workDomain: 'Műszaki terület',
      workSatisfaction: 38,
      financialStability: 67,
      housingStability: 81,
      relocationWillingness: 28,
      careerChangeWillingness: 61,
      ...Object.fromEntries(traitKeys.map((key) => [key, 50])),
      changeSeeking: 68,
      securityNeed: 79,
      values: ['family', 'security', 'autonomy'],
      goalCategory: 'career',
      goalTitle: 'Érdekesebb munka',
      noCloseRelationships: false,
    };
    const relationships = [
      {
        id: randomUUID(),
        label: 'Párom',
        type: 'partner' as const,
        closeness: 80,
        support: 78,
        conflict: 15,
      },
      {
        id: randomUUID(),
        label: 'Barát A',
        type: 'friend' as const,
        closeness: 65,
        support: 70,
        conflict: 5,
      },
    ];
    if (caseName === 'creative') {
      Object.assign(answers, {
        ageBand: '25_34',
        region: 'Budapest',
        regionType: 'capital',
        relationshipStatus: 'single',
        children: 0,
        employmentStatus: 'student',
        workDomain: 'Grafikai tervezés',
        workSatisfaction: 55,
        financialStability: 38,
        housingStability: 60,
        relocationWillingness: 65,
        careerChangeWillingness: 85,
        riskTolerance: 70,
        changeSeeking: 82,
        securityNeed: 35,
        learningOrientation: 92,
        values: ['learning', 'creativity', 'autonomy'],
        goalCategory: 'learning',
        goalTitle: 'Saját grafikai portfólió összeállítása',
        noCloseRelationships: true,
      });
      relationships.length = 0;
    } else if (caseName === 'career-change') {
      Object.assign(answers, {
        ageBand: '55_64',
        region: 'Veszprém',
        regionType: 'village',
        children: 0,
        workDomain: 'Adminisztráció',
        workSatisfaction: 26,
        financialStability: 42,
        housingStability: 76,
        relocationWillingness: 0,
        careerChangeWillingness: 85,
        riskTolerance: 22,
        changeSeeking: 60,
        securityNeed: 92,
        learningOrientation: 70,
        values: ['security', 'learning', 'calm'],
        goalTitle: 'Nyugodtabb, érdekesebb munka a lakóhelyem közelében',
      });
    }
    const saved = await repo.saveDraft(userId, 0, answers, relationships);
    const profile = await repo.commitProfile(userId, saved.revision);
    const created = await repo.createFuture(
      userId,
      profile.profileVersionId,
      randomUUID(),
      locale,
    );
    async function runJob(expectedId: string) {
      lastJobId = expectedId;
      const job = await jobs.claim();
      if (!job || job.id !== expectedId)
        throw new DomainError(
          'SMOKE_JOB_MISMATCH',
          'Unexpected smoke test job.',
        );
      const heartbeat = setInterval(() => {
        void jobs.heartbeat(job).catch(() => {});
      }, 60000);
      try {
        await processJob(job, jobs, ai);
      } finally {
        clearInterval(heartbeat);
      }
      const status = await repo.job(userId, expectedId);
      if (status.status !== 'completed')
        throw new DomainError(
          'SMOKE_JOB_NOT_COMPLETED',
          'Smoke test job did not complete.',
        );
    }
    console.log(
      'Live AI: generating baseline events, chapters and fidelity check.',
    );
    await runJob(created.jobId);
    const baseline = await repo.branch(userId, created.branchId);
    const baselineHash = hash(baseline);
    const decision = baseline.decisions[0],
      option = decision?.options[0];
    if (!decision || !option)
      throw new DomainError(
        'SMOKE_DECISION_MISSING',
        'No decision was generated.',
      );
    console.log('Live AI: baseline persisted; generating a decision branch.');
    const fork = await repo.resolveDecision(
      userId,
      String(decision.id),
      String(option.id),
      randomUUID(),
    );
    await runJob(fork.jobId);
    const alternative = await repo.branch(userId, fork.newBranchId);
    if (hash(await repo.branch(userId, created.branchId)) !== baselineHash)
      throw new DomainError(
        'SMOKE_PARENT_CHANGED',
        'The parent branch changed.',
      );
    const forkIndex = baseline.events.findIndex(
      (event) => event.id === decision.event_id,
    );
    const inheritedIds = alternative.events
      .filter((event) => event.inherited)
      .map((event) => event.id);
    if (
      forkIndex < 0 ||
      hash(inheritedIds) !==
        hash(baseline.events.slice(0, forkIndex + 1).map((event) => event.id))
    )
      throw new DomainError(
        'SMOKE_PREFIX_CHANGED',
        'The inherited timeline does not match the parent.',
      );
    const receipts = await db.query(
      'SELECT metadata FROM ff_ai_runs WHERE user_id=$1 ORDER BY created_at',
      [userId],
    );
    const report = {
      testedAt: new Date().toISOString(),
      syntheticProfile: true,
      caseName,
      locale,
      syntheticAnswers: answers,
      syntheticRelationships: relationships,
      usesRealOpenAI: true,
      database: 'isolated PostgreSQL (PGlite)',
      authTested: false,
      baseline,
      alternative,
      receipts,
      spending: ledger(),
      parentUnchanged: true,
      inheritedEvents: inheritedIds.length,
      chosenOption: option,
    };
    await writeFile(
      resolve(outputDirectory, 'report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    const render = (branch: typeof baseline) =>
      branch.chapters
        .map((row) => {
          const chapter = row.payload as ChapterOutput['chapters'][number];
          return `### ${chapter.chapterNo}. ${chapter.title}\n\n${chapter.lead}\n\n${chapter.body}`;
        })
        .join('\n\n');
    const markdown = `# Valódi AI-generálási próba — ${caseName}\n\nKitalált tesztprofil, valódi OpenAI-válaszok. Nem személyes előrejelzés.\n\n## Alapforgatókönyv\n\n${render(baseline)}\n\n## Új életág: ${alternative.name}\n\n${render(alternative)}\n`;
    await writeFile(resolve(outputDirectory, 'story.md'), markdown);
    console.log(
      JSON.stringify({
        status: 'passed',
        caseName,
        baselineEvents: baseline.events.length,
        baselineChapters: baseline.chapters.length,
        branchEvents: alternative.events.length,
        branchChapters: alternative.chapters.length,
        aiCalls: receipts.length,
        estimatedUsd: ledger().estimatedUsd,
        report: resolve(outputDirectory, 'story.md'),
      }),
    );
  } catch (error) {
    const code = error instanceof DomainError ? error.code : 'SMOKE_FAILED';
    const checkpoint = lastJobId
      ? (
          await db.query('SELECT stage,checkpoints FROM ff_jobs WHERE id=$1', [
            lastJobId,
          ])
        )[0]
      : null;
    await writeFile(
      resolve(outputDirectory, 'failure.json'),
      JSON.stringify(
        {
          testedAt: new Date().toISOString(),
          code,
          checkpoint,
          spending: ledger(),
        },
        null,
        2,
      ) + '\n',
    );
    console.error(
      `Live AI smoke failed (${code}). No credentials or raw provider errors were logged.`,
    );
    process.exitCode = 1;
  } finally {
    await engine.close();
  }
}
main().catch(() => {
  console.error(
    'Live AI smoke could not start. Check the protected server environment.',
  );
  process.exitCode = 1;
});
