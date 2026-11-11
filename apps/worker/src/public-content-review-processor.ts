import type { PublicContentReviewAiProvider } from '@future-flow/ai';
import {
  type PublicContentReviewJob,
  PublicContentReviewJobRepository,
} from '@future-flow/database';

export async function processPublicContentReviewJob(
  job: PublicContentReviewJob,
  jobs: PublicContentReviewJobRepository,
  ai: PublicContentReviewAiProvider,
) {
  const input = await jobs.input(job);
  const result = await ai.reviewPublicContent(input);
  await jobs.complete(job, result.output, result.receipt);
}
