import { DomainError } from './errors';

// Provider-independent billing domain (ADR-010). Pure functions only: no I/O,
// no clock, no provider SDK. Every unknown or unverifiable input resolves to
// "no entitlement" (fail closed).

export const billingOfferVersions = ['launch_v1', 'standard_v1'] as const;
export type BillingOfferVersion = (typeof billingOfferVersions)[number];

export type BillingOfferConfig = Readonly<{
  discountedCycles: number;
  discountedChapters: number;
  standardChapters: number;
}>;

// Owner decision 2026-10-30: 5 chapters in the first 3 discounted cycles, then 8.
// Numbers are configuration, refined after measurements.
export const defaultBillingOfferConfig: BillingOfferConfig = Object.freeze({
  discountedCycles: 3,
  discountedChapters: 5,
  standardChapters: 8,
});

export function validateBillingOfferConfig(
  raw: BillingOfferConfig,
): BillingOfferConfig {
  const ok = (n: unknown, min: number) =>
    typeof n === 'number' && Number.isInteger(n) && n >= min && n <= 100;
  if (
    !ok(raw?.discountedCycles, 0) ||
    !ok(raw.discountedChapters, 0) ||
    !ok(raw.standardChapters, 0)
  )
    throw Error('Invalid billing offer configuration');
  return Object.freeze({
    discountedCycles: raw.discountedCycles,
    discountedChapters: raw.discountedChapters,
    standardChapters: raw.standardChapters,
  });
}

// `cycleIndex` is 1-based and comes from our own paid-invoice counter, never
// from the provider coupon object (which disappears when the coupon expires).
export function offerVersionForCycle(
  cycleIndex: number,
  discounted: boolean,
  config: BillingOfferConfig = defaultBillingOfferConfig,
): BillingOfferVersion {
  return discounted && cycleIndex <= config.discountedCycles
    ? 'launch_v1'
    : 'standard_v1';
}

export function chapterAllowanceForCycle(
  cycleIndex: number,
  discounted: boolean,
  config: BillingOfferConfig = defaultBillingOfferConfig,
): number {
  if (!Number.isInteger(cycleIndex) || cycleIndex < 1) return 0;
  return offerVersionForCycle(cycleIndex, discounted, config) === 'launch_v1'
    ? config.discountedChapters
    : config.standardChapters;
}

const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const FOUNDER_DISCOUNT_MAX_ACCOUNTS = 10;

// The designated accounts are user UUIDs only (never e-mail addresses).
export function validateDiscountedUserIds(raw: readonly string[]): string[] {
  if (
    !Array.isArray(raw) ||
    raw.length > FOUNDER_DISCOUNT_MAX_ACCOUNTS ||
    raw.some((id) => typeof id !== 'string' || !uuid.test(id))
  )
    throw Error('Invalid billing discount configuration');
  const ids = raw.map((id) => id.toLowerCase());
  if (new Set(ids).size !== ids.length)
    throw Error('Invalid billing discount configuration');
  return ids;
}

// The coupon is attached server-side only. The provider-side redemption cap is
// a safety net, not the identity check.
export function mayAttachFounderDiscount(
  designated: readonly string[],
  userId: string,
  alreadyRedeemed: boolean,
): boolean {
  return (
    !alreadyRedeemed &&
    typeof userId === 'string' &&
    designated.includes(userId.toLowerCase())
  );
}

export const billingStatuses = [
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
] as const;
export type BillingStatus = (typeof billingStatuses)[number];

export type BillingRevocation = 'refund' | 'dispute';

export type BillingSubscription = Readonly<{
  subscriptionId: string;
  customerId: string;
  userId: string | null;
  status: BillingStatus;
  periodStart: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  discounted: boolean;
  paidInvoiceIds: readonly string[];
  revoked: BillingRevocation | null;
  lastStateEventCreated: number;
}>;

