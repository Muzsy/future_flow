'use client';
import { useEffect, useRef, useState } from 'react';
import type {
  PublicContentView,
  PublicContentCurationView,
  PublicationPreview,
  PublicationOwnerView,
  PublicationSettings,
  PublicationRefreshTarget,
} from '@future-flow/contracts';
import { lifeApi } from '../lib/client';
import { publicationStatusSchema } from '@future-flow/contracts';
import {
  publicationBinding,
  publicationPreviewForBundle,
  verifiedOwnedPublication,
  publicationError,
} from '../lib/publication';
import { PublicationContent } from './publication-content';
import { PublicationControls } from './publication-controls';
import { PublicationRefreshChoice } from './publication-refresh-choice';
import { publicationRefreshReceiptSchema } from '@future-flow/contracts';
export function PublicationConfirm({
  bundle,
  curator,
}: {
  bundle: PublicContentView;
  curator: PublicContentCurationView;
}) {
  const [settings, setSettings] = useState<PublicationSettings>({
      visibility: 'unlisted',
      authorMode: 'anonymous',
      indexable: false,
    }),
    [preview, setPreview] = useState<PublicationPreview | null>(null),
    [published, setPublished] = useState<PublicationOwnerView | null>(null),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(true),
    [enabled, setEnabled] = useState(false),
    [expired, setExpired] = useState(false),
    [notice, setNotice] = useState('');
  const [replacement, setReplacement] =
    useState<PublicationRefreshTarget | null>(null);
  const controller = useRef<AbortController | null>(null),
    prepareKey = useRef<string | null>(null),
    confirmKey = useRef<string | null>(null);
  useEffect(() => {
    setPreview(null);
    setPublished(null);
    setAck(false);
    setReplacement(null);
    setExpired(false);
    prepareKey.current = null;
    confirmKey.current = null;
    const abort = new AbortController();
    controller.current = abort;
    void read(abort.signal);
    return () => abort.abort();
  }, [bundle.bundleId, bundle.contentHash]);
  useEffect(() => {
    if (!preview) return;
    const timeout = setTimeout(
      () => {
        setExpired(true);
        setAck(false);
      },
      Math.max(0, new Date(preview.expiresAt).getTime() - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [preview]);
  async function read(signal: AbortSignal) {
    setBusy(true);
    try {
      const raw = publicationStatusSchema.parse(
        await lifeApi(
          `/public-content-bundles/${bundle.bundleId}/publication`,
          { signal },
        ),
      );
      const next =
        raw.publication === null
          ? null
          : await verifiedOwnedPublication(raw.publication);
      if (next && next.bundleId !== bundle.bundleId)
        throw Error('Wrong bundle');
      if (!signal.aborted) {
        setPublished(next);
        setEnabled(raw.enabled);
        if (!raw.enabled) {
          setPreview(null);
          setAck(false);
        }
        setNotice(raw.enabled ? '' : 'Publication is currently disabled.');
      }
    } catch (error) {
      if (!signal.aborted) {
        setNotice(publicationError(error));
        setAck(false);
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  function change(next: PublicationSettings) {
    setSettings(next);
    setPreview(null);
    setAck(false);
    setExpired(false);
    prepareKey.current = null;
    confirmKey.current = null;
  }
  async function prepare() {
    const signal = controller.current?.signal;
    if (!signal || busy || !enabled) return;
    prepareKey.current ??= crypto.randomUUID();
    setBusy(true);
    setNotice('');
    setAck(false);
    try {
      const next = await publicationPreviewForBundle(
        await lifeApi('/publication-previews', {
          method: 'POST',
          signal,
          headers: { 'Idempotency-Key': prepareKey.current },
          body: JSON.stringify({
            binding: publicationBinding(bundle, curator),
            settings,
          }),
        }),
        bundle,
        curator,
      );
      if (!signal.aborted) {
        setPreview(next);
        setExpired(new Date(next.expiresAt).getTime() <= Date.now());
        confirmKey.current = null;
      }
    } catch (error) {
      if (!signal.aborted) {
        setPreview(null);
        setNotice(publicationError(error));
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  async function confirm() {
    const signal = controller.current?.signal;
    if (!signal || busy || !ack || !preview || expired) return;
    confirmKey.current ??= crypto.randomUUID();
    setBusy(true);
    setNotice('');
    try {
      const raw = await lifeApi(
        replacement
          ? '/publication-refresh/community'
          : '/publications/confirm',
        {
          method: 'POST',
          signal,
          headers: { 'Idempotency-Key': confirmKey.current },
          body: JSON.stringify({
            previewId: preview.previewId,
            previewHash: preview.previewHash,
            acknowledged: true,
            ...(replacement
              ? {
                  previousPublicationId: replacement.publicationId,
                  previousRevision: replacement.revision,
                  previousSnapshotHash: replacement.snapshotHash,
                }
              : {}),
          }),
        },
      );
      const result = replacement
        ? publicationRefreshReceiptSchema.parse(raw)
        : null;
      if (result && result.previousPublicationId !== replacement!.publicationId)
        throw Error('Wrong previous copy');
      const next = await verifiedOwnedPublication(
        result ? result.publication : raw,
      );
      if (
        next.bundleId !== bundle.bundleId ||
        next.snapshotHash !== preview.snapshotHash
      )
        throw Error('Wrong copy');
      if (!signal.aborted) {
        setPublished(next);
        setPreview(null);
        setAck(false);
      }
    } catch (error) {
      if (!signal.aborted) {
        setNotice(publicationError(error));
        setAck(false);
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  if (published)
    return <PublicationControls view={published} onChange={setPublished} />;
  return (
    <section
      className="panel"
      aria-label="Publication and confirmation"
      lang="en"
    >
      <h3>Publish this reviewed copy</h3>
      <p>
        Choose who can read it, inspect the final copy, then confirm publication
        separately.
      </p>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <label>
        Visibility
        <select
          value={settings.visibility}
          disabled={busy}
          onChange={(e) =>
            change({
              ...settings,
              visibility: e.target.value as PublicationSettings['visibility'],
            })
          }
        >
          <option value="unlisted">Unlisted — secret link</option>
          <option value="public">Public — anyone with the page address</option>
        </select>
      </label>
      <label>
        Author credit
        <select
          value={settings.authorMode}
          disabled={busy}
          onChange={(e) =>
            change({
              ...settings,
              authorMode: e.target.value as PublicationSettings['authorMode'],
            })
          }
        >
          <option value="anonymous">Anonymous</option>
          <option value="handle">My public handle</option>
        </select>
      </label>
      <p className="subtle">
        A secret link can be forwarded by anyone who receives it. Search
        indexing and story link previews require a separate permission after
        publication. Starting a new life from this copy is currently disabled.
      </p>
      <PublicationRefreshChoice
        bundleId={bundle.bundleId}
        origin="community"
        disabled={busy}
        onChange={(target) => {
          setReplacement(target);
          setAck(false);
          confirmKey.current = null;
        }}
      />
      <button
        className="secondary"
        disabled={busy || !enabled}
        onClick={() => {
          if (expired) prepareKey.current = null;
          void prepare();
        }}
      >
        Prepare final publication preview
      </button>
      {preview && (
        <>
          <PublicationContent snapshot={preview.snapshot} preview />
          <p>
            Visibility: {preview.settings.visibility}. Author:{' '}
            {preview.snapshot.author.handle
              ? `@${preview.snapshot.author.handle}`
              : 'Anonymous'}
            . Preview valid until{' '}
            {new Date(preview.expiresAt).toLocaleTimeString('en')}.
          </p>
          {expired && (
            <p className="notice" role="status">
              This preview expired. Prepare a fresh copy.
            </p>
          )}
          <label className="shared-check">
            <input
              type="checkbox"
              checked={ack}
              disabled={busy || expired}
              onChange={(e) => setAck(e.target.checked)}
            />
            <span>
              I inspected this final story and all{' '}
              {preview.snapshot.checkpoints.length} decision points. I consent
              to publishing exactly this copy with the visibility and author
              credit shown above.
              {replacement &&
                ' I also consent to withdrawing the selected previous published copy and replacing it with this new link.'}
            </span>
          </label>
          <button
            className="primary"
            disabled={busy || !ack || expired}
            onClick={() => void confirm()}
          >
            {replacement
              ? 'Confirm replacement and publication'
              : 'Confirm publication'}
          </button>
        </>
      )}
      <button
        className="secondary"
        disabled={busy}
        onClick={() => {
          if (controller.current) void read(controller.current.signal);
        }}
      >
        Reload publication status
      </button>
      <p>
        <a href="/publications">Manage my published copies</a>
      </p>
    </section>
  );
}
