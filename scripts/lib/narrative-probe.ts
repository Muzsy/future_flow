import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { OpenAiProvider } from '@future-flow/ai';
import {
  fictionAuthorSchemaFor,
  type FictionAuthorResult,
  type NarrativePeriodInput,
  type NarrativePlanningResult,
} from '@future-flow/contracts';
import { fictionScope } from '@future-flow/core';
import type { OfflineMockResponder } from './narrative-evaluation-runner';
import type {
  LocalQuotaGuard,
  QuotaLogEntry,
} from './narrative-evaluation-quota';
import { QuotaHalt } from './narrative-evaluation-quota';
import type {
  StoredAttempt,
  StoredChapter,
} from './narrative-request-breakdown';

// Two development probes for the local Codex transport. They are not product
// code and not part of any evaluation gate: each one replays a request that a
// stored run really made (rebuilt with the CURRENT provider code from the saved
// job payload and attempt trace, so the stored run is only read) and records
// what the call did. Numbers from Codex are directional (see
// narrative-evaluation-codex.ts); the point is the comparison inside one run.
//
//   latency probe: the same author request under different arms (the compact
//   v9 schema, the same request with the full-pattern schema, a v8 control),
//   interleaved so the time of day does not favour an arm.
//   editor probe: the same final chapter judged by several independent editor
//   calls, to tell a real weakness from score noise.
// The request exactly as the provider hands it to the Responses API.
export type ProviderParameters = {
  model: string;
  input: { role: string; content: string }[];
  max_output_tokens?: number;
  text: { format: { name: string; schema?: unknown } };
};

export const PROBE_TIMEOUT_MS = 300_000;
const bytes = (value: unknown) =>
  Buffer.byteLength(
    typeof value === 'string' ? value : JSON.stringify(value ?? null),
    'utf8',
  );