export type BillingEvent =
  | Readonly<{
      type: 'subscription_synced';
      eventId: string;
      created: number;
      subscriptionId: string;
      customerId: string;
      userId: string | null;
      status: BillingStatus;
      periodStart: string | null;
      periodEnd: string | null;
      cancelAtPeriodEnd: boolean;
      discounted: boolean;
    }>
  | Readonly<{
      type: 'subscription_deleted';
      eventId: string;
      created: number;
      subscriptionId: string;
    }>
  | Readonly<{
      type: 'invoice_paid';
      eventId: string;
      created: number;
      subscriptionId: string;
      invoiceId: string;
      billingReason: string;
      periodStart: string;
      periodEnd: string;
    }>
  | Readonly<{
      type: 'revocation';
      eventId: string;
      created: number;
      reason: BillingRevocation;
      subscriptionId: string | null;
      customerId: string | null;
      paymentIntentId: string | null;
      chargeId: string | null;
      invoiceId: string | null;
    }>;

export type ChapterGrant = Readonly<{
  key: string; // paid invoice id: one grant per invoice
  cycleIndex: number;
  amount: number;
  expiresAt: string;
}>;

export type BillingTransition = Readonly<{
  next: BillingSubscription | null;
  grant: ChapterGrant | null;
  revokeGrants: boolean;
  outcome: 'applied' | 'duplicate' | 'stale' | 'ignored';
}>;

const grantingReasons = new Set(['subscription_create', 'subscription_cycle']);
const unchanged = (
  prev: BillingSubscription | null,
  outcome: BillingTransition['outcome'],
): BillingTransition => ({
  next: prev,
  grant: null,
  revokeGrants: false,
  outcome,
});

// Order- and replay-tolerant: state fields follow only newer events, a revoked
// subscription is never reopened by a later event, and a grant is produced at
// most once per paid invoice id.
export function applyBillingEvent(
  prev: BillingSubscription | null,
  event: BillingEvent,
  config: BillingOfferConfig = defaultBillingOfferConfig,
): BillingTransition {
  if (event.type === 'subscription_synced') {
    if (prev && prev.subscriptionId !== event.subscriptionId)
      return unchanged(prev, 'ignored');
    if (prev && event.created < prev.lastStateEventCreated)
      return unchanged(prev, 'stale');
    return {
      next: {
        subscriptionId: event.subscriptionId,
        customerId: event.customerId,
        userId: prev?.userId ?? event.userId,
        status: event.status,
        periodStart: event.periodStart,
        periodEnd: event.periodEnd,
        cancelAtPeriodEnd: event.cancelAtPeriodEnd,
        // Once designated at checkout the flag cannot be flipped by a later event.
        discounted: prev ? prev.discounted : event.discounted,
        paidInvoiceIds: prev?.paidInvoiceIds ?? [],
        revoked: prev?.revoked ?? null,
        lastStateEventCreated: event.created,
      },
      grant: null,
      revokeGrants: false,
      outcome: 'applied',
    };
  }
  if (!prev) return unchanged(prev, 'ignored');
  if (event.type === 'subscription_deleted') {
    if (prev.subscriptionId !== event.subscriptionId)
      return unchanged(prev, 'ignored');
    if (event.created < prev.lastStateEventCreated)
      return unchanged(prev, 'stale');
    return {
      next: {
        ...prev,
        status: 'canceled',
        cancelAtPeriodEnd: false,
        lastStateEventCreated: event.created,
      },
      grant: null,
      revokeGrants: false,
      outcome: 'applied',
    };
  }
  if (event.type === 'revocation') {
    const matches =
      (event.subscriptionId && event.subscriptionId === prev.subscriptionId) ||
      (!event.subscriptionId &&
        event.customerId &&
        event.customerId === prev.customerId);
    if (!matches) return unchanged(prev, 'ignored');
    if (prev.revoked) return unchanged(prev, 'duplicate');
    return {
      next: { ...prev, revoked: event.reason },
      grant: null,
      revokeGrants: true,
      outcome: 'applied',
    };
  }
  // invoice_paid
  if (prev.subscriptionId !== event.subscriptionId)
    return unchanged(prev, 'ignored');
  if (prev.paidInvoiceIds.includes(event.invoiceId))
    return unchanged(prev, 'duplicate');
  if (!grantingReasons.has(event.billingReason))
    return unchanged(prev, 'ignored');
  const cycleIndex = prev.paidInvoiceIds.length + 1;
  const next = {
    ...prev,
    paidInvoiceIds: [...prev.paidInvoiceIds, event.invoiceId],
  };
  // A revoked subscription records the paid invoice but receives no keret.
  const amount = prev.revoked
    ? 0
    : chapterAllowanceForCycle(cycleIndex, prev.discounted, config);
  return {
    next,
    grant: amount
      ? {
          key: event.invoiceId,
          cycleIndex,
          amount,
          expiresAt: event.periodEnd,
        }
      : null,
    revokeGrants: false,
    outcome: 'applied',
  };
}

