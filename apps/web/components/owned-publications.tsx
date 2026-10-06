'use client';
import { useEffect, useRef, useState } from 'react';
import type {
  PublicationOwnerView,
  OfficialPublicationOwnerView,
} from '@future-flow/contracts';
import { verifiedOwnedOfficialPublication } from '../lib/official-publication';
import { OfficialPublicationControls } from './official-publication-controls';
import { lifeApi } from '../lib/client';
import { verifiedOwnedPublication, publicationError } from '../lib/publication';
import { PublicationControls } from './publication-controls';
export function OwnedPublications() {
  const [views, setViews] = useState<PublicationOwnerView[]>([]),
    [officialViews, setOfficialViews] = useState<
      OfficialPublicationOwnerView[]
    >([]),
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
      const officialRaw = await lifeApi<unknown>('/official-publications', {
        signal: abort.signal,
      });
      if (!Array.isArray(officialRaw)) throw Error('Invalid Official list');
      const nextOfficial = await Promise.all(
        officialRaw.map(verifiedOwnedOfficialPublication),
      );
      if (!abort.signal.aborted) {
        setViews(next);
        setOfficialViews(nextOfficial);
        setNotice(
          next.length || nextOfficial.length
            ? ''
            : 'You have no published copies yet.',
        );
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        setViews([]);
        setOfficialViews([]);
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
        {officialViews.map((view) => (
          <article key={view.publicationId}>
            <h2>{view.snapshot.story.title}</h2>
            <OfficialPublicationControls
              view={view}
              onChange={(next) =>
                setOfficialViews((current) =>
                  current.map((item) =>
                    item.publicationId === next.publicationId ? next : item,
                  ),
                )
              }
            />
          </article>
        ))}
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
