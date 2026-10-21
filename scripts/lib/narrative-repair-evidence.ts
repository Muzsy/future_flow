import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

// Read-only evidence of what a repair round did, from the stored files of an
// evaluation run (transport-records.json and diagnostic-attempts/*.json) and
// nothing else: no state directory is opened, no provider, no ledger. For every
// author repair it shows the mode and wording the repairing author was given,
// the checker findings before it, whether the registered story facts were
// frozen or grown, and what the next fidelity check said about the result. It
// also gives the latency of every physical call with the request and output
// bytes, to tell a slow call that is driven by its size from one that is not.
type Transport = {
  caseId: string;
  task: string;
  latencyMs: number;
  requestBytes?: number;
  outputBytes?: number;
};
type Attempt = {
  ordinal: number;
  task: string;
  status: string;
  latencyMs: number;
  output: unknown;
  repairFeedback: { mode?: string; message: string } | null;
};
type Fact = { id: string; assertion: string };

// Editor dimensions whose fix usually needs new material (a concrete cause, price
// or deadline) rather than a rewrite of the material already on the page. Only
// used to project what a mode change would do to the physical call count; the
// product does not read it.
export const MATERIAL_EDITOR_DIMENSIONS = [
  'choiceStakes',
  'causality',
  'personalization',
  'novelty',
  'character',
] as const;

const clip = (text: string, limit: number) =>
  text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
const words = (body: unknown) =>
  typeof body === 'string' ? body.split(/\s+/).filter(Boolean).length : 0;
const factsOf = (output: unknown): Fact[] =>
  ((output as { storyFacts?: Fact[] } | null)?.storyFacts ?? []).map((f) => ({
    id: f.id,
    assertion: f.assertion,
  }));

export function pearson(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / n;
  const mx = mean(xs),
    my = mean(ys);
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  return sxx && syy
    ? Math.round((sxy / Math.sqrt(sxx * syy)) * 100) / 100
    : null;
}

