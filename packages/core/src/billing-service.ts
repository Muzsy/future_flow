import { createHash } from 'node:crypto';
import { DomainError } from './errors';
import {
  applyBillingEvent,
  consumeChapter,
  defaultBillingOfferConfig,
  defaultEntitlementConfig,
  deriveEntitlement,
  mayAttachFounderDiscount,
  releaseChapter,
  reserveChapter,
  validateBillingOfferConfig,
  validateDiscountedUserIds,
  type BillingEvent,
  type BillingOfferConfig,
  type BillingOfferVersion,
  type BillingSubscription,
  type ChapterGrant,
  type ChapterLedger,
  type ChapterReservation,
  type Entitlement,
  type EntitlementConfig,
  type ReserveResult,
} from './billing';
import {
  BillingEventFormatError,
  normalizeStripeEvent,
  verifyStripeSignature,
} from './billing-stripe';

// Orchestration over an abstract transactional store (ADR-010). The pure rules
// live in ./billing; this layer only loads state, applies a rule and persists the
// result, so a SQL store and the in-memory test store share the same logic.

export type BillingTx = {
  // Serialises all billing writes of one user (reserve/consume/release).
  lockUser(userId: string): Promise<void>;
  hasEvent(eventId: string): Promise<boolean>;
  recordEvent(
    eventId: string,
    eventType: string,
    subscriptionId: string | null,
    outcome: 'applied' | 'duplicate' | 'stale' | 'ignored' | 'noted',
  ): Promise<void>;
  // Row-locked lookup; by customer id only when the subscription id is unknown.
  findSubscription(by: {
    subscriptionId: string | null;
    customerId: string | null;
  }): Promise<BillingSubscription | null>;
  listSubscriptions(userId: string): Promise<BillingSubscription[]>;
  saveSubscription(
    sub: BillingSubscription & { userId: string },
  ): Promise<void>;
  insertGrant(
    grant: ChapterGrant,
    owner: { subscriptionId: string; userId: string },
  ): Promise<void>;
  revokeGrants(keys: readonly string[]): Promise<void>;
  loadLedger(userId: string): Promise<ChapterLedger>;
  saveReservation(
    userId: string,
    reservation: ChapterReservation,
  ): Promise<void>;
  hasRedeemedFounderDiscount(userId: string): Promise<boolean>;
  userExists(userId: string): Promise<boolean>;
};
export type BillingStore = {
  transaction<T>(run: (tx: BillingTx) => Promise<T>): Promise<T>;
};

export type BillingAlert = Readonly<{
  kind:
    | 'unresolved_event'
    | 'unknown_subscription'
    | 'partial_refund'
    | 'invalid_signature'
    | 'malformed_event';
  eventId?: string;
  eventType?: string;
}>;

export type BillingProvider = {
  createCheckoutSession(input: {
    userId: string;
    offerVersion: BillingOfferVersion;
    discounted: boolean;
    now: Date;
  }): Promise<{ url: string }>;
  // Idempotent: an already cancelled or missing subscription is success.
  cancelSubscription(subscriptionId: string): Promise<void>;
  // Resolves charge/payment-intent identifiers to an invoice and subscription.
  // null = could not be traced (the event stays unresolved and alerted).
  resolveRevocation(
    event: Extract<BillingEvent, { type: 'revocation' | 'partial_refund' }>,
  ): Promise<BillingEvent | null>;
};

export type ProcessedEvent = Readonly<{
  outcome:
    | 'applied'
    | 'duplicate'
    | 'stale'
    | 'ignored'
    | 'noted'
    | 'unknown_subscription'
    | 'unresolved';
  // true only when the event is durably recorded as processed.
  processed: boolean;
}>;

const eventTypeLabel: Record<BillingEvent['type'], string> = {
  subscription_synced: 'subscription_synced',
  subscription_deleted: 'subscription_deleted',
  invoice_paid: 'invoice_paid',
  revocation: 'revocation',
  partial_refund: 'partial_refund',
};

