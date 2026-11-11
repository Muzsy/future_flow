'use client';
import { useEffect, useRef, useState } from 'react';
import { TURNSTILE_SCRIPT_URL } from '../lib/turnstile';
import { useLanguage } from './language-provider';

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: Record<string, unknown>,
  ) => string | undefined;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error('turnstile-missing'));
    script.onerror = () => reject(new Error('turnstile-load-failed'));
    document.head.append(script);
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

// `resetCounter` increments after every request that consumed the token.
export function TurnstileWidget({
  siteKey,
  resetCounter,
  onToken,
}: {
  siteKey: string;
  resetCounter: number;
  onToken: (token: string) => void;
}) {
  const { locale, t } = useLanguage();
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const callback = useRef(onToken);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    callback.current = onToken;
  }, [onToken]);
  useEffect(() => {
    let active = true;
    const element = container.current;
    if (!element) return;
    setFailed(false);
    loadTurnstile()
      .then((api) => {
        if (!active) return;
        const id = api.render(element, {
          sitekey: siteKey,
          language: locale,
          theme: 'auto',
          'refresh-expired': 'auto',
          callback: (token: string) => {
            setFailed(false);
            callback.current(token);
          },
          'expired-callback': () => callback.current(''),
          'timeout-callback': () => callback.current(''),
          'error-callback': () => {
            callback.current('');
            setFailed(true);
            return true;
          },
        });
        if (id !== undefined) widget.current = { api, id };
        else setFailed(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      callback.current('');
      const current = widget.current;
      widget.current = null;
      if (current) current.api.remove(current.id);
    };
  }, [siteKey, locale]);
  useEffect(() => {
    const current = widget.current;
    if (resetCounter > 0 && current) current.api.reset(current.id);
  }, [resetCounter]);
  return (
    <div className="captcha">
      <div ref={container} />
      {failed && (
        <p className="notice" role="alert">
          {t('auth.captchaFailed')}
        </p>
      )}
    </div>
  );
}
