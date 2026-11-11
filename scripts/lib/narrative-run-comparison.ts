// Side-by-side generation facts of two or more stored evaluation runs (for
// example the v8 baseline and the v9 run of the same fixture): calls, repair,
// time, the raw request bytes per stage with the growth over the series, and,
// where the run carries them, the living-world character fields. Reads the
// stored report.json and transport-records.json only; no provider, no ledger.
// The text-level comparison (repeated function, embodiment per chapter,
// dropped threads) stays in the character audit, which reads the same reports.
import {
  type TurnDiagnostics,
  turnSummary,
} from './narrative-turn-diagnostics';

// The production guard adds this to the serialized request; the limit is the
// default AI_FICTION_MAX_REQUEST_BYTES.
export const COMPARISON_GUARD_BUFFER = 4096;
export const COMPARISON_GUARD_LIMIT = 100000;

type Sample = {
  fixtureId: string;
  mode?: string;
  kind: string;
  periodIndex: number;
  requestCount?: number;
  repairUsed?: boolean;
  elapsedMs?: number;
  errorCode?: string | null;
  character?: {
    projectionBytes?: number;
    deltaBytes?: number;
    omittedActors?: number;
    characterRepair?: boolean;
    repairMessage?: string | null;
    continuity?: { required: string[]; missing: string[] } | null;
    turn?: TurnDiagnostics | null;
  } | null;
};
type Failure = {
  caseId: string;
  code: string;
  stage?: string | null;
  diagnostic?: { message?: string } | null;
};
type Transport = { caseId: string; task: string; requestBytes?: number };
export type ComparisonRun = {
  label: string;
  report: { samples?: Sample[]; failures?: Failure[] };
  transports: Transport[];
};

const TASKS = [
  'life_narrative_plan',
  'life_narrative_chapter',
  'life_narrative_plan_review',
  'life_fidelity',
  'life_narrative_editor',
] as const;
const short: Record<(typeof TASKS)[number], string> = {
  life_narrative_plan: 'plan',
  life_narrative_chapter: 'author',
  life_narrative_plan_review: 'review',
  life_fidelity: 'fidelity',
  life_narrative_editor: 'editor',
};

const caseIdOf = (s: Sample) =>
  s.kind === 'fork'
    ? `fork:${s.fixtureId}:${s.mode ?? 'narrative-v1'}:2`
    : `${s.fixtureId}:${s.mode ?? 'narrative-v1'}:${s.periodIndex}`;

export function compareRuns(runs: ComparisonRun[]) {
  return runs.map((run) => {
    const rows = (run.report.samples ?? [])
      .filter((s) => s.kind === 'full' || s.kind === 'fork')
      .sort(
        (a, b) =>
          (a.kind === 'fork' ? 1 : 0) - (b.kind === 'fork' ? 1 : 0) ||
          a.periodIndex - b.periodIndex,
      )
      .map((s) => {
        const mine = run.transports.filter((t) => t.caseId === caseIdOf(s));
        const maxBytes: Record<string, number | null> = {};
        for (const task of TASKS) {
          const sizes = mine
            .filter((t) => t.task === task && t.requestBytes !== undefined)
            .map((t) => t.requestBytes!);
          maxBytes[short[task]] = sizes.length ? Math.max(...sizes) : null;
        }
        const all = Object.values(maxBytes).filter(
          (n): n is number => n !== null,
        );
        const over = mine.filter(
          (t) =>
            t.requestBytes !== undefined &&
            t.requestBytes + COMPARISON_GUARD_BUFFER > COMPARISON_GUARD_LIMIT,
        );
        return {
          chapter: s.kind === 'fork' ? 'fork' : `ch${s.periodIndex}`,
          requestCount: s.requestCount ?? null,
          repairUsed: s.repairUsed ?? null,
          elapsedSec:
            s.elapsedMs === undefined ? null : Math.round(s.elapsedMs / 1000),
          errorCode: s.errorCode ?? null,
          maxRequestBytes: maxBytes,
          largestRequest: all.length ? Math.max(...all) : null,
          requestsOverGuard: over.map(
            (t) => short[t.task as keyof typeof short] ?? t.task,
          ),
          projectionBytes: s.character?.projectionBytes ?? null,
          deltaBytes: s.character?.deltaBytes ?? null,
          omittedActors: s.character?.omittedActors ?? null,
          characterRepair: s.character?.characterRepair ?? null,
          turn: s.character?.turn ?? null,
          continuityMissing: s.character?.continuity
            ? `${s.character.continuity.missing.length}/${s.character.continuity.required.length}`
            : null,
        };
      });
    const main = rows.filter((r) => r.chapter !== 'fork');
    const growth = Object.fromEntries(
      (['plan', 'author'] as const).map((task) => {
        const first = main.find((r) => r.maxRequestBytes[task] !== null);
        const last = [...main]
          .reverse()
          .find((r) => r.maxRequestBytes[task] !== null);
        return [
          task,
          first && last
            ? {
                from: first.chapter,
                to: last.chapter,
                first: first.maxRequestBytes[task],
                last: last.maxRequestBytes[task],
              }
            : null,
        ];
      }),
    );
    return {
      label: run.label,
      rows,
      turns: turnSummary(rows.map((r) => r.turn)),
      growth,
      totalRequests: rows.reduce((n, r) => n + (r.requestCount ?? 0), 0),
      chaptersWithRepair: rows.filter((r) => r.repairUsed).length,
      chaptersAtCeiling: rows.filter((r) => r.requestCount === 9).length,
      failures: (run.report.failures ?? []).map((f) => ({
        caseId: f.caseId,
        code: f.code,
        stage: f.stage ?? null,
        message: f.diagnostic?.message ?? null,
      })),
    };
  });
}

