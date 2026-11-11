import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { hash } from '@future-flow/core';
import {
  wrapEvaluationParse,
  evaluationResponseOutput,
  readAttemptTrace,
  type AttemptTraceBinding,
  type AttemptTransportSummary,
} from '../scripts/lib/narrative-evaluation-attempts';

const binding: AttemptTraceBinding = {
  caseId: 'creative-portfolio:narrative-v1:0',
  sourceCommit: '1'.repeat(40),
  sourceHash: hash('source'),
  manifestBinding: hash('manifest'),
  mock: true,
  models: { event: 'gpt-6.1-sol', story: 'gpt-6.1-sol', check: 'gpt-6.1-sol' },
  projectHash: null,
};
function request(message?: string) {
  return {
    model: 'gpt-6.1-sol',
    input: [
      { role: 'system', content: 'Synthetic check only.' },
      {
        role: 'user',
        content: JSON.stringify({
          authorRepair: message ? { mode: 'prose_only', message } : null,
        }),
      },
    ],
    text: { format: { name: 'life_fidelity' } },
  };
}
function response(usage?: unknown) {
  return {
    status: 'completed',
    model: 'gpt-6.1-sol',
    output_parsed: { valid: true, issues: [] },
    usage,
  };
}
describe('evaluation attempt evidence edge cases', () => {
  it.each(['flex', 'default', null])(
    'keeps actual tier and known usage, refusing unexpected tier %s',
    async (tier) => {
      const outDir = mkdtempSync(join(tmpdir(), 'aw-flex-tier-'));
      try {
        const transports: AttemptTransportSummary[] = [];
        const parse = wrapEvaluationParse({
          outDir,
          binding,
          env: {},
          transports,
          saveTransports: async () => {},
          requestedServiceTier: 'flex',
          execute: async () => ({
            ...response({ input_tokens: 12, output_tokens: 8 }),
            service_tier: tier,
          }),
        });
        const result = await parse(request());
        expect(result.usage).toEqual({ input_tokens: 12, output_tokens: 8 });
        expect(result.status).toBe(tier === 'flex' ? 'completed' : 'failed');
        if (tier !== 'flex') expect(result.output_parsed).toBeNull();
        const record = readAttemptTrace(outDir, binding)!.attempts[0]!;
        expect(record.requestedServiceTier).toBe('flex');
        expect(record.returnedServiceTier).toBe(tier);
        expect(record.usage?.inputTokens).toBe(12);
        expect(record.errorCode).toBe(
          tier === 'flex' ? null : 'AI_SERVICE_TIER_MISMATCH',
        );
        expect(transports[0]?.returnedServiceTier).toBe(tier);
      } finally {
        rmSync(outDir, { recursive: true, force: true });
      }
    },
  );

  it('preserves the provider deadline through raw-response capture without changing request evidence', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'aw-deadline-'));
    try {
      const execute = vi.fn(async () =>
        response({ input_tokens: 12, output_tokens: 8 }),
      );
      const parse = wrapEvaluationParse({
        outDir,
        binding,
        env: {},
        transports: [],
        saveTransports: async () => {},
        execute,
      });
      const parameters = request();
      await parse(parameters, { timeout: 300000 });
      await parse(parameters, { timeout: 180000 });
      await parse(parameters);
      expect(execute.mock.calls).toEqual([
        [parameters, 0, { timeout: 300000 }],
        [parameters, 1, { timeout: 180000 }],
        [parameters, 2, undefined],
      ]);
      const trace = readAttemptTrace(outDir, binding)!;
      expect(new Set(trace.attempts.map((a) => a.requestHash)).size).toBe(1);
      expect(trace.attempts.every((a) => a.status === 'completed')).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('retains a complete but schema-invalid raw response and its known usage before provider validation', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'aw-malformed-'));
    try {
      const invalid = { valid: false, issues: 'not an issues array' };
      const raw = {
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: JSON.stringify(invalid) }],
          },
        ],
      };
      expect(evaluationResponseOutput(raw)).toEqual(invalid);
      const parse = wrapEvaluationParse({
        outDir,
        binding,
        env: {},
        transports: [],
        saveTransports: async () => {},
        execute: async () => ({
          ...response({ input_tokens: 12, output_tokens: 8 }),
          output_parsed: evaluationResponseOutput(raw),
        }),
      });
      await parse(request());
      const attempt = readAttemptTrace(outDir, binding)!.attempts[0]!;
      expect(attempt.status).toBe('malformed');
      expect(attempt.output).toEqual(invalid);
      expect(attempt.outputHash).toBe(hash(invalid));
      expect(attempt.usage!.inputTokens).toBe(12);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
  it('retains truncated JSON as incomplete evidence and never claims it is a parsed final result', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'aw-incomplete-'));
    try {
      const partial = '{"valid":';
      const raw = {
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: partial }],
          },
        ],
      };
      const parse = wrapEvaluationParse({
        outDir,
        binding,
        env: {},
        transports: [],
        saveTransports: async () => {},
        execute: async () => ({
          ...response({ input_tokens: 12, output_tokens: 8 }),
          status: 'incomplete',
          output_parsed: evaluationResponseOutput(raw),
        }),
      });
      await parse(request());
      const attempt = readAttemptTrace(outDir, binding)!.attempts[0]!;
      expect(attempt.status).toBe('incomplete');
      expect(attempt.output).toBe(partial);
      expect(attempt.outputHash).toBe(hash(partial));
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it.each([
    undefined,
    {},
    { input_tokens: -1, output_tokens: 2 },
    {
      input_tokens: 1,
      output_tokens: 2,
      input_tokens_details: { cached_tokens: 3 },
    },
  ])(
    'keeps missing or invalid usage unknown instead of inventing zero consumption: %j',
    async (usage) => {
      const outDir = mkdtempSync(join(tmpdir(), 'aw-unknown-'));
      try {
        const execute = vi.fn(async () => response(usage));
        const parse = wrapEvaluationParse({
          outDir,
          binding,
          env: {},
          transports: [],
          saveTransports: async () => {},
          execute,
        });
        await parse(request());
        const trace = readAttemptTrace(outDir, binding)!;
        expect(execute).toHaveBeenCalledTimes(1);
        expect(trace.attempts[0]!.usage).toBeNull();
        expect(trace.attempts[0]!.status).toBe('completed');
      } finally {
        rmSync(outDir, { recursive: true, force: true });
      }
    },
  );
  it('keeps genuine zero usage distinct from unknown usage and preserves complete long repair feedback', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'aw-feedback-'));
    try {
      const message = 'Repair evidence: ' + 'specific evidence; '.repeat(600);
      const parse = wrapEvaluationParse({
        outDir,
        binding,
        env: {},
        transports: [],
        saveTransports: async () => {},
        execute: async () => response({ input_tokens: 0, output_tokens: 0 }),
      });
      await parse(request(message));
      const attempt = readAttemptTrace(outDir, binding)!.attempts[0]!;
      expect(attempt.usage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
      });
      expect(attempt.repairFeedback!.message).toBe(message);
      expect(attempt.repairFeedback!.message.length).toBeGreaterThan(8000);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
  it('does not invent a second failed transport if saving the transport index fails after a known response', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'aw-persist-'));
    try {
      const transports: AttemptTransportSummary[] = [];
      const execute = vi.fn(async () =>
        response({ input_tokens: 10, output_tokens: 20 }),
      );
      const parse = wrapEvaluationParse({
        outDir,
        binding,
        env: {},
        transports,
        saveTransports: async () => {
          throw Error('Simulated disk failure');
        },
        execute,
      });
      await expect(parse(request())).rejects.toThrow('Simulated disk failure');
      expect(execute).toHaveBeenCalledTimes(1);
      expect(transports).toHaveLength(1);
      const attempts = readAttemptTrace(outDir, binding)!.attempts;
      expect(attempts).toHaveLength(1);
      expect(attempts[0]!.status).toBe('completed');
      expect(attempts[0]!.usage!.inputTokens).toBe(10);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
