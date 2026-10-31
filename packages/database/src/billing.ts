import {
  FREE_TASTER_CHAPTERS,
  type BillingStore,
  type BillingSubscription,
  type BillingTx,
  type ChapterBucket,
  type ChapterLedger,
  type ChapterReservation,
} from '@future-flow/core';
import type { Database } from './index';

// SQL store for the billing service (ADR-010). Lock order in every operation is
// user advisory lock -> subscription row, matching the service contract, so two
// webhooks or a webhook and a reservation of one account serialise instead of
// deadlocking. Nothing here is reachable until billing is explicitly enabled.

type SubscriptionRow = {
  subscription_id: string;
  customer_id: string;
  user_id: string;
  status: BillingSubscription['status'];
  period_start: Date | string | null;
  period_end: Date | string | null;
  cancel_at_period_end: boolean;
  discounted: boolean;
  revoked: BillingSubscription['revoked'];
  last_state_event_created: string | number;
  paid_invoice_ids: string[];
  refunded_invoice_ids: string[];
  reconcile_required: boolean;
  cancel_pending: boolean;
};

const iso = (value: Date | string | null) =>
  value === null ? null : new Date(value).toISOString();
const subscriptionColumns =
  'subscription_id,customer_id,user_id,status,period_start,period_end,cancel_at_period_end,discounted,revoked,last_state_event_created,paid_invoice_ids,refunded_invoice_ids,reconcile_required,cancel_pending';

function subscription(row: SubscriptionRow): BillingSubscription {
  return {
    subscriptionId: row.subscription_id,
    customerId: row.customer_id,
    userId: row.user_id,
    status: row.status,
    periodStart: iso(row.period_start),
    periodEnd: iso(row.period_end),
    cancelAtPeriodEnd: row.cancel_at_period_end,
    discounted: row.discounted,
    paidInvoiceIds: row.paid_invoice_ids,
    refundedInvoiceIds: row.refunded_invoice_ids,
    revoked: row.revoked,
    lastStateEventCreated: Number(row.last_state_event_created),
    reconcileRequired: row.reconcile_required,
    cancelPending: row.cancel_pending,
  };
}

