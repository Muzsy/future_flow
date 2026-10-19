import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import type OpenAIClient from 'openai';
import {
  OpenAiProvider,
  narrativePrompts,
  narrativePlanReviewRequest,
  narrativePlanReviewPrompt,
} from '@future-flow/ai';
import {
  narrativeV1Policy,
  narrativeV1PolicySchema,
  reviewedNarrativePolicy,
  readyNarrativePolicy,
  narrativePlanReviewV2Schema,
  narrativeArtifactSchema,
} from '@future-flow/contracts';
import {
  hash,
  DomainError,
  evaluateNarrativePlanReview,
  validateNarrativePlanReview,
} from '@future-flow/core';
import {
  narrativePlanFixture,
  narrativePlanReviewFixture,
  narrativePlanReadinessFixture,
  narrativeArtifactFixture,
} from './narrative-plan-fixtures';
function fixture() {
  const f = narrativePlanFixture();
  return {
    ...f,
    input: {
      ...f.input,
      narrativeContext: { policy: reviewedNarrativePolicy(), memory: f.memory },
    },
  };
}
function provider() {
  const parse = vi.fn().mockResolvedValue({
    status: 'completed',
    model: 'critic-model',
    output_parsed: narrativePlanReviewFixture(),
    usage: { input_tokens: 10, output_tokens: 20 },
  });
  const guard = {
    reserve: vi.fn().mockResolvedValue(randomUUID()),
    settle: vi.fn().mockResolvedValue(undefined),
  };
  const ai = new OpenAiProvider(
    {
      apiKey: 'offline-only',
      eventModel: 'planner-model',
      storyModel: 'writer-model',
      checkModel: 'critic-model',
      timeoutMs: 1000,
      maxOutputTokens: 6500,
      guard,
    },
    { responses: { parse } } as unknown as OpenAIClient,
  );
  return { ai, parse, guard };
}
describe('frozen story-plan review contract and guarded provider', () => {
  it('preserves old ceilings and permits eight only with the explicit review stage', () => {
    expect(narrativeV1Policy().maxPhysicalRequests).toBe(7);
    expect(
      narrativeV1PolicySchema.parse(reviewedNarrativePolicy())
        .maxPhysicalRequests,
    ).toBe(8);
    expect(
      narrativeV1PolicySchema.safeParse({
        ...narrativeV1Policy(),
        maxPhysicalRequests: 8,
      }).success,
    ).toBe(false);
    expect(
      narrativeV1PolicySchema.safeParse({
        ...reviewedNarrativePolicy(),
        maxPhysicalRequests: 7,
      }).success,
    ).toBe(false);
  });
  it('keeps the complete queued planner3/writer2 prompts byte-stable while enabling writer3 explicitly', () => {
    const frozen = {
      en: '8fbd6c848ffc043886271001df9c3614d7975f9563f26c7c7b8b3e822cd36866',
      hu: '53a6f7973c10e984c44b0b7a164a649734d52c716836037249d8442dbf902035',
    };
    for (const locale of ['en', 'hu'] as const) {
      const old = narrativePrompts(locale, narrativeV1Policy().promptVersions),
        current = narrativePrompts(
          locale,
          reviewedNarrativePolicy().promptVersions,
        );
      expect(hash(old)).toBe(frozen[locale]);
      expect(current.planner).toBe(old.planner);
      expect(current.writer).not.toBe(old.writer);
      expect(current.editor).toBe(old.editor);
      expect(current.fidelity).toBe(old.fidelity);
    }
  });
  it('computes review acceptance from all four scores and issue severities, not the verdict', () => {
    const report = narrativePlanReviewFixture();
    expect(evaluateNarrativePlanReview(report).passed).toBe(true);
    for (const dimension of [
      'causality',
      'agency',
      'novelty',
      'choiceStakes',
    ] as const)
      expect(
        evaluateNarrativePlanReview({
          ...report,
          scores: { ...report.scores, [dimension]: 3 },
        }).passed,
      ).toBe(false);
    expect(
      evaluateNarrativePlanReview({
        ...report,
        issues: [
          {
            dimension: 'novelty',
            severity: 'major',
            eventIds: [],
            explanation:
              'The final dilemma repeats the preceding period despite the new venue.',
            suggestedFix:
              'Create a distinct consequence before offering another prospective decision.',
          },
        ],
      }).passed,
    ).toBe(false);
  });
  it('rejects foreign issue event references and an unsolicited review on an old artifact', () => {
    const f = fixture();
    expect(() =>
      validateNarrativePlanReview(
        {
          ...narrativePlanReviewFixture(),
          issues: [
            {
              dimension: 'novelty',
              severity: 'minor',
              eventIds: [randomUUID()],
              explanation:
                'This finding points to a foreign event outside the current proposed period.',
              suggestedFix:
                'Use current proposed event IDs only; do not borrow another branch’s references.',
            },
          ],
        },
        f.result,
      ),
    ).toThrow('Unknown');
    expect(
      narrativeArtifactSchema.safeParse({
        ...narrativeArtifactFixture(),
        planningReview: narrativePlanReviewFixture(),
      }).success,
    ).toBe(false);
  });
  it('projects only permitted input and exact proposed material, excluding repair bias and withheld prose', () => {
    const f = fixture();
    f.memory.withheld = true;
    f.input.memory.recentEvents = [
      {
        id: randomUUID(),
        title: 'PRIVATE_MARKER',
        summary: 'PRIVATE_MARKER',
        effectiveAt: f.input.startDate,
      },
    ];
    Object.assign(f.input, {
      narrativeReferences: { private: 'SERVER_MARKER' },
      editorialSelfScore: 5,
    });
    const request = narrativePlanReviewRequest(f.input, f.result);
    expect(request.proposed).toEqual(f.result);
    expect(request).not.toHaveProperty('repair');
    expect(JSON.stringify(request)).not.toContain('PRIVATE_MARKER');
    expect(JSON.stringify(request)).not.toContain('SERVER_MARKER');
    expect(request).not.toHaveProperty('editorialSelfScore');
  });
  it.each(['en', 'hu'] as const)(
    'routes %s review through the checker guard with exact input and output receipts',
    async (locale) => {
      const f = fixture(),
        p = provider();
      f.input.input.locale = locale;
      const response = await p.ai.reviewNarrativePlan(f.input, f.result);
      expect(p.parse.mock.calls[0]![0]).toMatchObject({
        model: 'critic-model',
        store: false,
        text: { format: { name: 'life_narrative_plan_review', strict: true } },
      });
      expect(response.receipt).toMatchObject({
        task: 'life_narrative_plan_review',
        promptVersion: `life_narrative_plan_review.v1.${locale}`,
        inputHash: hash(narrativePlanReviewRequest(f.input, f.result)),
        outputHash: hash(narrativePlanReviewFixture()),
      });
      expect(p.guard.reserve).toHaveBeenCalledTimes(1);
      expect(p.guard.settle).toHaveBeenCalledTimes(1);
    },
  );
  it('denies review without policy authorization or budget before transport', async () => {
    const f = fixture(),
      p = provider();
    expect(() =>
      p.ai.reviewNarrativePlan(
        {
          ...f.input,
          narrativeContext: { policy: narrativeV1Policy(), memory: f.memory },
        },
        f.result,
      ),
    ).toThrow();
    expect(p.guard.reserve).not.toHaveBeenCalled();
    p.guard.reserve.mockRejectedValueOnce(
      new DomainError('AI_BUDGET_EXCEEDED', 'No funded request.'),
    );
    await expect(
      p.ai.reviewNarrativePlan(f.input, f.result),
    ).rejects.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
    expect(p.parse).not.toHaveBeenCalled();
  });
});

