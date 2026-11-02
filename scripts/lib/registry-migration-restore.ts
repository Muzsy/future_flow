import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';
import {
  quarantineReplayRequest,
  runQuarantinedReplay,
} from './quarantined-replay';
import {
  verifyHistorical039PrivacyRestore,
  verifyPrivacyRestoreAfterRegistryMigration,
} from './privacy-restore-verifier';
import {
  registryRestoreContextSchema,
  registryRestoreIntentSchema,
  validateRegistryRestoreIntent,
} from './registry-restore-intent';
import {
  applyServiceRegistrySchemaMigration,
  captureRegistry039SchemaState,
} from './service-registry-schema-migration';
import { reviewedMigrationManifest } from './reviewed-migration-manifest';

function requestForMigration(raw: unknown, rawContext: unknown, now: Date) {
  const parsed = quarantineReplayRequest(raw, now),
    context = registryRestoreContextSchema.parse(rawContext);
  if (
    parsed.request.action !== 'replay' ||
    parsed.request.recoveryProfile === 'registry040' ||
    parsed.request.quarantineDatabase !== context.quarantineDatabase ||
    parsed.request.backupCapturedAt !== context.backupCapturedAt ||
    parsed.request.backupDumpSha256 !== context.backupDumpSha256
  )
    throw Error('Explicit historical039 migration restore request required');
  return { ...parsed, context };
}
function sameTransaction(tx: Database): Database {
  const db: Database = {
    query: tx.query.bind(tx),
    transaction: (run) => run(db),
  };
  return db;
}
async function exactDatabase(tx: Database, expected: string) {
  const [target] = await tx.query<{ name: string }>(
    'SELECT current_database() AS name',
  );
  if (!/^aw_restore_[a-f0-9]{24}$/.test(expected) || target?.name !== expected)
    throw Error('Actual dedicated registry migration quarantine required');
}

// Phase1 performs the real039 replay and verification, then emits a measured
// intent. The privileged owner persists and hash-binds it BEFORE invoking apply.
// No schema040 write happens here; a replayed039 target remains quarantined.
export async function prepareRegistryMigrationRestore(
  db: Database,
  rawRequest: unknown,
  rawContext: unknown,
  now = new Date(),
) {
  const { envelope, binding, context } = requestForMigration(
    rawRequest,
    rawContext,
    now,
  );
  const replay = await runQuarantinedReplay(db, rawRequest, now);
  if (
    replay.action !== 'replay' ||
    !('reviewedTables' in replay) ||
    replay.reviewedTables !== 100 ||
    replay.reviewedForeignKeys !== 225
  )
    throw Error('Actual historical039 replay proof required');
  const observed = await db.transaction(async (tx) => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const verification = await verifyHistorical039PrivacyRestore(
      sameTransaction(tx),
      envelope.authority,
      binding,
      now,
    );
    const before = await captureRegistry039SchemaState(tx);
    return { verification, before };
  });
  const intent = registryRestoreIntentSchema.parse({
    version: 'alterward-registry-restore-intent-1',
    profile: 'historical039-to-registry040',
    context,
    sourceAuthoritySha256: hash(envelope.authority),
    historicalRequestSha256: hash(rawRequest),
    historicalReplayProofSha256: hash(replay),
    historicalVerificationSha256: hash(observed.verification),
    before: observed.before,
    migrationSha256: hash(reviewedMigrationManifest()[39]!.sql),
    serviceActivationAllowed: false,
    providerApiCalls: 0,
    authProviderWrites: false,
  });
  return validateRegistryRestoreIntent(
    intent,
    envelope.authority,
    binding,
    context,
    hash(rawRequest),
  );
}

// Phase2 has exactly one schema write. A lost output is resolved by the separate
// read-only verify entrypoint below, never by calling apply again on schema040.
export async function applyRegistryMigrationRestore(
  db: Database,
  rawRequest: unknown,
  rawIntent: unknown,
  rawContext: unknown,
  now = new Date(),
) {
  const { envelope, binding, context } = requestForMigration(
    rawRequest,
    rawContext,
    now,
  );
  const intent = validateRegistryRestoreIntent(
    rawIntent,
    envelope.authority,
    binding,
    context,
    hash(rawRequest),
  );
  await db.transaction(async (tx) => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await exactDatabase(tx, context.quarantineDatabase);
    const current = await captureRegistry039SchemaState(tx);
    if (hash(current) !== hash(intent.before))
      throw Error('Registry migration quarantine drift before SQL');
    const migrated = await applyServiceRegistrySchemaMigration(tx);
    if (hash(migrated.before) !== hash(intent.before))
      throw Error('Registry migration quarantine changed before append');
  });
  return verifyRegistryMigrationRestore(db, rawRequest, intent, context, now);
}
export async function verifyRegistryMigrationRestore(
  db: Database,
  rawRequest: unknown,
  rawIntent: unknown,
  rawContext: unknown,
  now = new Date(),
) {
  const { envelope, binding, context } = requestForMigration(
    rawRequest,
    rawContext,
    now,
  );
  const intent = validateRegistryRestoreIntent(
    rawIntent,
    envelope.authority,
    binding,
    context,
    hash(rawRequest),
  );
  const verification = await verifyPrivacyRestoreAfterRegistryMigration(
    db,
    envelope.authority,
    binding,
    intent,
    context,
    hash(rawRequest),
    now,
  );
  if (
    !verification.registryMigrationState ||
    verification.registryMigrationState.schema !== 40 ||
    verification.registryMigrationState.registryEmpty !== true ||
    verification.reviewedTables !== 102 ||
    verification.reviewedForeignKeys !== 226
  )
    throw Error('Complete registry040 restore verification required');
  // Each independent observation has its own verifiedAt. Preserve its raw
  // receipt hash, and compare every measured state field separately across runs.
  const { verifiedAt: _verifiedAt, ...verifiedState } = verification;
  return {
    version: 'alterward-registry-migration-restore-proof-1',
    profile: 'historical039-to-registry040',
    context,
    intentSha256: hash(intent),
    sourceAuthoritySha256: hash(envelope.authority),
    historicalReplayProofSha256: intent.historicalReplayProofSha256,
    historicalVerificationSha256: intent.historicalVerificationSha256,
    before: intent.before,
    after: verification.registryMigrationState,
    postVerificationSha256: hash(verification),
    postVerificationStateSha256: hash(verifiedState),
    replayedDataPreserved: true,
    sourceTables: 100,
    newRegistryEmpty: true,
    reviewedTables: verification.reviewedTables,
    reviewedForeignKeys: verification.reviewedForeignKeys,
    serviceActivationAllowed: false as const,
    providerApiCalls: 0 as const,
    authProviderWrites: false as const,
  };
}
