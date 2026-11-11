import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  renameSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  fictionEditorialReportSchema,
  type FictionAuthorResult,
  type NarrativePeriodInput,
} from '@future-flow/contracts';
import {
  evaluateFictionEditorialGate,
  validateFictionEditorialReport,
} from '@future-flow/core';
import {
  codexLocalResponder,
  codexQuotaSource,
} from './lib/narrative-evaluation-codex';
import { LocalQuotaGuard } from './lib/narrative-evaluation-quota';
import type { OfflineMockResponder } from './lib/narrative-evaluation-runner';
import type { ProviderParameters } from './lib/narrative-probe';

const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Fixture = {
  id: string;
  hypothesis: string;
  payload: NarrativePeriodInput;
  authored: FictionAuthorResult;
  parameters: ProviderParameters;
};
type Arm = 'pre-c5' | 'c5';
export function calibrationParameters(
  fixture: Fixture,
  prompts: Record<Arm, string>,
  arm: Arm,
) {
  const p = fixture.parameters;
  if (
    p.model !== 'gpt-6.1-sol' ||
    p.input.filter((m) => m.role === 'system').length !== 1 ||
    p.input.filter((m) => m.role === 'user').length !== 1 ||
    p.input.find((m) => m.role === 'system')?.content !== prompts.c5
  )
    throw new Error('Calibration needs the frozen C5 request and model.');
  return {
    ...p,
    input: p.input.map((m) =>
      m.role === 'system' ? { ...m, content: prompts[arm] } : m,
    ),
  };
}
export function calibrationSchedule(ids: string[]) {
  return [1, 2].flatMap((round) =>
    ids.flatMap((id) =>
      (round === 1
        ? (['pre-c5', 'c5'] as const)
        : (['c5', 'pre-c5'] as const)
      ).map((arm) => ({ round, id, arm })),
    ),
  );
}
export function loadCalibration(dir: string) {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const prompts: Record<Arm, string> = JSON.parse(
    readFileSync(join(dir, 'prompts.json'), 'utf8'),
  );
  if (
    manifest.version !== 1 ||
    manifest.rounds !== 2 ||
    manifest.maxCalls !== 12 ||
    manifest.model !== 'gpt-6.1-sol' ||
    manifest.reasoningEffort !== 'medium' ||
    manifest.cases.length !== 3 ||
    hash(prompts) !== manifest.promptsHash
  )
    throw new Error('The bounded calibration manifest or prompts changed.');
  const fixtures: Fixture[] = manifest.cases.map(
    (entry: {
      file: string;
      id: string;
      sha256: string;
      userHash: string;
      schemaHash: string;
    }) => {
      if (!/^[a-z-]+\.json$/.test(entry.file))
        throw new Error('Invalid fixture path.');
      const text = readFileSync(join(dir, entry.file), 'utf8');
      const fixture: Fixture = JSON.parse(text);
      if (
        createHash('sha256').update(text).digest('hex') !== entry.sha256 ||
        fixture.id !== entry.id ||
        hash(fixture.parameters.input.filter((m) => m.role === 'user')) !==
          entry.userHash ||
        hash(fixture.parameters.text) !== entry.schemaHash
      )
        throw new Error('Fixture, user content or schema hash differs.');
      calibrationParameters(fixture, prompts, 'c5');
      return fixture;
    },
  );
  if (new Set(fixtures.map((f) => f.id)).size !== 3)
    throw new Error('Duplicate calibration cases.');
  return { manifest, prompts, fixtures };
}