export function repairEvidence(runDir: string) {
  const root = resolve(runDir);
  const transportFile = join(root, 'transport-records.json');
  const transports: Transport[] = existsSync(transportFile)
    ? JSON.parse(readFileSync(transportFile, 'utf8'))
    : [];
  const byTask = new Map<string, Transport[]>();
  for (const t of transports)
    byTask.set(t.task, [...(byTask.get(t.task) ?? []), t]);
  const latency = [...byTask].map(([task, calls]) => {
    const withSizes = calls.filter(
      (c) => c.requestBytes !== undefined && c.outputBytes !== undefined,
    );
    const meanOf = (v: number[]) =>
      v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
    return {
      task,
      calls: calls.length,
      meanMs: meanOf(calls.map((c) => c.latencyMs)),
      meanOutputBytes: meanOf(withSizes.map((c) => c.outputBytes!)),
      meanRequestBytes: meanOf(withSizes.map((c) => c.requestBytes!)),
      maxMs: Math.max(...calls.map((c) => c.latencyMs)),
      over150s: calls.filter((c) => c.latencyMs > 150_000).length,
      over180s: calls.filter((c) => c.latencyMs > 180_000).length,
      // Pearson r of latency with the request size and with the output size.
      rRequestBytes: pearson(
        withSizes.map((c) => c.latencyMs),
        withSizes.map((c) => c.requestBytes!),
      ),
      rOutputBytes: pearson(
        withSizes.map((c) => c.latencyMs),
        withSizes.map((c) => c.outputBytes!),
      ),
    };
  });
  const calls = transports
    .filter((t) =>
      ['life_narrative_chapter', 'life_narrative_plan'].includes(t.task),
    )
    .map((t) => ({
      caseId: t.caseId,
      task: t.task,
      latencyMs: t.latencyMs,
      requestBytes: t.requestBytes ?? null,
      outputBytes: t.outputBytes ?? null,
    }));
  const slowCalls = transports
    .filter((t) => t.latencyMs > 150_000)
    .map((t) => ({
      caseId: t.caseId,
      task: t.task,
      latencyMs: t.latencyMs,
      requestBytes: t.requestBytes ?? null,
      outputBytes: t.outputBytes ?? null,
    }));

  const dir = join(root, 'diagnostic-attempts');
  const chapters: {
    caseId: string;
    calls: number;
    repairMode: string | null;
    materialEditorRepair: boolean;
    callsIfAuthorPackage: number;
  }[] = [];
  const repairs = (existsSync(dir) ? readdirSync(dir).sort() : [])
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      const trace = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
        caseId?: string;
        attempts: Attempt[];
      };
      const caseId = trace.caseId ?? basename(file, '.json');
      const attempts = trace.attempts;
      const repairAttempt = attempts.find(
        (a) => a.task === 'life_narrative_chapter' && a.repairFeedback,
      );
      const editorBeforeRepair = repairAttempt
        ? (attempts
            .filter(
              (a) =>
                a.task === 'life_narrative_editor' &&
                a.output &&
                a.ordinal < repairAttempt.ordinal,
            )
            .at(-1)?.output as { issues?: { dimension: string }[] } | undefined)
        : undefined;
      const mode = repairAttempt?.repairFeedback?.mode ?? null;
      const material =
        mode === 'prose_only' &&
        (editorBeforeRepair?.issues ?? []).some((i) =>
          (MATERIAL_EDITOR_DIMENSIONS as readonly string[]).includes(
            i.dimension,
          ),
        );
      chapters.push({
        caseId,
        calls: attempts.length,
        repairMode: mode,
        materialEditorRepair: material,
        // A prose-only repair reuses the plan review; an author-package repair
        // cannot, so it costs one more physical call.
        callsIfAuthorPackage: attempts.length + (material ? 1 : 0),
      });
      return attempts
        .filter((a) => a.task === 'life_narrative_chapter' && a.repairFeedback)
        .map((repair) => {
          const before = attempts.filter((a) => a.ordinal < repair.ordinal);
          const previous = before
            .filter((a) => a.task === 'life_narrative_chapter' && a.output)
            .at(-1);
          const lastOf = (task: string, list: Attempt[]) =>
            list.filter((a) => a.task === task && a.output).at(-1);
          const after = attempts.filter((a) => a.ordinal > repair.ordinal);
          const fidelityBefore = lastOf('life_fidelity', before)?.output as
            | {
                valid?: boolean;
                issues?: { reason: string }[];
              }
            | undefined;
          const editorBefore = lastOf('life_narrative_editor', before)
            ?.output as
            | {
                verdict?: string;
                scores?: Record<string, number>;
                issues?: {
                  dimension: string;
                  severity: string;
                  repairScope: string;
                  suggestedFix: string;
                }[];
              }
            | undefined;
          const editorAfter = lastOf('life_narrative_editor', after)?.output as
            | {
                verdict?: string;
                scores?: Record<string, number>;
                issues?: {
                  dimension: string;
                  severity: string;
                  repairScope: string;
                }[];
              }
            | undefined;
          const fidelityAfter = lastOf('life_fidelity', after)?.output as
            | {
                valid?: boolean;
                issues?: { reason: string }[];
              }
            | undefined;
          const factsBefore = factsOf(previous?.output);
          const factsAfter = factsOf(repair.output);
          const known = new Set(factsBefore.map((f) => f.id));
          return {
            caseId,
            mode: repair.repairFeedback!.mode ?? 'unknown',
            message: clip(repair.repairFeedback!.message, 1500),
            latencyMs: repair.latencyMs,
            fidelityBefore: fidelityBefore
              ? {
                  valid: fidelityBefore.valid ?? null,
                  reasons: (fidelityBefore.issues ?? []).map((i) =>
                    clip(i.reason, 700),
                  ),
                }
              : null,
            editorBefore: editorBefore
              ? {
                  verdict: editorBefore.verdict ?? null,
                  scores: editorBefore.scores ?? null,
                  issues: (editorBefore.issues ?? []).map((i) => ({
                    dimension: i.dimension,
                    severity: i.severity,
                    repairScope: i.repairScope,
                    suggestedFix: clip(i.suggestedFix, 350),
                  })),
                }
              : null,
            storyFacts: {
              before: factsBefore.length,
              after: factsAfter.length,
              frozen:
                JSON.stringify(factsBefore) === JSON.stringify(factsAfter),
              added: factsAfter
                .filter((f) => !known.has(f.id))
                .map((f) => clip(f.assertion, 300)),
            },
            bodyWords: {
              before: words(
                (previous?.output as { chapter?: { body?: string } } | null)
                  ?.chapter?.body,
              ),
              after: words(
                (repair.output as { chapter?: { body?: string } } | null)
                  ?.chapter?.body,
              ),
            },
            editorAfter: editorAfter
              ? {
                  verdict: editorAfter.verdict ?? null,
                  scores: editorAfter.scores ?? null,
                  issues: (editorAfter.issues ?? []).map(
                    (i) => `${i.dimension}/${i.severity}/${i.repairScope}`,
                  ),
                }
              : null,
            fidelityAfter: fidelityAfter
              ? {
                  valid: fidelityAfter.valid ?? null,
                  reasons: (fidelityAfter.issues ?? []).map((i) =>
                    clip(i.reason, 700),
                  ),
                }
              : null,
          };
        });
    });
  const at9 = (calls: number) => calls >= 9;
  return {
    run: basename(root),
    latency,
    calls,
    slowCalls,
    repairs,
    chapters,
    ceiling: {
      now: chapters.filter((c) => at9(c.calls)).length,
      ifAuthorPackage: chapters.filter((c) => at9(c.callsIfAuthorPackage))
        .length,
      cases: chapters.length,
    },
  };
}

