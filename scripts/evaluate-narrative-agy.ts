import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DomainError } from '@future-flow/core';
import { parseEvaluationOptions } from './lib/narrative-evaluation-options';
import {
  runNarrativeEvaluation,
  type OfflineMockResponder,
} from './lib/narrative-evaluation-runner';
import { writeEvaluationArtifacts } from './lib/narrative-evaluation-artifacts';
import {
  AGY_MODEL,
  AGY_MODEL_INDEPENDENT_TASKS,
  agyLocalResponder,
  agyQuotaSource,
  createAgyHome,
  type AgyStats,
} from './lib/narrative-evaluation-agy';
import {
  CODEX_BYTES_PER_TOKEN_ESTIMATE,
  CODEX_REASONING_EFFORT,
  codexLocalResponder,
  codexQuotaSource,
} from './lib/narrative-evaluation-codex';
import {
  LocalQuotaGuard,
  QuotaHalt,
  priorQuotaHistory,
  quotaGuarded,
  type QuotaSource,
} from './lib/narrative-evaluation-quota';

// Usage: pnpm narrative:agy --run-label plumbing --creative-only --fixtures career-transition
//   --periods 3 --no-forks --out .local/narrative-evaluation/<name>
// The run label is required. In a `plumbing` or `smoke` run the steps where
// the model type does not matter (AGY_MODEL_INDEPENDENT_TASKS) go to
// Antigravity, Gemini 3.8 Flash; every other step goes to the Codex runner
// (gpt-6.1-sol). In a `quality` run (quality diagnostics) every step stays on
// Codex, because the strictness of the review steps depends on the model. Always offline: no API
// key, ledger or budget authority is involved. When the Gemini weekly quota
// reserve is gone those steps move to Codex, but only if Codex still has its
// reserve; if it has not, the run stops (exit code 3). Every routing decision
// and fallback is recorded in agy-local.json, nothing switches silently.
export const AGY_RUN_LABELS = ['plumbing', 'smoke', 'quality'] as const;
export type AgyRunLabel = (typeof AGY_RUN_LABELS)[number];

export type AgyRunDeps = {
  agy?: { responder: OfflineMockResponder; quota: QuotaSource };
  codex?: { responder: OfflineMockResponder; quota: QuotaSource };
};