// Idempotent by event id in the same transaction as the state change. An event
// that cannot be applied yet is never recorded (the caller answers 5xx so the
// provider redelivers). A provider call that must accompany the change
// (cancelling the subscription) runs inside the transaction: if it fails the
// whole event rolls back and is retried.
export async function processBillingEvent(
  store: BillingStore,
  event: BillingEvent,
  provider: Pick<BillingProvider, 'cancelSubscription'>,
  config: BillingOfferConfig = defaultBillingOfferConfig,
): Promise<ProcessedEvent> {
  return store.transaction(async (tx) => {
    if (await tx.hasEvent(event.eventId))
      return { outcome: 'duplicate', processed: true };
    const subscriptionId =
      'subscriptionId' in event ? event.subscriptionId : null;
    const customerId = 'customerId' in event ? event.customerId : null;
    const prev =
      event.type === 'partial_refund'
        ? null
        : await tx.findSubscription({ subscriptionId, customerId });
    // A new subscription needs an owner we can verify; otherwise it cannot be
    // stored yet.
    if (
      event.type === 'subscription_synced' &&
      !prev &&
      (!event.userId || !(await tx.userExists(event.userId)))
    )
      return { outcome: 'unresolved', processed: false };
    const transition = applyBillingEvent(prev, event, config);
    if (
      transition.outcome === 'unknown_subscription' ||
      transition.outcome === 'unresolved'
    )
      return { outcome: transition.outcome, processed: false };
    if (transition.next && transition.next !== prev) {
      const userId = prev?.userId ?? transition.next.userId;
      if (!userId) return { outcome: 'unresolved', processed: false };
      await tx.saveSubscription({ ...transition.next, userId });
      if (transition.grant)
        await tx.insertGrant(transition.grant, {
          subscriptionId: transition.next.subscriptionId,
          userId,
        });
    }
    if (transition.revokeGrantKeys.length)
      await tx.revokeGrants(transition.revokeGrantKeys);
    if (transition.cancelSubscription && transition.next)
      await provider.cancelSubscription(transition.next.subscriptionId);
    await tx.recordEvent(
      event.eventId,
      eventTypeLabel[event.type],
      transition.next?.subscriptionId ?? null,
      transition.outcome,
    );
    return { outcome: transition.outcome, processed: true };
  });
}

export type StripeWebhookInput = Readonly<{
  rawBody: string | Uint8Array;
  signatureHeader: string | undefined;
  nowSeconds: number;
  webhookSecret: string;
  priceId: string;
}>;
export type WebhookResult = Readonly<{
  status: 200 | 400 | 500;
  code:
    | 'ok'
    | 'ignored'
    | 'invalid_signature'
    | 'invalid_json'
    | 'malformed_event'
    | 'unresolved'
    | 'retry';
  outcome?: ProcessedEvent['outcome'];
}>;

// Verification precedes every parse. Any failure to apply answers non-2xx so
// the provider retries; nothing is ever half-recorded.
export async function handleStripeWebhook(
  input: StripeWebhookInput,
  deps: {
    store: BillingStore;
    provider: BillingProvider;
    offer?: BillingOfferConfig;
    alert?: (alert: BillingAlert) => void;
  },
): Promise<WebhookResult> {
  const alert = deps.alert ?? (() => undefined);
  if (
    !verifyStripeSignature({
      payload: input.rawBody,
      header: input.signatureHeader,
      secret: input.webhookSecret,
      nowSeconds: input.nowSeconds,
    })
  ) {
    alert({ kind: 'invalid_signature' });
    return { status: 400, code: 'invalid_signature' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      typeof input.rawBody === 'string'
        ? input.rawBody
        : Buffer.from(input.rawBody).toString('utf8'),
    );
  } catch {
    return { status: 400, code: 'invalid_json' };
  }
  let event: BillingEvent | null;
  try {
    event = normalizeStripeEvent(parsed, { priceId: input.priceId });
  } catch (error) {
    if (error instanceof BillingEventFormatError) {
      alert({ kind: 'malformed_event' });
      return { status: 400, code: 'malformed_event' };
    }
    throw error;
  }
  if (!event) return { status: 200, code: 'ignored' };
  try {
    if (event.type === 'revocation' || event.type === 'partial_refund') {
      const resolved = await deps.provider.resolveRevocation(event);
      if (!resolved) {
        if (event.type === 'partial_refund') {
          // Only logged and alerted; nothing to apply.
          alert({ kind: 'partial_refund', eventId: event.eventId });
          return { status: 200, code: 'ok', outcome: 'noted' };
        }
        alert({ kind: 'unresolved_event', eventId: event.eventId });
        return { status: 500, code: 'unresolved', outcome: 'unresolved' };
      }
      event = resolved;
    }
    const result = await processBillingEvent(
      deps.store,
      event,
      deps.provider,
      deps.offer,
    );
    if (result.outcome === 'noted')
      alert({ kind: 'partial_refund', eventId: event.eventId });
    if (!result.processed) {
      alert({
        kind:
          result.outcome === 'unknown_subscription'
            ? 'unknown_subscription'
            : 'unresolved_event',
        eventId: event.eventId,
        eventType: event.type,
      });
      return { status: 500, code: 'unresolved', outcome: result.outcome };
    }
    return { status: 200, code: 'ok', outcome: result.outcome };
  } catch {
    return { status: 500, code: 'retry' };
  }
}

