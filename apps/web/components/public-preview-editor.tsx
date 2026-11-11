'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  publicCategorySchema,
  publicPreviewCopySchema,
  publicPreviewPreflightSchema,
  publicPreviewRecordSchema,
  publicPreviewWorkspaceSchema,
  type PublicPreviewCopy,
  type PublicPreviewPreflight,
  type PublicPreviewRecord,
  type PublicPreviewWorkspace,
  type PublicReviewView,
  PUBLIC_REVIEW_VERSION,
  type PublicReviewJobView,
  PUBLIC_CURATION_VERSION,
  type PublicCurationView,
} from '@future-flow/contracts';
import { lifeApi, clientErrorMessage, ClientError } from '../lib/client';
import {
  copyFields,
  copyFromSnapshot,
  editCopyField,
  reviewForPreview,
  reviewJobForPreview,
  curationForPreview,
} from '../lib/public-preview';
import { publicPreviewMessages } from '../lib/public-preview-messages';
import { PublicContentPreview } from './public-content-preview';
import { ForkCheckpointPreview } from './fork-checkpoint-preview';
import { PublicContentBundle } from './public-content-bundle';

export function PublicPreviewEditor({ branchId }: { branchId: string }) {
  const m = publicPreviewMessages.en;
  const [workspace, setWorkspace] = useState<PublicPreviewWorkspace | null>(
      null,
    ),
    [copy, setCopy] = useState<PublicPreviewCopy | null>(null),
    [preview, setPreview] = useState<PublicPreviewRecord | null>(null),
    [review, setReview] = useState<PublicReviewView | null>(null),
    [reviewJob, setReviewJob] = useState<PublicReviewJobView | null>(null),
    [reviewConsent, setReviewConsent] = useState(false),
    [curation, setCuration] = useState<PublicCurationView | null>(null),
    [curationConsent, setCurationConsent] = useState(false);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [reviewError, setReviewError] = useState(''),
    [acknowledged, setAcknowledged] = useState(false),
    [view, setView] = useState<'privacy' | 'content'>('privacy'),
    [issues, setIssues] = useState<PublicPreviewPreflight['issues']>([]),
    [invalid, setInvalid] = useState<string[]>([]),
    [focusPath, setFocusPath] = useState(''),
    [now, setNow] = useState(Date.now());
  const request = useRef<{ signature: string; key: string } | null>(null),
    reviewRequest = useRef<{ draftId: string; key: string } | null>(null),
    curationRequest = useRef<{ draftId: string; key: string } | null>(null),
    alive = useRef(true),
    abort = useRef<AbortController | null>(null);
  const dirty =
      !preview ||
      !copy ||
      JSON.stringify(copy) !==
        JSON.stringify(copyFromSnapshot(preview.snapshot)),
    expired = preview !== null && Date.parse(preview.expiresAt) <= now;
  const fields = copy ? copyFields(copy) : [];
  useEffect(() => {
    alive.current = true;
    abort.current = new AbortController();
    void load();
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      alive.current = false;
      abort.current?.abort();
      clearInterval(timer);
    };
  }, [branchId]);
  useEffect(() => {
    if (focusPath && view === 'privacy') {
      document
        .getElementById('copy-' + focusPath.replaceAll('.', '-'))
        ?.focus();
      setFocusPath('');
    }
  }, [focusPath, view]);
  async function readReview(saved: PublicPreviewRecord) {
    const signal = abort.current?.signal;
    try {
      const [raw, job, textCuration] = await Promise.all([
        lifeApi(`/public-previews/${saved.draftId}/review`, { signal }),
        lifeApi(`/public-previews/${saved.draftId}/review-job`, { signal }),
        lifeApi(`/public-previews/${saved.draftId}/curation`, { signal }),
      ]);
      if (!alive.current || signal?.aborted) return;
      setReview(reviewForPreview(raw, saved));
      setReviewJob(reviewJobForPreview(job, saved));
      setCuration(curationForPreview(textCuration, saved));
      setReviewError('');
    } catch (error) {
      if (alive.current && !signal?.aborted) {
        setReview(null);
        setReviewJob(null);
        setCuration(null);
        setReviewError(
          error instanceof ClientError
            ? clientErrorMessage(error)
            : m.reviewUnavailable,
        );
      }
    }
  }
  async function load() {
    const signal = abort.current?.signal;
    setLoading(true);
    setCuration(null);
    setCurationConsent(false);
    curationRequest.current = null;
    setNotice('');
    setReview(null);
    setReviewJob(null);
    setReviewConsent(false);
    setIssues([]);
    setInvalid([]);
    setAcknowledged(false);
    request.current = null;
    try {
      const data = publicPreviewWorkspaceSchema.parse(
        await lifeApi(`/branches/${branchId}/public-preview`, {
          signal,
        }),
      );
      if (!alive.current || signal?.aborted) return;
      setWorkspace(data);
      setPreview(data.preview);
      setCopy(
        data.preview
          ? copyFromSnapshot(data.preview.snapshot)
          : data.source.copy,
      );
      setView('privacy');
      setNow(Date.now());
      if (data.preview) await readReview(data.preview);
    } catch (error) {
      if (alive.current && !signal?.aborted) {
        setWorkspace(null);
        setCopy(null);
        setPreview(null);
        setNotice(clientErrorMessage(error));
      }
    } finally {
      if (alive.current && !signal?.aborted) setLoading(false);
    }
  }
  function edit(path: string, text: string) {
    if (!copy) return;
    setCopy(editCopyField(copy, path, text));
    setAcknowledged(false);
    setReviewConsent(false);
    setCurationConsent(false);
    setInvalid([]);
    setIssues([]);
    setNotice('');
  }
  async function save(event: FormEvent) {
    const signal = abort.current?.signal;
    event.preventDefault();
    if (busy || !workspace || !copy || !acknowledged) return;
    const parsed = publicPreviewCopySchema.safeParse(copy);
    if (!parsed.success) {
      setInvalid(parsed.error.issues.map((i) => i.path.join('.')));
      setNotice(m.validation);
      return;
    }
    setBusy(true);
    setNotice('');
    setIssues([]);
    try {
      const payload = {
        revision: workspace.source.sourceRevision,
        copy: parsed.data,
      };
      const checked = publicPreviewPreflightSchema.parse(
        await lifeApi(`/branches/${branchId}/public-preview/check`, {
          method: 'POST',
          body: JSON.stringify(payload),
          signal,
        }),
      );
      if (!alive.current || signal?.aborted) return;
      if (checked.issues.length) {
        setIssues(checked.issues);
        setNotice(m.preflight);
        return;
      }
      if (checked.sourceRevision !== payload.revision)
        throw new ClientError('LIFE_REVISION_CONFLICT');
      const signature = JSON.stringify(payload);
      if (expired || request.current?.signature !== signature)
        request.current = { signature, key: crypto.randomUUID() };
      const saved = publicPreviewRecordSchema.parse(
        await lifeApi(`/branches/${branchId}/public-preview`, {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'Idempotency-Key': request.current.key },
          signal,
        }),
      );
      if (!alive.current || signal?.aborted) return;
      if (saved.sourceRevision !== payload.revision)
        throw new ClientError('LIFE_REVISION_CONFLICT');
      setPreview(saved);
      setCopy(copyFromSnapshot(saved.snapshot));
      setReview(null);
      setNotice(m.checked);
      setCurationConsent(false);
      setNow(Date.now());
      await readReview(saved);
      setView('content');
    } catch (error) {
      if (alive.current && !signal?.aborted)
        setNotice(clientErrorMessage(error));
    } finally {
      if (alive.current && !signal?.aborted) setBusy(false);
    }
  }
  async function refresh() {
    const signal = abort.current?.signal;
    if (busy || !preview || dirty || expired) return;
    setBusy(true);
    setNotice('');
    try {
      const saved = publicPreviewRecordSchema.parse(
        await lifeApi(`/public-previews/${preview.draftId}`, {
          signal,
        }),
      );
      if (!alive.current || signal?.aborted) return;
      setPreview(saved);
      await readReview(saved);
      setNow(Date.now());
    } catch (error) {
      if (alive.current && !signal?.aborted) {
        setReview(null);
        setPreview(null);
        setView('privacy');
        setNotice(clientErrorMessage(error));
      }
    } finally {
      if (alive.current && !signal?.aborted) setBusy(false);
    }
  }
  function newPreview() {
    request.current = null;
    setPreview(null);
    setReview(null);
    setReviewJob(null);
    setReviewConsent(false);
    reviewRequest.current = null;
    curationRequest.current = null;
    setCuration(null);
    setCurationConsent(false);
    setReviewError('');
    setAcknowledged(false);
    setView('privacy');
    setNotice('');
  }
  async function startReview() {
    const signal = abort.current?.signal;
    if (
      busy ||
      !preview ||
      dirty ||
      expired ||
      !reviewConsent ||
      !reviewJob?.enabled ||
      review?.status !== 'not_started'
    )
      return;
    setBusy(true);
    setNotice('');
    if (reviewRequest.current?.draftId !== preview.draftId)
      reviewRequest.current = {
        draftId: preview.draftId,
        key: crypto.randomUUID(),
      };
    try {
      const raw = await lifeApi(
        `/public-previews/${preview.draftId}/review-job`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': reviewRequest.current.key },
          signal,
          body: JSON.stringify({
            snapshotHash: preview.snapshotHash,
            sourceRevision: preview.sourceRevision,
            policyVersion: PUBLIC_REVIEW_VERSION,
            acknowledged: true,
          }),
        },
      );
      if (!alive.current || signal?.aborted) return;
      setReviewJob(reviewJobForPreview(raw, preview));
      setReviewConsent(false);
      await readReview(preview);
    } catch (error) {
      if (alive.current && !signal?.aborted)
        setNotice(clientErrorMessage(error));
    } finally {
      if (alive.current && !signal?.aborted) setBusy(false);
    }
  }
  async function submitCuration() {
    const signal = abort.current?.signal;
    if (
      busy ||
      !preview ||
      dirty ||
      expired ||
      !curationConsent ||
      !curation?.enabled ||
      curation.curation ||
      review?.status !== 'completed' ||
      review.report.verdict !== 'no_findings'
    )
      return;
    setBusy(true);
    setNotice('');
    if (curationRequest.current?.draftId !== preview.draftId)
      curationRequest.current = {
        draftId: preview.draftId,
        key: crypto.randomUUID(),
      };
    try {
      const raw = await lifeApi(
        `/public-previews/${preview.draftId}/curation`,
        {
          method: 'POST',
          signal,
          headers: { 'Idempotency-Key': curationRequest.current.key },
          body: JSON.stringify({
            snapshotHash: preview.snapshotHash,
            sourceRevision: preview.sourceRevision,
            curationVersion: PUBLIC_CURATION_VERSION,
            acknowledged: true,
          }),
        },
      );
      if (!alive.current || signal?.aborted) return;
      setCuration(curationForPreview(raw, preview));
      setCurationConsent(false);
    } catch (error) {
      if (alive.current && !signal?.aborted)
        setNotice(clientErrorMessage(error));
    } finally {
      if (alive.current && !signal?.aborted) setBusy(false);
    }
  }
  const moveToField = (path: string) => {
    setView('privacy');
    setFocusPath(path);
  };
  const field = (f: (typeof fields)[number]) => {
    const invalidField = invalid.includes(f.sourcePath.join('.')),
      found = issues.some((i) => i.path === f.path);
    const props = {
      id: f.id,
      value: f.text,
      maxLength: f.max,
      disabled: busy,
      'aria-invalid': invalidField || found,
      onChange: (e: { target: { value: string } }) =>
        edit(f.path, e.target.value),
    };
    return (
      <label className="field" key={f.path}>
        <span>{f.label}</span>
        {f.multiline ? (
          <textarea {...props} rows={f.path.endsWith('.body') ? 12 : 3} />
        ) : (
          <input {...props} />
        )}
        {(invalidField || found) && (
          <small className="preview-field-error">
            {invalidField ? m.validation : m.preflight}
          </small>
        )}
      </label>
    );
  };
  return (
    <div className="public-preview-editor">
      <div className="page-head">
        <div>
          <div className="eyebrow">{m.private}</div>
          <h1>{m.heading}</h1>
        </div>
        <Link className="secondary" href={`/life/${branchId}`}>
          {m.back}
        </Link>
      </div>
      <p>{m.intro}</p>
      <p className="notice">{m.publication}</p>
      {notice && (
        <div role="status" className="notice">
          {notice}
        </div>
      )}
      {loading ? (
        <p role="status">{m.loading}</p>
      ) : !workspace || !copy ? (
        <button className="secondary" onClick={() => void load()}>
          {m.reload}
        </button>
      ) : (
        <>
          <div className="tabs" role="group" aria-label="Preview views">
            <button
              aria-pressed={view === 'privacy'}
              className={view === 'privacy' ? 'active' : ''}
              onClick={() => setView('privacy')}
            >
              {m.privacy}
            </button>
            <button
              aria-pressed={view === 'content'}
              disabled={!preview || dirty || expired}
              className={view === 'content' ? 'active' : ''}
              onClick={() => setView('content')}
            >
              {m.content}
            </button>
          </div>
          {expired && (
            <aside className="notice" role="status">
              <p>{m.expired}</p>
              <button
                className="secondary"
                disabled={busy}
                onClick={newPreview}
              >
                {m.newPreview}
              </button>
            </aside>
          )}
          {preview && dirty && (
            <p role="status" className="notice">
              {m.unsaved}
            </p>
          )}
          {view === 'privacy' ? (
            <form onSubmit={(e) => void save(e)} className="preview-form">
              <section className="panel">
                <h2>{m.privacy}</h2>
                <p>{m.guidance}</p>
                <p className="subtle">{m.sourceNote}</p>
                {issues.length > 0 && (
                  <ul>
                    {issues.map((issue) => (
                      <li key={issue.path}>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => moveToField(issue.path)}
                        >
                          {fields.find((f) => f.path === issue.path)
                            ?.fullLabel ?? issue.path}
                        </button>
                        :{' '}
                        {issue.codes
                          .map((code) => m.preflightCodes[code])
                          .join(', ')}
                      </li>
                    ))}
                  </ul>
                )}
                {fields.filter((f) => f.sourcePath[0] !== 'periods').map(field)}
                <label className="field">
                  <span>{m.category}</span>
                  <select
                    value={copy.category}
                    disabled={busy}
                    onChange={(e) => {
                      setCopy({
                        ...copy,
                        category: publicCategorySchema.parse(e.target.value),
                      });
                      setAcknowledged(false);
                      setNotice('');
                    }}
                  >
                    {publicCategorySchema.options.map((category) => (
                      <option key={category} value={category}>
                        {m.categories[category]}
                      </option>
                    ))}
                  </select>
                </label>
                <h3>{m.copiedProfile}</h3>
                <p>
                  {m.age}: {workspace.source.profile.ageBand.replace('_', '–')}{' '}
                  · {m.country}: {workspace.source.profile.country ?? m.unknown}{' '}
                  · {m.work}:{' '}
                  {workspace.source.profile.employmentStatus?.replaceAll(
                    '_',
                    ' ',
                  ) ?? m.unknown}
                </p>
              </section>
              {copy.periods.map((_, i) => (
                <fieldset className="panel preview-period" key={i}>
                  <legend>
                    Chapter {i + 1} · {workspace.source.periods[i]!.startDate} —{' '}
                    {workspace.source.periods[i]!.endDate}
                  </legend>
                  {fields
                    .filter(
                      (f) =>
                        f.sourcePath[0] === 'periods' && f.sourcePath[1] === i,
                    )
                    .map(field)}
                </fieldset>
              ))}
              <section className="panel">
                <label className="shared-check">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    disabled={busy}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                  />
                  <span>{m.acknowledge}</span>
                </label>
                <p className="subtle">{m.saveHint}</p>
                <button
                  className="primary"
                  disabled={busy || !acknowledged || (!dirty && !expired)}
                >
                  {busy ? m.saving : m.save}
                </button>
              </section>
            </form>
          ) : preview && !dirty && !expired ? (
            <PublicContentPreview snapshot={preview.snapshot} />
          ) : null}
          {preview && !dirty && !expired && (
            <ForkCheckpointPreview
              key={`checkpoint:${preview.draftId}:${preview.snapshotHash}:${preview.sourceRevision}`}
              preview={preview}
            />
          )}
          {preview && !dirty && !expired && (
            <PublicContentBundle
              key={`bundle:${preview.draftId}:${preview.snapshotHash}:${preview.sourceRevision}`}
              preview={preview}
            />
          )}
          {preview && !dirty && !expired && (
            <section className="panel" aria-label={m.review}>
              <h2>{m.review}</h2>
              <p>
                {reviewError
                  ? reviewError
                  : !review || review.status === 'not_started'
                    ? m.notStarted
                    : review.status === 'running'
                      ? reviewJob?.job?.status === 'queued'
                        ? m.reviewQueued
                        : m.running
                      : review.status === 'failed'
                        ? m.failed
                        : review.report.verdict === 'no_findings'
                          ? m.noFindings
                          : review.report.verdict === 'unable_to_assess'
                            ? m.unable
                            : m.reviewRequired}
              </p>
              {review?.status === 'not_started' &&
                reviewJob &&
                (reviewJob.enabled ? (
                  <>
                    <label className="shared-check">
                      <input
                        type="checkbox"
                        checked={reviewConsent}
                        disabled={busy}
                        onChange={(e) => setReviewConsent(e.target.checked)}
                      />
                      <span>{m.reviewConsent}</span>
                    </label>
                    <p className="subtle">{m.reviewCost}</p>
                    <button
                      className="primary"
                      disabled={busy || !reviewConsent}
                      onClick={() => void startReview()}
                    >
                      {m.startReview}
                    </button>
                  </>
                ) : (
                  <p className="subtle">{m.reviewDisabled}</p>
                ))}
              {review?.status === 'completed' &&
                review.report.findings.length > 0 && (
                  <ul className="preview-findings">
                    {review.report.findings.map((finding) => {
                      const path = review.fields.find(
                        (f) => f.key === finding.fieldKey,
                      )!.path;
                      return (
                        <li key={`${finding.fieldKey}:${finding.category}`}>
                          <button
                            className="text-button"
                            onClick={() => moveToField(path)}
                          >
                            {fields.find((f) => f.path === path)?.fullLabel ??
                              path}
                          </button>
                          <span>
                            {m.reviewCategories[finding.category]} ·{' '}
                            {m.actions[finding.action]}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              {review?.status === 'completed' &&
                review.report.verdict === 'no_findings' &&
                curation && (
                  <section aria-label={m.curation}>
                    <h3>{m.curation}</h3>
                    {curation.curation ? (
                      <>
                        <p>
                          {curation.curation.status === 'pending'
                            ? m.curationPending
                            : curation.curation.status === 'text_reviewed'
                              ? m.curationReviewed
                              : curation.curation.status === 'changes_requested'
                                ? m.curationChanges
                                : m.curationRejected}
                        </p>
                        {curation.curation.reasonCode && (
                          <p>
                            {m.curationReasons[curation.curation.reasonCode]}
                          </p>
                        )}
                      </>
                    ) : curation.enabled ? (
                      <>
                        <label className="shared-check">
                          <input
                            type="checkbox"
                            checked={curationConsent}
                            disabled={busy}
                            onChange={(e) =>
                              setCurationConsent(e.target.checked)
                            }
                          />
                          <span>{m.curationConsent}</span>
                        </label>
                        <p className="subtle">{m.curationHint}</p>
                        <button
                          className="primary"
                          disabled={busy || !curationConsent}
                          onClick={() => void submitCuration()}
                        >
                          {m.submitCuration}
                        </button>
                      </>
                    ) : (
                      <p className="subtle">{m.curationDisabled}</p>
                    )}
                  </section>
                )}
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void refresh()}
              >
                {m.refreshReview}
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={newPreview}
              >
                {m.newPreview}
              </button>
              <p className="subtle">
                {m.expires}:{' '}
                {new Date(preview.expiresAt).toLocaleString('en-GB')}
              </p>
            </section>
          )}
          <div className="preview-source-reload">
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void load()}
            >
              {m.reload}
            </button>
            <small>{m.reloadHint}</small>
          </div>
        </>
      )}
    </div>
  );
}
