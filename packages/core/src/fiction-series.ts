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
