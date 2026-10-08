'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  publicForkCapabilitySchema,
  publicForkStartReceiptSchema,
  privacyConsentStatusSchema,
  type PublicForkCapability,
} from '@future-flow/contracts';
import {
  authConfigured,
  api,
  supabase,
  lifeApi,
  clientErrorMessage,
} from '../lib/client';
import { publicLoginHref } from '../lib/public-return';
export function PublicForkLauncher({ slug }: { slug: string }) {
  return <ForkLauncher key={slug} slug={slug} />;
}
function ForkLauncher({ slug }: { slug: string }) {
  const router = useRouter(),
    [capability, setCapability] = useState<PublicForkCapability | null>(null),
    [user, setUser] = useState<string | null>(null),
    [privacy, setPrivacy] = useState<boolean | null>(null),
    [adult, setAdult] = useState(false),
    [point, setPoint] = useState(0),
    [option, setOption] = useState(''),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const version = useRef(0),
    signedInUser = useRef<string | null>(null),
    capabilityHash = useRef<string | null>(null),
    request = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => {
    if (!authConfigured) return;
    let live = true;
    const {
      data: { subscription },
    } = supabase().auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user.id ?? null;
      if (live && signedInUser.current !== nextUser) {
        signedInUser.current = nextUser;
        version.current++;
        request.current = null;
        setUser(nextUser);
        setPrivacy(null);
        setAdult(false);
        setBusy(false);
        setAck(false);
        setNotice('');
      }
    });
    return () => {
      live = false;
      version.current++;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    const own = version.current,
      abort = new AbortController();
    void api('/me/consent', { signal: abort.signal }, 'v1', user)
      .then((raw) => {
        const state = privacyConsentStatusSchema.parse(raw);
        if (!abort.signal.aborted && own === version.current)
          setPrivacy(state.acknowledged);
      })
      .catch(() => {
        if (!abort.signal.aborted && own === version.current)
          setNotice(
            'We could not load your privacy settings. Reload this page to try again.',
          );
      });
    return () => abort.abort();
  }, [user]);
  useEffect(() => {
    let controller: AbortController | null = null,
      stopped = false;
    async function read() {
      controller?.abort();
      const abort = new AbortController();
      controller = abort;
      try {
        const base = (
            process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'
          ).replace(/\/v[12]\/?$/, '/public'),
          response = await fetch(
            `${base}/fork-capabilities/${encodeURIComponent(slug)}`,
            {
              cache: 'no-store',
              credentials: 'same-origin',
              referrerPolicy: 'no-referrer',
              signal: abort.signal,
            },
          );
        if (!response.ok) throw Error('Unavailable');
        const next = publicForkCapabilitySchema.parse(await response.json());
        if (next.slug !== slug) throw Error('Wrong copy');
        if (!stopped && !abort.signal.aborted) {
          if (capabilityHash.current !== next.capabilityHash) {
            capabilityHash.current = next.capabilityHash;
            request.current = null;
            setAck(false);
            setOption('');
            setPoint(0);
          }
          setCapability(next);
        }
      } catch {
        if (!stopped && !abort.signal.aborted) {
          setCapability(null);
          setAck(false);
          setOption('');
        }
      }
    }
    const refresh = () => {
      if (document.visibilityState === 'visible') void read();
      else {
        controller?.abort();
        setCapability(null);
        setAck(false);
      }
    };
    void read();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      stopped = true;
      controller?.abort();
      version.current++;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [slug]);
  async function start() {
    if (
      !user ||
      !capability?.startsEnabled ||
      !option ||
      !ack ||
      busy ||
      privacy === null ||
      (!privacy && !adult)
    )
      return;
    const own = version.current,
      body = {
        capabilityHash: capability.capabilityHash,
        checkpointIndex: point,
        optionKey: option,
        acknowledged: true,
      },
      signature = JSON.stringify({ user, slug, ...body });
    if (request.current?.signature !== signature)
      request.current = { signature, key: crypto.randomUUID() };
    const requestKey = request.current.key;
    setBusy(true);
    setNotice('');
    try {
      if (!privacy) {
        await api(
          '/me/consent',
          {
            method: 'POST',
            body: JSON.stringify({ adult: true, acknowledged: true }),
          },
          'v1',
          user,
        );
        if (own !== version.current) return;
        setPrivacy(true);
      }
      const receipt = publicForkStartReceiptSchema.parse(
        await lifeApi(
          `/public-forks/${encodeURIComponent(slug)}`,
          {
            method: 'POST',
            headers: { 'Idempotency-Key': requestKey },
            body: JSON.stringify(body),
            referrerPolicy: 'no-referrer',
          },
          user,
        ),
      );
      if (own === version.current) router.push(`/life/${receipt.branchId}`);
    } catch (e) {
      if (own === version.current) setNotice(clientErrorMessage(e));
    } finally {
      if (own === version.current) setBusy(false);
    }
  }
  if (!capability?.startsEnabled)
    return busy ? <p role="status">Creating your private life…</p> : null;
  const selected = capability.checkpoints[point];
  return (
    <section className="panel" aria-label="Start your own private life">
      <h2>Take a different path</h2>
      <p>
        Start your own private life from a reviewed decision point in this
        story. Your selected choice becomes its starting point. The original
        story stays as it is.
      </p>
      <label>
        Decision point
        <select
          value={point}
          disabled={busy}
          onChange={(e) => {
            setPoint(Number(e.target.value));
            setOption('');
            setAck(false);
            request.current = null;
          }}
        >
          {capability.checkpoints.map((p) => (
            <option key={p.index} value={p.index}>
              {p.index + 1}. {p.prompt}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <fieldset disabled={busy}>
          <legend>{selected.prompt}</legend>
          {selected.options.map((o) => (
            <label key={o.key} className="choice">
              <input
                type="radio"
                name={`fork-${slug}`}
                value={o.key}
                checked={option === o.key}
                onChange={() => {
                  setOption(o.key);
                  setAck(false);
                  request.current = null;
                }}
              />
              <strong>{o.label}</strong>
              <span>{o.description}</span>
            </label>
          ))}
        </fieldset>
      )}
      {user ? (
        <>
          {privacy === null && (
            <p role="status">Loading your privacy settings…</p>
          )}
          {privacy === false && (
            <label>
              <input
                type="checkbox"
                checked={adult}
                disabled={busy}
                onChange={(e) => setAdult(e.target.checked)}
              />{' '}
              I am at least 18 and understand that alterward uses AI to create
              fictional stories. I have read the{' '}
              <a href="/privacy">Privacy and AI use notice</a>.
            </label>
          )}
          <p>
            Creating your private life starts an AI generation and uses your
            allowance. You can continue it independently. The original author
            cannot access it.
          </p>
          <label>
            <input
              type="checkbox"
              checked={ack}
              disabled={busy || !option}
              onChange={(e) => setAck(e.target.checked)}
            />{' '}
            I want to start a private life with this choice and use my AI
            allowance.
          </label>
          <button
            type="button"
            disabled={
              busy ||
              !ack ||
              !option ||
              privacy === null ||
              (!privacy && !adult)
            }
            onClick={() => void start()}
          >
            {busy ? 'Creating your life…' : 'Start my private life'}
          </button>
        </>
      ) : (
        <a href={publicLoginHref(slug)}>Sign in to start your own life</a>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice} <a href="/privacy">Privacy and AI use</a>
        </p>
      )}
    </section>
  );
}