const kb = (n: number | null | undefined) =>
  n == null ? '-' : (n / 1000).toFixed(1);

export function comparisonMarkdown(result: ReturnType<typeof compareRuns>) {
  const lines = ['# Run comparison (generation facts, no model call)', ''];
  // The short block first, so it survives being pasted into a message.
  lines.push('## Summary', '');
  for (const run of result) {
    const over = run.rows.flatMap((r) =>
      r.requestsOverGuard.map((task) => `${r.chapter}:${task}`),
    );
    const g = run.growth;
    lines.push(
      `- ${run.label}: ${run.rows.length} samples, ${run.totalRequests} calls, repair ${run.chaptersWithRepair}, ceiling(9) ${run.chaptersAtCeiling}; calls ${run.rows.map((r) => `${r.chapter}=${r.requestCount ?? '-'}`).join(' ')}; over guard [${over.join(', ')}]; plan ${g.plan ? `${kb(g.plan.first)}->${kb(g.plan.last)}` : '-'} KB, author ${g.author ? `${kb(g.author.first)}->${kb(g.author.last)}` : '-'} KB${run.failures.length ? `; failures ${run.failures.map((f) => `${f.caseId} ${f.code}`).join('; ')}` : ''}`,
    );
  }
  lines.push('');
  for (const run of result) {
    lines.push(
      `## ${run.label}`,
      '',
      `${run.totalRequests} requests in ${run.rows.length} samples; repair in ${run.chaptersWithRepair}; at the 9-call ceiling in ${run.chaptersAtCeiling}.`,
      '',
      '| sample | calls | repair | s | error | plan KB | author KB | review KB | fidelity KB | editor KB | over guard | proj B | delta B | omitted | char repair | continuity missing |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    );
    for (const r of run.rows)
      lines.push(
        `| ${r.chapter} | ${r.requestCount ?? '-'} | ${r.repairUsed ? 'yes' : 'no'} | ${r.elapsedSec ?? '-'} | ${r.errorCode ?? ''} | ${kb(r.maxRequestBytes.plan ?? null)} | ${kb(r.maxRequestBytes.author ?? null)} | ${kb(r.maxRequestBytes.review ?? null)} | ${kb(r.maxRequestBytes.fidelity ?? null)} | ${kb(r.maxRequestBytes.editor ?? null)} | ${r.requestsOverGuard.join(', ')} | ${r.projectionBytes ?? '-'} | ${r.deltaBytes ?? '-'} | ${r.omittedActors ?? '-'} | ${r.characterRepair === null ? '-' : r.characterRepair ? 'yes' : 'no'} | ${r.continuityMissing ?? '-'} |`,
      );
    const g = run.growth;
    lines.push(
      '',
      `Request growth over the series: plan ${g.plan ? `${kb(g.plan.first)} -> ${kb(g.plan.last)} KB (${g.plan.from}..${g.plan.to})` : '-'}, author ${g.author ? `${kb(g.author.first)} -> ${kb(g.author.last)} KB (${g.author.from}..${g.author.to})` : '-'}.`,
    );
    // Turn labels only for runs that carry them (living-world generation).
    if (run.turns.chapters) {
      const t = run.turns;
      lines.push(
        '',
        `Turn labels (diagnostic, never a gate): labelled ${t.labelled}, other ${t.other}, null ${t.null}, absent ${t.absent}; resting type chosen ${t.restingChosen}; queue ranks [${t.queueRanks.join(', ')}]; signature inconsistent ${t.inconsistent}.`,
        '',
        '| sample | turnType | queue rank | resting | signature |',
        '|---|---|---|---|---|',
      );
      for (const r of run.rows)
        if (r.turn)
          lines.push(
            `| ${r.chapter} | ${r.turn.label ?? r.turn.coverage} | ${r.turn.queueRank ?? '-'} | ${r.turn.restingChosen === null ? '-' : r.turn.restingChosen ? 'yes' : 'no'} | ${r.turn.signatureConsistency} |`,
          );
    }
    for (const f of run.failures)
      lines.push(
        `- Failure ${f.caseId}: ${f.code}${f.stage ? ` at ${f.stage}` : ''}${f.message ? ` (${f.message})` : ''}`,
      );
    lines.push('');
  }
  return lines.join('\n');
}
