import {
  seriesClosingSentence,
  seriesEchoFindings,
  seriesEchoFlags,
  seriesFrictionMarkers,
  seriesLexicalOverlap,
  seriesNameCandidates,
  seriesRepeatedOpenings,
  seriesRepeatedPhrases,
  seriesSentences,
  seriesWords,
  type SeriesChapter,
} from '@future-flow/core';
import { narrativeProfiles } from '../../tests/narrative-fixtures';

// Provider-free audit over already generated evaluation runs (report.json).
// Every number here is reproducible from stored prose; nothing calls a model.
export type AuditSample = {
  fixtureId: string;
  mode?: string;
  kind: string;
  periodIndex: number;
  chapter: { title: string; body: string };
  errorCode?: string | null;
};
export type AuditRun = { label: string; samples: AuditSample[] };
export type AuditSequence = {
  id: string;
  run: string;
  fixtureId: string;
  chapters: { periodIndex: number; title: string; body: string }[];
};

export function auditSequences(runs: AuditRun[]): AuditSequence[] {
  const out: AuditSequence[] = [];
  for (const run of runs) {
    const accepted = run.samples.filter(
      (s) => !s.errorCode && s.chapter?.body && s.mode !== 'legacy',
    );
    const fixtures = [...new Set(accepted.map((s) => s.fixtureId))].sort();
    for (const fixtureId of fixtures)
      for (const kind of ['full', 'fork'] as const) {
        const chapters = accepted
          .filter((s) => s.fixtureId === fixtureId && s.kind === kind)
          .sort((a, b) => a.periodIndex - b.periodIndex)
          .map((s) => ({
            periodIndex: s.periodIndex,
            title: s.chapter.title,
            body: s.chapter.body,
          }));
        if (chapters.length)
          out.push({
            id: `${run.label}/${fixtureId}${kind === 'fork' ? '/fork' : ''}`,
            run: run.label,
            fixtureId,
            chapters,
          });
      }
  }
  return out;
}

const roleNoise = new Set(['fictional', 'older', 'younger', 'school']);
const roleWords = new Set([
  'partner',
  'father',
  'mother',
  'sister',
  'brother',
  'flatmate',
  'friend',
  'aunt',
  'neighbour',
  'companion',
  'cousin',
  'grandmother',
]);
// Role words and given names from the profile labels; heuristic, prose-only.
// A bare role word ("your friend") is counted apart from the person's name.
export function privateLifeKeywords(fixtureId: string) {
  const profile = narrativeProfiles.find((p) => p.id === fixtureId);
  return (profile?.relationships ?? []).map((r) => {
    const words = seriesWords(r.label).filter((w) => !roleNoise.has(w));
    return {
      label: r.label,
      roles: words.filter((w) => roleWords.has(w)),
      names: words.filter((w) => !roleWords.has(w)),
    };
  });
}

