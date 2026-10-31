import { Repository } from '@future-flow/database';
import { DomainError } from '@future-flow/core';
import type { AuthProvider } from './auth';

// Optional billing hook (ADR-010). It runs after the account is marked
// deleting (so no new billing state can attach to it) and before the Auth user
// or any data is removed. A failure keeps the deletion pending and retryable:
// no account data disappears while a paid subscription may still be charging.
export type AccountDeletionBilling = {
  cancelSubscriptions(userId: string): Promise<unknown>;
};

export async function deleteAccount(
  repo: Repository,
  auth: AuthProvider,
  userId: string,
  billing?: AccountDeletionBilling,
) {
  auth.assertDeletionConfigured?.();
  await repo.markDeleting(userId);
  await billing?.cancelSubscriptions(userId);
  try {
    await auth.deleteUser(userId);
  } catch (error) {
    // An existence check is only a point-in-time observation: a timed-out Auth
    // request can finish immediately afterwards. Keep the requested deletion and
    // its durable recovery marker until Auth removal is confirmed. Restoring an
    // active account here could strand its data after that late Auth completion.
    let exists: boolean | undefined;
    try {
      exists = await auth.userExists?.(userId);
    } catch {
      /* Recovery remains pending. */
    }
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
  billing?: AccountDeletionBilling,
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
  await billing?.cancelSubscriptions(userId);
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
