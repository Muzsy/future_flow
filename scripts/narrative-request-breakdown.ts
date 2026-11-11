import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  breakdownMarkdown,
  breakdownRun,
} from './lib/narrative-request-breakdown';

// Usage: pnpm narrative:request-breakdown [--out <dir>] <run-dir>[:<state-name>] ...
// Rebuilds the author requests of each stored run from its saved state and
// attempt trace and splits their bytes. No provider, no ledger. The state name
// defaults to career-transition-narrative-v1.
export async function runNarrativeRequestBreakdown(argv: string[]) {
  const outIndex = argv.indexOf('--out');
  const out = outIndex >= 0 ? argv[outIndex + 1] : undefined;
  const specs = argv.filter(
    (arg, i) => arg !== '--out' && (outIndex < 0 || i !== outIndex + 1),
  );
  if (!specs.length)
    throw new Error(
      'Usage: narrative:request-breakdown [--out <dir>] <run-dir>[:<state-name>]...',
    );
  const runs = [];
  for (const spec of specs) {
    const [dir, state = 'career-transition-narrative-v1'] = spec.split(':');
    runs.push(await breakdownRun(resolve(dir!), state));
  }
  const markdown = breakdownMarkdown(runs);
  if (out) {
    await mkdir(out, { recursive: true });
    await writeFile(
      join(out, 'request-breakdown.json'),
      JSON.stringify(runs, null, 2) + '\n',
    );
    await writeFile(join(out, 'request-breakdown.md'), markdown);
  }
  return markdown;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runNarrativeRequestBreakdown(process.argv.slice(2))
    .then((markdown) => process.stdout.write(markdown))
    .catch((error: Error) => {
      console.error(`[narrative-request-breakdown] ${error.message}`);
      process.exitCode = 1;
    });
}
