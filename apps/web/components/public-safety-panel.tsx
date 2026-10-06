'use client';
import { useEffect, useState } from 'react';
import {
  publicSafetyViewSchema,
  type PublicSafetyView,
} from '@future-flow/contracts';
import { lifeApi, clientErrorMessage } from '../lib/client';
import { publicReportLabels } from '../lib/public-safety';
export function PublicSafetyPanel() {
  const [view, setView] = useState<PublicSafetyView | null>(null),
    [notice, setNotice] = useState('Loading safety notices…');
  useEffect(() => {
    const abort = new AbortController();
    void lifeApi('/public-safety', {
      signal: abort.signal,
      referrerPolicy: 'no-referrer',
    })
      .then((raw) => {
        const next = publicSafetyViewSchema.parse(raw);
        if (!abort.signal.aborted) {
          setView(next);
          setNotice('');
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) setNotice(clientErrorMessage(error));
      });
    return () => abort.abort();
  }, []);
  return (
    <section>
      <h2>Public life safety notices</h2>
      {notice && <p role="status">{notice}</p>}
      {view && (
        <>
          {view.publishingRestricted && (
            <p className="notice">
              Publishing is restricted for your account. Your private lives
              remain available. A moderator must review the restriction before
              publishing resumes.
            </p>
          )}
          {view.warnings.length === 0 ? (
            <p>No public life safety notices.</p>
          ) : (
            <ul>
              {view.warnings.map((w) => (
                <li key={w.id}>
                  {new Date(w.createdAt).toLocaleDateString('en')} ·{' '}
                  {publicReportLabels[w.reason]} ·{' '}
                  {w.action === 'hide'
                    ? 'Public copy hidden'
                    : w.action === 'remove'
                      ? 'Public copy removed'
                      : 'Warning issued'}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
