// Reads the provider's cache accounting out of the stored receipts of an
// evaluation run (report.json, read only): per stage and per chapter, how many
// input tokens were billed as cache reads (`cachedInputTokens`) and as cache
// writes (`cacheWriteTokens`). It decides nothing and changes no request: it is
// the evidence for the owner's cost decision on an explicit cache breakpoint
// (a prompt_cache_options change is a product change and is NOT part of this
// tool). A local Codex/agy run reports no tokens, so only a paid run counts.
type Receipt = {
  task: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
};
type Sample = {
  kind?: string;
  fixtureId?: string;
  mode?: string;
  periodIndex?: number;
  receipts?: Receipt[];
};
export type CacheRun = {
  label: string;
  report: { mock?: boolean; samples?: Sample[] };
};

// gpt-6.1-sol USD per million tokens (packages/ai/src/experiment-budget.ts,
// the in-code accounting rates): base input, cache read, cache write.
// Estimate only; the provider invoice is the authority.
export const CACHE_RATES = { input: 2, read: 0.1, write: 2.5 } as const;

export type CacheRow = {
  key: string;
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  readShare: number | null;
  writeShare: number | null;
  // Estimated cost of these input tokens as billed, and what the same tokens
  // would cost with no cache accounting at all (all at the base rate).
  billedUsd: number;
  noCacheUsd: number;
};

const empty = (key: string): CacheRow => ({
  key,
  calls: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  readShare: null,
  writeShare: null,
  billedUsd: 0,
  noCacheUsd: 0,
});

function finish(row: CacheRow): CacheRow {
  const uncached = Math.max(
    0,
    row.inputTokens - row.cachedInputTokens - row.cacheWriteTokens,
  );
  return {
    ...row,
    readShare: row.inputTokens ? row.cachedInputTokens / row.inputTokens : null,
    writeShare: row.inputTokens ? row.cacheWriteTokens / row.inputTokens : null,
    billedUsd:
      (uncached * CACHE_RATES.input +
        row.cachedInputTokens * CACHE_RATES.read +
        row.cacheWriteTokens * CACHE_RATES.write) /
      1e6,
    noCacheUsd: (row.inputTokens * CACHE_RATES.input) / 1e6,
  };
}

const chapterKey = (s: Sample) =>
  s.kind === 'fork' ? 'fork' : `ch${s.periodIndex ?? '?'}`;

export function cacheReceipts(runs: CacheRun[]) {
  return runs.map((run) => {
    const byStage = new Map<string, CacheRow>(),
      byChapter = new Map<string, CacheRow>(),
      total = empty('total');
    const add = (row: CacheRow, r: Receipt) => {
      row.calls += 1;
      row.inputTokens += r.inputTokens ?? 0;
      row.cachedInputTokens += r.cachedInputTokens ?? 0;
      row.cacheWriteTokens += r.cacheWriteTokens ?? 0;
    };
    for (const sample of run.report.samples ?? [])
      for (const r of sample.receipts ?? []) {
        for (const [map, key] of [
          [byStage, r.task],
          [byChapter, chapterKey(sample)],
        ] as const) {
          const row = map.get(key) ?? empty(key);
          map.set(key, row);
          add(row, r);
        }
        add(total, r);
      }
    const t = finish(total);
    return {
      label: run.label,
      mock: Boolean(run.report.mock),
      stages: [...byStage.values()].map(finish),
      chapters: [...byChapter.values()].map(finish),
      total: t,
      // What the numbers say, in words, for the cost decision. Never a gate.
      reading:
        t.inputTokens === 0
          ? 'no input tokens recorded (a mock or a local-transport run): nothing to read'
          : (t.readShare ?? 0) < 0.02 && (t.writeShare ?? 0) > 0.5
            ? 'cache reads are ~0 and most input is billed as a cache write: the implicit mode adds the write surcharge without any read'
            : (t.readShare ?? 0) >= 0.2
              ? 'a substantial share of the input is read from the cache'
              : 'cache reads are small; see the stage and chapter rows',
    };
  });
}

const pct = (n: number | null) =>
  n === null ? '-' : `${(n * 100).toFixed(1)}%`;
const usd = (n: number) => n.toFixed(4);

export function cacheReceiptsMarkdown(runs: ReturnType<typeof cacheReceipts>) {
  const lines = [
    '# Cache accounting from the stored receipts (read only)',
    '',
    `_Estimate at ${CACHE_RATES.input}/${CACHE_RATES.read}/${CACHE_RATES.write} USD per million tokens (base/read/write); the provider invoice is the authority. A change to explicit cache breakpoints is an owner cost decision and is not part of this report._`,
    '',
  ];
  for (const run of runs) {
    lines.push(`## ${run.label}${run.mock ? ' (mock)' : ''}`, '');
    lines.push(`Reading: ${run.reading}.`, '');
    for (const [title, rows] of [
      ['by stage', run.stages],
      ['by chapter', run.chapters],
    ] as const) {
      lines.push(
        `| ${title} | calls | input tokens | cache read | read % | cache write | write % | billed USD | no-cache USD |`,
        '|---|---|---|---|---|---|---|---|---|',
      );
      for (const r of [...rows, run.total])
        lines.push(
          `| ${r.key.replace(/^life_(narrative_)?/, '')} | ${r.calls} | ${r.inputTokens} | ${r.cachedInputTokens} | ${pct(r.readShare)} | ${r.cacheWriteTokens} | ${pct(r.writeShare)} | ${usd(r.billedUsd)} | ${usd(r.noCacheUsd)} |`,
        );
      lines.push('');
    }
  }
  return lines.join('\n');
}
