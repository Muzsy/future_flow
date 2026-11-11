import { randomUUID } from 'node:crypto';
import {
  forkCheckpointRequestSchema,
  forkCheckpointViewSchema,
  forkCheckpointCandidateSchema,
  type ForkCheckpoint,
  type PeriodCandidateV2,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  validateForkCheckpoint,
  prepareSanitizedForkCheckpoint,
  prepareForkCheckpointCandidate,
  type CanonEventV2,
} from '@future-flow/core';
import type { Database } from './index';
import { LifeRepository, lifeRow, type LifeBranch } from './lives';
import { z } from 'zod';
import { PublicDraftRepository } from './public-drafts';

export function publicForkCheckpointsEnabledFromEnv() {
  const flag = process.env.PUBLIC_FORK_CHECKPOINTS_ENABLED ?? 'false';
  if (!['true', 'false'].includes(flag))
    throw new Error('Invalid checkpoint flag');
  return flag === 'true';
}
type Row = Record<string, unknown> & {
  id: string;
  draft_id: string;
  snapshot_hash: string;
  source_revision: number;
  checkpoint: ForkCheckpoint;
  checkpoint_hash: string;
};
export class PublicForkCheckpointRepository {
  constructor(
    private readonly db: Database,
    private readonly enabled = false,
  ) {}
  private async bound(tx: Database, userId: string, draftId: string) {
    const user = lifeRow(
      await tx.query('SELECT status FROM ff_users WHERE id=$1 FOR UPDATE', [
        userId,
      ]),
    );
    if (user.status !== 'active')
      throw new DomainError(
        'ACCOUNT_DELETING',
        'Account is being deleted.',
        403,
      );
    if (
      !(
        await tx.query(
          "SELECT id FROM ff_consents WHERE user_id=$1 AND policy_version='alpha-privacy-v1' AND consent_type='adult_and_ai_acknowledgement'",
          [userId],
        )
      ).length
    )
      throw new DomainError(
        'PRIVACY_ACKNOWLEDGEMENT_REQUIRED',
        'Consent required.',
        403,
      );
    const row = lifeRow(
      await tx.query<{ branch_id: string }>(
        'SELECT branch_id FROM aw_publication_drafts WHERE id=$1 AND user_id=$2',
        [draftId, userId],
      ),
    );
    const lives = new LifeRepository(tx),
      branch = await lives.branch(userId, row.branch_id, tx, true),
      preview = await new PublicDraftRepository(tx).get(userId, draftId);
    if (preview.snapshot.locale !== 'en')
      throw new DomainError(
        'CONTENT_LANGUAGE_UNAVAILABLE',
        'English content required.',
        403,
      );
    return { lives, branch, preview };
  }
  private view(row: Row) {
    const checkpoint = validateForkCheckpoint(row.checkpoint);
    if (hash(checkpoint) !== row.checkpoint_hash)
      throw new DomainError(
        'PUBLIC_FORK_INVALID',
        'Checkpoint integrity failed.',
        409,
      );
    return forkCheckpointViewSchema.parse({
      checkpointId: row.id,
      draftId: row.draft_id,
      snapshotHash: row.snapshot_hash,
      sourceRevision: row.source_revision,
      checkpointHash: row.checkpoint_hash,
      checkpoint,
      status: 'awaiting_review',
      publicationApproved: false,
    });
  }
  async list(userId: string, draftId: string) {
    return this.db.transaction(async (tx) => {
      const { preview } = await this.bound(tx, userId, draftId);
      const rows = await tx.query<Row>(
        'SELECT * FROM aw_public_fork_checkpoints WHERE draft_id=$1 AND user_id=$2 ORDER BY decision_key,created_at,id',
        [draftId, userId],
      );
      return rows.map((row) => {
        if (
          row.snapshot_hash !== preview.snapshotHash ||
          row.source_revision !== preview.sourceRevision
        )
          throw new DomainError(
            'PUBLIC_FORK_INVALID',
            'Checkpoint binding failed.',
            409,
          );
        return this.view(row);
      });
    });
  }
  private source(
    branch: LifeBranch,
    preview: Awaited<ReturnType<PublicDraftRepository['get']>>,
    raw: unknown,
    position: number,
  ) {
    const period = raw as
        | {
            candidate: PeriodCandidateV2;
            events: CanonEventV2[];
            accepted_before: string[];
          }
        | undefined,
      publicPeriod = preview.snapshot.periods[position]!;
    if (!period || period.candidate.endDate !== publicPeriod.endDate)
      throw new DomainError(
        'PUBLIC_FORK_SOURCE',
        'Canonical period changed.',
        409,
      );
    const event = period.events.at(-1);
    if (
      !event?.decision ||
      event.effectiveAt !== publicPeriod.endDate ||
      event.stateAfter.effectiveAt !== publicPeriod.endDate ||
      event.decision.id !== period.candidate.events.at(-1)?.decision?.id
    )
      throw new DomainError(
        'PUBLIC_FORK_SOURCE',
        'Canonical decision unavailable.',
        409,
      );
    return {
      input: { ...branch.input, branchId: period.candidate.branchId },
      state: event.stateAfter,
      decision: event.decision,
      scope: {
        lifeId: branch.life_id,
        branchId: period.candidate.branchId,
        acceptedDecisionIds: period.accepted_before,
      },
      publicDecision: publicPeriod.decision,
    };
  }
  async candidates(
    userId: string,
    draftId: string,
    editProse?: (checkpoint: ForkCheckpoint) => ForkCheckpoint,
  ) {
    return this.db.transaction(async (tx) => {
      const { preview, lives, branch } = await this.bound(tx, userId, draftId),
        detail = await lives.detail(userId, branch.id);
      return preview.snapshot.periods.map((period, position) => {
        try {
          return forkCheckpointCandidateSchema.parse({
            decisionKey: period.decision.key,
            checkpoint: prepareForkCheckpointCandidate(
              this.source(branch, preview, detail.periods[position], position),
              editProse,
            ),
            unavailableReason: null,
          });
        } catch (error) {
          if (!(error instanceof DomainError) && !(error instanceof z.ZodError))
            throw error;
          const code =
            error instanceof DomainError ? error.code : 'VALIDATION_FAILED';
          return forkCheckpointCandidateSchema.parse({
            decisionKey: period.decision.key,
            checkpoint: null,
            unavailableReason:
              code === 'PUBLIC_FORK_PRIVACY'
                ? 'privacy'
                : code === 'PUBLIC_FORK_REFERENCE'
                  ? 'reference'
                  : 'consistency',
          });
        }
      });
    });
  }
  async save(userId: string, draftId: string, raw: unknown, key: string) {
    const input = forkCheckpointRequestSchema.parse(raw);
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key))
      throw new DomainError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Request key required.',
        400,
      );
    return this.db.transaction(async (tx) => {
      const { preview, lives, branch } = await this.bound(tx, userId, draftId);
      if (
        input.snapshotHash !== preview.snapshotHash ||
        input.sourceRevision !== preview.sourceRevision
      )
        throw new DomainError(
          'PUBLIC_FORK_SOURCE',
          'Checkpoint copy binding changed.',
          409,
        );
      const scope = 'public-fork-checkpoint:' + draftId,
        requestHash = hash(input),
        [old] = await tx.query<{
          input_hash: string;
          response: { checkpointId: string };
        }>(
          'SELECT input_hash,response FROM ff_idempotency WHERE user_id=$1 AND scope=$2 AND key=$3',
          [userId, scope, key],
        );
      if (old && old.input_hash !== requestHash)
        throw new DomainError(
          'IDEMPOTENCY_CONFLICT',
          'Request key conflict.',
          409,
        );
      if (old)
        return this.view(
          lifeRow(
            await tx.query<Row>(
              'SELECT * FROM aw_public_fork_checkpoints WHERE id=$1 AND user_id=$2',
              [old.response.checkpointId, userId],
            ),
          ),
        );
      const position = preview.snapshot.periods.findIndex(
        (p) => p.decision.key === input.checkpoint.decision.key,
      );
      if (position < 0)
        throw new DomainError(
          'PUBLIC_FORK_SOURCE',
          'Decision is not in this copy.',
          409,
        );
      const detail = await lives.detail(userId, branch.id);
      const checkpoint = prepareSanitizedForkCheckpoint(
          this.source(branch, preview, detail.periods[position], position),
          input.checkpoint,
        ),
        checkpointHash = hash(checkpoint);
      const [existing] = await tx.query<Row>(
        'SELECT * FROM aw_public_fork_checkpoints WHERE draft_id=$1 AND user_id=$2 AND decision_key=$3 AND checkpoint_hash=$4',
        [draftId, userId, checkpoint.decision.key, checkpointHash],
      );
      if (existing) {
        await tx.query(
          'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5)',
          [
            userId,
            scope,
            key,
            requestHash,
            JSON.stringify({ checkpointId: existing.id }),
          ],
        );
        return this.view(existing);
      }
      if (!this.enabled)
        throw new DomainError(
          'PUBLIC_FORK_DISABLED',
          'Checkpoint preparation unavailable.',
          403,
        );
      const [count] = await tx.query(
        'SELECT count(*)::int AS total FROM aw_public_fork_checkpoints WHERE draft_id=$1',
        [draftId],
      );
      if (Number(count!.total) >= 100)
        throw new DomainError(
          'PUBLIC_FORK_LIMIT',
          'Checkpoint copy limit reached.',
          429,
        );
      const row = lifeRow(
        await tx.query<Row>(
          'INSERT INTO aw_public_fork_checkpoints(id,user_id,draft_id,source_revision,snapshot_hash,decision_key,checkpoint,checkpoint_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
          [
            randomUUID(),
            userId,
            draftId,
            preview.sourceRevision,
            preview.snapshotHash,
            checkpoint.decision.key,
            JSON.stringify(checkpoint),
            checkpointHash,
          ],
        ),
      );
      await tx.query(
        'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5)',
        [
          userId,
          scope,
          key,
          requestHash,
          JSON.stringify({ checkpointId: row.id }),
        ],
      );
      return this.view(row);
    });
  }
}
