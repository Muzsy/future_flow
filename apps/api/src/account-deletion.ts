import { Repository } from '@future-flow/database';
import { DomainError } from '@future-flow/core';
import type { AuthProvider } from './auth';

export async function deleteAccount(
  repo: Repository,
  auth: AuthProvider,
  userId: string,
) {
  auth.assertDeletionConfigured?.();
  await repo.markDeleting(userId);
  try {
    await auth.deleteUser(userId);
  } catch (error) {
    // A network error can arrive after Auth actually deleted the account. Only
    // restore access after confirming Auth still has it; otherwise keep a durable
    // recovery marker and all workers stopped.
    let exists: boolean | undefined;
    try {
      exists = await auth.userExists?.(userId);
    } catch {
      /* Recovery remains pending. */
    }
    if (exists === true) await repo.restoreActive(userId);
    if (exists !== false) throw error;
  }
  await repo.confirmAuthDeleted(userId);
  await repo.deleteAccountData(userId);
  return { deleted: true };
}
export async function recoverAccountDeletion(
  repo: Repository,
  auth: AuthProvider,
  userId: string,
) {
  const pending = (
    await repo.db.query(
      "SELECT d.status FROM aw_account_deletions d JOIN ff_users u ON u.id=d.user_id WHERE d.user_id=$1 AND u.status='deleting'",
      [userId],
    )
  )[0];
  if (!pending)
    throw new DomainError(
      'PRIVACY_RECOVERY_UNAVAILABLE',
      'No pending account deletion.',
      409,
    );
  if (pending.status !== 'auth_deleted') {
    auth.assertDeletionConfigured?.();
    if (!auth.userExists)
      throw new DomainError(
        'PRIVACY_AUTH_CHECK_FAILED',
        'Auth verification required.',
        503,
      );
    if (await auth.userExists(userId)) await auth.deleteUser(userId);
    await repo.confirmAuthDeleted(userId);
  }
  await repo.deleteAccountData(userId);
  return { deleted: true };
}
