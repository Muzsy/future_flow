import { createHash } from 'node:crypto';
import {
  FICTION_RECENT_TURNS_MAX,
  FICTION_RECURRING_CAST_MAX,
  FICTION_RESTING_TURNS_MAX,
  FICTION_ROTATING_TURN_TYPES,
  FICTION_SERIES_LEDGER_V11_BYTES,
  fictionTurnTypeSchema,
  type FictionTurnType,
} from '@future-flow/contracts';

// Deterministic, provider-free series evidence over owned chapter prose.
// The same functions feed the quality2.7 series ledger and the offline audit,
// so every signal the author/editor sees can be reproduced without a model.

export type SeriesChapter = { periodId?: string; body: string };
export type SeriesEcho = { text: string; count: number; chapters: number };

const wordPattern = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;

export function seriesWords(text: string) {
  return (text.toLocaleLowerCase('en').match(wordPattern) ?? []).map((w) =>
    w.replace(/’/g, "'"),
  );
}

export function seriesParagraphs(body: string) {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// Sentence boundaries without locale models: terminal punctuation followed by
// whitespace and an opening quote/capital, or a paragraph break.
export function seriesSentences(body: string) {
  return seriesParagraphs(body).flatMap((paragraph) =>
    paragraph
      .split(/(?<=[.!?…]["”’»)]?)\s+(?=["“‘«(]?[\p{Lu}\p{N}])/u)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function seriesOpeningStem(sentence: string, size = 3) {
  const words = seriesWords(sentence);
  return words.length > size ? words.slice(0, size).join(' ') : null;
}

// Clause starts count as openings too: v7's "Neither of you…" often followed
// a dash, colon or an opening quote rather than a full stop.
export function seriesClauses(sentence: string) {
  return sentence
    .split(/\s*[;:—–]\s+|\s+[—–]\s*|\s+(?=["“‘«]\p{Lu})/u)
    .map((c) => c.replace(/^["“‘«(]+/u, '').trim())
    .filter(Boolean);
}

function openingStems(body: string) {
  return seriesSentences(body).flatMap((s) =>
    seriesClauses(s).flatMap((c) => seriesOpeningStem(c) ?? []),
  );
}

function ngrams(words: string[], size: number) {
  const out: string[] = [];
  for (let i = 0; i + size <= words.length; i++)
    out.push(words.slice(i, i + size).join(' '));
  return out;
}

// A phrase needs some lexical weight; "and you did not" alone is grammar.
function weighty(phrase: string) {
  return phrase.split(' ').filter((w) => w.length >= 4).length >= 2;
}

function rank(a: SeriesEcho, b: SeriesEcho) {
  return (
    b.chapters - a.chapters || b.count - a.count || a.text.localeCompare(b.text)
  );
}

function tally(chapters: string[][]) {
  const total = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const items of chapters) {
    for (const item of items) total.set(item, (total.get(item) ?? 0) + 1);
    for (const item of new Set(items))
      seen.set(item, (seen.get(item) ?? 0) + 1);
  }
  return [...total.entries()].map(([text, count]) => ({
    text,
    count,
    chapters: seen.get(text)!,
  }));
}

// Sentence- and clause-initial three-word stems that recur across chapters,
// e.g. the v7 "Neither of you…" tic. Counting is evidence, never a quota.
export function seriesRepeatedOpenings(
  chapters: SeriesChapter[],
  limit = 6,
): SeriesEcho[] {
  return tally(chapters.map((c) => openingStems(c.body)))
    .filter((e) => e.chapters >= 2 && e.count >= 2)
    .sort(rank)
    .slice(0, limit);
}

// Five-word phrases reused across chapters. Windows from the same recurring
// sentence collapse to its highest-ranked phrase, so one repeated sentence
// does not fill the whole list.
export function seriesRepeatedPhrases(
  chapters: SeriesChapter[],
  limit = 6,
  size = 5,
): SeriesEcho[] {
  const minChapters = chapters.length >= 4 ? 3 : 2;
  const home = new Map<string, string>();
  const perChapter = chapters.map((c) =>
    seriesSentences(c.body).flatMap((s) => {
      const words = seriesWords(s);
      const grams = ngrams(words, size);
      for (const g of grams) if (!home.has(g)) home.set(g, words.join(' '));
      return grams;
    }),
  );
  const candidates = tally(perChapter)
    .filter((e) => e.chapters >= minChapters && weighty(e.text))
    .sort(rank);
  const chosen: SeriesEcho[] = [];
  const covered = new Set<string>();
  for (const candidate of candidates) {
    const sentence = home.get(candidate.text)!;
    // Windows sharing a three-word run also belong to the same passage.
    const parts = ngrams(candidate.text.split(' '), 3);
    if (covered.has(sentence) || parts.some((p) => covered.has(p))) continue;
    chosen.push(candidate);
    covered.add(sentence);
    parts.forEach((p) => covered.add(p));
    if (chosen.length === limit) break;
  }
  return chosen;
}

export function seriesClosingSentence(body: string, max = 200) {
  const last = seriesSentences(body).at(-1) ?? '';
  return last.length > max ? `${last.slice(0, max - 1).trimEnd()}…` : last;
}

export type SeriesEchoFinding = {
  kind: 'opening' | 'phrase' | 'within';
  text: string;
  priorChapters: number;
  occurrences: number;
};

// Which already-recurring wording does THIS chapter reuse again, and which
// opening does it repeat three or more times on its own?
export function seriesEchoFindings(
  body: string,
  ledger: { repeatedOpenings: SeriesEcho[]; repeatedPhrases: SeriesEcho[] },
): SeriesEchoFinding[] {
  const sentences = seriesSentences(body);
  const stems = openingStems(body);
  const text = ` ${sentences.map((s) => seriesWords(s).join(' ')).join(' | ')} `;
  const findings: SeriesEchoFinding[] = [];
  for (const e of ledger.repeatedOpenings) {
    const occurrences = stems.filter((s) => s === e.text).length;
    if (occurrences)
      findings.push({
        kind: 'opening',
        text: e.text,
        priorChapters: e.chapters,
        occurrences,
      });
  }
  for (const e of ledger.repeatedPhrases) {
    const occurrences = text.split(` ${e.text} `).length - 1;
    if (occurrences)
      findings.push({
        kind: 'phrase',
        text: e.text,
        priorChapters: e.chapters,
        occurrences,
      });
  }
  const known = new Set(findings.map((f) => f.text));
  for (const e of tally([stems]))
    if (e.count >= 3 && !known.has(e.text))
      findings.push({
        kind: 'within',
        text: e.text,
        priorChapters: 0,
        occurrences: e.count,
      });
  return findings.slice(0, 12);
}

// The quality2.7 editor rule, also used by the offline audit: a chapter is
// flagged when it reuses wording already seen in three or more earlier
// chapters, reuses any recurring wording twice, reuses two different ones,
// or repeats one opening three times within itself.
export function seriesEchoFlags(findings: readonly SeriesEchoFinding[]) {
  const reused = findings.filter((f) => f.kind !== 'within');
  return (
    reused.some((f) => f.priorChapters >= 3 || f.occurrences >= 2) ||
    reused.length >= 2 ||
    findings.some((f) => f.kind === 'within')
  );
}

// Narrated small-friction vocabulary: the protagonist's private flash of
// irritation that v7 and the first v8 Codex smoke put in every chapter in
// different words. Lexical evidence only; it cannot tell an earned quarrel
// from a reflex, which is why it is shown to author and editor as a count.
const frictionPattern =
  /\b(?:irritat\w*|annoy\w*|exasperat\w*|resent\w*|dislik\w*|bristl\w*|impatien\w*|grudg\w*|huff\w*|peev\w*|testy|tetchy|curt(?:ly)?|snap(?:s|ped|ping)?|unhelpful|too sharply|sharper than)\b/giu;

export function seriesFrictionMarkers(body: string) {
  const narration = body.replace(/["“][^"”]*["”]/gu, ' ');
  return [...narration.matchAll(frictionPattern)].map((m) =>
    m[0].toLocaleLowerCase('en'),
  );
}

// How many of the most recent owned chapters in a row carry friction markers.
export function seriesFrictionRun(chapters: readonly SeriesChapter[]) {
  let run = 0;
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (!seriesFrictionMarkers(chapters[i]!.body).length) break;
    run++;
  }
  return run;
}

const nonNames = new Set(
  (
    'you your yours i we he she they it the a an and but or so then when while if as at in on of to for with from by ' +
    'not no yes this that these those there here what which who why how one two three ' +
    'monday tuesday wednesday thursday friday saturday sunday january february march april may june july ' +
    'august september october november december spring summer autumn winter christmas easter ' +
    'mr mrs ms dr mum mam dad ok okay hi hello thanks sorry neither either both after before'
  ).split(' '),
);

// Heuristic person-like names for the OFFLINE audit only: capitalized words
// that are not clause-initial and never occur in lowercase in the same text,
// joined into two-word names where adjacent. Quoted UI labels are dropped.
export function seriesNameCandidates(body: string) {
  const lower = new Set(
    (body.match(/[\p{Ll}][\p{L}'’-]*/gu) ?? []).map((w) => w.toLowerCase()),
  );
  const unquoted = body.replace(/["“'‘][^"”'’\n]{1,30}["”'’]/gu, ' ');
  const names: string[] = [];
  for (const sentence of seriesSentences(unquoted))
    for (const clause of seriesClauses(sentence)) {
      const tokens = clause.match(/[\p{L}][\p{L}'’-]*/gu) ?? [];
      let run: string[] = [];
      const flush = () => {
        if (run.length) names.push(run.slice(0, 2).join(' '));
        run = [];
      };
      tokens.forEach((token, index) => {
        const bare = token.replace(/['’]s$/, '');
        const key = bare.toLocaleLowerCase('en');
        if (
          index > 0 &&
          /^\p{Lu}\p{Ll}/u.test(bare) &&
          !nonNames.has(key) &&
          !lower.has(key)
        )
          run.push(bare);
        else flush();
      });
      flush();
    }
  return names;
}

// Jaccard similarity of weighty word sets: a cheap cross-run plot proxy.
export function seriesLexicalOverlap(a: string, b: string) {
  const set = (t: string) =>
    new Set(seriesWords(t).filter((w) => w.length >= 5));
  const x = set(a),
    y = set(b);
  const shared = [...x].filter((w) => y.has(w)).length;
  const union = new Set([...x, ...y]).size;
  return union ? Math.round((shared / union) * 1000) / 1000 : 0;
}

export type SeriesLedgerPeriod = {
  periodId: string;
  body: string;
  events: {
    actorIds?: readonly string[];
    changes?: readonly { type: string; value?: unknown }[];
  }[];
};
export type SeriesLedgerState = {
  actors: readonly { id: string; relationship: string }[];
  goals: readonly { goalId: string }[];
};

// Owned-history ledger for quality2.7. Supplied private-life people are those
// in the current state with a partner/family/friend relationship.
export function fictionSeriesLedgerFrom(
  periods: readonly SeriesLedgerPeriod[],
  state: SeriesLedgerState,
) {
  const n = periods.length;
  const sinceLast = (hit: (p: SeriesLedgerPeriod) => boolean) => {
    for (let i = n - 1; i >= 0; i--) if (hit(periods[i]!)) return n - 1 - i;
    return null;
  };
  const echo = (e: SeriesEcho) => ({ ...e, text: e.text.slice(0, 80) });
  return {
    version: '1.0.0' as const,
    ownedChapters: n,
    repeatedOpenings: seriesRepeatedOpenings([...periods]).map(echo),
    repeatedPhrases: seriesRepeatedPhrases([...periods]).map(echo),
    frictionBeat: {
      chaptersWithMarkers: periods.filter(
        (p) => seriesFrictionMarkers(p.body).length,
      ).length,
      recentRun: seriesFrictionRun(periods),
      recentMarkers: [
        ...new Set(
          periods.slice(-3).flatMap((p) => seriesFrictionMarkers(p.body)),
        ),
      ]
        .slice(0, 8)
        .map((m) => m.slice(0, 40)),
    },
    recentClosings: periods.slice(-6).map((p) => ({
      periodId: p.periodId,
      sentence: seriesClosingSentence(p.body),
    })),
    privateLife: state.actors
      .filter((a) => ['partner', 'family', 'friend'].includes(a.relationship))
      .slice(0, 12)
      .map((a) => {
        const present = (p: SeriesLedgerPeriod) =>
          p.events.some((e) => e.actorIds?.includes(a.id));
        return {
          actorId: a.id,
          relationship: a.relationship as 'partner' | 'family' | 'friend',
          chaptersPresent: periods.filter(present).length,
          chaptersSinceLast: sinceLast(present),
        };
      }),
    goalActivity: state.goals.slice(0, 5).map((g) => ({
      goalId: g.goalId,
      chaptersSinceProgressChange: sinceLast((p) =>
        p.events.some((e) =>
          e.changes?.some(
            (c) =>
              c.type === 'goal_progress_set' &&
              (c.value as { goalId?: string } | undefined)?.goalId === g.goalId,
          ),
        ),
      ),
    })),
  };
}

// ---- Living-world generation (series ledger 1.1.0) ----
// Same deterministic evidence plus the recurring fictional cast and the turn
// rotation. The 1.0.0 builder above is untouched, so v8 stays byte-identical.

export type SeriesLedgerLiving = {
  // Seeds the tie order of types that were never used (reproducible per branch).
  branchId: string;
  // Live, wholly fictional people of the character state, with whether their
  // own matter is still open (dynamic.unresolvedMatter or
  // relationship.unresolvedInteraction).
  cast: readonly { actorId: string; openMatter: boolean }[];
  // The planner's turnType label of each owned period, in period order (same
  // length as `periods`); null or unknown values are unlabelled.
  turns: readonly (string | null | undefined)[];
};

const turnLabel = (value: unknown): FictionTurnType | null => {
  const parsed = fictionTurnTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};
// Unlabelled chapters and `other` take no part in the rotation.
const rotationHistory = (labelled: readonly unknown[]) =>
  labelled.flatMap((value) => {
    const type = turnLabel(value);
    return type && type !== 'other' ? [type] : [];
  });

// The rotation catalogue from the least recently used type to the most recently
// used one. A type never used comes first; ties (also among never-used types)
// are broken by a hash of the branch, so the list is reproducible per request
// and its head is not a fixed catalogue order.
export function fictionTurnQueue(
  labelled: readonly unknown[],
  tieSeed: string,
): Exclude<FictionTurnType, 'other'>[] {
  const used = rotationHistory(labelled);
  const lastUse = (type: string) => used.lastIndexOf(type as never);
  const tie = (type: string) =>
    createHash('sha256')
      .update(`${tieSeed}:${used.length}:${type}`)
      .digest('hex');
  return [...FICTION_ROTATING_TURN_TYPES].sort(
    (a, b) =>
      lastUse(a) - lastUse(b) ||
      (tie(a) < tie(b) ? -1 : tie(a) > tie(b) ? 1 : 0),
  );
}

// The types of the last two labelled chapters, the most recent first.
export function fictionRestingTurns(
  labelled: readonly unknown[],
): Exclude<FictionTurnType, 'other'>[] {
  return [
    ...new Set(
      rotationHistory(labelled).slice(-FICTION_RESTING_TURNS_MAX).reverse(),
    ),
  ];
}

export function fictionSeriesLedgerV11From(
  periods: readonly SeriesLedgerPeriod[],
  state: SeriesLedgerState,
  living: SeriesLedgerLiving,
) {
  const n = periods.length;
  const base = fictionSeriesLedgerFrom(periods, state);
  const present = (actorId: string) => (p: SeriesLedgerPeriod) =>
    p.events.some((e) => e.actorIds?.includes(actorId));
  const recurringCast = living.cast
    .map(({ actorId, openMatter }) => {
      const here = present(actorId);
      let sinceLast: number | null = null;
      for (let i = n - 1; i >= 0 && sinceLast === null; i--)
        if (here(periods[i]!)) sinceLast = n - 1 - i;
      return {
        actorId,
        chaptersPresent: periods.filter(here).length,
        chaptersSinceLast: sinceLast,
        openMatter,
      };
    })
    // Open matter first, then the longest absence (never seen last), then id.
    .sort(
      (a, b) =>
        Number(b.openMatter) - Number(a.openMatter) ||
        (b.chaptersSinceLast ?? -1) - (a.chaptersSinceLast ?? -1) ||
        a.actorId.localeCompare(b.actorId),
    )
    .slice(0, FICTION_RECURRING_CAST_MAX);
  const labelled = living.turns.slice(-n);
  const ledger = {
    ...base,
    version: '1.1.0' as const,
    recurringCast,
    recentTurns: labelled.slice(-FICTION_RECENT_TURNS_MAX).map(turnLabel),
    turnQueue: fictionTurnQueue(labelled, living.branchId),
    restingTurns: fictionRestingTurns(labelled),
  };
  // Over the byte bound, evidence is dropped in a fixed order; the queue and
  // the resting turns are what the rotation needs and stay.
  const bytes = () => new TextEncoder().encode(JSON.stringify(ledger)).length;
  const drop: (() => boolean)[] = [
    () => ledger.recentTurns.splice(0).length > 0,
    () => ledger.recurringCast.pop() !== undefined,
    () => ledger.repeatedPhrases.pop() !== undefined,
    // Beyond the first three, so that a crowded life degrades its evidence
    // instead of failing the period: the 5 goals and 6 long openings are the
    // remaining slack of the 1.0.0 fields.
    () => ledger.repeatedOpenings.pop() !== undefined,
    () => ledger.goalActivity.pop() !== undefined,
  ];
  for (const step of drop)
    while (bytes() > FICTION_SERIES_LEDGER_V11_BYTES && step());
  return ledger;
}
