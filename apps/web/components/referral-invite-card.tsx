'use client';
import { useEffect, useState } from 'react';
import { ClientError, api, clientErrorMessage } from '../lib/client';
import { referralCard, type BillingStatus } from '../lib/billing';
import { inviteLink, inviteTokenFrom } from '../lib/referral-invite';
import { useLanguage } from './language-provider';

// The subscriber invite (ADR-011), shown on the account page (plan 050). The
// API decides eligibility; this card only reads it and signs a fresh link.
export function ReferralInviteCard({
  userId,
  status,
}: {
  userId: string;
  status: BillingStatus;
}) {
  const { t } = useLanguage();
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const card = referralCard(status);

  // Another account must never see the previous one's link.
  useEffect(() => {
    setInvite(null);
    setCopied(false);
    setNotice('');
  }, [userId]);

  if (card === null) return null;

  async function createInvite() {
    setBusy(true);
    setNotice('');
    setCopied(false);
    try {
      const body = await api<{ inviteToken?: unknown }>(
        '/billing/referral-invite',
        { method: 'POST', body: '{}' },
        'v1',
        userId,
      );
      const token = inviteTokenFrom(body.inviteToken);
      if (!token) throw new ClientError('REQUEST_FAILED');
      setInvite(inviteLink(window.location.origin, token));
    } catch (error) {
      setNotice(clientErrorMessage(error));
      // Already redeemed (409): show the real state instead of a stale offer.
      if (
        error instanceof ClientError &&
        error.code === 'BILLING_REFERRAL_USED'
      )
        window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section data-referral={card}>
      <h2>{t('referral.cardTitle')}</h2>
      {notice && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}
      {card === 'create' && (
        <>
          <p>{t('referral.cardBody')}</p>
          {invite ? (
            <>
              <p>{t('referral.created')}</p>
              <input
                type="text"
                readOnly
                aria-label={t('referral.cardTitle')}
                value={invite}
                onFocus={(event) => event.currentTarget.select()}
              />
              <p>
                <button className="secondary" onClick={() => void copyInvite()}>
                  {t('referral.copy')}
                </button>{' '}
                {copied && <span role="status">{t('referral.copied')}</span>}
              </p>
            </>
          ) : (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void createInvite()}
            >
              {t('referral.create')}
            </button>
          )}
        </>
      )}
      {card === 'redeemed' && <p>{t('referral.redeemed')}</p>}
      {card === 'revoked' && <p>{t('referral.revoked')}</p>}
    </section>
  );
}
