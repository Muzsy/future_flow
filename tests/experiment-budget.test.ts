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
