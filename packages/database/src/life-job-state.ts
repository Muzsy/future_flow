// A cached, accepted chapter can be committed after the funded-attempt ceiling
// without authorizing another provider call. Operator catalog leases stay fenced.
import {
  narrativeV1PolicySchema,
  fictionPolicySchema,
  type NarrativePeriodInput,
} from '@future-flow/contracts';
import {
  validatedNarrativeCheckpoint,
  validatedFictionCheckpoint,
} from '@future-flow/core';
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
    input?.narrativeContext?.policy.mode === 'narrative-fiction-v2' ||
    checkpoints.pipelineVersion === 'narrative-fiction-v2' ||
    (checkpoints.policy as { mode?: string } | undefined)?.mode ===
      'narrative-fiction-v2'
  ) {
    try {
      if (input?.narrativeContext?.policy.mode !== 'narrative-fiction-v2')
        return false;
      validatedFictionCheckpoint(checkpoints, input);
      return true;
    } catch {
      return false;
    }
  }
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

export function narrativeProcessingBlock(
  checkpoints: Record<string, unknown>,
  input: NarrativePeriodInput,
): 'NARRATIVE_CONTEXT_INVALID' | 'NARRATIVE_REQUEST_LIMIT' | null {
  if (
    !['narrative-v1', 'narrative-fiction-v2'].includes(
      input.narrativeContext?.policy.mode ?? '',
    )
  )
    return null;
  if (lifeJobReadyToCommit(checkpoints, input)) return null;
  const policy = (
    input.narrativeContext?.policy.mode === 'narrative-fiction-v2'
      ? fictionPolicySchema
      : narrativeV1PolicySchema
  ).safeParse(input.narrativeContext?.policy);
  if (!policy.success) return 'NARRATIVE_CONTEXT_INVALID';
  const limit = policy.data.maxPhysicalRequests;
  const count =
    checkpoints.providerRequestCount === undefined
      ? 0
      : checkpoints.providerRequestCount;
  if (
    typeof count !== 'number' ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > limit
  )
    return 'NARRATIVE_CONTEXT_INVALID';
  return count >= limit ? 'NARRATIVE_REQUEST_LIMIT' : null;
}

export function lifeJobRetryAvailable(
  job: {
    status: string;
    error_code: string | null;
    attempt: number;
    checkpoints: Record<string, unknown>;
    payload: NarrativePeriodInput;
  },
  branchStatus: string,
) {
  if (branchStatus !== 'failed' || job.checkpoints.catalogOperatorLease)
    return false;
  if (
    job.error_code === 'SHARED_PRIVACY_CHANGED' &&
    ['failed', 'cancelled'].includes(job.status)
  )
    return true;
  if (job.status !== 'failed') return false;
  if (lifeJobReadyToCommit(job.checkpoints, job.payload)) return true;
  if (job.attempt >= 5) return false;
  if (
    ['narrative-v1', 'narrative-fiction-v2'].includes(
      job.payload.narrativeContext?.policy.mode ?? '',
    )
  ) {
    if (
      [
        'NARRATIVE_QUALITY_FAILED',
        'NARRATIVE_CONTEXT_INVALID',
        'NARRATIVE_REQUEST_LIMIT',
      ].includes(job.error_code ?? '')
    )
      return false;
    if (narrativeProcessingBlock(job.checkpoints, job.payload)) return false;
  }
  return true;
}
