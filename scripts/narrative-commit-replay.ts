import { pathToFileURL } from 'node:url';
import { replayFailedCommit } from './lib/narrative-commit-replay';

// Usage: pnpm narrative:commit-replay --state <pglite-dir> [--job <id>] [--in-place]
// Replays a failed creative job from its saved state without any model call and
// prints the validator's own failure message. Works on a copy unless
// --in-place is given, and then writes only a job that now commits.
export async function runNarrativeCommitReplay(argv: string[]) {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const stateDir = value('--state');
  if (!stateDir)
    throw new Error(
      'Usage: narrative:commit-replay --state <pglite-dir> [--job <id>] [--in-place]',
    );
  return replayFailedCommit({
    stateDir,
    jobId: value('--job'),
    inPlace: argv.includes('--in-place'),
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runNarrativeCommitReplay(process.argv.slice(2))
    .then((result) =>
      process.stdout.write(JSON.stringify(result, null, 2) + '\n'),
    )
    .catch((error: Error) => {
      console.error(`[narrative-commit-replay] ${error.message}`);
      process.exitCode = 1;
    });
}
