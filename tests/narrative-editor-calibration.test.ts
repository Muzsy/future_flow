import {
  cpSync,
  mkdtempSync,
  readFileSync,
  appendFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { codexLocalResponder } from '../scripts/lib/narrative-evaluation-codex';
import { captureProviderRequest } from '../scripts/lib/narrative-probe';
import {
  calibrationParameters,
  calibrationSchedule,
  loadCalibration,
  runCalibration,
} from '../scripts/narrative-editor-calibration';
import {
  CODEX_QUOTA_THRESHOLDS,
  LocalQuotaGuard,
} from '../scripts/lib/narrative-evaluation-quota';

const dir = resolve('docs/evidence/c5-editor-calibration-2026-10-24');
const output = () =>
  join(mkdtempSync(join(tmpdir(), 'editor-calibration-test-')), 'result');
const guard = (remaining = 100) =>
  new LocalQuotaGuard(
    {
      engine: 'codex',
      thresholds: CODEX_QUOTA_THRESHOLDS,
      read: async () => ({
        engine: 'codex',
        at: new Date().toISOString(),
        blockedReason: null,
        windows: [
          { name: 'five-hour', remainingPercent: remaining, resetsAt: null },
          { name: 'weekly', remainingPercent: 100, resetsAt: null },
        ],
      }),
    },
    { sticky: true },
  );

describe('fixed-input C5 editor calibration', () => {
  it('rebuilds each frozen request from its full source package without a model', async () => {
    for (const fixture of loadCalibration(dir).fixtures) {
      const rebuilt = await captureProviderRequest(
        (ai) => ai.editFiction(fixture.payload, fixture.authored),
        null,
      );
      expect(rebuilt).toEqual(fixture.parameters);
    }
  });

  it('preserves final text before invalid JSON and output-limit rejection', async () => {
    const fixture = loadCalibration(dir).fixtures[0]!;
    for (const [text, cap] of [
      ['{broken json', 1000],
      [JSON.stringify({ large: 'x'.repeat(100) }), 1],
    ] as const) {
      const bin = join(
        mkdtempSync(join(tmpdir(), 'codex-output-test-')),
        'fake-codex',
      );
      writeFileSync(
        bin,
        '#!' +
          process.execPath +
          '\n' +
          `const fs=require('node:fs');process.stdin.resume();process.stdin.on('end',()=>{fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],${JSON.stringify(text)});});`,
        { mode: 0o700 },
      );
      const seen: string[] = [];
      const responder = codexLocalResponder({
        bin,
        model: 'gpt-6.1-sol',
        onRawOutput: async (raw) => {
          seen.push(raw);
        },
      });
      const context = {
        caseId: 'test',
        task: 'life_narrative_editor',
        model: 'gpt-6.1-sol',
        ordinal: 0,
        parameters: { ...fixture.parameters, max_output_tokens: cap } as never,
        timeoutMs: 5000,
        job: undefined as never,
        defaultOutput: () => null,
      };
      if (cap === 1)
        expect(await responder(context)).toMatchObject({
          __rawResponse: { status: 'incomplete' },
        });
      else await expect(responder(context)).rejects.toThrow();
      expect(seen).toEqual([text]);
    }
  });

  it('reserves one output exclusively for concurrent writers', async () => {
    const out = output();
    const fixtures = loadCalibration(dir).fixtures;
    let calls = 0;
    const responder = async ({ caseId }: { caseId: string }) => {
      calls++;
      const fixture = fixtures.find((f) => caseId.includes(f.id))!;
      return JSON.parse(readFileSync(join(dir, fixture.id + '.json'), 'utf8'))
        .storedReport;
    };
    const results = await Promise.allSettled([
      runCalibration(dir, out, responder, guard()),
      runCalibration(dir, out, responder, guard()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(calls).toBe(12);
  });
  it('freezes the user and schema for both arms and counterbalances exactly twelve calls', () => {
    const { fixtures, prompts } = loadCalibration(dir);
    for (const fixture of fixtures) {
      const old = calibrationParameters(fixture, prompts, 'pre-c5');
      const next = calibrationParameters(fixture, prompts, 'c5');
      expect(old.input.filter((m) => m.role === 'user')).toEqual(
        next.input.filter((m) => m.role === 'user'),
      );
      expect(old.text).toEqual(next.text);
      expect(old.model).toBe(next.model);
      expect(old.max_output_tokens).toBe(next.max_output_tokens);
      expect(old.input[0]!.content).not.toBe(next.input[0]!.content);
    }
    const slots = calibrationSchedule(fixtures.map((f) => f.id));
    expect(slots).toHaveLength(12);
    expect(slots.slice(0, 2).map((s) => s.arm)).toEqual(['pre-c5', 'c5']);
    expect(slots.slice(6, 8).map((s) => s.arm)).toEqual(['c5', 'pre-c5']);
  });

  it('refuses tampered evidence before any request', () => {
    const copy = join(
      mkdtempSync(join(tmpdir(), 'editor-evidence-test-')),
      'fixtures',
    );
    cpSync(dir, copy, { recursive: true });
    appendFileSync(join(copy, 'disputed-original.json'), '\n');
    expect(() => loadCalibration(copy)).toThrow('hash differs');
  });

  it('keeps valid rejections as results, preserves full reports, and refuses a reroll', async () => {
    const out = output();
    const { fixtures } = loadCalibration(dir);
    const responder = async ({ caseId }: { caseId: string }) => {
      const fixture = fixtures.find((f) => caseId.includes(f.id))!;
      return JSON.parse(readFileSync(join(dir, fixture.id + '.json'), 'utf8'))
        .storedReport;
    };
    const result = await runCalibration(dir, out, responder, guard());
    expect(result.halted).toBeNull();
    expect(result.calls).toHaveLength(12);
    expect(result.calls.filter((c) => c.gatePassed === false)).toHaveLength(8);
    expect(result.calls.every((c) => c.raw && c.status === 'ok')).toBe(true);
    await expect(runCalibration(dir, out, responder, guard())).rejects.toThrow(
      'already exists',
    );
  });

  it('preserves malformed output and stops without retry or fallback', async () => {
    const out = output();
    const result = await runCalibration(
      dir,
      out,
      async () => ({ unexpected: true }),
      guard(),
    );
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]!.raw).toEqual({ unexpected: true });
    expect(result.calls[0]!.status).toBe('error');
    expect(result.halted).not.toBeNull();
    expect(
      JSON.parse(readFileSync(join(out, 'results.json'), 'utf8')).calls[0].raw,
    ).toEqual({ unexpected: true });
  });

  it('halts on provider failure and a failed quota preflight without spending again', async () => {
    const failed = await runCalibration(
      dir,
      output(),
      async () => {
        throw new Error('provider unavailable');
      },
      guard(),
    );
    expect(failed.calls).toHaveLength(1);
    expect(failed.halted).toBe('provider unavailable');
    let calls = 0;
    const blocked = await runCalibration(
      dir,
      output(),
      async () => {
        calls++;
      },
      guard(20),
    );
    expect(blocked.calls).toHaveLength(0);
    expect(blocked.halted).toContain('minimum 30%');
    expect(calls).toBe(0);
  });
});
