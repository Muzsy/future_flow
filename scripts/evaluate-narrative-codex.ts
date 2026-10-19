import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DomainError } from '@future-flow/core';
import { parseEvaluationOptions } from './lib/narrative-evaluation-options';
import { runNarrativeEvaluation } from './lib/narrative-evaluation-runner';
import { writeEvaluationArtifacts } from './lib/narrative-evaluation-artifacts';
import { codexLocalResponder } from './lib/narrative-evaluation-codex';

// Usage: pnpm narrative:codex --creative-only --fixtures career-transition
//   --periods 3 --no-forks --out .local/narrative-evaluation/<name>
// Always offline mode: no API key, ledger or budget authority is involved.
export async function evaluateNarrativeWithCodex(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
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
    reasoningEffort: env.ALTERWARD_CODEX_EFFORT ?? 'low',
    timeoutMs: 600000,
  };
  await mkdir(options.out, { recursive: true });
  await writeFile(
    join(options.out, 'codex-local.json'),
    JSON.stringify(
      {
        transport: 'codex-local',
        model: codex.model,
        reasoningEffort: codex.reasoningEffort,
        comparableWithPaid: false,
        note: 'Directional development evidence only; not a measurement.',
      },
      null,
      2,
    ) + '\n',
  );
  const run = await runNarrativeEvaluation(
    options,
    {},
    codexLocalResponder(codex),
  );
  return writeEvaluationArtifacts(run, options);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  evaluateNarrativeWithCodex(process.argv.slice(2))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(
        `[narrative-codex] ${error instanceof DomainError ? error.code : 'EVAL_INTERRUPTED'}`,
      );
      process.exitCode = 1;
    });
}
