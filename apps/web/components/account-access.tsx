'use client';
import { clearLifeDraftCache } from '../lib/life-draft-cache';
import { useEffect, useState, type FormEvent } from 'react';
import { initializeAuthSession } from '../lib/auth-session';
import {
  sendPasswordRecovery,
  signInWithPassword,
  type Captcha,
} from '../lib/auth-requests';
import { captchaSatisfied } from '../lib/turnstile';
import { useLanguage } from './language-provider';
import { TurnstileWidget } from './turnstile-widget';
import {
  api,
  authConfigured,
  clientErrorMessage,
  supabase,
} from '../lib/client';

// Deliberately independent of Experience, story navigation and catalog queries.
export function AccountAccess({
  turnstileSiteKey = null,
}: {
  turnstileSiteKey?: string | null;
}) {
  const { t } = useLanguage();
  const [userId, setUserId] = useState<string | null>(null),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [newPassword, setNewPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [notice, setNotice] = useState(''),
    [callbackFailed, setCallbackFailed] = useState(false),
    [authReady, setAuthReady] = useState(false),
    [busy, setBusy] = useState(false),
    [captchaToken, setCaptchaToken] = useState(''),
    [captchaReset, setCaptchaReset] = useState(0);
  const captchaOk = captchaSatisfied(turnstileSiteKey, captchaToken);
  useEffect(() => {
    if (!authConfigured) return;
    let active = true;
    const { data: subscription } = supabase().auth.onAuthStateChange(
      (event, session) => {
        if (!active) return;
        if (event === 'SIGNED_OUT') clearLifeDraftCache();
        setUserId(session?.user.id ?? null);
      },
    );
    void initializeAuthSession(supabase().auth)
      .then(({ session, error }) => {
        if (!active) return;
        setUserId(session?.user.id ?? null);
        if (error) {
          setCallbackFailed(true);
          setNotice(clientErrorMessage(error));
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCallbackFailed(true);
        setNotice(clientErrorMessage(error));
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);
  // A Turnstile token is single-use: `task` receives it for exactly one request.
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setNotice('');
    try {
      await task();
    } catch (error) {
      setNotice(clientErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  // Runs a request that needs a Turnstile token, then renews the challenge.
  function withCaptcha(task: (captcha: Captcha) => Promise<void>) {
    const captcha = { siteKey: turnstileSiteKey, token: captchaToken };
    setCaptchaToken('');
    void run(() => task(captcha)).finally(() =>
      setCaptchaReset((value) => value + 1),
    );
  }
  function signIn(event: FormEvent) {
    event.preventDefault();
    withCaptcha(async (captcha) => {
      const { error } = await signInWithPassword(
        supabase().auth,
        { email, password },
        captcha,
      );
      if (error) throw error;
      setCallbackFailed(false);
      setPassword('');
      setNotice('Signed in. Your data actions require a recent sign-in.');
    });
  }
  return (
    <section className="panel narrow">
      <h1>Account access</h1>
      <p>
        Download or delete your own data, including after your access has ended.
        This page does not give access to stories or create an account.
      </p>
      <p>
        <a href="/privacy-notice">Privacy and contact</a>
      </p>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {!authConfigured ? (
        <p>
          Account access is not configured yet. Contact{' '}
          <a href="mailto:info@alterward.com">info@alterward.com</a>.
        </p>
      ) : (
        <>
          <form onSubmit={signIn}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {turnstileSiteKey !== null && (
              <>
                <TurnstileWidget
                  siteKey={turnstileSiteKey}
                  resetCounter={captchaReset}
                  onToken={setCaptchaToken}
                />
                <p className="fineprint">{t('auth.captchaNote')}</p>
              </>
            )}
            <button
              className="primary"
              disabled={busy || !authReady || !captchaOk}
            >
              Sign in again
            </button>
          </form>
          <button
            className="text-button"
            disabled={busy || !authReady || !email || !captchaOk}
            onClick={() =>
              withCaptcha(async (captcha) => {
                const { error } = await sendPasswordRecovery(
                  supabase().auth,
                  {
                    email,
                    redirectTo: window.location.origin + '/account-access',
                  },
                  captcha,
                );
                if (error) throw error;
                setNotice(
                  'If recovery is available for this account, you will receive an email.',
                );
              })
            }
          >
            Send password recovery email
          </button>
          {authReady && userId && (
            <>
              <p>
                You are signed in. Use a fresh sign-in before exporting or
                deleting data.
              </p>
              <label className="field">
                <span>New password (for invitations or recovery)</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  disabled={callbackFailed}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </label>
              <button
                className="secondary"
                disabled={busy || callbackFailed || newPassword.length < 10}
                onClick={() =>
                  void run(async () => {
                    const { error } = await supabase().auth.updateUser({
                      password: newPassword,
                    });
                    if (error) throw error;
                    setNewPassword('');
                    setNotice(
                      'Password updated. Sign in again before downloading or deleting your data.',
                    );
                  })
                }
              >
                Set password
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const data = await api('/me/export', {}, 'v1', userId);
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(data, null, 2)], {
                        type: 'application/json',
                      }),
                    );
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = 'alterward-export.json';
                    anchor.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  })
                }
              >
                Download my data
              </button>
              <h2>Permanently delete account</h2>
              <p>
                This removes your account and its stories. This action cannot be
                undone.
              </p>
              <label className="field">
                <span>Type DELETE ACCOUNT to confirm</span>
                <input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
              <button
                className="primary danger"
                disabled={busy || confirmation !== 'DELETE ACCOUNT'}
                onClick={() =>
                  void run(async () => {
                    await api(
                      '/me',
                      {
                        method: 'DELETE',
                        body: JSON.stringify({ confirmation }),
                      },
                      'v1',
                      userId,
                    );
                    clearLifeDraftCache();
                    await supabase().auth.signOut();
                    setUserId(null);
                    setConfirmation('');
                    setPassword('');
                    setNewPassword('');
                    setNotice('Your account has been deleted.');
                  })
                }
              >
                Delete my account and stories
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const { error } = await supabase().auth.signOut();
                    if (error) throw error;
                    setPassword('');
                    setNewPassword('');
                    setConfirmation('');
                  })
                }
              >
                Sign out
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