export type EntitlementConfig = Readonly<{
  // Renewal webhook can lag the period end; beyond this a missing renewal
  // lapses the access (fail closed) until the provider state is reconciled.
  renewalSlackMs: number;
  // Hard upper bound for past_due access while the provider retries payment.
  pastDueMaxMs: number;
}>;
export const defaultEntitlementConfig: EntitlementConfig = Object.freeze({
  renewalSlackMs: 24 * 3_600_000,
  pastDueMaxMs: 14 * 24 * 3_600_000,
});

export type EntitlementState =
  'none' | 'active' | 'canceling' | 'past_due' | 'ended' | 'revoked';
export type Entitlement = Readonly<{
  state: EntitlementState;
  canGenerate: boolean;
}>;

const deny = (state: EntitlementState): Entitlement => ({
  state,
  canGenerate: false,
});

// Only generation is gated. Reading, export and deletion never depend on this.
export function deriveEntitlement(
  sub: BillingSubscription | null,
  now: Date,
  config: EntitlementConfig = defaultEntitlementConfig,
): Entitlement {
  if (!sub) return deny('none');
  if (sub.revoked) return deny('revoked');
  const end = sub.periodEnd ? Date.parse(sub.periodEnd) : Number.NaN;
  const t = now.getTime();
  if (!Number.isFinite(end) || !Number.isFinite(t)) return deny('none');
  switch (sub.status) {
    case 'active':
    case 'trialing':
      if (t > end + config.renewalSlackMs) return deny('ended');
      return {
        state: sub.cancelAtPeriodEnd ? 'canceling' : 'active',
        canGenerate: true,
      };
    case 'past_due':
      return t <= end + config.pastDueMaxMs
        ? { state: 'past_due', canGenerate: true }
        : deny('ended');
    case 'canceled':
      return deny('ended');
    default:
      return deny('none');
  }
}

// ---- chapter balance ledger (reference model for the DB implementation) ----

export type ChapterBucket = 'paid' | 'taster';
export type ChapterReservation = Readonly<{
  key: string;
  bucket: ChapterBucket;
  grantKey: string | null;
  state: 'reserved' | 'consumed' | 'released';
}>;
export type ChapterLedger = Readonly<{
  grants: readonly (ChapterGrant & { revoked: boolean })[];
  reservations: readonly ChapterReservation[];
  tasterAmount: number;
}>;
export const FREE_TASTER_CHAPTERS = 1;
export const emptyChapterLedger: ChapterLedger = Object.freeze({
  grants: [],
  reservations: [],
  tasterAmount: FREE_TASTER_CHAPTERS,
});

export function addChapterGrant(
  ledger: ChapterLedger,
  grant: ChapterGrant,
): ChapterLedger {
  if (ledger.grants.some((g) => g.key === grant.key)) return ledger;
  return {
    ...ledger,
    grants: [...ledger.grants, { ...grant, revoked: false }],
  };
}