// The request the provider would send, captured through a recording client.
export async function captureProviderRequest(
  call: (ai: OpenAiProvider) => Promise<unknown>,
  output: unknown,
): Promise<ProviderParameters> {
  let captured: ProviderParameters | undefined;
  const parse = async (request: ProviderParameters) => {
    captured = request;
    return {
      status: 'completed',
      model: request.model,
      output_parsed: output,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
  };
  const ai = new OpenAiProvider(
    {
      apiKey: 'offline-probe-only',
      eventModel: 'gpt-6.1-sol',
      storyModel: 'gpt-6.1-sol',
      checkModel: 'gpt-6.1-sol',
      timeoutMs: 1000,
      maxOutputTokens: 12000,
    },
    { responses: { parse } } as unknown as OpenAI,
  );
  // The recording client answers with the stored output; a call that checks the
  // answer against its schema may refuse a placeholder, and the request has
  // been captured by then.
  await call(ai).catch((error: unknown) => {
    if (!captured) throw error;
  });
  if (!captured) throw new Error('The provider sent no request.');
  return captured;
}

// The stored author attempt that has an output, and the plan it was written
// from: the last completed plan before it.
export function authorAttemptOf(
  chapter: StoredChapter,
  which: 'first' | 'last' | number = 'first',
) {
  const authors = chapter.attempts.filter(
    (a) => a.task === 'life_narrative_chapter' && a.output,
  );
  const author =
    typeof which === 'number'
      ? authors.find((a) => a.ordinal === which)
      : which === 'first'
        ? authors.find((a) => !a.repairFeedback)
        : authors.at(-1);
  if (!author)
    throw new Error(`${chapter.caseId}: no matching author attempt.`);
  const plan = chapter.attempts
    .filter(
      (a) =>
        a.task === 'life_narrative_plan' &&
        a.status === 'completed' &&
        a.output &&
        a.ordinal < author.ordinal,
    )
    .at(-1);
  if (!plan) throw new Error(`${chapter.caseId}: the plan is not stored.`);
  return { author, plan };
}

export async function firstAuthorRequest(chapter: StoredChapter) {
  const { author, plan } = authorAttemptOf(chapter, 'first');
  return captureProviderRequest(
    (ai) =>
      ai.authorFiction(chapter.payload, plan.output as NarrativePlanningResult),
    author.output,
  );
}

// The same request with the schema the v9 compaction removed the uuid patterns
// from, put back: what the request looked like before 549f7f3. Nothing else
// differs, so a latency difference is the schema alone.
export function withFullPatternSchema(
  parameters: ProviderParameters,
  input: NarrativePeriodInput,
): ProviderParameters {
  const policy = fictionScope(input).context.policy;
  const full = zodTextFormat(
    fictionAuthorSchemaFor(policy),
    'life_narrative_chapter',
  );
  return {
    ...parameters,
    text: { format: { ...parameters.text.format, schema: full.schema } },
  };
}

export async function editorRequest(
  chapter: StoredChapter,
  which: 'first' | 'last' | number = 'last',
) {
  const { author } = authorAttemptOf(chapter, which);
  return {
    authored: author.output as FictionAuthorResult,
    ordinal: author.ordinal,
    parameters: await captureProviderRequest(
      (ai) =>
        ai.editFiction(chapter.payload, author.output as FictionAuthorResult),
      { stored: true },
    ),
  };
}

export type ProbeArm = {
  id: string;
  description: string;
  parameters: ProviderParameters;
  // Server-side validation of the answer (the product parses it the same way).
  validate?: (output: unknown) => boolean;
};
export type ProbeCall = {
  arm: string;
  round: number;
  position: number;
  startedAt: string;
  latencyMs: number | null;
  requestBytes: number;
  schemaBytes: number;
  outputBytes: number | null;
  status: 'ok' | 'incomplete' | 'error';
  schemaValid: boolean | null;
  error: string | null;
};

// Rounds of the arms in the given order, so every arm is sampled in every
// stretch of time (A B C A B C ...).
export function probeSchedule(arms: string[], rounds: number) {
  return Array.from({ length: rounds }, (_, round) =>
    arms.map((arm, index) => ({ arm, round: round + 1, position: index + 1 })),
  ).flat();
}

type Dependencies = {
  responder: OfflineMockResponder;
  guard?: LocalQuotaGuard | null;
  now?: () => number;
  timeoutMs?: number;
};

// One physical call. A transport failure is recorded and does not stop the
// probe; a spent quota does (the partial result is kept).
export async function probeCall(
  arm: ProbeArm,
  slot: { round: number; position: number },
  deps: Dependencies,
  caseId: string,
): Promise<{ call: ProbeCall; output: unknown; halt: QuotaHalt | null }> {
  const now = deps.now ?? Date.now;
  const startedAt = new Date(now()).toISOString();
  const base = {
    arm: arm.id,
    round: slot.round,
    position: slot.position,
    startedAt,
    requestBytes: bytes(arm.parameters),
    schemaBytes: bytes(arm.parameters.text),
  };
  try {
    await deps.guard?.beforeCall(caseId);
  } catch (error) {
    if (error instanceof QuotaHalt)
      return {
        call: {
          ...base,
          latencyMs: null,
          outputBytes: null,
          status: 'error',
          schemaValid: null,
          error: error.message,
        },
        output: null,
        halt: error,
      };
    throw error;
  }
  const started = now();
  try {
    const result = (await deps.responder({
      caseId,
      task: arm.parameters.text.format.name,
      model: arm.parameters.model,
      ordinal: slot.position,
      parameters: arm.parameters as never,
      timeoutMs: deps.timeoutMs ?? PROBE_TIMEOUT_MS,
      job: undefined as never,
      defaultOutput: () => null,
    })) as { __rawResponse?: { status?: string } } | null;
    const latencyMs = now() - started;
    if (result && typeof result === 'object' && '__rawResponse' in result)
      return {
        call: {
          ...base,
          latencyMs,
          outputBytes: null,
          status: 'incomplete',
          schemaValid: null,
          error: 'The answer passed the output limit.',
        },
        output: null,
        halt: null,
      };
    let schemaValid: boolean | null = null;
    if (arm.validate) {
      try {
        schemaValid = arm.validate(result);
      } catch {
        schemaValid = false;
      }
    }
    return {
      call: {
        ...base,
        latencyMs,
        outputBytes: bytes(result),
        status: 'ok',
        schemaValid,
        error: null,
      },
      output: result,
      halt: null,
    };
  } catch (error) {
    const halt = await deps.guard?.afterFailure(caseId).catch(() => null);
    return {
      call: {
        ...base,
        latencyMs: now() - started,
        outputBytes: null,
        status: 'error',
        schemaValid: null,
        error: (halt ?? (error as Error)).message,
      },
      output: null,
      halt: halt ?? null,
    };
  }
}

const mean = (v: number[]) =>
  v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
};

