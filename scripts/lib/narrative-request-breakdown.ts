import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type OpenAI from 'openai';
import { OpenAiProvider } from '@future-flow/ai';
import type {
  FictionAuthorResult,
  NarrativePeriodInput,
  NarrativePlanningResult,
} from '@future-flow/contracts';
import type { FictionRepair } from '@future-flow/core';
import { adapter } from './narrative-evaluation-runner';
import { attemptTracePath } from './narrative-evaluation-attempts';

// Rebuilds the author requests of a stored creative run, offline, and
// splits their bytes: the system prompt, the output schema, and the user
// message by key (and by narrativeContext key). It uses the real provider code
// path with a recording client, from the saved job payload and the saved
// planner draft in the attempt trace, so the split is of the request that was
// really built, not an estimate. No model call, no ledger.
type Json = Record<string, unknown>;
const bytes = (value: unknown) =>
  Buffer.byteLength(
    typeof value === 'string' ? value : JSON.stringify(value ?? null),
    'utf8',
  );
const sizes = (value: unknown) =>
  Object.fromEntries(
    Object.entries((value ?? {}) as Json).map(([k, v]) => [k, bytes(v)]),
  );

export type AuthorRequestBreakdown = {
  total: number;
  instructions: number;
  schema: number;
  user: number;
  userKeys: Record<string, number>;
  narrativeContext: Record<string, number>;
};

