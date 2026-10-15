import {
  DomainError,
  hash,
  narrativeScope,
  narrativeCanon,
  narrativeReferenceSnapshot,
  narrativeReceipts,
  narrativePlannerRequest,
  narrativePlanReviewRequest,
  validateNarrativePlanReview,
  evaluateNarrativePlanReview,
  narrativeWriterRequest,
  narrativeFidelityRequest,
  narrativeEditorialRequest,
  validateNarrativeChapterV1,
  validateNarrativeEditorialReport,
  evaluateNarrativeEditorialGate,
  buildNarrativeArtifact,
  validatedNarrativeCheckpoint,
  type NarrativeRepairFeedback,
} from '@future-flow/core';
import {
  fidelitySchema,
  narrativeEditorialReportSchema,
  type NarrativePlanningResult,
  type NarrativePlanReview,
  type PeriodChapterV2,
} from '@future-flow/contracts';
import {
  ownedNarrativeReferences,
  type LifeJob,
  type LifeJobRepository,
} from '@future-flow/database';
import type { NarrativeAiProvider, AiReceipt, AiResult } from '@future-flow/ai';

function contentError(error: unknown) {
  return (
    (error instanceof DomainError &&
      ((error.code.startsWith('LIFE_') &&
        ![
          'LIFE_REVISION_CONFLICT',
          'LIFE_DUPLICATE_ID',
          'LIFE_RETRY_UNAVAILABLE',
        ].includes(error.code)) ||
        [
          'NARRATIVE_PLAN_INVALID',
          'AI_INVALID_SCHEMA',
          'AI_INCOMPLETE_OR_REFUSED',
        ].includes(error.code))) ||
    (error instanceof Error && error.name === 'ZodError')
  );
}
function diagnostic(error: unknown) {
  return error instanceof DomainError
    ? `${error.code}: ${error.message}`.slice(0, 1000)
    : 'The output did not satisfy the required contract.';
}
export async function processNarrativeLifeJob(
  job: LifeJob,
  jobs: LifeJobRepository,
  ai: NarrativeAiProvider,
) {
  const input = job.payload,
    cp = job.checkpoints;
  if (cp.catalogOperatorLease)
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Operator jobs cannot use narrative generation.',
    );
  const scope = narrativeScope(input);
  const needsReview = !!scope.context.policy.promptVersions.planReviewer,
    limit = scope.context.policy.maxPhysicalRequests;
  if (needsReview && typeof ai.reviewNarrativePlan !== 'function')
    throw new DomainError(
      'AI_NOT_CONFIGURED',
      'Planning review is not configured.',
      503,
    );
  if (
    input.input.lifeId !== job.life_id ||
    input.input.branchId !== job.branch_id ||
    input.revision !== job.base_revision ||
    ((job.shared_privacy_event_ids?.length ?? 0) > 0 &&
      !scope.context.memory.withheld)
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative job ownership differs.',
    );
  await jobs.heartbeat(job);
  await jobs.verifySharedPrivacy(job);
  if (
    hash(
      narrativeReferenceSnapshot(
        await ownedNarrativeReferences(jobs.db, job.user_id, job.branch_id),
      ),
    ) !== hash(narrativeReferenceSnapshot(scope.references))
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative reference prefix differs.',
    );
  // A fully bound result may commit after a ceiling without another request.
  if (cp.narrativeArtifact) {
    let ready: ReturnType<typeof validatedNarrativeCheckpoint> | undefined;
    try {
      ready = validatedNarrativeCheckpoint(cp, input);
    } catch (error) {
      if (
        !(error instanceof DomainError) &&
        !(error instanceof Error && error.name === 'ZodError')
      )
        throw error;
      if (
        error instanceof DomainError &&
        [
          'JOB_LEASE_LOST',
          'LIFE_REVISION_CONFLICT',
          'SHARED_PRIVACY_CHANGED',
        ].includes(error.code)
      )
        throw error;
    }
    if (ready) {
      await jobs.complete(
        job,
        ready.candidate,
        ready.chapter,
        ready.receipts,
        ready,
      );
      return;
    }
  }
  const receipts = [...narrativeReceipts(cp.receipts ?? [])] as AiReceipt[];
  const save = (stage: string, patch: Record<string, unknown>) =>
    jobs.checkpoint(job, stage, patch);
  const clear = async (stage: 'planner' | 'writer' | 'fidelity' | 'editor') => {
    await save(`NARRATIVE_${stage.toUpperCase()}_INVALID`, {
      ...(stage === 'planner'
        ? {
            planningResult: null,
            ...(needsReview
              ? {
                  planningReview: null,
                  planningReviewInputHash: null,
                  planningReviewOutputHash: null,
                }
              : {}),
            candidate: null,
            candidateHash: null,
            canonHash: null,
            planHash: null,
          }
        : {}),
      ...(stage === 'planner' || stage === 'writer'
        ? { chapter: null, storyInputHash: null }
        : {}),
      ...(stage !== 'editor'
        ? {
            fidelityResult: null,
            fidelityPassed: false,
            fidelityInputHash: null,
          }
        : {}),
      editorialReport: null,
      editorialPassed: false,
      editorialInputHash: null,
      narrativeArtifact: null,
    });
  };
  const lastMatches = (task: string, inputHash: string, output: unknown) => {
    const last = receipts.filter((receipt) => receipt.task === task).at(-1);
    return last?.inputHash === inputHash && last.outputHash === hash(output);
  };
  const allowed = async () => {
    await jobs.verifySharedPrivacy(job);
    if (job.attempt >= 5 || Number(cp.leaseRecoveryCount ?? 0) >= 50)
      throw new DomainError(
        'JOB_ATTEMPTS_EXHAUSTED',
        'No further funded processing is allowed.',
      );
    const count =
      cp.providerRequestCount === undefined ? 0 : cp.providerRequestCount;
    if (
      typeof count !== 'number' ||
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count > limit
    )
      throw new DomainError(
        'NARRATIVE_CONTEXT_INVALID',
        'Narrative request count differs.',
      );
    if (count >= limit)
      throw new DomainError(
        'NARRATIVE_REQUEST_LIMIT',
        'Narrative request limit reached.',
      );
  };
  async function record<T>(
    stage: string,
    result: AiResult<T>,
    patch: Record<string, unknown>,
  ) {
    receipts.push(result.receipt);
    await save(stage, { ...patch, receipts });
  }
  async function repair(
    kind:
      | 'narrative_plan'
      | 'narrative_chapter'
      | 'narrative_fidelity'
      | 'narrative_editor',
    error: unknown,
    feedback?: NarrativeRepairFeedback,
  ) {
    if (cp.repairUsed)
      throw new DomainError(
        'NARRATIVE_QUALITY_FAILED',
        'The narrative could not meet the required quality.',
      );
    await save('NARRATIVE_REPAIR_STARTED', {
      repairUsed: true,
      repairKind: kind,
      repairReasonCode:
        error instanceof DomainError ? error.code : 'AI_INVALID_SCHEMA',
      ...(kind === 'narrative_plan'
        ? {
            planningRepair: `Rebuild the proposal from the same server request and state. Correct this validator finding: ${diagnostic(error)}`,
          }
        : {
            narrativeRepairFeedback: feedback ?? {
              kind: 'chapter',
              message: `Correct the chapter under the unchanged canon and plan. ${diagnostic(error)}`,
            },
          }),
    });
    await clear(kind === 'narrative_plan' ? 'planner' : 'writer');
  }
  for (;;) {
    const planningRepair =
      typeof cp.planningRepair === 'string' ? cp.planningRepair : undefined;
    const planningHash = hash(
      narrativePlannerRequest(scope.planningInput, planningRepair),
    );
    let result = cp.planningResult as NarrativePlanningResult | undefined;
    if (
      result &&
      (cp.policyHash !== hash(scope.context.policy) ||
        hash(cp.policy) !== hash(scope.context.policy) ||
        cp.pipelineVersion !== 'narrative-v1' ||
        cp.memoryHash !== hash(scope.context.memory) ||
        cp.referenceHash !==
          hash(narrativeReferenceSnapshot(scope.references)) ||
        cp.planningInputHash !== planningHash ||
        !lastMatches('life_narrative_plan', planningHash, result))
    ) {
      await clear('planner');
      result = undefined;
    }
    let run: ReturnType<typeof narrativeCanon>;
    try {
      if (!result) {
        await allowed();
        const response = await ai.planNarrative(
          scope.planningInput,
          planningRepair,
        );
        result = response.output;
        await record('NARRATIVE_PLANNING_RESULT', response, {
          planningResult: result,
          pipelineVersion: 'narrative-v1',
          policy: scope.context.policy,
          planningInputHash: planningHash,
          policyHash: hash(scope.context.policy),
          memoryHash: hash(scope.context.memory),
          referenceHash: hash(narrativeReferenceSnapshot(scope.references)),
        });
      }
      run = narrativeCanon(input, result);
      await save('NARRATIVE_PLAN_VALIDATED', {
        candidate: run.result.candidate,
        candidateHash: hash(run.result.candidate),
        canonHash: hash(run.canon.events),
        planHash: hash(run.result.plan),
      });
    } catch (error) {
      if (!contentError(error)) throw error;
      await repair('narrative_plan', error);
      continue;
    }
    if (needsReview) {
      const reviewHash = hash(
        narrativePlanReviewRequest(run.planningInput, run.result),
      );
      let review = cp.planningReview as NarrativePlanReview | undefined;
      if (
        review &&
        (cp.planningReviewInputHash !== reviewHash ||
          cp.planningReviewOutputHash !== hash(review) ||
          !lastMatches('life_narrative_plan_review', reviewHash, review))
      ) {
        await clear('writer');
        await save('NARRATIVE_PLAN_REVIEW_INVALID', {
          planningReview: null,
          planningReviewInputHash: null,
          planningReviewOutputHash: null,
        });
        review = undefined;
      }
      try {
        if (!review) {
          await allowed();
          const response = await ai.reviewNarrativePlan!(
            run.planningInput,
            run.result,
          );
          review = response.output;
          await record('NARRATIVE_PLAN_REVIEW_RESULT', response, {
            planningReview: review,
            planningReviewInputHash: reviewHash,
            planningReviewOutputHash: hash(review),
          });
        }
        const report = validateNarrativePlanReview(review, run.result);
        if (!evaluateNarrativePlanReview(report).passed) {
          await repair(
            'narrative_plan',
            new DomainError(
              'NARRATIVE_PLAN_INVALID',
              `Revise the proposed story before drafting. Scores ${JSON.stringify(report.scores)}. ${report.issues.map((issue) => `${issue.explanation} ${issue.suggestedFix}`).join(' ')}`,
            ),
          );
          continue;
        }
      } catch (error) {
        if (!contentError(error)) throw error;
        await repair('narrative_plan', error);
        continue;
      }
    }
    const feedback = cp.narrativeRepairFeedback as
      NarrativeRepairFeedback | undefined;
    const storyHash = hash(narrativeWriterRequest(run.story, feedback));
    let chapter = cp.chapter as PeriodChapterV2 | undefined;
    if (
      chapter &&
      (cp.storyInputHash !== storyHash ||
        !lastMatches('life_narrative_chapter', storyHash, chapter))
    ) {
      await clear('writer');
      chapter = undefined;
    }
    try {
      if (!chapter) {
        await allowed();
        const response = await ai.writeNarrativeChapter(run.story, feedback);
        chapter = response.output;
        await record('NARRATIVE_WRITER_RESULT', response, {
          chapter,
          storyInputHash: storyHash,
        });
      }
      validateNarrativeChapterV1(chapter, run.canon.events);
    } catch (error) {
      if (!contentError(error)) throw error;
      await repair('narrative_chapter', error);
      continue;
    }
    const fidelityHash = hash(narrativeFidelityRequest(run.story, chapter));
    let fidelity = cp.fidelityResult;
    if (
      fidelity &&
      (cp.fidelityInputHash !== fidelityHash ||
        !lastMatches('life_fidelity', fidelityHash, fidelity))
    ) {
      await clear('fidelity');
      fidelity = undefined;
    }
    try {
      if (!fidelity) {
        await allowed();
        const response = await ai.checkNarrativeChapter(run.story, chapter);
        fidelity = response.output;
        await record('NARRATIVE_FIDELITY_RESULT', response, {
          fidelityResult: fidelity,
          fidelityInputHash: fidelityHash,
        });
      }
      const checked = fidelitySchema.parse(fidelity);
      if (!checked.valid || checked.issues.length) {
        const error = new DomainError(
          'NARRATIVE_QUALITY_FAILED',
          'Narrative fidelity failed.',
        );
        await repair('narrative_fidelity', error, {
          kind: 'fidelity',
          message: `Fix only prose and preserve the validated canon and plan. ${checked.issues
            .map((issue) => issue.reason)
            .join(' ')
            .slice(0, 900)}`,
        });
        continue;
      }
    } catch (error) {
      if (!contentError(error)) throw error;
      await repair('narrative_fidelity', error);
      continue;
    }
    const editorialHash = hash(narrativeEditorialRequest(run.story, chapter));
    let editorial = cp.editorialReport;
    if (
      editorial &&
      (cp.editorialInputHash !== editorialHash ||
        !lastMatches('life_narrative_editor', editorialHash, editorial))
    ) {
      await clear('editor');
      editorial = undefined;
    }
    let ready: ReturnType<typeof validatedNarrativeCheckpoint> | undefined;
    try {
      if (!editorial) {
        await allowed();
        const response = await ai.editNarrativeChapter(run.story, chapter);
        editorial = response.output;
        await record('NARRATIVE_EDITORIAL_RESULT', response, {
          editorialReport: editorial,
          editorialInputHash: editorialHash,
        });
      }
      const report = narrativeEditorialReportSchema.parse(editorial);
      validateNarrativeEditorialReport(report, chapter, run.canon);
      if (report.issues.some((issue) => issue.repairScope === 'canon'))
        throw new DomainError(
          'NARRATIVE_QUALITY_FAILED',
          'The chapter cannot be repaired without changing its validated canon.',
        );
      const quality = evaluateNarrativeEditorialGate(report);
      if (!quality.passed) {
        await repair(
          'narrative_editor',
          new DomainError(
            'NARRATIVE_QUALITY_FAILED',
            'Narrative editorial quality failed.',
          ),
          {
            kind: 'editorial',
            message: `Address these scoped editorial issues in prose only. Strengthen ${quality.failedDimensions.join(', ') || 'the overall quality and reported issue areas'}; overall grade ${quality.overall}. Keep canon and the validated plan unchanged.`,
            issues: report.issues,
          },
        );
        continue;
      }
      const artifact = buildNarrativeArtifact(
        input,
        run.result,
        chapter,
        fidelity,
        report,
        receipts,
        feedback,
        needsReview ? (cp.planningReview as NarrativePlanReview) : undefined,
      );
      await save('NARRATIVE_READY_TO_COMMIT', {
        narrativeArtifact: artifact,
        editorialPassed: true,
        fidelityPassed: true,
      });
      ready = validatedNarrativeCheckpoint(cp, input);
    } catch (error) {
      if (!contentError(error)) throw error;
      await repair('narrative_editor', error);
      continue;
    }
    if (!ready)
      throw new DomainError(
        'NARRATIVE_CONTEXT_INVALID',
        'Narrative checkpoint is incomplete.',
      );
    await jobs.complete(
      job,
      ready.candidate,
      ready.chapter,
      ready.receipts,
      ready,
    );
    return;
  }
}
