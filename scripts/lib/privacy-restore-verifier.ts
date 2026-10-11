import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';
import {
  assertPrivacyRecoveryCoverage,
  privacyRecoveryIdentifier as q,
} from './privacy-recovery-coverage';
import {
  assertPrivacyRestoreBinding,
  privacyRestoreSchemaSql,
  privacyRestoreFingerprint,
  type ReplayBinding,
} from './privacy-restore';

// A separate read-only transaction observes the committed replay. No repair,
// serving, grant changes, Auth import or activation is performed here.
export async function verifyPrivacyRestore(
  db: Database,
  raw: unknown,
  binding: ReplayBinding,
  now = new Date(),
) {
  const authority = assertPrivacyRestoreBinding(raw, binding, now);
  return db.transaction(async (tx) => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await tx.query("SET LOCAL TIME ZONE 'UTC'");
    await tx.query("SET LOCAL search_path='pg_catalog', 'public'");
    await tx.query("SET LOCAL statement_timeout='15s'");
    const [target] = await tx.query<{ name: string }>(
      'SELECT current_database() AS name',
    );
    if (
      target?.name !== binding.quarantineDatabase ||
      hash(await tx.query(privacyRestoreSchemaSql)) !== authority.schemaDigest
    )
      throw Error('Dedicated matching-schema quarantine required');
    const coverage = await assertPrivacyRecoveryCoverage(tx);
    let zeroChecks = 0;
    const empty = async (sql: string, values: unknown[] = []) => {
      const [row] = await tx.query<{ violations: string | number }>(
        `SELECT count(*)::text AS violations FROM (${sql}) violations`,
        values,
      );
      if (!row || row.violations !== '0')
        throw Error('Quarantined privacy verification failed');
      zeroChecks++;
    };
    await empty(
      "SELECT 1 FROM ff_users WHERE status<>'active' OR NOT(id=ANY($1::uuid[]))",
      [authority.activeUserIds],
    );
    // Check all 219 relationships, including indirect children and SET NULL
    // retention. A valid FK declaration alone does not prove old data is clean.
    let userReferenceChecks = 0;
    for (const key of coverage.keys) {
      const nonnull = key.columns
        .map((col) => `c.${q(col)} IS NOT NULL`)
        .join(' AND ');
      const matches = key.columns
        .map((col, i) => `p.${q(key.parent_columns[i]!)}=c.${q(col)}`)
        .join(' AND ');
      await empty(
        `SELECT 1 FROM ${q(key.table_name)} c WHERE ${nonnull} AND NOT EXISTS(SELECT 1 FROM ${q(key.parent)} p WHERE ${matches})`,
      );
      if (key.parent === 'ff_users') {
        if (key.parent_columns.length !== 1 || key.parent_columns[0] !== 'id')
          throw Error('Unknown account relationship');
        await empty(
          `SELECT 1 FROM ${q(key.table_name)} c WHERE ${nonnull} AND NOT(c.${q(key.columns[0]!)}=ANY($1::uuid[]))`,
          [authority.activeUserIds],
        );
        userReferenceChecks++;
      }
    }
    for (const [table, owned] of [
      ['aw_lives', authority.lives],
      ['ff_futures', authority.futures],
    ] as const) {
      const allowed = new Set(owned.map((row) => row.id + ':' + row.userId));
      const rows = await tx.query<{ id: string; user_id: string }>(
        `SELECT id,user_id FROM ${q(table)} ORDER BY id`,
      );
      if (
        rows.length > 100000 ||
        rows.some((row) => !allowed.has(row.id + ':' + row.user_id))
      )
        throw Error('Unverified restored ownership');
    }
    // Only rows identical to fresh source permission evidence may remain live.
    // Unchanged approved publications are retained; changed/unknown rows deny.
    const permissionRules = {
      aw_publications: "status IN('active','hidden')",
      aw_official_publications: "status IN('active','hidden')",
      aw_scenario_publications: "status='active'",
      aw_official_life_sources: "status='active'",
      aw_official_scenario_sources: "status='active'",
      aw_public_exposures: "mode<>'none'",
      aw_public_fork_permissions: 'allowed',
      aw_shared_members: "status IN('active','paused_entitlement')",
      aw_public_collection_entries: 'true',
    } as const;
    for (const [table, predicate] of Object.entries(permissionRules)) {
      const fresh = new Map(
        authority.fingerprints[table as keyof typeof permissionRules].map(
          (row) => [row.id, row.digest],
        ),
      );
      const rows = await tx.query<{
        record: Record<string, unknown> & { id: string };
      }>(
        `SELECT to_jsonb(t) AS record FROM ${q(table)} t WHERE ${predicate} ORDER BY id`,
      );
      if (
        rows.length > 100000 ||
        rows.some(
          ({ record }) =>
            fresh.get(record.id) !==
            privacyRestoreFingerprint(
              table as keyof typeof permissionRules,
              record,
            ),
        )
      )
        throw Error('Unverified restored permission');
    }
    for (const table of ['aw_publications', 'aw_official_publications'])
      await empty(
        `SELECT 1 FROM ${q(table)} WHERE status='withdrawn' AND token_hash IS NOT NULL`,
      );
    for (const table of ['ff_jobs', 'aw_jobs', 'aw_shared_jobs'])
      await empty(
        `SELECT 1 FROM ${q(table)} WHERE status IN('queued','running','validating') OR lease_token IS NOT NULL OR lease_until IS NOT NULL OR payload<>'{}'::jsonb OR checkpoints<>'{}'::jsonb`,
      );
    for (const table of [
      'aw_public_review_jobs',
      'aw_public_content_reviews',
      'aw_scenario_reviews',
    ])
      await empty(
        `SELECT 1 FROM ${q(table)} WHERE status IN('queued','running') OR lease_token IS NOT NULL OR lease_until IS NOT NULL`,
      );
    await empty("SELECT 1 FROM aw_public_draft_reviews WHERE status='running'");
    await empty("SELECT 1 FROM aw_branches WHERE status='generating'");
    await empty(
      "SELECT 1 FROM aw_shared_contexts WHERE status<>'archived' OR NOT moderation_hold",
    );
    await empty('SELECT 1 FROM aw_shared_members WHERE context_live');
    await empty("SELECT 1 FROM aw_shared_invites WHERE status='pending'");
    await empty(
      "SELECT 1 FROM aw_shared_impacts WHERE status='pending' AND (target_branch_id IS NULL OR member_id IN(SELECT id FROM aw_shared_members WHERE status='deleted'))",
    );
    await empty(
      'SELECT 1 FROM aw_shared_members WHERE status=\'deleted\' AND (user_id IS NOT NULL OR life_id IS NOT NULL OR branch_id IS NOT NULL OR world_role IS NOT NULL OR role_data<>\'{}\'::jsonb OR interaction_profile<>\'{"displayName":"Former member","ageBand":null,"country":null,"occupationLabel":null,"sharedRole":null}\'::jsonb)',
    );
    await empty(
      "SELECT 1 FROM aw_social_profiles WHERE discoverability<>'private'",
    );
    await empty("SELECT 1 FROM aw_user_entitlements WHERE tier<>'free'");
    await empty(
      'SELECT 1 FROM ff_users u WHERE NOT EXISTS(SELECT 1 FROM aw_publication_restrictions r WHERE r.user_id=u.id AND r.active)',
    );
    for (const block of authority.blocks)
      await empty(
        'SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM aw_user_blocks WHERE user_id=$1 AND blocked_user_id=$2)',
        [block.userId, block.blockedUserId],
      );
    await empty('SELECT 1 FROM aw_budget_accounts WHERE limit_micro<>0');
    const budgets = new Map(
      (
        await tx.query<{ id: string; accounted_micro: string }>(
          'SELECT id,accounted_micro::text FROM aw_budget_accounts',
        )
      ).map((row) => [row.id, BigInt(row.accounted_micro)]),
    );
    if (
      authority.budgetAccounts.some(
        (row) =>
          !budgets.has(row.id) ||
          budgets.get(row.id)! < BigInt(row.accountedMicro),
      )
    )
      throw Error('Budget high-water mark not preserved');
    await empty(
      "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND c.relname<>'ff_migrations' AND (NOT c.relrowsecurity OR has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))",
    );
    const [history] = await tx.query<{ count: string }>(
      "SELECT count(DISTINCT p.branch_id)::text FROM aw_shared_personal_memories p JOIN aw_shared_event_participants ep ON ep.event_id=p.event_id JOIN aw_shared_members m ON m.id=ep.member_id LEFT JOIN ff_users u ON u.id=m.user_id WHERE m.status='deleted' OR m.user_id IS NULL OR u.status IS DISTINCT FROM 'active'",
    );
    const personalHistoryRequiresReview = Number(history?.count);
    if (
      !Number.isSafeInteger(personalHistoryRequiresReview) ||
      personalHistoryRequiresReview < 0
    )
      throw Error('Complete personal history review count required');
    return {
      schemaVersion: 'privacy-restore-verification-1',
      verifiedAt: now.toISOString(),
      authorityHash: hash(authority),
      projectBinding: authority.projectBinding,
      reviewedTables: coverage.schema.reviewedTables,
      reviewedForeignKeys: coverage.keys.length,
      accountCascadeTables: coverage.accountCascadeTables,
      heldSharedTables: coverage.heldSharedTables,
      operatorMetadataTables: coverage.operatorMetadataTables,
      userReferenceChecks,
      zeroChecks,
      personalHistoryRequiresReview,
      liveWrites: false,
      authProviderWrites: false,
      serviceActivationAllowed: false,
      paidAiCalls: 0,
    };
  });
}
