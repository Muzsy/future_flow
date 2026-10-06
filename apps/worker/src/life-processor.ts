import {
  DomainError,
  hash,
  simulatePeriodV2,
  validatePeriodChapterV2,
  validatePersonalSharedMemories,
} from '@future-flow/core';
import type {
  PeriodCandidateV2,
  PeriodChapterV2,
} from '@future-flow/contracts';
import type { LifeJob, LifeJobRepository } from '@future-flow/database';
import type {
  AiReceipt,
  LifeAiProvider,
  PeriodStoryInput,
} from '@future-flow/ai';

export async function processLifeJob(
  job: LifeJob,
  jobs: LifeJobRepository,
  ai: LifeAiProvider,
) {
  const input = job.payload;
  await jobs.verifySharedPrivacy(job);
  const sharedEvents = validatePersonalSharedMemories(
    input.memory.sharedEvents,
    input.startDate,
  );
  const receipts = (job.checkpoints.receipts ?? []) as AiReceipt[];
  const scope = {
    lifeId: job.life_id,
    branchId: job.branch_id,
    revision: job.base_revision,
    acceptedDecisionIds: input.acceptedDecisionIds,
  };
  let candidate = job.checkpoints.candidate as PeriodCandidateV2 | undefined;
  if (!candidate) {
    let repair: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt === 1 && job.checkpoints.repairUsed)
        throw new DomainError(
          'LIFE_REPAIR_EXHAUSTED',
          'Event repair already used.',
        );
      if (attempt === 1)
        await jobs.checkpoint(job, 'EVENT_REPAIR', {
          repairUsed: true,
          repairKind: 'events',
        });
      await jobs.verifySharedPrivacy(job);
      const result = await ai.period(input, repair);
      receipts.push(result.receipt);
      await jobs.checkpoint(job, 'EVENT_VALIDATION', { receipts });
      try {
        if (
          result.output.periodId !== input.periodId ||
          result.output.durationMonths !== 6
        )
          throw new DomainError(
            'LIFE_PERIOD_INTERVAL',
            'Requested period mismatch.',
          );
        simulatePeriodV2(
          result.output,
          input.state,
          input.input.constraints,
          scope,
        );
        candidate = result.output;
        await jobs.checkpoint(job, 'CANON_READY', {
          candidate,
          periodInputHash: hash({ ...input, repair: repair ?? null }),
        });
        break;
      } catch (error) {
        if (attempt || !(error instanceof DomainError)) throw error;
        repair = `Correct the previous event proposal. Validation code: ${error.code}. Rebuild from the same starting state and request; do not change IDs supplied by the server.`;
        if (error.code === 'LIFE_INVALID_TIMELINE')
          repair +=
            ' Every new event date must be strictly after startDate, at or before endDate, in nondecreasing order. Historical shared effectiveAt/knownAt dates are background references, never new event dates.';
        await jobs.checkpoint(job, 'EVENT_REJECTED', {
          repairReasonCode: error.code,
        });
      }
    }
  }
  if (!candidate)
    throw new DomainError('LIFE_PERIOD_INVALID', 'No valid period.');
  const canon = simulatePeriodV2(
    candidate,
    input.state,
    input.input.constraints,
    scope,
  );
  const story: PeriodStoryInput = {
    locale: input.input.locale,
    identity: input.input.identity,
    goals: input.input.goals,
    events: canon.events,
    ...(sharedEvents.length ? { sharedEvents } : {}),
  };
  let chapter = job.checkpoints.chapter as PeriodChapterV2 | undefined;
  if (!job.checkpoints.fidelityPassed) {
    let repair = job.checkpoints.storyRepairReason as string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt === 1) {
        if (job.checkpoints.repairUsed)
          throw new DomainError(
            'LIFE_REPAIR_EXHAUSTED',
            'Story repair already used.',
          );
        await jobs.checkpoint(job, 'STORY_REPAIR', {
          repairUsed: true,
          repairKind: 'story',
        });
      }
      if (!chapter) {
        await jobs.verifySharedPrivacy(job);
        const result = await ai.periodChapter(story, repair);
        receipts.push(result.receipt);
        chapter = result.output;
        await jobs.checkpoint(job, 'CHAPTER_READY', {
          chapter,
          receipts,
          chapterInputHash: hash({ ...story, repair: repair ?? null }),
        });
      }
      let problems: string | null = null;
      try {
        validatePeriodChapterV2(chapter, canon.events);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        problems = error.code;
      }
      if (!problems) {
        await jobs.verifySharedPrivacy(job);
        const check = await ai.checkPeriodChapter(story, chapter);
        receipts.push(check.receipt);
        await jobs.checkpoint(job, 'FIDELITY_CHECK', {
          receipts,
          fidelityInputHash: hash({ ...story, chapter }),
        });
        if (!check.output.valid || check.output.issues.length)
          problems =
            check.output.issues.map((issue) => issue.reason).join(' ') ||
            'The chapter was rejected by the fidelity checker.';
      }
      if (!problems) {
        await jobs.checkpoint(job, 'VALIDATED', { fidelityPassed: true });
        break;
      }
      chapter = undefined;
      repair = problems;
      await jobs.checkpoint(job, 'CHAPTER_REJECTED', {
        chapter: null,
        storyRepairReason: problems,
        repairReasonCode: problems.startsWith('LIFE_')
          ? problems
          : 'STORY_FIDELITY_FAILED',
        fidelityPassed: false,
      });
      if (attempt)
        throw new DomainError(
          'STORY_FIDELITY_FAILED',
          'The story differs from canon.',
        );
    }
  }
  if (!chapter || !job.checkpoints.fidelityPassed)
    throw new DomainError('STORY_FIDELITY_FAILED', 'No validated chapter.');
  await jobs.complete(job, candidate, chapter, receipts);
}
