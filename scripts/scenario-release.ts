import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  ExperimentAiBudget,
  OpenAiProvider,
  type AiRequestGuard,
} from '@future-flow/ai';
import { SCENARIO_REVIEW_VERSION } from '@future-flow/contracts';
import { DomainError } from '@future-flow/core';
import {
  connectDatabase,
  DatabaseAiBudget,
  ScenarioReleaseRepository,
  scenarioReleaseConfigFromEnv,
} from '@future-flow/database';
import {
  privateReportDirectory,
  privateReportFile,
  privateRequestFile,
} from './lib/private-report';
import { runScenarioReview } from './lib/scenario-release';

// No client decision/paid endpoint. All reports and requests stay in a protected directory.
async function main() {
  const config = scenarioReleaseConfigFromEnv();
  if (!config.operatorEnabled)
    throw Error('Trusted scenario operator opt-in required');
  const args = process.argv.slice(2),
    directory = privateReportDirectory('scenario-release');
  const db = connectDatabase(
    process.env.DATABASE_URL ?? '',
    process.env.DATABASE_SSL === 'true',
  );
  let experiment: ExperimentAiBudget | undefined;
  try {
    const releases = new ScenarioReleaseRepository(db, config);
    if (args.length === 1 && args[0] === '--list') {
      const copies = await releases.pending();
      privateReportFile(directory, 'pending-templates.json', {
        generatedAt: new Date().toISOString(),
        publicationApproved: false,
        officialLifeApproved: false,
        copies,
      });
      console.log(
        JSON.stringify({
          privateReportFile: '.local/scenario-release/pending-templates.json',
          pending: copies.length,
          paidAiCalls: 0,
        }),
      );
      return;
    }
    if (args.length === 4 && ['--preflight', '--run'].includes(args[0]!)) {
      const userId = z.uuid().parse(args[1]),
        scenarioVersionId = z.uuid().parse(args[2]),
        templateHash = z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .parse(args[3]);
      const inspected = await releases.inspect(userId, scenarioVersionId);
      if (templateHash !== inspected.view.templateHash)
        throw Error('Exact template hash required');
      privateReportFile(directory, 'template-preview.json', inspected);
      if (
        args[0] === '--preflight' ||
        inspected.view.review?.status === 'completed'
      ) {
        console.log(
          JSON.stringify({
            status: inspected.view.review?.status ?? 'not_started',
            fields: inspected.input.fields.length,
            paidAiCalls: 0,
            publicationApproved: false,
            officialLifeApproved: false,
          }),
        );
        return;
      }
      if (!existsSync('.local/ai-smoke/usage.json'))
        throw Error('Cumulative experimental ledger required');
      experiment = new ExperimentAiBudget(
        '.local/ai-smoke/usage.json',
        5,
        'scenario-release-p09',
      );
      let ceiling = 0;
      const result = await runScenarioReview(
        db,
        config,
        userId,
        {
          scenarioVersionId,
          templateHash,
          policyVersion: SCENARIO_REVIEW_VERSION,
          acknowledged: true,
        },
        (reviewId) => {
          const budget = new DatabaseAiBudget(db, userId, reviewId, config);
          const guard: AiRequestGuard = {
            reserve: async (raw) => {
              const p = raw as { model: string; max_output_tokens: number };
              if (p.model !== 'gpt-6.1-sol')
                throw Error('This experiment pins the evaluated checker');
              const bound =
                ((Buffer.byteLength(JSON.stringify(raw), 'utf8') + 4096) * 2.5 +
                  p.max_output_tokens * 10) /
                1e6;
              ceiling += bound;
              if (ceiling > 0.25)
                throw Error('Scenario review per-run ceiling exceeded');
              const database = await budget.reserve(raw);
              try {
                const local = await experiment!.reserve(raw);
                return JSON.stringify({ database, local });
              } catch (error) {
                await budget.settle(database, {
                  input_tokens: 0,
                  output_tokens: 0,
                });
                throw error;
              }
            },
            settle: async (id, usage) => {
              const r = JSON.parse(id) as { database: string; local: string };
              await experiment!.settle(r.local, usage);
              await budget.settle(r.database, usage);
            },
          };
          return new OpenAiProvider({
            apiKey: process.env.OPENAI_API_KEY ?? '',
            eventModel: 'gpt-6.1-sol',
            storyModel: 'gpt-6.1-sol',
            checkModel: 'gpt-6.1-sol',
            timeoutMs: 90000,
            maxOutputTokens: 2200,
            guard,
          });
        },
      );
      privateReportFile(directory, 'review-result.json', result);
      console.log(
        JSON.stringify({
          reused: result.reused,
          status: result.view.review?.status,
          verdict: result.view.review?.report?.verdict,
          findings: result.view.review?.report?.findings.length,
          providerEvidence: result.view.review?.providerEvidence,
          publicationApproved: false,
          officialLifeApproved: false,
        }),
      );
      return;
    }
    if (
      args.length === 4 &&
      ['--decide', '--grant', '--revoke'].includes(args[0]!) &&
      args[1] === '--request-file' &&
      args[3] === '--apply'
    ) {
      const file = privateRequestFile(directory, args[2]!),
        request = JSON.parse(readFileSync(file, 'utf8'));
      const view = await (args[0] === '--decide'
        ? releases.decide(request)
        : args[0] === '--grant'
          ? releases.grant(request)
          : releases.revoke(request));
      privateReportFile(directory, 'decision-result.json', view);
      console.log(
        JSON.stringify({
          curationStatus: view.curation?.status,
          sourceStatus: view.sourceGrant?.status,
          sourceUsable: view.sourceGrant?.usable,
          publicationApproved: false,
          officialLifeApproved: false,
          paidAiCalls: 0,
        }),
      );
      return;
    }
    throw Error(
      'Use --list, --preflight/--run owner version exact-hash, or --decide/--grant/--revoke --request-file protected-file --apply',
    );
  } finally {
    experiment?.close();
    await db.close();
  }
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      scenarioRelease: 'failed',
      code:
        error instanceof DomainError ? error.code : 'SCENARIO_RELEASE_FAILED',
      publicationApproved: false,
      officialLifeApproved: false,
    }),
  );
  process.exitCode = 1;
});
