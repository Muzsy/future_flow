import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { fictionPrompts } from '../packages/ai/src/fiction-prompts';

import { fictionV4Policy, fictionV5Policy } from '@future-flow/contracts';

type Versions = Parameters<typeof fictionPrompts>[1];
const v4Versions: Versions = fictionV4Policy().promptVersions;
const v5Versions: Versions = fictionV5Policy().promptVersions;

function hashesOf(versions: Versions) {
  const prompts = fictionPrompts('en', versions);
  return Object.fromEntries(
    Object.entries(prompts).map(([key, value]) => [
      key,
      createHash('sha256').update(value).digest('hex'),
    ]),
  );
}

describe('fiction-prompts v5 progression/behavior hardening', () => {
  // P01 — freeze v4: pinned independently of @future-flow/contracts'
  // selected default, so this stays true when newly queued jobs select v6.
  it('keeps the measured v4 prompt bytes frozen under an explicit v4 version object', () => {
    expect(hashesOf(v4Versions)).toEqual({
      planner:
        'ee47f697b3dc410cb4ae8c52c7698f4c6ef0ad76318ab94e75650ad21423c086',
      author:
        '784cfea666acb3753d2eeb9e82fb0c7f849c26e257eca6306e72e380018cf10e',
      review:
        '06214125b78af9248687a25155a4e08163e5fc185889f9ac1da3843c4a9760ad',
      fidelity:
        '0af915d7eceacd19283e6b0300e85cf014861fc57028a6f7395b0f6f651ee25b',
      editor:
        'b855d95475b8d1b6fc5c366775567765cd459f048c1cba85a188e2ea49ddec62',
    });
  });
  it('produces a distinct, separately versioned v5 prompt set', () => {
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
  it('keeps fidelity v1 byte-identical between v4 and v5', () => {
    expect(hashesOf(v4Versions).fidelity).toBe(hashesOf(v5Versions).fidelity);
  });
  // P08 — no archetype rotation: the added text must say signatures are
  // comparison evidence, not a prescribed schedule, and must not introduce a
  // hard rotation/ban rule. This is textual prompt evidence; a mocked gate
  // test cannot prove the model actually complies.
  it('adds progression-source, behavioral-variety and NPC-sameness hardening only from v5 onward', () => {
    const v4 = fictionPrompts('en', v4Versions);
    const v5 = fictionPrompts('en', v5Versions);
    for (const needle of [
      'PROGRESSION-SOURCE CRAFT',
      'not a rotation schedule to alternate through or a banned-value list',
      'is not the default advancement mechanism',
      'never choose the opposite enum value on principle merely to differ from history',
      'BEHAVIORAL-VARIETY CRAFT',
      'not a required rotation',
      'None of this requires irrational, hostile or cruel behavior',
      'NPC CRAFT',
      "do not have to supply the chapter's thesis",
    ]) {
      expect(v4.planner).not.toContain(needle);
      expect(v4.author).not.toContain(needle);
      expect(v5.planner).toContain(needle);
      expect(v5.author).toContain(needle);
    }
  });
  it('tells the v5 plan reviewer to flag repeated externally-supplied opportunity shapes without banning earned ones', () => {
    const v4 = fictionPrompts('en', v4Versions);
    const v5 = fictionPrompts('en', v5Versions);
    expect(v4.review).not.toContain(
      'culminates in another externally supplied opportunity',
    );
    expect(v5.review).toContain(
      'culminates in another externally supplied opportunity',
    );
    expect(v5.review).toContain(
      'Do not reject an opportunity merely because its dramaticEngine enum value matches recent history',
    );
  });
  it('strengthens editor v4 interpretation of distinctDramaticStructure/independentProgression/behavioralVariety while keeping report 1.2.0', () => {
    const v4 = fictionPrompts('en', v4Versions);
    const v5 = fictionPrompts('en', v5Versions);
    expect(v5.editor).toContain('Use report version 1.2.0');
    expect(v5.editor).toContain(
      'A larger or more prestigious opportunity alone is not independent progression',
    );
    expect(v5.editor).toContain(
      'only once it becomes a recurring formula across owned periods',
    );
    expect(v4.editor).not.toContain('is not independent progression');
    // v4's own structural/rhetorical/sequence requirements still survive
    // underneath the new v5 interpretation layer, unmodified.
    expect(v5.editor).toContain(v4.editor);
  });
  it('leaves fidelity pinned to v1 text and does not add a new editorial report schema version', () => {
    const v5 = fictionPrompts('en', v5Versions);
    expect(v5.editor).not.toContain('report version 1.3.0');
    expect(v5.editor).not.toContain('report version 2.0.0');
  });
});
