'use client';
import { useEffect, useRef, useState } from 'react';
import type { PublicationOwnerView } from '@future-flow/contracts';
import { lifeApi } from '../lib/client';
import { verifiedOwnedPublication, publicationError } from '../lib/publication';
import { PublicationControls } from './publication-controls';
export function OwnedPublications() {
  const [views, setViews] = useState<PublicationOwnerView[]>([]),
    [notice, setNotice] = useState('Loading your published copies…');
  const controller = useRef<AbortController | null>(null);
  async function read() {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    try {
      const raw = await lifeApi<unknown>('/publications', {
        signal: abort.signal,
      });
      if (!Array.isArray(raw)) throw Error('Invalid list');
      const next = await Promise.all(raw.map(verifiedOwnedPublication));
      if (!abort.signal.aborted) {
        setViews(next);
        setNotice(next.length ? '' : 'You have no published copies yet.');
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        setViews([]);
        setNotice(publicationError(error));
      }
    }
  }
  useEffect(() => {
    void read();
    return () => controller.current?.abort();
  }, []);
  return (
    <>
      <header>
        <a className="brand" href="/">
          alterward
        </a>
        <a href="/lives">My lives</a>
      </header>
      <main className="publication-page">
        <h1>My published copies</h1>
        <p>
          Manage access here, even after your private life has continued or its
          preparation preview has expired.
        </p>
        <button className="secondary" onClick={() => void read()}>
          Reload my publications
        </button>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {views.map((view) => (
          <article key={view.publicationId}>
            <h2>{view.snapshot.story.title}</h2>
            <PublicationControls
              view={view}
              onChange={(next) =>
                setViews((current) =>
                  current.map((item) =>
                    item.publicationId === next.publicationId ? next : item,
                  ),
                )
              }
            />
          </article>
        ))}
      </main>
    </>
  );
}