describe('explicit readiness gate for newly selected plans', () => {
  it('keeps queued reviewer-v1 and planner3/writer3 prompt bytes frozen', () => {
    const expected = {
      en: [
        '83618f212b744eb27741a4a88d903cc1efcd7f92051ac1788fbfaba974793c2f',
        '0dd2c99fc3cffe8afd41a8e6327a82f07e8d110ced5956d147504284eb7b1fec',
      ],
      hu: [
        '73e7ee60066d60cfa566f00ea5a232aa84a6f5dc4ba5ce5d7a1946c1d65ae900',
        '0e20b5ba3e6a356e2d00045f6ff2267d2237931df2cbfe202098bf0ea884c5ca',
      ],
    };
    for (const locale of ['en', 'hu'] as const) {
      expect(hash(narrativePlanReviewPrompt(locale))).toBe(expected[locale][0]);
      expect(
        hash(
          narrativePrompts(locale, reviewedNarrativePolicy().promptVersions),
        ),
      ).toBe(expected[locale][1]);
    }
  });

  it.each([
    'summariesComplete',
    'decisionPatternComplete',
    'periodDevelopmentSufficient',
  ] as const)(
    'blocks %s=false even with high scores, a minor finding and verdict pass',
    (flag) => {
      const report = narrativePlanReadinessFixture();
      report.readiness[flag] = false;
      const diagnostic = {
        ...report,
        issues: [
          {
            dimension: 'causality',
            severity: 'minor',
            eventIds: [],
            explanation:
              'The proposed material leaves an important statement or consequence unfinished.',
            suggestedFix:
              'Complete the recorded action and outcome before commissioning prose for this plan.',
          },
        ],
      };
      expect(evaluateNarrativePlanReview(diagnostic).passed).toBe(false);
      expect(
        evaluateNarrativePlanReview({ ...report, issues: [] }).passed,
      ).toBe(false);
    },
  );
  it('requires every readiness field and the exact review version for the frozen policy', () => {
    const f = fixture(),
      v2 = readyNarrativePolicy().promptVersions.planReviewer;
    expect(
      evaluateNarrativePlanReview(narrativePlanReadinessFixture()).passed,
    ).toBe(true);
    expect(() =>
      validateNarrativePlanReview(narrativePlanReviewFixture(), f.result, v2),
    ).toThrow('version');
    expect(() =>
      validateNarrativePlanReview(
        narrativePlanReadinessFixture(),
        f.result,
        'life_narrative_plan_review.v1',
      ),
    ).toThrow('version');
    expect(
      narrativePlanReviewV2Schema.safeParse({
        ...narrativePlanReadinessFixture(),
        readiness: { summariesComplete: true },
      }).success,
    ).toBe(false);
    expect(
      narrativeV1PolicySchema.safeParse({
        ...readyNarrativePolicy(),
        promptVersions: {
          ...readyNarrativePolicy().promptVersions,
          planReviewer: 'life_narrative_plan_review.v1',
        },
      }).success,
    ).toBe(false);
  });
  it('versions plan/review changes while keeping writer3 and every old prompt unchanged', () => {
    for (const locale of ['en', 'hu'] as const) {
      const old = narrativePrompts(
        locale,
        reviewedNarrativePolicy().promptVersions,
      );
      const next = narrativePrompts(
        locale,
        readyNarrativePolicy().promptVersions,
      );
      expect(next.writer).toBe(old.writer);
      expect(next.fidelity).toBe(old.fidelity);
      expect(next.editor).toBe(old.editor);
      expect(next.planner).toContain(old.planner);
      expect(next.planner).toContain('COMPLETE MATERIAL');
      expect(
        narrativePlanReviewPrompt(locale, 'life_narrative_plan_review.v2'),
      ).toContain(
        narrativePlanReviewPrompt(locale).replace(
          'Return version 1.0.0,',
          'Return version 1.1.0,',
        ),
      );
      expect(narrativePlanReviewPrompt(locale)).not.toContain(
        'READINESS CONTRACT',
      );
    }
    expect(readyNarrativePolicy().maxPhysicalRequests).toBe(8);
    expect(readyNarrativePolicy().maxContentRepairs).toBe(1);
  });
  it('sends a single strict v2 object schema, not a storage union, to the provider', async () => {
    const f = fixture(),
      p = provider();
    f.input.narrativeContext.policy = readyNarrativePolicy();
    p.parse.mockResolvedValue({
      status: 'completed',
      model: 'critic-model',
      output_parsed: narrativePlanReadinessFixture(),
      usage: { input_tokens: 10, output_tokens: 20 },
    });
    const result = await p.ai.reviewNarrativePlan(f.input, f.result);
    const request = p.parse.mock.calls[0]![0];
    expect(request.text.format.schema.type).toBe('object');
    expect(request.text.format.schema).not.toHaveProperty('anyOf');
    expect(request.text.format.schema.required).toContain('readiness');
    expect(result.receipt.promptVersion).toBe(
      'life_narrative_plan_review.v2.en',
    );
    expect(result.output).toEqual(narrativePlanReadinessFixture());
    expect(p.guard.reserve).toHaveBeenCalledTimes(1);
  });
});
