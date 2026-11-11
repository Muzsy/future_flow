'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  publicReportReasons,
  publicReportRequestSchema,
  publicReportReceiptSchema,
  type PublicReportRequest,
} from '@future-flow/contracts';
import {
  lifeApi,
  supabase,
  authConfigured,
  clientErrorMessage,
} from '../lib/client';
import { publicReportLabels } from '../lib/public-safety';
export function PublicReportForm({ slug }: { slug: string }) {
  const [user, setUser] = useState<string | null>(null),
    [open, setOpen] = useState(false),
    [reason, setReason] =
      useState<PublicReportRequest['reason']>('personal_data'),
    [details, setDetails] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [sent, setSent] = useState(false);
  const generation = useRef(0),
    active = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!authConfigured) return;
    const {
      data: { subscription },
    } = supabase().auth.onAuthStateChange((_event, session) => {
      generation.current++;
      active.current?.abort();
      setUser(session?.user.id ?? null);
      setDetails('');
      setOpen(false);
      setNotice('');
      setSent(false);
      setBusy(false);
    });
    return () => {
      generation.current++;
      active.current?.abort();
      subscription.unsubscribe();
    };
  }, []);
  useEffect(
    () => () => {
      generation.current++;
      active.current?.abort();
    },
    [slug],
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !user) return;
    const own = generation.current,
      abort = new AbortController();
    active.current = abort;
    setBusy(true);
    setNotice('');
    try {
      const input = publicReportRequestSchema.parse({ reason, details });
      const receipt = publicReportReceiptSchema.parse(
        await lifeApi(`/public-reports/${encodeURIComponent(slug)}`, {
          method: 'POST',
          body: JSON.stringify(input),
          signal: abort.signal,
          referrerPolicy: 'no-referrer',
        }),
      );
      if (receipt.slug !== slug || receipt.reason !== reason)
        throw Error('Wrong report receipt');
      if (own === generation.current && !abort.signal.aborted) {
        setSent(true);
        setDetails('');
        setNotice(
          receipt.duplicate
            ? 'You already reported this life for this reason.'
            : 'Report received. A moderator will review it.',
        );
      }
    } catch (error) {
      if (own === generation.current && !abort.signal.aborted)
        setNotice(clientErrorMessage(error));
    } finally {
      if (own === generation.current && !abort.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="public-report-controls" aria-label="Report this life">
      {user ? (
        <button
          type="button"
          className="secondary"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          Report this life
        </button>
      ) : (
        <a href="/login">Sign in to report this life</a>
      )}
      {open && (
        <form onSubmit={submit}>
          <h2>Report this public life</h2>
          <p>
            Choose a reason and describe the problem. Avoid adding private
            contact details or identifying other people. Reports are private and
            do not automatically hide a life.
          </p>
          <label>
            Reason
            <select
              disabled={busy || sent}
              value={reason}
              onChange={(e) =>
                setReason(e.target.value as PublicReportRequest['reason'])
              }
            >
              {publicReportReasons.map((r) => (
                <option key={r} value={r}>
                  {publicReportLabels[r]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Optional details
            <textarea
              maxLength={1000}
              disabled={busy || sent}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || sent}>
            {busy ? 'Sending…' : 'Submit report'}
          </button>
        </form>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
    </section>
  );
}