export async function evaluateNarrativeWithAgy(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
  deps: AgyRunDeps = {},
) {
  if (
    argv.some((a) =>
      ['--mode', '--allow-paid', '--budget-usd', '--approval-id'].includes(a),
    )
  )
    throw new DomainError(
      'EVAL_CONFIG_INVALID',
      'The local agy transport is offline-only.',
    );
  const labelIndex = argv.indexOf('--run-label');
  const label = labelIndex >= 0 ? argv[labelIndex + 1] : undefined;
  if (!AGY_RUN_LABELS.includes(label as AgyRunLabel))
    throw new DomainError(
      'EVAL_CONFIG_INVALID',
      `--run-label must be one of ${AGY_RUN_LABELS.join(', ')}.`,
    );
  const useAgy = label !== 'quality';
  const options = parseEvaluationOptions(
    [
      '--mode',
      'offline',
      ...argv.filter((_, i) => i !== labelIndex && i !== labelIndex + 1),
    ],
    {},
  );
  if (!options.creative)
    throw new DomainError(
      'EVAL_CONFIG_INVALID',
      'The local agy transport is for creative fiction runs.',
    );
  const codexBin = env.ALTERWARD_CODEX_BIN ?? 'codex';
  const agyBin = env.ALTERWARD_AGY_BIN ?? 'agy';
  const home = deps.agy || !useAgy ? null : createAgyHome();
  const stats: AgyStats = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
  };
  try {
    const codexQuota = deps.codex?.quota ?? codexQuotaSource(codexBin);
    const agyQuota =
      deps.agy?.quota ?? agyQuotaSource(agyBin, home?.home ?? '');
    const codexGuard = new LocalQuotaGuard(codexQuota, { sticky: true });
    const agyGuard = new LocalQuotaGuard(agyQuota, { sticky: false });
    const codexResponder = quotaGuarded(
      codexGuard,
      deps.codex?.responder ??
        codexLocalResponder({ bin: codexBin, model: options.models.story }),
    );
    const agyResponder =
      deps.agy?.responder ??
      agyLocalResponder({ bin: agyBin, home: home?.home ?? '' }, stats);
    const routing = {
      agy: 0,
      codex: 0,
      fallbacks: [] as { task: string; caseId: string; reason: string }[],
    };
    // Codex is needed for the model-dependent steps in any case.
    await codexGuard.preflight();
    const router: OfflineMockResponder = async (context) => {
      if (useAgy && AGY_MODEL_INDEPENDENT_TASKS.has(context.task)) {
        const halt = await agyGuard
          .check(context.caseId)
          .catch(
            (error: unknown) =>
              new QuotaHalt(
                'agy',
                error instanceof Error ? error.message : 'quota unreadable',
                null,
              ),
          );
        if (!halt) {
          routing.agy += 1;
          try {
            return await agyResponder(context);
          } catch (error) {
            // A failure that coincides with a spent quota moves the next steps
            // to Codex; this call itself still fails visibly.
            await agyGuard.afterFailure(context.caseId).catch(() => null);
            throw error;
          }
        }
        routing.fallbacks.push({
          task: context.task,
          caseId: context.caseId,
          reason: halt.reason,
        });
      }
      routing.codex += 1;
      return codexResponder(context);
    };
    const run = await runNarrativeEvaluation(options, {}, router);
    await codexGuard.finish();
    await agyGuard.finish().catch(() => undefined);
    const result = await writeEvaluationArtifacts(run, options);
    const markerPath = join(options.out, 'agy-local.json');
    const history = {
      codex: await priorQuotaHistory(markerPath, 'codex'),
      agy: await priorQuotaHistory(markerPath, 'agy'),
    };
    await writeFile(
      markerPath,
      JSON.stringify(
        {
          transport: 'agy-local+codex-local',
          runLabel: label,
          purpose: useAgy ? 'plumbing diagnostic' : 'quality diagnostic',
          qualityEvidence: false,
          comparableWithPaid: false,
          agy: {
            used: useAgy,
            model: AGY_MODEL,
            tasks: [...AGY_MODEL_INDEPENDENT_TASKS],
            isolatedHome: true,
            deadline: 'per request, as in the API call',
            outputLimit:
              'max_output_tokens of the request against the reported output tokens (thinking included)',
            schema:
              'in the prompt; --json-schema not used (agent looped in a probe); validated by the pipeline Zod parse',
            usage: stats,
          },
          codex: {
            model: options.models.story,
            reasoningEffort: CODEX_REASONING_EFFORT,
            ignoreUserConfig: true,
            ignoreRules: true,
            outputLimit: `post-hoc UTF-8 size estimate (${CODEX_BYTES_PER_TOKEN_ESTIMATE} bytes per token)`,
          },
          routing,
          quota: {
            codex: {
              halted: codexGuard.halted?.message ?? null,
              log: codexGuard.log,
              history: history.codex,
            },
            agy: { log: agyGuard.log, history: history.agy },
          },
        },
        null,
        2,
      ) + '\n',
    );
    return { ...result, quotaHalt: codexGuard.halted?.message ?? null };
  } finally {
    home?.cleanup();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  evaluateNarrativeWithAgy(process.argv.slice(2))
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.quotaHalt) process.exitCode = 3;
    })
    .catch((error) => {
      console.error(
        error instanceof QuotaHalt
          ? `[narrative-agy] ${error.code}: ${error.message}`
          : `[narrative-agy] ${error instanceof DomainError ? error.code : 'EVAL_INTERRUPTED'}`,
      );
      process.exitCode = error instanceof QuotaHalt ? 3 : 1;
    });
}
