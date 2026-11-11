import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { fictionPrompts } from '../packages/ai/src/fiction-prompts';
import {
  fictionV4Policy,
  fictionV5Policy,
  fictionV6Quality25Policy,
} from '@future-flow/contracts';

type FictionPromptVersions = Parameters<typeof fictionPrompts>[1];
const v4Versions = fictionV4Policy().promptVersions;
const v5Versions = fictionV5Policy().promptVersions;
const v6Versions = fictionV6Quality25Policy().promptVersions;

function hashesOf(versions: FictionPromptVersions) {
  const prompts = fictionPrompts('en', versions);
  return Object.fromEntries(
    Object.entries(prompts).map(([key, value]) => [
      key,
      createHash('sha256').update(value).digest('hex'),
    ]),
  );
}

describe('fiction-prompts v6 earned-evolution and reference-integrity routing', () => {
  it('keeps the measured v5 prompt bytes frozen under an explicit v5 version object', () => {
    expect(hashesOf(v5Versions)).toEqual({
      planner:
        'd5eec750bb5949bf004fb156ebcb79fc651b8c5678892eb8b3493011820b0edd',
      author:
        '73e1d1506fcae69a0864007d58936553f19b10bfadd4adc5d7bf6913fac7b18c',
      review:
        '62ca65c25584e4d11272dfd490346a51d0ebd06c829a76330bd6d92a99605318',
      fidelity:
        '0af915d7eceacd19283e6b0300e85cf014861fc57028a6f7395b0f6f651ee25b',
      editor:
        '5e62192124f3a3cbee3ea5701089004bbecd1187387fe4fdb244acaf7ff47ca1',
    });
  });
  it('produces a distinct, separately versioned v6 prompt set', () => {
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
  });
  it('keeps fidelity v1 byte-identical from v4 through v6', () => {
    const h4 = hashesOf(v4Versions).fidelity;
    const h5 = hashesOf(v5Versions).fidelity;
    const h6 = hashesOf(v6Versions).fidelity;
    expect(h5).toBe(h4);
    expect(h6).toBe(h5);
  });
  it('routes the merged v6 checkpoint explicitly now that v7 is the default', () => {
    expect(fictionPrompts('en')).not.toEqual(fictionPrompts('en', v6Versions));
    expect(fictionPrompts('en', v6Versions)).not.toEqual(
      fictionPrompts('en', v5Versions),
    );
  });
  it('states the exact scene-first-event rule and includes future option goal effects', () => {
    for (const text of [
      fictionPrompts('en', v6Versions).planner,
      fictionPrompts('en', v6Versions).author,
    ]) {
      expect(text).toContain('FIRST EVENT REFERENCED BY THAT SCENE');
      expect(text).toContain('every unresolved decision option');
    }
    expect(fictionPrompts('en', v6Versions).editor).toContain(
      'set distinctEnding=false',
    );
    expect(fictionPrompts('en', v6Versions).editor).toContain(
      'materially unchanged without a deliberate dramatic reason',
    );
  });
  it('adds earned-evolution, reference-integrity, decision-boundary, temporal-focus and contrivance-calibration craft only from v6 onward', () => {
    const v5 = fictionPrompts('en', v5Versions);
    const v6 = fictionPrompts('en', v6Versions);
    for (const needle of [
      'EARNED-EVOLUTION CRAFT',
      'is an origin, not a permanent ceiling',
      'There is no fixed number of prior periods, no elapsed-time threshold',
      'REFERENCE-INTEGRITY CRAFT',
      'referenceProjection.goalIds',
      'referenceProjection.existingActorIds',
      'referenceProjection.sceneActorRule',
      'DECISION-BOUNDARY CRAFT',
      "does not have to end with an NPC waiting for the reader's answer",
      'TEMPORAL-FOCUS CRAFT',
      'reader-facing prose need not spend evenly across it',
      'CONTRIVANCE-CALIBRATION CRAFT',
      'needing a decision to exist is not itself that reason',
    ]) {
      expect(v5.planner).not.toContain(needle);
      expect(v5.author).not.toContain(needle);
      expect(v6.planner).toContain(needle);
      expect(v6.author).toContain(needle);
    }
  });
  it('gives the plan reviewer the same earned-evolution/decision-boundary/temporal/contrivance craft but not reference-integrity, which is a generation-time concern', () => {
    const v5 = fictionPrompts('en', v5Versions);
    const v6 = fictionPrompts('en', v6Versions);
    for (const needle of [
      'EARNED-EVOLUTION CRAFT',
      'DECISION-BOUNDARY CRAFT',
      'TEMPORAL-FOCUS CRAFT',
      'CONTRIVANCE-CALIBRATION CRAFT',
    ]) {
      expect(v5.review).not.toContain(needle);
      expect(v6.review).toContain(needle);
    }
    expect(v6.review).not.toContain('REFERENCE-INTEGRITY CRAFT');
    expect(v6.review).not.toContain('referenceProjection');
    expect(v6.review).toContain(
      'remains a strong pass when their relationship, role or meaning keeps deepening',
    );
    expect(v6.review).toContain(
      'needs a stated, credible human reason for that avoidance before causality can score strongly',
    );
  });
  it('keeps the plan reviewer free of goal/actor reference-integrity rules that belong to the planner and author only', () => {
    const v6 = fictionPrompts('en', v6Versions);
    expect(v6.planner).toContain('REFERENCE-INTEGRITY CRAFT');
    expect(v6.author).toContain('REFERENCE-INTEGRITY CRAFT');
    expect(v6.review).not.toContain('goalIds');
    expect(v6.review).not.toContain('existingActorIds');
  });
  it('extends editor v5 interpretation of independentProgression, systemMechanicsInvisible and causality while keeping report 1.2.0 and v5 editor text intact underneath', () => {
    const v5 = fictionPrompts('en', v5Versions);
    const v6 = fictionPrompts('en', v6Versions);
    expect(v6.editor).toContain(
      'Interpreting independentProgression, systemMechanicsInvisible and causality under the SAME report version 1.2.0',
    );
    expect(v6.editor).toContain(
      'must not be marked false merely for staying in place',
    );
    expect(v6.editor).toContain(
      "Extend systemMechanicsInvisible to also cover a chapter that closes on an NPC explicitly waiting for the reader's unresolved decision",
    );
    expect(v6.editor).toContain(
      'causality may not score >=4 unless the chapter gives that avoidance a credible, specific human reason',
    );
    expect(v5.editor).not.toContain('independentProgression and causality');
    // v5's own interpretation layer (and everything beneath it back to v1)
    // still survives verbatim underneath the new v6 interpretation.
    expect(v6.editor).toContain(v5.editor);
    expect(v6.editor).toContain('Use report version 1.2.0');
    expect(v6.editor).not.toContain('report version 1.3.0');
    expect(v6.editor).not.toContain('report version 2.0.0');
  });
  it('never mentions a billing tier, renewal, allowance, rollover or a chapter-number timetable in the v6 delta', () => {
    const v5 = fictionPrompts('en', v5Versions);
    const v6 = fictionPrompts('en', v6Versions);
    // Isolate the newly-added text by stripping the frozen v5 prefix, so this
    // check cannot accidentally flag an unrelated pre-existing v1-v5 word.
    const plannerDelta = v6.planner.slice(v5.planner.length);
    const authorDelta = v6.author.slice(v5.author.length);
    const reviewDelta = v6.review.slice(v5.review.length);
    const editorDelta = v6.editor.slice(v5.editor.length);
    for (const forbidden of [
      'tier',
      'Explorer',
      'Connected',
      'billing',
      'subscription',
      'renewal',
      'remaining quota',
      'rollover',
      'allowance',
      'chapter 7 of 8',
      'package position',
      'after N periods',
      'every N chapters',
      'mandatory relocation',
      'mandatory new relationship',
      'stagnationCounter',
      'lifeExpanded',
    ]) {
      expect(plannerDelta).not.toContain(forbidden);
      expect(authorDelta).not.toContain(forbidden);
      expect(reviewDelta).not.toContain(forbidden);
      expect(editorDelta).not.toContain(forbidden);
    }
  });
});
