import type { PublicReviewAiProvider } from '@future-flow/ai';
import { PublicReviewRepository, type Database } from '@future-flow/database';

export async function runPublicDraftReview(
  db: Database,
  ai: PublicReviewAiProvider,
  userId: string,
  draftId: string,
) {
  const reviews = new PublicReviewRepository(db);
  const started = await reviews.start(userId, draftId);
  if (started.reused)
    return { reused: true, review: await reviews.get(userId, draftId) };
  try {
    const result = await ai.reviewPublicCopy(started.input);
    await reviews.complete(
      userId,
      draftId,
      started.reviewId,
      result.output,
      result.receipt,
    );
    return { reused: false, review: await reviews.get(userId, draftId) };
  } catch (error) {
    await reviews.fail(userId, draftId, started.reviewId);
    throw error;
  }
}
