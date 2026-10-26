import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';

// Explicit immutable 001–038 baseline, never derived from the current database
// or automatically extended when a new migration appears. This is a schema
// drift guard, not proof that every retained text is safe to serve.
export const reviewedPrivacyRecoveryTables = `
aw_account_deletions aw_activity_sessions aw_ai_runs aw_branches
aw_budget_accounts aw_budget_reservations aw_choices aw_deleted_life_admissions
aw_drafts aw_feedback aw_history aw_initial_choices aw_interactions aw_jobs
aw_lives aw_metrics aw_official_life_sources aw_official_life_starts
aw_official_publication_actions aw_official_publication_previews
aw_official_publications aw_official_scenario_sources aw_periods
aw_personal_scenario_previews aw_personal_scenario_starts
aw_public_collection_actions aw_public_collection_entries aw_public_collections
aw_public_content_bundle_checkpoints aw_public_content_bundles
aw_public_content_curations aw_public_content_reviews aw_public_draft_reviews
aw_public_exposure_actions aw_public_exposures aw_public_fork_checkpoints
aw_public_fork_permission_actions aw_public_fork_permissions aw_public_fork_starts
aw_public_metrics_daily aw_public_reading_sessions aw_public_reports
aw_public_review_jobs aw_public_scenario_previews aw_public_text_curations
aw_public_warnings aw_publication_actions aw_publication_drafts
aw_publication_previews aw_publication_refreshes aw_publication_restriction_actions
aw_publication_restrictions aw_publications aw_saved_lives aw_scenario_curations
aw_scenario_drafts aw_scenario_publication_moderation aw_scenario_publications
aw_scenario_reviews aw_scenario_starts aw_scenario_versions aw_scenarios
aw_shared_ai_runs aw_shared_contexts aw_shared_event_participants aw_shared_events
aw_shared_impacts aw_shared_intents aw_shared_invites aw_shared_jobs
aw_shared_members aw_shared_moderation_audit aw_shared_personal_memories
aw_shared_reports aw_shared_resolutions aw_social_profiles aw_user_blocks
aw_user_entitlements ff_ai_runs ff_branches ff_chapter_events ff_chapters
ff_consents ff_decision_options ff_decision_resolutions ff_decisions ff_events
ff_futures ff_idempotency ff_jobs ff_life_states ff_profile_drafts
ff_profile_versions ff_questionnaires ff_users ff_world_versions
`
  .trim()
  .split(/\s+/)
  .sort();
const columnsDigest =
  '37519bd15ef5d42b9ea1ef6486dc00a3ddf43582c589d718a01355701de1b31c';
const foreignKeysDigest =
  '9f6ee97448b7fc65777e28126d41f38b463696d71ce7a979076e9ee711025b4e';
const columnsSql =
  "SELECT table_name,column_name,data_type,udt_name,is_nullable,ordinal_position FROM information_schema.columns WHERE table_schema='public' AND table_name<>'ff_migrations' ORDER BY table_name,ordinal_position";
const foreignKeysSql =
  "SELECT t.relname AS table_name,k.conname AS constraint_name,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class t ON t.oid=k.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND k.contype='f' ORDER BY t.relname,k.conname";

// Explicit historical 001–037 entry point is restricted to the funded upgrade
// preflight. Normal recovery stays pinned to 001–038 and still rejects 037.
export async function assertReviewedFundedPre038Schema(tx: Database) {
  return assertSchema(tx, 37);
}
// Dedicated funded upgrade entry for the observed 001–036 production baseline.
// Normal recovery is still strictly 038; no caller-supplied catalog is accepted.
export async function assertReviewedFundedPre037Schema(tx: Database) {
  return assertSchema(tx, 36);
}
export async function assertReviewedPrivacyRecoverySchema(tx: Database) {
  return assertSchema(tx, 38);
}
async function assertSchema(tx: Database, baseline: 36 | 37 | 38) {
  await tx.query("SET LOCAL search_path='pg_catalog', 'public'");
  const tables = (
    await tx.query<{ name: string }>(
      "SELECT c.relname::text AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f') ORDER BY c.relname",
    )
  ).map((r) => r.name);
  const application = tables.filter((name) => name !== 'ff_migrations');
  if (
    reviewedPrivacyRecoveryTables.length !== 96 ||
    hash(application) !== hash(reviewedPrivacyRecoveryTables)
  )
    throw Error('Unreviewed privacy recovery table set');
  const columns = await tx.query(columnsSql),
    foreignKeys = await tx.query(foreignKeysSql);
  const catalogColumns = await tx.query(
    "SELECT c.relname::text AS table_name,a.attname::text AS column_name,a.attnum::int AS ordinal_position FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname<>'ff_migrations' AND c.relkind IN('r','p') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum",
  );
  if (
    columns.length !== { 36: 854, 37: 855, 38: 856 }[baseline] ||
    hash(catalogColumns) !==
      hash(
        columns.map(({ table_name, column_name, ordinal_position }) => ({
          table_name,
          column_name,
          ordinal_position,
        })),
      ) ||
    hash(columns) !==
      (baseline === 36
        ? 'c5ac8bcddfc2a635b3923f8be73790d78ff6909734e0b6aaa3b1351be88a7af2'
        : baseline === 37
          ? '336b477e65a6d9e4db124d42375298c64270d98bbad340dcf54f61ac404b8c50'
          : columnsDigest) ||
    foreignKeys.length !== 219 ||
    hash(foreignKeys) !== foreignKeysDigest
  )
    throw Error('Unreviewed privacy recovery columns or foreign-key graph');
  if (tables.includes('ff_migrations')) {
    const ledger = await tx.query(
      "SELECT column_name,data_type,udt_name,is_nullable,ordinal_position FROM information_schema.columns WHERE table_schema='public' AND table_name='ff_migrations' ORDER BY ordinal_position",
    );
    const expected = [
      {
        column_name: 'name',
        data_type: 'text',
        udt_name: 'text',
        is_nullable: 'NO',
        ordinal_position: 1,
      },
      {
        column_name: 'checksum',
        data_type: 'text',
        udt_name: 'text',
        is_nullable: 'NO',
        ordinal_position: 2,
      },
      {
        column_name: 'applied_at',
        data_type: 'timestamp with time zone',
        udt_name: 'timestamptz',
        is_nullable: 'NO',
        ordinal_position: 3,
      },
    ];
    const ledgerColumns = await tx.query(
      "SELECT a.attname::text AS column_name,a.attnum::int AS ordinal_position FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='ff_migrations' AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum",
    );
    if (
      hash(ledger) !== hash(expected) ||
      hash(ledgerColumns) !==
        hash(
          expected.map(({ column_name, ordinal_position }) => ({
            column_name,
            ordinal_position,
          })),
        )
    )
      throw Error('Unreviewed recovery migration ledger');
  }
  return {
    reviewedTables: application.length,
    migrationLedgerPresent: tables.includes('ff_migrations'),
    reviewedColumns: columns.length,
    reviewedForeignKeys: foreignKeys.length,
  };
}