function billingTx(db: Database): BillingTx {
  return {
    lockUser: async (userId) => {
      await db.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('alterward-billing:'||$1::text,0))",
        [userId],
      );
    },
    ownerOf: async ({ subscriptionId, customerId }) => {
      if (subscriptionId) {
        const [row] = await db.query<{ user_id: string }>(
          'SELECT user_id FROM aw_billing_subscriptions WHERE subscription_id=$1',
          [subscriptionId],
        );
        return row?.user_id ?? null;
      }
      if (!customerId) return null;
      const [row] = await db.query<{ user_id: string }>(
        'SELECT user_id FROM aw_billing_subscriptions WHERE customer_id=$1 ORDER BY last_state_event_created DESC,subscription_id LIMIT 1',
        [customerId],
      );
      return row?.user_id ?? null;
    },
    hasEvent: async (eventId) =>
      (
        await db.query(
          'SELECT 1 FROM aw_billing_events WHERE event_id=$1 LIMIT 1',
          [eventId],
        )
      ).length > 0,
    // A plain INSERT: a second concurrent recording of one event id fails on
    // the primary key, rolls its transaction back and is redelivered as a
    // duplicate. The event is recorded in the same transaction as its effect.
    recordEvent: async (eventId, eventType, subscriptionId, outcome) => {
      await db.query(
        'INSERT INTO aw_billing_events(event_id,subscription_id,event_type,outcome) VALUES($1,$2,$3,$4)',
        [eventId, subscriptionId, eventType, outcome],
      );
    },
    findSubscription: async ({ subscriptionId, customerId }) => {
      if (subscriptionId) {
        const [row] = await db.query<SubscriptionRow>(
          `SELECT ${subscriptionColumns} FROM aw_billing_subscriptions WHERE subscription_id=$1 FOR UPDATE`,
          [subscriptionId],
        );
        return row ? subscription(row) : null;
      }
      if (!customerId) return null;
      const [row] = await db.query<SubscriptionRow>(
        `SELECT ${subscriptionColumns} FROM aw_billing_subscriptions WHERE customer_id=$1 ORDER BY last_state_event_created DESC,subscription_id LIMIT 1 FOR UPDATE`,
        [customerId],
      );
      return row ? subscription(row) : null;
    },
    listSubscriptions: async (userId) =>
      (
        await db.query<SubscriptionRow>(
          `SELECT ${subscriptionColumns} FROM aw_billing_subscriptions WHERE user_id=$1 ORDER BY subscription_id`,
          [userId],
        )
      ).map(subscription),
    listCancelPending: async (limit) =>
      (
        await db.query<{ subscription_id: string }>(
          'SELECT subscription_id FROM aw_billing_subscriptions WHERE cancel_pending ORDER BY updated_at,subscription_id LIMIT $1',
          [Math.max(1, Math.min(500, Math.trunc(limit)))],
        )
      ).map((row) => row.subscription_id),
    saveSubscription: async (sub) => {
      // The owner never changes: a conflicting row of another account matches
      // nothing and the save fails closed.
      const saved = await db.query(
        `INSERT INTO aw_billing_subscriptions(${subscriptionColumns})
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT(subscription_id) DO UPDATE SET customer_id=EXCLUDED.customer_id,status=EXCLUDED.status,
           period_start=EXCLUDED.period_start,period_end=EXCLUDED.period_end,cancel_at_period_end=EXCLUDED.cancel_at_period_end,
           discounted=EXCLUDED.discounted,revoked=EXCLUDED.revoked,last_state_event_created=EXCLUDED.last_state_event_created,
           paid_invoice_ids=EXCLUDED.paid_invoice_ids,refunded_invoice_ids=EXCLUDED.refunded_invoice_ids,
           reconcile_required=EXCLUDED.reconcile_required,cancel_pending=EXCLUDED.cancel_pending,updated_at=now()
         WHERE aw_billing_subscriptions.user_id=EXCLUDED.user_id RETURNING subscription_id`,
        [
          sub.subscriptionId,
          sub.customerId,
          sub.userId,
          sub.status,
          sub.periodStart,
          sub.periodEnd,
          sub.cancelAtPeriodEnd,
          sub.discounted,
          sub.revoked,
          sub.lastStateEventCreated,
          [...sub.paidInvoiceIds],
          [...sub.refundedInvoiceIds],
          sub.reconcileRequired,
          sub.cancelPending,
        ],
      );
      if (saved.length !== 1)
        throw Error('Billing subscription belongs to another account');
    },
    insertGrant: async (grant, owner) => {
      await db.query(
        'INSERT INTO aw_billing_grants(key,subscription_id,user_id,cycle_index,amount,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
        [
          grant.key,
          owner.subscriptionId,
          owner.userId,
          grant.cycleIndex,
          grant.amount,
          grant.expiresAt,
        ],
      );
    },
    revokeGrants: async (keys) => {
      if (keys.length)
        await db.query(
          'UPDATE aw_billing_grants SET revoked=true WHERE key=ANY($1::text[])',
          [[...keys]],
        );
    },
    loadLedger: async (userId): Promise<ChapterLedger> => {
      const grants = await db.query<{
        key: string;
        cycle_index: number;
        amount: number;
        expires_at: Date | string;
        revoked: boolean;
      }>(
        'SELECT key,cycle_index,amount,expires_at,revoked FROM aw_billing_grants WHERE user_id=$1 ORDER BY created_at,key',
        [userId],
      );
      const reservations = await db.query<{
        key: string;
        bucket: ChapterBucket;
        grant_key: string | null;
        state: ChapterReservation['state'];
      }>(
        'SELECT key,bucket,grant_key,state FROM aw_billing_reservations WHERE user_id=$1 ORDER BY created_at,key',
        [userId],
      );
      return {
        grants: grants.map((g) => ({
          key: g.key,
          cycleIndex: g.cycle_index,
          amount: g.amount,
          expiresAt: new Date(g.expires_at).toISOString(),
          revoked: g.revoked,
        })),
        reservations: reservations.map((r) => ({
          key: r.key,
          bucket: r.bucket,
          grantKey: r.grant_key,
          state: r.state,
        })),
        tasterAmount: FREE_TASTER_CHAPTERS,
      };
    },
    saveReservation: async (userId, reservation) => {
      await db.query(
        `INSERT INTO aw_billing_reservations(user_id,key,bucket,grant_key,state) VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(user_id,key) DO UPDATE SET bucket=EXCLUDED.bucket,grant_key=EXCLUDED.grant_key,state=EXCLUDED.state,updated_at=now()`,
        [
          userId,
          reservation.key,
          reservation.bucket,
          reservation.grantKey,
          reservation.state,
        ],
      );
    },
    hasRedeemedFounderDiscount: async (userId) =>
      (
        await db.query(
          'SELECT 1 FROM aw_billing_subscriptions WHERE user_id=$1 AND discounted LIMIT 1',
          [userId],
        )
      ).length > 0,
    // Only an active account may gain billing state; a deleting one may not.
    userExists: async (userId) =>
      (
        await db.query(
          "SELECT 1 FROM ff_users WHERE id=$1 AND status='active' LIMIT 1",
          [userId],
        )
      ).length > 0,
  };
}

export function createBillingStore(db: Database): BillingStore {
  return {
    transaction: (run) => db.transaction((tx) => run(billingTx(tx))),
  };
}

// Hands back chapter reservations whose generation never settled (a crash
// between reserve and consume/release, or a restore). A consume racing the
// sweep is safe: both take the user lock, and the sweep only touches rows that
// are still reserved. `olderThanMs` must exceed the longest generation.
export async function releaseStaleBillingReservations(
  db: Database,
  options: { olderThanMs: number; now?: Date },
) {
  if (!Number.isFinite(options.olderThanMs) || options.olderThanMs < 60_000)
    throw Error('A reservation timeout of at least one minute is required');
  const cutoff = new Date(
    (options.now ?? new Date()).getTime() - options.olderThanMs,
  );
  const users = await db.query<{ user_id: string }>(
    "SELECT DISTINCT user_id FROM aw_billing_reservations WHERE state='reserved' AND created_at<$1 ORDER BY user_id LIMIT 200",
    [cutoff],
  );
  let released = 0;
  for (const { user_id } of users)
    released += await db.transaction(async (tx) => {
      await billingTx(tx).lockUser(user_id);
      return (
        await tx.query(
          "UPDATE aw_billing_reservations SET state='released',updated_at=now() WHERE user_id=$1 AND state='reserved' AND created_at<$2 RETURNING key",
          [user_id, cutoff],
        )
      ).length;
    });
  return { released };
}
