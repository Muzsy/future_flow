import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import type OpenAIClient from 'openai';
import {
  fictionPolicy,
  fictionPolicySchema,
  fictionV5Policy,
  fictionV6Policy,
  fictionV6Quality25Policy,
  fictionV7Policy,
  fictionContextSchema,
  fictionEditorialReportSchema,
  fictionHumanEditorialSchema,
  fictionHumanEditorialV13Schema,
  fictionSequenceSignatureSchema,
  fictionSequenceSignatureV11Schema,
  lifeSetupV2Schema,
  type FictionPolicy,
} from '@future-flow/contracts';
import {
  evaluateFictionEditorialGate,
  validateFictionEditorialReport,
} from '@future-flow/core';
import { OpenAiProvider } from '@future-flow/ai';
import { fictionPrompts } from '../packages/ai/src/fiction-prompts';
import { fictionFixture, fictionSignatureFixture } from './fiction-fixtures';
import { narrativeProfiles, narrativeSetup } from './narrative-fixtures';

const v6Versions = fictionV6Quality25Policy().promptVersions;
const v7Versions = fictionV7Policy().promptVersions;
const actorLimit = 'at most one new recurring actor_add per period';

function sha(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
function hashesOf(versions: FictionPolicy['promptVersions']) {
  return Object.fromEntries(
    Object.entries(fictionPrompts('en', versions)).map(([k, v]) => [k, sha(v)]),
  );
}
function fixtureFor(policy: FictionPolicy) {
  const base = fictionFixture().input;
  if (base.narrativeContext?.policy.mode !== 'narrative-fiction-v2')
    throw Error('Expected a fiction-mode fixture.');
  base.narrativeContext.policy = policy;
  return fictionFixture(base);
}
function provider(response: unknown) {
  const parse = vi.fn().mockResolvedValue(response);
  const ai = new OpenAiProvider(
    {
      apiKey: 'test-only-key',
      eventModel: 'test-model-events',
      storyModel: 'test-model-story',
      timeoutMs: 1000,
      maxOutputTokens: 12000,
    },
    { responses: { parse } } as unknown as OpenAIClient,
  );
  return { ai, parse };
}

describe('v7 candidate policy selection and frozen predecessors', () => {
  it('selects v7/quality2.6/editor v6 for new jobs and keeps v6 explicit', () => {
    expect(fictionPolicy()).toEqual(fictionV7Policy());
    expect(fictionV7Policy()).toMatchObject({
      qualityPolicyVersion: '2.6.0',
      maxPhysicalRequests: 9,
      maxContentRepairs: 1,
      promptVersions: {
        planner: 'life_fiction_plan.v7',
        writer: 'life_fiction_author.v7',
        planReviewer: 'life_fiction_plan_review.v7',
        fidelity: 'life_fiction_fidelity.v1',
        editor: 'life_fiction_editor.v6',
      },
    });
    expect(fictionV6Quality25Policy()).toEqual({
      ...fictionV6Policy(),
      qualityPolicyVersion: '2.5.0',
    });
    for (const policy of [fictionV6Policy(), fictionV6Quality25Policy()])
      expect(fictionPolicySchema.parse(policy)).toEqual(policy);
  });
  it('rejects cross-generation quality or editor pairs around v7', () => {
    for (const bad of [
      { ...fictionV7Policy(), qualityPolicyVersion: '2.5.0' },
      { ...fictionV6Policy(), qualityPolicyVersion: '2.6.0' },
      {
        ...fictionV7Policy(),
        promptVersions: {
          ...fictionV7Policy().promptVersions,
          editor: 'life_fiction_editor.v5',
        },
      },
      {
        ...fictionV6Quality25Policy(),
        promptVersions: {
          ...fictionV6Quality25Policy().promptVersions,
          editor: 'life_fiction_editor.v6',
        },
      },
    ])
      expect(fictionPolicySchema.safeParse(bad).success).toBe(false);
  });
  it('keeps measured v5 and merged v6 prompt bytes frozen and pins v7', () => {
    expect(hashesOf(fictionV5Policy().promptVersions).author).toBe(
      '73e1d1506fcae69a0864007d58936553f19b10bfadd4adc5d7bf6913fac7b18c',
    );
    expect(hashesOf(v6Versions)).toEqual({
      planner:
        '8c204824ca100faca7916d5b0d44d8e0faa276cfa4f5b1cd4778d9882e13cd40',
      author:
        'a71e65eb673c4cb28060859ceba484e91a83e4f832d0eee75717d381d56124ca',
      review:
        '3ff9ee34a84842321e22e64700a9eeaa50ae2a77cd02d64dbb56e8a1942ade97',
      fidelity:
        '0af915d7eceacd19283e6b0300e85cf014861fc57028a6f7395b0f6f651ee25b',
      editor:
        '02ea8f44d1b0d8a321e87b0d8e2cc57663be38a420a7181ebb675371a83bf738',
    });
    const v7 = hashesOf(v7Versions);
    expect(v7.fidelity).toBe(hashesOf(v6Versions).fidelity);
    expect(v7).toEqual(V7_PROMPT_HASHES);
  });
});

describe('v7 prompt deltas', () => {
  const v6 = fictionPrompts('en', v6Versions);
  const v7 = fictionPrompts('en', v7Versions);
  it('lifts the inherited one-actor limit only in v7, in favour of narrative economy', () => {
    expect(v6.planner).toContain(actorLimit);
    expect(v6.author).toContain(actorLimit);
    for (const text of [v7.planner, v7.author]) {
      expect(text).not.toContain(actorLimit);
      expect(text).toContain(
        'every durable new recurring person needs its own actor_add, distinct from supplied/Shared identities, with no per-period count',
      );
      expect(text).toContain('NARRATIVE-ECONOMY CRAFT');
      expect(text).toContain(
        'Never leave a returning person unregistered to save an actor_add',
      );
      // Everything else the measured v6 text said survives unchanged.
      expect(text.length).toBeGreaterThan(v6.planner.length);
    }
    expect(v7.planner.startsWith(v6.planner.split(actorLimit)[0]!)).toBe(true);
    expect(v7.review).toContain(
      'do not penalize a plan merely for introducing two or more registered recurring people',
    );
  });
  it('extends the decision boundary to the whole closing passage', () => {
    for (const text of [v7.planner, v7.author, v7.review]) {
      expect(text).toContain('CLOSING-PASSAGE CRAFT');
      expect(text).toContain(
        "do not rebuild the structured decision's alternatives in prose",
      );
    }
    expect(v7.editor).toContain(
      'Extend systemMechanicsInvisible to the whole closing passage',
    );
    expect(v7.editor).toContain('any of the final three paragraphs');
    expect(v6.editor).not.toContain('CLOSING-PASSAGE');
    expect(v6.author).not.toContain('CLOSING-PASSAGE');
  });
  it('adds over-explaining as a series-level signal without a quota or ban', () => {
    for (const text of [v7.planner, v7.author]) {
      expect(text).toContain('PATTERN-SIGNAL CRAFT');
      expect(text).toContain('overexplain_while_other_busy');
      expect(text).toContain('not a ban or a quota');
    }
    expect(v7.editor).toContain('REPORT 1.3.0');
    expect(v7.editor).toContain(
      'one occurrence is not a defect and there is no quota',
    );
    expect(v6.editor).not.toContain('overexplain_while_other_busy');
    expect(v6.editor).not.toContain('1.3.0');
  });
  it('adds private-life and first-draft consistency guidance within the existing safety scope', () => {
    for (const text of [v7.planner, v7.author, v7.review]) {
      expect(text).toContain('PRIVATE-LIFE CRAFT');
      expect(text).toContain(
        'never invent new durable private facts about them',
      );
    }
    expect(v7.author).toContain('FIRST-DRAFT CONSISTENCY CRAFT');
    expect(v7.author).toContain('opportunity_set');
    expect(v7.author).toContain('Do not inventory every object or sentence');
    expect(v7.planner).not.toContain('FIRST-DRAFT CONSISTENCY CRAFT');
    // The unchanged safety boundary stays at the top of every v7 prompt.
    for (const text of Object.values(v7))
      expect(text).toContain(
        'Preserve the current safety scope: no death, serious illness',
      );
  });
  it('introduces no counting quota, schedule or billing language in the v7 delta', () => {
    const deltas = (['planner', 'author', 'review', 'editor'] as const).map(
      (key) => v7[key].slice(v6[key].split(actorLimit)[0]!.length),
    );
    for (const delta of deltas)
      for (const forbidden of [
        'at most one',
        'at most two',
        'maximum of',
        'every N chapters',
        'per 8 chapters',
        'chapter 7 of 8',
        'tier',
        'billing',
        'subscription',
        'allowance',
        'mandatory new relationship',
      ])
        expect(delta).not.toContain(forbidden);
  });
});

describe('signature 1.1.0 and report 1.3.0', () => {
  const signature = (version: '1.0.0' | '1.1.0', flags: string[]) => ({
    ...fictionSignatureFixture('00000000-0000-4000-8000-000000000001', version),
    rhetoricalFlags: flags,
  });
  it('accepts the over-explaining flag only in signature 1.1.0', () => {
    expect(
      fictionSequenceSignatureV11Schema.safeParse(
        signature('1.1.0', ['overexplain_while_other_busy']),
      ).success,
    ).toBe(true);
    expect(
      fictionSequenceSignatureSchema.safeParse(
        signature('1.0.0', ['overexplain_while_other_busy']),
      ).success,
    ).toBe(false);
    expect(
      fictionSequenceSignatureV11Schema.safeParse(
        signature('1.1.0', ['overexplain_while_other_busy', 'none']),
      ).success,
    ).toBe(false);
  });
  it('keeps the frozen 1.2.0 editor request schema free of the new flag', async () => {
    for (const [policy, expected] of [
      [fictionV6Quality25Policy(), false],
      [fictionV7Policy(), true],
    ] as const) {
      const f = fixtureFor(policy);
      const { ai, parse } = provider({
        status: 'completed',
        output_parsed: f.editor,
        model: 'test-editor-model',
      });
      const result = await ai.editFiction(f.input, f.authored);
      expect(result.output.version).toBe(expected ? '1.3.0' : '1.2.0');
      const format = JSON.stringify(parse.mock.calls[0]![0].text.format);
      expect(format.includes('overexplain_while_other_busy')).toBe(expected);
      if (!expected) expect(sha(format)).toBe(V6_EDITOR_FORMAT_HASH);
    }
  });
  it('gates a 1.3.0 report exactly like 1.2.0 and only under quality2.6', () => {
    const v7 = fixtureFor(fictionV7Policy());
    const report = fictionHumanEditorialV13Schema.parse({
      ...v7.editor,
      sequenceSignature: signature('1.1.0', ['overexplain_while_other_busy']),
    });
    const current = {
      ...report,
      sequenceSignature: {
        ...report.sequenceSignature,
        periodId: v7.input.periodId,
      },
    };
    expect(
      validateFictionEditorialReport(v7.input, v7.authored, current),
    ).toEqual(current);
    // The signal is recorded, not punished: the gate still passes.
    expect(evaluateFictionEditorialGate(v7.input, current).passed).toBe(true);
    expect(
      evaluateFictionEditorialGate(v7.input, {
        ...current,
        sequenceReview: {
          ...current.sequenceReview,
          systemMechanicsInvisible: false,
        },
        verdict: 'revise',
        issues: [
          {
            dimension: 'choiceStakes',
            severity: 'major',
            repairScope: 'prose',
            paragraphIndex: 3,
            eventIds: [],
            explanation:
              'The penultimate paragraph lays out both structured paths and their costs side by side.',
            suggestedFix:
              'Let one concrete pressure carry the choice instead of previewing both branches.',
          },
        ],
      }).passed,
    ).toBe(false);
    const v6 = fixtureFor(fictionV6Quality25Policy());
    const asV6 = {
      ...current,
      sequenceSignature: {
        ...current.sequenceSignature,
        periodId: v6.input.periodId,
      },
    };
    expect(evaluateFictionEditorialGate(v6.input, asV6).passed).toBe(false);
    expect(() =>
      validateFictionEditorialReport(v6.input, v6.authored, asV6),
    ).toThrow();
    const downgraded = fictionHumanEditorialSchema.parse({
      ...current,
      version: '1.2.0',
      sequenceSignature: fictionSignatureFixture(v7.input.periodId),
    });
    expect(evaluateFictionEditorialGate(v7.input, downgraded).passed).toBe(
      false,
    );
    expect(fictionEditorialReportSchema.parse(current).version).toBe('1.3.0');
  });
  it('lets only a quality2.6 context carry mixed 1.0.0/1.1.0 signature history', () => {
    const history = [
      fictionSignatureFixture('00000000-0000-4000-8000-000000000011'),
      signature('1.1.0', ['overexplain_while_other_busy']),
    ];
    const v7 = fixtureFor(fictionV7Policy()).input.narrativeContext!;
    const v6 = fixtureFor(fictionV6Quality25Policy()).input.narrativeContext!;
    expect(
      fictionContextSchema.safeParse({
        ...v7,
        sequenceSignatureHistory: history,
      }).success,
    ).toBe(true);
    expect(
      fictionContextSchema.safeParse({
        ...v6,
        sequenceSignatureHistory: history,
      }).success,
    ).toBe(false);
    expect(
      fictionContextSchema.safeParse({
        ...v6,
        sequenceSignatureHistory: history.slice(0, 1),
      }).success,
    ).toBe(true);
  });
});

describe('measurement profiles with an ordinary private life', () => {
  it('gives every profile one or two fictional family, partner or friend relationships', () => {
    for (const profile of narrativeProfiles) {
      const setup = lifeSetupV2Schema.parse(narrativeSetup(profile));
      expect(setup.relationships.length).toBeGreaterThanOrEqual(1);
      expect(setup.relationships.length).toBeLessThanOrEqual(2);
      for (const r of setup.relationships) {
        expect(['family', 'partner', 'friend']).toContain(r.relationship);
        expect(r.label.startsWith('Fictional ')).toBe(true);
      }
    }
  });
  it('keeps the two long-measurement profiles distinct and goal-neutral', () => {
    const labels = (id: string) =>
      narrativeSetup(
        narrativeProfiles.find((p) => p.id === id)!,
      ).relationships.map((r) => r.label);
    expect(labels('career-transition')).toEqual([
      'Fictional older sister',
      'Fictional flatmate',
    ]);
    expect(labels('creative-portfolio')).toEqual([
      'Fictional mother',
      'Fictional school friend',
    ]);
    expect(labels('fictional-friend')).toContain('Fictional companion');
  });
});

// Same value computed at the merged v6 checkpoint f755a57: the 1.2.0 editor
// output schema sent to the provider is byte-identical.
const V6_EDITOR_FORMAT_HASH =
  '6996e017d38d05f7503e554472a43986355f6a0cf0ffc97b2d2d29c5fd275abb';
const V7_PROMPT_HASHES = {
  planner: '300c1f413d0d135b86e1f4908f0cbef85f805a2297e046d7e1a66db02dcdda36',
  author: 'a7a9129e5da6b18a75e21626bbc58a99272a9545784bf25475f6852d75085607',
  review: '836821d9a4ff8a50efe64f9e34bc1d11e19fe483d7deac0c9d6edf586d7d5940',
  fidelity: '0af915d7eceacd19283e6b0300e85cf014861fc57028a6f7395b0f6f651ee25b',
  editor: '5968a5abdd133073d980f3dcc7f56e106aeb914df1c04ffd57bc54cf335a6716',
};
