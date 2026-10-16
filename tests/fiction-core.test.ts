import { randomUUID } from 'node:crypto';
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
});
