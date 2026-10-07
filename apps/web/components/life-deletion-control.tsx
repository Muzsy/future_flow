'use client';
import { useEffect, useRef, useState } from 'react';
import { lifeDeletionReceiptSchema } from '@future-flow/contracts';
import { lifeApi, clientErrorMessage } from '../lib/client';
export function LifeDeletionControl({
  lifeId,
  branchId,
  revision,
  branchCount,
  disabled,
  onDeleted,
}: {
  lifeId: string;
  branchId: string;
  revision: number;
  branchCount: number;
  disabled: boolean;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false),
    [confirmation, setConfirmation] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    key = useRef<string | null>(null);
  useEffect(() => {
    setOpen(false);
    setConfirmation('');
    setNotice('');
    key.current = null;
  }, [lifeId, branchId, revision]);
  async function remove() {
    if (disabled || busy || confirmation !== 'DELETE LIFE') return;
    setBusy(true);
    setNotice('');
    key.current ??= crypto.randomUUID();
    try {
      const result = lifeDeletionReceiptSchema.parse(
        await lifeApi(`/lives/${lifeId}`, {
          method: 'DELETE',
          headers: { 'Idempotency-Key': key.current },
          body: JSON.stringify({ branchId, revision, confirmation }),
        }),
      );
      if (result.lifeId !== lifeId) throw Error('Wrong life');
      onDeleted();
    } catch (error) {
      setNotice(clientErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Delete this private life">
      {!open ? (
        <button
          className="secondary"
          type="button"
          disabled={disabled || busy}
          onClick={() => setOpen(true)}
        >
          Delete this life
        </button>
      ) : (
        <div className="notice">
          <h2>Permanently delete this life</h2>
          <p>
            This removes all {branchCount} branches, their chapters, choices and
            publication copies. Existing public and secret links will stop
            working, and pending generation tasks will lose permission to save
            results.
          </p>
          <p>
            Connections attached to this life will end your participation.
            Shared dates and outcomes may remain with affected text hidden.
            Previously downloaded external copies may remain.
          </p>
          <p>
            Your account and other lives stay available. Deletion requires a
            recent sign-in.
          </p>
          <label>
            Type DELETE LIFE to confirm
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              disabled={disabled || busy}
            />
          </label>
          <button
            type="button"
            disabled={disabled || busy || confirmation !== 'DELETE LIFE'}
            onClick={() => void remove()}
          >
            {busy ? 'Deleting…' : 'Permanently delete this life'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              setConfirmation('');
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {notice && <p role="alert">{notice}</p>}
    </section>
  );
}
