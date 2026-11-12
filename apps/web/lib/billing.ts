// Pure helpers of the subscription page (ADR-010). The server is the only source
// of truth for entitlement; this file only decides what the page shows.

export type BillingState =
  'none' | 'active' | 'canceling' | 'past_due' | 'ended' | 'revoked';

export type BillingStatus = {
  state: BillingState;
  canGenerate: boolean;
  paidChaptersAvailable: number;
  tasterChaptersAvailable: number;
  // Subscriber invite (ADR-011): the gift chapter and the state of the one invite.
  referralChaptersAvailable?: number;
  referralInvite?: {
    eligible: boolean;
    state: 'none' | 'redeemed' | 'revoked';
  };
};

// What the invite card shows: the create button, the outcome of the one invite,
// or nothing. The API decides eligibility; this only reads it (fail closed).
export function referralCard(
  status: BillingStatus,
): 'create' | 'redeemed' | 'revoked' | null {
  const invite = status.referralInvite;
  if (!invite) return null;
  if (invite.state === 'redeemed' || invite.state === 'revoked')
    return invite.state;
  return invite.eligible ? 'create' : null;
}

export type CheckoutResult = 'success' | 'cancel' | null;

export type AccountBillingStatus = Readonly<{
  userId: string;
  status: BillingStatus;
}>;
export function billingStatusForAccount(
  snapshot: AccountBillingStatus | null,
  userId: string | null,
): BillingStatus | null {
  return userId && snapshot?.userId === userId ? snapshot.status : null;
}

export function checkoutResult(search: string): CheckoutResult {
  const value = new URLSearchParams(search).get('checkout');
  return value === 'success' || value === 'cancel' ? value : null;
}

// States in which a new subscription can be started. A subscription that is only
// ending (canceling) or failing to renew (past_due) must be managed, not bought
// again: a second checkout would create a second, parallel subscription.
export function canStartCheckout(state: BillingState): boolean {
  return state === 'none' || state === 'ended' || state === 'revoked';
}

// After a successful checkout the subscription only appears once Stripe's webhook
// has been processed, usually within seconds. Poll the status for a short while.
export const POLL_INTERVAL_MS = 3_000;
export const POLL_MAX_ATTEMPTS = 20;

export function shouldPoll(
  result: CheckoutResult,
  status: BillingStatus | null,
  attempts: number,
): boolean {
  return (
    result === 'success' &&
    attempts < POLL_MAX_ATTEMPTS &&
    (!status || canStartCheckout(status.state))
  );
}

// The Checkout URL comes from our API, but is only ever followed when it is a
// plain https address on a Stripe host: no credentials, no explicit port.
export function safeCheckoutUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === 'stripe.com' || url.hostname.endsWith('.stripe.com'))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

// A payment may be offered only when no live subscription exists AND the visitor
// is not coming back from a checkout. After `?checkout=success` the money may
// already have been taken while the webhook is still late, so a second payment
// button there could charge the customer twice; the page then only informs and
// offers a refresh. A clean address (no `?checkout`) offers payment again.
export function offerCheckout(
  result: CheckoutResult,
  status: BillingStatus,
): boolean {
  return result !== 'success' && canStartCheckout(status.state);
}

export type BillingView =
  | {
      kind:
        | 'not-configured'
        | 'auth-loading'
        | 'sign-in'
        | 'unavailable'
        | 'loading'
        | 'error';
    }
  | {
      kind: 'ready';
      status: BillingStatus;
      banner: 'cancelled' | 'activating' | 'slow' | null;
      offerCheckout: boolean;
      // Waiting for the webhook: inform and let the visitor refresh.
      offerRefresh: boolean;
      // A live subscription is managed outside this page.
      manage: boolean;
    };

export function billingView(input: {
  authConfigured: boolean;
  authReady: boolean;
  userId: string | null;
  unavailable: boolean;
  status: BillingStatus | null;
  failed: boolean;
  result: CheckoutResult;
  attempts: number;
}): BillingView {
  if (!input.authConfigured) return { kind: 'not-configured' };
  if (!input.authReady) return { kind: 'auth-loading' };
  if (!input.userId) return { kind: 'sign-in' };
  if (input.unavailable) return { kind: 'unavailable' };
  if (!input.status) return { kind: input.failed ? 'error' : 'loading' };
  const { status, result, attempts } = input;
  const waiting = result === 'success' && canStartCheckout(status.state);
  const polling = shouldPoll(result, status, attempts);
  return {
    kind: 'ready',
    status,
    banner:
      result === 'cancel'
        ? 'cancelled'
        : waiting
          ? polling
            ? 'activating'
            : 'slow'
          : null,
    offerCheckout: offerCheckout(result, status),
    offerRefresh: waiting,
    manage: !canStartCheckout(status.state),
  };
}

export function isBillingStatus(value: unknown): value is BillingStatus {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    ['none', 'active', 'canceling', 'past_due', 'ended', 'revoked'].includes(
      String(v.state),
    ) &&
    typeof v.canGenerate === 'boolean' &&
    Number.isInteger(v.paidChaptersAvailable) &&
    Number.isInteger(v.tasterChaptersAvailable) &&
    (v.referralChaptersAvailable === undefined ||
      Number.isInteger(v.referralChaptersAvailable)) &&
    (v.referralInvite === undefined || isReferralInvite(v.referralInvite))
  );
}

function isReferralInvite(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.eligible === 'boolean' &&
    ['none', 'redeemed', 'revoked'].includes(String(v.state))
  );
}

// Resolve only after the response and a fresh current-account read: signing out
// or changing accounts while the request is pending cannot open an old portal.
export async function billingPortalDestination(
  expectedUserId: string,
  request: () => Promise<{ url?: unknown }>,
  currentUserId: () => Promise<string | null>,
): Promise<string | null> {
  const body = await request();
  if ((await currentUserId()) !== expectedUserId) return null;
  const url = safeCheckoutUrl(body.url);
  return url && new URL(url).hostname === 'billing.stripe.com' ? url : null;
}
