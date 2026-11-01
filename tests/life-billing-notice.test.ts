import { createRequire } from 'node:module';
import type { createElement as createElementType } from 'react';
import type { renderToStaticMarkup as renderType } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClientError } from '../apps/web/lib/client';
import {
  lifeNoticeForError,
  visibleLifeNotice,
} from '../apps/web/lib/life-notice';
import { LifeErrorNotice } from '../apps/web/components/life-error-notice';
import {
  billingStatusForAccount,
  type BillingStatus,
} from '../apps/web/lib/billing';

const require = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const { createElement } = require('react') as {
  createElement: typeof createElementType;
};
const { renderToStaticMarkup } = require('react-dom/server') as {
  renderToStaticMarkup: typeof renderType;
};
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const render = (error: unknown, userId: string | null = owner) =>
  renderToStaticMarkup(
    createElement(LifeErrorNotice, {
      notice: lifeNoticeForError(error, owner),
      userId,
      locale: 'en',
    }),
  );

describe('story quota notice and subscription entry', () => {
  it.each(['BILLING_NO_ENTITLEMENT', 'BILLING_ALLOWANCE_EXHAUSTED'])(
    'offers only the fixed subscription route after %s',
    (code) => {
      const markup = render(new ClientError(code));
      expect(markup).toContain('role="alert"');
      expect(markup).toContain('href="/billing"');
      expect(markup).toContain('View subscription and chapter balance');
      expect(markup).not.toContain('<form');
      expect(markup).not.toContain('stripe.com');
    },
  );
  it.each([
    'BILLING_UNAVAILABLE',
    'AUTH_REQUIRED',
    'LIFE_REVISION_CONFLICT',
    'REQUEST_FAILED',
  ])('does not offer payment for %s', (code) => {
    expect(render(new ClientError(code))).not.toContain('href="/billing"');
  });
  it('does not turn network errors or arbitrary objects into quota notices', () => {
    for (const error of [
      new TypeError('fetch failed'),
      new Error('offline'),
      { code: 'BILLING_NO_ENTITLEMENT' },
      null,
    ]) {
      expect(lifeNoticeForError(error, owner).billingReason).toBeNull();
      expect(render(error)).not.toContain('href="/billing"');
    }
  });
  it('does not display an old or delayed notice for a different account or after signout', () => {
    const notice = lifeNoticeForError(
      new ClientError('BILLING_NO_ENTITLEMENT'),
      owner,
    );
    expect(visibleLifeNotice(notice, other)).toBeNull();
    expect(visibleLifeNotice(notice, null)).toBeNull();
    expect(render(new ClientError('BILLING_NO_ENTITLEMENT'), other)).toBe('');
    expect(render(new ClientError('BILLING_NO_ENTITLEMENT'), null)).toBe('');
    expect(visibleLifeNotice(notice, owner)).toBe(notice);
  });
  it('replaces quota notices with the next ordinary error without retaining a payment prompt', () => {
    expect(render(new ClientError('BILLING_NO_ENTITLEMENT'))).toContain(
      '/billing',
    );
    expect(render(new ClientError('REQUEST_FAILED'))).not.toContain('/billing');
  });
  it('keeps chapter-balance snapshots bound to the account before effects can reset state', () => {
    const status: BillingStatus = {
      state: 'active',
      canGenerate: true,
      paidChaptersAvailable: 5,
      tasterChaptersAvailable: 1,
    };
    const snapshot = { userId: owner, status };
    expect(billingStatusForAccount(snapshot, owner)).toBe(status);
    expect(billingStatusForAccount(snapshot, other)).toBeNull();
    expect(billingStatusForAccount(snapshot, null)).toBeNull();
    expect(billingStatusForAccount(null, owner)).toBeNull();
    expect(status.paidChaptersAvailable).toBe(5);
  });
});
