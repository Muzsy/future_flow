'use client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, GitBranch, LogOut } from 'lucide-react';
import { authConfigured, supabase } from '../lib/client';

export function SiteHeader({
  current,
}: {
  current?: 'discover' | 'scenarios' | 'saved' | 'lives';
}) {
  const [user, setUser] = useState<string | null>(null);

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
      const { data } = auth.onAuthStateChange((_event, session) => {
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
        <nav className="nav" aria-label="Main navigation">
          <a
            href="/discover"
            className={current === 'discover' ? 'active' : ''}
            aria-current={current === 'discover' ? 'page' : undefined}
          >
            Discover lives
          </a>
          <a
            href="/scenarios"
            className={current === 'scenarios' ? 'active' : ''}
            aria-current={current === 'scenarios' ? 'page' : undefined}
          >
            Explore Scenarios
          </a>
          {user && (
            <a
              href="/saved"
              className={current === 'saved' ? 'active' : ''}
              aria-current={current === 'saved' ? 'page' : undefined}
            >
              Saved lives
            </a>
          )}
          <a
            href="/lives"
            className={current === 'lives' ? 'active' : ''}
            aria-current={current === 'lives' ? 'page' : undefined}
          >
            My lives
          </a>
          {user ? (
            <button
              type="button"
              className="login"
              onClick={() => void handleSignOut()}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          ) : (
            <a className="login" href="/login">
              Sign in
              <ArrowUpRight size={12} />
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}
