import { describe, it, expect } from 'vitest';
import {
  createStripeProvider,
  createBillingPortalSession,
  type BillingTx,
} from '@future-flow/core';
import { billingPortalDestination } from '../apps/web/lib/billing';
const config = {
  id: 'bpc_safe',
  active: true,
  is_default: true,
  livemode: false,
  features: {
    subscription_cancel: { enabled: true, mode: 'at_period_end' },
    subscription_update: { enabled: false },
  },
};
function provider(
  configuration: unknown = config,
  url = 'https://billing.stripe.com/p/session/synthetic',
  responseBinding: Record<string, unknown> = {},
) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const p = createStripeProvider({
    secretKey: 'sk_test_synthetic',
    apiVersion: '2025-03-31.basil',
    priceId: 'price_synthetic',
    couponId: 'coupon_synthetic',
    successUrl: 'https://alterward.example/billing?checkout=success',
    cancelUrl: 'https://alterward.example/billing?checkout=cancel',
    fetch: (async (input, init) => {
      const u = new URL(String(input));
      calls.push({ url: u, init: init! });
      return new Response(
        JSON.stringify(
          u.pathname.endsWith('configurations')
            ? { data: [configuration], has_more: false }
            : {
                customer: 'cus_own',
                configuration: 'bpc_safe',
                livemode: false,
                url,
                ...responseBinding,
              },
        ),
      );
    }) as typeof fetch,
  });
  return { p, calls };
}
describe('restricted subscription management portal', () => {
  it('pins the verified configuration and own customer, returning only to billing', async () => {
    const { p, calls } = provider();
    expect(await p.createPortalSession!({ customerId: 'cus_own' })).toEqual({
      url: 'https://billing.stripe.com/p/session/synthetic',
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url.searchParams.get('is_default')).toBe('true');
    const form = new URLSearchParams(String(calls[1]!.init.body));
    expect(Object.fromEntries(form)).toEqual({
      customer: 'cus_own',
      configuration: 'bpc_safe',
      return_url: 'https://alterward.example/billing',
    });
    expect(calls[1]!.url.pathname).toBe('/v1/billing_portal/sessions');
  });
  it.each([
    { ...config, livemode: true },
    { ...config, active: false },
    { ...config, is_default: false },
    {
      ...config,
      features: {
        ...config.features,
        subscription_cancel: { enabled: true, mode: 'immediately' },
      },
    },
    {
      ...config,
      features: { ...config.features, subscription_update: { enabled: true } },
    },
    {
      ...config,
      features: {
        ...config.features,
        subscription_cancel: {
          enabled: true,
          mode: 'at_period_end',
          retention: { type: 'coupon_offer' },
        },
      },
    },
  ])(
    'refuses unsafe portal configuration before creating a session',
    async (c) => {
      const { p, calls } = provider(c);
      await expect(
        p.createPortalSession!({ customerId: 'cus_own' }),
      ).rejects.toThrow('configuration');
      expect(calls).toHaveLength(1);
    },
  );
  it.each([
    'https://evil.invalid/session',
    'https://billing.stripe.com.evil.invalid/x',
    'https://user@billing.stripe.com/x',
    'http://billing.stripe.com/x',
    'https://billing.stripe.com:444/x',
  ])('refuses unsafe provider URLs', async (url) => {
    await expect(
      provider(config, url).p.createPortalSession!({ customerId: 'cus_own' }),
    ).rejects.toThrow();
  });
  it.each([
    { customer: 'cus_foreign' },
    { configuration: 'bpc_foreign' },
    { livemode: true },
  ])(
    'refuses a session bound to another customer/configuration/mode',
    async (binding) => {
      await expect(
        provider(
          config,
          'https://billing.stripe.com/p/session/synthetic',
          binding,
        ).p.createPortalSession!({ customerId: 'cus_own' }),
      ).rejects.toThrow('binding mismatch');
    },
  );
  it('withholds the URL if the account becomes inactive while the provider responds', async () => {
    let active = true;
    const tx = {
      lockUser: async () => {},
      userExists: async () => active,
      listSubscriptions: async () => [
        {
          userId: 'owner',
          customerId: 'cus_own',
          status: 'active',
          reconcileRequired: false,
        },
      ],
      customerOwnedOnlyBy: async () => true,
    } as unknown as BillingTx;
    await expect(
      createBillingPortalSession('owner', {
        store: { transaction: async (run) => run(tx) },
        provider: {
          createPortalSession: async () => {
            active = false;
            return { url: 'https://billing.stripe.com/p/session/synthetic' };
          },
        },
      }),
    ).rejects.toThrow('Account is not active');
  });
  it('withholds a created session when a different customer owner appears during the provider request', async () => {
    let owned = true;
    const tx = {
      lockUser: async () => {},
      userExists: async () => true,
      listSubscriptions: async () => [
        {
          userId: 'owner',
          customerId: 'cus_own',
          status: 'active',
          reconcileRequired: false,
        },
      ],
      customerOwnedOnlyBy: async () => owned,
    } as unknown as BillingTx;
    await expect(
      createBillingPortalSession('owner', {
        store: { transaction: async (run) => run(tx) },
        provider: {
          createPortalSession: async () => {
            owned = false;
            return { url: 'https://billing.stripe.com/p/session/synthetic' };
          },
        },
      }),
    ).rejects.toThrow('Subscription management is not available');
  });
  it('rejects a foreign account after a delayed response, and accepts the retained owner', async () => {
    let current = 'owner';
    let resolve!: (value: { url: string }) => void;
    const request = new Promise<{ url: string }>((r) => {
      resolve = r;
    });
    const result = billingPortalDestination(
      'owner',
      () => request,
      async () => current,
    );
    current = 'other';
    resolve({ url: 'https://billing.stripe.com/p/session/synthetic' });
    expect(await result).toBeNull();
    expect(
      await billingPortalDestination(
        'owner',
        async () => ({ url: 'https://billing.stripe.com/p/session/synthetic' }),
        async () => 'owner',
      ),
    ).not.toBeNull();
    expect(
      await billingPortalDestination(
        'owner',
        async () => ({ url: 'https://checkout.stripe.com/x' }),
        async () => 'owner',
      ),
    ).toBeNull();
  });
});
