'use client';
import { useEffect, useRef, useState } from 'react';
import {
  PUBLIC_CONTENT_REVIEW_VERSION,
  type PublicContentView,
  type PublicContentReviewJobView,
} from '@future-flow/contracts';
import {
  contentReviewForBundle,
  contentReviewFieldLabel,
} from '../lib/public-content-review';
import { lifeApi, ClientError, clientErrorMessage } from '../lib/client';
import { publicPreviewMessages } from '../lib/public-preview-messages';

export function PublicContentReview({ bundle }: { bundle: PublicContentView }) {
  const [view, setView] = useState<PublicContentReviewJobView | null>(null),
    [busy, setBusy] = useState(true),
    [ack, setAck] = useState(false),
    [notice, setNotice] = useState('');
  const abort = useRef<AbortController | null>(null),
    request = useRef<string | null>(null);
  const path = `/public-content-bundles/${bundle.bundleId}/review-job`;
  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    void read(controller.signal);
    return () => controller.abort();
  }, [bundle.bundleId, bundle.contentHash]);
  useEffect(() => {
    if (!view?.job || !['queued', 'running'].includes(view.job.status)) return;
    const interval = setInterval(() => {
      if (abort.current) void read(abort.current.signal);
    }, 4000);
    return () => clearInterval(interval);
  }, [view?.job?.status]);
  async function read(signal: AbortSignal) {
    try {
      const next = await contentReviewForBundle(
        await lifeApi(path, { signal }),
        bundle,
      );
      if (!signal.aborted) {
        setView(next);
        setNotice('');
      }
    } catch (error) {
      if (!signal.aborted) {
        setView(null);
        setNotice(
          error instanceof ClientError
            ? clientErrorMessage(error)
            : 'The complete review could not be verified. Reload its status.',
        );
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  async function start() {
    const signal = abort.current?.signal;
    if (!signal || busy || !ack || !view?.enabled || view.job) return;
    request.current ??= crypto.randomUUID();
    setBusy(true);
    setNotice('');
    try {
      const next = await contentReviewForBundle(
        await lifeApi(path, {
          method: 'POST',
          signal,
          headers: { 'Idempotency-Key': request.current },
          body: JSON.stringify({
            contentHash: bundle.contentHash,
            policyVersion: PUBLIC_CONTENT_REVIEW_VERSION,
            acknowledged: true,
          }),
        }),
        bundle,
      );
      if (!signal.aborted) {
        setView(next);
        setAck(false);
      }
    } catch (error) {
      if (!signal.aborted) {
        setView(null);
        setAck(false);
        setNotice(
          error instanceof ClientError
            ? clientErrorMessage(error)
            : 'The review request could not be verified. Reload its status before continuing.',
        );
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  const report = view?.report,
    m = publicPreviewMessages.en;
  return (
    <section
      className="panel"
      aria-label="Complete content AI review"
      lang="en"
    >
      <h3>Complete content AI review</h3>
      <p>
        This check covers this saved story and its selected starting points (
        {bundle.selection.length}), including their facts, conditions and
        effects. It remains private.
      </p>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {busy && !view && <p role="status">Loading review status…</p>}
      {view &&
        !view.job &&
        (view.enabled ? (
          <>
            <label className="shared-check">
              <input
                type="checkbox"
                checked={ack}
                disabled={busy}
                onChange={(e) => setAck(e.target.checked)}
              />
              <span>
                I reviewed this complete saved copy and agree to send it to the
                AI service for a paid privacy, content and consistency check.
              </span>
            </label>
            <button
              className="primary"
              disabled={busy || !ack}
              onClick={() => void start()}
            >
              Request complete AI review
            </button>
          </>
        ) : (
          <p>Paid complete reviews are currently disabled.</p>
        ))}
      {view?.job && ['queued', 'running'].includes(view.job.status) && (
        <p role="status">
          The complete AI review is{' '}
          {view.job.status === 'queued' ? 'queued' : 'in progress'}. This copy
          remains private.
        </p>
      )}
      {view?.job && ['failed', 'cancelled'].includes(view.job.status) && (
        <p>
          The complete review did not finish. It will not automatically run
          again. Prepare a revised copy for another review.
        </p>
      )}
      {report && (
        <>
          <p role="status">
            {report.verdict === 'no_findings'
              ? 'The complete AI check reported no findings. A separate full content curator review is still required.'
              : report.verdict === 'review_required'
                ? 'The complete AI check found details that need attention. Review the indicated story or starting point fields and prepare a revised copy.'
                : 'The AI could not assess the complete copy. It requires further review.'}
          </p>
          {!!report.findings.length && (
            <ul>
              {report.findings.map((f) => (
                <li key={`${f.fieldKey}:${f.category}`}>
                  <strong>
                    {contentReviewFieldLabel(
                      view!.fields.find((field) => field.key === f.fieldKey)!
                        .path,
                    )}
                  </strong>
                  :{' '}
                  {f.category === 'meaning_mismatch'
                    ? 'Prose and typed facts may disagree'
                    : f.category === 'unverifiable_structure'
                      ? 'Structure needs human review'
                      : m.reviewCategories[f.category]}{' '}
                  · {m.actions[f.action]}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <button
        className="secondary"
        disabled={busy}
        onClick={() => {
          if (abort.current) {
            setBusy(true);
            void read(abort.current.signal);
          }
        }}
      >
        Reload complete review status
      </button>
      <p className="subtle">
        An AI result does not grant publication or guarantee anonymity. Each
        saved copy has one review attempt; status reloads reuse that attempt.
      </p>
    </section>
  );
}
