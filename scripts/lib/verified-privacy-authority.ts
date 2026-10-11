import type { Database } from '@future-flow/database';
import {
  readRecoveryAuthInventory,
  verifyRecoveryAuthInventory,
  assertRecoveryAuthStable,
  recoveryAuthProjectionSql,
} from './recovery-auth-inventory';
import { readVerifiedPrivacyRestoreAuthoritySnapshot } from './privacy-restore';

// Auth observation and all application authority reads share one DB snapshot.
// The root operator still has to establish and attest the physical writer fence;
// a caller-supplied fence hash is not evidence that services were stopped.
export async function captureVerifiedPrivacyRestoreAuthority(
  db: Database,
  readPage: (page: number) => Promise<unknown>,
  binding: { projectBinding: string; writerFenceDigest: string },
) {
  const before = await readRecoveryAuthInventory(readPage);
  return db.transaction(async (tx) => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await tx.query("SET LOCAL TIME ZONE 'UTC'");
    await tx.query("SET LOCAL search_path='pg_catalog', 'public'");
    await tx.query("SET LOCAL statement_timeout='15s'");
    const localStartedAt = new Date().toISOString();
    const [clock] = await tx.query<{ observed_at: string }>(
      'SELECT to_jsonb(clock_timestamp()) AS observed_at',
    );
    const localFinishedAt = new Date().toISOString();
    if (!clock) throw Error('Independent database clock required');
    const database = (
      await tx.query<{ record: unknown }>(recoveryAuthProjectionSql)
    ).map((row) => row.record);
    const after = await readRecoveryAuthInventory(readPage);
    const auth = verifyRecoveryAuthInventory(before, database, after, {
      localStartedAt,
      localFinishedAt,
      databaseAt: clock.observed_at,
    });
    const authority = await readVerifiedPrivacyRestoreAuthoritySnapshot(
      tx,
      auth,
      binding,
    );
    const final = await readRecoveryAuthInventory(readPage);
    assertRecoveryAuthStable(before, final);
    return {
      authority,
      authStateDigest: auth.digest,
      independentAuthStateVerified: true as const,
      singleReadOnlySourceSnapshot: true as const,
      serviceActivationAllowed: false as const,
    };
  });
}
