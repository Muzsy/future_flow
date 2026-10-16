import { randomUUID, createHash } from 'node:crypto';
import { fictionV1Policy } from '@future-flow/contracts';
import { fictionPrompts } from '../packages/ai/src/fiction-prompts';
import { describe, expect, it } from 'vitest';
import {
  fictionPolicySchema,
  fictionContextSchema,
  FICTION_MODE,
  type StoryFact,
} from '@future-flow/contracts';
import {
  validateFictionAuthor,
  fictionCanon,
  fictionPlannerRequest,
  buildFictionArtifact,
  validatedFictionCheckpoint,
  satisfiesFactV2,
  hash,
} from '@future-flow/core';
import {
  boundFictionContext,
  narrativeConfigFromEnv,
  lifeJobReadyToCommit,
  narrativeProcessingBlock,
} from '@future-flow/database';
import { fictionFixture, fictionProof } from './fiction-fixtures';

describe('creative fiction contracts, final authority and bounded continuity', () => {
  it('accepts invented outcomes absent from the planner draft and uses the final candidate', () => {
    const f = fictionFixture(),
      run = validateFictionAuthor(f.input, f.authored);
    expect(run.canon.events[0]!.summary).toContain('blue glove');
    expect(hash(f.draft.candidate)).not.toBe(hash(f.authored.candidate));
  });
  it('never projects server-only full-prefix inventories to the model', () => {
    const f = fictionFixture(),
      request = fictionPlannerRequest(f.input);
    expect(request).not.toHaveProperty('narrativeReferences');
    expect(request).not.toHaveProperty('fictionReferences');
  });
  it('rejects changed server scope, foreign actor facts and reused fact identities', () => {
    const f = fictionFixture();
    f.authored.candidate.branchId = randomUUID();
    expect(() => validateFictionAuthor(f.input, f.authored)).toThrow();
    const g = fictionFixture();
    g.authored.storyFacts[0]!.aboutActorIds = [randomUUID()];
    expect(() => validateFictionAuthor(g.input, g.authored)).toThrow();
    const h = fictionFixture();
    h.authored.storyFacts.push(h.authored.storyFacts[0]!);
    expect(() => validateFictionAuthor(h.input, h.authored)).toThrow();
  });
  it('rejects fact aliases of events and new actor IDs', () => {
    const f = fictionFixture();
    f.authored.storyFacts[0]!.id = f.authored.candidate.events[0]!.id;
    expect(() => validateFictionAuthor(f.input, f.authored)).toThrow();
  });
  it('rejects future or sibling supersession and non-owned remembered facts', () => {
    const f = fictionFixture();
    f.authored.storyFacts[0]!.supersedesFactId = randomUUID();
    expect(() => validateFictionAuthor(f.input, f.authored)).toThrow();
    const g = fictionFixture();
    if (g.input.narrativeContext?.policy.mode !== FICTION_MODE) throw Error();
    g.input.narrativeContext.storyFacts = [g.authored.storyFacts[0]!];
    expect(() => fictionPlannerRequest(g.input)).toThrow();
  });
  it('applies existing country hard constraints to the final author candidate', () => {
    const f = fictionFixture();
    f.input.input.constraints = [
      {
        id: randomUUID(),
        description: 'Stay in the starting country',
        strength: 'hard',
        lifeId: f.input.input.lifeId,
        branchId: null,
        validFrom: f.input.startDate,
        validUntil: null,
        endsOnDecisionId: null,
        predicate: {
          type: 'country_is',
          value: f.input.state.location.country,
        },
      },
    ];
    f.authored.candidate.events[0]!.changes.push({
      type: 'location_set',
      value: { country: 'US', region: null, housing: null },
    });
    expect(() => validateFictionAuthor(f.input, f.authored)).toThrow();
  });
  it('supports an explicitly supplied hours maximum without freezing every initial value', () => {
    const f = fictionFixture();
    expect(
      satisfiesFactV2(
        {
          ...f.input.state,
          resources: { energy: 60, availableHoursPerWeek: 2 },
        },
        { type: 'available_hours_at_most', hours: 2 },
      ),
    ).toBe(true);
    expect(
      satisfiesFactV2(
        {
          ...f.input.state,
          resources: { energy: 60, availableHoursPerWeek: 20 },
        },
        { type: 'available_hours_at_most', hours: 2 },
      ),
    ).toBe(false);
    expect(
      satisfiesFactV2(
        {
          ...f.input.state,
          resources: { energy: 60, availableHoursPerWeek: null },
        },
        { type: 'available_hours_at_most', hours: 2 },
      ),
    ).toBe(false);
    expect(fictionCanon(f.input, f.draft)).toBeTruthy();
  });
  it('freezes a separate nine-request policy and keeps mode activation explicit', () => {
    const f = fictionFixture();
    expect(
      fictionPolicySchema.safeParse({
        ...f.input.narrativeContext!.policy,
        maxPhysicalRequests: 8,
      }).success,
    ).toBe(false);
    expect(
      narrativeConfigFromEnv({ NARRATIVE_PIPELINE_MODE: FICTION_MODE }),
    ).toEqual({ mode: FICTION_MODE, cohortUserIds: [] });
    expect(narrativeConfigFromEnv({}).mode).toBe('legacy');
  });
  it('binds the complete author output, not just chapter text, after final review', () => {
    const f = fictionFixture(),
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
    expect(artifact.bindings.authorOutputHash).toBe(hash(f.authored));
    const changed = structuredClone(f.authored);
    changed.storyFacts[0]!.assertion += ' Changed.';
    expect(() =>
      buildFictionArtifact(
        f.input,
        f.draft,
        changed,
        f.review,
        f.fidelity,
        f.editor,
        receipts,
      ),
    ).toThrow();
    [receipts[1], receipts[2]] = [receipts[2]!, receipts[1]!];
    expect(() =>
      buildFictionArtifact(
        f.input,
        f.draft,
        f.authored,
        f.review,
        f.fidelity,
        f.editor,
        receipts,
      ),
    ).toThrow();
  });
  it('does not accept false readiness or low literary scores with pass verdicts', () => {
    const f = fictionFixture();
    f.review.readiness.periodDevelopmentSufficient = false;
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
    const g = fictionFixture();
    g.editor.scores.sceneCraft = 3;
    expect(() =>
      buildFictionArtifact(
        g.input,
        g.draft,
        g.authored,
        g.review,
        g.fidelity,
        g.editor,
        fictionProof(g),
      ),
    ).toThrow();
  });
  it('requires full persisted proof for free commit, including physical count', () => {
    const f = fictionFixture(),
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
    const cp = {
      pipelineVersion: FICTION_MODE,
      policy: artifact.policy,
      fictionDraft: f.draft,
      fictionAuthor: f.authored,
      candidate: f.authored.candidate,
      chapter: f.authored.chapter,
      planningReview: f.review,
      fidelityResult: f.fidelity,
      editorialReport: f.editor,
      receipts,
      narrativeArtifact: artifact,
      providerRequestCount: 9,
    };
    expect(validatedFictionCheckpoint(cp, f.input).artifact).toEqual(artifact);
    expect(lifeJobReadyToCommit(cp, f.input)).toBe(true);
    expect(narrativeProcessingBlock(cp, f.input)).toBeNull();
    expect(
      lifeJobReadyToCommit(
        { ...cp, fictionAuthor: { ...f.authored, storyFacts: [] } },
        f.input,
      ),
    ).toBe(false);
    expect(
      narrativeProcessingBlock({ ...cp, narrativeArtifact: null }, f.input),
    ).toBe('NARRATIVE_REQUEST_LIMIT');
    expect(
      lifeJobReadyToCommit({ ...cp, providerRequestCount: 10 }, f.input),
    ).toBe(false);
  });
  it('withholds fictional history and refuses hidden reconstruction', () => {
    const f = fictionFixture();
    const m = { ...f.memory, withheld: true };
    expect(boundFictionContext(m, []).storyFacts).toEqual([]);
    expect(
      fictionContextSchema.safeParse({
        policy: f.input.narrativeContext!.policy,
        memory: m,
        storyFacts: f.authored.storyFacts,
      }).success,
    ).toBe(false);
  });
  it('keeps continuity details while removing optional excerpts under the total UTF-8 bound', () => {
    const f = fictionFixture();
    const facts: StoryFact[] = Array.from({ length: 24 }, (_, i) => ({
      ...f.authored.storyFacts[0]!,
      id: randomUUID(),
      assertion: 'An established specific artistic detail. '.repeat(6),
      kind: i === 0 ? 'promise' : 'artifact',
    }));
    const c = boundFictionContext(f.memory, facts);
    expect(c.storyFacts.some((a) => a.id === facts[0]!.id)).toBe(true);
    expect(
      Buffer.byteLength(
        JSON.stringify({ memory: c.memory, storyFacts: c.storyFacts }),
        'utf8',
      ),
    ).toBeLessThanOrEqual(12288);
  });
  it('does not pin an entire NPC biography into a bounded prompt over a long history', () => {
    const f = fictionFixture(),
      actorId = randomUUID();
    f.memory.fictionalActors = [
      {
        actorId,
        introducedByEventId: randomUUID(),
        role: 'A fictional local organiser with a consistent voice.',
        desire: 'Wants a clear selection of pictures for visitors.',
        resistance: 'Cannot explain every picture to every visitor.',
        voiceCue: 'Asks concise concrete visual questions.',
        lastSeenPeriodId: randomUUID(),
      },
    ];
    const facts: StoryFact[] = Array.from({ length: 40 }, () => ({
      ...f.authored.storyFacts[0]!,
      id: randomUUID(),
      aboutActorIds: [actorId],
      assertion: 'A particular past detail about this fictional encounter.',
    }));
    const c = boundFictionContext(f.memory, facts);
    expect(c.storyFacts.length).toBeLessThanOrEqual(24);
    expect(c.storyFacts.some((x) => x.id === facts.at(-1)!.id)).toBe(true);
    expect(facts).toHaveLength(40);
  });
  it('rejects the measured clipped metadata in new jobs while preserving the frozen v1 parser', () => {
    const f = fictionFixture();
    const fragment =
      'After a bounded trial, choose whether to make the tested responsibility a recurr';
    f.authored.plan.decisionPattern = fragment;
    f.authored.plan.memoryDelta.decisionPattern = fragment;
    expect(() => validateFictionAuthor(f.input, f.authored)).toThrow();
    if (f.input.narrativeContext?.policy.mode !== FICTION_MODE) throw Error();
    f.input.narrativeContext.policy = fictionV1Policy();
    expect(() => validateFictionAuthor(f.input, f.authored)).not.toThrow();
  });
  it('keeps all actually measured original prompts byte-frozen', () => {
    const prompts = fictionPrompts('en', fictionV1Policy().promptVersions);
    const expected = {
      planner:
        '78e531080f03e3aa5d9a338e1519fc82f5b63d84063e4211e27f767106f6f2b7',
      author:
        '95935f278a21259f3abe024447dad8088c2fb77fbcf9a5535de6a651c117ea55',
      review:
        'edcdf6efe6f09b13d2e22911f24702218d4c1ca4ad804ac5020c80a56ae78db6',
      fidelity:
        '0af915d7eceacd19283e6b0300e85cf014861fc57028a6f7395b0f6f651ee25b',
      editor:
        '620604cf2ffa68b699ff4abe9cfa4a8444db13a9848c6a80525a9adef82e38cc',
    };
    expect(
      Object.fromEntries(
        Object.entries(prompts).map(([k, v]) => [
          k,
          createHash('sha256').update(v).digest('hex'),
        ]),
      ),
    ).toEqual(expected);
    expect(
      fictionPolicySchema.safeParse({
        ...fictionV1Policy(),
        promptVersions: {
          ...fictionV1Policy().promptVersions,
          writer: 'life_fiction_author.v2',
        },
      }).success,
    ).toBe(false);
  });
  it('keeps new thread and story fact identities distinct', () => {
    const f = fictionFixture(),
      fact = f.authored.storyFacts[0]!;
    f.authored.plan.memoryDelta.threadUpdates = [
      {
        id: fact.id,
        originPeriodId: f.authored.candidate.periodId,
        originEventId: fact.introducedByEventId,
        kind: 'goal',
        summary:
          'A concrete open question from the new encounter remains unresolved.',
        status: 'open',
        dueByPeriodOffset: 2,
        lastTouchedPeriodId: f.authored.candidate.periodId,
        eventRefs: [fact.introducedByEventId],
      },
    ];
    expect(() => validateFictionAuthor(f.input, f.authored)).toThrow();
  });
});
