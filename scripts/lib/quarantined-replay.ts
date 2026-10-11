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
import { reviewedPrivacyRecoveryTables } from './privacy-recovery-schema';

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
      // Migration 029 inserts three default collection rows. They must not
      // collide with the selected backup, which owns every restored data row.
      // Check the executable catalog first; never clear a populated old target.
      for (const table of [...reviewedPrivacyRecoveryTables, 'ff_migrations']) {
        if (table === 'aw_public_collections') continue;
        const [row] = await tx.query<{ populated: boolean }>(
          `SELECT EXISTS(SELECT 1 FROM public."${table}" LIMIT 1) AS populated`,
        );
        if (row?.populated !== false)
          throw Error('Clean migrated target must contain no retained data');
      }
      const seeds = await tx.query(
        'SELECT collection_key,revision,last_request_hash FROM public.aw_public_collections ORDER BY collection_key',
      );
      if (
        JSON.stringify(seeds) !==
        JSON.stringify(
          ['community-picks', 'featured', 'turning-points'].map(
            (collection_key) => ({
              collection_key,
              revision: 1,
              last_request_hash: null,
            }),
          ),
        )
      )
        throw Error('Only exact reviewed migration seed rows may be cleared');
      await tx.query('DELETE FROM public.aw_public_collections');
      const [remaining] = await tx.query<{ populated: boolean }>(
        'SELECT EXISTS(SELECT 1 FROM public.aw_public_collections LIMIT 1) AS populated',
      );
      if (remaining?.populated !== false)
        throw Error('Migration seed cleanup did not complete');
    });
    return {
      action: request.action,
      cleanCatalogHardenedBeforeDataLoad: true,
      cleanMigrationSeedRowsRemoved: 3,
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
