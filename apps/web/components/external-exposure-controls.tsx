'use client';
import { useEffect, useState } from 'react';
import {
  publicExposureOwnerViewSchema,
  type PublicExposureOwnerView,
} from '@future-flow/contracts';
import { lifeApi } from '../lib/client';
export function ExternalExposureControls({
  slug,
  publicationRevision,
  snapshotHash,
  active,
}: {
  slug: string;
  publicationRevision: number;
  snapshotHash: string;
  active: boolean;
}) {
  const [permission, setPermission] = useState<PublicExposureOwnerView | null>(
      null,
    ),
    [mode, setMode] = useState<'none' | 'preview' | 'index'>('none'),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  useEffect(() => {
    let live = true;
    setPermission(null);
    setAck(false);
    setNotice('');
    lifeApi(`/public-exposure/${slug}`)
      .then((raw) => {
        const p = publicExposureOwnerViewSchema.parse(raw);
        if (
          p.slug !== slug ||
          p.publicationRevision !== publicationRevision ||
          p.snapshotHash !== snapshotHash
        )
          throw Error('Changed copy');
        if (live) {
          setPermission(p);
          setMode(p.mode);
        }
      })
      .catch(() => {
        if (live)
          setNotice(
            'Could not load external sharing permissions. Reload your published copies to retry.',
          );
      });
    return () => {
      live = false;
    };
  }, [slug, publicationRevision, snapshotHash]);
  async function apply() {
    if (!permission || !ack || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const p = publicExposureOwnerViewSchema.parse(
        await lifeApi(`/public-exposure/${slug}`, {
          method: 'POST',
          body: JSON.stringify({
            publicationRevision,
            snapshotHash,
            permissionRevision: permission.permissionRevision,
            mode,
            acknowledged: true,
          }),
        }),
      );
      if (
        p.slug !== slug ||
        p.publicationRevision !== publicationRevision ||
        p.snapshotHash !== snapshotHash
      )
        throw Error('Changed copy');
      setPermission(p);
      setMode(p.mode);
      setNotice('External sharing permission saved.');
    } catch {
      setNotice(
        'Could not save this permission. Reload your published copies and check the current status before trying again.',
      );
    } finally {
      setBusy(false);
      setAck(false);
    }
  }
  return (
    <section aria-label="External sharing permissions">
      <h4>Search engines and link previews</h4>
      <p>
        These permissions apply to this published copy. Your private life
        remains private.
      </p>
      {permission && (
        <>
          <p>
            Current permission:{' '}
            {permission.effectiveMode === 'index'
              ? 'search indexing and link previews'
              : permission.effectiveMode === 'preview'
                ? 'link previews only'
                : 'neither search indexing nor story link previews'}
            .
          </p>
          {!permission.enabled && (
            <p>
              External sharing is not open yet. You can still revoke a saved
              permission.
            </p>
          )}
          {permission.authority === 'curator' && (
            <p>
              Official life previews and indexing are enabled by a curator. You
              can revoke them here.
            </p>
          )}
          <label>
            External sharing
            <select
              value={mode}
              disabled={busy}
              onChange={(e) => {
                setMode(e.target.value as typeof mode);
                setAck(false);
              }}
            >
              <option value="none">No story preview or indexing</option>
              <option
                value="preview"
                disabled={
                  !permission.enabled ||
                  !active ||
                  permission.authority === 'curator'
                }
              >
                Allow story link previews
              </option>
              <option
                value="index"
                disabled={
                  !permission.enabled ||
                  !active ||
                  permission.authority === 'curator'
                }
              >
                Allow search indexing and story link previews
              </option>
            </select>
          </label>
          <p>
            Search engines and sharing services may keep copies after you revoke
            permission or withdraw the story. We stop serving new previews and
            sitemap entries, but cannot recall external copies.
          </p>
          <label>
            <input
              type="checkbox"
              checked={ack}
              disabled={busy}
              onChange={(e) => setAck(e.target.checked)}
            />{' '}
            I have reviewed this permission and understand that external copies
            may remain.
          </label>
          <button
            type="button"
            disabled={
              !ack ||
              busy ||
              mode === permission.mode ||
              (permission.authority === 'curator' && mode !== 'none')
            }
            onClick={() => void apply()}
          >
            {busy ? 'Saving…' : 'Save external sharing permission'}
          </button>
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