export function latencySummary(arms: ProbeArm[], calls: ProbeCall[]) {
  return arms.map((arm) => {
    const mine = calls.filter((c) => c.arm === arm.id);
    const ok = mine.filter((c) => c.status === 'ok' && c.latencyMs !== null);
    const latency = ok.map((c) => c.latencyMs!);
    const out = ok.map((c) => c.outputBytes!);
    return {
      arm: arm.id,
      description: arm.description,
      requestBytes: mine[0]?.requestBytes ?? null,
      schemaBytes: mine[0]?.schemaBytes ?? null,
      calls: mine.length,
      ok: ok.length,
      failed: mine.length - ok.length,
      latencyMs: {
        mean: mean(latency),
        median: median(latency),
        min: latency.length ? Math.min(...latency) : null,
        max: latency.length ? Math.max(...latency) : null,
      },
      over150s: ok.filter((c) => c.latencyMs! > 150_000).length,
      over180s: ok.filter((c) => c.latencyMs! > 180_000).length,
      meanOutputBytes: mean(out),
      secondsPerOutputKb:
        mean(latency) !== null && mean(out)
          ? Math.round((mean(latency)! / mean(out)!) * 10) / 10
          : null,
      schemaInvalid: ok.filter((c) => c.schemaValid === false).length,
    };
  });
}

export type LatencyProbeResult = {
  probe: 'author-latency';
  note: string;
  rounds: number;
  timeoutMs: number;
  arms: ProbeArm['id'][];
  calls: ProbeCall[];
  summary: ReturnType<typeof latencySummary>;
  quota: QuotaLogEntry[];
  halted: string | null;
};

export async function runLatencyProbe(
  arms: ProbeArm[],
  rounds: number,
  deps: Dependencies,
  onProgress?: (partial: LatencyProbeResult) => void,
): Promise<LatencyProbeResult> {
  const byId = new Map(arms.map((a) => [a.id, a]));
  const calls: ProbeCall[] = [];
  let halted: string | null = null;
  const build = (): LatencyProbeResult => ({
    probe: 'author-latency',
    note: 'Local Codex transport, directional only. Arms are interleaved round by round; compare arms inside this run, not against a paid API run.',
    rounds,
    timeoutMs: deps.timeoutMs ?? PROBE_TIMEOUT_MS,
    arms: arms.map((a) => a.id),
    calls,
    summary: latencySummary(arms, calls),
    quota: deps.guard?.log ?? [],
    halted,
  });
  for (const slot of probeSchedule(
    arms.map((a) => a.id),
    rounds,
  )) {
    const arm = byId.get(slot.arm)!;
    const { call, halt } = await probeCall(
      arm,
      slot,
      deps,
      `probe-latency:${calls.length + 1}`,
    );
    calls.push(call);
    if (halt) {
      halted = halt.message;
      onProgress?.(build());
      break;
    }
    onProgress?.(build());
  }
  await deps.guard?.finish();
  return build();
}

