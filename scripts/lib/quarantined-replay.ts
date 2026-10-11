import { z } from 'zod';
import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';
import { validateRecoveryFenceEnvelope } from './privacy-fence-envelope';
import { replayPrivacyRestore, type ReplayBinding } from './privacy-restore';
import { verifyPrivacyRestore } from './privacy-restore-verifier';
import {
  assertPrivacySecurityCatalog,
  hardenPrivacyQuarantine,
} from './privacy-security-catalog';

// This request is supplied in memory by the privileged root transport AFTER
// physically checking its originals. Its hashes alone do not establish a fence.
const requestSchema = z
  .object({
    action: z.enum(['prepare', 'replay']),
    quarantineDatabase: z.string().regex(/^aw_restore_[a-f0-9]{24}$/),
    backupCapturedAt: z.string().datetime(),
    backupDumpSha256: z.string().regex(/^[a-f0-9]{64}$/),
    envelope: z.unknown(),
    held: z.unknown(),
  })
  .strict();

export function quarantineReplayRequest(raw: unknown, now = new Date()) {
  const request = requestSchema.parse(raw);
  const envelope = validateRecoveryFenceEnvelope(
    request.envelope,
    request.held as Parameters<typeof validateRecoveryFenceEnvelope>[1],
    now,
  );
  const binding: ReplayBinding = {
    quarantineDatabase: request.quarantineDatabase,
    backupCapturedAt: request.backupCapturedAt,
    expectedAuthorityHash: hash(envelope.authority),
    projectBinding: envelope.binding.projectBinding,
    writerFenceDigest: envelope.binding.writerFenceDigest,
  };
  if (
    Date.parse(request.backupCapturedAt) >
    Date.parse(envelope.authority.capturedAt)
  )
    throw Error('Fresh held source must follow the selected backup');
  return { request, envelope, binding };
}

export async function runQuarantinedReplay(
  db: Database,
  raw: unknown,
  now = new Date(),
) {
  const { request, envelope, binding } = quarantineReplayRequest(raw, now);
  if (request.action === 'prepare') {
    await db.transaction(async (tx) => {
      await tx.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      await tx.query('SET LOCAL search_path=pg_catalog,public');
      await hardenPrivacyQuarantine(tx, request.quarantineDatabase);
      await assertPrivacySecurityCatalog(
        tx,
        'quarantine',
        envelope.authority.securityCatalog,
      );
    });
    return {
      action: request.action,
      cleanCatalogHardenedBeforeDataLoad: true,
      serviceActivationAllowed: false as const,
    };
  }
  await replayPrivacyRestore(db, envelope.authority, binding, now);
  // Deliberately independent of the mutation transaction and its private proof.
  const verification = await verifyPrivacyRestore(
    db,
    envelope.authority,
    binding,
  );
  return {
    action: request.action,
    independentReadOnlyPostReplayVerified: true,
    reviewedTables: verification.reviewedTables,
    reviewedForeignKeys: verification.reviewedForeignKeys,
    personalHistoryRequiresReview: verification.personalHistoryRequiresReview,
    reviewedSecurityCatalog: verification.reviewedSecurityCatalog,
    serviceActivationAllowed: false as const,
    paidAiCalls: 0,
    authProviderWrites: false,
  };
}
