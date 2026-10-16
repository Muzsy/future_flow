import {
  DomainError,
  hash,
  fictionScope,
  fictionCanon,
  validateFictionAuthor,
  fictionPlannerRequest,
  fictionAuthorRequest,
  fictionReviewRequest,
  fictionFidelityRequest,
  fictionEditorialRequest,
  fictionReceipts,
  buildFictionArtifact,
  validatedFictionCheckpoint,
  narrativeReferenceSnapshot,
  evaluateNarrativePlanReview,
  validateNarrativePlanReview,
  evaluateNarrativeEditorialGate,
  validateNarrativeEditorialReport,
  type FictionRepair,
} from '@future-flow/core';
import {
  fidelitySchema,
  narrativePlanReviewV2Schema,
  narrativeEditorialReportSchema,
  type NarrativePlanningResult,
  type FictionAuthorResult,
  type NarrativePlanReview,
} from '@future-flow/contracts';
import {
  ownedNarrativeReferences,
  ownedFictionReferences,
  type LifeJob,
  type LifeJobRepository,
} from '@future-flow/database';
import type { FictionAiProvider, AiResult } from '@future-flow/ai';

function repairable(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'ZodError' ||
      (error instanceof DomainError &&
        ((error.code.startsWith('LIFE_') &&
          ![
            'LIFE_REVISION_CONFLICT',
            'LIFE_DUPLICATE_ID',
            'LIFE_RETRY_UNAVAILABLE',
          ].includes(error.code)) ||
          [
            'NARRATIVE_PLAN_INVALID',
            'NARRATIVE_QUALITY_FAILED',
            'AI_INVALID_SCHEMA',
            'AI_INCOMPLETE_OR_REFUSED',
          ].includes(error.code))))
  );
}

const message = (error: unknown) =>
  error instanceof Error
    ? error.message.slice(0, 1800)
    : 'Invalid creative output.';

