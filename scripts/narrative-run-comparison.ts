import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  compareRuns,
  comparisonMarkdown,
  type ComparisonRun,
} from './lib/narrative-run-comparison';

// Usage: pnpm narrative:compare [--out <dir>] <run-dir> [<run-dir> ...]
// Reads each run's report.json and transport-records.json; no provider.
export async function runNarrativeComparison(argv: string[]) {
  const outIndex = argv.indexOf('--out');
  const out = outIndex >= 0 ? argv[outIndex + 1] : undefined;
  const dirs = argv.filter(
    (arg, i) => arg !== '--out' && (outIndex < 0 || i !== outIndex + 1),
  );
  if (!dirs.length)
    throw new Error('Usage: narrative:compare [--out <dir>] <run-dir>...');
  const runs: ComparisonRun[] = [];
  for (const dir of dirs) {
    const root = resolve(dir);
    const read = async (name: string) =>
      JSON.parse(await readFile(join(root, name), 'utf8'));
    runs.push({
      label: basename(root),
      report: await read('report.json'),
      transports: await read('transport-records.json').catch(() => []),
    });
  }
  const result = compareRuns(runs);
  const markdown = comparisonMarkdown(result);
  if (out) {
    await mkdir(out, { recursive: true });
    await writeFile(
      join(out, 'run-comparison.json'),
      JSON.stringify(result, null, 2) + '\n',
    );
    await writeFile(join(out, 'run-comparison.md'), markdown);
  }
  return markdown;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runNarrativeComparison(process.argv.slice(2))
    .then((markdown) => process.stdout.write(markdown))
    .catch((error: Error) => {
      console.error(`[narrative-compare] ${error.message}`);
      process.exitCode = 1;
    });
}
