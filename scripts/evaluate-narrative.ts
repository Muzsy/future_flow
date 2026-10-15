import { pathToFileURL } from 'node:url';
import { DomainError } from '@future-flow/core';
import { parseEvaluationOptions } from './lib/narrative-evaluation-options';
import { runNarrativeEvaluation } from './lib/narrative-evaluation-runner';
import {
  writeEvaluationArtifacts,
  assessEvaluationArtifacts,
} from './lib/narrative-evaluation-artifacts';

export async function evaluateNarrative(
  argv: string[] = process.argv.slice(2),
  env: Record<string, string | undefined> = process.env,
) {
  const options = parseEvaluationOptions(argv, env);
  if (options.kind === 'assess') return assessEvaluationArtifacts(options);
  const run = await runNarrativeEvaluation(options, env);
  return writeEvaluationArtifacts(run, options);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  evaluateNarrative()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      // SDK/JSON errors may contain credential or input fragments. Never print them.
      console.error(
        `[narrative-evaluation] ${error instanceof DomainError ? error.code : 'EVAL_INTERRUPTED'}`,
      );
      process.exitCode = 1;
    });
}
