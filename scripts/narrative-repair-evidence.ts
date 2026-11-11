import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  repairEvidence,
  repairEvidenceMarkdown,
} from './lib/narrative-repair-evidence';

// Usage: pnpm narrative:repair-evidence [--out <dir>] <run-dir>...
// What each author repair did (mode, wording, checker findings before and after,
// story facts frozen or grown) and the latency of every call with its request
// and output bytes. Reads transport-records.json and diagnostic-attempts/ of
// each run only; opens no state directory, no provider, no ledger.
export async function runNarrativeRepairEvidence(argv: string[]) {
  const outIndex = argv.indexOf('--out');
  const out = outIndex >= 0 ? argv[outIndex + 1] : undefined;
  const dirs = argv.filter(
    (arg, i) => arg !== '--out' && (outIndex < 0 || i !== outIndex + 1),
  );
  if (!dirs.length)
    throw new Error(
      'Usage: narrative:repair-evidence [--out <dir>] <run-dir>...',
    );
  const runs = dirs.map((dir) => repairEvidence(dir));
  const markdown = repairEvidenceMarkdown(runs);
  if (out) {
    await mkdir(out, { recursive: true });
    await writeFile(
      join(out, 'repair-evidence.json'),
      JSON.stringify(runs, null, 2) + '\n',
    );
    await writeFile(join(out, 'repair-evidence.md'), markdown);
  }
  return markdown;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runNarrativeRepairEvidence(process.argv.slice(2))
    .then((markdown) => process.stdout.write(markdown))
    .catch((error: Error) => {
      console.error(`[narrative-repair-evidence] ${error.message}`);
      process.exitCode = 1;
    });
}
