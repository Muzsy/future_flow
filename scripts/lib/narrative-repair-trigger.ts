// What made a repair necessary, read from the fixed wording of the repair
// message the author was given. Only the wording is used here; the stored-run
// evidence additionally looks at the fidelity result (narrative-repair-evidence).
export type RepairTrigger = 'fidelity' | 'editor' | 'plan_review' | 'other';

export function repairTriggerOf(message: string | null): RepairTrigger | null {
  if (!message) return null;
  // The fidelity wording, and the combined wording of the coordinated policies
  // up to v8 (a fidelity failure that also read the editor).
  if (
    /^(?:Correct the final package\/prose|Fix BOTH final checks)/.test(message)
  )
    return 'fidelity';
  if (/^Improve the final authored story/.test(message)) return 'plan_review';
  // "Rewrite the weak story" is the wording up to v8; v9 uses the structured
  // "Correct the final package's literary issues".
  if (
    /^(?:Rewrite the weak story|Correct the final package's literary issues)/.test(
      message,
    )
  )
    return 'editor';
  return 'other';
}
