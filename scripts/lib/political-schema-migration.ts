import { storyCatalogs } from '@future-flow/contracts';
import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';
import { reviewedPrivacyRecoveryTables } from './privacy-recovery-schema';
import {
  assertPoliticalPrivacySecurityCatalog,
  assertPrivacySecurityCatalog,
} from './privacy-security-catalog';
import { reviewedMigrationManifest } from './reviewed-migration-manifest';

const legacyIssueKeys = Object.keys(
  storyCatalogs['1.0.0'].directions.politics.situations,
);
const readReceipts = (tx: Database) =>
  tx.query<{ name: string; checksum: string; applied_at: string }>(
    "SELECT name,checksum,(applied_at AT TIME ZONE 'UTC')::text AS applied_at FROM public.ff_migrations ORDER BY name",
  );

async function existingDataSha256(tx: Database) {
  const rows = await tx.query(
    reviewedPrivacyRecoveryTables
      .map(
        (table) => `SELECT '${table}' AS "table", count(*)::text AS count,
        md5(coalesce(string_agg(h,'' ORDER BY h),'')) AS digest
        FROM (SELECT md5(to_jsonb(t)::text) AS h FROM public.${table} t) AS rows`,
      )
      .join(' UNION ALL ') + ' ORDER BY "table"',
  );
  return hash(rows);
}

export async function rehearsePoliticalSchemaMigration(
  tx: Database,
  quarantineDatabase: string,
) {
  const [target] = await tx.query<{ name: string }>(
    'SELECT current_database() AS name',
  );
  const [isolation] = await tx.query('SHOW transaction_isolation');
  const [readOnly] = await tx.query('SHOW transaction_read_only');
  if (
    !/^aw_restore_[a-f0-9]{24}$/.test(quarantineDatabase) ||
    target?.name !== quarantineDatabase ||
    isolation?.transaction_isolation !== 'serializable' ||
    readOnly?.transaction_read_only !== 'off'
  )
    throw Error('Dedicated serializable quarantine required for 041 rehearsal');

  await tx.query("SET LOCAL TIME ZONE 'UTC'");
  await tx.query("SET LOCAL lock_timeout='5s'");
  await tx.query('SELECT pg_advisory_xact_lock(704203)');
  await assertPrivacySecurityCatalog(tx);
  const manifest = reviewedMigrationManifest(41);
  const before = await readReceipts(tx);
  if (
    before.length !== 40 ||
    before.some(
      (receipt, index) =>
        receipt.name !== manifest[index]?.name ||
        receipt.checksum !== hash(manifest[index]!.sql),
    )
  )
    throw Error('Exact reviewed 040 predecessor required');

  const data = await existingDataSha256(tx);
  const expectedHistory = await tx.query(
    `SELECT DISTINCT user_id, input #>> '{story,startingSituation,id}' AS issue_key
    FROM public.aw_lives WHERE input #>> '{story,emphases,0,direction}' = 'politics'
    AND input #>> '{story,startingSituation,id}' = ANY($1::text[])
    ORDER BY user_id, issue_key`,
    [legacyIssueKeys],
  );
  const step = manifest[40]!;
  const migrationSha256 = hash(step.sql);
  await tx.query("SET LOCAL search_path='public'");
  await tx.query(step.sql);
  await tx.query(
    'INSERT INTO public.ff_migrations(name,checksum) VALUES($1,$2)',
    [step.name, migrationSha256],
  );

  const catalog = await assertPoliticalPrivacySecurityCatalog(tx);
  const after = await readReceipts(tx);
  const actualHistory = await tx.query(
    'SELECT user_id,issue_key FROM public.aw_political_start_history ORDER BY user_id,issue_key',
  );
  if (
    after.length !== 41 ||
    hash(after.slice(0, 40)) !== hash(before) ||
    after[40]?.name !== step.name ||
    after[40]?.checksum !== migrationSha256 ||
    data !== (await existingDataSha256(tx)) ||
    hash(actualHistory) !== hash(expectedHistory)
  )
    throw Error(
      '041 rehearsal did not preserve the original data or exact expected backfill',
    );
  return {
    version: 'alterward-political-schema-rehearsal-1',
    fromSchema: 40,
    toSchema: 41,
    migrationSha256,
    predecessorReceiptsSha256: hash(before),
    receiptsSha256: hash(after),
    originalDataSha256: data,
    catalogSha256: hash(catalog),
    backfilledIssues: actualHistory.length,
    serviceActivationAllowed: false,
  } as const;
}
