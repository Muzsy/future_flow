import type { ScenarioReviewAiProvider } from '@future-flow/ai';
import {
  ScenarioReleaseRepository,
  type Database,
  type ScenarioReleaseConfig,
} from '@future-flow/database';
export async function runScenarioReview(
  db: Database,
  config: ScenarioReleaseConfig,
  userId: string,
  request: unknown,
  createAi: (reviewId: string) => ScenarioReviewAiProvider,
) {
  const reviews = new ScenarioReleaseRepository(db, config),
    started = await reviews.start(userId, request);
  if (started.reused)
    return {
      reused: true,
      view: await reviews.get(
        userId,
        (request as { scenarioVersionId: string }).scenarioVersionId,
      ),
    };
  try {
    const result = await createAi(started.reviewId).reviewScenario(
      started.input,
    );
    const view = await reviews.complete(
      userId,
      (request as { scenarioVersionId: string }).scenarioVersionId,
      started.reviewId,
      started.leaseToken!,
      result.output,
      result.receipt,
    );
    return { reused: false, view };
  } catch (error) {
    await reviews.fail(userId, started.reviewId, started.leaseToken!);
    throw error;
  }
}
