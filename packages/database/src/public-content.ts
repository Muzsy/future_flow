import { randomUUID } from 'node:crypto';
import {
  publicContentRequestSchema,
  publicContentViewSchema,
  publicContentWorkspaceSchema,
  type ForkCheckpoint,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  assemblePublicContent,
  validatePublicContent,
  validateForkCheckpoint,
} from '@future-flow/core';
import type { Database } from './index';
import { LifeRepository, lifeRow } from './lives';
import { PublicDraftRepository } from './public-drafts';

export function publicContentBundlesEnabledFromEnv() {
  const flag = process.env.PUBLIC_CONTENT_BUNDLES_ENABLED ?? 'false';
  if (!['true', 'false'].includes(flag))
    throw new Error('Invalid content bundle flag');
  return flag === 'true';
}
type Row = Record<string, unknown> & {
  id: string;
  draft_id: string;
  snapshot_hash: string;
  source_revision: number;
  content_hash: string;
  content: unknown;
};
type CheckpointRow = Record<string, unknown> & {
  id: string;
  snapshot_hash: string;
  source_revision: number;
  decision_key: string;
  checkpoint_hash: string;
  checkpoint: ForkCheckpoint;
};
export class PublicContentRepository {
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
    await new LifeRepository(tx).branch(userId, row.branch_id, tx, true);
    const preview = await new PublicDraftRepository(tx).get(userId, draftId);
    if (preview.snapshot.locale !== 'en')
      throw new DomainError(
        'CONTENT_LANGUAGE_UNAVAILABLE',
        'English content required.',
        403,
      );
    return preview;
  }
  private async view(
    tx: Database,
    userId: string,
    row: Row,
    preview: Awaited<ReturnType<PublicDraftRepository['get']>>,
  ) {
    const content = validatePublicContent(row.content);
    const { snapshotKey: _id, ...snapshot } = preview.snapshot;
    if (
      row.snapshot_hash !== preview.snapshotHash ||
      row.source_revision !== preview.sourceRevision ||
      hash(content) !== row.content_hash ||
      hash(content.snapshot) !== hash(snapshot)
    )
      throw new DomainError(
        'PUBLIC_CONTENT_INVALID',
        'Bundle integrity failed.',
        409,
      );
    const checkpoints = await tx.query<
      CheckpointRow & { ordinal: number; selected_key: string }
    >(
      'SELECT c.*,s.ordinal,s.decision_key AS selected_key FROM aw_public_content_bundle_checkpoints s JOIN aw_public_fork_checkpoints c ON c.id=s.checkpoint_id AND c.user_id=s.user_id AND c.draft_id=s.draft_id WHERE s.bundle_id=$1 AND s.user_id=$2 AND s.draft_id=$3 ORDER BY s.ordinal',
      [row.id, userId, row.draft_id],
    );
    if (
      checkpoints.length !== content.checkpoints.length ||
      checkpoints.some(
        (c, i) =>
          c.ordinal !== i ||
          c.decision_key !== c.selected_key ||
          c.decision_key !== content.checkpoints[i]!.decision.key ||
          c.snapshot_hash !== preview.snapshotHash ||
          c.source_revision !== preview.sourceRevision ||
          hash(validateForkCheckpoint(c.checkpoint)) !== c.checkpoint_hash ||
          c.checkpoint_hash !== hash(content.checkpoints[i]),
      )
    )
      throw new DomainError(
        'PUBLIC_CONTENT_INVALID',
        'Selected checkpoint integrity failed.',
        409,
      );
    return publicContentViewSchema.parse({
      bundleId: row.id,
      draftId: row.draft_id,
      snapshotHash: row.snapshot_hash,
      sourceRevision: row.source_revision,
      contentHash: row.content_hash,
      content,
      selection: checkpoints.map((c) => ({
        decisionKey: c.decision_key,
        checkpointId: c.id,
        checkpointHash: c.checkpoint_hash,
      })),
      status: 'awaiting_review',
      publicationApproved: false,
    });
  }
  async workspace(userId: string, draftId: string) {
    return this.db.transaction(async (tx) => {
      const preview = await this.bound(tx, userId, draftId);
      const rows = await tx.query<Row>(
        'SELECT * FROM aw_public_content_bundles WHERE draft_id=$1 AND user_id=$2 ORDER BY created_at,id',
        [draftId, userId],
      );
      const bundles = [];
      for (const row of rows)
        bundles.push(await this.view(tx, userId, row, preview));
      return publicContentWorkspaceSchema.parse({
        enabled: this.enabled,
        bundles,
      });
    });
  }
  async save(userId: string, draftId: string, raw: unknown, key: string) {
    const input = publicContentRequestSchema.parse(raw);
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key))
      throw new DomainError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Request key required.',
        400,
      );
    if (
      new Set(input.selectedCheckpointIds).size !==
      input.selectedCheckpointIds.length
    )
      throw new DomainError(
        'PUBLIC_CONTENT_INVALID',
        'Duplicate checkpoint selection.',
        422,
      );
    return this.db.transaction(async (tx) => {
      const preview = await this.bound(tx, userId, draftId);
      if (
        input.snapshotHash !== preview.snapshotHash ||
        input.sourceRevision !== preview.sourceRevision
      )
        throw new DomainError(
          'PUBLIC_CONTENT_SOURCE',
          'Bundle copy binding changed.',
          409,
        );
      const scope = 'public-content-bundle:' + draftId,
        requestHash = hash(input);
      const [old] = await tx.query<{
        input_hash: string;
        response: { bundleId: string };
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
          tx,
          userId,
          lifeRow(
            await tx.query<Row>(
              'SELECT * FROM aw_public_content_bundles WHERE id=$1 AND draft_id=$2 AND user_id=$3',
              [old.response.bundleId, draftId, userId],
            ),
          ),
          preview,
        );
      const selected: CheckpointRow[] = [];
      for (const id of input.selectedCheckpointIds) {
        const row = lifeRow(
          await tx.query<CheckpointRow>(
            'SELECT * FROM aw_public_fork_checkpoints WHERE id=$1 AND draft_id=$2 AND user_id=$3',
            [id, draftId, userId],
          ),
        );
        if (
          row.snapshot_hash !== preview.snapshotHash ||
          row.source_revision !== preview.sourceRevision ||
          hash(validateForkCheckpoint(row.checkpoint)) !== row.checkpoint_hash
        )
          throw new DomainError(
            'PUBLIC_CONTENT_INVALID',
            'Checkpoint binding failed.',
            409,
          );
        selected.push(row);
      }
      if (new Set(selected.map((c) => c.decision_key)).size !== selected.length)
        throw new DomainError(
          'PUBLIC_CONTENT_INVALID',
          'Select only one version per decision.',
          422,
        );
      selected.sort(
        (a, b) =>
          preview.snapshot.periods.findIndex(
            (p) => p.decision.key === a.decision_key,
          ) -
          preview.snapshot.periods.findIndex(
            (p) => p.decision.key === b.decision_key,
          ),
      );
      const content = assemblePublicContent(
          preview.snapshot,
          selected.map((c) => c.checkpoint),
        ),
        contentHash = hash(content);
      const [existing] = await tx.query<Row>(
        'SELECT * FROM aw_public_content_bundles WHERE draft_id=$1 AND user_id=$2 AND content_hash=$3',
        [draftId, userId, contentHash],
      );
      let row = existing;
      if (!row) {
        if (!this.enabled)
          throw new DomainError(
            'PUBLIC_CONTENT_DISABLED',
            'Content preparation unavailable.',
            403,
          );
        const [count] = await tx.query(
          'SELECT count(*)::int AS total FROM aw_public_content_bundles WHERE draft_id=$1',
          [draftId],
        );
        if (Number(count!.total) >= 100)
          throw new DomainError(
            'PUBLIC_CONTENT_LIMIT',
            'Bundle copy limit reached.',
            429,
          );
        row = lifeRow(
          await tx.query<Row>(
            'INSERT INTO aw_public_content_bundles(id,user_id,draft_id,source_revision,snapshot_hash,content_hash,content) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [
              randomUUID(),
              userId,
              draftId,
              preview.sourceRevision,
              preview.snapshotHash,
              contentHash,
              JSON.stringify(content),
            ],
          ),
        );
        for (const [ordinal, c] of selected.entries())
          await tx.query(
            'INSERT INTO aw_public_content_bundle_checkpoints(bundle_id,checkpoint_id,user_id,draft_id,decision_key,ordinal) VALUES($1,$2,$3,$4,$5,$6)',
            [row.id, c.id, userId, draftId, c.decision_key, ordinal],
          );
      }
      await tx.query(
        'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5)',
        [userId, scope, key, requestHash, JSON.stringify({ bundleId: row.id })],
      );
      return this.view(tx, userId, row, preview);
    });
  }
}
