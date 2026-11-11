import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  fictionPolicy,
  fictionV8Policy,
  type FictionPolicy,
} from '@future-flow/contracts';
import {
  fictionAuthorRequest,
  fictionEditorialRequest,
  fictionFidelityRequest,
  fictionPlannerRequest,
  fictionReviewRequest,
} from '@future-flow/core';
import { fictionPrompts } from '../packages/ai/src/fiction-prompts';
import { fictionFixture } from './fiction-fixtures';

// Phase 0 of the living-world plan: the v8 generation is frozen. These pins
// fail if a v9 change edits the v8 policy, prompt bytes or request shape
// (plan section 50, points 1-3). Baseline source: a666c905ef95.
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

const v8Prompts = {
  en: {
    planner: '414be922417f4045617223f8901970a284ca854ef2ed33e351d1d704bb848247',
    author: '17ada8231ddaffa79a7c168f64545f41f3b8c3dc39eb0b4f749e75f3fa27b100',
    review: 'd18b03632d9d9ff088e5ace1a00c4cd22e45148a3e89e89d8d118a756c0c90cf',
    fidelity:
      '0af915d7eceacd19283e6b0300e85cf014861fc57028a6f7395b0f6f651ee25b',
    editor: '7309abf8457bca4dca5bd106d202a720e538e5a65ef77f3888b376c26c97fc6d',
  },
  hu: {
    planner: '64848d27bc08ce5c9266dd56d8cf1b26c38b2c5bfcb6dec45e53b3ca75f9cf03',
    author: '81fc3166bfdb8d1fea307dd81463d2a4a4e70f4e67ad36651a5c7723f20d2930',
    review: '2fdeeb0c877a0daafd746c97490ecbe97ca81c68b94e461f0484f6a12d6eb535',
    fidelity:
      'a2b40d166e9bfd4be1194175a2d5970a95da019229f08ae429a44ef551c49ada',
    editor: '3a785d842f2aa1aa16f40f8fdb61e103afeca5e3ddc42a33f8c3d7f4c09caf80',
  },
};

function v8Fixture() {
  const base = fictionFixture().input;
  if (base.narrativeContext?.policy.mode !== 'narrative-fiction-v2')
    throw Error('Expected a fiction-mode fixture.');
  base.narrativeContext.policy = fictionV8Policy();
  return fictionFixture(base);
}

describe('v8 baseline freeze (plan phase 0)', () => {
  it('keeps the v8 policy tuple and makes it the default for new jobs', () => {
    const expected: FictionPolicy = {
      version: '2.0.0',
      mode: 'narrative-fiction-v2',
      promptVersions: {
        planner: 'life_fiction_plan.v8',
        writer: 'life_fiction_author.v8',
        planReviewer: 'life_fiction_plan_review.v8',
        fidelity: 'life_fiction_fidelity.v1',
        editor: 'life_fiction_editor.v7',
      },
      memoryVersion: '2.0.0',
      qualityPolicyVersion: '2.7.0',
      maxPhysicalRequests: 9,
      maxContentRepairs: 1,
      targetWords: { min: 650, max: 950 },
    };
    expect(fictionV8Policy()).toEqual(expected);
    // v9 (qualityPolicy 2.8.0) does not exist yet: nothing selects it.
    expect(fictionPolicy()).toEqual(expected);
  });

  it('keeps the v8 prompt bytes (SHA-256 per role, en and hu)', () => {
    for (const locale of ['en', 'hu'] as const) {
      const prompts = fictionPrompts(locale, fictionV8Policy().promptVersions);
      const hashes = Object.fromEntries(
        Object.entries(prompts).map(([role, text]) => [role, sha(text)]),
      );
      expect({ locale, hashes }).toEqual({
        locale,
        hashes: v8Prompts[locale],
      });
    }
  });

  it('keeps the v8 request envelope keys per stage', () => {
    const f = v8Fixture();
    const keys = (v: object) => Object.keys(v).sort();
    expect({
      planner: keys(fictionPlannerRequest(f.input)),
      author: keys(fictionAuthorRequest(f.input, f.draft)),
      review: keys(fictionReviewRequest(f.input, f.authored)),
      fidelity: keys(fictionFidelityRequest(f.input, f.authored)),
      editor: keys(fictionEditorialRequest(f.input, f.authored)),
    }).toEqual({
      planner: [
        'acceptedDecisionIds',
        'castingProjection',
        'durationMonths',
        'endDate',
        'input',
        'memory',
        'narrativeContext',
        'periodId',
        'referenceProjection',
        'repair',
        'revision',
        'startDate',
        'state',
      ],
      author: [
        'acceptedDecisionIds',
        'authorRepair',
        'castingProjection',
        'draft',
        'durationMonths',
        'endDate',
        'input',
        'memory',
        'narrativeContext',
        'periodId',
        'referenceProjection',
        'repair',
        'revision',
        'startDate',
        'state',
      ],
      review: [
        'acceptedDecisionIds',
        'castingProjection',
        'durationMonths',
        'endDate',
        'input',
        'memory',
        'narrativeContext',
        'periodId',
        'proposed',
        'referenceProjection',
        'revision',
        'startDate',
        'state',
      ],
      fidelity: [
        'acceptedDecisionIds',
        'castingProjection',
        'chapter',
        'durationMonths',
        'endDate',
        'input',
        'memory',
        'narrativeContext',
        'periodId',
        'proposed',
        'referenceProjection',
        'revision',
        'startDate',
        'state',
      ],
      editor: [
        'acceptedDecisionIds',
        'castingProjection',
        'chapter',
        'durationMonths',
        'endDate',
        'input',
        'memory',
        'narrativeContext',
        'paragraphs',
        'periodId',
        'proposed',
        'referenceProjection',
        'revision',
        'startDate',
        'state',
      ],
    });
  });
});
