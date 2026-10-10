import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { hash } from '@future-flow/core';
import {
  LifeDeletionRepository,
  Repository,
  type Database,
} from '@future-flow/database';
import { cancelPendingSharedDecision } from '../../packages/database/src/shared-canon';

// Operator-only, never imported by a serving application. There is no promotion
// command: a successful replay remains quarantined and cannot enable paid AI.
const fingerprintTables = [
  'aw_publications',
  'aw_official_publications',
  'aw_scenario_publications',
  'aw_official_life_sources',
  'aw_official_scenario_sources',
  'aw_public_exposures',
  'aw_public_fork_permissions',
  'aw_shared_members',
  'aw_shared_contexts',
  'aw_public_collection_entries',
] as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.string().uuid();
const owned = z.object({ id: uuid, userId: uuid }).strict();
const fingerprints = z
  .array(z.object({ id: uuid, digest }).strict())
  .max(100000);
const authoritySchema = z
  .object({
    schemaVersion: z.literal('privacy-restore-authority-1'),
    projectBinding: digest,
    schemaDigest: digest,
    writerFenceDigest: digest,
    capturedAt: z.string().datetime(),
    authVerifiedAt: z.string().datetime(),
    activeUserIds: z.array(uuid).max(100000),
    lives: z.array(owned).max(100000),
    futures: z.array(owned).max(100000),
    blocks: z
      .array(z.object({ userId: uuid, blockedUserId: uuid }).strict())
      .max(100000),
    budgetAccounts: z
      .array(
        z
          .object({
            id: z.string().min(1).max(512),
            accountedMicro: z.string().regex(/^\d+$/),
          })
          .strict(),
      )
      .max(100000),
    fingerprints: z
      .object(
        Object.fromEntries(
          fingerprintTables.map((t) => [t, fingerprints]),
        ) as Record<(typeof fingerprintTables)[number], typeof fingerprints>,
      )
      .strict(),
  })
  .strict();
export type PrivacyRestoreAuthority = z.infer<typeof authoritySchema>;
type SourceEvidence = {
  projectBinding: string;
  writerFenceDigest: string;
  authVerifiedAt: string;
  authUserIds: string[];
};
const schemaSql =
  "SELECT table_name,column_name,data_type,udt_name,is_nullable,ordinal_position FROM information_schema.columns WHERE table_schema='public' AND (table_name LIKE 'aw\\_%' ESCAPE '\\' OR table_name LIKE 'ff\\_%' ESCAPE '\\') ORDER BY table_name,ordinal_position";
