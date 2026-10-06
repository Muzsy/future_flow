'use client';
import { useEffect, useRef, useState } from 'react';
import {
  savedLivesPageSchema,
  savedLifeStatusSchema,
  type SavedLivesPage,
} from '@future-flow/contracts';
import {
  authConfigured,
  supabase,
  lifeApi,
  clientErrorMessage,
} from '../lib/client';
import { discoveryLifeLink } from '../lib/discovery';
export function SavedLives({ page }: { page: number | null }) {
  const [user, setUser] = useState<string | null>(null),
    [view, setView] = useState<SavedLivesPage | null>(null),
    [notice, setNotice] = useState('Sign in to see your saved lives.'),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    if (!authConfigured) return;
    const {
      data: { subscription },
    } = supabase().auth.onAuthStateChange((_event, session) => {
      generation.current++;
      setUser(session?.user.id ?? null);
      setView(null);
      setBusy(false);
      setNotice(
        session
          ? 'Loading your saved lives…'
          : 'Sign in to see your saved lives.',
      );
    });
    return () => {
      generation.current++;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    const own = ++generation.current;
    let controller: AbortController | null = null,
      stopped = false;
    async function read() {
      controller?.abort();
      const abort = new AbortController();
      controller = abort;
      setView(null);
      if (!user) return;
      if (page === null) {
        setNotice('This saved lives page link is invalid.');
        return;
      }
      setNotice('Loading your saved lives…');
      try {
        const next = savedLivesPageSchema.parse(
          await lifeApi(`/saved-lives?page=${page}`, {
            signal: abort.signal,
            referrerPolicy: 'no-referrer',
          }),
        );
        if (next.page !== page || next.pageSize !== 12)
          throw Error('Wrong page');
        if (!stopped && !abort.signal.aborted && own === generation.current) {
          setView(next);
          setNotice('');
        }
      } catch (error) {
        if (!stopped && !abort.signal.aborted && own === generation.current)
          setNotice(clientErrorMessage(error));
      }
    }
    const visible = () => {
      if (document.visibilityState === 'visible') void read();
      else {
        controller?.abort();
        setView(null);
      }
    };
    const focus = () => void read();
    void read();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void read();
    }, 30000);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', focus);
    window.addEventListener('pageshow', focus);
    return () => {
      stopped = true;
      controller?.abort();
      generation.current++;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', focus);
      window.removeEventListener('pageshow', focus);
    };
  }, [user, page, refresh]);
  async function remove(slug: string) {
    if (busy) return;
    const own = generation.current;
    setBusy(true);
    try {
      const result = savedLifeStatusSchema.parse(
        await lifeApi(`/saved-lives/${encodeURIComponent(slug)}`, {
          method: 'DELETE',
          referrerPolicy: 'no-referrer',
        }),
      );
      if (result.slug !== slug || result.saved) throw Error('Wrong response');
      if (own === generation.current) setRefresh((n) => n + 1);
    } catch (error) {
      if (own === generation.current) setNotice(clientErrorMessage(error));
    } finally {
      if (own === generation.current) setBusy(false);
    }
  }
  return (
    <>
      <header>
        <a className="brand" href="/">
          alterward
        </a>
        <div className="header-actions">
          <a href="/discover">Discover lives</a>
          <a href="/login">Sign in</a>
        </div>
      </header>
      <main className="publication-page">
        <h1>Saved lives</h1>
        <p>
          Your saves point to public lives. A withdrawn life is no longer
          readable here.
        </p>
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {view && (
          <>
            {view.items.length === 0 && (
              <p>
                No saved lives on this page. Explore{' '}
                <a href="/discover">Discovery</a> to find a life.
              </p>
            )}
            <div className="discovery-grid">
              {view.items.map((item) => (
                <article key={item.slug} className="discovery-card">
                  {item.card ? (
                    <>
                      <p>
                        {item.card.classification === 'official'
                          ? 'Official'
                          : 'Community'}{' '}
                        · AI generated
                      </p>
                      <h2>
                        <a href={discoveryLifeLink(item.card)}>
                          {item.card.title}
                        </a>
                      </h2>
                      <p>{item.card.summary}</p>
                    </>
                  ) : (
                    <>
                      <h2>Life unavailable</h2>
                      <p>This public copy is no longer available.</p>
                    </>
                  )}
                  <p>Saved {new Date(item.savedAt).toLocaleDateString('en')}</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(item.slug)}
                  >
                    Remove save
                  </button>
                </article>
              ))}
            </div>
            <nav
              className="discovery-pagination"
              aria-label="Saved lives pages"
            >
              {view.page > 1 && (
                <a href={`/saved?page=${view.page - 1}`}>Previous page</a>
              )}
              <span>Page {view.page}</span>
              {view.hasMore && (
                <a href={`/saved?page=${view.page + 1}`}>Next page</a>
              )}
            </nav>
          </>
        )}
      </main>
    </>
  );
}
