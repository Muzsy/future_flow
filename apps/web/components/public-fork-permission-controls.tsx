'use client';
import { useEffect, useRef, useState } from 'react';
import {
  publicForkPermissionOwnerSchema,
  type PublicForkPermissionOwner,
} from '@future-flow/contracts';
import { lifeApi } from '../lib/client';
type Props = {
  slug: string;
  publicationRevision: number;
  snapshotHash: string;
  active: boolean;
};
export function PublicForkPermissionControls(props: Props) {
  return (
    <ForkConsent
      key={`${props.slug}:${props.publicationRevision}:${props.snapshotHash}:${props.active}`}
      {...props}
    />
  );
}
function ForkConsent({
  slug,
  publicationRevision,
  snapshotHash,
  active,
}: Props) {
  const [permission, setPermission] =
      useState<PublicForkPermissionOwner | null>(null),
    [allowed, setAllowed] = useState(false),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null);
  function verified(raw: unknown) {
    const next = publicForkPermissionOwnerSchema.parse(raw);
    if (
      next.slug !== slug ||
      next.publicationRevision !== publicationRevision ||
      next.snapshotHash !== snapshotHash
    )
      throw Error('Changed copy');
    return next;
  }
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    lifeApi(`/public-fork-permission/${slug}`, { signal: abort.signal })
      .then((raw) => {
        const next = verified(raw);
        if (!abort.signal.aborted) {
          setPermission(next);
          setAllowed(next.allowed);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setNotice(
            'Could not load fork permission. Reload your published copies to retry.',
          );
      });
    return () => abort.abort();
    // This component remounts whenever its publication binding changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function save() {
    const abort = controller.current;
    if (!permission || !ack || busy || !abort || abort.signal.aborted) return;
    setBusy(true);
    setNotice('');
    try {
      const next = verified(
        await lifeApi(`/public-fork-permission/${slug}`, {
          method: 'POST',
          signal: abort.signal,
          body: JSON.stringify({
            publicationRevision,
            snapshotHash,
            permissionRevision: permission.permissionRevision,
            allowed,
            acknowledged: true,
          }),
        }),
      );
      if (!abort.signal.aborted) {
        setPermission(next);
        setAllowed(next.allowed);
        setNotice('Fork permission saved.');
      }
    } catch {
      if (!abort.signal.aborted)
        setNotice(
          'Could not save this permission. Reload your published copies and check the current permission before retrying.',
        );
    } finally {
      if (!abort.signal.aborted) {
        setBusy(false);
        setAck(false);
      }
    }
  }
  return (
    <section aria-label="Permission to start private lives">
      <h4>Let readers take a different path</h4>
      <p>
        This permission applies to the reviewed decision checkpoints in this
        published copy. A reader can use them to start an independent private
        life. Your private branches remain private.
      </p>
      {permission && (
        <>
          <p>
            Current permission:{' '}
            {permission.effectiveAllowed ? 'allowed' : 'not available'}.
          </p>
          {!permission.startsEnabled && (
            <p>
              Starting private lives from public stories is not open yet. You
              can prepare or revoke permission here.
            </p>
          )}
          {permission.authority === 'curator' && (
            <p>
              Official life fork permission requires curator approval. You can
              revoke it here.
            </p>
          )}
          <label>
            Fork permission{' '}
            <select
              value={allowed ? 'allow' : 'deny'}
              disabled={busy}
              onChange={(e) => {
                setAllowed(e.target.value === 'allow');
                setAck(false);
              }}
            >
              <option value="deny">Do not allow new private lives</option>
              <option
                value="allow"
                disabled={
                  !active ||
                  !permission.enabled ||
                  permission.authority === 'curator'
                }
              >
                Allow new private lives
              </option>
            </select>
          </label>
          <p>
            Revoking permission or withdrawing this copy stops new starts.
            Private lives already created by readers may remain. A refreshed
            publication needs its own permission.
          </p>
          <label>
            <input
              type="checkbox"
              checked={ack}
              disabled={busy}
              onChange={(e) => setAck(e.target.checked)}
            />{' '}
            I have reviewed this permission and understand that existing private
            copies may remain.
          </label>
          <button
            type="button"
            disabled={
              !ack ||
              busy ||
              allowed === permission.allowed ||
              (allowed &&
                (!active ||
                  !permission.enabled ||
                  permission.authority === 'curator'))
            }
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : 'Save fork permission'}
          </button>
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