export async function authorRequestBreakdown(
  input: NarrativePeriodInput,
  draft: NarrativePlanningResult,
  authored: FictionAuthorResult,
  repair?: FictionRepair,
): Promise<AuthorRequestBreakdown> {
  let captured: Json | undefined;
  const parse = async (request: Json) => {
    captured = request;
    return {
      status: 'completed',
      model: request.model,
      output_parsed: authored,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
  };
  const ai = new OpenAiProvider(
    {
      apiKey: 'offline-breakdown-only',
      eventModel: 'gpt-6.1-sol',
      storyModel: 'gpt-6.1-sol',
      checkModel: 'gpt-6.1-sol',
      timeoutMs: 1000,
      maxOutputTokens: 12000,
    },
    { responses: { parse } } as unknown as OpenAI,
  );
  await ai.authorFiction(input, draft, repair);
  const request = captured as {
    input: { role: string; content: string }[];
    text: unknown;
  };
  const system = request.input.find((m) => m.role === 'system')!.content;
  const userText = request.input.find((m) => m.role === 'user')!.content;
  const user = JSON.parse(userText) as Json;
  return {
    total: bytes(request),
    instructions: bytes(system),
    schema: bytes(request.text),
    user: bytes(userText),
    userKeys: sizes(user),
    narrativeContext: sizes(user.narrativeContext),
  };
}

type Attempt = {
  ordinal: number;
  task: string;
  status: string;
  output: unknown;
  repairFeedback: { mode?: string; message: string } | null;
};
export type BreakdownRow = {
  chapter: string;
  kind: 'author' | 'author-repair';
  breakdown: AuthorRequestBreakdown;
};

// `outDir` is the evaluation output directory, `stateName` the state folder
// (for example career-transition-narrative-v1).
export async function breakdownRun(outDir: string, stateName: string) {
  const root = resolve(outDir);
  const [fixtureId, mode] = [
    stateName.slice(0, stateName.lastIndexOf('-narrative')),
    stateName.slice(stateName.lastIndexOf('-narrative') + 1),
  ];
  // Opening a PGlite directory writes to it (control file, WAL, postmaster.pid
  // and more), even for a read-only query. The evidence directory of a run is
  // only read: the state is opened on a temporary copy, without a stale
  // postmaster.pid, and the copy is removed afterwards.
  const source = join(root, 'state', stateName);
  const work = mkdtempSync(join(tmpdir(), 'alterward-request-breakdown-'));
  const copy = join(work, 'state');
  cpSync(source, copy, {
    recursive: true,
    filter: (file) => basename(file) !== 'postmaster.pid',
  });
  const engine = new PGlite(copy);
  const rows: BreakdownRow[] = [];
  try {
    const db = adapter(engine);
    const jobs = await db.query<{
      branch_id: string;
      payload: NarrativePeriodInput;
    }>(
      "SELECT branch_id, payload FROM aw_jobs WHERE status='completed' ORDER BY created_at",
    );
    const mainBranch = jobs[0]?.branch_id;
    let periodIndex = 0;
    for (const job of jobs) {
      const main = job.branch_id === mainBranch;
      const chapter = main ? `ch${periodIndex}` : 'fork';
      const caseId = main
        ? `${fixtureId}:${mode}:${periodIndex}`
        : `fork:${fixtureId}:${mode}:2`;
      if (main) periodIndex++;
      const file = attemptTracePath(root, caseId);
      if (!existsSync(file)) continue;
      const attempts = (
        JSON.parse(readFileSync(file, 'utf8')) as { attempts: Attempt[] }
      ).attempts;
      const authors = attempts.filter(
        (a) => a.task === 'life_narrative_chapter' && a.output,
      );
      let previous: FictionAuthorResult | undefined;
      for (const author of authors) {
        const plan = attempts
          .filter(
            (a) =>
              a.task === 'life_narrative_plan' &&
              a.status === 'completed' &&
              a.output &&
              a.ordinal < author.ordinal,
          )
          .at(-1);
        if (!plan) continue;
        const repair =
          author.repairFeedback && previous
            ? ({
                mode:
                  author.repairFeedback.mode === 'prose_only'
                    ? 'prose_only'
                    : 'author_package',
                message: author.repairFeedback.message,
                previous,
              } satisfies FictionRepair)
            : undefined;
        rows.push({
          chapter,
          kind: repair ? 'author-repair' : 'author',
          breakdown: await authorRequestBreakdown(
            job.payload,
            plan.output as NarrativePlanningResult,
            author.output as FictionAuthorResult,
            repair,
          ),
        });
        previous = author.output as FictionAuthorResult;
      }
    }
  } finally {
    await engine.close();
    rmSync(work, { recursive: true, force: true });
  }
  return {
    label: basename(dirname(dirname(join(root, 'state', stateName)))),
    rows,
  };
}

const kb = (n: number | undefined) =>
  n === undefined ? '-' : (n / 1000).toFixed(1);

export function breakdownMarkdown(
  runs: Awaited<ReturnType<typeof breakdownRun>>[],
) {
  const keys = new Set<string>(),
    contextKeys = new Set<string>();
  for (const run of runs)
    for (const r of run.rows) {
      Object.keys(r.breakdown.userKeys).forEach((k) => keys.add(k));
      Object.keys(r.breakdown.narrativeContext).forEach((k) =>
        contextKeys.add(k),
      );
    }
  const lines = [
    '# Author request breakdown (bytes, offline)',
    '',
    // The request is rebuilt by the CURRENT provider code from the stored
    // payload and draft, so the schema column is what this code sends (a run
    // made before a schema change shows the new schema), and an author-repair
    // row takes its previous package from the preceding author attempt that
    // had an output (possibly a malformed one): both are approximations of the
    // request the stored run really sent.
    '_Rebuilt by the current provider code: the schema column is what this code sends; author-repair rows use the preceding author output as the previous package._',
    '',
  ];
  for (const run of runs) {
    lines.push(
      `## ${run.label}`,
      '',
      `| chapter | kind | total KB | instructions | schema | user | ${[...keys].join(' | ')} | ctx: ${[...contextKeys].join(' | ctx: ')} |`,
      `|---|---|---|---|---|---|${[...keys].map(() => '---|').join('')}${[...contextKeys].map(() => '---|').join('')}`,
    );
    for (const r of run.rows) {
      const b = r.breakdown;
      lines.push(
        `| ${r.chapter} | ${r.kind} | ${kb(b.total)} | ${kb(b.instructions)} | ${kb(b.schema)} | ${kb(b.user)} | ${[...keys].map((k) => kb(b.userKeys[k])).join(' | ')} | ${[...contextKeys].map((k) => kb(b.narrativeContext[k])).join(' | ')} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}
