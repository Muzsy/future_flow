import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  auditMarkdown,
  narrativeSeriesAudit,
  type AuditRun,
} from './lib/narrative-series-audit';

// Usage: pnpm narrative:audit [--out <dir>] <run-dir> [<run-dir> ...]
// Reads each run's stored report.json; never calls a provider or the ledger.
export async function runNarrativeSeriesAudit(argv: string[]) {
  const outIndex = argv.indexOf('--out');
  const out = outIndex >= 0 ? argv[outIndex + 1] : undefined;
  const dirs = argv.filter(
    (arg, i) => arg !== '--out' && (outIndex < 0 || i !== outIndex + 1),
  );
  if (!dirs.length)
    throw new Error('Usage: narrative:audit [--out <dir>] <run-dir>...');
  const runs: AuditRun[] = [];
  for (const dir of dirs) {
    const report = JSON.parse(
      await readFile(join(resolve(dir), 'report.json'), 'utf8'),
    ) as { samples?: AuditRun['samples'] };
    runs.push({ label: basename(resolve(dir)), samples: report.samples ?? [] });
  }
  const audit = narrativeSeriesAudit(runs);
  const markdown = auditMarkdown(audit);
  if (out) {
    await mkdir(out, { recursive: true });
    await writeFile(
      join(out, 'series-audit.json'),
      JSON.stringify(audit, null, 2) + '\n',
    );
    await writeFile(join(out, 'series-audit.md'), markdown);
  }
  return markdown;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runNarrativeSeriesAudit(process.argv.slice(2))
    .then((markdown) => process.stdout.write(markdown))
    .catch((error: Error) => {
      console.error(`[narrative-audit] ${error.message}`);
      process.exitCode = 1;
    });
}
