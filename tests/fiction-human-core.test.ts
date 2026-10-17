import { narrativeEditorialFixture } from './narrative-plan-fixtures';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import {
  fictionV5Policy,
  fictionV1Policy,
  fictionV2Policy,
  fictionV3Policy,
  fictionV4Policy,
  fictionPolicySchema,
  fictionHumanEditorialSchema,
  fictionContextSchema,
  fictionSequenceSignatureSchema,
  type StoryFact,
} from '@future-flow/contracts';
import {
  evaluateFictionEditorialGate,
  addMonths,
  validateFictionEditorialReport,
  fictionProseRepairAllowed,
  fictionPlannerRequest,
  buildFictionArtifact,
  hash,
  validatedFictionCheckpoint,
} from '@future-flow/core';
import {
  boundFictionContext,
  personalFictionContext,
  type Database,
} from '@future-flow/database';
import {
  fictionFixture,
  fictionProof,
  fictionSignatureFixture,
} from './fiction-fixtures';

function currentFixture() {
  const old = fictionFixture();
  if (old.input.narrativeContext?.policy.mode !== 'narrative-fiction-v2')
    throw Error();
  old.input.narrativeContext.policy = fictionV5Policy();
  const f = fictionFixture(old.input);
  return { ...f, editor: fictionHumanEditorialSchema.parse(f.editor) };
}
function issue(scope: 'canon' | 'prose') {
  return {
    dimension: 'novelty' as const,
    severity: 'major' as const,
    repairScope: scope,
    paragraphIndex: null,
    eventIds: [],
    explanation:
      'The sequence repeats the earlier resolution without a changed causal role.',
    suggestedFix:
      'Rewrite the repeated mechanism while preserving every fixed user boundary.',
  };
}

