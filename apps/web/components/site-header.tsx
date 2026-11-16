'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, GitBranch, Menu, X } from 'lucide-react';
import { clearLifeDraftCache } from '../lib/life-draft-cache';
import { authConfigured, supabase } from '../lib/client';
import { usePublicCapabilities } from '../lib/public-capabilities';
import { cameFromSitePage, markSitePage } from '../lib/site-history';
import { LanguageSelect, useLanguage } from './language-provider';
import { ProfileMenu } from './profile-menu';

export type SiteHeaderPage =
  | 'discover'
  | 'scenarios'
  | 'saved'
  | 'lives'
  | 'publications'
  | 'billing'
  | 'account';

// The header of every page outside the main app shell (public readers,
// Discover, Scenarios, billing, account and the legal pages). It offers the
// same main menu, profile menu, language choice and labels as the app header,
// so moving between the two never hides a destination. A public area is listed only while it is switched
// on (or when it is the current page).
export function SiteHeader({ current }: { current?: SiteHeaderPage }) {
  const { t } = useLanguage();
  const [user, setUser] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const publicAreas = usePublicCapabilities(user);

  useEffect(() => {
    markSitePage(window.location.pathname);
  }, []);

  useEffect(() => {
    if (!authConfigured) return;
    try {
      const auth = supabase().auth;
      auth
        .getSession()
        .then(({ data }) => {
          setUser(data.session?.user.email ?? null);
        })
        .catch(() => {});
      const { data } = auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') clearLifeDraftCache();
        setUser(session?.user.email ?? null);
      });
      return () => data.subscription.unsubscribe();
    } catch {
      /* Auth not configured in non-browser or test context */
    }
  }, []);

  const handleSignOut = async () => {
    if (!authConfigured) return;
    try {
      await supabase().auth.signOut();
      window.location.href = '/';
    } catch {
      window.location.href = '/';
    }
  };

  const link = (page: SiteHeaderPage, href: string, label: string) => (
    <a
      href={href}
      className={current === page ? 'active' : ''}
      aria-current={current === page ? 'page' : undefined}
    >
      {label}
    </a>
  );

  return (
    <header>
      <a className="brand" href="/">
        <span className="brand-icon">
          <GitBranch size={23} />
        </span>
        alterward
        <span
          style={{
            fontSize: 10,
            letterSpacing: 1,
            color: '#889280',
            alignSelf: 'start',
            marginTop: 3,
          }}
        >
          ALPHA
        </span>
      </a>
      <div className="header-actions">
        <LanguageSelect />
        <nav className="nav" aria-label={t('nav.main')}>
          {user ? (
            <>
              <div
                id="site-nav-links"
                className={`nav-links${menuOpen ? ' open' : ''}`}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setMenuOpen(false);
                }}
              >
                {(publicAreas.discover || current === 'discover') &&
                  link('discover', '/discover', t('nav.discover'))}
                {(publicAreas.scenarios || current === 'scenarios') &&
                  link('scenarios', '/scenarios', t('nav.scenarios'))}
                {(publicAreas.saved || current === 'saved') &&
                  link('saved', '/saved', t('nav.saved'))}
                {link('lives', '/lives', t('nav.lives'))}
                <a href="/start">{t('nav.startLife')}</a>
                {(publicAreas.publications || current === 'publications') &&
                  link('publications', '/publications', t('nav.publications'))}
              </div>
              <button
                type="button"
                className="menu-toggle"
                aria-expanded={menuOpen}
                aria-controls="site-nav-links"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setMenuOpen(false);
                }}
                onClick={() => setMenuOpen((open) => !open)}
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </>
          ) : (
            <a href="/privacy">{t('nav.privacy')}</a>
          )}
          {user ? (
            <ProfileMenu email={user} onSignOut={handleSignOut} />
          ) : (
            <a className="login" href="/login">
              {t('auth.signInShort')}
              <ArrowUpRight size={12} />
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}

// Goes back to where the reader came from on this site; with no such page (a
// direct link, a new tab) it goes to the home page instead of leaving the site.
export function BackLink() {
  const { t } = useLanguage();
  const back = () => {
    const path = window.location.pathname;
    markSitePage(path);
    if (cameFromSitePage(path) && window.history.length > 1)
      window.history.back();
    else window.location.href = '/';
  };
  return (
    <p className="page-back">
      <button type="button" className="secondary" onClick={back}>
        <ArrowLeft size={14} /> {t('common.back')}
      </button>
    </p>
  );
}
