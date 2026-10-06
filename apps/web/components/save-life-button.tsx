'use client';
import { useEffect, useRef, useState } from 'react';
import { savedLifeStatusSchema } from '@future-flow/contracts';
import {
  supabase,
  authConfigured,
  lifeApi,
  clientErrorMessage,
  ClientError,
} from '../lib/client';
export function SaveLifeButton({ slug }: { slug: string }) {
  const [user, setUser] = useState<string | null>(null),
    [saved, setSaved] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    if (!authConfigured) return;
    let stopped = false;
    const {
      data: { subscription },
    } = supabase().auth.onAuthStateChange((_event, session) => {
      if (!stopped) {
        generation.current++;
        setUser(session?.user.id ?? null);
        setSaved(null);
        setNotice('');
        setBusy(false);
      }
    });
    return () => {
      stopped = true;
      generation.current++;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController(),
      own = ++generation.current;
    setSaved(null);
    setNotice('');
    setBusy(false);
    if (user)
      void lifeApi(`/saved-lives/${encodeURIComponent(slug)}`, {
        signal: abort.signal,
      })
        .then((raw) => {
          const status = savedLifeStatusSchema.parse(raw);
          if (status.slug !== slug) throw Error('Wrong saved life');
          if (!abort.signal.aborted && own === generation.current)
            setSaved(status.saved);
        })
        .catch((error) => {
          if (!abort.signal.aborted && own === generation.current)
            setNotice(clientErrorMessage(error));
        });
    return () => {
      abort.abort();
      generation.current++;
    };
  }, [slug, user]);
  async function toggle() {
    if (busy || saved === null || !user) return;
    const own = generation.current;
    setBusy(true);
    setNotice('');
    try {
      const status = savedLifeStatusSchema.parse(
        await lifeApi(`/saved-lives/${encodeURIComponent(slug)}`, {
          method: saved ? 'DELETE' : 'PUT',
          ...(saved ? {} : { body: '{}' }),
          referrerPolicy: 'no-referrer',
        }),
      );
      if (status.slug !== slug) throw new ClientError('REQUEST_FAILED');
      if (own === generation.current) setSaved(status.saved);
    } catch (error) {
      if (own === generation.current) setNotice(clientErrorMessage(error));
    } finally {
      if (own === generation.current) setBusy(false);
    }
  }
  return (
    <div className="save-life-controls">
      {user ? (
        <button
          type="button"
          disabled={busy || saved === null}
          aria-pressed={saved ?? false}
          onClick={() => void toggle()}
        >
          {busy ? 'Updating…' : saved ? 'Remove save' : 'Save this life'}
        </button>
      ) : (
        <a href="/login">Sign in to save this life</a>
      )}
      <a href="/saved">Saved lives</a>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
    </div>
  );
}
