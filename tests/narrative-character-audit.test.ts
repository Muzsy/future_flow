import { describe, expect, it } from 'vitest';
import {
  auditCharacters,
  characterAuditMarkdown,
  characterAuditSequences,
  narrativeCharacterAudit,
  type CharacterAuditSequence,
} from '../scripts/lib/narrative-character-audit';
import {
  droppedUnresolved,
  forcedEmbodiment,
  forcedMessiness,
  functionalFeedbackNpc,
  goodSequence,
  instantResolution,
  melodramaRegression,
  omissionEvidence,
  perfectTopicalDiscipline,
  personalityIgnored,
} from './narrative-character-controls';

const signals = (s: CharacterAuditSequence) => {
  const a = auditCharacters(s);
  const nessa = a.actors[0]!;
  return {
    functional: nessa.functionalFeedbackRecurs,
    topical: nessa.topicalDiscipline,
    instant: a.sequence.instantResolution,
    longSpeech: nessa.longSpeechAgainstBriefCue.length > 0,
    messy: a.sequence.forcedMessiness,
    embodiment: a.sequence.forcedEmbodiment,
    melodrama: a.sequence.melodramaRisk,
    dropped: nessa.unresolvedDropped !== null,
    aimNeverShown: nessa.ownAimNeverShown,
  };
};
const none = {
  functional: false,
  topical: false,
  instant: false,
  longSpeech: false,
  messy: false,
  embodiment: false,
  melodrama: false,
  dropped: false,
  aimNeverShown: false,
};

describe('character audit negative controls (plan section 53)', () => {
  it('raises no signal on the good counter-example, where the person lives her own life', () => {
    expect(signals(goodSequence())).toEqual(none);
    const nessa = auditCharacters(goodSequence()).actors[0]!;
    expect(nessa.chaptersPresent).toBe(4);
    expect(nessa.ownConcernReferencedChapters).toBeGreaterThan(0);
  });
  it.each([
    ['A functional feedback NPC', functionalFeedbackNpc, 'functional'],
    ['B perfect topical discipline', perfectTopicalDiscipline, 'topical'],
    ['C instant emotional resolution', instantResolution, 'instant'],
    ['D personality ignored', personalityIgnored, 'longSpeech'],
    ['E forced messiness', forcedMessiness, 'messy'],
    ['F forced embodiment', forcedEmbodiment, 'embodiment'],
    ['G melodrama regression', melodramaRegression, 'melodrama'],
    ['unresolved matter dropped', droppedUnresolved, 'dropped'],
  ] as const)('%s raises its own signal', (_name, make, key) => {
    const got = signals(make());
    expect(got[key]).toBe(true);
  });
  it('does not mistake topical discipline for a person with their own aim, and flags the missing own aim', () => {
    const a = auditCharacters(perfectTopicalDiscipline());
    expect(a.actors[0]!.ownConcernReferencedChapters).toBe(0);
    expect(a.actors[0]!.ownAimNeverShown).toBe(true);
  });
  it('treats forced messiness and forced embodiment as bad, not as realism', () => {
    // "Not just more conflict": more mess alone must not pass the audit.
    expect(signals(forcedMessiness()).messy).toBe(true);
    expect(signals(forcedEmbodiment()).embodiment).toBe(true);
    expect(signals(goodSequence()).messy).toBe(false);
  });
});

describe('character audit omission evidence', () => {
  it('counts omitted people per chapter and by relevance reason', () => {
    const a = auditCharacters(omissionEvidence());
    expect(a.omissions.totalOmitted).toBe(2);
    expect(a.omissions.chaptersWithOmission).toBe(1);
    expect(a.omissions.byReason).toEqual({
      open_thread: 1,
      recent_change: 1,
      overdue_private_life: 1,
    });
    expect(a.omissions.perChapter[0]).toMatchObject({
      omittedActors: 2,
      projectionBytes: 6300,
    });
  });
});

