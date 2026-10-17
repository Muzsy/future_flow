import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { ExperimentAiBudget, combineAiGuards } from '@future-flow/ai';
import { DomainError } from '@future-flow/core';
function path() {
  mkdirSync('.local/tests', { recursive: true });
  return resolve(
    mkdtempSync(resolve('.local/tests/experiment-')),
    'usage.json',
  );
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
});