export type EditorRun = {
  run: number;
  startedAt: string;
  latencyMs: number | null;
  requestBytes: number;
  outputBytes: number | null;
  status: ProbeCall['status'];
  error: string | null;
  verdict: string | null;
  scores: Record<string, number> | null;
  below4: string[];
  sequenceReview: Record<string, unknown> | null;
  issues: {
    dimension: string;
    severity: string;
    repairScope: string;
    suggestedFix: string;
  }[];
  // The product's own gate on this report; null when the report did not
  // validate.
  gatePassed: boolean | null;
};
type EditorReport = {
  verdict?: string;
  scores?: Record<string, number>;
  sequenceReview?: Record<string, unknown>;
  issues?: {
    dimension: string;
    severity: string;
    repairScope: string;
    suggestedFix?: string;
  }[];
};
const clip = (text: string, limit: number) =>
  text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;

export function editorSummary(runs: EditorRun[]) {
  const ok = runs.filter((r) => r.scores);
  const dimensions = [
    ...new Set(ok.flatMap((r) => Object.keys(r.scores!))),
  ].sort();
  return {
    runs: runs.length,
    reported: ok.length,
    gatePassed: runs.filter((r) => r.gatePassed === true).length,
    gateFailed: runs.filter((r) => r.gatePassed === false).length,
    verdicts: Object.fromEntries(
      [...new Set(ok.map((r) => r.verdict ?? 'none'))].map((v) => [
        v,
        ok.filter((r) => (r.verdict ?? 'none') === v).length,
      ]),
    ),
    // How many of the runs scored the dimension below the gate's 4.
    below4ByDimension: Object.fromEntries(
      dimensions
        .map((d) => [d, ok.filter((r) => r.scores![d]! < 4).length] as const)
        .filter(([, n]) => n > 0),
    ),
    scoresByDimension: Object.fromEntries(
      dimensions.map((d) => {
        const v = ok.map((r) => r.scores![d]!);
        return [
          d,
          { min: Math.min(...v), max: Math.max(...v), values: v },
        ] as const;
      }),
    ),
    issueDimensions: Object.fromEntries(
      [...new Set(ok.flatMap((r) => r.issues.map((i) => i.dimension)))].map(
        (d) => [
          d,
          ok.filter((r) => r.issues.some((i) => i.dimension === d)).length,
        ],
      ),
    ),
  };
}

export type EditorProbeResult = {
  probe: 'editor-stability';
  note: string;
  caseId: string;
  authorOrdinal: number;
  stored: {
    ordinal: number;
    verdict: string | null;
    scores: Record<string, number> | null;
    issues: string[];
  }[];
  runs: EditorRun[];
  summary: ReturnType<typeof editorSummary>;
  quota: QuotaLogEntry[];
  halted: string | null;
};

// The editor verdicts that the stored run recorded for the chapter, so the
// fresh runs can be read against them.
export function storedEditorReports(attempts: StoredAttempt[]) {
  return attempts
    .filter((a) => a.task === 'life_narrative_editor' && a.output)
    .map((a) => {
      const report = a.output as EditorReport;
      return {
        ordinal: a.ordinal,
        verdict: report.verdict ?? null,
        scores: report.scores ?? null,
        issues: (report.issues ?? []).map(
          (i) => `${i.dimension}/${i.severity}/${i.repairScope}`,
        ),
      };
    });
}

