'use client';
import { useEffect, useRef, useState } from 'react';
import {
  officialPublicationReaderSchema,
  publicationReaderSchema,
  type PublicReadingSignal,
} from '@future-flow/contracts';
import { publicLifeShareUrl } from '../lib/public-life-link';
export function ShareLifeButton({
  slug,
  onSignal,
}: {
  slug: string;
  onSignal?: (signal: PublicReadingSignal) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [link, setLink] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
    },
    [slug],
  );
  async function share() {
    if (busy) return;
    void onSignal?.('share_clicked');
    setBusy(true);
    setNotice('');
    setLink('');
    const abort = new AbortController();
    active.current = abort;
    try {
      const official = slug.startsWith('official-'),
        base = (
          process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'
        ).replace(/\/v[12]\/?$/, '/public');
      const response = await fetch(
        `${base}/${official ? 'official-lives' : 'lives'}/${encodeURIComponent(slug)}`,
        {
          credentials: 'same-origin',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          signal: abort.signal,
        },
      );
      if (!response.ok) throw Error('Unavailable');
      const reader = (
        official ? officialPublicationReaderSchema : publicationReaderSchema
      ).parse(await response.json());
      if (
        reader.slug !== slug ||
        reader.visibility !== 'public' ||
        reader.snapshot.contentLocale !== 'en'
      )
        throw Error('Wrong public copy');
      if (abort.signal.aborted) return;
      const url = publicLifeShareUrl(window.location.origin, slug);
      try {
        await navigator.clipboard.writeText(url);
        void onSignal?.('link_copied');
        if (!abort.signal.aborted) setNotice('Public link copied.');
      } catch {
        void onSignal?.('copy_failed');
        if (!abort.signal.aborted) {
          setLink(url);
          setNotice('Select and copy this public link.');
        }
      }
    } catch {
      if (!abort.signal.aborted)
        setNotice('This public life is no longer available to share.');
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="save-life-controls">
      <button type="button" disabled={busy} onClick={() => void share()}>
        {busy ? 'Checking this life…' : 'Copy public link'}
      </button>
      {notice && <p role="status">{notice}</p>}
      {link && (
        <label>
          Public link
          <input
            readOnly
            value={link}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </div>
  );
}
