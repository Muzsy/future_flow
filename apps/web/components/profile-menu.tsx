'use client';
import { useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useLanguage } from './language-provider';

// The signed-in account menu of both headers (plan 050). Account pages live
// here instead of the main menu, and signing out always asks first: it ends
// the session and clears the local, unsaved story draft.
export function ProfileMenu({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: () => void | Promise<void>;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const initial = email.trim().charAt(0).toUpperCase() || '?';

  const close = () => {
    setOpen(false);
    setConfirming(false);
  };

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  return (
    <div
      className="profile-menu"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape') close();
      }}
    >
      <button
        type="button"
        className="profile-toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="profile-menu-list"
        aria-label={t('account.menu')}
        title={email}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {initial}
      </button>
      {open && (
        <div id="profile-menu-list" className="profile-menu-list" role="menu">
          <p className="profile-email">
            {t('account.signedInAs')}
            <strong>{email}</strong>
          </p>
          <a role="menuitem" href="/account">
            {t('account.title')}
          </a>
          <a role="menuitem" href="/billing">
            {t('billing.title')}
          </a>
          <a role="menuitem" href="/privacy">
            {t('nav.privacy')}
          </a>
          <hr />
          {confirming ? (
            <div className="profile-confirm" role="alertdialog">
              <p>{t('account.signOutConfirm')}</p>
              <div className="profile-confirm-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void Promise.resolve(onSignOut()).finally(() => {
                      setBusy(false);
                      close();
                    });
                  }}
                >
                  {t('auth.signOut')}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  {t('account.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="profile-signout"
              onClick={() => setConfirming(true)}
            >
              <LogOut size={15} /> {t('auth.signOut')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