export async function runEditorProbe(
  input: {
    caseId: string;
    authorOrdinal: number;
    parameters: ProviderParameters;
    stored: EditorProbeResult['stored'];
    // Parses and validates the report and applies the product's editorial gate;
    // throws when the report is invalid.
    gate: (report: unknown) => boolean;
  },
  runs: number,
  deps: Dependencies,
  onProgress?: (partial: EditorProbeResult) => void,
): Promise<EditorProbeResult> {
  const results: EditorRun[] = [];
  let halted: string | null = null;
  const arm: ProbeArm = {
    id: 'editor',
    description: 'final chapter, editor request',
    parameters: input.parameters,
  };
  const build = (): EditorProbeResult => ({
    probe: 'editor-stability',
    note: 'Local Codex transport, directional only. Each run is an independent editor call on the same stored final chapter and the same request bytes.',
    caseId: input.caseId,
    authorOrdinal: input.authorOrdinal,
    stored: input.stored,
    runs: results,
    summary: editorSummary(results),
    quota: deps.guard?.log ?? [],
    halted,
  });
  for (let run = 1; run <= runs; run++) {
    const { call, output, halt } = await probeCall(
      arm,
      { round: run, position: 1 },
      deps,
      `probe-editor:${run}`,
    );
    const report = (output ?? {}) as EditorReport;
    let gatePassed: boolean | null = null;
    if (call.status === 'ok') {
      try {
        gatePassed = input.gate(output);
      } catch {
        gatePassed = null;
      }
    }
    const scores = report.scores ?? null;
    results.push({
      run,
      startedAt: call.startedAt,
      latencyMs: call.latencyMs,
      requestBytes: call.requestBytes,
      outputBytes: call.outputBytes,
      status: call.status,
      error: call.error,
      verdict: report.verdict ?? null,
      scores,
      below4: scores
        ? Object.entries(scores)
            .filter(([, v]) => v < 4)
            .map(([k]) => k)
        : [],
      sequenceReview: report.sequenceReview ?? null,
      issues: (report.issues ?? []).map((i) => ({
        dimension: i.dimension,
        severity: i.severity,
        repairScope: i.repairScope,
        suggestedFix: clip(i.suggestedFix ?? '', 400),
      })),
      gatePassed,
    });
    if (halt) {
      halted = halt.message;
      onProgress?.(build());
      break;
    }
    onProgress?.(build());
  }
  await deps.guard?.finish();
  return build();
}

const sec = (ms: number | null) => (ms === null ? '-' : (ms / 1000).toFixed(0));
const kb = (n: number | null) => (n === null ? '-' : (n / 1000).toFixed(1));
const budapest = (iso: string) =>
  new Date(iso).toLocaleTimeString('hu-HU', {
    timeZone: 'Europe/Budapest',
    hour: '2-digit',
    minute: '2-digit',
  });

export function latencyProbeMarkdown(result: LatencyProbeResult) {
  const lines = [
    '# Author latency probe (local Codex, directional)',
    '',
    `_${result.note}_`,
    '',
    `Rounds: ${result.rounds}; per-call deadline ${sec(result.timeoutMs)} s (not the product's 180 s, so a slow call is measured, not cut). Times are Hungarian local time.`,
    ...(result.halted ? ['', `**Stopped early:** ${result.halted}`] : []),
    '',
    '| arm | request KB | schema KB | calls ok/failed | mean s | median s | min s | max s | >150 s | >180 s | mean output KB | s per output KB | schema invalid |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...result.summary.map(
      (s) =>
        `| ${s.arm} | ${kb(s.requestBytes)} | ${kb(s.schemaBytes)} | ${s.ok}/${s.failed} | ${sec(s.latencyMs.mean)} | ${sec(s.latencyMs.median)} | ${sec(s.latencyMs.min)} | ${sec(s.latencyMs.max)} | ${s.over150s} | ${s.over180s} | ${kb(s.meanOutputBytes)} | ${s.secondsPerOutputKb ?? '-'} | ${s.schemaInvalid} |`,
    ),
    '',
    '### Every call, in the order made',
    '',
    ...result.calls.map(
      (c) =>
        `- ${budapest(c.startedAt)} round ${c.round} #${c.position} ${c.arm}: ${c.status}${c.latencyMs === null ? '' : `, ${sec(c.latencyMs)} s`}, request ${kb(c.requestBytes)} KB, output ${kb(c.outputBytes)} KB${c.schemaValid === false ? ', SCHEMA INVALID' : ''}${c.error ? `, ${c.error}` : ''}`,
    ),
    '',
  ];
  return lines.join('\n');
}

