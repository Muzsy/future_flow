import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  cacheReceipts,
  cacheReceiptsMarkdown,
} from './lib/narrative-cache-receipts';

// Usage: pnpm narrative:cache-receipts [--out <dir>] <run-dir> ...
// Reads report.json of each stored evaluation run (no provider, nothing
// written into the run) and totals the provider's cache reads and writes per
// stage and per chapter, with an estimated cost against no cache accounting.
// Evidence for the cache-breakpoint cost decision; it changes no request.
export async function runNarrativeCacheReceipts(argv: string[]) {
  const outIndex = argv.indexOf('--out');
  const out = outIndex >= 0 ? argv[outIndex + 1] : undefined;
  const dirs = argv.filter(
    (arg, i) => arg !== '--out' && (outIndex < 0 || i !== outIndex + 1),
  );
  if (!dirs.length)
    throw new Error(
      'Usage: narrative:cache-receipts [--out <dir>] <run-dir>...',
    );
  const runs = [];
  for (const dir of dirs)
    runs.push({
      label: basename(resolve(dir)),
      report: JSON.parse(
        await readFile(join(resolve(dir), 'report.json'), 'utf8'),
      ),
    });
  const result = cacheReceipts(runs);
  const markdown = cacheReceiptsMarkdown(result);
  if (out) {
    await mkdir(out, { recursive: true });
    await writeFile(
      join(out, 'cache-receipts.json'),
      JSON.stringify(result, null, 2) + '\n',
    );
    await writeFile(join(out, 'cache-receipts.md'), markdown);
  }
  return markdown;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runNarrativeCacheReceipts(process.argv.slice(2))
    .then((markdown) => process.stdout.write(markdown))
    .catch((error: Error) => {
      console.error(`[narrative-cache-receipts] ${error.message}`);
      process.exitCode = 1;
    });
}
