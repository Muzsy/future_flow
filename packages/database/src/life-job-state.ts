// A cached, accepted chapter can be committed after the funded-attempt ceiling
// without authorizing another provider call. Operator catalog leases stay fenced.
export function lifeJobReadyToCommit(checkpoints: Record<string, unknown>) {
  if (
    checkpoints.catalogOperatorLease ||
    !checkpoints.candidate ||
    !checkpoints.chapter
  )
    return false;
  if (checkpoints.fidelityPassed === true) return true;
  const result = checkpoints.fidelityResult as
    { valid?: unknown; issues?: unknown } | undefined;
  return (
    result?.valid === true &&
    Array.isArray(result.issues) &&
    result.issues.length === 0
  );
}
