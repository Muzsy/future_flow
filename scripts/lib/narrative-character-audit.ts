import { seriesParagraphs, seriesWords } from '@future-flow/core';
import { narrativeProfiles } from '../../tests/narrative-fixtures';

// Provider-free character diagnostics over stored evaluation runs (plan
// section 43). Every counter is evidence for a human reader, never a quota or
// a schedule ("every 2 chapters an NPC must discuss their own life" would turn
// the story mechanical), and nothing here is wired into a release gate. The
// heuristics read English prose only; thresholds are named and provisional.
export const CHARACTER_AUDIT_VERSION = '1.0.0';
// A pattern that recurs in at least this share of the relevant chapters (and
// at least MIN_CHAPTERS of them) raises its diagnostic signal.
export const CHARACTER_AUDIT_SHARE = 0.75;
export const CHARACTER_AUDIT_MIN_CHAPTERS = 2;
const LONG_SPEECH_WORDS = 35;
const MELODRAMA_MARKERS = 3;

export type CharacterAuditActor = {
  actorId: string;
  label: string;
  kind: 'fictional' | 'supplied';
};
type Text = string | null | undefined;
// The parts of a stored character delta the audit reads.
export type CharacterAuditDelta = {
  addedProfiles?: Record<string, unknown>[];
  profileUpdates?: Record<string, unknown>[];
  dynamicUpdates?: Record<string, unknown>[];
  relationshipUpdates?: Record<string, unknown>[];
};
export type CharacterAuditChapter = {
  periodIndex: number;
  body: string;
  delta?: CharacterAuditDelta | null;
  // The evaluation runner's per-sample record of the request-side projection.
  character?: {
    projectionBytes: number;
    deltaBytes: number;
    omittedActors: number;
    omitted?: { actorId: string; reasons: string[] }[];
    // Runner fields for the cost and repair diagnostics (all optional: older
    // reports do not carry them).
    authorOutputTokens?: number[];
    authorReasoningTokens?: number[];
    repairMessage?: string | null;
    characterRepair?: boolean;
    outputSizes?: {
      stages: {
        task: string;
        outputChars: number;
        outputBytes: number;
        estimatedTokens: number;
        requestBytes?: number | null;
      }[];
      proseChars: number;
      proseBytes: number;
      deltaChars: number;
      deltaBytes: number;
      estimatedProseTokens: number;
      estimatedDeltaTokens: number;
    };
  } | null;
  // Per-sample run facts, copied from the stored report for the generation
  // diagnostics (calls, repair, elapsed time).
  run?: {
    requestCount: number | null;
    repairUsed: boolean | null;
    errorCode: string | null;
    elapsedMs: number | null;
  } | null;
};
export type CharacterAuditSequence = {
  id: string;
  goalText: string;
  actors: CharacterAuditActor[];
  chapters: CharacterAuditChapter[];
};

const stop = new Set(
  (
    'about after again against because before being between could doing during each ' +
    'every first from have having into just like more most much other over really ' +
    'right should since small some still than that their them then there these they ' +
    'this those through under until very want wants well were what when where which ' +
    'while with within without would your'
  ).split(' '),
);
const content = (text: Text) =>
  seriesWords(text ?? '').filter((w) => w.length >= 5 && !stop.has(w));

const feedbackWords = new Set([
  'feedback',
  'critique',
  'advice',
  'suggested',
  'suggestion',
  'pointed',
  'recommended',
  'noted',
]);
const changeWords = new Set([
  'redrew',
  'revised',
  'rewrote',
  'changed',
  'adjusted',
  'reworked',
  'decided',
  'resolved',
  'realised',
  'realized',
]);
const conflictWords = new Set([
  'argued',
  'argument',
  'quarrel',
  'angry',
  'furious',
  'upset',
  'snapped',
  'tense',
  'bitter',
]);
const resolutionWords = new Set([
  'understood',
  'forgave',
  'sorry',
  'hugged',
  'apologised',
  'apologized',
  'reconciled',
  'relief',
  'agreed',
]);
const mess = {
  lateness: new Set(['late', 'delayed', 'overslept']),
  breakage: new Set([
    'broke',
    'broken',
    'shattered',
    'cracked',
    'spilled',
    'dropped',
    'jammed',
  ]),
  dispute: new Set(['argued', 'argument', 'quarrel', 'shouted', 'bickered']),
};
const bodyDiscomfort = new Set([
  'headache',
  'ache',
  'aching',
  'nausea',
  'backache',
  'sore',
  'cramp',
  'throbbing',
  'dizzy',
  'stiff',
  'exhausted',
]);
const bodyAndSense = new Set([
  'hands',
  'hand',
  'shoulders',
  'shoulder',
  'fingers',
  'feet',
  'knees',
  'throat',
  'cold',
  'warm',
  'smell',
  'smelled',
  'steam',
  'rain',
  'damp',
  'noise',
  'heavy',
  'ache',
  'tired',
  'breath',
  'jaw',
  'wrist',
  'eyes',
]);
const intensity = new Set([
  'devastated',
  'shattered',
  'sobbing',
  'screamed',
  'collapsed',
  'agony',
  'crisis',
  'ruined',
  'betrayed',
  'furious',
  'despair',
  'unforgivable',
]);
const briefCue = /\b(brief|short|avoids?|dry|blunt|few words|little)\b/i;

