import { createRequire } from 'node:module';
import type { createElement as createElementType } from 'react';
import type { renderToStaticMarkup as renderType } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  POLL_MAX_ATTEMPTS,
  canStartCheckout,
  checkoutResult,
  isBillingStatus,
  safeCheckoutUrl,
  shouldPoll,
  type BillingStatus,
} from '../apps/web/lib/billing';
import { messages } from '../apps/web/lib/i18n';

// react is a dependency of the web app only, so resolve it from there.
const webRequire = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const { createElement } = webRequire('react') as {
  createElement: typeof createElementType;
};
const { renderToStaticMarkup } = webRequire('react-dom/server') as {
  renderToStaticMarkup: typeof renderType;
};

const status = (state: BillingStatus['state']): BillingStatus => ({
  state,
  canGenerate: state === 'active',
  paidChaptersAvailable: 0,
  tasterChaptersAvailable: 0,
});

describe('subscription page helpers', () => {
  it('reads the checkout return flag only for the two known values', () => {
    expect(checkoutResult('?checkout=success')).toBe('success');
    expect(checkoutResult('?checkout=cancel')).toBe('cancel');
    expect(checkoutResult('?checkout=other')).toBeNull();
    expect(checkoutResult('')).toBeNull();
  });

  it('offers a new checkout only where no live subscription exists', () => {
    for (const state of ['none', 'ended', 'revoked'] as const)
      expect(canStartCheckout(state)).toBe(true);
    // A second checkout would create a parallel subscription.
    for (const state of ['active', 'canceling', 'past_due'] as const)
      expect(canStartCheckout(state)).toBe(false);
  });

  it('polls only after a successful checkout, until the subscription appears or the limit is hit', () => {
    expect(shouldPoll('success', null, 0)).toBe(true);
    expect(shouldPoll('success', status('none'), 3)).toBe(true);
    expect(shouldPoll('success', status('active'), 3)).toBe(false);
    expect(shouldPoll('success', status('none'), POLL_MAX_ATTEMPTS)).toBe(
      false,
    );
    expect(shouldPoll('cancel', status('none'), 0)).toBe(false);
    expect(shouldPoll(null, status('none'), 0)).toBe(false);
  });

  it('follows only https Stripe addresses', () => {
    expect(safeCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_1')).toBe(
      'https://checkout.stripe.com/c/pay/cs_test_1',
    );
    for (const bad of [
      'http://checkout.stripe.com/c/pay/x',
      'https://checkout.stripe.com.evil.example/x',
      'https://evilstripe.com/x',
      'javascript:alert(1)',
      '//checkout.stripe.com/x',
      '',
      undefined,
      42,
    ])
      expect(safeCheckoutUrl(bad)).toBeNull();
  });

  it('accepts only a well-formed status answer', () => {
    expect(isBillingStatus(status('active'))).toBe(true);
    expect(isBillingStatus({ ...status('active'), state: 'weird' })).toBe(
      false,
    );
    expect(
      isBillingStatus({ ...status('none'), paidChaptersAvailable: '1' }),
    ).toBe(false);
    expect(isBillingStatus(null)).toBe(false);
  });

  it('has every state text and the price text in both languages', () => {
    for (const locale of ['en', 'hu'] as const) {
      for (const state of [
        'none',
        'active',
        'canceling',
        'past_due',
        'ended',
        'revoked',
      ])
        expect(
          messages[locale][
            `billing.state.${state}` as keyof typeof messages.en
          ],
        ).toBeTruthy();
      expect(messages[locale]['billing.offer']).toMatch(/14[.,]99/);
    }
  });

  it('renders the page shell without a configured sign-in (English is the only enabled locale)', async () => {
    vi.doMock(webRequire.resolve('next/navigation'), () => ({
      useRouter: () => ({ refresh: () => undefined }),
    }));
    const { LanguageProvider } =
      await import('../apps/web/components/language-provider');
    const { BillingPanel } =
      await import('../apps/web/components/billing-panel');
    const html = (locale: 'en' | 'hu') =>
      renderToStaticMarkup(
        createElement(
          LanguageProvider,
          { initialLocale: locale },
          createElement(BillingPanel),
        ),
      );
    expect(html('en')).toContain('Subscription');
  });
});
