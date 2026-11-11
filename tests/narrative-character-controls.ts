import type {
  CharacterAuditChapter,
  CharacterAuditDelta,
  CharacterAuditSequence,
} from '../scripts/lib/narrative-character-audit';

// Synthetic negative controls for the character audit (plan section 53) with
// a good counter-example. Fictional people only; no model output.
const NESSA = '00000000-0000-4000-8000-000000000011';
const PERIOD0 = '00000000-0000-4000-8000-000000000901';
const goalText =
  'Complete a small illustration portfolio and obtain concrete outside feedback.';
const actors = [{ actorId: NESSA, label: 'Nessa', kind: 'fictional' as const }];

const state = (over: Record<string, unknown> = {}): CharacterAuditDelta => ({
  addedProfiles: [
    {
      actorId: NESSA,
      socialRole: 'Friend who works shifts',
      coreWant: 'Wants easy, unplanned time with people she trusts.',
      independentConcern:
        'Protecting her free weekends, already overcommitted.',
      conflictStyle: 'Avoids long abstract discussion and turns blunt.',
      attentionStyle: 'Notices practical inconvenience before intent.',
      voiceCue: 'Short, dry, jokes to deflect.',
      establishedAtPeriodId: PERIOD0,
      ...over,
    },
  ],
  dynamicUpdates: [
    {
      actorId: NESSA,
      currentAim: 'Keeping the coming weekend free.',
      currentPressure: 'A double shift is coming up this month.',
      unresolvedMatter: null,
    },
  ],
  relationshipUpdates: [],
});

const chapter = (
  periodIndex: number,
  paragraphs: string[],
  delta: CharacterAuditDelta | null = null,
  character: CharacterAuditChapter['character'] = null,
): CharacterAuditChapter => ({
  periodIndex,
  body: paragraphs.join('\n\n'),
  delta,
  character,
});
const sequence = (
  id: string,
  chapters: CharacterAuditChapter[],
): CharacterAuditSequence => ({ id, goalText, actors, chapters });
const repeat = <T>(n: number, make: (i: number) => T) =>
  Array.from({ length: n }, (_, i) => make(i));

// The good counter-example: Nessa lives her own life next to the portfolio.
export const goodSequence = () =>
  sequence(
    'good',
    repeat(4, (i) =>
      chapter(
        i,
        [
          `Mara carried the folder to the corner table and waited for the kettle to settle.`,
          `Nessa came in from the street talking about her weekends. "The double shift moved again," she said, "so I am protecting Saturday whatever happens."`,
          `Mara nodded and asked about the cat instead. Nessa told a long, wandering story about the vet, the waiting room and a stranger's umbrella.`,
          `Only when the tea was finished did Nessa glance at the drawings. "That one is nice," she said, and went back to her shift rota.`,
          `Mara walked home the long way, thinking about the umbrella and the rota, and left the folder closed on the shelf.`,
        ],
        i === 0 ? state() : null,
        {
          projectionBytes: 2100,
          deltaBytes: 900,
          omittedActors: 0,
          omitted: [],
        },
      ),
    ),
  );

// A. Functional feedback NPC: reads the work, gives one useful criticism,
// the protagonist changes it, every chapter.
export const functionalFeedbackNpc = () =>
  sequence(
    'control-A-functional-feedback',
    repeat(4, (i) =>
      chapter(
        i,
        [
          `Mara laid the drawings out on the table.`,
          `Nessa studied them and gave her feedback: the horizon felt too heavy.`,
          `That evening Mara redrew the horizon and decided to keep the lighter version.`,
          `She sent the new sheet to Nessa the next morning.`,
        ],
        i === 0 ? state() : null,
      ),
    ),
  );

// B. Perfect topical discipline: every conversation with Nessa is about the
// protagonist's portfolio.
export const perfectTopicalDiscipline = () =>
  sequence(
    'control-B-topical-discipline',
    repeat(4, (i) =>
      chapter(
        i,
        [
          `Mara met Nessa near the station to go over the illustration portfolio.`,
          `Nessa wanted to talk about the portfolio and the outside feedback Mara still needed.`,
          `They went through the illustration list again, and Nessa asked which concrete piece should be complete next.`,
          `On the way back Nessa returned to the portfolio once more.`,
        ],
        i === 0 ? state() : null,
      ),
    ),
  );