export function editorProbeMarkdown(result: EditorProbeResult) {
  const s = result.summary;
  const lines = [
    '# Editor stability probe (local Codex, directional)',
    '',
    `_${result.note}_`,
    '',
    `Case ${result.caseId}, author attempt ${result.authorOrdinal}. Times are Hungarian local time.`,
    ...(result.halted ? ['', `**Stopped early:** ${result.halted}`] : []),
    '',
    `Runs ${s.runs}, reported ${s.reported}; the product gate passed ${s.gatePassed}, failed ${s.gateFailed}. Verdicts: ${JSON.stringify(s.verdicts)}.`,
    `Dimensions scored below 4 (runs): ${JSON.stringify(s.below4ByDimension)}.`,
    `Dimensions with an issue (runs): ${JSON.stringify(s.issueDimensions)}.`,
    '',
    '### Stored editor verdicts of the chapter',
    '',
    ...(result.stored.length
      ? result.stored.map(
          (e) =>
            `- attempt ${e.ordinal}: ${e.verdict}; ${JSON.stringify(e.scores)}; ${e.issues.join(' | ') || 'no issues'}`,
        )
      : ['- none']),
    '',
    '### Fresh runs',
    '',
    ...result.runs.map(
      (r) =>
        `- ${budapest(r.startedAt)} run ${r.run}: ${r.status}${r.latencyMs === null ? '' : `, ${sec(r.latencyMs)} s`}, output ${kb(r.outputBytes)} KB, verdict ${r.verdict}, gate ${r.gatePassed === null ? 'n/a' : r.gatePassed ? 'pass' : 'fail'}, below 4: ${r.below4.join(', ') || 'none'}; scores ${JSON.stringify(r.scores)}; issues ${r.issues.map((i) => `${i.dimension}/${i.severity}/${i.repairScope}: ${i.suggestedFix}`).join(' | ') || 'none'}${r.error ? `; ${r.error}` : ''}`,
    ),
    '',
  ];
  return lines.join('\n');
}

// Output goes under --out only; the stored run is read, never written to, and
// an output directory inside it is refused.
export function probeOutputDir(out: string, runDirs: string[]) {
  const target = resolve(out);
  for (const run of runDirs) {
    const rel = relative(resolve(run), target);
    if (!rel.startsWith('..') && !isAbsolute(rel))
      throw new Error(
        'The probe output directory must be outside the stored run.',
      );
  }
  mkdirSync(target, { recursive: true });
  return target;
}

export function writeProbeFile(dir: string, name: string, content: string) {
  writeFileSync(join(dir, name), content);
}
export function refuseExisting(dir: string, names: string[]) {
  for (const name of names)
    if (existsSync(join(dir, name)))
      throw new Error(`${name} already exists in the output directory.`);
}

// `--name value` pairs only; anything else is refused.
export function probeArgs(argv: string[], allowed: string[]) {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key || !allowed.includes(key) || value === undefined)
      throw new Error(`Unknown or incomplete option: ${key ?? ''}`);
    values.set(key, value);
  }
  return values;
}

export function positiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0)
    throw new Error(`Expected a positive integer, got ${value}.`);
  return n;
}

// The state folder of a stored run: named, or the only one that is not a
// fixed-canon state.
export function resolveStateName(run: string, name?: string) {
  if (name) return name;
  const dir = join(resolve(run), 'state');
  const names = existsSync(dir)
    ? readdirSync(dir).filter(
        (n) => !n.startsWith('fixed-') && !n.endsWith('.json'),
      )
    : [];
  if (names.length !== 1)
    throw new Error(
      `Name the state folder with --state (found: ${names.join(', ') || 'none'}).`,
    );
  return names[0]!;
}

export function attemptOrdinal(value: string) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error(
      `Expected last, first or an attempt ordinal, got ${value}.`,
    );
  return n;
}
