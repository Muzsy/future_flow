import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { Repository, type Database } from '@future-flow/database';
import {
  billingConfigFromEnv,
  entitlementOfSubscriptions,
  handleStripeWebhook,
  paidChaptersAvailable,
  tasterChaptersAvailable,
} from '@future-flow/core';
import { createBillingRuntime } from '../apps/api/src/billing-runtime';
import { applyMigrations } from './lib/migrations';

// Stripe SANDBOX probe (ADR-010, step 3c). Verifies, against the real Stripe test
// API and the real webhook handler, what the mocks cannot: the Checkout
// parameters, the event field names of the account API version, and the effect
// of a payment, a cancellation and a refund on the entitlement.
//
// Safe by construction: it refuses anything but a test-mode key, uses an
// in-memory PGlite database (no application data, no production access), creates
// only test-mode Stripe objects and deletes the customers it made. It prints
// PASS/FAIL lines and never a key, secret or customer detail.
//
// Environment (from the process environment, never from arguments):
//   STRIPE_SECRET_KEY        sk_test_… or rk_test_…
//   PROBE_WEBHOOK_SECRET     whsec_… printed by `stripe listen --print-secret`
//   STRIPE_PRICE_ID, STRIPE_FOUNDER_COUPON_ID, STRIPE_API_VERSION
//   PROBE_PORT               local webhook port (default 4242)
//   PROBE_DISCOUNT=1         also run the launch-discount variant (redeems the
//                            sandbox coupon once; it allows ten redemptions)
// While running, forward events with:
//   stripe listen --api-key "$STRIPE_SECRET_KEY" --forward-to localhost:PORT/webhook \
//     --events customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,charge.refunded,charge.dispute.created
// (the CLI does not retry an event the receiver answered with 5xx, unlike Stripe)

const env = process.env;
const secretKey = env.STRIPE_SECRET_KEY?.trim() ?? '';
assert(
  /^(sk|rk)_test_[A-Za-z0-9]{8,}$/.test(secretKey),
  'A Stripe test-mode key is required (live keys are refused).',
);
const apiVersion = env.STRIPE_API_VERSION?.trim() ?? '';
const priceId = env.STRIPE_PRICE_ID?.trim() ?? '';
const port = Number(env.PROBE_PORT ?? 4242);
assert(Number.isInteger(port) && port > 0 && port < 65536, 'Bad PROBE_PORT');
const withDiscount = env.PROBE_DISCOUNT === '1';

const standardUser = randomUUID();
const discountUser = randomUUID();
const cancelUser = randomUUID();

const parsedConfig = billingConfigFromEnv({
  BILLING_ENABLED: 'true',
  BILLING_ENFORCEMENT: 'false',
  STRIPE_SECRET_KEY: secretKey,
  STRIPE_WEBHOOK_SECRET: env.PROBE_WEBHOOK_SECRET ?? '',
  STRIPE_PRICE_ID: priceId,
  STRIPE_FOUNDER_COUPON_ID: env.STRIPE_FOUNDER_COUPON_ID ?? '',
  STRIPE_API_VERSION: apiVersion,
  BILLING_SUCCESS_URL: 'https://alterward.com/billing?checkout=success',
  BILLING_CANCEL_URL: 'https://alterward.com/billing?checkout=cancel',
  BILLING_FOUNDER_USER_IDS: withDiscount ? discountUser : '',
});
if (!parsedConfig.enabled)
  throw new Error(
    'Billing configuration is incomplete or invalid; check the PROBE_* and STRIPE_* values.',
  );
const config = parsedConfig;

function adapter(client: Pick<PGlite, 'query' | 'transaction'>): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await client.query<T>(sql, values)).rows,
    transaction: (run) =>
      client.transaction((tx) => run(adapter(tx as unknown as PGlite))),
  };
}

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
async function check(name: string, run: () => Promise<string | void>) {
  try {
    const detail = (await run()) ?? '';
    results.push({ name, ok: true, detail });
    console.log(`PASS  ${name}${detail ? ` (${detail})` : ''}`);
  } catch (error) {
    // Stripe error messages name parameters, never secrets; other errors are
    // reduced to their message.
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.log(`FAIL  ${name}: ${detail}`);
  }
}