export function auditSequence(sequence: AuditSequence) {
  const chapters: SeriesChapter[] = sequence.chapters;
  // What a quality2.7 editor would have been shown: each chapter against the
  // ledger of the chapters before it, judged by the same flag rule.
  const perChapterEchoes = sequence.chapters.map((chapter, index) => {
    const prior = chapters.slice(0, index);
    const findings = seriesEchoFindings(chapter.body, {
      repeatedOpenings: seriesRepeatedOpenings(prior),
      repeatedPhrases: seriesRepeatedPhrases(prior),
    });
    return {
      periodIndex: chapter.periodIndex,
      findings,
      wouldFlag: seriesEchoFlags(findings),
    };
  });
  const names = new Map<string, Set<number>>();
  const counts = new Map<string, number>();
  for (const c of sequence.chapters)
    for (const n of seriesNameCandidates(c.body)) {
      names.set(n, (names.get(n) ?? new Set()).add(c.periodIndex));
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
  const closings = sequence.chapters.map((c) => seriesClosingSentence(c.body));
  const chaptersWith = (keys: string[]) =>
    sequence.chapters.filter((c) => {
      const words = new Set(seriesWords(c.body));
      return keys.some((k) => words.has(k));
    }).length;
  return {
    id: sequence.id,
    chapters: sequence.chapters.length,
    repeatedOpenings: seriesRepeatedOpenings(chapters, 10),
    repeatedPhrases: seriesRepeatedPhrases(chapters, 10),
    chaptersFlaggedByEcho: perChapterEchoes.filter((e) => e.wouldFlag).length,
    // Narrated small-friction words per chapter (quality2.7 frictionBeat).
    frictionByChapter: sequence.chapters.map((c) => ({
      periodIndex: c.periodIndex,
      markers: seriesFrictionMarkers(c.body),
    })),
    perChapterEchoes,
    closings,
    meanClosingWords:
      Math.round(
        (closings.reduce((n, c) => n + seriesWords(c).length, 0) /
          Math.max(1, closings.length)) *
          10,
      ) / 10,
    // A name counts once it occurs at least twice in the sequence.
    names: [...names.entries()]
      .filter(([name]) => (counts.get(name) ?? 0) >= 2)
      .map(([name, set]) => ({ name, chapters: set.size }))
      .sort((a, b) => b.chapters - a.chapters || a.name.localeCompare(b.name))
      .slice(0, 15),
    privateLife: privateLifeKeywords(sequence.fixtureId).map((r) => ({
      label: r.label,
      chaptersByName: chaptersWith(r.names),
      chaptersByRole: chaptersWith(r.roles),
    })),
    sentencesPerChapter:
      Math.round(
        (sequence.chapters.reduce(
          (n, c) => n + seriesSentences(c.body).length,
          0,
        ) /
          sequence.chapters.length) *
          10,
      ) / 10,
  };
}

// Cross-run convergence: names and phrases that independent sequences share,
// plus same-index lexical overlap between sequences of the same profile.
export function auditCrossRun(sequences: AuditSequence[]) {
  const mains = sequences.filter((s) => !s.id.endsWith('/fork'));
  const nameSeqs = new Map<string, Set<string>>();
  const phraseSeqs = new Map<string, Set<string>>();
  for (const s of mains) {
    for (const c of s.chapters)
      for (const n of seriesNameCandidates(c.body))
        if (n.includes(' '))
          nameSeqs.set(n, (nameSeqs.get(n) ?? new Set()).add(s.id));
    // A sequence's own recurring phrases; a one-chapter run has none.
    for (const p of seriesRepeatedPhrases(s.chapters, 40))
      phraseSeqs.set(p.text, (phraseSeqs.get(p.text) ?? new Set()).add(s.id));
  }
  const shared = (m: Map<string, Set<string>>) =>
    [...m.entries()]
      .filter(([, set]) => set.size >= 2)
      .map(([text, set]) => ({ text, sequences: [...set].sort() }))
      .sort(
        (a, b) =>
          b.sequences.length - a.sequences.length ||
          a.text.localeCompare(b.text),
      );
  const overlaps: {
    a: string;
    b: string;
    periodIndex: number;
    overlap: number;
  }[] = [];
  for (let i = 0; i < mains.length; i++)
    for (let j = i + 1; j < mains.length; j++) {
      const [a, b] = [mains[i]!, mains[j]!];
      if (a.fixtureId !== b.fixtureId) continue;
      for (const ca of a.chapters) {
        const cb = b.chapters.find((c) => c.periodIndex === ca.periodIndex);
        if (cb)
          overlaps.push({
            a: a.id,
            b: b.id,
            periodIndex: ca.periodIndex,
            overlap: seriesLexicalOverlap(ca.body, cb.body),
          });
      }
    }
  return {
    sharedFullNames: shared(nameSeqs),
    sharedRecurringPhrases: shared(phraseSeqs).slice(0, 20),
    sameProfileOverlap: overlaps,
  };
}

export function narrativeSeriesAudit(runs: AuditRun[]) {
  const sequences = auditSequences(runs);
  return {
    version: '1.0.0',
    note: 'Deterministic heuristics over stored prose; evidence for human reading, not a literary grade.',
    runs: runs.map((r) => r.label),
    sequences: sequences.map(auditSequence),
    crossRun: auditCrossRun(sequences),
  };
}

export function auditMarkdown(audit: ReturnType<typeof narrativeSeriesAudit>) {
  const lines = [`# Narrative series audit ${audit.version}`, '', audit.note];
  for (const s of audit.sequences) {
    lines.push('', `## ${s.id} (${s.chapters} chapters)`, '');
    lines.push(
      `- Echo-flagged chapters (v8 editor rule): ${s.chaptersFlaggedByEcho}/${s.chapters} (${s.perChapterEchoes.map((e) => `ch${e.periodIndex + 1}: ${e.findings.map((f) => `${f.kind} "${f.text}" ×${f.occurrences}`).join('; ') || '-'}`).join(' | ')})`,
      `- Mean closing sentence words: ${s.meanClosingWords}`,
      `- Friction markers: ${s.frictionByChapter.filter((f) => f.markers.length).length}/${s.chapters} chapters (${s.frictionByChapter.map((f) => `ch${f.periodIndex + 1}: ${f.markers.join(', ') || '-'}`).join(' | ')})`,
      `- Repeated openings: ${s.repeatedOpenings.map((e) => `"${e.text}" ×${e.count}/${e.chapters}ch`).join(', ') || 'none'}`,
      `- Repeated phrases: ${s.repeatedPhrases.map((e) => `"${e.text}" ×${e.count}/${e.chapters}ch`).join(', ') || 'none'}`,
      `- Names (chapters): ${s.names.map((n) => `${n.name} (${n.chapters})`).join(', ') || 'none'}`,
      `- Private life (chapters by name / by role word): ${s.privateLife.map((p) => `${p.label}: ${p.chaptersByName}/${p.chaptersByRole}`).join(', ') || 'none'}`,
    );
  }
  lines.push('', '## Cross-run', '');
  lines.push(
    `- Full names in 2+ sequences: ${audit.crossRun.sharedFullNames.map((n) => `${n.text} (${n.sequences.length})`).join(', ') || 'none'}`,
    `- Recurring phrases in 2+ sequences: ${audit.crossRun.sharedRecurringPhrases.map((p) => `"${p.text}" (${p.sequences.length})`).join(', ') || 'none'}`,
  );
  for (const o of audit.crossRun.sameProfileOverlap)
    lines.push(
      `- Same-profile overlap ch${o.periodIndex + 1} ${o.a} vs ${o.b}: ${o.overlap}`,
    );
  return lines.join('\n') + '\n';
}
