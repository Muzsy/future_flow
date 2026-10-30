import {
  checkoutIdempotencyKey,
  type BillingProvider,
} from './billing-service';
import {
  STRIPE_OFFER_METADATA_KEY,
  STRIPE_USER_METADATA_KEY,
} from './billing-stripe';
import type { BillingEvent } from './billing';

// Stripe REST adapter over an injected fetch (no SDK, no global state, no
// network in tests). Endpoint and field names follow the Stripe documentation
// for the 2025-03-31.basil generation and Managed Payments; they must be
// confirmed against the sandbox before any live use.

export type StripeProviderOptions = Readonly<{
  secretKey: string;
  apiVersion: string;
  priceId: string;
  couponId: string;
  successUrl: string;
  cancelUrl: string;
  fetch: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}>;

class StripeRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    // Never include the response body or request: keys and customer data stay out.
    super(`Stripe request failed (${status}${code ? `, ${code}` : ''})`);
  }
}

const idPattern = (prefix: string) =>
  new RegExp(`^${prefix}_[A-Za-z0-9]{1,120}$`);
const isSubscriptionId = (v: unknown): v is string =>
  typeof v === 'string' && idPattern('sub').test(v);
const isInvoiceId = (v: unknown): v is string =>
  typeof v === 'string' && idPattern('in').test(v);
const isCustomerId = (v: unknown): v is string =>
  typeof v === 'string' && idPattern('cus').test(v);
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const idOf = (v: unknown) =>
  typeof v === 'string'
    ? v
    : isObj(v) && typeof v.id === 'string'
      ? v.id
      : null;

export function createStripeProvider(
  options: StripeProviderOptions,
): BillingProvider {
  const base = options.baseUrl ?? 'https://api.stripe.com';
  async function call(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    form?: URLSearchParams,
    idempotencyKey?: string,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const query = method === 'GET' && form ? `?${form}` : '';
    const response = await options.fetch(`${base}${path}${query}`, {
      method,
      headers: {
        Authorization: `Bearer ${options.secretKey}`,
        'Stripe-Version': options.apiVersion,
        ...(method === 'POST'
          ? { 'Content-Type': 'application/x-www-form-urlencoded' }
          : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: method === 'POST' && form ? form.toString() : undefined,
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = await response.json();
      if (isObj(parsed)) body = parsed;
    } catch {
      /* non-JSON error body */
    }
    if (!response.ok) {
      const error = isObj(body.error) ? body.error : {};
      throw new StripeRequestError(
        response.status,
        typeof error.code === 'string' ? error.code : null,
      );
    }
    return { status: response.status, body };
  }

  async function traceCharge(ids: {
    chargeId: string | null;
    paymentIntentId: string | null;
  }) {
    let customerId: string | null = null;
    let invoiceId: string | null = null;
    let subscriptionId: string | null = null;
    let paymentIntentId = ids.paymentIntentId;
    if (ids.chargeId && idPattern('(ch|py)').test(ids.chargeId)) {
      const charge = (await call('GET', `/v1/charges/${ids.chargeId}`)).body;
      customerId = idOf(charge.customer);
      invoiceId = idOf(charge.invoice);
      paymentIntentId = paymentIntentId ?? idOf(charge.payment_intent);
    }
    if (
      !invoiceId &&
      paymentIntentId &&
      idPattern('pi').test(paymentIntentId)
    ) {
      const payments = (
        await call(
          'GET',
          '/v1/invoice_payments',
          new URLSearchParams({
            'payment[type]': 'payment_intent',
            'payment[payment_intent]': paymentIntentId,
            limit: '1',
          }),
        )
      ).body;
      const first =
        Array.isArray(payments.data) && isObj(payments.data[0])
          ? payments.data[0]
          : null;
      invoiceId = first ? idOf(first.invoice) : null;
    }
    if (!isInvoiceId(invoiceId)) return null;
    const invoice = (await call('GET', `/v1/invoices/${invoiceId}`)).body;
    const parent = isObj(invoice.parent) ? invoice.parent : null;
    const details =
      parent && isObj(parent.subscription_details)
        ? parent.subscription_details
        : null;
    subscriptionId = idOf(details?.subscription) ?? idOf(invoice.subscription);
    customerId = customerId ?? idOf(invoice.customer);
    if (!isSubscriptionId(subscriptionId)) return null;
    return {
      invoiceId,
      subscriptionId,
      customerId: isCustomerId(customerId) ? customerId : null,
    };
  }

  return {
    async createCheckoutSession({ userId, offerVersion, discounted, now }) {
      const form = new URLSearchParams({
        mode: 'subscription',
        'line_items[0][price]': options.priceId,
        'line_items[0][quantity]': '1',
        client_reference_id: userId,
        [`metadata[${STRIPE_USER_METADATA_KEY}]`]: userId,
        [`subscription_data[metadata][${STRIPE_USER_METADATA_KEY}]`]: userId,
        [`subscription_data[metadata][${STRIPE_OFFER_METADATA_KEY}]`]:
          offerVersion,
        success_url: options.successUrl,
        cancel_url: options.cancelUrl,
        // Managed Payments. Not set, by design: automatic_tax, tax_id_collection,
        // adaptive_pricing, payment_method_types, invoice_creation.
        'managed_payments[enabled]': 'true',
      });
      if (discounted) form.set('discounts[0][coupon]', options.couponId);
      const { body } = await call(
        'POST',
        '/v1/checkout/sessions',
        form,
        checkoutIdempotencyKey(userId, now),
      );
      const url = typeof body.url === 'string' ? body.url : '';
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new Error('Checkout session has no usable URL');
      }
      if (
        parsed.protocol !== 'https:' ||
        !(
          parsed.hostname === 'stripe.com' ||
          parsed.hostname.endsWith('.stripe.com')
        )
      )
        throw new Error('Checkout session has no usable URL');
      return { url: parsed.toString() };
    },

    async cancelSubscription(subscriptionId) {
      if (!isSubscriptionId(subscriptionId))
        throw new Error('Invalid subscription id');
      try {
        await call('DELETE', `/v1/subscriptions/${subscriptionId}`);
      } catch (error) {
        // Already cancelled or gone: the goal state is reached.
        if (error instanceof StripeRequestError && error.status === 404) return;
        throw error;
      }
    },

    async resolveRevocation(event) {
      if (event.type === 'partial_refund') return event;
      const complete =
        (event.subscriptionId || event.customerId) &&
        (event.reason === 'dispute' || event.invoiceId);
      if (complete) return event;
      let traced: Awaited<ReturnType<typeof traceCharge>> = null;
      try {
        traced = await traceCharge({
          chargeId: event.chargeId,
          paymentIntentId: event.paymentIntentId,
        });
      } catch {
        return null;
      }
      if (!traced) return null;
      const resolved: BillingEvent = {
        ...event,
        subscriptionId: event.subscriptionId ?? traced.subscriptionId,
        customerId: event.customerId ?? traced.customerId,
        invoiceId: event.invoiceId ?? traced.invoiceId,
      };
      return resolved;
    },
  };
}
