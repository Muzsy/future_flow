import { z } from 'zod';
import { hash } from '@future-flow/core';
import { reviewedMigrationManifest } from './reviewed-migration-manifest';
import { reviewedPrivacySecurityImmutableDigest } from './privacy-security-catalog';
import type { PrivacyRestoreAuthority, ReplayBinding } from './privacy-restore';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const registryRestoreContextSchema = z
  .object({
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    backupRunId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/),
    backupDumpSha256: digest,
    backupCapturedAt: z.string().datetime(),
    quarantineDatabase: z.string().regex(/^aw_restore_[a-f0-9]{24}$/),
    quarantineInstanceSha256: digest,
  })
  .strict();
export type RegistryRestoreContext = z.infer<
  typeof registryRestoreContextSchema
>;
const beforeSchema = z
  .object({
    schema: z.literal(39),
    schemaSha256: digest,
    immutableCatalogSha256: digest,
    catalogSha256: digest,
    applicationDataSha256: digest,
    migrationPrefixSha256: digest,
    registryDataSha256: z.null(),
    registryEmpty: z.null(),
  })
  .strict();
export const registryRestoreIntentSchema = z
  .object({
    version: z.literal('alterward-registry-restore-intent-1'),
    profile: z.literal('historical039-to-registry040'),
    context: registryRestoreContextSchema,
    sourceAuthoritySha256: digest,
    historicalRequestSha256: digest,
    historicalReplayProofSha256: digest,
    historicalVerificationSha256: digest,
    before: beforeSchema,
    migrationSha256: digest,
    serviceActivationAllowed: z.literal(false),
    providerApiCalls: z.literal(0),
    authProviderWrites: z.literal(false),
  })
  .strict();
export type RegistryRestoreIntent = z.infer<typeof registryRestoreIntentSchema>;
export function validateRegistryRestoreIntent(
  raw: unknown,
  authority: PrivacyRestoreAuthority,
  binding: ReplayBinding,
  context: unknown,
  requestSha256: string,
) {
  const intent = registryRestoreIntentSchema.parse(raw),
    expected = registryRestoreContextSchema.parse(context);
  if (
    hash(intent.context) !== hash(expected) ||
    intent.sourceAuthoritySha256 !== hash(authority) ||
    intent.historicalRequestSha256 !== requestSha256 ||
    !/^[a-f0-9]{64}$/.test(requestSha256) ||
    intent.context.quarantineDatabase !== binding.quarantineDatabase ||
    intent.context.backupCapturedAt !== binding.backupCapturedAt ||
    intent.before.schemaSha256 !== authority.schemaDigest ||
    intent.before.immutableCatalogSha256 !==
      authority.securityCatalog.immutableDigest ||
    intent.before.immutableCatalogSha256 !==
      reviewedPrivacySecurityImmutableDigest(39) ||
    intent.migrationSha256 !== hash(reviewedMigrationManifest()[39]!.sql)
  )
    throw Error('Registry migration restore intent binding mismatch');
  return intent;
}