// ---- checkout ----

export type BillingConfig = Readonly<{
  enabled: boolean;
  enforcement: boolean;
  designatedUserIds: readonly string[];
  offer: BillingOfferConfig;
  entitlement: EntitlementConfig;
}>;

// Highest entitlement among the user's subscriptions.
export function entitlementOfSubscriptions(
  subs: readonly BillingSubscription[],
  now: Date,
  config: EntitlementConfig = defaultEntitlementConfig,
): Entitlement {
  let best: Entitlement = { state: 'none', canGenerate: false };
  for (const sub of subs) {
    const e = deriveEntitlement(sub, now, config);
    if (e.canGenerate) return e;
    if (best.state === 'none') best = e;
  }
  return best;
}

export async function createCheckoutSession(
  userId: string,
  now: Date,
  deps: {
    store: BillingStore;
    provider: BillingProvider;
    config: Pick<BillingConfig, 'designatedUserIds' | 'entitlement'>;
  },
): Promise<{ url: string }> {
  const { redeemed, entitlement } = await deps.store.transaction(
    async (tx) => ({
      redeemed: await tx.hasRedeemedFounderDiscount(userId),
      entitlement: entitlementOfSubscriptions(
        await tx.listSubscriptions(userId),
        now,
        deps.config.entitlement,
      ),
    }),
  );
  // One live subscription per user.
  if (entitlement.canGenerate)
    throw new DomainError(
      'BILLING_ALREADY_SUBSCRIBED',
      'An active subscription already exists.',
      409,
    );
  const discounted = mayAttachFounderDiscount(
    deps.config.designatedUserIds,
    userId,
    redeemed,
  );
  return deps.provider.createCheckoutSession({
    userId,
    offerVersion: discounted ? 'launch_v1' : 'standard_v1',
    discounted,
    now,
  });
}

// ---- chapter gate ----

export type GateResult =
  | Readonly<{ ok: true; created: boolean; bucket: 'paid' | 'taster' }>
  | Readonly<{
      ok: false;
      reason: 'no_entitlement' | 'allowance_exhausted' | 'invalid_key';
    }>;

// Reserve before generation. Fails closed; idempotent per request key.
export async function reserveChapterForUser(
  store: BillingStore,
  userId: string,
  key: string,
  now: Date,
  config: Pick<BillingConfig, 'entitlement'> = {
    entitlement: defaultEntitlementConfig,
  },
): Promise<GateResult> {
  return store.transaction(async (tx) => {
    await tx.lockUser(userId);
    const entitlement = entitlementOfSubscriptions(
      await tx.listSubscriptions(userId),
      now,
      config.entitlement,
    );
    const result: ReserveResult = reserveChapter(
      await tx.loadLedger(userId),
      key,
      entitlement,
      now,
    );
    if (!result.ok) return result;
    if (result.created) await tx.saveReservation(userId, result.reservation);
    return {
      ok: true,
      created: result.created,
      bucket: result.reservation.bucket,
    };
  });
}

async function settleReservation(
  store: BillingStore,
  userId: string,
  key: string,
  settle: (ledger: ChapterLedger, key: string) => ChapterLedger,
) {
  await store.transaction(async (tx) => {
    await tx.lockUser(userId);
    const before = await tx.loadLedger(userId);
    const after = settle(before, key);
    const found = after.reservations.find((r) => r.key === key);
    const prior = before.reservations.find((r) => r.key === key);
    if (found && found !== prior && found.state !== prior?.state)
      await tx.saveReservation(userId, found);
  });
}

