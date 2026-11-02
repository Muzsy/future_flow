// Database transport only. The privileged controller must independently verify
// the source/image, held writers, backup and isolated restore, and durably store
// the returned intent before apply. Digests supplied here are bindings, not
// attestations that those host-side operations happened.
import { z } from 'zod';
import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';
import {
  assertServiceRegistryMigration,
  captureServiceRegistryRuntime,
  migrateServiceRegistryRuntime,
  parseServiceRegistryRuntime,
} from './funded-runtime';
import { reviewedMigrationManifest } from './reviewed-migration-manifest';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const registryUpgradeContextSchema = z
  .object({
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    candidateSha256: digest,
    parentAuthoritySha256: digest,
    backupManifestSha256: digest,
    restoreProofSha256: digest,
  })
  .strict();
const observation = z
  .unknown()
  .transform((value) => parseServiceRegistryRuntime(value));
const intentSchema = z
  .object({
    version: z.literal('alterward-registry-upgrade-intent-1'),
    purpose: z.literal('schema-040'),
    context: registryUpgradeContextSchema,
    observedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    before: observation,
    migrationSha256: digest,
    serviceActivationAllowed: z.literal(false),
    providerApiCalls: z.literal(0),
    authProviderWrites: z.literal(false),
  })
  .strict();
type Identity = Parameters<typeof captureServiceRegistryRuntime>[1];
export type RegistryUpgradeIntent = z.infer<typeof intentSchema>;

function validate(raw: unknown, context: unknown) {
  const intent = intentSchema.parse(raw);
  if (
    hash(intent.context) !==
      hash(registryUpgradeContextSchema.parse(context)) ||
    intent.before.schema !== 39 ||
    intent.migrationSha256 !== hash(reviewedMigrationManifest()[39]!.sql) ||
    Date.parse(intent.expiresAt) - Date.parse(intent.observedAt) !== 900000
  )
    throw Error('Registry upgrade intent binding mismatch');
  return intent;
}
async function clock(tx: Database) {
  const [row] = await tx.query<{ now: Date }>(
    'SELECT clock_timestamp() AS now',
  );
  const now = new Date(row?.now ?? 'invalid');
  if (!Number.isFinite(now.getTime())) throw Error('Database clock required');
  return now;
}
async function readonly(tx: Database) {
  const [row] = await tx.query('SHOW transaction_read_only');
  const [isolation] = await tx.query('SHOW transaction_isolation');
  if (
    row?.transaction_read_only !== 'on' ||
    !['repeatable read', 'serializable'].includes(
      String(isolation?.transaction_isolation),
    )
  )
    throw Error('Read-only registry upgrade observation required');
}
export async function prepareRegistryUpgrade(
  tx: Database,
  identity: Identity,
  rawContext: unknown,
) {
  await readonly(tx);
  const context = registryUpgradeContextSchema.parse(rawContext);
  const now = await clock(tx);
  const before = await captureServiceRegistryRuntime(tx, identity);
  if (before.schema !== 39)
    throw Error('Exact039 upgrade preparation required');
  return validate(
    {
      version: 'alterward-registry-upgrade-intent-1',
      purpose: 'schema-040',
      context,
      observedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 900000).toISOString(),
      before,
      migrationSha256: hash(reviewedMigrationManifest()[39]!.sql),
      serviceActivationAllowed: false,
      providerApiCalls: 0,
      authProviderWrites: false,
    },
    context,
  );
}
export async function applyRegistryUpgrade(
  tx: Database,
  identity: Identity,
  rawIntent: unknown,
  context: unknown,
  persistedIntentSha256: string,
) {
  const intent = validate(rawIntent, context);
  if (persistedIntentSha256 !== hash(intent))
    throw Error('Durable exact registry upgrade intent required');
  const now = (await clock(tx)).getTime();
  if (
    now < Date.parse(intent.observedAt) ||
    now >= Date.parse(intent.expiresAt)
  )
    throw Error('Unexpired registry upgrade intent required');
  // This primitive requires SERIALIZABLE READ WRITE, takes the reviewed lock,
  // rechecks the complete039 observation, then appends040 exactly once.
  const after = parseServiceRegistryRuntime(
    await migrateServiceRegistryRuntime(tx, identity, intent.before),
  );
  return result(intent, 'committed', after);
}
function result(
  intent: RegistryUpgradeIntent,
  state: 'committed' | 'uncommitted',
  observed: ReturnType<typeof parseServiceRegistryRuntime>,
) {
  return {
    version: 'alterward-registry-upgrade-result-1' as const,
    intentSha256: hash(intent),
    state,
    observation: observed,
    protectedDataUnchanged: true as const,
    serviceActivationAllowed: false as const,
    providerApiCalls: 0 as const,
    authProviderWrites: false as const,
  };
}
export async function reconcileRegistryUpgrade(
  tx: Database,
  identity: Identity,
  rawIntent: unknown,
  context: unknown,
) {
  await readonly(tx);
  const intent = validate(rawIntent, context);
  const current = parseServiceRegistryRuntime(
    await captureServiceRegistryRuntime(tx, identity),
  );
  if (current.schema === 39) {
    if (hash(current) !== hash(intent.before))
      throw Error('Uncommitted registry baseline drift');
    return result(intent, 'uncommitted', current);
  }
  // No SQL retry, even after the intent expires or COMMIT stdout is lost.
  assertServiceRegistryMigration(intent.before, current);
  return result(intent, 'committed', current);
}
export async function registryUpgradeRequest(
  tx: Database,
  identity: Identity,
  mode: string,
  raw: unknown,
) {
  if (mode === 'registry-prepare') {
    const request = z
      .object({ context: registryUpgradeContextSchema })
      .strict()
      .parse(raw);
    return prepareRegistryUpgrade(tx, identity, request.context);
  }
  if (mode === 'registry-apply') {
    const request = z
      .object({
        context: registryUpgradeContextSchema,
        intent: intentSchema,
        persistedIntentSha256: digest,
      })
      .strict()
      .parse(raw);
    return applyRegistryUpgrade(
      tx,
      identity,
      request.intent,
      request.context,
      request.persistedIntentSha256,
    );
  }
  if (mode === 'registry-reconcile') {
    const request = z
      .object({ context: registryUpgradeContextSchema, intent: intentSchema })
      .strict()
      .parse(raw);
    return reconcileRegistryUpgrade(
      tx,
      identity,
      request.intent,
      request.context,
    );
  }
  throw Error('Explicit registry upgrade mode required');
}
