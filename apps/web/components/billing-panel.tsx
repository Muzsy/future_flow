'use client';
import { useEffect, useState } from 'react';
import { initializeAuthSession } from '../lib/auth-session';
import {
  ClientError,
  api,
  authConfigured,
  clientErrorMessage,
  supabase,
} from '../lib/client';
import {
  POLL_INTERVAL_MS,
  billingView,
  checkoutResult,
  isBillingStatus,
  safeCheckoutUrl,
  shouldPoll,
  type BillingStatus,
  type CheckoutResult,
} from '../lib/billing';
import { useLanguage } from './language-provider';

// Subscription page. Billing is invisible until it is switched on: the status
// call then answers 404 and the page says that payments are not available.
export function BillingPanel() {
  const { t } = useLanguage();
  const [userId, setUserId] = useState<string | null>(null),
    [authReady, setAuthReady] = useState(false),
    [status, setStatus] = useState<BillingStatus | null>(null),
    [unavailable, setUnavailable] = useState(false),
    [result, setResult] = useState<CheckoutResult>(null),
    [attempts, setAttempts] = useState(0),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);

  useEffect(() => {
    setResult(checkoutResult(window.location.search));
    // Coming back with the browser's back button from Stripe restores the page
    // from the back/forward cache with the button still disabled.
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(false);
    };
    window.addEventListener('pageshow', restored);
    if (!authConfigured) {
      setAuthReady(true);
      return () => window.removeEventListener('pageshow', restored);
    }
    let active = true;
    const { data: subscription } = supabase().auth.onAuthStateChange(
      (_, session) => {
        if (active) setUserId(session?.user.id ?? null);
      },
    );
    void initializeAuthSession(supabase().auth)
      .then(({ session }) => {
        if (active) setUserId(session?.user.id ?? null);
      })
      .catch((error: unknown) => {
        if (active) setNotice(clientErrorMessage(error));
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
      window.removeEventListener('pageshow', restored);
    };
  }, []);

  // Reads the status, then (only after the answer) schedules the next read while
  // the webhook is still expected: a slow API cannot starve the polling.
  useEffect(() => {
    // Another account must never see the previous one's state.
    setStatus(null);
    setAttempts(0);
    if (!userId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (done: number) => {
      let next: BillingStatus | null = null;
      try {
        const body = await api<unknown>('/billing/status', {}, 'v1', userId);
        if (!isBillingStatus(body)) throw new ClientError('REQUEST_FAILED');
        next = body;
        if (!cancelled) {
          setStatus(body);
          setNotice('');
        }
      } catch (error) {
        if (cancelled) return;
        // Billing switched off (or not configured yet): the server answers 404.
        if (
          error instanceof ClientError &&
          error.code === 'BILLING_UNAVAILABLE'
        ) {
          setUnavailable(true);
          return;
        }
        setNotice(clientErrorMessage(error));
      }
      if (cancelled) return;
      setAttempts(done + 1);
      if (shouldPoll(result, next, done + 1))
        timer = setTimeout(() => void load(done + 1), POLL_INTERVAL_MS);
    };
    void load(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [userId, result]);

  async function startCheckout() {
    if (!userId) return;
    setBusy(true);
    setNotice('');
    try {
      const body = await api<{ url?: unknown }>(
        '/billing/checkout',
        { method: 'POST', body: '{}' },
        'v1',
        userId,
      );
      const url = safeCheckoutUrl(body.url);
      if (!url) throw new ClientError('REQUEST_FAILED');
      window.location.assign(url);
    } catch (error) {
      setNotice(clientErrorMessage(error));
      setBusy(false);
      // Already subscribed (409): show the real state instead of a stale offer.
      if (
        error instanceof ClientError &&
        error.code === 'BILLING_ALREADY_SUBSCRIBED'
      )
        window.location.reload();
    }
  }

  const view = billingView({
    authConfigured,
    authReady,
    userId,
    unavailable,
    status,
    failed: Boolean(notice),
    result,
    attempts,
  });
  return (
    <section className="panel narrow">
      <h1>{t('billing.title')}</h1>
      {notice && (
        <p className="notice error" role="alert">
          {notice}
        </p>
      )}
      {view.kind === 'not-configured' && <p>{t('billing.notConfigured')}</p>}
      {view.kind === 'sign-in' && <p>{t('billing.signIn')}</p>}
      {view.kind === 'unavailable' && <p>{t('billing.unavailable')}</p>}
      {view.kind === 'loading' && <p role="status">{t('billing.loading')}</p>}
      {view.kind === 'ready' && (
        <>
          {view.banner && (
            <p className="notice" role="status">
              {t(`billing.banner.${view.banner}`)}
            </p>
          )}
          <p>{t(`billing.state.${view.status.state}`)}</p>
          <p>
            {t('billing.chapters', {
              paid: view.status.paidChaptersAvailable,
              taster: view.status.tasterChaptersAvailable,
            })}
          </p>
          {view.offerCheckout && (
            <>
              <h2>{t('billing.offerTitle')}</h2>
              <p>{t('billing.offer')}</p>
              <p>{t('billing.offerTerms')}</p>
              <p>
                <a href="/terms">{t('legal.termsLink')}</a>
                {' · '}
                <a href="/privacy-notice">{t('legal.privacyLink')}</a>
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void startCheckout()}
              >
                {t('billing.subscribe')}
              </button>
            </>
          )}
          {view.offerRefresh && (
            <button
              className="secondary"
              onClick={() => window.location.reload()}
            >
              {t('billing.refresh')}
            </button>
          )}
          {view.manage && (
            <p>
              {t('billing.manage')}{' '}
              <a href="mailto:info@alterward.com">info@alterward.com</a>
            </p>
          )}
        </>
      )}
    </section>
  );
}