export async function processFictionLifeJob(
  job: LifeJob,
  jobs: LifeJobRepository,
  ai: FictionAiProvider,
) {
  const input = job.payload,
    cp = job.checkpoints,
    scope = fictionScope(input);
  if (
    cp.catalogOperatorLease ||
    input.input.lifeId !== job.life_id ||
    input.input.branchId !== job.branch_id ||
    input.revision !== job.base_revision ||
    ((job.shared_privacy_event_ids?.length ?? 0) > 0 &&
      !scope.context.memory.withheld)
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Fiction job ownership/privacy differs.',
    );
  await jobs.heartbeat(job);
  await jobs.verifySharedPrivacy(job);
  if (
    hash(input.narrativeReferences) !==
      hash(
        narrativeReferenceSnapshot(
          await ownedNarrativeReferences(jobs.db, job.user_id, job.branch_id),
        ),
      ) ||
    hash(input.fictionReferences) !==
      hash(await ownedFictionReferences(jobs.db, job.user_id, job.branch_id))
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Fiction owned history prefix differs.',
    );
  if (cp.narrativeArtifact) {
    let ready: ReturnType<typeof validatedFictionCheckpoint> | undefined;
    try {
      ready = validatedFictionCheckpoint(cp, input);
    } catch (error) {
      // Never swallow lease/privacy/DB errors from complete as a content retry.
      if (
        !(
          error instanceof DomainError &&
          [
            'NARRATIVE_PLAN_INVALID',
            'NARRATIVE_CONTEXT_INVALID',
            'NARRATIVE_QUALITY_FAILED',
          ].includes(error.code)
        ) &&
        !(error instanceof Error && error.name === 'ZodError')
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
  const receipts = [...fictionReceipts(cp.receipts ?? [])];
  const save = (stage: string, patch: Record<string, unknown>) =>
    jobs.checkpoint(job, stage, patch);
  const matches = (task: string, request: unknown, output: unknown) => {
    const r = receipts.filter((r) => r.task === task).at(-1);
    return r?.inputHash === hash(request) && r.outputHash === hash(output);
  };
  async function allowed() {
    await jobs.verifySharedPrivacy(job);
    if (job.attempt >= 5 || Number(cp.leaseRecoveryCount ?? 0) >= 50)
      throw new DomainError(
        'JOB_ATTEMPTS_EXHAUSTED',
        'No further funded processing is allowed.',
      );
    const count = cp.providerRequestCount ?? 0;
    if (
      typeof count !== 'number' ||
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count > 9
    )
      throw new DomainError(
        'NARRATIVE_CONTEXT_INVALID',
        'Invalid fiction physical request count.',
      );
    if (count >= 9)
      throw new DomainError(
        'NARRATIVE_REQUEST_LIMIT',
        'Fiction physical request ceiling reached.',
      );
  }
  async function record<T>(
    stage: string,
    response: AiResult<T>,
    patch: Record<string, unknown>,
  ) {
    receipts.push(response.receipt);
    await save(stage, { ...patch, receipts });
  }
  async function clearFinal(keepReview = false) {
    await save('FICTION_FINAL_INVALID', {
      fictionAuthor: null,
      candidate: null,
      chapter: null,
      ...(keepReview ? {} : { planningReview: null }),
      fidelityResult: null,
      editorialReport: null,
      fidelityPassed: false,
      editorialPassed: false,
      narrativeArtifact: null,
    });
  }
  async function repair(
    error: unknown,
    previous: FictionAuthorResult | null,
    proseOnly = false,
    planner = false,
  ) {
    if (!repairable(error)) throw error;
    if (cp.repairUsed)
      throw new DomainError(
        'NARRATIVE_QUALITY_FAILED',
        'The creative story did not meet its required gates after one repair.',
      );
    await save('FICTION_REPAIR_STARTED', {
      repairUsed: true,
      ...(planner
        ? {
            planningRepair: message(error),
            fictionDraft: null,
            fictionRepair: null,
          }
        : {
            fictionRepair: {
              mode: proseOnly ? 'prose_only' : 'author_package',
              message: message(error),
              previous,
            } satisfies FictionRepair,
          }),
    });
    await clearFinal(proseOnly);
  }
  for (;;) {
    const planningRepair =
      typeof cp.planningRepair === 'string' ? cp.planningRepair : undefined;
    let draft = cp.fictionDraft as NarrativePlanningResult | undefined;
    if (
      draft &&
      (!matches(
        'life_narrative_plan',
        fictionPlannerRequest(input, planningRepair),
        draft,
      ) ||
        hash(cp.policy) !== hash(scope.context.policy) ||
        cp.pipelineVersion !== scope.context.policy.mode)
    ) {
      await save('FICTION_DRAFT_INVALID', { fictionDraft: null });
      await clearFinal();
      draft = undefined;
    }
    try {
      if (!draft) {
        await allowed();
        const response = await ai.planFiction(input, planningRepair);
        draft = response.output;
        await record('FICTION_DRAFT_RESULT', response, {
          fictionDraft: draft,
          policy: scope.context.policy,
          pipelineVersion: scope.context.policy.mode,
        });
      }
      fictionCanon(input, draft);
    } catch (error) {
      await repair(error, null, false, true);
      continue;
    }
    const feedback = cp.fictionRepair as FictionRepair | undefined;
    let authored = cp.fictionAuthor as FictionAuthorResult | undefined;
    if (
      authored &&
      !matches(
        'life_narrative_chapter',
        fictionAuthorRequest(input, draft, feedback),
        authored,
      )
    ) {
      await clearFinal();
      authored = undefined;
    }
    let run: ReturnType<typeof validateFictionAuthor>;
    try {
      if (!authored) {
        await allowed();
        const response = await ai.authorFiction(input, draft, feedback);
        authored = response.output;
        await record('FICTION_AUTHOR_RESULT', response, {
          fictionAuthor: authored,
        });
      }
      run = validateFictionAuthor(input, authored);
      if (
        feedback?.mode === 'prose_only' &&
        (!feedback.previous ||
          hash(fictionReviewRequest(input, feedback.previous)) !==
            hash(fictionReviewRequest(input, authored)))
      )
        throw new DomainError(
          'NARRATIVE_PLAN_INVALID',
          'Prose-only repair changed the final story material.',
        );
      await save('FICTION_AUTHOR_VALIDATED', {
        candidate: authored.candidate,
        chapter: authored.chapter,
      });
    } catch (error) {
      await repair(error, authored ?? null);
      continue;
    }
    let review = cp.planningReview as NarrativePlanReview | undefined;
    if (
      review &&
      !matches(
        'life_narrative_plan_review',
        fictionReviewRequest(input, authored),
        review,
      )
    ) {
      await save('FICTION_REVIEW_INVALID', {
        planningReview: null,
        fidelityResult: null,
        editorialReport: null,
        narrativeArtifact: null,
      });
      review = undefined;
    }
    try {
      if (!review) {
        await allowed();
        const response = await ai.reviewFiction(input, authored);
        review = response.output;
        await record('FICTION_FINAL_REVIEW_RESULT', response, {
          planningReview: review,
        });
      }
      const checked = narrativePlanReviewV2Schema.parse(review);
      validateNarrativePlanReview(
        checked,
        run.result,
        'life_narrative_plan_review.v2',
      );
      if (!evaluateNarrativePlanReview(checked).passed)
        throw new DomainError(
          'NARRATIVE_QUALITY_FAILED',
          `Improve the final authored story: ${JSON.stringify(checked)}`,
        );
    } catch (error) {
      await repair(error, authored);
      continue;
    }
    let fidelity = cp.fidelityResult;
    if (
      fidelity &&
      !matches(
        'life_fidelity',
        fictionFidelityRequest(input, authored),
        fidelity,
      )
    ) {
      await save('FICTION_FIDELITY_INVALID', {
        fidelityResult: null,
        editorialReport: null,
        narrativeArtifact: null,
      });
      fidelity = undefined;
    }
    try {
      if (!fidelity) {
        await allowed();
        const response = await ai.checkFiction(input, authored);
        fidelity = response.output;
        await record('FICTION_FIDELITY_RESULT', response, {
          fidelityResult: fidelity,
        });
      }
      const checked = fidelitySchema.parse(fidelity);
      if (!checked.valid || checked.issues.length)
        throw new DomainError(
          'NARRATIVE_QUALITY_FAILED',
          `Correct the final package/prose discrepancy: ${checked.issues.map((i) => i.reason).join(' ')}`,
        );
    } catch (error) {
      await repair(error, authored);
      continue;
    }
    let editorial = cp.editorialReport;
    if (
      editorial &&
      !matches(
        'life_narrative_editor',
        fictionEditorialRequest(input, authored),
        editorial,
      )
    ) {
      await save('FICTION_EDITOR_INVALID', {
        editorialReport: null,
        narrativeArtifact: null,
      });
      editorial = undefined;
    }
    let proseOnly = false;
    try {
      if (!editorial) {
        await allowed();
        const response = await ai.editFiction(input, authored);
        editorial = response.output;
        await record('FICTION_EDITOR_RESULT', response, {
          editorialReport: editorial,
        });
      }
      const report = narrativeEditorialReportSchema.parse(editorial);
      validateNarrativeEditorialReport(report, authored.chapter, run.canon);
      proseOnly = !report.issues.some((i) => i.repairScope === 'canon');
      if (!evaluateNarrativeEditorialGate(report).passed)
        throw new DomainError(
          'NARRATIVE_QUALITY_FAILED',
          `Rewrite the weak story rather than paraphrasing it: ${JSON.stringify(report)}`,
        );
      const artifact = buildFictionArtifact(
        input,
        draft,
        authored,
        review,
        fidelity,
        report,
        receipts,
        planningRepair,
        feedback,
      );
      await save('FICTION_READY_TO_COMMIT', {
        narrativeArtifact: artifact,
        fidelityPassed: true,
        editorialPassed: true,
      });
    } catch (error) {
      await repair(
        error,
        authored,
        proseOnly &&
          !(
            error instanceof DomainError &&
            error.code === 'NARRATIVE_PLAN_INVALID'
          ),
      );
      continue;
    }
    const ready = validatedFictionCheckpoint(cp, input);
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
