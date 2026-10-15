import {
  narrativeV1ContextSchema,
  narrativePlanningResultSchema,
  narrativeEditorialReportSchema,
  type NarrativePlanReview,
  fidelitySchema,
  type NarrativePeriodInput,
  type NarrativeArtifact,
  type NarrativePlanningResult,
  type NarrativeEditorialReport,
  type PeriodChapterV2,
} from '@future-flow/contracts';
import { hash } from './index';
import { DomainError } from './errors';
import { simulatePeriodV2, validateNarrativeChapterV1 } from './life-v2';
import {
  narrativeReferenceSnapshot,
  narrativeReferencesFromSnapshot,
  validateNarrativePlan,
  validateNarrativeArtifact,
  validateNarrativeEditorialReport,
  validateNarrativePlanReview,
  evaluateNarrativePlanReview,
} from './narrative';
import {
  narrativePlannerRequest,
  narrativePlanReviewRequest,
  narrativeWriterRequest,
  narrativeFidelityRequest,
  narrativeEditorialRequest,
  type NarrativePlanningInput,
  type NarrativeStoryInput,
  type NarrativeRepairFeedback,
} from './narrative-requests';

export function narrativeScope(input: NarrativePeriodInput) {
  const context = narrativeV1ContextSchema.safeParse(input.narrativeContext);
  if (!context.success || input.narrativeReferences === undefined)
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative scope is incomplete.',
    );
  const planningInput: NarrativePlanningInput = {
    ...input,
    narrativeContext: context.data,
  };
  narrativePlannerRequest(planningInput);
  let references: ReturnType<typeof narrativeReferencesFromSnapshot>;
  try {
    references = narrativeReferencesFromSnapshot(input.narrativeReferences);
  } catch {
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative reference snapshot is invalid.',
    );
  }
  return { context: context.data, planningInput, references };
}
export function narrativeCanon(input: NarrativePeriodInput, raw: unknown) {
  const scope = narrativeScope(input),
    result = narrativePlanningResultSchema.parse(raw);
  if (
    result.candidate.periodId !== input.periodId ||
    result.candidate.branchId !== input.input.branchId ||
    result.candidate.baseRevision !== input.revision ||
    result.candidate.startDate !== input.startDate ||
    result.candidate.endDate !== input.endDate
  )
    throw new DomainError(
      'NARRATIVE_PLAN_INVALID',
      'Narrative candidate differs from the requested period.',
    );
  const canon = simulatePeriodV2(
    result.candidate,
    input.state,
    input.input.constraints,
    {
      lifeId: input.input.lifeId,
      branchId: input.input.branchId,
      revision: input.revision,
      acceptedDecisionIds: input.acceptedDecisionIds,
    },
  );
  validateNarrativePlan(result, canon, scope.context.memory, scope.references);
  const story: NarrativeStoryInput = {
    locale: input.input.locale,
    identity: input.input.identity,
    goals: input.input.goals,
    events: canon.events,
    plan: result.plan,
    narrativeContext: scope.context,
    ...(input.memory.sharedEvents
      ? { sharedEvents: input.memory.sharedEvents }
      : {}),
  };
  return { ...scope, result, canon, story };
}
export function narrativeBindings(
  input: NarrativePeriodInput,
  result: NarrativePlanningResult,
  chapter: PeriodChapterV2,
  fidelity: unknown,
  repair?: NarrativeRepairFeedback,
  planningReview?: NarrativePlanReview,
): NarrativeArtifact['bindings'] {
  const run = narrativeCanon(input, result);
  const required = !!run.context.policy.promptVersions.planReviewer;
  if (required) {
    validateNarrativePlanReview(planningReview, run.result);
    if (!evaluateNarrativePlanReview(planningReview).passed)
      throw new DomainError(
        'NARRATIVE_QUALITY_FAILED',
        'The proposed story has not passed planning review.',
      );
  } else if (planningReview !== undefined)
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Unexpected planning review for an old policy.',
    );
  return {
    ...(required
      ? {
          planningReviewInputHash: hash(
            narrativePlanReviewRequest(run.planningInput, run.result),
          ),
          planningReviewOutputHash: hash(planningReview),
        }
      : {}),
    policyHash: hash(run.context.policy),
    memoryHash: hash(run.context.memory),
    referenceHash: hash(narrativeReferenceSnapshot(run.references)),
    candidateHash: hash(run.result.candidate),
    canonHash: hash(run.canon.events),
    planHash: hash(run.result.plan),
    planningOutputHash: hash(run.result),
    storyInputHash: hash(narrativeWriterRequest(run.story, repair)),
    chapterHash: hash(chapter),
    fidelityInputHash: hash(narrativeFidelityRequest(run.story, chapter)),
    fidelityOutputHash: hash(fidelitySchema.parse(fidelity)),
    editorialInputHash: hash(narrativeEditorialRequest(run.story, chapter)),
  };
}
type Receipt = {
  task: string;
  promptVersion: string;
  model: string;
  inputHash: string;
  outputHash: string;
};
export function narrativeReceipts(raw: unknown): Receipt[] {
  if (!Array.isArray(raw) || raw.length > 8)
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative receipt list is invalid.',
    );
  for (const item of raw)
    if (
      !item ||
      typeof item !== 'object' ||
      ['task', 'promptVersion', 'model', 'inputHash', 'outputHash'].some(
        (field) => typeof item[field] !== 'string',
      )
    )
      throw new DomainError(
        'NARRATIVE_CONTEXT_INVALID',
        'Narrative receipt is invalid.',
      );
  if (
    raw.some(
      (item) =>
        ![
          'life_narrative_plan',
          'life_narrative_plan_review',
          'life_narrative_chapter',
          'life_fidelity',
          'life_narrative_editor',
        ].includes(item.task) ||
        !/^[a-f0-9]{64}$/.test(item.inputHash) ||
        !/^[a-f0-9]{64}$/.test(item.outputHash),
    )
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative receipt task or hash is invalid.',
    );
  return raw as Receipt[];
}
export function buildNarrativeArtifact(
  input: NarrativePeriodInput,
  result: NarrativePlanningResult,
  chapter: PeriodChapterV2,
  fidelity: unknown,
  report: NarrativeEditorialReport,
  receipts: unknown[],
  repair?: NarrativeRepairFeedback,
  planningReview?: NarrativePlanReview,
): NarrativeArtifact {
  const run = narrativeCanon(input, result),
    bindings = narrativeBindings(
      input,
      result,
      chapter,
      fidelity,
      repair,
      planningReview,
    );
  const valid = fidelitySchema.parse(fidelity);
  if (!valid.valid || valid.issues.length)
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative fidelity has not passed.',
    );
  validateNarrativeChapterV1(chapter, run.canon.events);
  validateNarrativeEditorialReport(report, chapter, run.canon);
  const recorded = narrativeReceipts(receipts);
  const artifact = {
    version: '1.0.0' as const,
    pipelineVersion: 'narrative-v1' as const,
    policy: run.context.policy,
    validatedPlan: run.result.plan,
    validatedMemoryDelta: run.result.plan.memoryDelta,
    editorialReport: report,
    ...(planningReview ? { planningReview } : {}),
    bindings,
    provenance: {
      promptVersions: run.context.policy.promptVersions,
      receiptRefs: recorded.map((receipt, ordinal) => ({
        task: receipt.task,
        ordinal,
        model: receipt.model,
        inputHash: receipt.inputHash,
        outputHash: receipt.outputHash,
      })),
    },
  };
  for (const receipt of recorded) {
    const key =
      receipt.task === 'life_narrative_plan_review'
        ? 'planReviewer'
        : receipt.task === 'life_narrative_plan'
          ? 'planner'
          : receipt.task === 'life_narrative_chapter'
            ? 'writer'
            : receipt.task === 'life_fidelity'
              ? 'fidelity'
              : receipt.task === 'life_narrative_editor'
                ? 'editor'
                : null;
    if (
      !key ||
      receipt.promptVersion !==
        `${run.context.policy.promptVersions[key]}.${input.input.locale}`
    )
      throw new DomainError(
        'NARRATIVE_CONTEXT_INVALID',
        'Narrative receipt version differs.',
      );
  }
  return validateNarrativeArtifact(artifact, bindings);
}
export function validatedNarrativeCheckpoint(
  checkpoints: Record<string, unknown>,
  input: NarrativePeriodInput,
) {
  const run = narrativeCanon(input, checkpoints.planningResult);
  if (
    checkpoints.catalogOperatorLease ||
    checkpoints.pipelineVersion !== 'narrative-v1'
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative checkpoint pipeline differs.',
    );
  const chapter = checkpoints.chapter as PeriodChapterV2;
  validateNarrativeChapterV1(chapter, run.canon.events);
  const report = narrativeEditorialReportSchema.parse(
    checkpoints.editorialReport,
  );
  const fidelity = fidelitySchema.parse(checkpoints.fidelityResult);
  const repair = checkpoints.narrativeRepairFeedback as
    NarrativeRepairFeedback | undefined;
  const bindings = narrativeBindings(
    input,
    run.result,
    chapter,
    fidelity,
    repair,
    checkpoints.planningReview as NarrativePlanReview | undefined,
  );
  if (
    checkpoints.planningReviewInputHash !== bindings.planningReviewInputHash ||
    checkpoints.planningReviewOutputHash !==
      bindings.planningReviewOutputHash ||
    checkpoints.policyHash !== bindings.policyHash ||
    hash(checkpoints.policy) !== bindings.policyHash ||
    checkpoints.memoryHash !== bindings.memoryHash ||
    checkpoints.referenceHash !== bindings.referenceHash ||
    checkpoints.candidateHash !== bindings.candidateHash ||
    checkpoints.canonHash !== bindings.canonHash ||
    checkpoints.planHash !== bindings.planHash ||
    checkpoints.planningInputHash !==
      hash(
        narrativePlannerRequest(
          run.planningInput,
          typeof checkpoints.planningRepair === 'string'
            ? checkpoints.planningRepair
            : undefined,
        ),
      ) ||
    checkpoints.storyInputHash !== bindings.storyInputHash ||
    checkpoints.fidelityInputHash !== bindings.fidelityInputHash ||
    checkpoints.editorialInputHash !== bindings.editorialInputHash ||
    hash(checkpoints.candidate) !== bindings.candidateHash
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative checkpoint binding differs.',
    );
  const artifact = buildNarrativeArtifact(
    input,
    run.result,
    chapter,
    fidelity,
    report,
    narrativeReceipts(checkpoints.receipts),
    repair,
    checkpoints.planningReview as NarrativePlanReview | undefined,
  );
  if (hash(artifact) !== hash(checkpoints.narrativeArtifact))
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative checkpoint artifact differs.',
    );
  const planner = narrativeReceipts(checkpoints.receipts)
    .filter((r) => r.task === 'life_narrative_plan')
    .at(-1);
  if (planner?.inputHash !== checkpoints.planningInputHash)
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative planning receipt differs.',
    );
  const count = checkpoints.providerRequestCount;
  if (
    typeof count !== 'number' ||
    !Number.isSafeInteger(count) ||
    count < artifact.provenance.receiptRefs.length ||
    count > run.context.policy.maxPhysicalRequests
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative checkpoint request count differs.',
    );
  return {
    artifact,
    expectedBindings: bindings,
    candidate: run.result.candidate,
    chapter,
    receipts: checkpoints.receipts as unknown[],
  };
}
