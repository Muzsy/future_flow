'use client';
import { useEffect, useRef, useState } from 'react';
import {
  PUBLIC_CONTENT_CURATION_VERSION,
  PUBLIC_CONTENT_REVIEW_VERSION,
  type PublicContentView,
  type PublicContentReviewJobView,
  type PublicContentCurationView,
} from '@future-flow/contracts';
import { contentCurationForBundle } from '../lib/public-content-curation';
import { lifeApi, ClientError, clientErrorMessage } from '../lib/client';
import { PublicationConfirm } from './publication-confirm';

export function PublicContentCuration({
  bundle,
  review,
}: {
  bundle: PublicContentView;
  review: PublicContentReviewJobView;
}) {
  const [view, setView] = useState<PublicContentCurationView | null>(null),
    [busy, setBusy] = useState(true),
    [ack, setAck] = useState(false),
    [notice, setNotice] = useState('');
  const abort = useRef<AbortController | null>(null),
    request = useRef<string | null>(null);
  const path = `/public-content-bundles/${bundle.bundleId}/curation`;
  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    void read(controller.signal);
    return () => controller.abort();
  }, [bundle.bundleId, bundle.contentHash, review.job?.id]);
  useEffect(() => {
    if (view?.curation?.status !== 'pending') return;
    const timer = setInterval(() => {
      if (abort.current) void read(abort.current.signal);
    }, 10000);
    return () => clearInterval(timer);
  }, [view?.curation?.status]);
  async function read(signal: AbortSignal) {
    try {
      const next = await contentCurationForBundle(
        await lifeApi(path, { signal }),
        bundle,
        review,
      );
      if (!signal.aborted) {
        setView(next);
        setNotice('');
      }
    } catch (error) {
      if (!signal.aborted) {
        setView(null);
        setAck(false);
        setNotice(
          error instanceof ClientError
            ? clientErrorMessage(error)
            : 'The complete curator status could not be verified. Reload it.',
        );
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  async function submit() {
    const signal = abort.current?.signal;
    if (
      !signal ||
      busy ||
      !ack ||
      !view?.enabled ||
      !view.eligible ||
      view.curation ||
      !view.reviewId ||
      !view.reviewHash
    )
      return;
    request.current ??= crypto.randomUUID();
    setBusy(true);
    setNotice('');
    try {
      const next = await contentCurationForBundle(
        await lifeApi(path, {
          method: 'POST',
          signal,
          headers: { 'Idempotency-Key': request.current },
          body: JSON.stringify({
            contentHash: bundle.contentHash,
            reviewId: view.reviewId,
            reviewHash: view.reviewHash,
            policyVersion: PUBLIC_CONTENT_REVIEW_VERSION,
            curationVersion: PUBLIC_CONTENT_CURATION_VERSION,
            acknowledged: true,
          }),
        }),
        bundle,
        review,
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
            : 'The submission could not be verified. Reload its status before continuing.',
        );
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      className="panel"
      aria-label="Complete content curator review"
      lang="en"
    >
      <h3>Complete content curator review</h3>
      <p>
        A curator checks this saved story and its selected starting points (
        {bundle.selection.length}) together, including privacy, content and
        consistency between prose, facts and choices.
      </p>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {busy && !view && <p role="status">Loading curator status…</p>}
      {view &&
        !view.curation &&
        (view.eligible ? (
          view.enabled ? (
            <>
              <label className="shared-check">
                <input
                  type="checkbox"
                  checked={ack}
                  disabled={busy}
                  onChange={(e) => setAck(e.target.checked)}
                />
                <span>
                  I reviewed this complete saved copy and agree to let a curator
                  read it and its AI report privately.
                </span>
              </label>
              <button
                className="primary"
                disabled={busy || !ack}
                onClick={() => void submit()}
              >
                Request complete curator review
              </button>
            </>
          ) : (
            <p>Complete curator submissions are currently disabled.</p>
          )
        ) : (
          <p>A complete AI review with no findings is required first.</p>
        ))}
      {view?.curation && (
        <p role="status">
          {view.curation.status === 'pending'
            ? 'Your complete copy is waiting for curator review.'
            : view.curation.status === 'content_reviewed'
              ? 'A curator has reviewed this complete copy. It remains private; publication requires a separate step.'
              : view.curation.status === 'changes_requested'
                ? 'The curator requested changes. Prepare a revised copy for another review.'
                : 'The curator rejected this copy. Prepare a revised copy before submitting again.'}
        </p>
      )}
      {view?.curation?.reasonCode && (
        <p>
          Reason:{' '}
          {
            {
              privacy: 'Privacy',
              content: 'Content',
              quality: 'Writing quality',
              story_consistency: 'Story and starting point consistency',
              other: 'Further review needed',
            }[view.curation.reasonCode]
          }
          .
        </p>
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
        Reload complete curator status
      </button>
      <p className="subtle">
        Submitting for curator review does not run AI again or publish your
        copy.
      </p>
      {view?.curation?.status === 'content_reviewed' && (
        <PublicationConfirm
          key={`${bundle.bundleId}:${bundle.contentHash}:${view.curation.id}`}
          bundle={bundle}
          curator={view}
        />
      )}
    </section>
  );
}