// Only a new chapter that was durably saved consumes keret.
export const consumeChapterForUser = (
  store: BillingStore,
  userId: string,
  key: string,
) => settleReservation(store, userId, key, consumeChapter);
// A failure or cancellation hands the reservation back.
export const releaseChapterForUser = (
  store: BillingStore,
  userId: string,
  key: string,
) => settleReservation(store, userId, key, releaseChapter);

// ---- configuration ----

export type BillingEnvConfig =
  | (BillingConfig & {
      enabled: true;
      secretKey: string;
      webhookSecret: string;
      priceId: string;
      couponId: string;
      apiVersion: string;
      successUrl: string;
      cancelUrl: string;
    })
  | (BillingConfig & { enabled: false; reason: string });

const off = (reason: string, enforcement = false): BillingEnvConfig => ({
  enabled: false,
  enforcement,
  designatedUserIds: [],
  offer: defaultBillingOfferConfig,
  entitlement: defaultEntitlementConfig,
  reason,
});
const httpsUrl = (value: string | undefined) => {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' ||
      (url.protocol === 'http:' && url.hostname === 'localhost')
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

// Disabled unless explicitly and completely configured. A broken
// configuration disables billing (routes closed, no entitlement); it never
// takes the rest of the application down and never enables a partial setup.
export function billingConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): BillingEnvConfig {
  const flag = (name: string) => {
    const value = env[name] ?? 'false';
    if (!['true', 'false'].includes(value)) throw Error('flag');
    return value === 'true';
  };
  try {
    if (!flag('BILLING_ENABLED')) return off('disabled');
    const enforcement = flag('BILLING_ENFORCEMENT');
    const secretKey = env.STRIPE_SECRET_KEY?.trim() ?? '';
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim() ?? '';
    const priceId = env.STRIPE_PRICE_ID?.trim() ?? '';
    const couponId = env.STRIPE_FOUNDER_COUPON_ID?.trim() ?? '';
    const apiVersion = env.STRIPE_API_VERSION?.trim() ?? '';
    const successUrl = httpsUrl(env.BILLING_SUCCESS_URL);
    const cancelUrl = httpsUrl(env.BILLING_CANCEL_URL);
    if (
      !/^(sk|rk)_(test|live)_[A-Za-z0-9]{8,}$/.test(secretKey) ||
      !/^whsec_[A-Za-z0-9]{8,}$/.test(webhookSecret) ||
      !/^price_[A-Za-z0-9]+$/.test(priceId) ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(couponId) ||
      !/^\d{4}-\d{2}-\d{2}(\.[a-z]+)?$/.test(apiVersion) ||
      !successUrl ||
      !cancelUrl
    )
      return off('invalid configuration');
    const ids = env.BILLING_FOUNDER_USER_IDS?.trim() ?? '';
    return {
      enabled: true,
      enforcement,
      designatedUserIds: validateDiscountedUserIds(
        ids ? ids.split(',').map((id) => id.trim()) : [],
      ),
      offer: validateBillingOfferConfig(defaultBillingOfferConfig),
      entitlement: defaultEntitlementConfig,
      secretKey,
      webhookSecret,
      priceId,
      couponId,
      apiVersion,
      successUrl,
      cancelUrl,
    };
  } catch {
    return off('invalid configuration');
  }
}

// Never serialise secrets (logs, error reports).
export function redactBillingConfig(config: BillingEnvConfig) {
  return {
    enabled: config.enabled,
    enforcement: config.enforcement,
    designatedAccounts: config.designatedUserIds.length,
    ...(config.enabled
      ? { mode: config.secretKey.startsWith('sk_live') ? 'live' : 'test' }
      : { reason: config.reason }),
  };
}

export const checkoutIdempotencyKey = (userId: string, now: Date) =>
  'alterward-checkout-' +
  createHash('sha256')
    .update(`${userId}:${Math.floor(now.getTime() / 60_000)}`)
    .digest('hex')
    .slice(0, 32);
