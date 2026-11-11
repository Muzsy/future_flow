import type { PublicReviewAiProvider } from '@future-flow/ai';
import {
  type PublicReviewJob,
  PublicReviewJobRepository,
} from '@future-flow/database';

export async function processPublicReviewJob(
  job: PublicReviewJob,
  jobs: PublicReviewJobRepository,
  ai: PublicReviewAiProvider,
) {
  const input = await jobs.input(job);
  const result = await ai.reviewPublicCopy(input);
  await jobs.complete(job, result.output, result.receipt);
}
