import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fictionEditorialReportSchema } from '@future-flow/contracts';
import {
  evaluateFictionEditorialGate,
  validateFictionEditorialReport,
} from '@future-flow/core';
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
  editorProbeMarkdown,
  attemptOrdinal,
  editorRequest,
  findStoredChapter,
  positiveInteger,
  probeArgs,
  probeOutputDir,
  refuseExisting,
  resolveStateName,
  runEditorProbe,
  storedEditorReports,
  writeProbeFile,
} from './lib/narrative-probe';

// Usage: pnpm narrative:probe-editor --run <run dir> --chapter ch2
//   [--state <state folder>] [--author last|first|<attempt ordinal>]
//   [--runs 3] [--model gpt-6.1-sol] --out <dir>
// Judges one stored chapter (by default its last, repaired author package) with
// several independent editor calls through the local Codex transport, and
// applies the product's own editorial gate to each report. Tells a real
// weakness from score noise: the request bytes are identical in every run.
// Quota guarded, no API key, no ledger; the stored run is only read and --out
// must be outside it.
export async function runNarrativeProbeEditor(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
  responder?: OfflineMockResponder,
  quota?: QuotaSource,
) {
  const args = probeArgs(argv, [
    '--run',
    '--state',
    '--chapter',
    '--author',
    '--runs',
    '--model',
    '--timeout-ms',
    '--out',
  ]);
  const run = args.get('--run');
  const chapterId = args.get('--chapter');
  const out = args.get('--out');
  if (!run || !chapterId || !out)
    throw new Error(
      'Usage: narrative:probe-editor --run <dir> --chapter ch2 [--author last|first|<ordinal>] [--runs 3] --out <dir>',
    );
  const outDir = probeOutputDir(out, [run]);
  refuseExisting(outDir, ['probe-editor.json', 'probe-editor.md']);
  const stored = await storedChapters(
    run,
    resolveStateName(run, args.get('--state')),
  );
  const chapter = findStoredChapter(stored, run, chapterId);
  const which = args.get('--author') ?? 'last';
  const request = await editorRequest(
    chapter,
    which === 'last' || which === 'first' ? which : attemptOrdinal(which),
  );
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
  const write = (result: Awaited<ReturnType<typeof runEditorProbe>>) => {
    writeProbeFile(
      outDir,
      'probe-editor.json',
      JSON.stringify(
        {
          ...result,
          transport: 'codex-local',
          model: codex.model,
          reasoningEffort: CODEX_REASONING_EFFORT,
          source: { run, chapter: chapter.caseId },
        },
        null,
        2,
      ) + '\n',
    );
    writeProbeFile(outDir, 'probe-editor.md', editorProbeMarkdown(result));
  };
  const result = await runEditorProbe(
    {
      caseId: chapter.caseId,
      authorOrdinal: request.ordinal,
      parameters: request.parameters,
      stored: storedEditorReports(chapter.attempts),
      gate: (raw) => {
        const report = fictionEditorialReportSchema.parse(raw);
        validateFictionEditorialReport(
          chapter.payload,
          request.authored,
          report,
        );
        return evaluateFictionEditorialGate(chapter.payload, report).passed;
      },
    },
    positiveInteger(args.get('--runs'), 3),
    {
      responder: responder ?? codexLocalResponder(codex),
      guard,
      timeoutMs: positiveInteger(args.get('--timeout-ms'), PROBE_TIMEOUT_MS),
    },
    write,
  );
  write(result);
  return { out: join(outDir, 'probe-editor.md'), result };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runNarrativeProbeEditor(process.argv.slice(2))
    .then(({ out, result }) => {
      console.log(JSON.stringify({ out, summary: result.summary }, null, 2));
      if (result.halted) process.exitCode = 3;
    })
    .catch((error: Error) => {
      console.error(`[narrative-probe-editor] ${error.message}`);
      process.exitCode = error instanceof QuotaHalt ? 3 : 1;
    });
}
