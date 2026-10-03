import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
  OpenAiProvider,
  type AiResult,
  type StoryInput,
} from '@future-flow/ai';
import {
  chapterOutputSchema,
  stateSchema,
  type Profile,
  type ChapterOutput,
} from '@future-flow/contracts';
import {
  buildProfile,
  DomainError,
  hash,
  simulate,
  validateChapters,
  validateSimulation,
  worldState,
  type CanonEvent,
} from '@future-flow/core';
import {
  reserveSmokeCall,
  recordSmokeUsage,
  smokeModelPrices,
  type SmokeCall,
} from './lib/ai-smoke-budget';

const OpenAI = createRequire(import.meta.url)('openai')
  .default as typeof import('openai').default;
const cases = ['creative', 'career-change'] as const;
type SavedReport = {
  syntheticProfile: boolean;
  caseName: string;
  syntheticAnswers: Record<string, unknown>;
  syntheticRelationships: Profile['relationships'];
  baseline: {
    events: { canon: CanonEvent }[];
    chapters: { payload: ChapterOutput['chapters'][number] }[];
  };
};
type StageResult = {
  caseName: string;
  stage: string;
  status: 'passed' | 'failed';
  code?: string;
  result?: unknown;
};

// Development-only, sequential comparison on saved synthetic v1 cases.
// Shares the previous smoke ledger; never accesses Supabase or changes .env.
async function main() {
  const reuseDirectory = process.argv[2];
  if (
    reuseDirectory &&
    !/^20\d{2}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(reuseDirectory)
  )
    throw new DomainError(
      'EVAL_REUSE_INVALID',
      'Expected a local evaluation directory name.',
    );
  const reusedReport = reuseDirectory
    ? (JSON.parse(
        readFileSync(
          resolve('.local/ai-model-eval', reuseDirectory, 'report.json'),
          'utf8',
        ),
      ) as {
        syntheticProfile: boolean;
        candidate: string;
        stages: StageResult[];
      })
    : null;
  if (
    reusedReport &&
    (!reusedReport.syntheticProfile || reusedReport.candidate !== 'gpt-6-luna')
  )
    throw new DomainError(
      'EVAL_FIXTURE_UNSAFE',
      'Only synthetic candidate reports can be reused.',
    );
  const ledgerPath = resolve('.local/ai-smoke/usage.json');
  const calls: SmokeCall[] = JSON.parse(readFileSync(ledgerPath, 'utf8')).calls;
  for (const call of calls) if (call.usage) recordSmokeUsage(call, call.usage);
  const startingAccounted = calls.reduce(
    (sum, call) => sum + call.accountedUsd,
    0,
  );
  const initialCallCount = calls.length;
  const experimentCap = 0.25;
  const budgetUsd = Math.min(1, startingAccounted + experimentCap);
  const outputRoot = resolve(
    '.local/ai-model-eval',
    new Date().toISOString().replace(/[:.]/g, '-'),
  );
  await mkdir(outputRoot, { recursive: true });
  const stages: StageResult[] = [];
  let activeCase = '',
    activeStage = '';
  const summary = () => ({
    testedAt: new Date().toISOString(),
    syntheticProfile: true,
    contract: 'v1-ten-year; not the planned continuation loop',
    candidate: 'gpt-6-luna',
    candidateReasoning: 'low',
    reusedDirectory: reuseDirectory ?? null,
    experimentCap,
    calls: calls.length - initialCallCount,
    estimatedUsd: calls
      .slice(initialCallCount)
      .reduce((sum, call) => sum + (call.estimatedUsd ?? 0), 0),
    accountedUsd: calls
      .slice(initialCallCount)
      .reduce((sum, call) => sum + call.accountedUsd, 0),
    totalEstimatedUsd: calls.reduce(
      (sum, call) => sum + (call.estimatedUsd ?? 0),
      0,
    ),
    unknownUsageCalls: calls
      .slice(initialCallCount)
      .filter((call) => !call.usage).length,
    stages,
  });
  const saveLedger = () =>
    writeFile(
      ledgerPath,
      JSON.stringify(
        {
          budgetUsd: 1,
          pricesByModel: smokeModelPrices,
          calls,
          estimatedUsd: summary().totalEstimatedUsd,
          accountedUsd: calls.reduce((sum, call) => sum + call.accountedUsd, 0),
          unknownUsageCalls: calls.filter((call) => !call.usage).length,
        },
        null,
        2,
      ) + '\n',
    );
  const saveReport = () =>
    writeFile(
      resolve(outputRoot, 'report.json'),
      JSON.stringify(summary(), null, 2) + '\n',
    );
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? '',
    timeout: 180000,
    maxRetries: 0,
    fetch: async (...args) => {
      const [url, init] = args;
      if (!String(url).endsWith('/v1/responses')) return fetch(...args);
      const parameters = JSON.parse(String(init?.body));
      parameters.service_tier = 'default';
      if (parameters.model === 'gpt-6-luna')
        parameters.reasoning = { effort: 'low' };
      const counted = await client.responses.inputTokens.count({
        model: parameters.model,
        input: parameters.input,
        text: parameters.text,
      });
      const call = reserveSmokeCall(
        calls,
        budgetUsd,
        parameters.model,
        parameters.text.format.name,
        counted.input_tokens,
        parameters.max_output_tokens,
      );
      call.caseName = `model-eval:${activeCase}:${activeStage}`;
      await saveLedger();
      console.log(
        `Model eval: ${activeCase}/${activeStage}; ${parameters.model}; ceiling $${call.reservedUsd.toFixed(4)}.`,
      );
      try {
        const response = await fetch(url, {
          ...init,
          body: JSON.stringify(parameters),
        });
        const body = await response.clone().json();
        call.status = body.status ?? `http_${response.status}`;
        if (body.usage) recordSmokeUsage(call, body.usage);
        await saveLedger();
        // Raw responses contain only synthetic cases and remain Git-ignored.
        await writeFile(
          resolve(outputRoot, `${String(calls.length).padStart(3, '0')}.json`),
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
        return response;
      } catch (error) {
        call.status = 'response_unavailable';
        await saveLedger();
        throw error;
      }
    },
  });
  function provider(model: string, maxOutputTokens: number) {
    return new OpenAiProvider(
      {
        apiKey: process.env.OPENAI_API_KEY ?? '',
        eventModel: model,
        storyModel: model,
        timeoutMs: 180000,
        maxOutputTokens,
      },
      client,
    );
  }
  const luna = provider('gpt-6-luna', 8000);
  const lunaChecker = provider('gpt-6-luna', 2048);
  const solChecker = provider('gpt-6.1-sol', 2048);
  async function stage<T>(
    name: string,
    run: () => Promise<AiResult<T>>,
    accept: (output: T) => void,
  ) {
    activeStage = name;
    let result: AiResult<T> | undefined;
    try {
      result = await run();
      accept(result.output);
      stages.push({
        caseName: activeCase,
        stage: name,
        status: 'passed',
        result,
      });
      await saveReport();
      return result.output;
    } catch (error) {
      stages.push({
        caseName: activeCase,
        stage: name,
        status: 'failed',
        code: error instanceof DomainError ? error.code : 'EVAL_STAGE_FAILED',
        result,
      });
      await saveReport();
      return null;
    }
  }
  for (const caseName of cases) {
    activeCase = caseName;
    const sourcePath = resolve(
      '.local/ai-smoke/cases',
      caseName,
      'report.json',
    );
    const originalText = readFileSync(sourcePath, 'utf8');
    const source: SavedReport = JSON.parse(originalText);
    if (
      !source.syntheticProfile ||
      source.caseName !== caseName ||
      !source.syntheticAnswers
    )
      throw new DomainError(
        'EVAL_FIXTURE_UNSAFE',
        'Only saved synthetic smoke cases are accepted.',
      );
    const profile = buildProfile(
      source.syntheticAnswers,
      source.syntheticRelationships,
    );
    const canon = source.baseline.events.map((event) => event.canon);
    const state = stateSchema.parse(canon[0]?.stateBefore);
    const originalChapters = chapterOutputSchema.parse({
      chapters: source.baseline.chapters.map((chapter) => chapter.payload),
    });
    validateChapters(originalChapters, canon);
    const storyInput: StoryInput = {
      locale: 'hu',
      profile,
      events: canon,
      decision: null,
    };
    const assertClean = (output: { valid: boolean; issues: unknown[] }) => {
      if (!output.valid || output.issues.length)
        throw new DomainError(
          'EVAL_CLEAN_REJECTED',
          'Candidate rejected the reference story.',
        );
    };
    const assertDetected = (output: { valid: boolean; issues: unknown[] }) => {
      if (output.valid || !output.issues.length)
        throw new DomainError(
          'EVAL_CORRUPTION_MISSED',
          'Candidate missed the seeded contradiction.',
        );
    };
    if (reusedReport) {
      const savedStory = reusedReport.stages.find(
        (entry) =>
          entry.caseName === caseName &&
          entry.stage === 'chapters-on-reference-canon' &&
          entry.status === 'passed',
      );
      const priorJudge = reusedReport.stages.find(
        (entry) =>
          entry.caseName === caseName &&
          entry.stage === 'sol-check-candidate-story',
      );
      if (
        !savedStory ||
        !priorJudge ||
        (priorJudge.status === 'failed' &&
          priorJudge.code !== 'EVAL_CLEAN_REJECTED')
      )
        throw new DomainError(
          'EVAL_REFERENCE_MISSING',
          'A saved story and a complete Sol verdict are required.',
        );
      const chapters = chapterOutputSchema.parse(
        (savedStory.result as AiResult<ChapterOutput>).output,
      );
      validateChapters(chapters, canon);
      await stage(
        'luna-check-candidate-story',
        () => lunaChecker.checkStory(storyInput, chapters),
        (output) => {
          const expectedValid = priorJudge.status === 'passed';
          if (
            output.valid !== expectedValid ||
            (expectedValid
              ? output.issues.length > 0
              : output.issues.length === 0)
          )
            throw new DomainError(
              'EVAL_JUDGE_DISAGREEMENT',
              'Candidate checker disagreed with the reviewed Sol verdict.',
            );
        },
      );
      continue;
    }
    await stage(
      'check-reference',
      () => lunaChecker.checkStory(storyInput, originalChapters),
      assertClean,
    );
    for (const [name, sentence] of [
      [
        'invented-family',
        'Megszületett a második gyermeked, és saját budapesti házat vásároltál.',
      ],
      [
        'invented-business',
        '2020-ban eladtad a húsz éve tulajdonodban lévő fogorvosi rendelőt, és kiléptél a fogorvosi munkádból.',
      ],
    ]) {
      const corrupted = structuredClone(originalChapters);
      corrupted.chapters[0]!.body += `\n\n${sentence}`;
      await stage(
        `check-${name}`,
        () => lunaChecker.checkStory(storyInput, corrupted),
        assertDetected,
      );
    }
    await stage(
      'events',
      () =>
        luna.events({
          locale: 'hu',
          profile,
          state,
          world: worldState(profile),
          horizonMonths: 120,
          seed: 137,
          decision: null,
        }),
      (output) => {
        simulate(validateSimulation(output, profile, 120), state);
      },
    );
    // Hold canon constant to compare narration independently of event planning.
    const chapters = await stage(
      'chapters-on-reference-canon',
      () => luna.chapters(storyInput),
      (output) => {
        validateChapters(output, canon);
      },
    );
    if (chapters) {
      await stage(
        'sol-check-candidate-story',
        () => solChecker.checkStory(storyInput, chapters),
        assertClean,
      );
      const markdown =
        `# Luna-modellel írt történet — ${caseName}\n\nSzintetikus v1-profil, a korábbi Sol-eseménycanon alapján.\n\n` +
        chapters.chapters
          .map(
            (chapter) =>
              `## ${chapter.title}\n\n${chapter.lead}\n\n${chapter.body}`,
          )
          .join('\n\n') +
        '\n';
      await writeFile(resolve(outputRoot, `${caseName}.md`), markdown);
    }
    if (hash(readFileSync(sourcePath, 'utf8')) !== hash(originalText))
      throw new DomainError(
        'EVAL_REFERENCE_CHANGED',
        'Saved reference was modified.',
      );
  }
  await saveReport();
  console.log(
    JSON.stringify({
      ...summary(),
      stages: stages.map(({ result: _result, ...entry }) => entry),
      report: outputRoot,
    }),
  );
  if (stages.some((entry) => entry.status === 'failed')) process.exitCode = 1;
}
main().catch((error) => {
  console.error(
    `Model evaluation stopped (${error instanceof DomainError ? error.code : 'EVAL_FAILED'}). No credentials or raw errors logged.`,
  );
  process.exitCode = 1;
});
