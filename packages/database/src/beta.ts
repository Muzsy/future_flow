import { randomUUID } from 'node:crypto';
import { betaFeedbackSchema } from '@future-flow/contracts';
import { DomainError, hash } from '@future-flow/core';
import type { Database } from './index';

// Caller holds the user's row lock. Client clocks never define inactivity.
export async function activitySession(
  tx: Database,
  userId: string,
  clientId: string,
) {
  const previous = (
    await tx.query<{ id: string }>(
      "SELECT id FROM aw_activity_sessions WHERE user_id=$1 AND client_id=$2 AND last_seen_at > now()-interval '30 minutes' ORDER BY last_seen_at DESC LIMIT 1",
      [userId, clientId],
    )
  )[0];
  if (previous) {
    await tx.query(
      'UPDATE aw_activity_sessions SET last_seen_at=now() WHERE id=$1 AND user_id=$2',
      [previous.id, userId],
    );
    return previous.id;
  }
  const id = randomUUID();
  await tx.query(
    'INSERT INTO aw_activity_sessions(id,user_id,client_id) VALUES($1,$2,$3)',
    [id, userId, clientId],
  );
  return id;
}
export class BetaFeedbackRepository {
  constructor(private readonly db: Database) {}
  async submit(userId: string, raw: unknown) {
    const input = betaFeedbackSchema.parse(raw),
      payloadHash = hash(input);
    return this.db.transaction(async (tx) => {
      const user = (
        await tx.query('SELECT status FROM ff_users WHERE id=$1 FOR UPDATE', [
          userId,
        ])
      )[0];
      if (!user || user.status !== 'active')
        throw new DomainError('ACCOUNT_DELETING', 'Account unavailable.', 403);
      const previous = (
        await tx.query(
          'SELECT payload_hash FROM aw_feedback WHERE id=$1 AND user_id=$2',
          [input.feedbackId, userId],
        )
      )[0];
      if (previous) {
        if (previous.payload_hash !== payloadHash)
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'Feedback identifier reused.',
            409,
          );
        return { feedbackId: input.feedbackId, received: true };
      }
      if (
        input.branchId &&
        !(
          await tx.query(
            "SELECT b.id FROM aw_branches b JOIN aw_lives l ON l.id=b.life_id AND l.user_id=b.user_id WHERE b.id=$1 AND b.user_id=$2 AND l.content_locale='en'",
            [input.branchId, userId],
          )
        ).length
      )
        throw new DomainError('RESOURCE_NOT_FOUND', 'Life unavailable.', 404);
      if (
        input.periodId &&
        !(
          await tx.query(
            'SELECT period_id FROM aw_history WHERE branch_id=$1 AND user_id=$2 AND period_id=$3',
            [input.branchId, userId, input.periodId],
          )
        ).length
      )
        throw new DomainError(
          'RESOURCE_NOT_FOUND',
          'Chapter unavailable.',
          404,
        );
      const count = (
        await tx.query<{ total: number }>(
          "SELECT count(*)::int AS total FROM aw_feedback WHERE user_id=$1 AND created_at > now()-interval '24 hours'",
          [userId],
        )
      )[0]!;
      if (count.total >= 5)
        throw new DomainError('FEEDBACK_LIMIT', 'Feedback limit reached.', 429);
      const inserted = await tx.query(
        'INSERT INTO aw_feedback(id,user_id,branch_id,period_id,category,would_continue,message,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING RETURNING id',
        [
          input.feedbackId,
          userId,
          input.branchId,
          input.periodId,
          input.category,
          input.wouldContinue,
          input.message,
          payloadHash,
        ],
      );
      if (!inserted.length)
        throw new DomainError(
          'IDEMPOTENCY_CONFLICT',
          'Feedback identifier unavailable.',
          409,
        );
      return { feedbackId: input.feedbackId, received: true };
    });
  }
}
export async function feedbackSummary(db: Database) {
  return db.query(
    'SELECT category,would_continue,count(*)::int AS count FROM aw_feedback GROUP BY category,would_continue ORDER BY category,would_continue',
  );
}
