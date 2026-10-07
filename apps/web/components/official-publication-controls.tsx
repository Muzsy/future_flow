'use client';
import { useRef, useState } from 'react';
import type { OfficialPublicationOwnerView } from '@future-flow/contracts';
import { lifeApi } from '../lib/client';
import { ExternalExposureControls } from './external-exposure-controls';
import { PublicForkPermissionControls } from './public-fork-permission-controls';
import {
  verifiedOwnedOfficialPublication,
  officialPublicationLink,
  officialPublicationError,
} from '../lib/official-publication';
export function OfficialPublicationControls({
  view,
  onChange,
}: {
  view: OfficialPublicationOwnerView;
  onChange: (view: OfficialPublicationOwnerView) => void;
}) {
  const [action, setAction] = useState<'withdraw' | 'rotate-link' | null>(null),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const request = useRef<{
    action: string;
    revision: number;
    key: string;
  } | null>(null);
  const link = officialPublicationLink(view);
  async function apply() {
    if (!action || !ack || busy) return;
    if (
      request.current?.action !== action ||
      request.current.revision !== view.revision
    )
      request.current = {
        action,
        revision: view.revision,
        key: crypto.randomUUID(),
      };
    setBusy(true);
    setNotice('');
    try {
      const next = await verifiedOwnedOfficialPublication(
        await lifeApi(
          `/official-publications/${view.publicationId}/${action}`,
          {
            method: 'POST',
            headers: { 'Idempotency-Key': request.current.key },
            body: JSON.stringify({
              revision: view.revision,
              snapshotHash: view.snapshotHash,
              acknowledged: true,
            }),
          },
        ),
      );
      if (
        next.publicationId !== view.publicationId ||
        next.snapshotHash !== view.snapshotHash
      )
        throw Error('Wrong publication');
      onChange(next);
      setAction(null);
      setAck(false);
      request.current = null;
    } catch (error) {
      setNotice(officialPublicationError(error));
      setAck(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Publication controls" className="panel">
      <h3>Published Official copy</h3>
      <p role="status">
        {view.status === 'active'
          ? view.settings.visibility === 'public'
            ? 'Public: anyone with the page address can read this copy.'
            : 'Unlisted: anyone with its secret link can read this copy.'
          : `This copy is ${view.status}. It cannot be read publicly.`}
      </p>
      <p className="subtle">
        Your private life can continue independently. This published copy stays
        unchanged.
      </p>
      {view.settings.visibility === 'public' && (
        <PublicForkPermissionControls
          slug={view.slug}
          publicationRevision={view.revision}
          snapshotHash={view.snapshotHash}
          active={view.status === 'active'}
        />
      )}
      {view.settings.visibility === 'public' && (
        <ExternalExposureControls
          slug={view.slug}
          publicationRevision={view.revision}
          snapshotHash={view.snapshotHash}
          active={view.status === 'active'}
        />
      )}
      {link && (
        <p>
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            Open{' '}
            {view.settings.visibility === 'unlisted'
              ? 'secret link'
              : 'published life'}
          </a>
        </p>
      )}
      {view.status === 'active' &&
        view.settings.visibility === 'unlisted' &&
        !link && <p>The secret link must be renewed before you can copy it.</p>}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {['active', 'hidden'].includes(view.status) && (
        <div className="actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              setAction('withdraw');
              setAck(false);
            }}
          >
            Withdraw publication
          </button>
          {view.status === 'active' &&
            view.settings.visibility === 'unlisted' && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setAction('rotate-link');
                  setAck(false);
                }}
              >
                Renew secret link
              </button>
            )}
        </div>
      )}
      {action && (
        <>
          <label className="shared-check">
            <input
              type="checkbox"
              checked={ack}
              disabled={busy}
              onChange={(e) => setAck(e.target.checked)}
            />
            <span>
              {action === 'withdraw'
                ? 'I want to stop access to this published copy. Republishing requires a newly reviewed copy. Copies already read or downloaded cannot be recalled.'
                : 'I want a new secret link. The old link will stop working.'}
            </span>
          </label>
          <button
            className="primary"
            disabled={busy || !ack}
            onClick={() => void apply()}
          >
            {action === 'withdraw' ? 'Confirm withdrawal' : 'Confirm new link'}
          </button>
        </>
      )}
    </section>
  );
}
