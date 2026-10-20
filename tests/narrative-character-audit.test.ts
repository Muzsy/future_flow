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
  });
});
