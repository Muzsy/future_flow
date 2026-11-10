import {
  REFERRAL_GRANT_EXPIRES_AT,
  REFERRAL_GIFT_CHAPTERS,
  defaultEntitlementConfig,
  referralEligibleSubscription,
  referralGrantKey,
  type EntitlementConfig,
} from '@future-flow/core';
import { billingTx } from './billing';
import {
  ServiceAccessRepository,
  type ReferredAdmissionOutcome,
} from './service-access';
import type { Database } from './index';

// Subscriber referral persistence. There is no table of its own: the gift is
// one ordinary grant row keyed `referral:<inviter id>` (the primary key makes
// "at most one per inviter" a database fact, and a deleted invitee cannot
// reopen the slot). The inviter's row is removed with the account (cascade).

type Options = Readonly<{ entitlement?: EntitlementConfig; now?: Date }>;

async function inviterAdmitted(tx: Database, inviterId: string) {
  const rows = await tx.query(
    `SELECT 1 FROM aw_service_admissions a JOIN ff_users u ON u.id=a.user_id
     WHERE a.user_id=$1 AND a.state='active' AND u.status='active'`,
    [inviterId],
  );
  return rows.length === 1;
}

// Read-only: may this inviter still hand out an invite? (eligible subscriber,
// admitted and active, gift not yet redeemed). Used for the pre-admission
// status route and as a cheap pre-check; the redemption re-checks under lock.
export async function referralInviteState(
  db: Database,
  inviterId: string,
  options: Options = {},
): Promise<'none' | 'available' | 'redeemed' | 'revoked'> {
  const bt = billingTx(db);
  const ledger = await bt.loadLedger(inviterId);
  const grant = ledger.grants.find(
    (g) => g.key === referralGrantKey(inviterId),
  );
  if (grant) return grant.revoked ? 'revoked' : 'redeemed';
  const subs = await bt.listSubscriptions(inviterId);
  const now = options.now ?? new Date();
  return referralEligibleSubscription(
    subs,
    now,
    options.entitlement ?? defaultEntitlementConfig,
  ) && (await inviterAdmitted(db, inviterId))
    ? 'available'
    : 'none';
}

// Inside an open transaction: take the inviter's billing lock (the first lock of
// every billing write, so a concurrent refund webhook and this redemption
// serialise instead of deadlocking), re-check eligibility and insert the gift.
// False when the inviter is not eligible or the gift was already redeemed.
export async function creditReferralGift(
  tx: Database,
  inviterId: string,
  options: Options = {},
): Promise<boolean> {
  const bt = billingTx(tx);
  await bt.lockUser(inviterId);
  const subscription = referralEligibleSubscription(
    await bt.listSubscriptions(inviterId),
    options.now ?? new Date(),
    options.entitlement ?? defaultEntitlementConfig,
  );
  if (!subscription || !(await inviterAdmitted(tx, inviterId))) return false;
  const inserted = await tx.query(
    `INSERT INTO aw_billing_grants(key,subscription_id,user_id,cycle_index,amount,expires_at)
     VALUES($1,$2,$3,1,$4,$5) ON CONFLICT(key) DO NOTHING RETURNING key`,
    [
      referralGrantKey(inviterId),
      subscription.subscriptionId,
      inviterId,
      REFERRAL_GIFT_CHAPTERS,
      REFERRAL_GRANT_EXPIRES_AT,
    ],
  );
  return inserted.length === 1;
}

export function admitReferredAccount(
  db: Database,
  verifiedUserId: unknown,
  termsVersion: unknown,
  inviterUserId: string,
  options: Options = {},
): Promise<ReferredAdmissionOutcome> {
  return new ServiceAccessRepository(db).admitReferredAccount(
    verifiedUserId,
    termsVersion,
    inviterUserId,
    (tx) => creditReferralGift(tx, inviterUserId, options),
  );
}