// Unspent keret is zeroed; chapters already reserved or consumed stay.
export function revokeUnspentGrants(ledger: ChapterLedger): ChapterLedger {
  return {
    ...ledger,
    grants: ledger.grants.map((g) => ({ ...g, revoked: true })),
  };
}

const held = (r: ChapterReservation) => r.state !== 'released';

function remainingOfGrant(ledger: ChapterLedger, key: string, now: Date) {
  const g = ledger.grants.find((x) => x.key === key);
  if (!g || g.revoked || Date.parse(g.expiresAt) <= now.getTime()) return 0;
  return (
    g.amount -
    ledger.reservations.filter((r) => r.grantKey === key && held(r)).length
  );
}

export function paidChaptersAvailable(ledger: ChapterLedger, now: Date) {
  return ledger.grants.reduce(
    (sum, g) => sum + Math.max(0, remainingOfGrant(ledger, g.key, now)),
    0,
  );
}

export function tasterChaptersAvailable(ledger: ChapterLedger) {
  return Math.max(
    0,
    ledger.tasterAmount -
      ledger.reservations.filter((r) => r.bucket === 'taster' && held(r))
        .length,
  );
}

export type ReserveResult =
  | Readonly<{
      ok: true;
      ledger: ChapterLedger;
      reservation: ChapterReservation;
      created: boolean;
    }>
  | Readonly<{
      ok: false;
      reason: 'no_entitlement' | 'allowance_exhausted' | 'invalid_key';
    }>;

// Idempotent per request key: a retry of the same request returns the same
// reservation (reserved or already consumed) and never debits twice. A key whose
// attempt was released after a failure may be reserved again.
export function reserveChapter(
  ledger: ChapterLedger,
  key: string,
  entitlement: Entitlement,
  now: Date,
): ReserveResult {
  if (typeof key !== 'string' || !key || key.length > 200)
    return { ok: false, reason: 'invalid_key' };
  const existing = ledger.reservations.find((r) => r.key === key && held(r));
  if (existing)
    return { ok: true, ledger, reservation: existing, created: false };
  let reservation: ChapterReservation | null = null;
  if (entitlement.canGenerate) {
    const grant = [...ledger.grants]
      .filter((g) => remainingOfGrant(ledger, g.key, now) > 0)
      .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt))[0];
    if (!grant) return { ok: false, reason: 'allowance_exhausted' };
    reservation = {
      key,
      bucket: 'paid',
      grantKey: grant.key,
      state: 'reserved',
    };
  } else if (tasterChaptersAvailable(ledger) > 0) {
    reservation = { key, bucket: 'taster', grantKey: null, state: 'reserved' };
  } else return { ok: false, reason: 'no_entitlement' };
  return {
    ok: true,
    ledger: {
      ...ledger,
      reservations: [
        ...ledger.reservations.filter((r) => r.key !== key),
        reservation,
      ],
    },
    reservation,
    created: true,
  };
}

function settle(
  ledger: ChapterLedger,
  key: string,
  from: 'reserved',
  to: 'consumed' | 'released',
): ChapterLedger {
  const reservation = ledger.reservations.find((r) => r.key === key && held(r));
  if (!reservation)
    throw new DomainError(
      'BILLING_RESERVATION_MISSING',
      'No reservation.',
      409,
    );
  if (reservation.state !== from) return ledger; // already settled: idempotent
  return {
    ...ledger,
    reservations: ledger.reservations.map((r) =>
      r === reservation ? { ...r, state: to } : r,
    ),
  };
}

// Only a new chapter that was durably saved consumes keret.
export const consumeChapter = (ledger: ChapterLedger, key: string) =>
  settle(ledger, key, 'reserved', 'consumed');
// Failure, cancellation or rejection hands the reservation back.
export function releaseChapter(
  ledger: ChapterLedger,
  key: string,
): ChapterLedger {
  const reservation = ledger.reservations.find((r) => r.key === key && held(r));
  if (!reservation) return ledger;
  if (reservation.state === 'consumed') return ledger;
  return settle(ledger, key, 'reserved', 'released');
}
