import {
  DomainError,
  cancelProviderSubscriptionsForUser,
  createStripeProvider,
  billingConfigFromEnv,
  redactBillingConfig,
  type BillingAlert,
  type BillingEnvConfig,
  type BillingProvider,
  type BillingStore,
} from '@future-flow/core';
import {
  createBillingStore,
  hasLiveBillingSubscription,
  type Database,
} from '@future-flow/database';
import type { AccountDeletionBilling } from './account-deletion';

// Billing runtime without any HTTP decorators, so scripts that run under plain
// tsx (for example `privacy:recover`) can import it. The controller lives in
// ./billing.
// Stripe billing surface (ADR-010). Nothing here is reachable unless billing is
// explicitly and completely configured (BILLING_ENABLED=true plus valid keys):
// otherwise the routes answer 404 and the application behaves exactly as before.

export type BillingRuntime = Readonly<{
  config: BillingEnvConfig;
  store: BillingStore;
  provider: BillingProvider | null;
  db: Database;
  alert: (alert: BillingAlert) => void;
  now: () => Date;
}>;

// Alerts carry only event ids and types, never customer data. One line per kind
// per minute, with the suppressed count, so a hostile sender cannot flood logs.
export function createBillingAlertSink(
  write: (line: string) => void = (line) => console.warn(line),
  clock: () => number = Date.now,
  windowMs = 60_000,
) {
  const last = new Map<string, { at: number; suppressed: number }>();
  return (alert: BillingAlert) => {
    const t = clock();
    const state = last.get(alert.kind);
    if (state && t - state.at < windowMs) {
      state.suppressed++;
      return;
    }
    write(
      JSON.stringify({
        billingAlert: alert.kind,
        ...(alert.eventId ? { eventId: alert.eventId } : {}),
        ...(alert.eventType ? { eventType: alert.eventType } : {}),
        suppressed: state?.suppressed ?? 0,
      }),
    );
    last.set(alert.kind, { at: t, suppressed: 0 });
  };
}

export function createBillingRuntime(
  db: Database,
  config: BillingEnvConfig = billingConfigFromEnv(),
  options: {
    provider?: BillingProvider;
    fetch?: typeof fetch;
    alert?: (alert: BillingAlert) => void;
    now?: () => Date;
  } = {},
): BillingRuntime {
  const provider = !config.enabled
    ? null
    : (options.provider ??
      createStripeProvider({
        secretKey: config.secretKey,
        apiVersion: config.apiVersion,
        priceId: config.priceId,
        couponId: config.couponId,
        successUrl: config.successUrl,
        cancelUrl: config.cancelUrl,
        fetch: options.fetch ?? fetch,
      }));
  return {
    config,
    store: createBillingStore(db),
    provider,
    db,
    alert: options.alert ?? createBillingAlertSink(),
    now: options.now ?? (() => new Date()),
  };
}

// One line at startup, no secrets.
export const describeBilling = (runtime: BillingRuntime) =>
  JSON.stringify({ billing: redactBillingConfig(runtime.config) });

// Account deletion must never leave a charging subscription behind. With billing
// enabled the provider subscriptions are cancelled first. With billing off or
// misconfigured the deletion proceeds only when the account has no subscription
// that could still be charging; otherwise it stays pending (fail closed).
export function accountDeletionBilling(
  runtime: BillingRuntime,
): AccountDeletionBilling {
  return {
    cancelSubscriptions: async (userId) => {
      if (runtime.provider)
        return cancelProviderSubscriptionsForUser(
          runtime.store,
          runtime.provider,
          userId,
        );
      if (await hasLiveBillingSubscription(runtime.db, userId))
        throw new DomainError(
          'BILLING_CANCELLATION_UNAVAILABLE',
          'The subscription cannot be cancelled while billing is unavailable.',
          503,
        );
      return { cancelled: 0 };
    },
  };
}
