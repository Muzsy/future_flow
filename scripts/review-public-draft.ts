import { existsSync } from 'node:fs';
import { z } from 'zod';
import {
  ExperimentAiBudget,
  OpenAiProvider,
  type AiRequestGuard,
} from '@future-flow/ai';
import {
  connectDatabase,
  PublicDraftRepository,
  PublicReviewRepository,
} from '@future-flow/database';
import { DomainError, preparePublicReviewInput } from '@future-flow/core';
import { runPublicDraftReview } from './lib/public-review';

// Developer/operator tool only. No paid client endpoint or automatic publication.
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3 || !['--preflight', '--run'].includes(args[0]!))
    throw new DomainError(
      'PUBLIC_REVIEW_CONFIG',
      'Use --preflight or --run, owner UUID and draft UUID.',
    );
  const userId = z.uuid().parse(args[1]),
    draftId = z.uuid().parse(args[2]);
  if (process.env.PUBLIC_REVIEW_OPERATOR_ENABLED !== 'true')
    throw new DomainError(
      'PUBLIC_REVIEW_CONFIG',
      'Trusted operator opt-in required.',
    );
  const db = connectDatabase(
    process.env.DATABASE_URL ?? '',
    process.env.DATABASE_SSL === 'true',
  );
  let experiment: ExperimentAiBudget | undefined;
  try {
    const preview = await new PublicDraftRepository(db).get(userId, draftId);
    const input = preparePublicReviewInput(preview.snapshot);
    const previous = await new PublicReviewRepository(db).get(userId, draftId);
    if (args[0] === '--preflight' || previous.status === 'completed') {
      console.log(
        JSON.stringify({
          status: previous.status,
          fields: input.fields.length,
          paidAiCalls: 0,
          publicationApproved: false,
        }),
      );
      return;
    }
    if (!existsSync('.local/ai-smoke/usage.json'))
      throw new DomainError(
        'PUBLIC_REVIEW_CONFIG',
        'The cumulative experimental ledger is required.',
      );
    experiment = new ExperimentAiBudget(
      '.local/ai-smoke/usage.json',
      5,
      'public-draft-review-p09',
    );
    let reservedUsd = 0;
    const guard: AiRequestGuard = {
      reserve: async (raw) => {
        const request = raw as { model: string; max_output_tokens: number };
        if (request.model !== 'gpt-6.1-sol')
          throw new DomainError(
            'PUBLIC_REVIEW_CONFIG',
            'This experiment pins Sol.',
          );
        const bound =
          ((Buffer.byteLength(JSON.stringify(raw), 'utf8') + 4096) * 2.5 +
            request.max_output_tokens * 10) /
          1e6;
        if (reservedUsd + bound > 0.25)
          throw new DomainError(
            'SMOKE_BUDGET_EXCEEDED',
            'This review is limited to 0.25 USD reserved.',
          );
        reservedUsd += bound;
        return experiment!.reserve(raw);
      },
      settle: (id, usage) => experiment!.settle(id, usage),
    };
    const ai = new OpenAiProvider({
      apiKey: process.env.OPENAI_API_KEY ?? '',
      eventModel: 'gpt-6.1-sol',
      storyModel: 'gpt-6.1-sol',
      checkModel: 'gpt-6.1-sol',
      timeoutMs: 90000,
      maxOutputTokens: 2200,
      guard,
    });
    const result = await runPublicDraftReview(db, ai, userId, draftId);
    console.log(
      JSON.stringify({
        status: result.review.status,
        reused: result.reused,
        verdict: result.review.report?.verdict ?? null,
        findings: result.review.report?.findings.length ?? 0,
        publicationApproved: false,
      }),
    );
  } finally {
    experiment?.close();
    await db.close();
  }
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      publicReview: 'failed',
      code: error instanceof DomainError ? error.code : 'PUBLIC_REVIEW_FAILED',
      publicationApproved: false,
    }),
  );
  process.exitCode = 1;
});
