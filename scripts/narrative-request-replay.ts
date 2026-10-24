import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  compareMarkdown,
  compareReplays,
  replayMarkdown,
  replayRun,
  type RunReplay,
} from './lib/narrative-request-replay';

// Usage:
//   pnpm narrative:request-replay [--out <dir>] <run-dir>[:<state-name>] ...
//   pnpm narrative:request-replay --compare <replay-a.json> <replay-b.json> [--out <dir>]
// The first form rebuilds every request of each stored run with the provider
// code of THIS checkout (no model call) and writes request-replay.json/.md.
// Run it in two checkouts (for example the control commit and the candidate)
// on the same stored run, then compare the two JSON files: the difference is
// what the code adds on identical content. The state name defaults to
// career-transition-narrative-v1.
export async function runNarrativeRequestReplay(argv: string[]) {
  const outIndex = argv.indexOf('--out');
  const out = outIndex >= 0 ? argv[outIndex + 1] : undefined;
  const compare = argv.indexOf('--compare');
  const rest = argv.filter(
    (arg, i) =>
      arg !== '--out' &&
      arg !== '--compare' &&
      (outIndex < 0 || i !== outIndex + 1),
  );
  let markdown: string, json: unknown, name: string;
  if (compare >= 0) {
    if (rest.length !== 2)
      throw new Error(
        'Usage: narrative:request-replay --compare <replay-a.json> <replay-b.json> [--out <dir>]',
      );
    const [a, b] = await Promise.all(
      rest.map(
        async (file) =>
          (
            JSON.parse(await readFile(resolve(file), 'utf8')) as RunReplay[]
          )[0]!,
      ),
    );
    const deltas = compareReplays(a!, b!);
    markdown = compareMarkdown(deltas, [a!.label, b!.label]);
    json = deltas;
    name = 'request-replay-comparison';
  } else {
    if (!rest.length)
      throw new Error(
        'Usage: narrative:request-replay [--out <dir>] <run-dir>[:<state-name>]...',
      );
    const runs: RunReplay[] = [];
    for (const spec of rest) {
      const [dir, state = 'career-transition-narrative-v1'] = spec.split(':');
      runs.push(await replayRun(resolve(dir!), state));
    }
    markdown = replayMarkdown(runs);
    json = runs;
    name = 'request-replay';
  }
  if (out) {
    await mkdir(out, { recursive: true });
    await writeFile(
      join(out, `${name}.json`),
      JSON.stringify(json, null, 2) + '\n',
    );
    await writeFile(join(out, `${name}.md`), markdown);
  }
  return markdown;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runNarrativeRequestReplay(process.argv.slice(2))
    .then((markdown) => process.stdout.write(markdown))
    .catch((error: Error) => {
      console.error(`[narrative-request-replay] ${error.message}`);
      process.exitCode = 1;
    });
}
