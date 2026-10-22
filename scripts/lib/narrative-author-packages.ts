import type { FictionAuthorResult } from '@future-flow/contracts';
import { mergeFictionRepair } from '@future-flow/core';

// The full author package of every author attempt that has one, by ordinal. A
// reduced v9 repair (facts-only or prose-only) stores only what the model
// returned; its package is that output merged into the preceding package, as
// the provider did in the run. An attempt whose output cannot be merged (a
// facts-only answer that asked for the full repair) has no package.
export function authorPackages(
  attempts: {
    ordinal: number;
    task: string;
    output: unknown;
    repairFeedback: { mode?: string } | null;
  }[],
) {
  const packages = new Map<number, FictionAuthorResult>();
  let previous: FictionAuthorResult | undefined;
  for (const attempt of attempts) {
    if (attempt.task !== 'life_narrative_chapter' || !attempt.output) continue;
    const mode = attempt.repairFeedback?.mode;
    let full: FictionAuthorResult | undefined;
    const out = attempt.output as Record<string, unknown>;
    // A package carries its facts and its chapter; a reduced repair output
    // carries one of them (or an outcome) and never both.
    if (out.candidate || (out.storyFacts && out.chapter))
      full = attempt.output as FictionAuthorResult;
    else if (previous && (mode === 'prose_only' || mode === 'facts_only'))
      try {
        full = mergeFictionRepair(previous, mode, attempt.output);
      } catch {
        full = undefined;
      }
    if (!full) continue;
    packages.set(attempt.ordinal, full);
    previous = full;
  }
  return packages;
}
