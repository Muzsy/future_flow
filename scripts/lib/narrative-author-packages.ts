import type { FictionAuthorResult } from '@future-flow/contracts';
import { hash, mergeFictionRepair } from '@future-flow/core';

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

// What the provider's receipt binds for a reduced v9 repair call: the hash of
// the MERGED package, not of the raw response. The request carries the previous
// package and the mode, so the diagnostic trace can compute the same hash and
// keep the raw one beside it. `null` for any other call, and for a response
// that cannot be merged (the provider then returns no receipt for it).
export function reducedRepairMergedHash(
  parsedRequest: unknown,
  output: unknown,
): string | null {
  const repair = (parsedRequest as { authorRepair?: Record<string, unknown> })
    ?.authorRepair;
  if (
    !repair ||
    typeof repair.repairRule !== 'string' ||
    (repair.mode !== 'prose_only' && repair.mode !== 'facts_only') ||
    !repair.previous
  )
    return null;
  try {
    return hash(
      mergeFictionRepair(
        repair.previous as FictionAuthorResult,
        repair.mode,
        output,
      ),
    );
  } catch {
    return null;
  }
}
