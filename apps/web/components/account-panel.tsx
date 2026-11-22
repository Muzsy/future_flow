'use client';
import { useEffect, useState } from 'react';
import { initializeAuthSession } from '../lib/auth-session';
import { ClientError, api, authConfigured, supabase } from '../lib/client';
import { isBillingStatus, type BillingStatus } from '../lib/billing';
import { formatDate } from '../lib/i18n';
import { AccountAccess } from './account-access';
import { useLanguage } from './language-provider';
import { ReferralInviteCard } from './referral-invite-card';

type Identity = { id: string; email: string; createdAt: string | null };

// "My account" (plan 050): the account, subscription summary, the invite and
// the data rights in one place. It only reads existing endpoints; every write
// keeps its own page or control (checkout/portal on /billing, the invite card,
// and the recent-sign-in data actions shared with /account-access).
export function AccountPanel({
  turnstileSiteKey = null,
}: {
  turnstileSiteKey?: string | null;
}) {
  const { t, locale } = useLanguage();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [authReady, setAuthReady] = useState(!authConfigured);
  const [billing, setBilling] = useState<{
    userId: string;
    status: BillingStatus;
  } | null>(null);

  useEffect(() => {
    if (!authConfigured) return;
    let active = true;
    const read = (
      user: { id: string; email?: string; created_at?: string } | undefined,
    ) =>
      setIdentity(
        user
          ? {
              id: user.id,
              email: user.email ?? '',
              createdAt: user.created_at ?? null,
            }
          : null,
      );
    const { data } = supabase().auth.onAuthStateChange((_, session) => {
      if (active) read(session?.user);
    });
    void initializeAuthSession(supabase().auth)
      .then(({ session }) => {
        if (active) read(session?.user);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = identity?.id ?? null;
  useEffect(() => {
    setBilling(null);
    if (!userId) return;
    let cancelled = false;
    void api<unknown>('/billing/status', {}, 'v1', userId)
      .then((body) => {
        if (!cancelled && isBillingStatus(body))
          setBilling({ userId, status: body });
      })
      .catch((error: unknown) => {
        // Billing switched off answers 404: the section is simply not shown.
        if (!(error instanceof ClientError)) return;
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const status = billing && billing.userId === userId ? billing.status : null;

  return (
    <section className="panel narrow account-page">
      <h1>{t('account.title')}</h1>
      <p>{t('account.intro')}</p>
      {authReady && !identity && (
        <p>
          {t('account.signInPrompt')}{' '}
          <a href="/login">{t('auth.signInShort')}</a>
        </p>
      )}
      {identity && (
        <>
          <section>
            <h2>{t('account.detailsTitle')}</h2>
            <p>{t('account.email', { email: identity.email })}</p>
            {identity.createdAt && (
              <p>
                {t('account.since', {
                  date: formatDate(identity.createdAt, locale),
                })}
              </p>
            )}
          </section>
          {status && (
            <section>
              <h2>{t('account.subscriptionTitle')}</h2>
              <p>{t(`billing.state.${status.state}`)}</p>
              <p>
                {t('billing.chapters', {
                  paid: status.paidChaptersAvailable,
                  taster: status.tasterChaptersAvailable,
                })}
              </p>
              <p>
                <a href="/billing">{t('account.subscriptionManage')}</a>
              </p>
            </section>
          )}
          {status && userId && (
            <ReferralInviteCard userId={userId} status={status} />
          )}
          <section>
            <h2>{t('account.securityTitle')}</h2>
            <p>{t('account.securityIntro')}</p>
            <AccountAccess
              turnstileSiteKey={turnstileSiteKey}
              initialEmail={identity.email}
              embedded
            />
          </section>
        </>
      )}
      <section>
        <h2>{t('account.legalTitle')}</h2>
        <p>
          <a href="/privacy-notice">{t('legal.privacyLink')}</a>
          {' · '}
          <a href="/terms">{t('legal.termsLink')}</a>
        </p>
      </section>
    </section>
  );
}
