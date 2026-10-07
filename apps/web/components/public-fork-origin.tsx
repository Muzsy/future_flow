'use client';
import { useEffect, useState } from 'react';
import {
  publicForkAttributionSchema,
  type PublicForkAttribution,
  type PublicForkInitialChoice,
} from '@future-flow/contracts';
import { lifeApi } from '../lib/client';
export function PublicForkOrigin({
  lifeId,
  initialChoice,
}: {
  lifeId: string;
  initialChoice: PublicForkInitialChoice;
}) {
  const [origin, setOrigin] = useState<PublicForkAttribution | null>(null);
  useEffect(() => {
    let controller: AbortController | null = null,
      stopped = false;
    setOrigin(null);
    function read() {
      controller?.abort();
      const abort = new AbortController();
      controller = abort;
      void lifeApi(`/public-forks/lives/${lifeId}/source`, {
        signal: abort.signal,
      })
        .then((raw) => {
          const next = publicForkAttributionSchema.parse(raw);
          if (next.lifeId !== lifeId) throw Error('Wrong private life');
          if (!stopped && !abort.signal.aborted) setOrigin(next);
        })
        .catch(() => {
          if (!stopped && !abort.signal.aborted) setOrigin(null);
        });
    }
    function refresh() {
      if (document.visibilityState === 'visible') read();
      else {
        controller?.abort();
        setOrigin(null);
      }
    }
    read();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      stopped = true;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [lifeId]);
  return (
    <aside className="panel" aria-label="Your starting choice">
      <h2>Your starting choice</h2>
      <p>{initialChoice.prompt}</p>
      <p>
        <strong>{initialChoice.label}</strong> — {initialChoice.description}
      </p>
      <p>
        This choice was applied when your private life began. Your life
        continues independently.
      </p>
      {origin?.source && (
        <p>
          Based on a published{' '}
          {origin.source.classification === 'official'
            ? 'Official'
            : 'Community'}{' '}
          life:{' '}
          <a
            href={`${origin.source.classification === 'official' ? '/official-lives' : '/lives'}/${origin.source.slug}`}
            referrerPolicy="no-referrer"
          >
            {origin.source.title}
          </a>
          .
        </p>
      )}
    </aside>
  );
}
