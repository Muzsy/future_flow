import { isEnabledLocale } from '@future-flow/contracts';
import { DomainError } from '@future-flow/core';
import type { Database } from '@future-flow/database';

export function requireEnabledLocale(locale: unknown) {
  if (!isEnabledLocale(locale))
    throw new DomainError('NOT_FOUND', 'Content is unavailable.', 404);
}

const queries = {
  legacyBranch:
    'SELECT f.content_locale FROM ff_branches b JOIN ff_futures f ON f.id=b.future_id AND f.user_id=b.user_id WHERE b.user_id=$1 AND b.id=$2',
  legacyDecision:
    'SELECT f.content_locale FROM ff_decisions d JOIN ff_branches b ON b.id=d.branch_id AND b.user_id=d.user_id JOIN ff_futures f ON f.id=b.future_id AND f.user_id=b.user_id WHERE d.user_id=$1 AND d.id=$2',
  lifeJob:
    'SELECT l.content_locale FROM aw_jobs j JOIN aw_branches b ON b.id=j.branch_id AND b.user_id=j.user_id JOIN aw_lives l ON l.id=b.life_id AND l.user_id=b.user_id WHERE j.user_id=$1 AND j.id=$2',
} as const;

export async function requireEnabledContent(
  db: Database,
  userId: string,
  kind: keyof typeof queries,
  id: string,
) {
  const [row] = await db.query(queries[kind], [userId, id]);
  requireEnabledLocale(row?.content_locale);
}