const count = (words: string[], set: Set<string>) =>
  words.filter((w) => set.has(w)).length;
const round = (n: number) => Math.round(n * 100) / 100;
const share = (a: number, b: number) => (b ? round(a / b) : 0);
const recurs = (hit: number, of: number) =>
  hit >= CHARACTER_AUDIT_MIN_CHAPTERS &&
  of > 0 &&
  hit / of >= CHARACTER_AUDIT_SHARE;

// Names a person is called by in prose: the label's capitalised words that
// are not a role or the "Fictional" fixture marker.
const roleWords = new Set([
  'fictional',
  'older',
  'younger',
  'school',
  'partner',
  'father',
  'mother',
  'sister',
  'brother',
  'flatmate',
  'friend',
  'aunt',
  'neighbour',
  'cousin',
]);
export function actorNameWords(label: string) {
  return seriesWords(label).filter((w) => !roleWords.has(w));
}

// Cumulative stored state per actor, rebuilt from the chapters' deltas.
type Known = {
  concern: string[];
  cues: string;
  unresolved: { text: string; since: number } | null;
};
function knownState(chapters: CharacterAuditChapter[], upTo: number) {
  const known = new Map<string, Known>();
  const entry = (id: string) => {
    let k = known.get(id);
    if (!k) known.set(id, (k = { concern: [], cues: '', unresolved: null }));
    return k;
  };
  for (const chapter of chapters.filter((c) => c.periodIndex <= upTo)) {
    const d = chapter.delta;
    if (!d) continue;
    for (const p of [...(d.addedProfiles ?? []), ...(d.profileUpdates ?? [])]) {
      const k = entry(String(p.actorId));
      k.concern = [
        ...content(p.coreWant as Text),
        ...content(p.independentConcern as Text),
      ];
      k.cues = [p.conflictStyle, p.attentionStyle, p.voiceCue].join(' ');
    }
    for (const u of d.dynamicUpdates ?? []) {
      const k = entry(String(u.actorId));
      k.concern = [
        ...new Set([
          ...k.concern,
          ...content(u.currentAim as Text),
          ...content(u.currentPressure as Text),
        ]),
      ];
      k.unresolved = u.unresolvedMatter
        ? { text: String(u.unresolvedMatter), since: chapter.periodIndex }
        : null;
    }
    for (const r of d.relationshipUpdates ?? []) {
      const k = entry(String(r.actorId));
      if (r.unresolvedInteraction)
        k.unresolved = {
          text: String(r.unresolvedInteraction),
          since: chapter.periodIndex,
        };
      else if (!k.unresolved || k.unresolved.since <= chapter.periodIndex)
        k.unresolved = null;
    }
  }
  return known;
}