// C. Instant emotional resolution: conflict, two paragraphs, mutual understanding.
export const instantResolution = () =>
  sequence(
    'control-C-instant-resolution',
    repeat(4, (i) =>
      chapter(
        i,
        [
          `Mara and Nessa argued about the deadline and Nessa was upset.`,
          `They stood in the kitchen for a minute.`,
          `Then Nessa said she was sorry, Mara said she understood, and the whole thing was over.`,
          `They finished the tea together.`,
        ],
        i === 0 ? state() : null,
      ),
    ),
  );

// D. Personality ignored: the stored profile avoids long abstract discussion,
// the chapter gives her a long workshop-style interpretation.
export const personalityIgnored = () =>
  sequence('control-D-personality-ignored', [
    chapter(
      0,
      [
        `Mara showed Nessa the drawings.`,
        `Nessa said, "The way the figures lean into the lower corner suggests that the whole sequence is really about distance and the slow loss of attention between people, and I think the second panel makes that plainer than the third, because the empty chair carries the argument that the dialogue never states, and that quiet absence is what a viewer will carry away from the page."`,
        `Mara wrote none of it down.`,
      ],
      state(),
    ),
  ]);

// E. Forced messiness: every chapter someone is late, something breaks, a quarrel.
export const forcedMessiness = () =>
  sequence(
    'control-E-forced-messiness',
    repeat(4, (i) =>
      chapter(
        i,
        [
          `Nessa arrived late, as usual.`,
          `A cup spilled across the table and the lamp was broken before they sat down.`,
          `Within minutes they had argued about the room.`,
        ],
        i === 0 ? state() : null,
      ),
    ),
  );

// F. Forced embodiment: bodily discomfort in every chapter.
export const forcedEmbodiment = () =>
  sequence(
    'control-F-forced-embodiment',
    repeat(4, (i) =>
      chapter(
        i,
        [
          `Mara woke with a headache and carried it to the table.`,
          `By noon her back was stiff and Nessa's words arrived through the throbbing.`,
        ],
        i === 0 ? state() : null,
      ),
    ),
  );

// G. Melodrama regression: a small art problem becomes an identity crisis.
export const melodramaRegression = () =>
  sequence('control-G-melodrama', [
    chapter(0, [
      `A corner of one drawing smudged, and Mara was devastated.`,
      `She was sobbing over the ruined page and called the whole project a crisis.`,
    ]),
  ]);

// A stored unresolved matter that later chapters never touch again.
export const droppedUnresolved = () =>
  sequence('control-unresolved-dropped', [
    chapter(
      0,
      [
        `Nessa mentioned that the art reviews were wearing on her.`,
        `Mara promised to stop turning meetings into critiques.`,
      ],
      {
        ...state(),
        relationshipUpdates: [
          {
            actorId: NESSA,
            currentDynamic: 'Warm friendship strained by feedback.',
            expectation: 'Expects ordinary shared time.',
            unresolvedInteraction:
              'Protagonist keeps turning casual meetings into critique sessions.',
          },
        ],
      },
    ),
    chapter(1, [`Mara spent the week at the supply shop.`]),
    chapter(2, [`Mara finished two pages and slept badly.`]),
  ]);

// Omission evidence: three relevant people did not fit the projection.
export const omissionEvidence = () =>
  sequence('omissions', [
    chapter(0, [`A quiet chapter without people.`], null, {
      projectionBytes: 6300,
      deltaBytes: 800,
      omittedActors: 2,
      omitted: [
        { actorId: 'a', reasons: ['open_thread', 'recent_change'] },
        { actorId: 'b', reasons: ['overdue_private_life'] },
      ],
    }),
    chapter(1, [`Another quiet chapter.`], null, {
      projectionBytes: 6100,
      deltaBytes: 700,
      omittedActors: 0,
      omitted: [],
    }),
  ]);
