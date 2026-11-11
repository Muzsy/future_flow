'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  publicContentViewSchema,
  type PublicPreviewRecord,
} from '@future-flow/contracts';
import {
  contentBundlesForPreview,
  canonicalPublicContent,
} from '../lib/public-content';
import { publicContentMessages } from '../lib/public-content-messages';
import { lifeApi, ClientError, clientErrorMessage } from '../lib/client';
import { PublicContentPreview } from './public-content-preview';
import { CheckpointDetails } from './fork-checkpoint-preview';
import { PublicContentReview } from './public-content-review';

export function PublicContentBundle({
  preview,
}: {
  preview: PublicPreviewRecord;
}) {
  const m = publicContentMessages.en;
  const [workspace, setWorkspace] = useState<Awaited<
      ReturnType<typeof contentBundlesForPreview>
    > | null>(null),
    [selection, setSelection] = useState<Record<string, string>>({}),
    [active, setActive] = useState(''),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(true),
    [notice, setNotice] = useState('');
  const abort = useRef<AbortController | null>(null),
    request = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    void load(controller.signal);
    return () => controller.abort();
  }, [preview.draftId, preview.snapshotHash, preview.sourceRevision]);
  async function load(signal: AbortSignal) {
    setBusy(true);
    setWorkspace(null);
    setAck(false);
    setSelection({});
    setNotice('');
    try {
      const [raw, saved] = await Promise.all([
        lifeApi(`/public-previews/${preview.draftId}/content-bundles`, {
          signal,
        }),
        lifeApi(`/public-previews/${preview.draftId}/fork-checkpoints`, {
          signal,
        }),
      ]);
      const next = await contentBundlesForPreview(raw, saved, preview);
      if (signal.aborted) return;
      setWorkspace(next);
      setActive(next.data.bundles.at(-1)?.bundleId ?? '');
      request.current = null;
    } catch (error) {
      if (!signal.aborted)
        setNotice(
          error instanceof ClientError ? clientErrorMessage(error) : m.invalid,
        );
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  const selected = preview.snapshot.periods.flatMap((p) => {
      const point = workspace?.saved.find(
        (c) => c.checkpointId === selection[p.decision.key],
      );
      return point ? [point] : [];
    }),
    stored = workspace?.data.bundles.find((b) => b.bundleId === active);
  async function save(event: FormEvent) {
    event.preventDefault();
    const signal = abort.current?.signal;
    if (!signal || !workspace || !workspace.data.enabled || busy || !ack)
      return;
    const payload = {
        snapshotHash: preview.snapshotHash,
        sourceRevision: preview.sourceRevision,
        selectedCheckpointIds: selected.map((c) => c.checkpointId),
        acknowledged: true,
      },
      signature = JSON.stringify(payload);
    if (request.current?.signature !== signature)
      request.current = { signature, key: crypto.randomUUID() };
    setBusy(true);
    setNotice('');
    try {
      const record = publicContentViewSchema.parse(
        await lifeApi(`/public-previews/${preview.draftId}/content-bundles`, {
          method: 'POST',
          signal,
          headers: { 'Idempotency-Key': request.current.key },
          body: JSON.stringify(payload),
        }),
      );
      const next = await contentBundlesForPreview(
        {
          enabled: workspace.data.enabled,
          bundles: [
            ...workspace.data.bundles.filter(
              (b) => b.bundleId !== record.bundleId,
            ),
            record,
          ],
        },
        workspace.saved,
        preview,
      );
      if (
        canonicalPublicContent(record.content.checkpoints) !==
          canonicalPublicContent(selected.map((c) => c.checkpoint)) ||
        canonicalPublicContent(record.selection.map((c) => c.checkpointId)) !==
          canonicalPublicContent(payload.selectedCheckpointIds)
      )
        throw new Error('Selection changed');
      if (signal.aborted) return;
      setWorkspace(next);
      setActive(record.bundleId);
      setAck(false);
      setNotice(m.saved);
    } catch (error) {
      if (!signal.aborted) {
        if (
          error instanceof ClientError &&
          [
            'LIFE_REVISION_CONFLICT',
            'PUBLIC_PREVIEW_EXPIRED',
            'PUBLIC_CONTENT_SOURCE',
            'ACCOUNT_DELETING',
            'AUTH_REQUIRED',
          ].includes(error.code)
        )
          setWorkspace(null);
        setNotice(
          error instanceof ClientError ? clientErrorMessage(error) : m.invalid,
        );
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="panel fork-preview" lang="en" aria-label={m.heading}>
      <div className="eyebrow">Private preparation</div>
      <h2>{m.heading}</h2>
      <p>{m.intro}</p>
      <p className="notice">{m.pendingReview}</p>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {busy && !workspace && <p role="status">{m.loading}</p>}
      {workspace && (
        <>
          {workspace.data.enabled ? (
            <form
              className="preview-form"
              onSubmit={(event) => void save(event)}
            >
              {preview.snapshot.periods.map((period, i) => (
                <label className="field" key={period.decision.key}>
                  <span id={`bundle-choice-${i}`}>
                    Chapter {i + 1} · {period.decision.prompt}
                  </span>
                  <select
                    aria-labelledby={`bundle-choice-${i}`}
                    value={selection[period.decision.key] ?? ''}
                    disabled={busy}
                    onChange={(event) => {
                      setSelection({
                        ...selection,
                        [period.decision.key]: event.target.value,
                      });
                      setAck(false);
                      setNotice('');
                    }}
                  >
                    <option value="">{m.noPoint}</option>
                    {workspace.saved
                      .filter(
                        (c) =>
                          c.checkpoint.decision.key === period.decision.key,
                      )
                      .map((c, n) => (
                        <option key={c.checkpointId} value={c.checkpointId}>
                          {m.version} {n + 1}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
              <details>
                <summary>{m.proposed}</summary>
                <PublicContentPreview snapshot={preview.snapshot} />
                {selected.length ? (
                  selected.map((c) => (
                    <article key={c.checkpointId}>
                      <CheckpointDetails checkpoint={c.checkpoint} />
                    </article>
                  ))
                ) : (
                  <p>{m.none}</p>
                )}
              </details>
              <label className="shared-check">
                <input
                  type="checkbox"
                  checked={ack}
                  disabled={busy}
                  onChange={(event) => setAck(event.target.checked)}
                />
                <span>{m.acknowledge}</span>
              </label>
              <button className="primary" disabled={busy || !ack}>
                {busy ? m.saving : m.save}
              </button>
            </form>
          ) : (
            <p>{m.disabled}</p>
          )}
          {!!workspace.data.bundles.length && (
            <>
              <label className="field">
                <span>{m.inspect}</span>
                <select
                  value={active}
                  disabled={busy}
                  onChange={(event) => setActive(event.target.value)}
                >
                  {workspace.data.bundles.map((b, i) => (
                    <option key={b.bundleId} value={b.bundleId}>
                      {m.savedCopy} {i + 1} · Starting points:{' '}
                      {b.selection.length}
                    </option>
                  ))}
                </select>
              </label>
              {stored && (
                <>
                  <details>
                    <summary>{m.savedCopy}</summary>
                    <PublicContentPreview snapshot={stored.content.snapshot} />
                    {stored.content.checkpoints.length ? (
                      stored.content.checkpoints.map((c) => (
                        <article key={c.decision.key}>
                          <CheckpointDetails checkpoint={c} />
                        </article>
                      ))
                    ) : (
                      <p>{m.none}</p>
                    )}
                  </details>
                  <PublicContentReview
                    key={stored.bundleId + ':' + stored.contentHash}
                    bundle={stored}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
      <button
        className="secondary"
        disabled={busy}
        onClick={() => {
          if (abort.current) void load(abort.current.signal);
        }}
      >
        {m.reload}
      </button>
      <p className="subtle">{m.reloadHint}</p>
    </section>
  );
}
