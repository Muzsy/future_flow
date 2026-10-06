'use client';
import { useEffect, useState } from 'react';
import {
  officialPublicationReaderSchema,
  type OfficialPublicationReader as Reader,
} from '@future-flow/contracts';
import { PublicationContent } from './publication-content';
import { SaveLifeButton } from './save-life-button';
import { ShareLifeButton } from './share-life-button';
export function OfficialPublicationReader({ slug }: { slug?: string }) {
  const [view, setView] = useState<Reader | null>(null),
    [notice, setNotice] = useState('Loading this life…');
  useEffect(() => {
    let controller: AbortController | null = null,
      stopped = false;
    const base = (
      process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'
    ).replace(/\/v[12]\/?$/, '/public');
    async function read(clear = false) {
      controller?.abort();
      const abort = new AbortController();
      controller = abort;
      if (clear) setView(null);
      const token = slug ? null : window.location.hash.slice(1);
      if (!slug && !/^[A-Za-z0-9_-]{43}$/.test(token ?? '')) {
        setView(null);
        setNotice('This life is unavailable. Check the full secret link.');
        return;
      }
      try {
        const response = await fetch(
          `${base}/${slug ? `official-lives/${encodeURIComponent(slug)}` : 'official-unlisted'}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
            signal: abort.signal,
          },
        );
        if (!response.ok) throw Error('Unavailable');
        const next = officialPublicationReaderSchema.parse(
          await response.json(),
        );
        if (
          (slug && next.slug !== slug) ||
          next.visibility !== (slug ? 'public' : 'unlisted')
        )
          throw Error('Wrong copy');
        if (!stopped && !abort.signal.aborted) {
          setView(next);
          setNotice('');
        }
      } catch {
        if (!stopped && !abort.signal.aborted) {
          setView(null);
          setNotice(
            'This life is unavailable. It may have been withdrawn or its link renewed.',
          );
        }
      }
    }
    const visible = () => {
      if (document.visibilityState === 'visible') void read(true);
      else {
        controller?.abort();
        setView(null);
      }
    };
    const focus = () => void read(true);
    void read(true);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void read();
    }, 30000);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', focus);
    window.addEventListener('hashchange', focus);
    window.addEventListener('pageshow', focus);
    return () => {
      stopped = true;
      controller?.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', focus);
      window.removeEventListener('hashchange', focus);
      window.removeEventListener('pageshow', focus);
    };
  }, [slug]);
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
        <h1>An Official life</h1>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {view && (
          <>
            <p>
              Published {new Date(view.publishedAt).toLocaleDateString('en')} ·{' '}
              {view.visibility === 'unlisted'
                ? 'Shared by secret link'
                : 'Public copy'}
            </p>
            <PublicationContent snapshot={view.snapshot} />
            {slug && <SaveLifeButton slug={slug} />}
            {slug && <ShareLifeButton slug={slug} />}
          </>
        )}
      </main>
    </>
  );
}
