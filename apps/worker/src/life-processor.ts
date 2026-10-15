import {
  DomainError,
  hash,
  simulatePeriodV2,
  validatePeriodChapterV2,
  validatePersonalSharedMemories,
} from '@future-flow/core';
import {
  fidelitySchema,
  periodCandidateV2Schema,
  type PeriodCandidateV2,
  type PeriodChapterV2,
  narrativeContextSchema,
  NARRATIVE_MEMORY_BYTES,
} from '@future-flow/contracts';
import type { LifeJob, LifeJobRepository } from '@future-flow/database';
import type {
  AiReceipt,
  LifeAiProvider,
  PeriodStoryInput,
} from '@future-flow/ai';
import type { NarrativeAiProvider } from '@future-flow/ai';
import { processNarrativeLifeJob } from './narrative-processor';

function eventRepair(code: string) {
  let repair = `Correct the previous event proposal. Validation code: ${code}. Rebuild from the same starting state and request; do not change IDs supplied by the server.`;
  if (code === 'LIFE_INVALID_TIMELINE')
    repair +=
      ' Every new event date must be strictly after startDate, at or before endDate, in nondecreasing order. Historical shared effectiveAt/knownAt dates are background references, never new event dates.';
  return repair;
}

export async function processLifeJob(
  job: LifeJob,
  jobs: LifeJobRepository,
  ai: LifeAiProvider,
) {
  const input = job.payload;
  if (input.narrativeContext?.policy.mode === 'narrative-v1') {
    const provider = ai as LifeAiProvider & Partial<NarrativeAiProvider>;
    if (
      ![
        'planNarrative',
        'writeNarrativeChapter',
        'checkNarrativeChapter',
        'editNarrativeChapter',
        ...(input.narrativeContext.policy.promptVersions.planReviewer
          ? ['reviewNarrativePlan']
          : []),
      ].every(
        (method) =>
          typeof provider[method as keyof NarrativeAiProvider] === 'function',
      )
    )
      throw new DomainError(
        'AI_NOT_CONFIGURED',
        'Narrative generation is not configured.',
        503,
      );
    return processNarrativeLifeJob(
      job,
      jobs,
      provider as LifeAiProvider & NarrativeAiProvider,
    );
  }
  await jobs.verifySharedPrivacy(job);
  const parsedContext = narrativeContextSchema.safeParse(
    input.narrativeContext,
  );
  if (
    input.narrativeContext !== undefined &&
    (!parsedContext.success ||
      parsedContext.data.memory.branchId !== job.branch_id ||
      parsedContext.data.memory.baseRevision !== job.base_revision ||
      parsedContext.data.memory.recentChoices.some(
        (choice) => !input.acceptedDecisionIds.includes(choice.decisionId),
      ) ||
      parsedContext.data.memory.history.some(
        (period) => period.endDate > input.startDate,
      ) ||
      ((job.shared_privacy_event_ids?.length ?? 0) > 0 &&
        !parsedContext.data.memory.withheld) ||
      Buffer.byteLength(JSON.stringify(parsedContext.data.memory), 'utf8') >
        NARRATIVE_MEMORY_BYTES)
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative context binding differs.',
    );
  const narrativeContext =
    input.narrativeContext === undefined
      ? undefined
      : parsedContext.success
        ? parsedContext.data
        : undefined;
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
  if (
    narrativeContext &&
    candidate &&
    job.checkpoints.periodInputHash !==
      hash({
        ...input,
        repair:
          typeof job.checkpoints.eventRepairReasonCode === 'string'
            ? eventRepair(job.checkpoints.eventRepairReasonCode)
            : null,
      })
  ) {
    await jobs.checkpoint(job, 'CANDIDATE_CONTEXT_INVALID', {
      candidate: null,
      chapter: null,
      fidelityResult: null,
      fidelityPassed: false,
    });
    candidate = undefined;
  }
  if (!candidate) {
    const previousCode =
      job.checkpoints.eventRepairReasonCode ??
      (job.checkpoints.repairKind === 'events' ||
      (typeof job.checkpoints.repairReasonCode === 'string' &&
        job.checkpoints.repairReasonCode.startsWith('LIFE_') &&
        !job.checkpoints.storyRepairReason)
        ? job.checkpoints.repairReasonCode
        : undefined);
    let repair =
      typeof previousCode === 'string' ? eventRepair(previousCode) : undefined;
    for (let attempt = repair ? 1 : 0; attempt < 2; attempt++) {
      if (
        attempt === 1 &&
        (job.checkpoints.eventRepairRejected ||
          (job.checkpoints.repairUsed &&
            job.checkpoints.repairKind !== 'events'))
      )
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
      const proposalInputHash = hash({ ...input, repair: repair ?? null });
      const cachedProposal = periodCandidateV2Schema.safeParse(
        job.checkpoints.eventProposal,
      );
      let proposal =
        cachedProposal.success &&
        job.checkpoints.eventProposalInputHash === proposalInputHash
          ? cachedProposal.data
          : undefined;
      if (!proposal) {
        const result = await ai.period(input, repair);
        receipts.push(result.receipt);
        proposal = result.output;
        await jobs.checkpoint(job, 'EVENT_VALIDATION', {
          receipts,
          eventProposal: proposal,
          eventProposalInputHash: proposalInputHash,
        });
      }
      try {
        if (
          proposal.periodId !== input.periodId ||
          proposal.durationMonths !== 6
        )
          throw new DomainError(
            'LIFE_PERIOD_INTERVAL',
            'Requested period mismatch.',
          );
        simulatePeriodV2(proposal, input.state, input.input.constraints, scope);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        if (attempt) {
          await jobs.checkpoint(job, 'EVENT_REPAIR_REJECTED', {
            eventProposal: null,
            eventRepairRejected: true,
            repairReasonCode: error.code,
          });
          throw error;
        }
        repair = eventRepair(error.code);
        await jobs.checkpoint(job, 'EVENT_REJECTED', {
          eventProposal: null,
          eventRepairReasonCode: error.code,
          repairReasonCode: error.code,
        });
        continue;
      }
      candidate = proposal;
      await jobs.checkpoint(job, 'CANON_READY', {
        candidate,
        eventProposal: null,
        periodInputHash: hash({ ...input, repair: repair ?? null }),
      });
      break;
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
    ...(narrativeContext ? { narrativeContext } : {}),
  };
  let chapter = job.checkpoints.chapter as PeriodChapterV2 | undefined;
  if (
    narrativeContext &&
    chapter &&
    job.checkpoints.chapterInputHash !==
      hash({ ...story, repair: job.checkpoints.storyRepairReason ?? null })
  ) {
    await jobs.checkpoint(job, 'CHAPTER_CONTEXT_INVALID', {
      chapter: null,
      fidelityResult: null,
      fidelityPassed: false,
    });
    chapter = undefined;
  }
  const cachedFidelity = fidelitySchema.safeParse(
    job.checkpoints.fidelityResult,
  );
  const matches =
    chapter &&
    job.checkpoints.fidelityInputHash === hash({ ...story, chapter });
  if (
    (job.checkpoints.fidelityResult != null ||
      job.checkpoints.fidelityPassed) &&
    (!matches ||
      (job.checkpoints.fidelityResult != null && !cachedFidelity.success))
  )
    await jobs.checkpoint(job, 'CACHED_FIDELITY_INVALID', {
      fidelityPassed: false,
      fidelityResult: null,
    });
  if (!job.checkpoints.fidelityPassed) {
    let repair = job.checkpoints.storyRepairReason as string | undefined;
    if (job.checkpoints.storyRepairRejected)
      throw new DomainError(
        'STORY_FIDELITY_FAILED',
        'The story repair was rejected.',
      );
    for (let attempt = repair ? 1 : 0; attempt < 2; attempt++) {
      if (attempt === 1) {
        if (
          job.checkpoints.repairUsed &&
          job.checkpoints.repairKind !== 'story'
        )
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
          fidelityResult: null,
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
        const cached = fidelitySchema.safeParse(job.checkpoints.fidelityResult);
        let fidelity =
          cached.success &&
          job.checkpoints.fidelityInputHash === hash({ ...story, chapter })
            ? cached.data
            : undefined;
        if (!fidelity) {
          const check = await ai.checkPeriodChapter(story, chapter);
          receipts.push(check.receipt);
          fidelity = check.output;
          await jobs.checkpoint(job, 'FIDELITY_CHECK', {
            receipts,
            fidelityResult: fidelity,
            fidelityInputHash: hash({ ...story, chapter }),
          });
        }
        if (!fidelity.valid || fidelity.issues.length)
          problems =
            fidelity.issues.map((issue) => issue.reason).join(' ') ||
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
        fidelityResult: null,
        storyRepairRejected: attempt === 1,
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
