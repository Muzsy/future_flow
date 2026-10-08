'use client';
import { useEffect, useState } from 'react';
import {
  publicCollectionPageSchema,
  publicCollectionTitles,
  type PublicCollectionKey,
  type PublicCollectionPage,
} from '@future-flow/contracts';
import { CollectionNavigation } from './collection-navigation';
import { discoveryLifeLink, discoveryCategories } from '../lib/discovery';
export function CuratedLives({
  collectionId,
}: {
  collectionId: PublicCollectionKey | null;
}) {
  const [view, setView] = useState<PublicCollectionPage | null>(null),
    [notice, setNotice] = useState('Loading this collection…');
  useEffect(() => {
    if (!collectionId) {
      setView(null);
      setNotice('This collection link is invalid.');
      return;
    }
    let stopped = false,
      controller: AbortController | null = null;
    const base = (
      process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'
    ).replace(/\/v[12]\/?$/, '/public');
    async function read(clear = false) {
      controller?.abort();
      const abort = new AbortController();
      controller = abort;
      if (clear) setView(null);
      try {
        const response = await fetch(
          base + '/collections/' + encodeURIComponent(collectionId!),
          {
            credentials: 'same-origin',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
            signal: abort.signal,
          },
        );
        if (!response.ok) {
          if (response.status === 404) {
            if (!stopped && !abort.signal.aborted) {
              setView(null);
              setNotice(
                'Collections are not open yet. Please check back soon.',
              );
            }
            return;
          }
          throw Error('Unavailable');
        }
        const next = publicCollectionPageSchema.parse(await response.json());
        if (next.collectionId !== collectionId) throw Error('Wrong collection');
        if (!stopped && !abort.signal.aborted) {
          setView(next);
          setNotice('');
        }
      } catch {
        if (!stopped && !abort.signal.aborted) {
          setView(null);
          setNotice('We could not load this collection. Please try again.');
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
    window.addEventListener('focus', focus);
    window.addEventListener('pageshow', focus);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stopped = true;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener('focus', focus);
      window.removeEventListener('pageshow', focus);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [collectionId]);
  return (
    <>
      <header>
        <a className="brand" href="/">
          alterward
        </a>
        <div className="header-actions">
          <a href="/lives">Your lives</a>
          <a href="/login">Sign in</a>
        </div>
      </header>
      <main className="publication-page discovery-page">
        <h1>
          {collectionId
            ? publicCollectionTitles[collectionId]
            : 'Life collections'}
        </h1>
        <p>
          Stories selected for the choices they explore and the paths they take.
        </p>
        <CollectionNavigation current={collectionId ?? undefined} />
        <p className="muted">English stories · Selected by our editors</p>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {view && (
          <>
            {view.items.length === 0 && (
              <p role="status">
                No lives in this collection yet. Explore all lives while we
                prepare the next selection.
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
                    {card.periodCount}{' '}
                    {card.periodCount === 1 ? 'period' : 'periods'} ·
                    AI-generated
                    {card.userEdited ? ' · Edited by the author' : ''}
                  </p>
                </article>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