export async function runCalibration(
  dir: string,
  out: string,
  responder: OfflineMockResponder,
  guard: LocalQuotaGuard,
) {
  const { manifest, prompts, fixtures } = loadCalibration(dir);
  const schedule = calibrationSchedule(fixtures.map((f) => f.id));
  if (existsSync(out))
    throw new Error('Calibration output already exists; no automatic reroll.');
  mkdirSync(dirname(out), { recursive: true });
  try {
    mkdirSync(out); // Exclusive reservation: a second writer fails with EEXIST.
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new Error(
        'Calibration output already exists; no automatic reroll.',
      );
    throw error;
  }
  const result = {
    version: 1,
    diagnosticOnly: true,
    manifestHash: hash(manifest),
    runnerCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    model: manifest.model,
    reasoningEffort: 'medium',
    schedule,
    calls: [] as Record<string, unknown>[],
    quota: guard.log,
    halted: null as string | null,
  };
  const save = () => {
    writeFileSync(
      join(out, 'results.next'),
      JSON.stringify(result, null, 2) + '\n',
    );
    renameSync(join(out, 'results.next'), join(out, 'results.json'));
  };
  try {
    await guard.preflight();
    save();
    for (const slot of schedule) {
      const fixture = fixtures.find((f) => f.id === slot.id)!;
      const parameters = calibrationParameters(fixture, prompts, slot.arm);
      const call: Record<string, unknown> = {
        ...slot,
        requestHash: hash(parameters),
        userHash: hash(parameters.input.filter((m) => m.role === 'user')),
        schemaHash: hash(parameters.text),
        startedAt: new Date().toISOString(),
        status: 'pending',
        raw: null,
        gatePassed: null,
      };
      const caseId = `editor-calibration:${slot.round}:${slot.id}:${slot.arm}`;
      await guard.beforeCall(caseId);
      result.calls.push(call);
      save();
      const started = Date.now();
      try {
        const raw = await responder({
          caseId,
          task: 'life_narrative_editor',
          model: parameters.model,
          ordinal: result.calls.length - 1,
          parameters: parameters as never,
          timeoutMs: 300_000,
          job: undefined as never,
          defaultOutput: () => null,
        });
        call.rawTextFile = existsSync(
          join(out, `raw-${result.calls.length}.txt`),
        )
          ? `raw-${result.calls.length}.txt`
          : null;
        call.raw = raw;
        call.latencyMs = Date.now() - started;
        save(); // Preserve the full response even if validation fails.
        const report = fictionEditorialReportSchema.parse(raw);
        validateFictionEditorialReport(
          fixture.payload,
          fixture.authored,
          report,
        );
        call.gatePassed = evaluateFictionEditorialGate(
          fixture.payload,
          report,
        ).passed;
        call.status = 'ok';
        save();
      } catch (error) {
        call.latencyMs = Date.now() - started;
        call.rawTextFile = existsSync(
          join(out, `raw-${result.calls.length}.txt`),
        )
          ? `raw-${result.calls.length}.txt`
          : null;
        call.status = 'error';
        call.error = error instanceof Error ? error.message : String(error);
        save();
        await guard.afterFailure(caseId);
        throw error; // No retry, fallback, repair or silent continuation.
      }
    }
  } catch (error) {
    result.halted = error instanceof Error ? error.message : String(error);
  } finally {
    await guard.finish();
    save();
  }
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--fixtures' || args[2] !== '--out') {
    console.error(
      'Usage: tsx scripts/narrative-editor-calibration.ts --fixtures <dir> --out <new-dir>',
    );
    process.exitCode = 1;
  } else {
    let rawIndex = 0;
    runCalibration(
      resolve(args[1]!),
      resolve(args[3]!),
      codexLocalResponder({
        bin: process.env.ALTERWARD_CODEX_BIN ?? 'codex',
        model: 'gpt-6.1-sol',
        onRawOutput: async (text) => {
          writeFileSync(
            join(resolve(args[3]!), `raw-${++rawIndex}.txt`),
            text,
            { flag: 'wx' },
          );
        },
      }),
      new LocalQuotaGuard(
        codexQuotaSource(process.env.ALTERWARD_CODEX_BIN ?? 'codex'),
        { sticky: true },
      ),
    )
      .then((result) => {
        console.log(
          JSON.stringify({ calls: result.calls.length, halted: result.halted }),
        );
        if (result.halted) process.exitCode = 3;
      })
      .catch((error) => {
        console.error(String(error));
        process.exitCode = 1;
      });
  }
}