function freshness(at: string, now: Date) {
  const age = now.getTime() - Date.parse(at);
  if (!Number.isFinite(age) || age < -30000 || age > 15 * 60 * 1000)
    throw Error('Fresh independently verified authority required');
}
function unique(values: string[]) {
  if (new Set(values).size !== values.length)
    throw Error('Duplicate authority identifier');
}
function validate(raw: unknown, now: Date) {
  const a = authoritySchema.parse(raw);
  freshness(a.capturedAt, now);
  freshness(a.authVerifiedAt, now);
  unique(a.activeUserIds);
  for (const items of [a.lives, a.futures, ...Object.values(a.fingerprints)])
    unique(items.map((r) => r.id));
  unique(a.budgetAccounts.map((r) => r.id));
  unique(a.blocks.map((r) => r.userId + ':' + r.blockedUserId));
  const users = new Set(a.activeUserIds);
  if (
    [...a.lives, ...a.futures].some((r) => !users.has(r.userId)) ||
    a.blocks.some(
      (r) =>
        !users.has(r.userId) ||
        !users.has(r.blockedUserId) ||
        r.userId === r.blockedUserId,
    )
  )
    throw Error('Incomplete authority ownership binding');
  return a;
}
async function rows(tx: Database, table: (typeof fingerprintTables)[number]) {
  return tx.query<{ record: Record<string, unknown> & { id: string } }>(
    `SELECT to_jsonb(t) AS record FROM ${table} t ORDER BY id`,
  );
}
export async function capturePrivacyRestoreAuthority(
  db: Database,
  evidence: SourceEvidence,
  now = new Date(),
) {
  digest.parse(evidence.projectBinding);
  digest.parse(evidence.writerFenceDigest);
  freshness(evidence.authVerifiedAt, now);
  unique(evidence.authUserIds);
  evidence.authUserIds.forEach((id) => uuid.parse(id));
  return db.transaction(async (tx) => {
    // The operator must supply independently verified Auth and a stopped-writer
    // fence. Neither a hash nor these source reads attest that external fence.
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const auth = new Set(evidence.authUserIds);
    const activeUserIds = (
      await tx.query<{ id: string }>(
        "SELECT id FROM ff_users WHERE status='active' ORDER BY id",
      )
    )
      .map((r) => r.id)
      .filter((id) => auth.has(id));
    const allowed = new Set(activeUserIds);
    const readOwned = async (table: 'aw_lives' | 'ff_futures') =>
      (
        await tx.query<{ id: string; user_id: string }>(
          `SELECT id,user_id FROM ${table} ORDER BY id`,
        )
      )
        .filter((r) => allowed.has(r.user_id))
        .map((r) => ({ id: r.id, userId: r.user_id }));
    const result: Record<string, unknown> = {};
    for (const table of fingerprintTables)
      result[table] = (await rows(tx, table)).map(({ record }) => ({
        id: record.id,
        digest: hash(record),
      }));
    return validate(
      {
        schemaVersion: 'privacy-restore-authority-1',
        projectBinding: evidence.projectBinding,
        writerFenceDigest: evidence.writerFenceDigest,
        authVerifiedAt: evidence.authVerifiedAt,
        capturedAt: now.toISOString(),
        schemaDigest: hash(await tx.query(schemaSql)),
        activeUserIds,
        lives: await readOwned('aw_lives'),
        futures: await readOwned('ff_futures'),
        blocks: (
          await tx.query<{ user_id: string; blocked_user_id: string }>(
            'SELECT user_id,blocked_user_id FROM aw_user_blocks ORDER BY user_id,blocked_user_id',
          )
        )
          .filter(
            (r) => allowed.has(r.user_id) && allowed.has(r.blocked_user_id),
          )
          .map((r) => ({
            userId: r.user_id,
            blockedUserId: r.blocked_user_id,
          })),
        budgetAccounts: (
          await tx.query<{ id: string; accounted_micro: string }>(
            'SELECT id,accounted_micro::text FROM aw_budget_accounts ORDER BY id',
          )
        ).map((r) => ({ id: r.id, accountedMicro: r.accounted_micro })),
        fingerprints: result,
      },
      now,
    );
  });
}
type ReplayBinding = {
  projectBinding: string;
  expectedAuthorityHash: string;
  writerFenceDigest: string;
  backupCapturedAt: string;
  quarantineDatabase: string;
};
export async function replayPrivacyRestore(
  db: Database,
  raw: unknown,
  binding: ReplayBinding,
  now = new Date(),
) {
  const a = validate(raw, now);
  digest.parse(binding.expectedAuthorityHash);
  if (
    hash(a) !== binding.expectedAuthorityHash ||
    a.projectBinding !== binding.projectBinding ||
    a.writerFenceDigest !== binding.writerFenceDigest ||
    !/^aw_restore_[a-f0-9]{24}$/.test(binding.quarantineDatabase)
  )
    throw Error('Quarantine/authority binding mismatch');
  const backup = z.string().datetime().parse(binding.backupCapturedAt);
  if (Date.parse(backup) > Date.parse(a.capturedAt))
    throw Error('Authority predates the backup');
  return db.transaction(async (tx) => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    const [target] = await tx.query<{ name: string }>(
      'SELECT current_database() AS name',
    );
    if (
      target?.name !== binding.quarantineDatabase ||
      hash(await tx.query(schemaSql)) !== a.schemaDigest
    )
      throw Error('Dedicated matching-schema quarantine required');
    const changed: Record<string, string[]> = {};
    for (const table of fingerprintTables) {
      const fresh = new Map(a.fingerprints[table].map((r) => [r.id, r.digest]));
      changed[table] = (await rows(tx, table))
        .filter(({ record }) => fresh.get(record.id) !== hash(record))
        .map(({ record }) => record.id);
    }
    const proof = {
      deletedAccounts: 0,
      deletedLives: 0,
      deletedLegacyFutures: 0,
      deniedPermissions: 0,
    };
    const keep = new Set(a.activeUserIds),
      repo = new Repository(tx);
    for (const user of await tx.query<{ id: string }>(
      'SELECT id FROM ff_users ORDER BY id FOR UPDATE',
    ))
      if (!keep.has(user.id)) {
        await repo.markDeleting(user.id);
        await repo.deleteAccountData(user.id);
        proof.deletedAccounts++;
      }
    const lives = new Set(a.lives.map((r) => r.id + ':' + r.userId));
    for (const life of await tx.query<{
      id: string;
      user_id: string;
      root_branch_id: string;
    }>('SELECT id,user_id,root_branch_id FROM aw_lives ORDER BY id'))
      if (!lives.has(life.id + ':' + life.user_id)) {
        const [branch] = await tx.query<{ revision: number }>(
          'SELECT revision FROM aw_branches WHERE id=$1 AND user_id=$2',
          [life.root_branch_id, life.user_id],
        );
        if (!branch) throw Error('Restored life graph is incomplete');
        await new LifeDeletionRepository(tx).remove(
          life.user_id,
          life.id,
          {
            branchId: life.root_branch_id,
            revision: branch.revision,
            confirmation: 'DELETE LIFE',
          },
          randomUUID(),
        );
        proof.deletedLives++;
      }
    const futures = new Set(a.futures.map((r) => r.id + ':' + r.userId));
    for (const future of await tx.query<{ id: string; user_id: string }>(
      'SELECT id,user_id FROM ff_futures ORDER BY id',
    ))
      if (!futures.has(future.id + ':' + future.user_id)) {
        await tx.query('DELETE FROM ff_futures WHERE id=$1 AND user_id=$2', [
          future.id,
          future.user_id,
        ]);
        proof.deletedLegacyFutures++;
      }
    for (const table of [
      'aw_official_life_sources',
      'aw_official_scenario_sources',
    ] as const) {
      proof.deniedPermissions += (
        await tx.query(
          `UPDATE ${table} SET status='revoked',revoked_at=now(),revoke_reason='privacy',revoke_actor='Quarantined restore' WHERE id=ANY($1::uuid[]) AND status='active' RETURNING id`,
          [changed[table]],
        )
      ).length;
    }
    for (const table of [
      'aw_publications',
      'aw_official_publications',
    ] as const) {
      proof.deniedPermissions += (
        await tx.query(
          `UPDATE ${table} SET status='withdrawn',revision=revision+1,token_hash=NULL WHERE id=ANY($1::uuid[]) AND status IN ('active','hidden') RETURNING id`,
          [changed[table]],
        )
      ).length;
    }
    proof.deniedPermissions += (
      await tx.query(
        "UPDATE aw_scenario_publications SET status='withdrawn',stopped_at=now() WHERE id=ANY($1::uuid[]) AND status='active' RETURNING id",
        [changed.aw_scenario_publications],
      )
    ).length;
    await tx.query(
      "UPDATE aw_public_exposures SET mode='none',permission_revision=permission_revision+1,updated_at=now() WHERE id=ANY($1::uuid[]) AND mode<>'none'",
      [changed.aw_public_exposures],
    );
    await tx.query(
      'UPDATE aw_public_fork_permissions SET allowed=false,permission_revision=permission_revision+1,updated_at=now() WHERE id=ANY($1::uuid[]) AND allowed',
      [changed.aw_public_fork_permissions],
    );
    await tx.query(
      'DELETE FROM aw_public_collection_entries WHERE id=ANY($1::uuid[])',
      [changed.aw_public_collection_entries],
    );
    // Any unverified membership is anonymized, never upgraded from an old role.
    await tx.query(
      `UPDATE aw_shared_members SET status='deleted',user_id=NULL,life_id=NULL,branch_id=NULL,left_at=now(),interaction_profile='{"displayName":"Former member","ageBand":null,"country":null,"occupationLabel":null,"sharedRole":null}',world_role=NULL,role_data='{}' WHERE id=ANY($1::uuid[]) AND status<>'deleted'`,
      [changed.aw_shared_members],
    );
    for (const { id } of await tx.query<{ id: string }>(
      'SELECT id FROM aw_shared_contexts ORDER BY id FOR UPDATE',
    )) {
      await cancelPendingSharedDecision(tx, id, 'participant_unavailable');
      // No generation resumes from an old Shared aggregate, even if its text
      // fingerprint matched. Readable canonical dates/outcomes remain immutable.
      await tx.query(
        "UPDATE aw_shared_contexts SET status='archived',moderation_hold=true,revision=revision+1,updated_at=now() WHERE id=$1 AND (status<>'archived' OR NOT moderation_hold)",
        [id],
      );
    }
    await tx.query(
      "UPDATE aw_shared_invites SET status='revoked',responded_at=now() WHERE status='pending'",
    );
    await tx.query(
      "UPDATE aw_shared_impacts SET status='detached',target_branch_id=NULL WHERE status='pending' AND member_id IN(SELECT id FROM aw_shared_members WHERE status='deleted')",
    );
    for (const table of ['ff_jobs', 'aw_jobs', 'aw_shared_jobs'])
      await tx.query(
        `UPDATE ${table} SET status=CASE WHEN status IN('queued','running','validating') THEN 'cancelled' ELSE status END,lease_token=NULL,lease_until=NULL,payload='{}',checkpoints='{}'`,
      );
    await tx.query(
      "UPDATE aw_branches SET status='failed' WHERE status='generating'",
    );
    await tx.query(
      "UPDATE aw_public_review_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL,finished_at=now() WHERE status IN('queued','running')",
    );
    await tx.query(
      "UPDATE aw_public_draft_reviews SET status='failed',failure_code='PUBLIC_REVIEW_INTERRUPTED',finished_at=now() WHERE status='running'",
    );
    await tx.query(
      "UPDATE aw_public_content_reviews SET status='cancelled',lease_token=NULL,lease_until=NULL,finished_at=now(),failure_code='PUBLIC_CONTENT_REVIEW_INTERRUPTED' WHERE status IN('queued','running')",
    );
    await tx.query(
      "UPDATE aw_scenario_reviews SET status='cancelled',lease_token=NULL,lease_until=NULL,finished_at=now() WHERE status='running'",
    );
    await tx.query(
      "UPDATE aw_social_profiles SET discoverability='private',updated_at=now() WHERE discoverability<>'private'",
    );
    await tx.query(
      "UPDATE aw_user_entitlements SET tier='free',valid_until=now(),updated_at=now() WHERE tier<>'free'",
    );
    for (const block of a.blocks)
      await tx.query(
        'INSERT INTO aw_user_blocks(user_id,blocked_user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [block.userId, block.blockedUserId],
      );
    // Unknown newer moderation is not bypassed by restoring an unrestricted user.
    await tx.query(
      "INSERT INTO aw_publication_restrictions(user_id,active,revision,reason,actor_label) SELECT id,true,1,'personal_data','Quarantined restore' FROM ff_users ON CONFLICT(user_id) DO UPDATE SET active=true,revision=aw_publication_restrictions.revision+1,updated_at=now() WHERE NOT aw_publication_restrictions.active",
    );
    await tx.query('UPDATE aw_budget_accounts SET limit_micro=0');
    for (const account of a.budgetAccounts)
      await tx.query(
        'UPDATE aw_budget_accounts SET accounted_micro=GREATEST(accounted_micro,$2::bigint) WHERE id=$1',
        [account.id, account.accountedMicro],
      );
    const affected = await tx.query<{ branch_id: string }>(
      "SELECT DISTINCT p.branch_id FROM aw_shared_personal_memories p JOIN aw_shared_event_participants ep ON ep.event_id=p.event_id JOIN aw_shared_members m ON m.id=ep.member_id LEFT JOIN ff_users u ON u.id=m.user_id WHERE m.status='deleted' OR m.user_id IS NULL OR u.status<>'active'",
    );
    return {
      schemaVersion: 'privacy-restore-replay-proof-1',
      ...proof,
      authorityHash: hash(a),
      projectBinding: a.projectBinding,
      quarantineDatabase: binding.quarantineDatabase,
      personalHistoryRequiresReview: affected.length,
      serviceActivationAllowed: false,
      paidAiCalls: 0,
      authProviderWrites: false,
    };
  });
}