export function auditCharacters(sequence: CharacterAuditSequence) {
  const chapters = [...sequence.chapters].sort(
    (a, b) => a.periodIndex - b.periodIndex,
  );
  const goalWords = new Set(content(sequence.goalText));
  const paragraphsOf = chapters.map((c) => seriesParagraphs(c.body));
  const perActor = sequence.actors.map((actor) => {
    const names = new Set(actorNameWords(actor.label));
    const rows = chapters.map((chapter, ci) => {
      const paragraphs = paragraphsOf[ci]!;
      const mentioned = paragraphs
        .map((text, index) => ({ text, index }))
        .filter(({ text }) => seriesWords(text).some((w) => names.has(w)));
      const known = knownState(chapters, chapter.periodIndex).get(
        actor.actorId,
      );
      const own = new Set(known?.concern ?? []);
      const words = new Set(mentioned.flatMap((m) => seriesWords(m.text)));
      const ownReferenced =
        own.size > 0 && [...own].filter((w) => words.has(w)).length >= 2;
      const goalOnly =
        mentioned.length >= 2 &&
        mentioned.every((m) =>
          seriesWords(m.text).some((w) => goalWords.has(w)),
        );
      // Feedback by the person followed within two paragraphs by the
      // protagonist visibly changing course.
      const functional = mentioned.some(({ text, index }) => {
        if (!count(seriesWords(text), feedbackWords)) return false;
        return paragraphs
          .slice(index, index + 3)
          .some((p) => count(seriesWords(p), changeWords));
      });
      const longSpeech =
        !!known &&
        briefCue.test(known.cues) &&
        mentioned.some(({ text }) =>
          [...text.matchAll(/["“]([^"”]+)["”]/gu)].some(
            (m) => seriesWords(m[1]!).length >= LONG_SPEECH_WORDS,
          ),
        );
      return {
        periodIndex: chapter.periodIndex,
        present: mentioned.length > 0,
        measurable: own.size > 0,
        ownReferenced,
        goalOnly,
        functional,
        longSpeech,
      };
    });
    const present = rows.filter((r) => r.present);
    // A stored unresolved matter that the person never touches again.
    const lastKnown = knownState(chapters, Infinity).get(actor.actorId);
    const unresolved = lastKnown?.unresolved ?? null;
    const unresolvedWords = new Set(content(unresolved?.text));
    const later = rows.filter(
      (r) => unresolved && r.periodIndex > unresolved.since,
    );
    const laterTouch = later.some((r) => {
      const ci = chapters.findIndex((c) => c.periodIndex === r.periodIndex);
      const names2 = paragraphsOf[ci]!.filter((p) =>
        seriesWords(p).some((w) => names.has(w)),
      );
      const w = new Set(names2.flatMap((p) => seriesWords(p)));
      return [...unresolvedWords].filter((x) => w.has(x)).length >= 2;
    });
    return {
      actorId: actor.actorId,
      label: actor.label,
      kind: actor.kind,
      chaptersPresent: present.length,
      ownConcernReferencedChapters: rows.filter((r) => r.ownReferenced).length,
      // Only people with stored own state can be judged on it.
      ownAimNeverShown:
        actor.kind === 'fictional' &&
        present.length >= 2 &&
        rows.some((r) => r.measurable) &&
        !rows.some((r) => r.ownReferenced),
      goalOnlyChapters: rows.filter((r) => r.goalOnly).length,
      topicalDiscipline:
        present.length >= CHARACTER_AUDIT_MIN_CHAPTERS &&
        rows.filter((r) => r.goalOnly).length === present.length,
      functionalFeedbackChapters: rows.filter((r) => r.functional).length,
      functionalFeedbackRecurs: recurs(
        rows.filter((r) => r.functional).length,
        present.length,
      ),
      longSpeechAgainstBriefCue: rows
        .filter((r) => r.longSpeech)
        .map((r) => r.periodIndex),
      unresolvedDropped:
        !!unresolved && later.length >= 2 && !laterTouch
          ? { since: unresolved.since }
          : null,
    };
  });

  const wordsByChapter = chapters.map((c) => seriesWords(c.body));
  const conflictResolutionChapters = chapters.filter((_, ci) => {
    const ps = paragraphsOf[ci]!.map((p) => seriesWords(p));
    return ps.some(
      (w, i) =>
        count(w, conflictWords) > 0 &&
        ps.slice(i, i + 3).some((x) => count(x, resolutionWords) > 0),
    );
  }).length;
  const conflictChapters = wordsByChapter.filter((w) =>
    count(w, conflictWords),
  ).length;
  const messChapters = wordsByChapter.filter(
    (w) => Object.values(mess).filter((set) => count(w, set) > 0).length >= 2,
  ).length;
  const discomfortChapters = wordsByChapter.filter((w) =>
    count(w, bodyDiscomfort),
  ).length;
  const melodramaChapters = wordsByChapter.filter(
    (w) => count(w, intensity) >= MELODRAMA_MARKERS,
  ).length;
  const total = chapters.length;
  const allWords = wordsByChapter.reduce((n, w) => n + w.length, 0);
  const omittedByReason: Record<string, number> = {};
  for (const c of chapters)
    for (const o of c.character?.omitted ?? [])
      for (const reason of o.reasons)
        omittedByReason[reason] = (omittedByReason[reason] ?? 0) + 1;

  return {
    id: sequence.id,
    chapters: total,
    actors: perActor,
    sequence: {
      conflictResolutionChapters,
      instantResolution: recurs(conflictResolutionChapters, conflictChapters),
      messChapters,
      forcedMessiness:
        total >= 3 && share(messChapters, total) >= CHARACTER_AUDIT_SHARE,
      bodyDiscomfortChapters: discomfortChapters,
      forcedEmbodiment:
        total >= 3 && share(discomfortChapters, total) >= CHARACTER_AUDIT_SHARE,
      // Recorded, no threshold: too little data to say what is thin.
      embodimentMarkersPer1000Words: round(
        (wordsByChapter.reduce((n, w) => n + count(w, bodyAndSense), 0) /
          Math.max(1, allWords)) *
          1000,
      ),
      melodramaChapters,
      melodramaRisk: melodramaChapters > 0,
    },
    // Request-side visibility: how many relevant people the 8 KiB projection
    // could not show, and why they were relevant.
    omissions: {
      perChapter: chapters.map((c) => ({
        periodIndex: c.periodIndex,
        omittedActors: c.character?.omittedActors ?? null,
        projectionBytes: c.character?.projectionBytes ?? null,
        deltaBytes: c.character?.deltaBytes ?? null,
        reasons: (c.character?.omitted ?? []).map((o) => o.reasons),
      })),
      chaptersWithOmission: chapters.filter(
        (c) => (c.character?.omittedActors ?? 0) > 0,
      ).length,
      totalOmitted: chapters.reduce(
        (n, c) => n + (c.character?.omittedActors ?? 0),
        0,
      ),
      byReason: omittedByReason,
    },
    // Generation-side facts the local transports can give: calls, repair and
    // its cause, and output lengths (no token usage exists there, so the
    // token numbers are estimates and the cost gate is not decidable from
    // them).
    generation: {
      perChapter: chapters.map((c) => ({
        periodIndex: c.periodIndex,
        requestCount: c.run?.requestCount ?? null,
        repairUsed: c.run?.repairUsed ?? null,
        errorCode: c.run?.errorCode ?? null,
        elapsedMs: c.run?.elapsedMs ?? null,
        characterRepair: c.character?.characterRepair ?? null,
        repairMessage: c.character?.repairMessage ?? null,
        authorOutputTokens: c.character?.authorOutputTokens ?? null,
        authorReasoningTokens: c.character?.authorReasoningTokens ?? null,
        outputSizes: c.character?.outputSizes ?? null,
      })),
      chaptersWithRepair: chapters.filter((c) => c.run?.repairUsed === true)
        .length,
      totalRequests: chapters.reduce(
        (n, c) => n + (c.run?.requestCount ?? 0),
        0,
      ),
      estimatedProseTokens: chapters.reduce(
        (n, c) => n + (c.character?.outputSizes?.estimatedProseTokens ?? 0),
        0,
      ),
      estimatedDeltaTokens: chapters.reduce(
        (n, c) => n + (c.character?.outputSizes?.estimatedDeltaTokens ?? 0),
        0,
      ),
    },
  };
}

// ---- stored evaluation reports -------------------------------------------

type StoredSample = {
  fixtureId: string;
  mode?: string;
  kind: string;
  periodIndex: number;
  chapter?: { body: string };
  errorCode?: string | null;
  canon?: {
    changes?: { type: string; value?: { id: string; label: string } }[];
  }[];
  plan?: { characterDelta?: CharacterAuditDelta } | null;
  character?: CharacterAuditChapter['character'];
  requestCount?: number;
  repairUsed?: boolean;
  elapsedMs?: number;
};
export type CharacterAuditRun = { label: string; samples: StoredSample[] };

export function characterAuditSequences(
  runs: CharacterAuditRun[],
): CharacterAuditSequence[] {
  const out: CharacterAuditSequence[] = [];
  for (const run of runs) {
    const accepted = run.samples.filter(
      (s) => !s.errorCode && s.chapter?.body && s.mode !== 'legacy',
    );
    for (const fixtureId of [
      ...new Set(accepted.map((s) => s.fixtureId)),
    ].sort())
      for (const kind of ['full', 'fork'] as const) {
        const samples = accepted
          .filter((s) => s.fixtureId === fixtureId && s.kind === kind)
          .sort((a, b) => a.periodIndex - b.periodIndex);
        if (!samples.length) continue;
        const profile = narrativeProfiles.find((p) => p.id === fixtureId);
        const actors = new Map<string, CharacterAuditActor>();
        for (const r of profile?.relationships ?? [])
          actors.set(`supplied:${r.label}`, {
            actorId: `supplied:${r.label}`,
            label: r.label,
            kind: 'supplied',
          });
        for (const s of samples)
          for (const event of s.canon ?? [])
            for (const change of event.changes ?? [])
              if (change.type === 'actor_add' && change.value)
                actors.set(change.value.id, {
                  actorId: change.value.id,
                  label: change.value.label,
                  kind: 'fictional',
                });
        out.push({
          id: `${run.label}/${fixtureId}${kind === 'fork' ? '/fork' : ''}`,
          goalText: profile?.goal ?? '',
          actors: [...actors.values()],
          chapters: samples.map((s) => ({
            periodIndex: s.periodIndex,
            body: s.chapter!.body,
            delta: s.plan?.characterDelta ?? null,
            character: s.character ?? null,
            run: {
              requestCount: s.requestCount ?? null,
              repairUsed: s.repairUsed ?? null,
              errorCode: s.errorCode ?? null,
              elapsedMs: s.elapsedMs ?? null,
            },
          })),
        });
      }
  }
  return out;
}

export function narrativeCharacterAudit(runs: CharacterAuditRun[]) {
  return {
    version: CHARACTER_AUDIT_VERSION,
    note: 'Deterministic heuristics over stored prose and character deltas; evidence for human reading, not a literary grade, a quota or a release gate.',
    runs: runs.map((r) => r.label),
    sequences: characterAuditSequences(runs).map(auditCharacters),
  };
}

export function characterAuditMarkdown(
  audit: ReturnType<typeof narrativeCharacterAudit>,
) {
  const lines = [
    `# Narrative character audit ${audit.version}`,
    '',
    audit.note,
  ];
  for (const s of audit.sequences) {
    lines.push('', `## ${s.id} (${s.chapters} chapters)`, '');
    lines.push(
      `- Instant conflict resolution: ${s.sequence.conflictResolutionChapters} chapters${s.sequence.instantResolution ? ' [SIGNAL]' : ''}`,
      `- Forced messiness: ${s.sequence.messChapters}/${s.chapters}${s.sequence.forcedMessiness ? ' [SIGNAL]' : ''}`,
      `- Body discomfort in every chapter: ${s.sequence.bodyDiscomfortChapters}/${s.chapters}${s.sequence.forcedEmbodiment ? ' [SIGNAL]' : ''}; embodiment markers per 1000 words: ${s.sequence.embodimentMarkersPer1000Words}`,
      `- Melodrama markers: ${s.sequence.melodramaChapters} chapters${s.sequence.melodramaRisk ? ' [SIGNAL]' : ''}`,
      `- Omitted from the projection: ${s.omissions.totalOmitted} in ${s.omissions.chaptersWithOmission} chapters (${
        Object.entries(s.omissions.byReason)
          .map(([r, n]) => `${r} ×${n}`)
          .join(', ') || 'none'
      })`,
    );
    lines.push(
      `- Generation: ${s.generation.totalRequests} requests, repair in ${s.generation.chaptersWithRepair}/${s.chapters} chapters; estimated output tokens prose ${s.generation.estimatedProseTokens}, delta ${s.generation.estimatedDeltaTokens} (estimates, not usage)`,
    );
    for (const a of s.actors)
      lines.push(
        `- ${a.label} (${a.kind}): present ${a.chaptersPresent}, own concern shown ${a.ownConcernReferencedChapters}, goal-only ${a.goalOnlyChapters}${a.topicalDiscipline ? ' [SIGNAL topical]' : ''}, functional feedback ${a.functionalFeedbackChapters}${a.functionalFeedbackRecurs ? ' [SIGNAL functional]' : ''}${a.ownAimNeverShown ? ' [SIGNAL own aim never shown]' : ''}${a.longSpeechAgainstBriefCue.length ? ` [SIGNAL long speech ch${a.longSpeechAgainstBriefCue.map((i) => i + 1).join(',')}]` : ''}${a.unresolvedDropped ? ` [SIGNAL unresolved dropped since ch${a.unresolvedDropped.since + 1}]` : ''}`,
      );
  }
  return lines.join('\n') + '\n';
}