describe('human-fiction v4/v5 compatibility and evidence gates', () => {
  it('freezes complete old policy tuples and rejects cross-version combinations', () => {
    for (const policy of [
      fictionV1Policy(),
      fictionV2Policy(),
      fictionV3Policy(),
      fictionV4Policy(),
      fictionV5Policy(),
    ])
      expect(fictionPolicySchema.parse(policy)).toEqual(policy);
    for (const policy of [
      {
        ...fictionV5Policy(),
        promptVersions: {
          ...fictionV5Policy().promptVersions,
          editor: 'life_fiction_editor.v2',
        },
      },
      { ...fictionV3Policy(), qualityPolicyVersion: '2.2.0' },
    ])
      expect(fictionPolicySchema.safeParse(policy).success).toBe(false);
    expect(fictionV5Policy()).toMatchObject({
      maxPhysicalRequests: 9,
      maxContentRepairs: 1,
    });
  });
  it('accepts a coherent v4 package and binds its signature to final receipts and checkpoint', () => {
    const f = currentFixture(),
      receipts = fictionProof(f);
    const artifact = buildFictionArtifact(
      f.input,
      f.draft,
      f.authored,
      f.review,
      f.fidelity,
      f.editor,
      receipts,
    );
    expect(artifact.editorialReport).toEqual(f.editor);
    expect(artifact.bindings.editorialOutputHash).toBe(hash(f.editor));
    const cp = {
      pipelineVersion: artifact.pipelineVersion,
      policy: artifact.policy,
      fictionDraft: f.draft,
      fictionAuthor: f.authored,
      planningReview: f.review,
      fidelityResult: f.fidelity,
      editorialReport: f.editor,
      receipts,
      narrativeArtifact: artifact,
      candidate: f.authored.candidate,
      chapter: f.authored.chapter,
      providerRequestCount: 5,
    };
    expect(validatedFictionCheckpoint(cp, f.input).artifact).toEqual(artifact);
    const changed = structuredClone(cp);
    changed.editorialReport.sequenceSignature.endingMode = 'tableau';
    expect(() => validatedFictionCheckpoint(changed, f.input)).toThrow();
  });
  for (const flag of [
    'distinctRhetoricalShape',
    'systemMechanicsInvisible',
    'behavioralVariety',
  ] as const)
    it(`rejects ${flag}=false despite perfect scores and pass verdict`, () => {
      const f = currentFixture();
      for (const key of Object.keys(
        f.editor.scores,
      ) as (keyof typeof f.editor.scores)[])
        f.editor.scores[key] = 5;
      f.editor.sequenceReview[flag] = false;
      f.editor.issues = [
        issue(flag === 'behavioralVariety' ? 'canon' : 'prose'),
      ];
      expect(evaluateFictionEditorialGate(f.input, f.editor).passed).toBe(
        false,
      );
      expect(() =>
        buildFictionArtifact(
          f.input,
          f.draft,
          f.authored,
          f.review,
          f.fidelity,
          f.editor,
          fictionProof(f),
        ),
      ).toThrow();
      f.editor.issues = [];
      expect(fictionHumanEditorialSchema.safeParse(f.editor).success).toBe(
        false,
      );
    });
  it('requires canon evidence for behavioral/structural repetition but allows prose repair for surface failures', () => {
    for (const flag of [
      'systemMechanicsInvisible',
      'distinctRhetoricalShape',
      'distinctEnding',
    ] as const) {
      const f = currentFixture();
      f.editor.sequenceReview[flag] = false;
      f.editor.issues = [issue('prose')];
      expect(
        fictionProseRepairAllowed(fictionHumanEditorialSchema.parse(f.editor)),
      ).toBe(true);
    }
    for (const flag of [
      'distinctDramaticStructure',
      'independentProgression',
      'characterAgency',
      'behavioralVariety',
    ] as const) {
      const f = currentFixture();
      f.editor.sequenceReview[flag] = false;
      f.editor.issues = [issue('prose')];
      expect(fictionHumanEditorialSchema.safeParse(f.editor).success).toBe(
        false,
      );
      f.editor.issues = [issue('canon')];
      expect(
        fictionProseRepairAllowed(fictionHumanEditorialSchema.parse(f.editor)),
      ).toBe(false);
    }
  });
  it('rejects a foreign current signature and a historical report for the new policy', () => {
    const f = currentFixture();
    f.editor.sequenceSignature.periodId = randomUUID();
    expect(() =>
      validateFictionEditorialReport(f.input, f.authored, f.editor),
    ).toThrow();
    expect(() =>
      validateFictionEditorialReport(
        f.input,
        f.authored,
        fictionFixture().editor,
      ),
    ).toThrow();
  });
  it('requires exact union coverage and rejects foreign or duplicate signature history', () => {
    const f = currentFixture(),
      ctx = fictionContextSchema.parse(f.input.narrativeContext);
    const id = randomUUID();
    f.input.narrativeReferences!.periodPositions = [
      { periodId: id, position: 1 },
    ];
    ctx.sequenceSignatureHistory = [fictionSignatureFixture(id)];
    f.input.narrativeContext = ctx;
    f.editor.sequenceReview.comparedPeriodIds = [id];
    expect(() =>
      validateFictionEditorialReport(f.input, f.authored, f.editor),
    ).not.toThrow();
    f.editor.sequenceReview.comparedPeriodIds = [];
    expect(() =>
      validateFictionEditorialReport(f.input, f.authored, f.editor),
    ).toThrow();
    ctx.sequenceSignatureHistory.push(fictionSignatureFixture(id));
    expect(() => fictionPlannerRequest(f.input)).toThrow();
    ctx.sequenceSignatureHistory = [fictionSignatureFixture(randomUUID())];
    expect(() => fictionPlannerRequest(f.input)).toThrow();
  });
  it('retains eight compact signatures with the three raw periods under the same 12 KiB cap', () => {
    const f = currentFixture(),
      signatures = Array.from({ length: 8 }, () =>
        fictionSignatureFixture(randomUUID()),
      );
    const raw = signatures.slice(-3).map((s) => ({
      periodId: s.periodId,
      scenes: ['An action changes the outcome.'],
      opening: 'A real opening.',
      ending: 'A changed consequence.',
    }));
    const context = boundFictionContext(f.memory, [], raw, signatures);
    expect(context.sequenceSignatureHistory).toHaveLength(8);
    expect(context.sequenceHistory).toEqual(raw);
    const { policy: _, ...memory } = context;
    expect(Buffer.byteLength(JSON.stringify(memory))).toBeLessThanOrEqual(
      12288,
    );
  });
  it('drops oldest optional signatures deterministically without evicting mandatory continuity or raw evidence', () => {
    const f = currentFixture();
    const raw = Array.from({ length: 3 }, () => ({
      periodId: randomUUID(),
      scenes: Array(3).fill('x'.repeat(300)),
      opening: 'x'.repeat(400),
      ending: 'x'.repeat(500),
    }));
    const signatures = Array.from({ length: 8 }, () =>
      fictionSignatureFixture(randomUUID()),
    );
    const actors = Array.from({ length: 5 }, () => randomUUID());
    f.memory.fictionalActors = actors.map((actor) => ({
      actorId: actor,
      introducedByEventId: randomUUID(),
      role: 'A recurring person in this fictional setting.',
      desire: 'Wants to finish the independent work.',
      resistance: 'Cannot abandon another obligation.',
      voiceCue: 'Often speaks in unfinished questions.',
      lastSeenPeriodId: randomUUID(),
    }));
    const facts: StoryFact[] = actors.map((actor) => ({
      ...f.authored.storyFacts[0]!,
      id: randomUUID(),
      aboutActorIds: [actor],
      assertion: 'A'.repeat(300),
    }));
    const a = boundFictionContext(f.memory, facts, raw, signatures),
      b = boundFictionContext(f.memory, facts, raw, signatures);
    expect(a).toEqual(b);
    expect(a.sequenceHistory).toEqual(raw);
    expect(a.storyFacts.some((x) => x.id === facts.at(-1)!.id)).toBe(true);
    expect(a.sequenceSignatureHistory!.length).toBeLessThan(8);
    expect(a.storyFacts).toHaveLength(5);
    expect(a.sequenceSignatureHistory).toEqual(
      signatures.slice(8 - a.sequenceSignatureHistory!.length),
    );
    const huge = structuredClone(f.memory);
    huge.fictionalActors = Array.from({ length: 12 }, () => ({
      ...huge.fictionalActors[0]!,
      actorId: randomUUID(),
      role: 'x'.repeat(120),
      desire: 'x'.repeat(200),
      resistance: 'x'.repeat(200),
      voiceCue: 'x'.repeat(120),
    }));
    expect(() => boundFictionContext(huge, [], raw, signatures)).toThrow(
      'Required fiction continuity',
    );
  });
  it('keeps pinned older facts in chronological order ahead of the retained recent window', () => {
    const f = currentFixture();
    const early = Array.from({ length: 3 }, () => ({
      ...f.authored.storyFacts[0]!,
      id: randomUUID(),
      introducedByEventId: randomUUID(),
    }));
    const later = Array.from({ length: 24 }, () => ({
      ...f.authored.storyFacts[0]!,
      id: randomUUID(),
      introducedByEventId: randomUUID(),
    }));
    f.memory.openThreads = [
      {
        id: randomUUID(),
        originPeriodId: randomUUID(),
        originEventId: early[0]!.introducedByEventId,
        kind: 'goal',
        summary: 'A remaining concrete question links the earlier encounters.',
        status: 'open',
        dueByPeriodOffset: 2,
        lastTouchedPeriodId: randomUUID(),
        eventRefs: early.map((f) => f.introducedByEventId),
      },
    ];
    const c = boundFictionContext(f.memory, [...early, ...later]);
    expect(c.storyFacts.slice(0, 3).map((f) => f.id)).toEqual(
      early.map((f) => f.id),
    );
    expect(c.storyFacts).toHaveLength(24);
  });
  it('clears both history layers and facts for withheld contexts without querying the database', async () => {
    const f = currentFixture();
    f.memory.withheld = true;
    const raw = [
      { periodId: randomUUID(), scenes: [], opening: '', ending: '' },
    ];
    const c = boundFictionContext(f.memory, f.authored.storyFacts, raw, [
      fictionSignatureFixture(randomUUID()),
    ]);
    expect(c.storyFacts).toEqual([]);
    expect(c.sequenceHistory).toEqual([]);
    expect(c.sequenceSignatureHistory).toEqual([]);
    const query = vi.fn();
    await personalFictionContext(
      { query } as unknown as Database,
      randomUUID(),
      f.input.input.branchId,
      f.memory,
    );
    expect(query).not.toHaveBeenCalled();
  });
  it('projects mixed v2/v3/v4/v5 owned history without rewriting old artifacts or inventing signatures', async () => {
    const fixtures = Array.from({ length: 4 }, (_, i) => {
      const input = structuredClone(fictionFixture().input);
      if (input.narrativeContext?.policy.mode !== 'narrative-fiction-v2')
        throw Error();
      input.periodId = randomUUID();
      input.revision = i * 2;
      input.startDate = addMonths(input.startDate, i * 6);
      input.endDate = addMonths(input.startDate, 6);
      input.state.effectiveAt = input.startDate;
      input.narrativeContext.memory.baseRevision = input.revision;
      input.narrativeContext.policy =
        i === 0
          ? fictionV2Policy()
          : i === 1
            ? fictionV3Policy()
            : i === 2
              ? fictionV4Policy()
              : fictionV5Policy();
      return fictionFixture(input);
    });
    const rows = fixtures.map((f, i) => {
      const editor = i === 0 ? narrativeEditorialFixture() : f.editor;
      const receipts = fictionProof(f).map((r) =>
        r.task === 'life_narrative_editor'
          ? { ...r, outputHash: hash(editor) }
          : r,
      );
      const artifact = buildFictionArtifact(
        f.input,
        f.draft,
        f.authored,
        f.review,
        f.fidelity,
        editor,
        receipts,
      );
      return {
        period_id: f.input.periodId,
        artifact,
        events: f.authored.candidate.events,
        chapter: f.authored.chapter,
      };
    });
    const before = hash(rows),
      query = vi.fn(async () => rows);
    const c = await personalFictionContext(
      { query } as unknown as Database,
      randomUUID(),
      fixtures[3]!.input.input.branchId,
      fixtures[3]!.memory,
    );
    expect(new Set(rows.map((r) => r.period_id)).size).toBe(4);
    expect(c.sequenceHistory!.map((p) => p.periodId)).toEqual(
      rows.slice(-3).map((r) => r.period_id),
    );
    expect(c.sequenceSignatureHistory).toHaveLength(2);
    expect(c.sequenceSignatureHistory![0]!.periodId).toBe(rows[2]!.period_id);
    expect(hash(rows)).toBe(before);
    rows[2]!.artifact.bindings.editorialOutputHash = '0'.repeat(64);
    await expect(
      personalFictionContext(
        { query } as unknown as Database,
        randomUUID(),
        fixtures[3]!.input.input.branchId,
        fixtures[3]!.memory,
      ),
    ).rejects.toThrow();
  });
  it('rejects ambiguous none flags and keeps quiet or persistent misunderstanding metadata valid', () => {
    const s = fictionSignatureFixture(randomUUID());
    expect(
      fictionSequenceSignatureSchema.safeParse({
        ...s,
        rhetoricalFlags: ['none', 'object_tableau'],
      }).success,
    ).toBe(false);
    for (const response of ['misunderstand', 'no_correction_arc'])
      expect(
        fictionSequenceSignatureSchema.safeParse({
          ...s,
          protagonistResponse: response,
          resolutionMode: 'unresolved',
        }).success,
      ).toBe(true);
  });
});
