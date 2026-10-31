import { connectDatabase, Repository } from '@future-flow/database';
import { idSchema } from '@future-flow/contracts';
import { DomainError } from '@future-flow/core';
import { SupabaseAuthProvider } from '../apps/api/src/auth';
import { recoverAccountDeletion } from '../apps/api/src/account-deletion';
import {
  accountDeletionBilling,
  createBillingRuntime,
} from '../apps/api/src/billing';

async function main() {
  const db = connectDatabase(
    process.env.DATABASE_URL ?? '',
    process.env.DATABASE_SSL === 'true',
  );
  try {
    const id = process.argv[2];
    if (!id) {
      const counts = await db.query(
        'SELECT status,count(*)::int AS count FROM aw_account_deletions GROUP BY status',
      );
      console.log(
        JSON.stringify({
          pending: counts,
          instruction:
            'Supply a pending user UUID to resume the requested deletion.',
        }),
      );
      return;
    }
    const auth = new SupabaseAuthProvider(
      process.env.SUPABASE_URL ?? '',
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        '',
    );
    // Same guard as the API: subscriptions are cancelled first, and with billing
    // unavailable a live subscription keeps the deletion pending (cancel it at
    // the provider or enable billing, then run this again).
    await recoverAccountDeletion(
      new Repository(db),
      auth,
      idSchema.parse(id),
      accountDeletionBilling(createBillingRuntime(db)),
    );
    console.log('Pending account deletion completed.');
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(
    `Deletion recovery stopped: ${error instanceof DomainError ? error.code : 'RECOVERY_FAILED'}.`,
  );
  process.exitCode = 1;
});
