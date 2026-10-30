import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  billingStatuses,
  type BillingEvent,
  type BillingStatus,
} from './billing';

// Stripe adapter pieces that need no network or SDK: webhook signature
// verification and normalisation of the few event types we act on. Event and
// field names follow the Stripe API as documented for the 2025-03-31.basil
// generation (period fields on subscription items, invoice parent details) with
// the older top-level shapes as fallback; they must be confirmed against the
// sandbox before any live use.

export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

// Never throws; any malformed input is simply "not verified".
export function verifyStripeSignature(input: {
  payload: string | Uint8Array;
  header: string | undefined;
  secret: string;
  nowSeconds: number;
  toleranceSeconds?: number;
}): boolean {
  try {
    const { payload, header, secret, nowSeconds } = input;
    if (!secret || !header || typeof header !== 'string') return false;
    let timestamp = '';
    const signatures: string[] = [];
    for (const part of header.split(',')) {
      const index = part.indexOf('=');
      if (index < 1) continue;
      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (name === 't') timestamp = timestamp || value;
      else if (name === 'v1') signatures.push(value);
    }
    if (!/^\d{1,12}$/.test(timestamp) || !signatures.length) return false;
    const tolerance =
      input.toleranceSeconds ?? STRIPE_SIGNATURE_TOLERANCE_SECONDS;
    if (Math.abs(nowSeconds - Number(timestamp)) > tolerance) return false;
    const body = Buffer.concat([
      Buffer.from(`${timestamp}.`, 'utf8'),
      typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload,
    ]);
    const expected = createHmac('sha256', secret).update(body).digest();
    let matched = false;
    for (const candidate of signatures) {
      if (!/^[a-f0-9]{64}$/i.test(candidate)) continue;
      const bytes = Buffer.from(candidate, 'hex');
      if (bytes.length === expected.length && timingSafeEqual(bytes, expected))
        matched = true;
    }
    return matched;
  } catch {
    return false;
  }
}

export class BillingEventFormatError extends Error {
  constructor() {
    super('Malformed billing event');
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null =>
  typeof v === 'string' && v && v.length <= 255 ? v : null;
const need = <T>(v: T | null | undefined): T => {
  if (v === null || v === undefined) throw new BillingEventFormatError();
  return v;
};
const iso = (seconds: unknown): string | null =>
  typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : null;
// A field that is an id string, or an expanded object carrying an id.
const idOf = (v: unknown): string | null =>
  str(v) ?? (isObj(v) ? str(v.id) : null);

function subscriptionId(object: Obj): string | null {
  const parent = isObj(object.parent) ? object.parent : null;
  const details =
    parent && isObj(parent.subscription_details)
      ? parent.subscription_details
      : null;
  return idOf(details?.subscription) ?? idOf(object.subscription);
}

export const STRIPE_OFFER_METADATA_KEY = 'offer_version';
export const STRIPE_USER_METADATA_KEY = 'user_id';

// Returns null for event types we do not act on. Throws
// BillingEventFormatError for a handled type with an unusable body, so the
// caller can answer 400 without changing any state.
export function normalizeStripeEvent(raw: unknown): BillingEvent | null {
  if (!isObj(raw)) throw new BillingEventFormatError();
  const type = str(raw.type);
  if (!type) throw new BillingEventFormatError();
  const handled = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.paid',
    'charge.refunded',
    'charge.dispute.created',
  ];
  if (!handled.includes(type)) return null;
  const eventId = need(str(raw.id));
  const created = raw.created;
  if (typeof created !== 'number' || !Number.isFinite(created) || created <= 0)
    throw new BillingEventFormatError();
  const data = isObj(raw.data) ? raw.data : null;
  const object = data && isObj(data.object) ? data.object : null;
  if (!object) throw new BillingEventFormatError();

  if (type.startsWith('customer.subscription.')) {
    const id = need(str(object.id));
    if (type.endsWith('.deleted'))
      return {
        type: 'subscription_deleted',
        eventId,
        created,
        subscriptionId: id,
      };
    const status = str(object.status);
    if (!status || !(billingStatuses as readonly string[]).includes(status))
      throw new BillingEventFormatError();
    const items =
      isObj(object.items) && Array.isArray(object.items.data)
        ? object.items.data
        : [];
    const item = isObj(items[0]) ? items[0] : null;
    const metadata = isObj(object.metadata) ? object.metadata : {};
    return {
      type: 'subscription_synced',
      eventId,
      created,
      subscriptionId: id,
      customerId: need(idOf(object.customer)),
      userId: str(metadata[STRIPE_USER_METADATA_KEY]),
      status: status as BillingStatus,
      periodStart: iso(
        item?.current_period_start ?? object.current_period_start,
      ),
      periodEnd: iso(item?.current_period_end ?? object.current_period_end),
      cancelAtPeriodEnd: object.cancel_at_period_end === true,
      discounted: metadata[STRIPE_OFFER_METADATA_KEY] === 'launch_v1',
    };
  }

  if (type === 'invoice.paid') {
    const lines =
      isObj(object.lines) && Array.isArray(object.lines.data)
        ? object.lines.data
        : [];
    const period =
      isObj(lines[0]) && isObj(lines[0].period) ? lines[0].period : null;
    return {
      type: 'invoice_paid',
      eventId,
      created,
      subscriptionId: need(subscriptionId(object)),
      invoiceId: need(str(object.id)),
      billingReason: need(str(object.billing_reason)),
      periodStart: need(iso(period?.start ?? object.period_start)),
      periodEnd: need(iso(period?.end ?? object.period_end)),
    };
  }

  if (type === 'charge.refunded') {
    // Only a full refund revokes; a partial refund changes nothing here.
    if (object.refunded !== true) return null;
  }
  return {
    type: 'revocation',
    eventId,
    created,
    reason: type === 'charge.refunded' ? 'refund' : 'dispute',
    subscriptionId: subscriptionId(object),
    customerId: idOf(object.customer),
    paymentIntentId: idOf(object.payment_intent),
    chargeId: type === 'charge.refunded' ? str(object.id) : idOf(object.charge),
    invoiceId: idOf(object.invoice),
  };
}
