import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hash } from '@future-flow/core';
import { clientFor } from '../scripts/lib/narrative-evaluation-runner';
import { parseEvaluationOptions } from '../scripts/lib/narrative-evaluation-options';
import {
  readAttemptTrace,
  type AttemptTraceBinding,
} from '../scripts/lib/narrative-evaluation-attempts';
import {
  approvalCumulativeBudgetUsd,
  evaluationC5FlexApproval,
  verifyApprovalBudget,
} from '../scripts/lib/narrative-evaluation-approval';

afterEach(() => vi.unstubAllGlobals());

describe('isolated C5 Flex transport', () => {
  it.each(['flex', 'default'])(
    'sends only Flex and retains known usage when the server returns %s',
    async (returnedTier) => {
      const out = await mkdtemp(join(tmpdir(), 'aw-flex-http-'));
      const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        expect(body.model).toBe('gpt-6.1-sol');
        expect(body.service_tier).toBe('flex');
        expect(body.store).toBe(false);
        return new Response(
          JSON.stringify({
            id: 'resp_synthetic_flex',
            status: 'completed',
            model: body.model,
            service_tier: returnedTier,
            output: [
              {
                type: 'message',
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({ valid: true, issues: [] }),
                  },
                ],
              },
            ],
            usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'x-request-id': 'synthetic-flex-request',
            },
          },
        );
      });
      vi.stubGlobal('fetch', fetch);
      try {
        const options = parseEvaluationOptions([
          '--creative-only',
          '--fiction-generation',
          'v9',
          '--service-tier',
          'flex',
          '--fixtures',
          'career-transition',
          '--periods',
          '3',
          '--no-forks',
          '--out',
          out,
        ]);
        const binding: AttemptTraceBinding = {
          caseId: 'career-transition:narrative-v1:0',
          sourceCommit: '1'.repeat(40),
          sourceHash: hash('source'),
          manifestBinding: hash('flex'),
          mock: false,
          models: options.models,
          projectHash: hash('proj_synthetic'),
        };
        const client = clientFor(
          { ...options, kind: 'paid' },
          {
            NARRATIVE_EVAL_API_KEY: 'sk-proj-synthetic-test-only-123456789',
            NARRATIVE_EVAL_PROJECT_ID: 'proj_synthetic',
          },
          undefined,
          binding.caseId,
          [],
          binding,
        );
        const result = await client.responses.parse(
          {
            model: 'gpt-6.1-sol',
            store: false,
            input: [
              { role: 'system', content: 'Synthetic fidelity check.' },
              { role: 'user', content: '{}' },
            ],
            text: {
              format: {
                type: 'json_schema',
                name: 'life_fidelity',
                strict: true,
                schema: { type: 'object' },
              },
            },
          },
          { timeout: 300000 },
        );
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(result.usage?.output_tokens).toBe(8);
        expect(result.status).toBe(
          returnedTier === 'flex' ? 'completed' : 'failed',
        );
        const attempt = readAttemptTrace(out, binding)!.attempts[0]!;
        expect(attempt.returnedServiceTier).toBe(returnedTier);
        expect(attempt.usage?.inputTokens).toBe(12);
        if (returnedTier !== 'flex') expect(result.output_parsed).toBeNull();
      } finally {
        await rm(out, { recursive: true, force: true });
      }
    },
  );

  it('shares one USD 7 allowance across both outputs without resetting prior spend', () => {
    const id = evaluationC5FlexApproval.approvalId;
    const calls = [
      { caseName: 'closed-history', accountedUsd: 51.6490625 },
      { caseName: `narrative-evaluation:${id}`, accountedUsd: 1.2 },
      { caseName: `narrative-evaluation:${id}`, accountedUsd: 2.4 },
    ];
    expect(evaluationC5FlexApproval.maxSpendUsd).toBe(7);
    expect(approvalCumulativeBudgetUsd(calls, id, 7)).toBeCloseTo(58.6490625);
    expect(() =>
      verifyApprovalBudget(calls, 58.6490625, evaluationC5FlexApproval),
    ).not.toThrow();
    expect(() =>
      verifyApprovalBudget(calls, 58.65, evaluationC5FlexApproval),
    ).toThrow();
  });
});
