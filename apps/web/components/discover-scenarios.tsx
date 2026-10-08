'use client';
import { useEffect, useState } from 'react';
import {
  type ScenarioDiscoveryQuery,
  type ScenarioDiscoveryPage,
} from '@future-flow/contracts';
import { scenarioPublicApi } from '../lib/scenario-ui';
import {
  scenarioDiscoverySearch,
  scenarioDiscoveryReaderLink,
  scenarioDiscoveryPageLink,
  verifiedScenarioDiscoveryPage,
} from '../lib/scenario-discovery';
export function DiscoverScenarios({
  query,
}: {
  query: ScenarioDiscoveryQuery | null;
}) {
  const [view, setView] = useState<ScenarioDiscoveryPage | null>(null),
    [notice, setNotice] = useState('Loading Scenarios…');
  const search = query ? scenarioDiscoverySearch(query) : null;
  useEffect(() => {
    let controller: AbortController | null = null,
      stopped = false;
    if (!query || search === null) {
      setView(null);
      setNotice('This search link is invalid. Clear the search and try again.');
      return;
    }
    async function read(clear = false) {
      controller?.abort();
      const abort = new AbortController();
      controller = abort;
      if (clear) {
        setView(null);
        setNotice('Loading Scenarios…');
      }
      try {
        const result = verifiedScenarioDiscoveryPage(
          await scenarioPublicApi(
            '/scenarios' + (search ? '?' + search : ''),
            abort.signal,
          ),
          query!,
        );
        if (!stopped && !abort.signal.aborted) {
          setView(result);
          setNotice('');
        }
      } catch {
        if (!stopped && !abort.signal.aborted) {
          setView(null);
          setNotice(
            'Scenarios are not available right now. Please try again later.',
          );
        }
      }
    }
    const focus = () => void read(true),
      visibility = () => {
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
          <a href="/discover">Discover lives</a>
          <a href="/scenarios" aria-current="page">
            Explore Scenarios
          </a>
          <a href="/lives">Your lives</a>
          <a href="/login">Sign in</a>
        </nav>
      </header>
      <main className="publication-page discovery-page">
        <div>
          <span className="eyebrow">A starting point. Your direction.</span>
          <h1>Explore Scenarios</h1>
          <p>
            Choose a fictional situation, review its starting context, and make
            it your own. Your decisions will shape a separate AI-generated life.
          </p>
        </div>
        <form
          className="discovery-filters"
          action="/scenarios"
          method="get"
          key={search}
        >
          <label>
            Search Scenarios
            <input
              type="search"
              name="q"
              maxLength={80}
              defaultValue={query?.q ?? ''}
              placeholder="A new skill, a small business, a different rhythm…"
            />
          </label>
          <button className="primary" type="submit">
            Find Scenarios
          </button>
          <a className="discovery-clear" href="/scenarios">
            Clear search
          </a>
        </form>
        <p className="muted">English Scenarios · Newest first</p>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {view && (
          <>
            {view.items.length === 0 && (
              <p role="status">No Scenarios found. Try another search.</p>
            )}
            <div className="discovery-grid">
              {view.items.map((card) => (
                <article className="discovery-card" key={card.slug}>
                  <div className="discovery-card-meta">
                    <span>Official Scenario</span>
                    <span>
                      {card.allowPersonalization
                        ? 'Personalizable starting point'
                        : 'Read-only starting point'}
                    </span>
                  </div>
                  <h2>
                    <a href={scenarioDiscoveryReaderLink(card)}>{card.title}</a>
                  </h2>
                  <p>{card.summary}</p>
                  <p className="muted">Goal: {card.goalDescription}</p>
                  <a
                    className="discovery-read"
                    href={scenarioDiscoveryReaderLink(card)}
                  >
                    Explore this Scenario <span aria-hidden="true">→</span>
                  </a>
                </article>
              ))}
            </div>
            <nav className="header-actions" aria-label="Scenario pages">
              {view.page > 1 && (
                <a href={scenarioDiscoveryPageLink(query!, view.page - 1)}>
                  Previous
                </a>
              )}
              <span>Page {view.page}</span>
              {view.hasMore && (
                <a href={scenarioDiscoveryPageLink(query!, view.page + 1)}>
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
