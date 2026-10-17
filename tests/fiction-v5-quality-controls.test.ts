import { describe, it, expect } from 'vitest';
import {
  fictionPolicy,
  fictionV1Policy,
  fictionV2Policy,
  fictionV3Policy,
  fictionV4Policy,
  fictionPolicySchema,
  fictionHumanEditorialSchema,
} from '@future-flow/contracts';
import {
  evaluateFictionEditorialGate,
  fictionProseRepairAllowed,
  validateFictionEditorialReport,
} from '@future-flow/core';
import { fictionFixture } from './fiction-fixtures';

function fixture() {
  const input = fictionFixture().input;
  if (input.narrativeContext?.policy.mode !== 'narrative-fiction-v2')
    throw Error();
  input.narrativeContext.policy = fictionPolicy();
  const f = fictionFixture(input);
  return { ...f, editor: fictionHumanEditorialSchema.parse(f.editor) };
}

// These labelled synthetic reports exercise server gate/repair contracts.
// They do NOT claim that a live model recognizes the described literary defect.
describe('v5 policy and labelled literary gate controls', () => {
  it('accepts all five frozen policy tuples and rejects every cross-version editor pairing', () => {
    const policies = [
      fictionV1Policy(),
      fictionV2Policy(),
      fictionV3Policy(),
      fictionV4Policy(),
      fictionPolicy(),
    ];
    for (const p of policies) {
      expect(fictionPolicySchema.parse(p)).toEqual(p);
      for (const other of policies.filter(
        (o) => o.promptVersions.editor !== p.promptVersions.editor,
      ))
        expect(
          fictionPolicySchema.safeParse({
            ...p,
            promptVersions: {
              ...p.promptVersions,
              editor: other.promptVersions.editor,
            },
          }).success,
        ).toBe(false);
    }
    expect(fictionV4Policy().qualityPolicyVersion).toBe('2.2.0');
    expect(fictionPolicy()).toMatchObject({
      qualityPolicyVersion: '2.3.0',
      maxPhysicalRequests: 9,
      maxContentRepairs: 1,
    });
  });
  it.each([
    [
      'distinctDramaticStructure',
      'canon',
      'The magazine offer, booklet invitation and renamed exhibition invitation all advance through the same outside-validation mechanism.',
    ],
    [
      'behavioralVariety',
      'canon',
      'Across the earlier draft reply, deleted explanation and present withheld defence, discomfort resolves through the same immediate wise self-correction.',
    ],
    [
      'distinctRhetoricalShape',
      'prose',
      'The current almost-explain-then-stop phrasing repeats the earlier deleted-message rhythm without changing the final story events.',
    ],
  ] as const)(
    'blocks labelled %s recurrence regardless of otherwise strong scores',
    (flag, scope, explanation) => {
      const f = fixture();
      f.editor.sequenceReview[flag] = false;
      f.editor.issues = [
        {
          dimension: 'novelty',
          severity: 'major',
          repairScope: scope,
          paragraphIndex: 1,
          eventIds: [],
          explanation,
          suggestedFix:
            'Rewrite the repeated feature with an earned different causal role while retaining every accepted choice and hard boundary.',
        },
      ];
      expect(evaluateFictionEditorialGate(f.input, f.editor).passed).toBe(
        false,
      );
      expect(fictionProseRepairAllowed(f.editor)).toBe(scope === 'prose');
      expect(fictionHumanEditorialSchema.safeParse(f.editor).success).toBe(
        true,
      );
    },
  );
  it.each([
    ['earned opportunity', 'external_opportunity', 'persist', 'unresolved'],
    [
      'carried misunderstanding',
      'misunderstanding',
      'misunderstand',
      'partial_resolution',
    ],
    [
      'quiet material progress',
      'material_experiment',
      'no_correction_arc',
      'experiment',
    ],
  ] as const)(
    'allows the positive labelled control %s without an enum rotation rule',
    (_label, engine, response, resolution) => {
      const f = fixture();
      f.editor.sequenceSignature.dramaticEngine = engine;
      f.editor.sequenceSignature.protagonistResponse = response;
      f.editor.sequenceSignature.resolutionMode = resolution;
      expect(() =>
        validateFictionEditorialReport(f.input, f.authored, f.editor),
      ).not.toThrow();
      expect(evaluateFictionEditorialGate(f.input, f.editor).passed).toBe(true);
    },
  );
});
