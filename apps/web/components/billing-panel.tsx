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
  canStartCheckout,
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
    if (!authConfigured) {
      setAuthReady(true);
      return;
    }
    let active = true;
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
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const body = await api<unknown>('/billing/status', {}, 'v1', userId);
        if (cancelled) return;
        if (!isBillingStatus(body)) throw new ClientError('REQUEST_FAILED');
        setStatus(body);
        setNotice('');
      } catch (error) {
        if (cancelled) return;
        // Billing switched off (or not configured yet): the server answers 404.
        if (
          error instanceof ClientError &&
          error.code === 'BILLING_UNAVAILABLE'
        )
          setUnavailable(true);
        else setNotice(clientErrorMessage(error));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // Re-run for each polling attempt after a successful checkout.
  }, [userId, attempts]);

  useEffect(() => {
    if (unavailable || !shouldPoll(result, status, attempts)) return;
    const timer = setTimeout(() => setAttempts((n) => n + 1), POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [result, status, attempts, unavailable]);

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
    }
  }

  const polling = shouldPoll(result, status, attempts);
  const waitedTooLong =
    result === 'success' &&
    !polling &&
    (!status || canStartCheckout(status.state));
  return (
    <section className="panel narrow">
      <h1>{t('billing.title')}</h1>
      {notice && (
        <p className="notice error" role="alert">
          {notice}
        </p>
      )}
      {!authConfigured ? (
        <p>{t('billing.notConfigured')}</p>
      ) : !authReady ? null : !userId ? (
        <p>{t('billing.signIn')}</p>
      ) : unavailable ? (
        <p>{t('billing.unavailable')}</p>
      ) : !status ? (
        notice ? null : (
          <p role="status">{t('billing.loading')}</p>
        )
      ) : (
        <>
          {result === 'cancel' && (
            <p className="notice" role="status">
              {t('billing.cancelled')}
            </p>
          )}
          {polling && (
            <p className="notice" role="status">
              {t('billing.activating')}
            </p>
          )}
          {waitedTooLong && (
            <p className="notice" role="status">
              {t('billing.slow')}
            </p>
          )}
          <p>{t(`billing.state.${status.state}`)}</p>
          <p>
            {t('billing.chapters', {
              paid: status.paidChaptersAvailable,
              taster: status.tasterChaptersAvailable,
            })}
          </p>
          {canStartCheckout(status.state) && (
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
                disabled={busy || polling}
                onClick={() => void startCheckout()}
              >
                {t('billing.subscribe')}
              </button>
            </>
          )}
          {!canStartCheckout(status.state) && (
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
