'use client';
import { useEffect, useState } from 'react';
import {
  discoveryPageSchema,
  type DiscoveryPage,
  type DiscoveryQuery,
} from '@future-flow/contracts';
import {
  discoveryCategories,
  discoverySearch,
  discoveryPageLink,
  discoveryLifeLink,
} from '../lib/discovery';
import { CollectionNavigation } from './collection-navigation';

export function DiscoverLives({ query }: { query: DiscoveryQuery | null }) {
  const [view, setView] = useState<DiscoveryPage | null>(null),
    [notice, setNotice] = useState('Loading lives…');
  const search = query ? discoverySearch(query) : null;
  useEffect(() => {
    let controller: AbortController | null = null,
      stopped = false;
    if (!query || search === null) {
      setView(null);
      setNotice(
        'This search link is invalid. Clear the filters and try again.',
      );
      return;
    }
    const base = (
      process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'
    ).replace(/\/v[12]\/?$/, '/public');
    async function read(clear = false) {
      controller?.abort();
      const abort = new AbortController();
      controller = abort;
      if (clear) {
        setView(null);
        setNotice('Loading lives…');
      }
      try {
        const response = await fetch(
          `${base}/discovery${search ? '?' + search : ''}`,
          {
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            headers: { 'Accept-Language': 'en' },
            signal: abort.signal,
          },
        );
        if (!response.ok) {
          if (response.status === 404) {
            if (!stopped && !abort.signal.aborted) {
              setView(null);
              setNotice('Discovery is not open yet. Please check back soon.');
            }
            return;
          }
          throw Error('Unavailable');
        }
        const next = discoveryPageSchema.parse(await response.json());
        if (
          next.page !== query!.page ||
          next.pageSize !== query!.pageSize ||
          next.items.some(
            (card) =>
              (query!.category && card.category !== query!.category) ||
              (query!.classification !== 'all' &&
                card.classification !== query!.classification),
          )
        )
          throw Error('Wrong search');
        if (!stopped && !abort.signal.aborted) {
          setView(next);
          setNotice('');
        }
      } catch {
        if (!stopped && !abort.signal.aborted) {
          setView(null);
          setNotice('We could not load these lives. Please try again.');
        }
      }
    }
    const focus = () => void read(true);
    const visibility = () => {
      if (document.visibilityState === 'visible') void read(true);
      else {
        controller?.abort();
        setView(null);
      }
    };
    void read(true);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void read();
    }, 30000);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', focus);
    window.addEventListener('pageshow', focus);
    return () => {
      stopped = true;
      controller?.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', focus);
      window.removeEventListener('pageshow', focus);
    };
  }, [search, query]);
  return (
    <>
      <header>
        <a className="brand" href="/">
          alterward
        </a>
        <nav className="nav" aria-label="Main navigation">
          <a href="/lives">Your lives</a>
          <a href="/login">Sign in</a>
        </nav>
      </header>
      <main className="publication-page discovery-page">
        <div>
          <span className="eyebrow">A choice. Another direction.</span>
          <h1>Discover lives</h1>
          <p>
            Explore the choices people face in AI-generated stories, and where
            those choices lead.
          </p>
        </div>
        <CollectionNavigation />
        <form
          className="discovery-filters"
          action="/discover"
          method="get"
          key={search}
        >
          <label>
            Search lives
            <input
              type="search"
              name="q"
              maxLength={80}
              defaultValue={query?.q ?? ''}
              placeholder="A goal, a choice, a new beginning…"
            />
          </label>
          <label>
            Category
            <select name="category" defaultValue={query?.category ?? ''}>
              <option value="">All categories</option>
              {discoveryCategories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Origin
            <select
              name="classification"
              defaultValue={query?.classification ?? 'all'}
            >
              <option value="all">All lives</option>
              <option value="official">Official lives</option>
              <option value="community">Community lives</option>
            </select>
          </label>
          <button className="primary" type="submit">
            Find lives
          </button>
          <a className="discovery-clear" href="/discover">
            Clear filters
          </a>
        </form>
        <p className="muted">English stories · Newest first</p>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {view && (
          <>
            {view.items.length === 0 && (
              <p role="status">
                No lives found. Try another search or category.
              </p>
            )}
            <div className="discovery-grid">
              {view.items.map((card) => (
                <article className="discovery-card" key={card.slug}>
                  <div className="discovery-card-meta">
                    <span>
                      {card.classification === 'official'
                        ? 'Official'
                        : 'Community'}
                    </span>
                    <span>
                      {
                        discoveryCategories.find(
                          (c) => c.value === card.category,
                        )?.label
                      }
                    </span>
                  </div>
                  <h2>
                    <a href={discoveryLifeLink(card)}>{card.title}</a>
                  </h2>
                  <p>{card.summary}</p>
                  <p className="muted">
                    AI-generated
                    {card.userEdited ? ' · Edited before publication' : ''}
                    {' · '}
                    {card.periodCount}{' '}
                    {card.periodCount === 1 ? 'chapter' : 'chapters'}
                  </p>
                  <a className="discovery-read" href={discoveryLifeLink(card)}>
                    Read this life <span aria-hidden="true">→</span>
                  </a>
                </article>
              ))}
            </div>
            <nav className="discovery-pagination" aria-label="Discovery pages">
              {query && view.page > 1 && (
                <a href={discoveryPageLink(query, view.page - 1)} rel="prev">
                  Previous
                </a>
              )}
              <span>Page {view.page}</span>
              {query && view.hasMore && (
                <a href={discoveryPageLink(query, view.page + 1)} rel="next">
                  Next
                </a>
              )}
            </nav>
          </>
        )}
      </main>
    </>
  );
}
