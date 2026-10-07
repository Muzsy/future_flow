import { randomUUID } from 'node:crypto';
import {
  lifeDeletionRequestSchema,
  lifeDeletionReceiptSchema,
} from '@future-flow/contracts';
import { DomainError, hash } from '@future-flow/core';
import type { Database } from './index';
import { cancelPendingSharedDecision } from './shared-canon';

export async function deletedLifeAdmissionSql(
  tx: Database,
  kind: 'generation' | 'public_review',
) {
  const [s] = await tx.query(
    "SELECT to_regclass('public.aw_deleted_life_admissions') IS NOT NULL AS present",
  );
  return s?.present
    ? ` UNION ALL SELECT ${kind === 'generation' ? "'completed' AS status,admitted_at AS created_at" : "admitted_at AS created_at,'completed' AS status"} FROM aw_deleted_life_admissions WHERE user_id=$1 AND kind='${kind}'`
    : '';
}
export async function cleanupExpiredLifeAdmissions(db: Database) {
  const [s] = await db.query(
    "SELECT to_regclass('public.aw_deleted_life_admissions') IS NOT NULL AS present",
  );
  if (!s?.present) return { deleted: 0, batchFull: false };
  const rows = await db.query(
    "DELETE FROM aw_deleted_life_admissions WHERE id IN (SELECT id FROM aw_deleted_life_admissions WHERE admitted_at<now()-interval '24 hours' ORDER BY admitted_at LIMIT 10000 FOR UPDATE SKIP LOCKED) RETURNING id",
  );
  return { deleted: rows.length, batchFull: rows.length === 10000 };
}
// Caller owns the user lock; acquire contexts in the same order as account cleanup.
async function detachSharedLife(tx: Database, userId: string, lifeId: string) {
  const members = await tx.query<{
    id: string;
    context_id: string;
    status: string;
  }>(
    'SELECT id,context_id,status FROM aw_shared_members WHERE user_id=$1 AND life_id=$2 ORDER BY context_id,id',
    [userId, lifeId],
  );
  if (!members.length) return;
  const ids = members.map((m) => m.id),
    events = await tx.query<{ id: string }>(
      'SELECT DISTINCT event_id AS id FROM aw_shared_event_participants WHERE member_id=ANY($1::uuid[])',
      [ids],
    );
  const eventIds = events.map((e) => e.id);
  for (const contextId of [...new Set(members.map((m) => m.context_id))]) {
    await tx.query('SELECT id FROM aw_shared_contexts WHERE id=$1 FOR UPDATE', [
      contextId,
    ]);
    const own = members.filter((m) => m.context_id === contextId),
      hadLive = own.some((m) =>
        ['active', 'paused_entitlement'].includes(m.status),
      );
    for (const m of own)
      await cancelPendingSharedDecision(
        tx,
        contextId,
        'participant_unavailable',
        m.id,
      );
    await tx.query(
      "UPDATE aw_shared_jobs SET status=CASE WHEN status IN ('queued','running') THEN 'cancelled' ELSE status END,error_code=CASE WHEN status IN ('queued','running') THEN 'SHARED_PRIVACY_CHANGED' ELSE error_code END,lease_token=NULL,lease_until=NULL,payload='{}',checkpoints='{}' WHERE context_id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(payload->'members')='array' THEN payload->'members' ELSE '[]'::jsonb END) p WHERE p->>'memberId'=ANY($3::text[])) OR EXISTS(SELECT 1 FROM aw_shared_events e WHERE e.context_id=$1 AND e.id=ANY($4::uuid[]) AND NOT(e.id=ANY(shared_privacy_event_ids))))",
      [contextId, hadLive, own.map((m) => m.id), eventIds],
    );
    await tx.query(
      "UPDATE aw_shared_invites SET status='revoked',responded_at=now() WHERE context_id=$1 AND status='pending' AND inviter_member_id=ANY($2::uuid[])",
      [contextId, ids],
    );
    await tx.query(
      "UPDATE aw_shared_impacts SET status='detached',target_branch_id=NULL WHERE member_id=ANY($1::uuid[]) AND status='pending'",
      [own.map((m) => m.id)],
    );
    await tx.query(
      'UPDATE aw_shared_members SET status=\'deleted\',user_id=NULL,life_id=NULL,branch_id=NULL,left_at=now(),interaction_profile=\'{"displayName":"Former member","ageBand":null,"country":null,"occupationLabel":null,"sharedRole":null}\',world_role=NULL,role_data=\'{}\' WHERE id=ANY($1::uuid[])',
      [own.map((m) => m.id)],
    );
    await tx.query(
      "UPDATE aw_shared_contexts SET revision=revision+1,updated_at=now(),status=CASE WHEN $2::boolean AND status IN ('inviting','active','paused') THEN CASE WHEN (SELECT count(*) FROM aw_shared_members WHERE context_id=$1 AND status IN ('active','paused_entitlement'))=0 THEN 'ended' WHEN (SELECT count(*) FROM aw_shared_members WHERE context_id=$1 AND status IN ('active','paused_entitlement'))<2 THEN 'paused' ELSE status END ELSE status END WHERE id=$1",
      [contextId, hadLive],
    );
  }
  if (eventIds.length)
    await tx.query(
      `WITH invalidated AS (
    UPDATE aw_jobs j SET status=CASE WHEN status IN ('queued','running') THEN 'cancelled' ELSE status END,
    error_code=CASE WHEN status IN ('queued','running') THEN 'SHARED_PRIVACY_CHANGED' ELSE error_code END,
    lease_token=NULL,lease_until=NULL,payload='{}',checkpoints='{}'
    WHERE EXISTS(SELECT 1 FROM aw_shared_personal_memories p WHERE p.user_id=j.user_id AND p.branch_id=j.branch_id AND p.event_id=ANY($1::uuid[]) AND NOT(p.event_id=ANY(j.shared_privacy_event_ids)) AND p.known_at<=coalesce(nullif(j.payload->>'startDate','')::date,'infinity'::date))
    RETURNING branch_id,status
  ) UPDATE aw_branches SET status='failed' WHERE status='generating' AND id IN (SELECT branch_id FROM invalidated WHERE status='cancelled')`,
      [eventIds],
    );
}
export class LifeDeletionRepository {
  constructor(private readonly db: Database) {}
  async remove(userId: string, rawId: unknown, raw: unknown, key: string) {
    const lifeId = lifeDeletionReceiptSchema.shape.lifeId.parse(rawId),
      input = lifeDeletionRequestSchema.parse(raw),
      requestHash = hash({ lifeId, ...input }),
      scope = 'life-delete:' + lifeId;
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(key))
      throw new DomainError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Request key required.',
        400,
      );
    return this.db.transaction(async (tx) => {
      const [owner] = await tx.query(
        'SELECT status FROM ff_users WHERE id=$1 FOR UPDATE',
        [userId],
      );
      if (owner?.status !== 'active')
        throw new DomainError('RESOURCE_NOT_FOUND', 'Life unavailable.', 404);
      const [prior] = await tx.query<{ input_hash: string; response: unknown }>(
        'SELECT input_hash,response FROM ff_idempotency WHERE user_id=$1 AND scope=$2 AND key=$3',
        [userId, scope, key],
      );
      if (prior) {
        if (prior.input_hash !== requestHash)
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'Request key was reused.',
            409,
          );
        return lifeDeletionReceiptSchema.parse(prior.response);
      }
      const [branch] = await tx.query<{ revision: number }>(
        'SELECT b.revision FROM aw_branches b JOIN aw_lives l ON l.id=b.life_id AND l.user_id=b.user_id WHERE b.id=$1 AND b.life_id=$2 AND b.user_id=$3 FOR UPDATE OF b,l',
        [input.branchId, lifeId, userId],
      );
      if (!branch)
        throw new DomainError('RESOURCE_NOT_FOUND', 'Life unavailable.', 404);
      if (branch.revision !== input.revision)
        throw new DomainError(
          'LIFE_REVISION_CONFLICT',
          'The life changed. Reload before deleting.',
          409,
        );
      const branches = await tx.query<{ id: string }>(
        'SELECT id FROM aw_branches WHERE life_id=$1 AND user_id=$2',
        [lifeId, userId],
      );
      await detachSharedLife(tx, userId, lifeId);
      await tx.query(
        "INSERT INTO aw_deleted_life_admissions(user_id,kind,admitted_at) SELECT user_id,'generation',created_at FROM aw_jobs WHERE life_id=$1 AND user_id=$2 AND created_at>=now()-interval '24 hours'",
        [lifeId, userId],
      );
      await tx.query(
        "INSERT INTO aw_deleted_life_admissions(user_id,kind,admitted_at) SELECT j.user_id,'public_review',j.created_at FROM aw_public_review_jobs j JOIN aw_publication_drafts d ON d.id=j.draft_id WHERE d.branch_id=ANY($1::uuid[]) AND j.user_id=$2 AND j.created_at>=now()-interval '24 hours' UNION ALL SELECT j.user_id,'public_review',j.created_at FROM aw_public_content_reviews j JOIN aw_public_content_bundles b ON b.id=j.bundle_id JOIN aw_publication_drafts d ON d.id=b.draft_id WHERE d.branch_id=ANY($1::uuid[]) AND j.user_id=$2 AND j.created_at>=now()-interval '24 hours'",
        [branches.map((b) => b.id), userId],
      );
      await tx.query(
        "DELETE FROM ff_idempotency WHERE user_id=$1 AND (response->>'lifeId'=$2 OR response->>'branchId'=ANY($3::text[]))",
        [userId, lifeId, branches.map((b) => b.id)],
      );
      await tx.query('DELETE FROM aw_lives WHERE id=$1 AND user_id=$2', [
        lifeId,
        userId,
      ]);
      const result = lifeDeletionReceiptSchema.parse({
        schemaVersion: 'life-deletion-1',
        lifeId,
        deleted: true,
        deletedBranchCount: branches.length,
      });
      await tx.query(
        'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5)',
        [userId, scope, key, requestHash, result],
      );
      return result;
    });
  }
}
