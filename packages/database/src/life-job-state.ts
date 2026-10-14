// A cached, accepted chapter can be committed after the funded-attempt ceiling
// without authorizing another provider call. Operator catalog leases stay fenced.
import type { NarrativePeriodInput } from '@future-flow/contracts';
import { validatedNarrativeCheckpoint } from '@future-flow/core';
export function lifeJobReadyToCommit(
  checkpoints: Record<string, unknown>,
  input?: NarrativePeriodInput,
) {
  if (
    checkpoints.catalogOperatorLease ||
    !checkpoints.candidate ||
    !checkpoints.chapter
  )
    return false;
  if (
    input?.narrativeContext?.policy.mode === 'narrative-v1' ||
    checkpoints.pipelineVersion === 'narrative-v1' ||
    (checkpoints.policy as { mode?: string } | undefined)?.mode ===
      'narrative-v1'
  ) {
    if (input?.narrativeContext?.policy.mode !== 'narrative-v1') return false;
    try {
      validatedNarrativeCheckpoint(checkpoints, input);
      return true;
    } catch {
      return false;
    }
  }
  if (checkpoints.fidelityPassed === true) return true;
  const result = checkpoints.fidelityResult as
    { valid?: unknown; issues?: unknown } | undefined;
  return (
    result?.valid === true &&
    Array.isArray(result.issues) &&
    result.issues.length === 0
  );
}
