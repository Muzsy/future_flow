import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, it, expect } from 'vitest';
import {
  EXPERIMENT_CREATIVE_MAX_REQUEST_BYTES,
  EXPERIMENT_DEFAULT_MAX_REQUEST_BYTES,
  EXPERIMENT_REQUEST_BYTE_BUFFER,
  ExperimentAiBudget,
  combineAiGuards,
} from '@future-flow/ai';
import { DomainError } from '@future-flow/core';
const tempDirs: string[] = [];
function path() {
  const dir = mkdtempSync(join(tmpdir(), 'alterward-experiment-'));
  tempDirs.push(dir);
  return resolve(dir, 'usage.json');
}
afterEach(() => {
  while (tempDirs.length)
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
});
function requestWithGuardedBytes(targetGuardedBytes: number) {
  const base = {
    model: 'gpt-6.1-sol',
    max_output_tokens: 12000,
    input: '',
  };
  const baseGuardedBytes =
    Buffer.byteLength(JSON.stringify(base), 'utf8') +
    EXPERIMENT_REQUEST_BYTE_BUFFER;
  return {
    ...base,
    input: 'a'.repeat(targetGuardedBytes - baseGuardedBytes),
  };
}
const request = {
  model: 'gpt-6.1-sol',
  max_output_tokens: 1000,
  input: 'Synthetic test data.',
};
describe('shared paid experiment ledger', () => {
  it('extends the cumulative ledger only under an explicit larger ceiling, without discarding prior calls', async () => {
    const ledger = path();
    const first = new ExperimentAiBudget(ledger, 5, 'original');
    const id = await first.reserve(request);
    await first.settle(id, { input_tokens: 100, output_tokens: 20 });
    first.close();
    const original = JSON.parse(readFileSync(ledger, 'utf8'));
    expect(() => new ExperimentAiBudget(ledger, 10, 'not-explicit')).toThrow();
    expect(
      () => new ExperimentAiBudget(ledger, 10.01, 'over-cap', undefined, 10),
    ).toThrow();
    const extended = new ExperimentAiBudget(
      ledger,
      10,
      'explicit-extension',
      undefined,
      10,
    );
    try {
      const next = await extended.reserve(request);
      await extended.settle(next, { input_tokens: 100, output_tokens: 20 });
      const saved = JSON.parse(readFileSync(ledger, 'utf8'));
      expect(saved.calls).toHaveLength(2);
      expect(saved.calls[0]).toEqual(original.calls[0]);
      expect(saved.accountedUsd).toBeCloseTo(original.accountedUsd * 2);
      expect(saved.budgetUsd).toBe(10);
    } finally {
      extended.close();
    }
  });
  it('keeps the default ceiling at five while honoring a separately explicit cumulative extension', async () => {
    const ledger = path();
    expect(
      () => new ExperimentAiBudget(ledger, 15.204535, 'no-authority'),
    ).toThrow();
    expect(
      () =>
        new ExperimentAiBudget(
          ledger,
          15.204536,
          'over-approved',
          undefined,
          15.204535,
        ),
    ).toThrow();
    const guard = new ExperimentAiBudget(
      ledger,
      15.204535,
      'owner-2026-10-17',
      undefined,
      15.204535,
    );
    try {
      const id = await guard.reserve(request);
      await guard.settle(id, { input_tokens: 100, output_tokens: 20 });
      expect(JSON.parse(readFileSync(ledger, 'utf8')).budgetUsd).toBe(
        15.204535,
      );
    } finally {
      guard.close();
    }
    for (const ceiling of [NaN, Infinity, -1, 0])
      expect(
        () => new ExperimentAiBudget(path(), 1, 'invalid', undefined, ceiling),
      ).toThrow();
  });
  it('excludes concurrent paid processes, retains unknown reservations and resumes the same allowance', async () => {
    const ledger = path(),
      guard = new ExperimentAiBudget(ledger, 0.03, 'test-only');
    try {
      expect(() => new ExperimentAiBudget(ledger, 0.03, 'parallel')).toThrow();
      const id = await guard.reserve(request);
      await guard.settle(id, null);
      await expect(guard.reserve(request)).rejects.toMatchObject({
        code: 'SMOKE_BUDGET_EXCEEDED',
      });
    } finally {
      guard.close();
    }
    const resumed = new ExperimentAiBudget(ledger, 0.03, 'test-only-resume');
    try {
      await expect(resumed.reserve(request)).rejects.toMatchObject({
        code: 'SMOKE_BUDGET_EXCEEDED',
      });
      expect(JSON.parse(readFileSync(ledger, 'utf8')).unknownUsageCalls).toBe(
        1,
      );
    } finally {
      resumed.close();
    }
  });
  it('settles known usage once and releases a request rejected before transport', async () => {
    const ledger = path(),
      guard = new ExperimentAiBudget(ledger, 0.03, 'test-only');
    try {
      const combined = combineAiGuards(guard, {
        reserve: async () => {
          throw new DomainError(
            'AI_BUDGET_EXCEEDED',
            'Database budget refused.',
          );
        },
        settle: async () => {},
      });
      await expect(combined.reserve(request)).rejects.toMatchObject({
        code: 'AI_BUDGET_EXCEEDED',
      });
      expect(JSON.parse(readFileSync(ledger, 'utf8')).accountedUsd).toBe(0);
      const id = await guard.reserve(request);
      await guard.settle(id, { input_tokens: 100, output_tokens: 20 });
      const cost = JSON.parse(readFileSync(ledger, 'utf8')).accountedUsd;
      await guard.settle(id, null);
      await guard.settle(id, { input_tokens: 100, output_tokens: 20 });
      expect(JSON.parse(readFileSync(ledger, 'utf8')).accountedUsd).toBe(cost);
    } finally {
      guard.close();
    }
  });
  it('keeps the generic request-byte ceiling at 100,000 while validating explicit reviewed extensions up to 196,608', async () => {
    expect(EXPERIMENT_REQUEST_BYTE_BUFFER).toBe(4096);
    expect(EXPERIMENT_DEFAULT_MAX_REQUEST_BYTES).toBe(100000);
    expect(EXPERIMENT_CREATIVE_MAX_REQUEST_BYTES).toBe(196608);

    for (const invalidBytes of [
      NaN,
      Infinity,
      -Infinity,
      -1,
      0,
      4096,
      99999,
      100000.5,
      196609,
    ]) {
      const candidatePath = path();
      expect(
        () =>
          new ExperimentAiBudget(
            candidatePath,
            5,
            'invalid-bytes',
            undefined,
            5,
            invalidBytes,
          ),
      ).toThrowError(
        expect.objectContaining({
          code: 'SMOKE_BUDGET_CONFIG',
        }),
      );
      expect(existsSync(resolve(dirname(candidatePath), 'paid-run.lock'))).toBe(
        false,
      );
    }

    const defaultLedger = path();
    const defaultGuard = new ExperimentAiBudget(
      defaultLedger,
      5,
      'default-cap',
    );
    try {
      const normalReq = requestWithGuardedBytes(86889);
      const repairReq = requestWithGuardedBytes(108751);
      const normalId = await defaultGuard.reserve(normalReq);
      await defaultGuard.settle(normalId, {
        input_tokens: 100,
        output_tokens: 50,
      });
      await expect(defaultGuard.reserve(repairReq)).rejects.toMatchObject({
        code: 'SMOKE_BUDGET_CONFIG',
      });
    } finally {
      defaultGuard.close();
    }

    const creativeLedger = path();
    const creativeGuard = new ExperimentAiBudget(
      creativeLedger,
      5,
      'creative-cap',
      undefined,
      5,
      EXPERIMENT_CREATIVE_MAX_REQUEST_BYTES,
    );
    try {
      const repairReq = requestWithGuardedBytes(108751);
      const id = await creativeGuard.reserve(repairReq);
      const saved = JSON.parse(readFileSync(creativeLedger, 'utf8'));
      expect(saved.calls[0].reservedUsd).toBeCloseTo(
        (108751 * 2.5 + 12000 * 10) / 1e6,
        8,
      );
      await creativeGuard.settle(id, {
        input_tokens: 1000,
        output_tokens: 500,
      });
      await expect(
        creativeGuard.reserve(requestWithGuardedBytes(196609)),
      ).rejects.toMatchObject({
        code: 'SMOKE_BUDGET_CONFIG',
      });
    } finally {
      creativeGuard.close();
    }
  });
});
