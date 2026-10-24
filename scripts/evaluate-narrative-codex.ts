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

// Usage: pnpm narrative:codex --creative-only --fixtures career-transition
//   --periods 3 --no-forks --out .local/narrative-evaluation/<name>
// Always offline mode: no API key, ledger or budget authority is involved.
// Quota: a new series starts only with a reserve in the plan windows; before
// each further chapter a smaller reserve is required, and a spent quota stops
// the run (exit code 3) with the partial output kept for a later resume.
export async function evaluateNarrativeWithCodex(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
  responder?: OfflineMockResponder,
  quota?: QuotaSource,
) {
  if (
    argv.some((a) =>
      ['--mode', '--allow-paid', '--budget-usd', '--approval-id'].includes(a),
    )
  )
    throw new DomainError(
      'EVAL_CONFIG_INVALID',
      'The local Codex transport is offline-only.',
    );
  const options = parseEvaluationOptions(['--mode', 'offline', ...argv], {});
  if (!options.creative)
    throw new DomainError(
      'EVAL_CONFIG_INVALID',
      'The local Codex transport is for creative fiction runs.',
    );
  const codex = {
    bin: env.ALTERWARD_CODEX_BIN ?? 'codex',
    model: options.models.story,
  };
  const guard =
    responder && !quota
      ? null
      : new LocalQuotaGuard(quota ?? codexQuotaSource(codex.bin), {
          sticky: true,
        });
  await guard?.preflight();
  const run = await runNarrativeEvaluation(
    options,
    {},
    guard
      ? quotaGuarded(guard, responder ?? codexLocalResponder(codex))
      : responder,
  );
  await guard?.finish();
  const result = await writeEvaluationArtifacts(run, options);
  const markerPath = join(options.out, 'codex-local.json');
  const history = await priorQuotaHistory(markerPath);
  // Written after the run: the runner only accepts an empty directory or
  // one it created itself.
  await writeFile(
    markerPath,
    JSON.stringify(
      {
        transport: 'codex-local',
        model: codex.model,
        reasoningEffort: CODEX_REASONING_EFFORT,
        ignoreUserConfig: true,
        ignoreRules: true,
        deadline: 'per request, as in the API call',
        outputLimit: `max_output_tokens of the request, checked after the call from UTF-8 size (${CODEX_BYTES_PER_TOKEN_ESTIMATE} bytes per token); reasoning tokens not counted`,
        comparableWithPaid: false,
        note: 'Directional development evidence only; not a measurement.',
        quota: guard
          ? {
              halted: guard.halted?.message ?? null,
              log: guard.log,
              history,
            }
          : null,
      },
      null,
      2,
    ) + '\n',
  );
  return { ...result, quotaHalt: guard?.halted?.message ?? null };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  evaluateNarrativeWithCodex(process.argv.slice(2))
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.quotaHalt) process.exitCode = 3;
    })
    .catch((error) => {
      console.error(
        error instanceof QuotaHalt
          ? `[narrative-codex] ${error.code}: ${error.message}`
          : `[narrative-codex] ${error instanceof DomainError ? error.code : 'EVAL_INTERRUPTED'}`,
      );
      process.exitCode = error instanceof QuotaHalt ? 3 : 1;
    });
}
