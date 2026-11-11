import {
  billingConfigFromEnv,
  createStripeProvider,
  retryPendingCancellations,
  type BillingEnvConfig,
  type BillingProvider,
} from '@future-flow/core';
import {
  createBillingStore,
  releaseSettledBillingReservations,
  releaseStaleBillingReservations,
  type Database,
} from '@future-flow/database';

// Periodic billing upkeep (ADR-010): settles provider cancellations that failed
// after a committed revocation, and hands back chapter reservations whose
// generation never settled. Nothing exists unless billing is explicitly and
// completely configured, so the default worker loop is unchanged.

const DEFAULT_TTL_SECONDS = 7_200;
const MAINTENANCE_BATCH = 5;
// Must exceed the longest possible generation (job lease + retries); read here,
// never below ten minutes, so a live generation is not reclaimed.
export function reservationTtlSeconds(env: NodeJS.ProcessEnv = process.env) {
  const value = Number(
    env.BILLING_RESERVATION_TTL_SECONDS ?? DEFAULT_TTL_SECONDS,
  );
  return Number.isInteger(value) && value >= 600 && value <= 86_400
    ? value
    : DEFAULT_TTL_SECONDS;
}

export function createBillingMaintenance(
  db: Database,
  env: NodeJS.ProcessEnv = process.env,
  options: {
    provider?: BillingProvider;
    fetch?: typeof fetch;
    now?: () => Date;
  } = {},
): {
  run(): Promise<{ attempted: number; failed: number; released: number }>;
} | null {
  const config: BillingEnvConfig = billingConfigFromEnv(env);
  if (!config.enabled) return null;
  const provider =
    options.provider ??
    createStripeProvider({
      secretKey: config.secretKey,
      apiVersion: config.apiVersion,
      priceId: config.priceId,
      couponId: config.couponId,
      successUrl: config.successUrl,
      cancelUrl: config.cancelUrl,
      fetch: options.fetch ?? fetch,
    });
  const store = createBillingStore(db);
  const ttlMs = reservationTtlSeconds(env) * 1000;
  return {
    run: async () => {
      // Small batch: with the provider down every attempt waits for its timeout,
      // and this runs on the worker loop before AI jobs are claimed.
      const retried = await retryPendingCancellations(
        store,
        provider,
        MAINTENANCE_BATCH,
      );
      const { released } = await releaseStaleBillingReservations(db, {
        olderThanMs: ttlMs,
        now: options.now?.(),
      });
      // Reservations of jobs that ended without settling (cancelled, vanished).
      const settled = await releaseSettledBillingReservations(db);
      return { ...retried, released: released + settled.released };
    },
  };
}
