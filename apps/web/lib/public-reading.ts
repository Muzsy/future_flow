'use client';
import { useCallback, useEffect, useRef } from 'react';
import {
  publicReadingSessionSchema,
  publicReadingReceiptSchema,
  type PublicReadingSession,
  type PublicReadingSignal,
} from '@future-flow/contracts';
type Reading = {
  slug: string;
  id: string;
  session: PublicReadingSession | null;
  closed: boolean;
  sent: Set<PublicReadingSignal>;
  pending: Set<PublicReadingSignal>;
};
const base = () =>
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(
    /\/v[12]\/?$/,
    '/public/reading',
  );
export function usePublicReading(slug: string | undefined, available: boolean) {
  const reading = useRef<Reading | null>(null),
    live = useRef(false);
  useEffect(() => {
    live.current = false;
    if (
      !slug ||
      navigator.doNotTrack === '1' ||
      (navigator as Navigator & { globalPrivacyControl?: boolean })
        .globalPrivacyControl
    )
      return;
    if (reading.current?.slug !== slug)
      reading.current = {
        slug,
        id: crypto.randomUUID(),
        session: null,
        closed: false,
        sent: new Set(),
        pending: new Set(),
      };
    const own = reading.current,
      abort = new AbortController();
    if (!available || own.closed) return;
    live.current = true;
    async function start() {
      if (own.session && new Date(own.session.expiresAt).getTime() > Date.now())
        return;
      if (own.session) {
        own.id = crypto.randomUUID();
        own.session = null;
        own.sent.clear();
      }
      try {
        const response = await fetch(
          `${base()}/${encodeURIComponent(own.slug)}`,
          {
            method: 'POST',
            body: JSON.stringify({ readingId: own.id }),
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
            signal: abort.signal,
          },
        );
        if (!response.ok) {
          if (!abort.signal.aborted && response.status === 404)
            own.closed = true;
          return;
        }
        const session = publicReadingSessionSchema.parse(await response.json());
        if (session.slug !== own.slug || session.readingId !== own.id)
          throw Error('Wrong reading session');
        if (!abort.signal.aborted && reading.current === own)
          own.session = session;
      } catch {
        /* Measurements never replace a successfully loaded story. */
      }
    }
    void start();
    return () => {
      live.current = false;
      abort.abort();
    };
  }, [slug, available]);
  return useCallback(
    async (signal: PublicReadingSignal) => {
      const own = reading.current;
      if (
        !live.current ||
        !own ||
        own.slug !== slug ||
        !own.session ||
        own.sent.has(signal) ||
        own.pending.has(signal)
      )
        return;
      own.pending.add(signal);
      try {
        const response = await fetch(
          `${base()}/${encodeURIComponent(own.slug)}/signals`,
          {
            method: 'POST',
            body: JSON.stringify({ readingId: own.session.readingId, signal }),
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
          },
        );
        if (
          response.ok &&
          publicReadingReceiptSchema.parse(await response.json()).received
        )
          own.sent.add(signal);
      } catch {
        /* A missing measurement must not change content or permissions. */
      } finally {
        own.pending.delete(signal);
      }
    },
    [slug],
  );
}
