import { connectDatabase, Repository } from '@future-flow/database';
import { idSchema } from '@future-flow/contracts';
import { DomainError } from '@future-flow/core';
import { SupabaseAuthProvider } from '../apps/api/src/auth';
import { recoverAccountDeletion } from '../apps/api/src/account-deletion';

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
    await recoverAccountDeletion(new Repository(db), auth, idSchema.parse(id));
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
