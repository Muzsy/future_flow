'use client';
import { useEffect, useRef, useState } from 'react';
import {
  publicationRefreshTargetsSchema,
  type PublicationRefreshTarget,
} from '@future-flow/contracts';
import { lifeApi } from '../lib/client';
export function PublicationRefreshChoice({
  bundleId,
  origin,
  disabled,
  onChange,
}: {
  bundleId: string;
  origin: 'community' | 'official';
  disabled: boolean;
  onChange: (target: PublicationRefreshTarget | null) => void;
}) {
  const [items, setItems] = useState<PublicationRefreshTarget[]>([]),
    [enabled, setEnabled] = useState(false),
    [selected, setSelected] = useState(''),
    [loading, setLoading] = useState(false),
    [notice, setNotice] = useState('');
  const callback = useRef(onChange),
    controller = useRef<AbortController | null>(null);
  callback.current = onChange;
  async function read() {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setSelected('');
    callback.current(null);
    setNotice('');
    try {
      const raw = publicationRefreshTargetsSchema.parse(
        await lifeApi(
          `/publication-refresh/${origin}/bundles/${bundleId}/targets`,
          { signal: abort.signal },
        ),
      );
      if (raw.bundleId !== bundleId || raw.classification !== origin)
        throw Error('Wrong source');
      if (!abort.signal.aborted) {
        setItems(raw.items);
        setEnabled(raw.enabled);
      }
    } catch {
      if (!abort.signal.aborted) {
        setItems([]);
        setEnabled(false);
        setNotice(
          'Could not load copies available for replacement. You can reload these options.',
        );
      }
    } finally {
      if (!abort.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    void read();
    return () => controller.current?.abort();
  }, [bundleId, origin]);
  return (
    <section aria-label="Replace a previous publication">
      {enabled && (
        <>
          <label>
            Publication action
            <select
              value={selected}
              disabled={disabled || loading}
              onChange={(e) => {
                const target =
                  items.find((i) => i.publicationId === e.target.value) ?? null;
                setSelected(target?.publicationId ?? '');
                callback.current(target);
              }}
            >
              <option value="">Publish as a separate copy</option>
              {items.map((i) => (
                <option key={i.publicationId} value={i.publicationId}>
                  Replace: {i.title} · {i.visibility} ·{' '}
                  {new Date(i.publishedAt).toLocaleString('en')}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <p>
              The selected previous copy will be withdrawn when this new copy is
              published. Its old link will stop working. This copy gets a new
              link and separate search/index preview permissions. Previously
              downloaded external copies may remain.
            </p>
          )}
          {!items.length && (
            <p>
              No active earlier copy from this private branch is available to
              replace.
            </p>
          )}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
      {(enabled || notice) && (
        <button
          type="button"
          className="secondary"
          disabled={disabled || loading}
          onClick={() => void read()}
        >
          Reload replacement options
        </button>
      )}
    </section>
  );
}
