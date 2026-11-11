'use client';
import { TERMS_ACCEPTANCE_VERSION } from '@future-flow/contracts';
import { useEffect, useState } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { ClientError, api, clientErrorMessage } from '../lib/client';
import {
  admissionFromError,
  admissionFromStatus,
  canSubmitConsent,
  consentBody,
  consentFailure,
  type AdmissionState,
} from '../lib/admission';
import {
  consentStatusPath,
  forgetInvite,
  inviteTokenFrom,
  rememberInvite,
  rememberedInvite,
} from '../lib/referral-invite';
import { useLanguage } from './language-provider';

const errorCode = (error: unknown) =>
  error instanceof ClientError ? error.code : null;

// Reads the admission state of the signed-in account while `active`. The
// result is `checking` until the API has answered, so the generation UI never
// renders (or calls the API) for an account that is not admitted.
export function useAdmission(user: string | null, active: boolean) {
  const { t } = useLanguage();
  const [state, setState] = useState<AdmissionState>({ kind: 'checking' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!user || !active) return;
    let cancelled = false;
    setState({ kind: 'checking' });
    // An invitation the person arrived with (remembered across the sign-up and
    // the e-mail confirmation) is presented with the status read.
    api<unknown>(consentStatusPath(rememberedInvite()))
      .then((body) => {
        if (cancelled) return;
        const next = admissionFromStatus(body, t('error.network'));
        if (next.kind === 'admitted') forgetInvite();
        setState(next);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // A refused invitation is dropped so it is not presented again.
        if (errorCode(error) === 'SERVICE_INVITE_INVALID') forgetInvite();
        setState(
          admissionFromError(errorCode(error), clientErrorMessage(error)),
        );
      });
    return () => {
      cancelled = true;
    };
    // The translation function changes with the language; the check does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, active, attempt]);
  return {
    state,
    admitted: () => setState({ kind: 'admitted' }),
    full: (notice?: string) =>
      setState(notice ? { kind: 'full', notice } : { kind: 'full' }),
    recheck: () => setAttempt((value) => value + 1),
  };
}

export function AdmissionPanel({
  admission,
  onSignOut,
}: {
  admission: ReturnType<typeof useAdmission>;
  onSignOut: () => void;
}) {
  const { t } = useLanguage();
  const { state } = admission;
  const [adult, setAdult] = useState(false),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [inviteText, setInviteText] = useState(''),
    [inviteNotice, setInviteNotice] = useState('');
  function presentInvite() {
    const token = inviteTokenFrom(inviteText);
    if (!token) {
      setInviteNotice(
        clientErrorMessage(new ClientError('SERVICE_INVITE_INVALID')),
      );
      return;
    }
    setInviteNotice('');
    setInviteText('');
    rememberInvite(token);
    admission.recheck();
  }
  async function submit() {
    if (!canSubmitConsent(adult, accepted, busy)) return;
    setBusy(true);
    setNotice('');
    try {
      await api('/me/consent', {
        method: 'POST',
        body: JSON.stringify(consentBody(rememberedInvite())),
      });
      forgetInvite();
      admission.admitted();
    } catch (error) {
      const failure = consentFailure(
        errorCode(error),
        clientErrorMessage(error),
      );
      if (failure.kind === 'full') {
        if (failure.notice) forgetInvite();
        admission.full(failure.notice);
      } else setNotice(failure.message);
    } finally {
      setBusy(false);
    }
  }
  if (state.kind === 'checking')
    return <div className="empty">{t('admission.checking')}</div>;
  if (state.kind === 'full')
    return (
      <div className="panel narrow" data-admission="full">
        <Lock color="#2d6347" />
        <h1>{t('admission.fullTitle')}</h1>
        <p>{t('admission.fullBody')}</p>
        <p className="subtle">{t('admission.fullNothing')}</p>
        {(state.notice || inviteNotice) && (
          <div role="alert" className="notice error">
            {inviteNotice || state.notice}
          </div>
        )}
        <label className="field">
          <span>{t('admission.inviteLabel')}</span>
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={2048}
            value={inviteText}
            onChange={(event) => setInviteText(event.target.value)}
          />
        </label>
        <p>
          <button
            className="primary"
            disabled={inviteText.trim() === ''}
            onClick={presentInvite}
          >
            {t('admission.inviteSubmit')}
            <ArrowRight size={16} />
          </button>
        </p>
        <button className="secondary" onClick={admission.recheck}>
          {t('admission.recheck')}
        </button>{' '}
        <button className="secondary" onClick={onSignOut}>
          {t('auth.signOut')}
        </button>
      </div>
    );
  if (state.kind === 'error')
    return (
      <div className="panel narrow" data-admission="error">
        <h1>{t('admission.errorTitle')}</h1>
        <div role="alert" className="notice error">
          {state.message}
        </div>
        <button className="secondary" onClick={admission.recheck}>
          {t('admission.retry')}
        </button>{' '}
        <button className="secondary" onClick={onSignOut}>
          {t('auth.signOut')}
        </button>
      </div>
    );
  if (state.kind === 'consent')
    return (
      <div className="panel narrow" data-admission="consent">
        <h1>{t('admission.consentTitle')}</h1>
        <p>{t('admission.consentIntro')}</p>
        {notice && (
          <div role="alert" className="notice error">
            {notice}
          </div>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={adult}
            onChange={(event) => setAdult(event.target.checked)}
          />
          <span>{t('admission.adult')}</span>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          <span>
            {t('admission.acceptPrefix')}{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer">
              {t('legal.termsLink')}
            </a>{' '}
            {t('admission.acceptMiddle')}{' '}
            <a href="/privacy-notice" target="_blank" rel="noopener noreferrer">
              {t('legal.privacyLink')}
            </a>
            {t('admission.acceptSuffix')}
          </span>
        </label>
        <p className="fineprint">
          {t('admission.termsVersion')} {TERMS_ACCEPTANCE_VERSION}
        </p>
        <button
          className="primary"
          disabled={!canSubmitConsent(adult, accepted, busy)}
          onClick={() => void submit()}
        >
          {busy ? t('admission.submitting') : t('admission.submit')}
          <ArrowRight size={16} />
        </button>
      </div>
    );
  return null;
}
