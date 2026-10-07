import { describe, expect, it } from 'vitest';
import { scenarioTemplateSchema } from '@future-flow/contracts';
import { hash } from '@future-flow/core';
import {
  approvedCatalogPlan,
  catalogTemplates,
  catalogTopics,
  catalogVariants,
  assertCatalogExecutionMatches,
  catalogSourceEditorialSchema,
  catalogLifeEditorialSchema,
  catalogCorrectedCopy,
  catalogCorrectedCheckpoint,
  validateCatalogAuditDisposition,
} from '../scripts/lib/closed-beta-catalog';

const approval = () => ({
  totalUsd: 10,
  providerCaps: { openai: 8, anthropic: 2 },
  catalog: {
    officialLives: 15,
    scenarios: 5,
    periodsPerLife: 3,
    locale: 'en',
    claudeAuditEveryLife: true,
  },
  beta: { maximumUsers: 10 },
  allocation: {
    seed: { openaiUsd: 6, claudeUsd: 1 },
    betaUsage: { openaiUsd: 2, claudeUsd: 1 },
  },
  fullCatalogDeferredUntilAfterClosedBeta: true,
  fullPublicLaunchSeparate: true,
  automaticRenewal: false,
});

describe('approved closed-beta catalog preparation', () => {
  it('requires a separate, complete and exact editorial disposition rather than treating a model verdict as an automatic grant', () => {
    const audit = {
      issues: [
        {
          periodNo: 1,
          category: 'canon',
          severity: 'major',
          excerpt: 'A synthetic excerpt',
          reason: 'A synthetic assertion to review',
        },
      ],
    };
    const source = {
      contentHash: 'a'.repeat(64),
      audit,
      periods: [
        { synthetic: true, createdAt: new Date('2026-10-07T12:00:00Z') },
      ],
    };
    const record = {
      at: '2026-10-07T12:00:00.000Z',
      actor: 'Delegated complete-copy editor',
      contentHash: source.contentHash,
      auditHash: hash(audit),
      sourcePeriodsHash: hash(JSON.parse(JSON.stringify(source.periods))),
      completeCopyAndCanonRead: true,
      noUnresolvedFactOrLanguageFault: true,
      findings: [
        {
          issueHash: hash(audit.issues[0]),
          disposition: 'false_positive',
          evidence:
            'Read the complete synthetic copy and all canonical events. Exact arithmetic and dated events demonstrate why this one assertion is unsupported; no executable fact or original audit was changed.',
        },
      ],
    };
    expect(
      validateCatalogAuditDisposition(record, source).findings,
    ).toHaveLength(1);
    for (const changed of [
      { ...record, auditHash: '0'.repeat(64) },
      { ...record, contentHash: '0'.repeat(64) },
      { ...record, sourcePeriodsHash: '0'.repeat(64) },
      { ...record, completeCopyAndCanonRead: 'true' },
      { ...record, noUnresolvedFactOrLanguageFault: false },
      { ...record, findings: [] },
      { ...record, findings: [record.findings[0], record.findings[0]] },
      {
        ...record,
        findings: [{ ...record.findings[0], issueHash: '0'.repeat(64) }],
      },
      {
        ...record,
        findings: [{ ...record.findings[0], evidence: 'Approved' }],
      },
    ])
      expect(() => validateCatalogAuditDisposition(changed, source)).toThrow();
    expect(() =>
      validateCatalogAuditDisposition(record, {
        ...source,
        audit: {
          issues: [
            ...audit.issues,
            { periodNo: 2, reason: 'Not individually covered' },
          ],
        },
      }),
    ).toThrow();
  });
  it('clarifies only an exact dated checkpoint note and refuses stale facts or injected executable edits', () => {
    const template = catalogTemplates().buffer;
    const { title: _title, summary: _summary, ...base } = template;
    const checkpoint = {
      ...base,
      schemaVersion: 'fork-checkpoint-1' as const,
      requiresFullReview: true as const,
      readyForPublicFork: false as const,
      referenceCatalog: {
        assetKeys: [],
        actorKeys: ['actor-1'],
        opportunityKeys: ['opportunity-1'],
      },
      constraints: template.constraints.map((c) => ({
        ...c,
        endsOnDecisionKey: null,
      })),
      decision: {
        key: 'decision-1',
        prompt: 'Choose a bounded next step.',
        options: [
          {
            key: 'option-1',
            label: 'Continue',
            description: 'Keep the current effort bounded.',
            preconditions: [],
            changes: [],
          },
          {
            key: 'option-2',
            label: 'Rest',
            description: 'Consider a more restful pace.',
            preconditions: [],
            changes: [],
          },
        ],
      },
    };
    const source = {
      branchId: '10000000-0000-4000-8000-000000000001',
      sourceRevision: 3,
    };
    const correction = {
      decisionKey: 'decision-1',
      originalCheckpointHash: hash(checkpoint),
      goalKey: 'goal-1',
      originalNote: checkpoint.goals[0]!.note,
      replacementNote:
        'At the earlier decision, additional work was still unconfirmed.',
    };
    const record = {
      ...source,
      sourceCanonUnchanged: true,
      note: 'Clarify the historical date without changing progress, finances, options or any executable effect.',
      corrections: [correction],
    };
    const corrected = catalogCorrectedCheckpoint(record, source, checkpoint);
    expect(corrected.goals[0]!.note).toBe(correction.replacementNote);
    const restored = structuredClone(corrected);
    restored.goals[0]!.note = checkpoint.goals[0]!.note;
    expect(restored).toEqual(checkpoint);
    expect(checkpoint.goals[0]!.note).toBe(template.goals[0]!.note);
    for (const change of [
      { ...record, sourceRevision: 2 },
      { ...record, sourceCanonUnchanged: false },
      {
        ...record,
        corrections: [
          { ...correction, originalCheckpointHash: '0'.repeat(64) },
        ],
      },
      {
        ...record,
        corrections: [{ ...correction, originalNote: 'Wrong previous note' }],
      },
      { ...record, corrections: [{ ...correction, status: 'achieved' }] },
      { ...record, corrections: [correction, correction] },
    ])
      expect(() =>
        catalogCorrectedCheckpoint(change, source, checkpoint),
      ).toThrow();
  });
  it('binds an editorial copy to its exact immutable source without accepting a stale or foreign correction', () => {
    const copy = {
      title: 'A fictional first step',
      summary: 'A synthetic English copy for a binding test.',
      category: 'education',
      goalDescription: 'Try a manageable learning project.',
      periods: [
        {
          chapter: {
            title: 'One bounded attempt',
            body: 'A small fictional learning attempt remains unfinished. '
              .repeat(12)
              .trim(),
          },
          events: [
            {
              title: 'Start the attempt',
              summary:
                'A modest learning attempt begins with no promise of success.',
            },
            {
              title: 'Consider the next step',
              summary:
                'The next step remains undecided at the end of the period.',
            },
          ],
          decision: {
            prompt: 'Which step should come next?',
            options: [
              {
                label: 'Keep practicing',
                description: 'Continue the existing attempt.',
              },
              {
                label: 'Try a course',
                description: 'Choose a structured introduction.',
              },
            ],
          },
        },
      ],
    };
    const source = {
      branchId: '10000000-0000-4000-8000-000000000001',
      sourceRevision: 3,
      copy,
    };
    const edited = structuredClone(copy);
    edited.periods[0]!.chapter.title = 'A clearer chapter title';
    const record = {
      branchId: source.branchId,
      sourceRevision: 3,
      originalCopyHash: hash(copy),
      copy: edited,
      sourceCanonUnchanged: true,
      note: 'Clarify the title only; preserve the original canon and all original generated chapters.',
    };
    expect(catalogCorrectedCopy(record, source)).toEqual(edited);
    expect(source.copy.periods[0]!.chapter.title).toBe('One bounded attempt');
    for (const changed of [
      { ...record, sourceRevision: 2 },
      { ...record, originalCopyHash: '0'.repeat(64) },
      { ...record, branchId: '10000000-0000-4000-8000-000000000002' },
      { ...record, sourceCanonUnchanged: false },
    ])
      expect(() => catalogCorrectedCopy(changed, source)).toThrow();
    expect(() =>
      catalogCorrectedCopy(
        { ...record, copy: { ...edited, publicationApproved: true } },
        source,
      ),
    ).toThrow();
  });
  it('requires actual affirmative editorial decisions and separate exact source/life bindings', () => {
    const base = {
      at: '2026-10-07T12:00:00.000Z',
      actor: 'Delegated editor',
      reviewId: '10000000-0000-4000-8000-000000000001',
      privacyChecked: true,
      contentChecked: true,
      qualityChecked: true,
      fictionalSourceChecked: true,
      rightsChecked: true,
      note: 'Read the full source and exact report, including all canonical consequences.',
    };
    const source = {
      ...base,
      templateHash: 'a'.repeat(64),
      reportHash: 'b'.repeat(64),
      meaningChecked: true,
    };
    const life = {
      ...base,
      contentHash: 'a'.repeat(64),
      reviewHash: 'b'.repeat(64),
      auditHash: 'c'.repeat(64),
      consistencyChecked: true,
    };
    expect(catalogSourceEditorialSchema.parse(source).qualityChecked).toBe(
      true,
    );
    expect(catalogLifeEditorialSchema.parse(life).qualityChecked).toBe(true);
    for (const value of [false, 'true', 'false', 1, null]) {
      expect(() =>
        catalogSourceEditorialSchema.parse({
          ...source,
          qualityChecked: value,
        }),
      ).toThrow();
      expect(() =>
        catalogLifeEditorialSchema.parse({ ...life, rightsChecked: value }),
      ).toThrow();
    }
    expect(() => catalogLifeEditorialSchema.parse(source)).toThrow();
    expect(() => catalogSourceEditorialSchema.parse(life)).toThrow();
  });
  it('refuses to renew, reset or redirect the recorded seed execution window', () => {
    const window = {
      startsAt: '2026-10-07T12:00:00.000Z',
      endsAt: '2026-10-14T12:00:00.000Z',
    };
    const state = {
      runId: '10000000-0000-4000-8000-000000000001',
      planHash: 'a'.repeat(64),
      window,
    };
    const record = {
      ...state,
      seedCaps: { openaiUsd: 6, claudeUsd: 1 },
      betaReserve: { openaiUsd: 2, claudeUsd: 1 },
    };
    expect(assertCatalogExecutionMatches(record, state).window).toEqual(window);
    expect(() =>
      assertCatalogExecutionMatches(record, {
        ...state,
        window: {
          startsAt: '2026-10-08T12:00:00.000Z',
          endsAt: '2026-10-15T12:00:00.000Z',
        },
      }),
    ).toThrow();
    expect(() =>
      assertCatalogExecutionMatches(record, {
        ...state,
        runId: '10000000-0000-4000-8000-000000000002',
      }),
    ).toThrow();
    expect(() =>
      assertCatalogExecutionMatches(
        { ...record, seedCaps: { openaiUsd: 8, claudeUsd: 2 } },
        state,
      ),
    ).toThrow();
    expect(() =>
      assertCatalogExecutionMatches(
        {
          ...record,
          window: { ...window, endsAt: '2026-10-15T12:00:00.000Z' },
        },
        state,
      ),
    ).toThrow();
  });
  it('rejects superseded allowances and any transfer out of the beta reserve', () => {
    for (const changed of [
      { ...approval(), totalUsd: 15 },
      { ...approval(), providerCaps: { openai: 10, anthropic: 5 } },
      {
        ...approval(),
        allocation: {
          seed: { openaiUsd: 7, claudeUsd: 1 },
          betaUsage: { openaiUsd: 1, claudeUsd: 1 },
        },
      },
      {
        ...approval(),
        catalog: { ...approval().catalog, claudeAuditEveryLife: false },
      },
      { ...approval(), beta: { maximumUsers: 11 } },
      { ...approval(), automaticRenewal: true },
    ])
      expect(() => approvedCatalogPlan(changed)).toThrow();
  });
  it('prepares five complete English fictional sources without invented source authority', () => {
    const sources = catalogTemplates();
    expect(Object.keys(sources)).toEqual([...catalogTopics]);
    expect(new Set(Object.values(sources).map((s) => s.title)).size).toBe(5);
    for (const source of Object.values(sources)) {
      expect(scenarioTemplateSchema.parse(source).contentLocale).toBe('en');
      expect(source.goals.filter((g) => g.priority === 'primary')).toHaveLength(
        1,
      );
      expect(source.startingState.ownedAssets).toEqual([]);
      expect(
        source.startingState.opportunities.every((o) => o.status === 'open'),
      ).toBe(true);
      expect(source.goals.every((g) => g.status === 'active')).toBe(true);
      expect(JSON.stringify(source)).not.toMatch(
        /[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/i,
      );
    }
    expect(
      new Set(Object.values(catalogVariants).map((v) => JSON.stringify(v)))
        .size,
    ).toBe(3);
    expect(catalogTopics.length * Object.keys(catalogVariants).length).toBe(15);
  });
  it('binds the accepted allocation and source plan independently of execution history', () => {
    const first = approvedCatalogPlan(approval());
    expect(
      approvedCatalogPlan({ ...approval(), paidCallsAfterApproval: 99 })
        .planHash,
    ).toBe(first.planHash);
    expect(first.planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      first.approval.allocation.seed.openaiUsd +
        first.approval.allocation.seed.claudeUsd,
    ).toBe(7);
    expect(
      first.approval.allocation.betaUsage.openaiUsd +
        first.approval.allocation.betaUsage.claudeUsd,
    ).toBe(3);
  });
});
