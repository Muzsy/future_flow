import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  sharedBlockRequestSchema,
  sharedReportRequestSchema,
  sharedInviteReportRequestSchema,
} from '@future-flow/contracts';
import { DomainError, hash } from '@future-flow/core';
import { SharedJobRepository } from './shared-jobs';
import { cancelPendingSharedDecision } from './shared-canon';
import type { Database } from './index';

function fail(code: string, status = 409): never {
  throw new DomainError(code, code, status);
}
const live = ['active', 'paused_entitlement'];
const moderationSchema = z
  .object({
    actionId: z.uuid(),
    contextRevision: z.number().int().nonnegative(),
    action: z.enum(['hold', 'release', 'dismiss']),
    actorLabel: z.string().trim().min(1).max(80),
    reason: z.string().trim().min(1).max(2000),
    reportId: z.uuid().optional(),
  })
  .strict();

export class SharedSafetyRepository extends SharedJobRepository {
  async safety(userId: string, contextId: string) {
    return this.db.transaction(async (tx) => {
      await this.active(tx, [userId]);
      await this.context(tx, contextId, true);
      await this.member(tx, userId, contextId);
      return {
        blockedMemberIds: (
          await tx.query(
            'SELECT m.id FROM aw_shared_members m JOIN aw_user_blocks b ON b.blocked_user_id=m.user_id WHERE b.user_id=$1 AND m.context_id=$2',
            [userId, contextId],
          )
        ).map((m) => String(m.id)),
        reports: await tx.query(
          'SELECT id,target_type AS "targetType",target_id AS "targetId",reason,details,status,created_at AS "createdAt" FROM aw_shared_reports WHERE reporter_user_id=$1 AND context_id=$2 ORDER BY created_at DESC,id LIMIT 100',
          [userId, contextId],
        ),
      };
    });
  }
  private pairContexts(tx: Database, a: string, b: string) {
    return tx.query<{ id: string }>(
      `SELECT c.id FROM aw_shared_contexts c WHERE (
      EXISTS(SELECT 1 FROM aw_shared_members m WHERE m.context_id=c.id AND m.user_id=$1)
      AND EXISTS(SELECT 1 FROM aw_shared_members m WHERE m.context_id=c.id AND m.user_id=$2)
    ) OR EXISTS(SELECT 1 FROM aw_shared_invites i JOIN aw_shared_members m ON m.id=i.inviter_member_id
      WHERE i.context_id=c.id AND i.status='pending' AND ((m.user_id=$1 AND i.target_user_id=$2) OR (m.user_id=$2 AND i.target_user_id=$1)))
    ORDER BY c.id`,
      [a, b],
    );
  }
  async setBlock(
    userId: string,
    contextId: string,
    raw: unknown,
    blocked: boolean,
    key: string,
  ) {
    const input = sharedBlockRequestSchema.parse(raw);
    await this.member(this.db, userId, contextId);
    const [hint] = await this.db.query<{ user_id: string | null }>(
      'SELECT user_id FROM aw_shared_members WHERE id=$1 AND context_id=$2',
      [input.memberId, contextId],
    );
    if (!hint?.user_id || hint.user_id === userId)
      fail('SHARED_CONTEXT_NOT_FOUND', 404);
    const target = hint.user_id,
      contexts = await this.pairContexts(this.db, userId, target);
    const userIds = [userId, target];
    for (const c of contexts) userIds.push(...(await this.users(c.id)));
    return this.once(
      userId,
      userIds,
      'shared:block:' + contextId,
      key,
      { ...input, blocked },
      async (tx) => {
        const fresh = await this.pairContexts(tx, userId, target);
        if (hash(fresh) !== hash(contexts)) fail('SHARED_REVISION_CONFLICT');
        // Global user -> sorted context lock order, including every group affected by this pair.
        const locked = [];
        for (const c of contexts)
          locked.push(await this.context(tx, c.id, true));
        const origin = locked.find((c) => c.id === contextId);
        if (!origin) fail('SHARED_CONTEXT_NOT_FOUND', 404);
        await this.member(tx, userId, contextId);
        this.revision(origin, input.contextRevision);
        const [member] = await tx.query(
          'SELECT user_id FROM aw_shared_members WHERE id=$1 AND context_id=$2',
          [input.memberId, contextId],
        );
        if (member?.user_id !== target) fail('SHARED_REVISION_CONFLICT');
        for (const c of locked) {
          const members = await this.members(tx, c.id);
          if (
            members.some(
              (m) =>
                live.includes(m.status) &&
                m.user_id &&
                !userIds.includes(m.user_id),
            )
          )
            fail('SHARED_REVISION_CONFLICT');
        }
        const [existing] = await tx.query(
          'SELECT user_id FROM aw_user_blocks WHERE user_id=$1 AND blocked_user_id=$2',
          [userId, target],
        );
        if (blocked && !existing)
          await tx.query(
            'INSERT INTO aw_user_blocks(user_id,blocked_user_id) VALUES($1,$2)',
            [userId, target],
          );
        if (!blocked && existing)
          await tx.query(
            'DELETE FROM aw_user_blocks WHERE user_id=$1 AND blocked_user_id=$2',
            [userId, target],
          );
        const changed = Boolean(existing) !== blocked;
        if (changed)
          for (const c of locked) {
            const pair = await tx.query(
              'SELECT id FROM aw_shared_members WHERE context_id=$1 AND user_id=ANY($2::uuid[]) AND status=ANY($3::text[])',
              [c.id, [userId, target], live],
            );
            const revoked = blocked
              ? await tx.query(
                  "UPDATE aw_shared_invites i SET status='revoked',responded_at=now() WHERE context_id=$1 AND status='pending' AND EXISTS(SELECT 1 FROM aw_shared_members m WHERE m.id=i.inviter_member_id AND ((m.user_id=$2 AND i.target_user_id=$3) OR (m.user_id=$3 AND i.target_user_id=$2))) RETURNING id",
                  [c.id, userId, target],
                )
              : [];
            if (blocked && pair.length === 2) {
              await cancelPendingSharedDecision(
                tx,
                c.id,
                'participant_unavailable',
              );
              await tx.query(
                "UPDATE aw_shared_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL,payload='{}',checkpoints='{}',error_code='SHARED_BLOCKED',completed_at=now() WHERE context_id=$1 AND status IN ('queued','running')",
                [c.id],
              );
            }
            if (pair.length === 2 || revoked.length || c.id === contextId)
              await tx.query(
                'UPDATE aw_shared_contexts SET revision=revision+1,updated_at=now() WHERE id=$1',
                [c.id],
              );
          }
        const [after] = await tx.query(
          'SELECT revision FROM aw_shared_contexts WHERE id=$1',
          [contextId],
        );
        return {
          blocked,
          memberId: input.memberId,
          revision: Number(after!.revision),
        };
      },
    );
  }
  private async recordReport(
    tx: Database,
    userId: string,
    contextId: string,
    targetType: string,
    targetId: string,
    input: { reason: string; details: string },
  ) {
    const [old] = await tx.query(
      'SELECT id,status FROM aw_shared_reports WHERE reporter_user_id=$1 AND context_id=$2 AND target_type=$3 AND target_id=$4 AND reason=$5',
      [userId, contextId, targetType, targetId, input.reason],
    );
    if (old) return { reportId: String(old.id), status: String(old.status) };
    const [count] = await tx.query(
      "SELECT count(*)::int AS count FROM aw_shared_reports WHERE reporter_user_id=$1 AND created_at>now()-interval '24 hours'",
      [userId],
    );
    if (Number(count!.count) >= 10) fail('SHARED_REPORT_LIMIT', 429);
    const reportId = randomUUID();
    await tx.query(
      'INSERT INTO aw_shared_reports(id,context_id,reporter_user_id,target_type,target_id,reason,details) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        reportId,
        contextId,
        userId,
        targetType,
        targetId,
        input.reason,
        input.details,
      ],
    );
    return { reportId, status: 'pending' };
  }
  async report(userId: string, contextId: string, raw: unknown, key: string) {
    const input = sharedReportRequestSchema.parse(raw);
    return this.once(
      userId,
      [],
      'shared:report:' + contextId,
      key,
      input,
      async (tx) => {
        await this.context(tx, contextId, true);
        await this.member(tx, userId, contextId);
        if (input.targetType !== 'context') {
          const table =
            input.targetType === 'event'
              ? 'aw_shared_events'
              : 'aw_shared_members';
          if (
            !(
              await tx.query(
                `SELECT id FROM ${table} WHERE id=$1 AND context_id=$2`,
                [input.targetId, contextId],
              )
            ).length
          )
            fail('SHARED_CONTEXT_NOT_FOUND', 404);
        }
        return this.recordReport(
          tx,
          userId,
          contextId,
          input.targetType,
          input.targetType === 'context' ? contextId : input.targetId,
          input,
        );
      },
    );
  }
  async reportInvite(userId: string, raw: unknown, key: string) {
    const input = sharedInviteReportRequestSchema.parse(raw),
      digest = createHash('sha256').update(input.token).digest('hex');
    const [hint] = await this.db.query<{ id: string; context_id: string }>(
      'SELECT id,context_id FROM aw_shared_invites WHERE token_hash=$1',
      [digest],
    );
    if (!hint) fail('SHARED_INVITE_INVALID', 404);
    // The key journal holds a token digest, never the bearer value or report details in a public DTO.
    return this.once(
      userId,
      [],
      'shared:invite-report:' + hint.id,
      key,
      { tokenHash: digest, reason: input.reason, details: input.details },
      async (tx) => {
        await this.context(tx, hint.context_id, true);
        const [invite] = await tx.query(
          'SELECT id,target_user_id FROM aw_shared_invites WHERE id=$1 AND token_hash=$2',
          [hint.id, digest],
        );
        if (
          !invite ||
          (invite.target_user_id && invite.target_user_id !== userId)
        )
          fail('SHARED_INVITE_INVALID', 404);
        return this.recordReport(
          tx,
          userId,
          hint.context_id,
          'invite',
          hint.id,
          input,
        );
      },
    );
  }
  // Internal trusted server operation only; deliberately absent from the user HTTP API.
  async moderate(contextId: string, raw: unknown) {
    const input = moderationSchema.parse(raw),
      userIds = await this.users(contextId);
    if (input.action === 'dismiss' && !input.reportId)
      fail('VALIDATION_FAILED', 400);
    const report = input.reportId
      ? (
          await this.db.query(
            'SELECT reporter_user_id FROM aw_shared_reports WHERE id=$1 AND context_id=$2',
            [input.reportId, contextId],
          )
        )[0]
      : null;
    const lockIds = [
      ...new Set([
        ...userIds,
        ...(report ? [String(report.reporter_user_id)] : []),
      ]),
    ].sort();
    return this.db.transaction(async (tx) => {
      await this.active(tx, lockIds);
      const c = await this.context(tx, contextId, true),
        members = await this.members(tx, contextId);
      if (
        members.some(
          (m) =>
            live.includes(m.status) &&
            m.user_id &&
            !lockIds.includes(m.user_id),
        )
      )
        fail('SHARED_REVISION_CONFLICT');
      const [old] = await tx.query(
        'SELECT input_hash,revision FROM aw_shared_moderation_audit WHERE id=$1',
        [input.actionId],
      );
      if (old) {
        if (old.input_hash !== hash({ contextId, ...input }))
          fail('IDEMPOTENCY_CONFLICT');
        return { revision: Number(old.revision) };
      }
      this.revision(c, input.contextRevision);
      if (
        input.reportId &&
        !(
          await tx.query(
            'SELECT id FROM aw_shared_reports WHERE id=$1 AND context_id=$2 FOR UPDATE',
            [input.reportId, contextId],
          )
        ).length
      )
        fail('SHARED_CONTEXT_NOT_FOUND', 404);
      if (input.action === 'hold') {
        await cancelPendingSharedDecision(tx, c.id, 'context_ended');
        await tx.query(
          "UPDATE aw_shared_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL,payload='{}',checkpoints='{}',error_code='SHARED_MODERATION_HOLD',completed_at=now() WHERE context_id=$1 AND status IN ('queued','running')",
          [c.id],
        );
        await tx.query(
          "UPDATE aw_shared_invites SET status='revoked',responded_at=now() WHERE context_id=$1 AND status='pending'",
          [c.id],
        );
      }
      const revision = c.revision + (input.action === 'dismiss' ? 0 : 1);
      if (input.action !== 'dismiss')
        await tx.query(
          'UPDATE aw_shared_contexts SET moderation_hold=$2,revision=$3,updated_at=now() WHERE id=$1',
          [c.id, input.action === 'hold', revision],
        );
      if (input.reportId)
        await tx.query(
          'UPDATE aw_shared_reports SET status=$2,reviewed_at=now() WHERE id=$1',
          [
            input.reportId,
            input.action === 'dismiss' ? 'dismissed' : 'reviewed',
          ],
        );
      await tx.query(
        'INSERT INTO aw_shared_moderation_audit(id,context_id,actor_label,action,report_id,reason,input_hash,revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          input.actionId,
          c.id,
          input.actorLabel,
          input.action,
          input.reportId ?? null,
          input.reason,
          hash({ contextId, ...input }),
          revision,
        ],
      );
      return { revision };
    });
  }
}

export async function exportSharedSafety(tx: Database, userId: string) {
  const [table] = await tx.query(
    "SELECT to_regclass('public.aw_shared_reports') IS NOT NULL AS present",
  );
  if (!table?.present) return null;
  return {
    reports: await tx.query(
      'SELECT id,context_id,target_type,target_id,reason,details,status,created_at,reviewed_at FROM aw_shared_reports WHERE reporter_user_id=$1 ORDER BY created_at,id',
      [userId],
    ),
    blockedMembers: await tx.query(
      'SELECT m.context_id,m.id AS member_id FROM aw_shared_members m JOIN aw_user_blocks b ON b.blocked_user_id=m.user_id WHERE b.user_id=$1 AND EXISTS(SELECT 1 FROM aw_shared_members own WHERE own.context_id=m.context_id AND own.user_id=$1) ORDER BY m.context_id,m.id',
      [userId],
    ),
  };
}
