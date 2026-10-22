import { OpenAiProvider } from '@future-flow/ai';
import type OpenAI from 'openai';
import type {
  FictionAuthorResult,
  NarrativePeriodInput,
  NarrativePlanningResult,
} from '@future-flow/contracts';
import type { FictionRepair } from '@future-flow/core';
import {
  storedChapters,
  type StoredAttempt,
} from './narrative-request-breakdown';
import { requestParts, type RequestParts } from './narrative-request-parts';

// Rebuilds EVERY request of a stored creative run (planner, author, review,
// fidelity, editor, and the repair rounds) offline with the provider code of
// the checkout this runs in, from the stored job payload and the stored
// packages of the attempt trace, and splits their bytes. The model output is
// never asked for: the same stored packages go through the request builders of
// whichever code version runs this, so two versions can be compared on
// identical content (`compareReplays`): the difference is what the code adds,
// not what the model happened to write. No provider call, no ledger.
type Json = Record<string, unknown>;

export type ReplayRow = {
  chapter: string;
  caseId: string;
  ordinal: number;
  task: string;
  kind: 'first' | 'repair';
  parts: RequestParts;
};
export type RunReplay = { label: string; rows: ReplayRow[] };

export async function captureRequest(
  call: (ai: OpenAiProvider) => Promise<unknown>,
  stub: unknown,
): Promise<unknown> {
  let captured: unknown;
  const parse = async (request: Json) => {
    captured = request;
    return {
      status: 'completed',
      model: request.model,
      output_parsed: stub,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
  };
  const ai = new OpenAiProvider(
    {
      apiKey: 'offline-replay-only',
      eventModel: 'gpt-6.1-sol',
      storyModel: 'gpt-6.1-sol',
      checkModel: 'gpt-6.1-sol',
      timeoutMs: 1000,
      maxOutputTokens: 12000,
    },
    { responses: { parse } } as unknown as OpenAI,
  );
  try {
    await call(ai);
  } catch {
    // The request is captured before the stub is parsed; a stub that does not
    // fit the response schema (a malformed stored attempt) changes nothing here.
  }
  return captured;
}

const STAGES = [
  'life_narrative_plan',
  'life_narrative_chapter',
  'life_narrative_plan_review',
  'life_fidelity',
  'life_narrative_editor',
] as const;

async function replayAttempt(
  payload: NarrativePeriodInput,
  attempt: StoredAttempt,
  plan: NarrativePlanningResult | undefined,
  authored: FictionAuthorResult | undefined,
  previousAuthor: FictionAuthorResult | undefined,
) {
  const stub = attempt.output;
  switch (attempt.task) {
    case 'life_narrative_plan':
      return captureRequest(
        (ai) => ai.planFiction(payload, attempt.repairFeedback?.message),
        stub,
      );
    case 'life_narrative_chapter': {
      if (!plan) return undefined;
      const repair =
        attempt.repairFeedback && previousAuthor
          ? ({
              mode:
                attempt.repairFeedback.mode === 'prose_only'
                  ? 'prose_only'
                  : 'author_package',
              message: attempt.repairFeedback.message,
              previous: previousAuthor,
            } satisfies FictionRepair)
          : undefined;
      return captureRequest(
        (ai) => ai.authorFiction(payload, plan, repair),
        stub,
      );
    }
    case 'life_narrative_plan_review':
      return authored
        ? captureRequest(
            (ai) => ai.reviewFiction(payload, authored, plan),
            stub,
          )
        : undefined;
    case 'life_fidelity':
      return authored
        ? captureRequest((ai) => ai.checkFiction(payload, authored), stub)
        : undefined;
    case 'life_narrative_editor':
      return authored
        ? captureRequest((ai) => ai.editFiction(payload, authored), stub)
        : undefined;
    default:
      return undefined;
  }
}

export async function replayRun(
  outDir: string,
  stateName: string,
): Promise<RunReplay> {
  const stored = await storedChapters(outDir, stateName);
  const rows: ReplayRow[] = [];
  for (const { chapter, caseId, payload, attempts } of stored.chapters) {
    let plan: NarrativePlanningResult | undefined;
    let authored: FictionAuthorResult | undefined;
    for (const attempt of attempts) {
      if (!(STAGES as readonly string[]).includes(attempt.task)) continue;
      const request = await replayAttempt(
        payload,
        attempt,
        plan,
        authored,
        authored,
      );
      if (request)
        rows.push({
          chapter,
          caseId,
          ordinal: attempt.ordinal,
          task: attempt.task,
          kind: attempt.repairFeedback ? 'repair' : 'first',
          parts: requestParts(request),
        });
      if (attempt.output && attempt.status === 'completed') {
        if (attempt.task === 'life_narrative_plan')
          plan = attempt.output as NarrativePlanningResult;
        if (attempt.task === 'life_narrative_chapter')
          authored = attempt.output as FictionAuthorResult;
      }
    }
  }
  return { label: stored.label, rows };
}

export type ReplayDelta = {
  chapter: string;
  task: string;
  kind: ReplayRow['kind'];
  before: number;
  after: number;
  delta: number;
  // Per part, after - before (system, schema, user, envelope, user keys and
  // narrativeContext keys; a key that exists on one side only counts as 0 on
  // the other).
  parts: Record<string, number>;
};

const flat = (p: RequestParts): Record<string, number> => ({
  system: p.system,
  schema: p.schema,
  user: p.user,
  envelope: p.envelope,
  ...Object.fromEntries(
    Object.entries(p.userKeys).map(([k, v]) => [`user.${k}`, v]),
  ),
  ...Object.fromEntries(
    Object.entries(p.narrativeContext).map(([k, v]) => [`ctx.${k}`, v]),
  ),
});

// The same stored run replayed by two code versions, row by row (chapter,
// stage, ordinal): after - before, by stage and by part. Rows only one side
// has (a stage one version does not build) are listed with the other side 0.
export function compareReplays(
  before: RunReplay,
  after: RunReplay,
): ReplayDelta[] {
  const key = (r: ReplayRow) => `${r.caseId}|${r.ordinal}|${r.task}`;
  const left = new Map(before.rows.map((r) => [key(r), r]));
  const right = new Map(after.rows.map((r) => [key(r), r]));
  const out: ReplayDelta[] = [];
  for (const k of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(k),
      b = right.get(k),
      row = (b ?? a)!;
    const fa = a ? flat(a.parts) : {},
      fb = b ? flat(b.parts) : {};
    const parts: Record<string, number> = {};
    for (const part of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
      const d = (fb[part] ?? 0) - (fa[part] ?? 0);
      if (d !== 0) parts[part] = d;
    }
    out.push({
      chapter: row.chapter,
      task: row.task,
      kind: row.kind,
      before: a?.parts.total ?? 0,
      after: b?.parts.total ?? 0,
      delta: (b?.parts.total ?? 0) - (a?.parts.total ?? 0),
      parts,
    });
  }
  return out;
}

const kb = (n: number) => (n / 1000).toFixed(1);
const signed = (n: number) => `${n >= 0 ? '+' : ''}${(n / 1000).toFixed(2)}`;

export function replayMarkdown(runs: RunReplay[]) {
  const lines = [
    '# Request replay (bytes, offline, every stage)',
    '',
    '_Rebuilt by the provider code of this checkout from the stored packages; `envelope` is the JSON wrapper and string escaping, so the parts add up to the total._',
    '',
  ];
  for (const run of runs) {
    lines.push(
      `## ${run.label}`,
      '',
      '| chapter | stage | kind | total KB | system | schema | user | envelope |',
      '|---|---|---|---|---|---|---|---|',
    );
    for (const r of run.rows)
      lines.push(
        `| ${r.chapter} | ${r.task.replace(/^life_(narrative_)?/, '')} | ${r.kind} | ${kb(r.parts.total)} | ${kb(r.parts.system)} | ${kb(r.parts.schema)} | ${kb(r.parts.user)} | ${kb(r.parts.envelope)} |`,
      );
    lines.push('');
  }
  return lines.join('\n');
}

export function compareMarkdown(
  deltas: ReplayDelta[],
  labels: [string, string],
) {
  const lines = [
    `# Request replay comparison: ${labels[0]} -> ${labels[1]} (KB, after - before, the same stored packages)`,
    '',
    '| chapter | stage | kind | before | after | delta | largest part deltas (KB) |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const d of deltas) {
    const top = Object.entries(d.parts)
      .sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))
      .slice(0, 4)
      .map(([k, v]) => `${k} ${signed(v)}`)
      .join(', ');
    lines.push(
      `| ${d.chapter} | ${d.task.replace(/^life_(narrative_)?/, '')} | ${d.kind} | ${kb(d.before)} | ${kb(d.after)} | ${signed(d.delta)} | ${top || '-'} |`,
    );
  }
  const total = deltas.reduce((n, d) => n + d.delta, 0);
  lines.push('', `Total over all rows: ${signed(total)} KB.`, '');
  const byStage = new Map<string, number[]>();
  for (const d of deltas)
    byStage.set(d.task, [...(byStage.get(d.task) ?? []), d.delta]);
  lines.push(
    '| stage | rows | mean delta KB | min | max |',
    '|---|---|---|---|---|',
  );
  for (const [task, list] of byStage)
    lines.push(
      `| ${task.replace(/^life_(narrative_)?/, '')} | ${list.length} | ${signed(list.reduce((a, b) => a + b, 0) / list.length)} | ${signed(Math.min(...list))} | ${signed(Math.max(...list))} |`,
    );
  lines.push('');
  return lines.join('\n');
}
