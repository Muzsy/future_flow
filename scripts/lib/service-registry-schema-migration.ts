import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';
import { reviewedMigrationManifest } from './reviewed-migration-manifest';
import {
  assertReviewedFundedPre040Schema,
  assertReviewedPrivacyRecoverySchema,
  reviewedPre040PrivacyRecoveryTables,
} from './privacy-recovery-schema';
import {
  assertFundedPre040SecurityCatalog,
  assertPrivacySecurityCatalog,
} from './privacy-security-catalog';

export const REGISTRY_SCHEMA_MIGRATION =
  'alterward-registry-schema-migration-1';
const fullSchemaSql =
  "SELECT table_name,column_name,data_type,udt_name,is_nullable,ordinal_position FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position";
export async function captureMigrationPrefixSha256(tx: Database) {
  return hash(
    await tx.query(
      "SELECT name,checksum,(applied_at AT TIME ZONE 'UTC')::text AS applied_at FROM public.ff_migrations WHERE name<>'040_service_access_registry.sql' ORDER BY name",
    ),
  );
}
async function receipts(tx: Database, schema: 39 | 40) {
  const manifest = reviewedMigrationManifest();
  const applied = await tx.query<{ name: string; checksum: string }>(
    'SELECT name,checksum FROM public.ff_migrations ORDER BY name',
  );
  if (
    applied.length !== schema ||
    applied.some(
      (r, i) =>
        r.name !== manifest[i]?.name || r.checksum !== hash(manifest[i]!.sql),
    )
  )
    throw Error('Exact registry039/040 migration receipts required');
}
async function state(tx: Database, schema: 39 | 40) {
  await tx.query("SET LOCAL TIME ZONE 'UTC'");
  await receipts(tx, schema);
  if (schema === 39) await assertReviewedFundedPre040Schema(tx);
  else await assertReviewedPrivacyRecoverySchema(tx);
  const catalog = await (
    schema === 39
      ? assertFundedPre040SecurityCatalog
      : assertPrivacySecurityCatalog
  )(tx);
  const data = await tx.query(
    reviewedPre040PrivacyRecoveryTables
      .map(
        (table) =>
          `SELECT '${table}' AS "table",count(*)::text AS count,md5(coalesce(string_agg(h,'' ORDER BY h),'')) AS digest FROM
     (SELECT md5(to_jsonb(t)::text) AS h FROM public.${table} t) v`,
      )
      .join(' UNION ALL ') + ' ORDER BY "table"',
  );
  const registry =
    schema === 40
      ? await tx.query<{ table: string; count: string; digest: string }>(
          ['aw_service_policy', 'aw_service_admissions']
            .map(
              (table) =>
                `SELECT '${table}' AS "table",count(*)::text AS count,md5(coalesce(string_agg(h,'' ORDER BY h),'')) AS digest FROM
       (SELECT md5(to_jsonb(t)::text) AS h FROM public.${table} t) v`,
            )
            .join(' UNION ALL ') + ' ORDER BY "table"',
        )
      : null;
  return {
    schema,
    schemaSha256: hash(await tx.query(fullSchemaSql)),
    immutableCatalogSha256: catalog.immutableDigest,
    catalogSha256: hash(catalog),
    applicationDataSha256: hash(data),
    migrationPrefixSha256: await captureMigrationPrefixSha256(tx),
    registryDataSha256: registry ? hash(registry) : null,
    registryEmpty: registry ? registry.every((r) => r.count === '0') : null,
  };
}
export const captureRegistry039SchemaState = (tx: Database) => state(tx, 39);
export const captureRegistry040SchemaState = (tx: Database) => state(tx, 40);

export async function applyServiceRegistrySchemaMigration(tx: Database) {
  const [isolation] = await tx.query('SHOW transaction_isolation'),
    [readonly] = await tx.query('SHOW transaction_read_only');
  if (
    isolation?.transaction_isolation !== 'serializable' ||
    readonly?.transaction_read_only !== 'off'
  )
    throw Error('Atomic serializable registry migration required');
  await tx.query("SET LOCAL lock_timeout='5s'");
  await tx.query('SELECT pg_advisory_xact_lock(704203)');
  const before = await state(tx, 39),
    step = reviewedMigrationManifest()[39]!;
  await tx.query("SET LOCAL search_path='public'");
  await tx.query(step.sql);
  await tx.query(
    'INSERT INTO public.ff_migrations(name,checksum) VALUES($1,$2)',
    [step.name, hash(step.sql)],
  );
  const after = await state(tx, 40);
  if (
    before.applicationDataSha256 !== after.applicationDataSha256 ||
    before.migrationPrefixSha256 !== after.migrationPrefixSha256 ||
    after.registryEmpty !== true
  )
    throw Error(
      'Registry migration changed existing application data or receipts',
    );
  return {
    version: REGISTRY_SCHEMA_MIGRATION,
    fromSchema: 39 as const,
    toSchema: 40 as const,
    before,
    after,
    migrationSha256: hash(step.sql),
    serviceActivationAllowed: false as const,
    providerApiCalls: 0 as const,
    authProviderWrites: false as const,
  };
}
