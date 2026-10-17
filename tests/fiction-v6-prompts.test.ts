import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  fictionPrompts,
  type FictionPromptVersions,
} from '../packages/ai/src/fiction-prompts';
import { fictionV4Policy, fictionPolicy } from '@future-flow/contracts';

// @future-flow/contracts has not yet landed the v6 enum/default change (a
// separate owner task supplies fictionV5Policy()/a v6-selecting
// fictionPolicy()); until then this file names the v5 and v6 version sets
// directly with FictionPromptVersions' widened string fields instead of
// casting a narrower contracts-enum type. fictionPolicy() currently *is* v5
// -- pinned explicitly here so this file keeps meaning "v5" even after the
// contracts default moves to v6.
const v4Versions: FictionPromptVersions = fictionV4Policy().promptVersions;
const v5Versions: FictionPromptVersions = fictionPolicy().promptVersions;
const v6Versions: FictionPromptVersions = {
  planner: 'life_fiction_plan.v6',
  writer: 'life_fiction_author.v6',
  planReviewer: 'life_fiction_plan_review.v6',
  fidelity: 'life_fiction_fidelity.v1',
  editor: 'life_fiction_editor.v5',
};

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
        'bd9cab9a28725594bddd4fe3ef2fe5c2f04bcd971eceeff65c849edceedc292a',
      author:
        'ca38ba6c6aa1331e0c1c6b6b82c9ca4604dfa52b7d3a100879461b08ad3d309b',
      review:
        '3ff9ee34a84842321e22e64700a9eeaa50ae2a77cd02d64dbb56e8a1942ade97',
      fidelity:
        '0af915d7eceacd19283e6b0300e85cf014861fc57028a6f7395b0f6f651ee25b',
      editor:
        '02aac90888113f6ca02d24aedd08bf04de5dc2ddd40b37d9f1508d5b46c1a2e4',
    });
  });
  it('keeps fidelity v1 byte-identical from v4 through v6', () => {
    const h4 = hashesOf(v4Versions).fidelity;
    const h5 = hashesOf(v5Versions).fidelity;
    const h6 = hashesOf(v6Versions).fidelity;
    expect(h5).toBe(h4);
    expect(h6).toBe(h5);
  });
  // The v5 return above is an explicit conditional, not the terminal
  // fallthrough; v6 is now that implicit default, exactly like v5 was before
  // this change. Any writer string outside the explicit v1-v5 literals -- not
  // only the exact 'life_fiction_author.v6' id -- must reach the same v6 text.
  it('reaches the v6 prompt set as the implicit default for any writer id outside the explicit v1-v5 literals', () => {
    const unknownWriterId = fictionPrompts('en', {
      ...v6Versions,
      writer: 'life_fiction_author.not-yet-a-real-version',
    });
    expect(hashesOf(v6Versions)).toEqual(
      Object.fromEntries(
        Object.entries(unknownWriterId).map(([key, value]) => [
          key,
          createHash('sha256').update(value).digest('hex'),
        ]),
      ),
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
