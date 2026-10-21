import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fictionAuthorSchemaFor } from '@future-flow/contracts';
import { fictionScope } from '@future-flow/core';
import {
  CODEX_REASONING_EFFORT,
  codexLocalResponder,
  codexQuotaSource,
} from './lib/narrative-evaluation-codex';
import {
  LocalQuotaGuard,
  QuotaHalt,
  type QuotaSource,
} from './lib/narrative-evaluation-quota';
import type { OfflineMockResponder } from './lib/narrative-evaluation-runner';
import { storedChapters } from './lib/narrative-request-breakdown';
import {
  PROBE_TIMEOUT_MS,
  firstAuthorRequest,
  latencyProbeMarkdown,
  positiveInteger,
  probeArgs,
  probeOutputDir,
  refuseExisting,
  resolveStateName,
  runLatencyProbe,
  withFullPatternSchema,
  writeProbeFile,
  type ProbeArm,
} from './lib/narrative-probe';

// Usage: pnpm narrative:probe-latency --run <v9 run dir> --chapter ch2
//   [--state <state folder>] [--control-run <v8 run dir> --control-chapter ch2
//   [--control-state <state folder>]] [--rounds 3] [--model gpt-6.1-sol]
//   --out <dir>
// Replays the first author request of a stored chapter through the local Codex
// transport, in rounds of interleaved arms: `compact` (the v9 schema as the
// product sends it now), `full-pattern` (the same request with the uuid
// patterns of the schema put back) and, when given, `v8-control` (a stored v8
// author request). Quota guarded, no API key, no ledger; the stored runs are
// only read and --out must be outside them.
export async function runNarrativeProbeLatency(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
  responder?: OfflineMockResponder,
  quota?: QuotaSource,
) {
  const args = probeArgs(argv, [
    '--run',
    '--state',
    '--chapter',
    '--control-run',
    '--control-state',
    '--control-chapter',
    '--rounds',
    '--model',
    '--timeout-ms',
    '--out',
  ]);
  const run = args.get('--run');
  const chapterId = args.get('--chapter');
  const out = args.get('--out');
  if (!run || !chapterId || !out)
    throw new Error(
      'Usage: narrative:probe-latency --run <dir> --chapter ch2 [--control-run <dir> --control-chapter ch2] [--rounds 3] --out <dir>',
    );
  const controlRun = args.get('--control-run');
  const outDir = probeOutputDir(out, controlRun ? [run, controlRun] : [run]);
  refuseExisting(outDir, ['probe-latency.json', 'probe-latency.md']);
  const pick = async (dir: string, state: string | undefined, id: string) => {
    const stored = await storedChapters(dir, resolveStateName(dir, state));
    const chapter = stored.chapters.find((c) => c.chapter === id);
    if (!chapter)
      throw new Error(
        `${id} is not in ${dir} (have ${stored.chapters.map((c) => c.chapter).join(', ')}).`,
      );
    return chapter;
  };
  const target = await pick(run, args.get('--state'), chapterId);
  const compact = await firstAuthorRequest(target);
  const full = withFullPatternSchema(compact, target.payload);
  if (JSON.stringify(full.text) === JSON.stringify(compact.text))
    throw new Error(
      `${target.caseId} sends the same schema either way: the probe needs a v9 run.`,
    );
  const validator = (payload: typeof target.payload) => {
    const schema = fictionAuthorSchemaFor(fictionScope(payload).context.policy);
    return (output: unknown) => schema.safeParse(output).success;
  };
  const arms: ProbeArm[] = [
    {
      id: 'compact',
      description: `${target.caseId}, v9 schema without the copied-uuid patterns (as sent now)`,
      parameters: compact,
      validate: validator(target.payload),
    },
    {
      id: 'full-pattern',
      description: `${target.caseId}, same request with the full-pattern schema`,
      parameters: full,
      validate: validator(target.payload),
    },
  ];
  if (controlRun) {
    const control = await pick(
      controlRun,
      args.get('--control-state'),
      args.get('--control-chapter') ?? chapterId,
    );
    arms.push({
      id: 'v8-control',
      description: `${control.caseId}, stored v8 author request`,
      parameters: await firstAuthorRequest(control),
      validate: validator(control.payload),
    });
  }
  const codex = {
    bin: env.ALTERWARD_CODEX_BIN ?? 'codex',
    model: args.get('--model') ?? 'gpt-6.1-sol',
  };
  const guard =
    responder && !quota
      ? null
      : new LocalQuotaGuard(quota ?? codexQuotaSource(codex.bin), {
          sticky: true,
        });
  await guard?.preflight();
  const rounds = positiveInteger(args.get('--rounds'), 3);
  const write = (result: Awaited<ReturnType<typeof runLatencyProbe>>) => {
    writeProbeFile(
      outDir,
      'probe-latency.json',
      JSON.stringify(
        {
          ...result,
          transport: 'codex-local',
          model: codex.model,
          reasoningEffort: CODEX_REASONING_EFFORT,
          source: {
            run,
            chapter: target.caseId,
            controlRun: controlRun ?? null,
          },
        },
        null,
        2,
      ) + '\n',
    );
    writeProbeFile(outDir, 'probe-latency.md', latencyProbeMarkdown(result));
  };
  const result = await runLatencyProbe(
    arms,
    rounds,
    {
      responder: responder ?? codexLocalResponder(codex),
      guard,
      timeoutMs: positiveInteger(args.get('--timeout-ms'), PROBE_TIMEOUT_MS),
    },
    write,
  );
  write(result);
  return { out: join(outDir, 'probe-latency.md'), result };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runNarrativeProbeLatency(process.argv.slice(2))
    .then(({ out, result }) => {
      console.log(JSON.stringify({ out, summary: result.summary }, null, 2));
      if (result.halted) process.exitCode = 3;
    })
    .catch((error: Error) => {
      console.error(`[narrative-probe-latency] ${error.message}`);
      process.exitCode = error instanceof QuotaHalt ? 3 : 1;
    });
}