async function stripe(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  form: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams(form);
  const response = await fetch(
    `https://api.stripe.com${path}${method === 'GET' && body.size ? `?${body}` : ''}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Stripe-Version': apiVersion,
        ...(method === 'POST'
          ? { 'Content-Type': 'application/x-www-form-urlencoded' }
          : {}),
      },
      ...(method === 'POST' ? { body } : {}),
    },
  );
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const error = (json.error ?? {}) as Record<string, unknown>;
    throw new Error(
      `Stripe ${method} ${path} -> ${response.status} ${String(error.code ?? error.type ?? '')}: ${String(error.message ?? '')}`,
    );
  }
  return json;
}

async function until<T>(
  what: string,
  read: () => Promise<T | false | null | undefined>,
  timeoutMs = 45_000,
): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > end)
      throw new Error(
        `Timed out waiting for ${what} (is "stripe listen" forwarding to this port?)`,
      );
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function main() {
  const engine = new PGlite();
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await applyMigrations(engine);
  const db = adapter(engine);
  const repo = new Repository(db);
  for (const id of [standardUser, discountUser, cancelUser]) {
    await repo.ensureUser(id);
    await repo.acceptPrivacy(id);
  }
  const received: string[] = [];
  const runtime = createBillingRuntime(db, config, {
    alert: (alert) =>
      console.log(
        `ALERT ${alert.kind}${alert.eventType ? ` ${alert.eventType}` : ''}`,
      ),
  });
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      void (async () => {
        if (request.method !== 'POST' || request.url !== '/webhook') {
          response.writeHead(404).end();
          return;
        }
        const rawBody = Buffer.concat(chunks);
        const header = request.headers['stripe-signature'];
        const result = await handleStripeWebhook(
          {
            rawBody,
            signatureHeader: typeof header === 'string' ? header : undefined,
            nowSeconds: Math.floor(Date.now() / 1000),
            webhookSecret: config.webhookSecret,
            priceId: config.priceId,
            expectedLivemode: false,
            expectedApiVersion: config.apiVersion,
          },
          {
            store: runtime.store,
            provider: runtime.provider!,
            offer: config.offer,
            entitlement: config.entitlement,
            designatedUserIds: config.designatedUserIds,
            alert: runtime.alert,
          },
        );
        let type = '?';
        try {
          type = String(
            (JSON.parse(rawBody.toString()) as { type?: string }).type,
          );
        } catch {
          /* not JSON: the handler already answered */
        }
        received.push(
          `${type}:${result.code}${result.outcome ? `/${result.outcome}` : ''}`,
        );
        console.log(
          `EVENT ${type} -> ${result.status} ${result.code}${result.outcome ? ` ${result.outcome}` : ''}`,
        );
        response
          .writeHead(result.status)
          .end(JSON.stringify({ code: result.code }));
      })();
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(port, '127.0.0.1', resolve),
  );
  console.log(
    `Webhook receiver on 127.0.0.1:${port}/webhook (api ${apiVersion})`,
  );

  const customers: string[] = [];
  const state = async (userId: string) => {
    const tx = await runtime.store.transaction(async (t) => ({
      subs: await t.listSubscriptions(userId),
      ledger: await t.loadLedger(userId),
    }));
    const entitlement = entitlementOfSubscriptions(
      tx.subs,
      new Date(),
      config.entitlement,
    );
    return {
      subs: tx.subs,
      state: entitlement.state,
      canGenerate: entitlement.canGenerate,
      paid: paidChaptersAvailable(tx.ledger, new Date()),
      taster: tasterChaptersAvailable(tx.ledger),
    };
  };
  // A paying test subscription made through the API (no browser). It exercises
  // the same events as a Checkout subscription.
  async function subscribe(userId: string, discounted: boolean) {
    const customer = await stripe('POST', '/v1/customers', {
      'metadata[user_id]': userId,
      description: 'alterward sandbox probe',
    });
    const customerId = String(customer.id);
    customers.push(customerId);
    const method = await stripe('POST', '/v1/payment_methods', {
      type: 'card',
      'card[token]': 'tok_visa',
    });
    await stripe('POST', `/v1/payment_methods/${String(method.id)}/attach`, {
      customer: customerId,
    });
    await stripe('POST', `/v1/customers/${customerId}`, {
      'invoice_settings[default_payment_method]': String(method.id),
    });
    const subscription = await stripe('POST', '/v1/subscriptions', {
      customer: customerId,
      'items[0][price]': priceId,
      'metadata[user_id]': userId,
      'metadata[offer_version]': discounted ? 'launch_v1' : 'standard_v1',
      ...(discounted
        ? { 'discounts[0][coupon]': env.STRIPE_FOUNDER_COUPON_ID ?? '' }
        : {}),
    });
    return { customerId, subscriptionId: String(subscription.id) };
  }

  try {
    await check('webhook rejects an unsigned request', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/webhook`, {
        method: 'POST',
        body: '{}',
      });
      assert.equal(response.status, 400);
      // Not a Stripe event: keep it out of the final event audit.
      received.length = 0;
    });

    await check(
      'checkout session (standard offer) is accepted by Stripe',
      async () => {
        const { url } = await runtime.provider!.createCheckoutSession({
          userId: standardUser,
          offerVersion: 'standard_v1',
          discounted: false,
          now: new Date(),
        });
        assert(
          /^https:\/\/[a-z0-9.-]*stripe\.com\//.test(url),
          'unexpected checkout host',
        );
        return `host ${new URL(url).hostname}`;
      },
    );

    if (withDiscount)
      await check(
        'checkout session (launch discount) is accepted by Stripe',
        async () => {
          const { url } = await runtime.provider!.createCheckoutSession({
            userId: discountUser,
            offerVersion: 'launch_v1',
            discounted: true,
            now: new Date(),
          });
          assert(/^https:\/\/[a-z0-9.-]*stripe\.com\//.test(url));
        },
      );

    let standard = { customerId: '', subscriptionId: '' };
    await check(
      'paid subscription creates the entitlement and the full chapter grant',
      async () => {
        standard = await subscribe(standardUser, false);
        const s = await until('the subscription to become active', async () => {
          const v = await state(standardUser);
          return v.state === 'active' && v.paid > 0 && v;
        });
        assert.equal(s.canGenerate, true);
        return `state ${s.state}, paid chapters ${s.paid}`;
      },
    );

    await check(
      'a full refund revokes the entitlement and cancels the subscription',
      async () => {
        const charges = await stripe('GET', '/v1/charges', {
          customer: standard.customerId,
          limit: '1',
        });
        const charge = (charges.data as { id: string }[])[0];
        assert(charge, 'no charge found for the probe customer');
        await stripe('POST', '/v1/refunds', { charge: charge.id });
        const s = await until(
          'the refund to revoke the entitlement',
          async () => {
            const v = await state(standardUser);
            return v.state === 'revoked' && v;
          },
        );
        assert.equal(s.canGenerate, false);
        const sub = await stripe(
          'GET',
          `/v1/subscriptions/${standard.subscriptionId}`,
        );
        assert.equal(
          sub.status,
          'canceled',
          'subscription still live at Stripe',
        );
        return `state ${s.state}`;
      },
    );

    // Information only, and only when the refund check failed: the shape (key
    // names and types, never values) of the objects the refund tracing reads.
    if (results.some((r) => !r.ok && r.name.startsWith('a full refund'))) {
      const shape = (value: unknown) =>
        value && typeof value === 'object'
          ? Object.entries(value as Record<string, unknown>)
              .map(
                ([k, v]) =>
                  `${k}:${v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v}`,
              )
              .join(',')
          : String(value);
      try {
        const charges = await stripe('GET', '/v1/charges', {
          customer: standard.customerId,
          limit: '1',
        });
        const charge = (charges.data as Record<string, unknown>[])[0];
        console.log(`INFO  charge keys: ${shape(charge)}`);
        const pi =
          typeof charge?.payment_intent === 'string'
            ? charge.payment_intent
            : '';
        const payments = await stripe('GET', '/v1/invoice_payments', {
          'payment[type]': 'payment_intent',
          'payment[payment_intent]': pi,
          limit: '1',
        }).catch((e: unknown) => ({ error: String(e) }));
        console.log(`INFO  invoice_payments: ${shape(payments)}`);
        const first = (payments as { data?: Record<string, unknown>[] })
          .data?.[0];
        console.log(`INFO  invoice_payment keys: ${shape(first)}`);
        const invoiceId =
          typeof first?.invoice === 'string' ? first.invoice : '';
        if (invoiceId) {
          const invoice = await stripe('GET', `/v1/invoices/${invoiceId}`);
          console.log(`INFO  invoice keys: ${shape(invoice)}`);
          console.log(`INFO  invoice.parent keys: ${shape(invoice.parent)}`);
          const lines = (invoice.lines as { data?: Record<string, unknown>[] })
            ?.data;
          console.log(`INFO  invoice line keys: ${shape(lines?.[0])}`);
          console.log(
            `INFO  invoice line pricing keys: ${shape(lines?.[0]?.pricing)}`,
          );
        }
      } catch (error) {
        console.log(
          `INFO  diagnosis failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    await check(
      'cancel at period end keeps the entitlement as "canceling", immediate cancel ends it',
      async () => {
        const made = await subscribe(cancelUser, false);
        await until('the second subscription to become active', async () => {
          const v = await state(cancelUser);
          return v.state === 'active' && v;
        });
        await stripe('POST', `/v1/subscriptions/${made.subscriptionId}`, {
          cancel_at_period_end: 'true',
        });
        await until('the cancellation to show as canceling', async () => {
          const v = await state(cancelUser);
          return v.state === 'canceling' && v.canGenerate && v;
        });
        await stripe('DELETE', `/v1/subscriptions/${made.subscriptionId}`);
        const ended = await until('the subscription to end', async () => {
          const v = await state(cancelUser);
          return v.state === 'ended' && v;
        });
        return `final state ${ended.state}`;
      },
    );

    if (withDiscount)
      await check(
        'launch-discount subscription grants the discounted chapter count',
        async () => {
          await subscribe(discountUser, true);
          const s = await until(
            'the discounted subscription to become active',
            async () => {
              const v = await state(discountUser);
              return v.state === 'active' && v.paid > 0 && v;
            },
          );
          return `paid chapters ${s.paid} (expected from the launch offer)`;
        },
      );

    await check(
      'no event was rejected for mode, API version or signature',
      async () => {
        const bad = received.filter((e) =>
          /mode_mismatch|api_version_mismatch|invalid_signature/.test(e),
        );
        assert.equal(bad.length, 0, `rejected: ${bad.join(', ')}`);
        // Other sandbox activity of the account is forwarded too; anything the
        // handler could not use is listed, not failed.
        const other = received.filter((e) =>
          /malformed_event|unresolved|retry/.test(e),
        );
        if (other.length)
          console.log(`INFO  unusable events: ${other.join(', ')}`);
        return `${received.length} events handled`;
      },
    );
  } finally {
    for (const id of customers)
      await stripe('DELETE', `/v1/customers/${id}`).catch(() => undefined);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await engine.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed`,
  );
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((error) => {
  console.log(
    `ABORT ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