export function repairEvidenceMarkdown(
  runs: ReturnType<typeof repairEvidence>[],
) {
  const lines = ['# Repair evidence (stored files only, no model call)', ''];
  for (const run of runs) {
    lines.push(`## ${run.run}`, '', '### Latency by stage', '');
    lines.push(
      '| task | calls | mean s | max s | >150 s | >180 s | mean request KB | mean output KB | s per output KB | r(latency, request bytes) | r(latency, output bytes) |',
      '|---|---|---|---|---|---|---|---|---|---|---|',
      ...run.latency.map((l) => {
        const kb = (n: number | null) =>
          n === null ? '-' : (n / 1000).toFixed(1);
        const perKb =
          l.meanMs !== null && l.meanOutputBytes
            ? (l.meanMs / l.meanOutputBytes).toFixed(1)
            : '-';
        return `| ${l.task} | ${l.calls} | ${l.meanMs === null ? '-' : (l.meanMs / 1000).toFixed(0)} | ${(l.maxMs / 1000).toFixed(0)} | ${l.over150s} | ${l.over180s} | ${kb(l.meanRequestBytes)} | ${kb(l.meanOutputBytes)} | ${perKb} | ${l.rRequestBytes ?? '-'} | ${l.rOutputBytes ?? '-'} |`;
      }),
      '',
      '### Every plan and author call',
      '',
      ...run.calls.map(
        (c) =>
          `- ${c.caseId} ${c.task}: ${(c.latencyMs / 1000).toFixed(0)} s, request ${c.requestBytes === null ? '-' : (c.requestBytes / 1000).toFixed(1)} KB, output ${c.outputBytes === null ? '-' : (c.outputBytes / 1000).toFixed(1)} KB`,
      ),
      '',
      '### Calls over 150 s',
      '',
      ...(run.slowCalls.length
        ? run.slowCalls.map(
            (c) =>
              `- ${c.caseId} ${c.task}: ${(c.latencyMs / 1000).toFixed(0)} s, request ${c.requestBytes ?? '-'} B, output ${c.outputBytes ?? '-'} B`,
          )
        : ['- none']),
      '',
      '### Calls per case and the 9-call ceiling',
      '',
      `- Cases at 9 calls now: ${run.ceiling.now}/${run.ceiling.cases}; if every material-dimension prose-only repair became an author-package repair (+1 call): ${run.ceiling.ifAuthorPackage}/${run.ceiling.cases}`,
      ...run.chapters.map(
        (c) =>
          `- ${c.caseId}: ${c.calls} calls, repair ${c.repairMode ?? 'none'}${c.materialEditorRepair ? ', material editor dimension -> ' + c.callsIfAuthorPackage + ' calls as author_package' : ''}`,
      ),
      '',
      '### Author repairs',
      '',
    );
    if (!run.repairs.length) lines.push('- none', '');
    for (const r of run.repairs) {
      lines.push(
        `#### ${r.caseId}: mode ${r.mode}, ${(r.latencyMs / 1000).toFixed(0)} s`,
        '',
        `- Repair message (head): ${r.message.replace(/\s+/g, ' ')}`,
        `- Fidelity before: ${r.fidelityBefore ? `valid=${r.fidelityBefore.valid}; ${r.fidelityBefore.reasons.join(' | ') || 'no issues'}` : 'none'}`,
        `- Editor before: ${r.editorBefore ? `${r.editorBefore.verdict}; ${r.editorBefore.issues.map((i) => `${i.dimension}/${i.severity}/${i.repairScope}: ${i.suggestedFix}`).join(' | ') || 'no issues'}` : 'none'}`,
        `- Editor scores before: ${r.editorBefore?.scores ? JSON.stringify(r.editorBefore.scores) : '-'}`,
        `- Editor after: ${r.editorAfter ? `${r.editorAfter.verdict}; scores ${r.editorAfter.scores ? JSON.stringify(r.editorAfter.scores) : '-'}; issues ${r.editorAfter.issues.join(' | ') || 'none'}` : 'none (not reached)'}`,
        `- Story facts: ${r.storyFacts.before} before, ${r.storyFacts.after} after, ${r.storyFacts.frozen ? 'frozen' : `grown/changed, added: ${r.storyFacts.added.join(' | ') || 'none'}`}`,
        `- Chapter words: ${r.bodyWords.before} before, ${r.bodyWords.after} after`,
        `- Fidelity after: ${r.fidelityAfter ? `valid=${r.fidelityAfter.valid}; ${r.fidelityAfter.reasons.join(' | ') || 'no issues'}` : 'none (the run stopped or the check was not reached)'}`,
        '',
      );
    }
  }
  return lines.join('\n');
}