describe('character audit over stored reports', () => {
  const report = {
    label: 'run',
    samples: [0, 1].map((periodIndex) => ({
      fixtureId: 'creative-portfolio',
      mode: 'narrative-v1',
      kind: 'full',
      periodIndex,
      chapter: { body: 'Mara met Nessa.\n\nNessa spoke about her weekends.' },
      canon:
        periodIndex === 0
          ? [
              {
                changes: [
                  {
                    type: 'actor_add',
                    value: { id: 'actor-1', label: 'Odile' },
                  },
                ],
              },
            ]
          : [],
      plan:
        periodIndex === 0 ? { characterDelta: { addedProfiles: [] } } : null,
      character: {
        projectionBytes: 10,
        deltaBytes: 5,
        omittedActors: 1,
        omitted: [{ actorId: 'x', reasons: ['recent_change'] }],
      },
    })),
  };
  it('rebuilds the cast, goal and deltas from a runner report and renders it', () => {
    const [seq] = characterAuditSequences([report]);
    expect(seq!.actors.map((a) => a.label)).toEqual([
      'Fictional mother Bernadette',
      'Fictional school friend Nessa',
      'Odile',
    ]);
    expect(seq!.goalText).toContain('portfolio');
    const audit = narrativeCharacterAudit([report]);
    expect(audit.sequences[0]!.omissions.totalOmitted).toBe(2);
    expect(characterAuditMarkdown(audit)).toContain(
      'Narrative character audit',
    );
  });
  it('carries the runner generation facts, repair cause and output lengths into the audit', () => {
    const sized = {
      label: 'run',
      samples: [0, 1].map((periodIndex) => ({
        fixtureId: 'creative-portfolio',
        kind: 'full',
        periodIndex,
        chapter: { body: 'Mara met Nessa.' },
        requestCount: periodIndex === 0 ? 5 : 8,
        repairUsed: periodIndex === 1,
        elapsedMs: 1000 * (periodIndex + 1),
        errorCode: null,
        character: {
          projectionBytes: 10,
          deltaBytes: 5,
          omittedActors: 0,
          authorOutputTokens: periodIndex === 0 ? [5800] : [5800, 6100],
          authorReasoningTokens: [0],
          repairMessage: periodIndex === 1 ? 'The plan repeats.' : null,
          characterRepair: false,
          outputSizes: {
            stages: [
              {
                task: 'life_narrative_chapter',
                outputChars: 20000,
                outputBytes: 20100,
                estimatedTokens: 5743,
              },
            ],
            proseChars: 4100,
            proseBytes: 4200,
            deltaChars: 1700,
            deltaBytes: 1700,
            estimatedProseTokens: 1200,
            estimatedDeltaTokens: 486,
          },
        },
      })),
    };
    const g = narrativeCharacterAudit([sized]).sequences[0]!.generation;
    expect(g.totalRequests).toBe(13);
    expect(g.chaptersWithRepair).toBe(1);
    expect(g.estimatedProseTokens).toBe(2400);
    expect(g.estimatedDeltaTokens).toBe(972);
    expect(g.perChapter[1]).toMatchObject({
      requestCount: 8,
      repairUsed: true,
      repairMessage: 'The plan repeats.',
      authorOutputTokens: [5800, 6100],
    });
    expect(g.perChapter[0]!.outputSizes?.stages[0]!.estimatedTokens).toBe(5743);
    expect(characterAuditMarkdown(narrativeCharacterAudit([sized]))).toContain(
      'Generation: 13 requests, repair in 1/2 chapters',
    );
  });
  it('raises continuityDecisionMissing and counts embodiment per chapter', () => {
    const sample = (
      periodIndex: number,
      body: string,
      continuity: unknown,
    ) => ({
      fixtureId: 'creative-portfolio',
      kind: 'full',
      periodIndex,
      chapter: { body },
      character: {
        projectionBytes: 10,
        deltaBytes: 5,
        omittedActors: 0,
        continuity,
      },
    });
    const decided = {
      required: ['una'],
      missing: [],
      intentMissing: [],
      decisions: { carry: 1, defer: 0, resolve: 0 },
    };
    const silent = {
      required: ['una', 'fiona'],
      missing: ['una', 'fiona'],
      intentMissing: [],
      decisions: { carry: 0, defer: 0, resolve: 0 },
    };
    const ok = narrativeCharacterAudit([
      {
        label: 'run',
        samples: [sample(0, 'Mara waited.', decided)],
      },
    ]).sequences[0]!;
    expect(ok.continuity.continuityDecisionMissing).toBe(false);
    expect(ok.continuity.totalMissing).toBe(0);
    const audit = narrativeCharacterAudit([
      {
        label: 'run',
        samples: [
          sample(0, 'Mara waited.', decided),
          sample(1, 'The rain was cold and she was hungry and tired.', silent),
        ],
      },
    ]);
    const s = audit.sequences[0]!;
    expect(s.continuity.continuityDecisionMissing).toBe(true);
    expect(s.continuity.totalRequired).toBe(3);
    expect(s.continuity.totalMissing).toBe(2);
    expect(s.continuity.perChapter[1]).toMatchObject({
      required: 2,
      missing: ['una', 'fiona'],
    });
    expect(s.sequence.embodimentPerChapter).toHaveLength(2);
    expect(s.sequence.embodimentPerChapter[0]!.markers).toBe(0);
    expect(s.sequence.embodimentPerChapter[1]!.markers).toBeGreaterThan(0);
    expect(characterAuditMarkdown(audit)).toContain(
      'SIGNAL continuityDecisionMissing',
    );
  });
  it('summarises latency per stage, output tokens and schema/uuid failures for the paid measurement', () => {
    const sample = (
      periodIndex: number,
      latencies: number[],
      failures?: { malformed: number; uuid: number; rejected: number },
    ) => ({
      fixtureId: 'creative-portfolio',
      kind: 'full',
      periodIndex,
      chapter: { body: 'Mara waited.' },
      character: {
        projectionBytes: 10,
        deltaBytes: 5,
        omittedActors: 0,
        stageLatencies: latencies.map((latencyMs, i) => ({
          task: i === 0 ? 'life_narrative_plan' : 'life_narrative_chapter',
          latencyMs,
        })),
        stageTokens: [{ task: 'life_narrative_chapter', outputTokens: 4000 }],
        ...(failures ? { schemaFailures: failures } : {}),
      },
    });
    const audit = narrativeCharacterAudit([
      {
        label: 'run',
        samples: [
          sample(0, [90_000, 150_000], { malformed: 1, uuid: 1, rejected: 0 }),
          sample(1, [100_000, 182_000], { malformed: 0, uuid: 0, rejected: 1 }),
          sample(2, [110_000]),
        ],
      },
    ]);
    const m = audit.sequences[0]!.measurement;
    expect(m.schemaFailures).toEqual({ malformed: 1, uuid: 1, rejected: 1 });
    expect(m.latencyByStage.life_narrative_chapter).toEqual({
      calls: 2,
      p50Ms: 166_000,
      maxMs: 182_000,
      over150s: 1,
      over180s: 1,
    });
    expect(m.latencyByStage.life_narrative_plan).toMatchObject({
      calls: 3,
      p50Ms: 100_000,
      maxMs: 110_000,
      over150s: 0,
    });
    expect(m.outputTokensByStage.life_narrative_chapter).toEqual({
      calls: 3,
      total: 12000,
      max: 4000,
    });
    const markdown = characterAuditMarkdown(audit);
    expect(markdown).toContain(
      '1 malformed answers, 1 of them uuid-shaped, 1 requests rejected',
    );
    expect(markdown).toContain('>180 s 1 [SIGNAL deadline]');
  });
  it('is provider-free and leaves the v8 report shape alone', () => {
    const v8 = narrativeCharacterAudit([
      {
        label: 'v8',
        samples: [
          {
            fixtureId: 'creative-portfolio',
            kind: 'full',
            periodIndex: 0,
            chapter: { body: 'Plain chapter.' },
          },
        ],
      },
    ]);
    expect(v8.sequences[0]!.omissions.totalOmitted).toBe(0);
    expect(v8.sequences[0]!.omissions.perChapter[0]!.omittedActors).toBeNull();
    expect(v8.sequences[0]!.generation.perChapter[0]!.outputSizes).toBeNull();
    // No decisions recorded means no signal: v8 and older reports stay quiet.
    expect(v8.sequences[0]!.continuity.continuityDecisionMissing).toBe(false);
    expect(v8.sequences[0]!.continuity.perChapter[0]!.required).toBeNull();
  });
});
