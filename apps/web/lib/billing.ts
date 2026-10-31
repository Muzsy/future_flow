// Pure helpers of the subscription page (ADR-010). The server is the only source
// of truth for entitlement; this file only decides what the page shows.

export type BillingState =
  'none' | 'active' | 'canceling' | 'past_due' | 'ended' | 'revoked';

export type BillingStatus = {
  state: BillingState;
  canGenerate: boolean;
  paidChaptersAvailable: number;
  tasterChaptersAvailable: number;
};

export type CheckoutResult = 'success' | 'cancel' | null;

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

// The Checkout URL comes from our API, but is only ever followed when it is an
// https address on a Stripe host.
export function safeCheckoutUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'stripe.com' || url.hostname.endsWith('.stripe.com'))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
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
    Number.isInteger(v.tasterChaptersAvailable)
  );
}
