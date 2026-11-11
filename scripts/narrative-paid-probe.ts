import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { storedChapters } from './lib/narrative-request-breakdown';
import {
  PROBE_DEFAULT_MAX_SPEND_USD,
  paidProbeEnvironment,
  paidProbeMarkdown,
  runPaidProbe,
  storedFactsOnlyCases,
  syntheticFactsOnlyCase,
  type FactsOnlyCase,
  type PaidProbeResult,
} from './lib/narrative-paid-probe';
import {
  positiveInteger,
  probeArgs,
  probeOutputDir,
  refuseExisting,
  resolveStateName,
  writeProbeFile,
} from './lib/narrative-probe';
import {
  ledgerMarkdown,
  paidLockStatus,
  readLedgerCalls,
  summariseLedger,
} from './lib/paid-ledger-summary';
import { readFileSync, existsSync } from 'node:fs';

// Usage:
//   pnpm narrative:paid-probe list   --run <run dir>[,<run dir>] [--state <name>]
//   pnpm narrative:paid-probe run    --run <dirs> [--state <name>] --out <dir>
//        --paid yes --approval-id <id> [--max-spend-usd 0.6] [--cases 2]
//        [--smoke yes|no] --synthetic yes|no
//   pnpm narrative:paid-probe ledger [--since <ISO time>] [--case-name-prefix <p>]
//        [--ledger <file>] [--out <dir>]
//
// `list` and `ledger` spend nothing and need no key. `run` makes PAID calls
// (two tiny schema-smoke calls, then one real facts-only repair request per
// case) through the shared experiment ledger: the ledger total is recorded at
// the start and the end, every call's receipt (tokens, requestId) and the
// ledger's accounted and usage-estimated USD are written to the report, and
// the probe's cumulative budget is the ledger total at the start plus
// --max-spend-usd, so it cannot spend more than its own cap. The stored runs
// are only read; --out must be outside them. Needs NARRATIVE_EVAL_API_KEY,
// NARRATIVE_EVAL_PROJECT_ID and NARRATIVE_EVAL_PROJECT_CONFIRMATION in the
// environment, like the evaluation itself; the key is never printed or written.
const LEDGER = '.local/narrative-evaluation/paid-usage.json';
const BINDINGS = '.local/narrative-evaluation/budget-bindings.json';

const yes = (value: string | undefined, fallback: boolean) =>
  value === undefined ? fallback : value === 'yes';

async function casesFor(
  runs: string[],
  state: string | undefined,
  count: number,
  synthetic: boolean,
) {
  const stored: FactsOnlyCase[] = [];
  const chapters: {
    label: string;
    chapter: Awaited<ReturnType<typeof storedChapters>>['chapters'][number];
  }[] = [];
  for (const run of runs) {
    const loaded = await storedChapters(run, resolveStateName(run, state));
    const label = resolve(run).split('/').at(-1)!;
    stored.push(...storedFactsOnlyCases(loaded.chapters, label));
    chapters.push(...loaded.chapters.map((chapter) => ({ label, chapter })));
  }
  const cases = stored.slice(0, count);
  if (synthetic)
    for (const { label, chapter } of chapters) {
      if (cases.length >= count) break;
      const made = syntheticFactsOnlyCase(chapter, label);
      if (made) cases.push(made);
    }
  return { stored: stored.length, cases };
}

