import { randomUUID } from 'node:crypto';
import { publicSnapshotDraftSchema } from '@future-flow/contracts';
import {
  DomainError,
  hash,
  preparePublicSnapshotDraft,
  PUBLIC_SCAN_VERSION,
  type SnapshotSourcePeriod,
} from '@future-flow/core';
import type { Database } from './index';
import { LifeRepository, lifeRow } from './lives';

// Owner-only preparation. There is intentionally no confirm/publish/public reader here.
export class PublicDraftRepository {
  constructor(private readonly db: Database) {}
  private async sharedReview(tx: Database, userId: string, branchId: string) {
    const [storage] = await tx.query(
      "SELECT to_regclass('public.aw_shared_personal_memories') IS NOT NULL AS present",
    );
    if (storage?.present !== true) return;
    if (
      (
        await tx.query(
          'SELECT id FROM aw_shared_personal_memories WHERE user_id=$1 AND branch_id=$2 LIMIT 1',
          [userId, branchId],
        )
      ).length
    )
      throw new DomainError(
        'PUBLIC_SHARED_REVIEW_REQUIRED',
        'Shared history requires a separate privacy review before preparing a public copy.',
        409,
      );
  }
  async prepare(
    userId: string,
    branchId: string,
    revision: number,
    copy: unknown,
  ) {
    return this.db.transaction(async (tx) => {
      const user = lifeRow(
        await tx.query<{ status: string }>(
          'SELECT status FROM ff_users WHERE id=$1 FOR UPDATE',
          [userId],
        ),
      );
      if (user.status !== 'active')
        throw new DomainError('ACCOUNT_DELETING', 'Account is deleting.', 403);
      const consent = await tx.query(
        "SELECT id FROM ff_consents WHERE user_id=$1 AND policy_version='alpha-privacy-v1' AND consent_type='adult_and_ai_acknowledgement'",
        [userId],
      );
      if (!consent.length)
        throw new DomainError(
          'PRIVACY_ACKNOWLEDGEMENT_REQUIRED',
          'Consent required.',
          403,
        );
      const lives = new LifeRepository(tx);
      const branch = await lives.branch(userId, branchId, tx, true);
      if (branch.revision !== revision)
        throw new DomainError('LIFE_REVISION_CONFLICT', 'Source changed.', 409);
      if (branch.status === 'generating' || branch.status === 'failed')
        throw new DomainError(
          'PUBLIC_PREVIEW_UNAVAILABLE',
          'Source is not ready.',
          409,
        );
      await this.sharedReview(tx, userId, branchId);
      const detail = await lives.detail(userId, branchId);
      const periods = detail.periods as unknown as SnapshotSourcePeriod[];
      const snapshot = preparePublicSnapshotDraft(
        branch.input,
        periods,
        detail.choices as { decision_id: string; option_id: string }[],
        copy,
      );
      const id = randomUUID(),
        snapshotHash = hash(snapshot);
      // A draft is an owner-only preview and expires. Human/AI PII review and consent are still required.
      const [row] = await tx.query<{ id: string; expires_at: string }>(
        "INSERT INTO aw_publication_drafts(id,user_id,life_id,branch_id,source_revision,snapshot,snapshot_hash,scan_version,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '30 minutes') RETURNING id,expires_at",
        [
          id,
          userId,
          branch.life_id,
          branch.id,
          revision,
          snapshot,
          snapshotHash,
          PUBLIC_SCAN_VERSION,
        ],
      );
      const template = {
        schemaVersion: 'scenario-draft-1',
        locale: snapshot.locale,
        category: snapshot.category,
        goal: snapshot.goal,
        startingPoint: snapshot.startingPoint,
        profile: snapshot.profile,
      };
      await tx.query(
        'INSERT INTO aw_scenario_drafts(id,user_id,source_draft_id,version,content_locale,template,template_hash) VALUES($1,$2,$3,1,$4,$5,$6)',
        [randomUUID(), userId, id, snapshot.locale, template, hash(template)],
      );
      return {
        draftId: row!.id,
        sourceRevision: revision,
        snapshotHash,
        scanVersion: PUBLIC_SCAN_VERSION,
        expiresAt: row!.expires_at,
        status: 'awaiting_review' as const,
        snapshot,
      };
    });
  }
  async get(userId: string, id: string) {
    const row = lifeRow(
      await this.db.query<{
        snapshot: unknown;
        snapshot_hash: string;
        source_revision: number;
        expires_at: string;
        expired: boolean;
        current_revision: number;
        branch_id: string;
      }>(
        "SELECT d.branch_id,d.snapshot,d.snapshot_hash,d.source_revision,d.expires_at,d.expires_at<=now() AS expired,b.revision AS current_revision FROM aw_publication_drafts d JOIN ff_users u ON u.id=d.user_id JOIN aw_branches b ON b.id=d.branch_id AND b.user_id=d.user_id WHERE d.id=$1 AND d.user_id=$2 AND u.status='active'",
        [id, userId],
      ),
    );
    await this.sharedReview(this.db, userId, row.branch_id);
    if (row.expired)
      throw new DomainError(
        'PUBLIC_PREVIEW_EXPIRED',
        'Prepare a new preview.',
        410,
      );
    if (row.current_revision !== row.source_revision)
      throw new DomainError('LIFE_REVISION_CONFLICT', 'Source changed.', 409);
    return {
      snapshotHash: row.snapshot_hash,
      sourceRevision: row.source_revision,
      expiresAt: row.expires_at,
      status: 'awaiting_review' as const,
      snapshot: publicSnapshotDraftSchema.parse(row.snapshot),
    };
  }
}
