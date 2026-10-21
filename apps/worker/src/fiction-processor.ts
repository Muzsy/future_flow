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
  evaluateFictionEditorialGate,
  fictionProseRepairAllowed,
  validateFictionEditorialReport,
  type FictionRepair,
} from '@future-flow/core';
import {
  fidelitySchema,
  narrativePlanReviewV2Schema,
  fictionEditorialReportSchema,
  fictionCoordinatedQualityVersions,
  fictionFidelityFirstRepairQualityVersions,
  type NarrativePlanningResult,
  type FictionAuthorResult,
  type FictionEditorialReport,
  type NarrativePlanReview,
} from '@future-flow/contracts';
import {
  ownedNarrativeReferences,
  ownedFictionReferences,
  assertFictionCharacterFold,
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

const clip = (text: string, limit: number) =>
  text.length <= limit ? text : text.slice(0, limit - 12) + ' [clipped]';
const failingFlagsLine = (report: FictionEditorialReport) =>
  `Failing flags: ${
    report.version === '1.0.0'
      ? ''
      : Object.entries(report.sequenceReview)
          .filter(([, value]) => value === false)
          .map(([key]) => key)
          .join(', ')
  }`;
type EditorIssue = FictionEditorialReport['issues'][number];
const issueLead = (issue: EditorIssue) =>
  `${issue.dimension}/${issue.severity}/${issue.repairScope}, paragraph ${issue.paragraphIndex}:`;
const issueLine = (issue: EditorIssue) =>
  `${issueLead(issue)} ${issue.explanation} Fix: ${issue.suggestedFix}`;

// Keep both checker messages visible within the existing 1800-character repair
// budget. Raw, complete checker outputs remain bound in their own checkpoints.
function combinedValidationError(
  fidelityError: unknown,
  editorialError: unknown,
  report?: FictionEditorialReport,
) {
  const editor = report
    ? [failingFlagsLine(report), ...report.issues.map(issueLine)].join('\n')
    : message(editorialError);
  return new DomainError(
    'NARRATIVE_QUALITY_FAILED',
    `Fix BOTH final checks in one full-package repair.\nFidelity: ${clip(message(fidelityError), 800)}\nEditor: ${clip(editor, 850)}`,
  );
}

const EDITOR_FINDINGS_PREFIX = "Correct the final package's literary issues:\n";
const blockingIssue = (issue: EditorIssue) =>
  issue.severity === 'major' || issue.repairScope === 'canon';
const MIN_SECTION = 40;

// The v9 editor-triggered repair message: the same per-issue formatter as the
// combined message, within the 1800-character repair budget. Blocking issues
// come first and keep their whole suggestedFix; explanations are clipped first,
// then non-blocking issues are dropped, and only if the blocking fixes alone do
// not fit are those clipped evenly.
function editorFindings(report: FictionEditorialReport, limit: number) {
  const low = Object.entries(report.scores)
    .filter(([, value]) => value < 4)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
  const header = `${failingFlagsLine(report)}\nScores below 4: ${low || 'none'}`;
  let issues = [...report.issues].sort(
    (a, b) => Number(blockingIssue(b)) - Number(blockingIssue(a)),
  );
  const render = (explain: number, fix: number) =>
    [
      header,
      ...issues.map(
        (issue) =>
          `${issueLead(issue)} ${clip(issue.explanation, explain)} Fix: ${clip(issue.suggestedFix, fix)}`,
      ),
    ].join('\n');
  if (render(Infinity, Infinity).length <= limit)
    return render(Infinity, Infinity);
  for (;;) {
    const fixed =
      header.length +
      issues.reduce(
        (n, issue) => n + 1 + issueLead(issue).length + ' Fix: '.length + 1,
        0,
      );
    const fixes = issues.reduce((n, issue) => n + issue.suggestedFix.length, 0);
    const explain = Math.floor(
      (limit - fixed - fixes) / Math.max(issues.length, 1),
    );
    if (explain >= MIN_SECTION) return render(Math.min(explain, 350), Infinity);
    // Blocking issues sort first, so the last issue is the next spare one.
    const last = issues.at(-1);
    if (!last || blockingIssue(last) || issues.length === 1) {
      const share = Math.floor(
        (limit - fixed - issues.length * MIN_SECTION) /
          Math.max(issues.length, 1),
      );
      return render(MIN_SECTION, Math.max(share, MIN_SECTION)).slice(0, limit);
    }
    issues = issues.slice(0, -1);
  }
}

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
  await assertFictionCharacterFold(jobs.db, job.user_id, job.branch_id, input);
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
  async function readEditorial(authored: FictionAuthorResult) {
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
    if (!editorial) {
      await allowed();
      const response = await ai.editFiction(input, authored);
      editorial = response.output;
      await record('FICTION_EDITOR_RESULT', response, {
        editorialReport: editorial,
      });
    }
    const report = fictionEditorialReportSchema.parse(editorial);
    validateFictionEditorialReport(input, authored, report);
    return report;
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
          hash(fictionReviewRequest(input, feedback.previous, draft)) !==
            hash(fictionReviewRequest(input, authored, draft)))
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
        fictionReviewRequest(input, authored, draft),
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
        const response = await ai.reviewFiction(input, authored, draft);
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
      // Frozen policies retain their original immediate fidelity-repair path.
      const checked = fidelitySchema.safeParse(fidelity);
      if (
        fictionCoordinatedQualityVersions.includes(
          scope.context.policy.qualityPolicyVersion,
        ) &&
        !cp.repairUsed &&
        error instanceof DomainError &&
        error.code === 'NARRATIVE_QUALITY_FAILED' &&
        checked.success &&
        (!checked.data.valid || checked.data.issues.length > 0)
      ) {
        const remaining =
          scope.context.policy.maxPhysicalRequests -
          Number(cp.providerRequestCount ?? 0);
        if (remaining < 4)
          throw new DomainError(
            'NARRATIVE_REQUEST_LIMIT',
            'Too few requests remain for a complete final-package repair.',
          );
        // The measured fidelity failures all passed the editor, so v9 repairs
        // from the fidelity reason alone and lets the editor judge the repaired
        // package once: 8 requests instead of 9.
        if (
          fictionFidelityFirstRepairQualityVersions.includes(
            scope.context.policy.qualityPolicyVersion,
          )
        ) {
          await repair(error, authored);
          continue;
        }
        const cachedEditor =
          cp.editorialReport &&
          matches(
            'life_narrative_editor',
            fictionEditorialRequest(input, authored),
            cp.editorialReport,
          );
        // An earlier transport retry may leave only the four required repair
        // calls. Preserve that route instead of spending its last spare slot.
        if (remaining >= 4 + (cachedEditor ? 0 : 1)) {
          let report: FictionEditorialReport | undefined;
          let editorialError: unknown;
          try {
            report = await readEditorial(authored);
            if (!evaluateFictionEditorialGate(input, report).passed)
              editorialError = new DomainError(
                'NARRATIVE_QUALITY_FAILED',
                'The existing literary check also requires a repair.',
              );
          } catch (checkError) {
            // Transport/auth/budget/lease/privacy failures are never converted
            // into feedback or hidden behind a content repair.
            if (!repairable(checkError)) throw checkError;
            editorialError = checkError;
          }
          if (
            scope.context.policy.maxPhysicalRequests -
              Number(cp.providerRequestCount ?? 0) <
            4
          )
            throw new DomainError(
              'NARRATIVE_REQUEST_LIMIT',
              'Too few requests remain after final-check collection for a complete repair.',
            );
          await repair(
            editorialError
              ? combinedValidationError(error, editorialError, report)
              : error,
            authored,
          );
          continue;
        }
      }
      await repair(error, authored);
      continue;
    }
    let proseOnly = false;
    try {
      const report = await readEditorial(authored);
      proseOnly = fictionProseRepairAllowed(report);
      if (!evaluateFictionEditorialGate(input, report).passed)
        throw new DomainError(
          'NARRATIVE_QUALITY_FAILED',
          fictionFidelityFirstRepairQualityVersions.includes(
            scope.context.policy.qualityPolicyVersion,
          )
            ? EDITOR_FINDINGS_PREFIX +
                editorFindings(report, 1800 - EDITOR_FINDINGS_PREFIX.length)
            : `Rewrite the weak story rather than paraphrasing it: ${JSON.stringify(report)}`,
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