export async function runNarrativePaidProbe(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
  test: Partial<
    Pick<Parameters<typeof runPaidProbe>[0], 'client' | 'now'>
  > = {},
) {
  const [command, ...rest] = argv;
  if (command === 'ledger') {
    const args = probeArgs(rest, [
      '--ledger',
      '--since',
      '--case-name-prefix',
      '--bindings',
      '--out',
    ]);
    const ledgerPath = resolve(args.get('--ledger') ?? LEDGER);
    // A missing file is an error, never an empty ledger.
    if (!existsSync(ledgerPath))
      throw new Error(`The ledger file does not exist: ${ledgerPath}`);
    const bindingsPath = resolve(args.get('--bindings') ?? BINDINGS);
    const summary = summariseLedger(
      readLedgerCalls(ledgerPath),
      {
        since: args.get('--since'),
        caseNamePrefix: args.get('--case-name-prefix'),
      },
      existsSync(bindingsPath)
        ? JSON.parse(readFileSync(bindingsPath, 'utf8'))
        : {},
    );
    const markdown = `${ledgerMarkdown(summary, ledgerPath)}\n${paidLockStatus(ledgerPath)}\n`;
    const out = args.get('--out');
    if (out) {
      const dir = probeOutputDir(out, []);
      refuseExisting(dir, ['ledger-summary.json', 'ledger-summary.md']);
      writeProbeFile(
        dir,
        'ledger-summary.json',
        JSON.stringify(summary, null, 2) + '\n',
      );
      writeProbeFile(dir, 'ledger-summary.md', markdown);
    }
    return { markdown, summary };
  }
  if (command !== 'list' && command !== 'run')
    throw new Error('Usage: narrative:paid-probe list|run|ledger ...');
  const args = probeArgs(rest, [
    '--run',
    '--state',
    '--out',
    '--paid',
    '--approval-id',
    '--max-spend-usd',
    '--cases',
    '--smoke',
    '--synthetic',
  ]);
  const runs = (args.get('--run') ?? '').split(',').filter(Boolean);
  if (!runs.length) throw new Error('Name the stored run(s) with --run.');
  const { stored, cases } = await casesFor(
    runs,
    args.get('--state'),
    positiveInteger(args.get('--cases'), 2),
    yes(args.get('--synthetic'), false),
  );
  if (command === 'list')
    return {
      markdown: [
        `Stored facts-only cases found: ${stored}.`,
        ...cases.map(
          (c) =>
            `- ${c.id} (${c.source}): ${c.reasons.join(' | ').slice(0, 300)}`,
        ),
      ].join('\n'),
      cases,
    };
  const approvalId = args.get('--approval-id');
  const out = args.get('--out');
  // Whether a synthetic case may stand in for a missing stored one is always an
  // explicit choice of the person who starts the paid run.
  if (!['yes', 'no'].includes(args.get('--synthetic') ?? ''))
    throw new Error(
      'A paid probe needs --synthetic yes|no, stated explicitly.',
    );
  if (args.get('--paid') !== 'yes' || !approvalId || !out)
    throw new Error(
      'A paid probe needs --paid yes, --approval-id and --out (outside the stored runs).',
    );
  if (approvalId.length > 160) throw new Error('--approval-id is too long.');
  const maxSpend = args.has('--max-spend-usd')
    ? Number(args.get('--max-spend-usd'))
    : PROBE_DEFAULT_MAX_SPEND_USD;
  const { apiKey, project } = paidProbeEnvironment(env);
  const dir = probeOutputDir(out, runs);
  refuseExisting(dir, ['paid-probe.json', 'paid-probe.md']);
  const write = (result: PaidProbeResult) => {
    writeProbeFile(
      dir,
      'paid-probe.json',
      JSON.stringify(result, null, 2) + '\n',
    );
    writeProbeFile(dir, 'paid-probe.md', paidProbeMarkdown(result));
  };
  const result = await runPaidProbe({
    ledgerPath: resolve(LEDGER),
    maxSpendUsd: maxSpend,
    approvalId,
    cases,
    smoke: yes(args.get('--smoke'), true),
    apiKey,
    project,
    onProgress: write,
    ...test,
  });
  write(result);
  return {
    markdown: paidProbeMarkdown(result),
    out: join(dir, 'paid-probe.md'),
    result,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runNarrativePaidProbe(process.argv.slice(2))
    .then((done) => {
      console.log(done.markdown);
      if ('result' in done && done.result?.stoppedBy) process.exitCode = 3;
    })
    .catch((error: Error) => {
      console.error(`[narrative-paid-probe] ${error.message}`);
      process.exitCode = 1;
    });
}
