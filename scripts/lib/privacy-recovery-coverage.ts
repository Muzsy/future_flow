import type { Database } from '@future-flow/database';
import {
  assertReviewedPrivacyRecoverySchema,
  reviewedPrivacyRecoveryTables,
} from './privacy-recovery-schema';

// Semantic exceptions to account-root cascade deletion. Never inferred from
// an unreviewed live schema. The immutable column/FK guard is checked first.
const operatorMetadata = new Set([
  'ff_questionnaires',
  'aw_public_collections',
  'aw_public_collection_actions',
]);
const heldSharedCanon = new Set([
  'aw_shared_ai_runs',
  'aw_shared_contexts',
  'aw_shared_event_participants',
  'aw_shared_events',
  'aw_shared_impacts',
  'aw_shared_intents',
  'aw_shared_invites',
  'aw_shared_jobs',
  'aw_shared_members',
  'aw_shared_moderation_audit',
  'aw_shared_resolutions',
]);
type ForeignKey = {
  table_name: string;
  parent: string;
  action: string;
  columns: string[];
  parent_columns: string[];
};
export function privacyRecoveryIdentifier(name: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name))
    throw Error('Reviewed SQL identifier required');
  return '"' + name + '"';
}
export async function assertPrivacyRecoveryCoverage(tx: Database) {
  const schema = await assertReviewedPrivacyRecoverySchema(tx);
  const keys =
    await tx.query<ForeignKey>(`SELECT t.relname AS table_name,p.relname AS parent,k.confdeltype::text AS action,
    ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY c(num,ord) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=c.num ORDER BY c.ord) AS columns,
    ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY c(num,ord) JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=c.num ORDER BY c.ord) AS parent_columns
    FROM pg_constraint k JOIN pg_class t ON t.oid=k.conrelid JOIN pg_class p ON p.oid=k.confrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_namespace pn ON pn.oid=p.relnamespace
    WHERE n.nspname='public' AND pn.nspname='public' AND k.contype='f' ORDER BY t.relname,k.conname`);
  if (keys.length !== 225)
    throw Error('Reviewed foreign-key coverage required');
  const cascaded = new Set(['ff_users']);
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of keys)
      if (
        key.action === 'c' &&
        cascaded.has(key.parent) &&
        !cascaded.has(key.table_name)
      ) {
        cascaded.add(key.table_name);
        changed = true;
      }
  }
  for (const table of reviewedPrivacyRecoveryTables) {
    const categories =
      Number(cascaded.has(table)) +
      Number(operatorMetadata.has(table)) +
      Number(heldSharedCanon.has(table));
    if (categories !== 1)
      throw Error('Unclassified or overlapping privacy recovery table');
  }
  for (const key of keys) {
    if (
      !reviewedPrivacyRecoveryTables.includes(key.table_name) ||
      !reviewedPrivacyRecoveryTables.includes(key.parent) ||
      !key.columns.length ||
      key.columns.length !== key.parent_columns.length
    )
      throw Error('Unknown privacy recovery relationship');
    [key.table_name, key.parent, ...key.columns, ...key.parent_columns].forEach(
      privacyRecoveryIdentifier,
    );
  }
  return {
    schema,
    keys,
    accountCascadeTables: cascaded.size - 1,
    heldSharedTables: heldSharedCanon.size,
    operatorMetadataTables: operatorMetadata.size,
  };
}
