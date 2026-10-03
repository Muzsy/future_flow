import type { AiProvider, AiReceipt } from '@future-flow/ai';
import {
  DomainError,
  validateSimulation,
  simulate,
  validateChapters,
} from '@future-flow/core';
import { type Job, JobRepository } from '@future-flow/database';
import {
  simulationOutputSchema,
  chapterOutputSchema,
  localeSchema,
} from '@future-flow/contracts';

export async function processJob(
  job: Job,
  jobs: JobRepository,
  ai: AiProvider,
) {
  // Old persisted jobs have no locale and must resume in their original language.
  const locale = localeSchema.parse(job.payload.locale ?? 'hu');
  const receipts: AiReceipt[] =
    (job.checkpoints.receipts as AiReceipt[] | undefined) ?? [];
  let simulation = job.checkpoints.simulation
    ? simulationOutputSchema.parse(job.checkpoints.simulation)
    : null;
  if (!simulation) {
    await jobs.checkpoint(job, 'SIMULATING_EVENTS', {});
    const result = await ai.events({ ...job.payload, locale });
    simulation = validateSimulation(
      result.output,
      job.payload.profile,
      job.payload.horizonMonths,
    );
    receipts.push(result.receipt);
    await jobs.checkpoint(job, 'EVENTS_READY', { simulation, receipts });
  }
  const canon = simulate(
    validateSimulation(
      simulation,
      job.payload.profile,
      job.payload.horizonMonths,
    ),
    job.payload.state,
  );
  const storyInput = {
    locale,
    profile: job.payload.profile,
    events: canon,
    decision: job.payload.decision,
  };
  let chapters = job.checkpoints.chapters
    ? chapterOutputSchema.parse(job.checkpoints.chapters)
    : null;
  if (!chapters) {
    await jobs.checkpoint(job, 'WRITING_CHAPTERS', {});
    const result = await ai.chapters(storyInput);
    chapters = validateChapters(result.output, canon);
    receipts.push(result.receipt);
    await jobs.checkpoint(job, 'CHECKING_STORY', { chapters, receipts });
  }
  validateChapters(chapters, canon);
  if (!job.checkpoints.fidelityPassed) {
    const checked = await ai.checkStory(storyInput, chapters);
    receipts.push(checked.receipt);
    if (!checked.output.valid || checked.output.issues.length) {
      await jobs.checkpoint(job, 'STORY_REPAIR_REQUIRED', {
        chapters: null,
        fidelityPassed: false,
        receipts,
      });
      throw new DomainError(
        'STORY_FIDELITY_FAILED',
        'A történet ellenőrzése eltérést talált. Újragenerálás szükséges.',
      );
    }
    await jobs.checkpoint(job, 'PERSISTING', {
      fidelityPassed: true,
      receipts,
    });
  }
  await jobs.complete(job, simulation.title, canon, chapters, receipts);
}
