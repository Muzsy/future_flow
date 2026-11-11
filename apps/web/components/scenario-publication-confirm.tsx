'use client';
import { useEffect, useRef, useState } from 'react';
import {
  scenarioOwnedPublicationsSchema,
  publicScenarioOwnerSchema,
  type ScenarioPublicationSource,
  type PublicScenarioPreview,
} from '@future-flow/contracts';
import {
  lifeApi,
  authConfigured,
  clientErrorMessage,
  ClientError,
} from '../lib/client';
import { useScenarioAccount } from '../lib/scenario-account';
import {
  verifiedScenarioSource,
  verifiedScenarioPublicationPreview,
} from '../lib/scenario-ui';
import { ScenarioFacts } from './scenario-facts';
export function ScenarioPublicationConfirm({
  versionId,
}: {
  versionId: string;
}) {
  const account = useScenarioAccount();
  return (
    <main className="shell scenario-page">
      <nav>
        <a href="/">alterward</a> · <a href="/discover">Discover</a>
      </nav>
      <h1>Publish a reviewed scenario</h1>
      {account.user ? (
        <Owner
          key={account.user + account.version + versionId}
          user={account.user}
          versionId={versionId}
          account={account}
        />
      ) : (
        <p>
          {authConfigured
            ? 'Sign in to manage a scenario you own.'
            : 'Scenario publication is not configured here yet.'}{' '}
          <a href="/login">Sign in</a>
        </p>
      )}
    </main>
  );
}
function Owner({
  user,
  versionId,
  account,
}: {
  user: string;
  versionId: string;
  account: ReturnType<typeof useScenarioAccount>;
}) {
  const [source, setSource] = useState<ScenarioPublicationSource | null>(null),
    [history, setHistory] = useState<
      ReturnType<typeof scenarioOwnedPublicationsSchema.parse>['publications']
    >([]),
    [preview, setPreview] = useState<PublicScenarioPreview | null>(null),
    [allow, setAllow] = useState(false),
    [ack, setAck] = useState(false),
    [personalAck, setPersonalAck] = useState(false),
    [expired, setExpired] = useState(false),
    [busy, setBusy] = useState(true),
    [notice, setNotice] = useState(''),
    [uncertain, setUncertain] = useState(false);
  const active = useRef(true),
    ownEpoch = useRef(account.epoch.current),
    prepareRequest = useRef<{ signature: string; key: string } | null>(null),
    confirmRequest = useRef<{ signature: string; key: string } | null>(null),
    valid = () =>
      active.current &&
      account.current.current === user &&
      account.epoch.current === ownEpoch.current;
  async function read(signal?: AbortSignal) {
    const results = await Promise.allSettled([
      lifeApi(
        `/scenario-publications/versions/${versionId}/source`,
        { signal },
        user,
      ).then((raw) => verifiedScenarioSource(raw, versionId)),
      lifeApi(
        `/scenario-publications/versions/${versionId}/publications`,
        { signal },
        user,
      ).then((raw) => scenarioOwnedPublicationsSchema.parse(raw)),
    ]);
    if (!valid() || signal?.aborted) return;
    const [current, owned] = results;
    if (current.status === 'fulfilled') setSource(current.value);
    else {
      setSource(null);
      setNotice(
        'A current reviewed scenario with source permission is required before publication. Your existing publications can still be withdrawn.',
      );
    }
    if (
      owned.status === 'fulfilled' &&
      owned.value.scenarioVersionId === versionId
    )
      setHistory(owned.value.publications);
    else {
      setHistory([]);
      setNotice('We could not load your publications. Try reloading.');
    }
  }
  useEffect(() => {
    active.current = true;
    const abort = new AbortController();
    void read(abort.signal).finally(() => {
      if (valid() && !abort.signal.aborted) setBusy(false);
    });
    return () => {
      active.current = false;
      abort.abort();
    };
  }, [user, versionId]);
  useEffect(() => {
    if (!preview) return;
    setExpired(false);
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, Date.parse(preview.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [preview]);
  async function prepare() {
    if (!source || busy || !valid()) return;
    const body = {
        templateHash: source.templateHash,
        sourceGrantId: source.sourceGrantId,
        allowPersonalization: allow,
      },
      signature = JSON.stringify({ user, versionId, ...body });
    if (prepareRequest.current?.signature !== signature)
      prepareRequest.current = { signature, key: crypto.randomUUID() };
    setBusy(true);
    setNotice('');
    try {
      const next = await verifiedScenarioPublicationPreview(
        await lifeApi(
          `/scenario-publications/versions/${versionId}/preview`,
          {
            method: 'POST',
            headers: { 'Idempotency-Key': prepareRequest.current.key },
            body: JSON.stringify(body),
          },
          user,
        ),
        source,
        allow,
      );
      if (valid()) {
        setPreview(next);
        setAck(false);
        setPersonalAck(false);
        setUncertain(false);
        confirmRequest.current = null;
      }
    } catch (error) {
      if (valid()) setNotice(clientErrorMessage(error));
    } finally {
      if (valid()) setBusy(false);
    }
  }
  async function confirm() {
    if (
      !preview ||
      !valid() ||
      busy ||
      !ack ||
      (preview.allowPersonalization && !personalAck) ||
      (!confirmRequest.current && Date.parse(preview.expiresAt) <= Date.now())
    )
      return;
    const body = {
        previewId: preview.id,
        previewHash: preview.previewHash,
        acknowledged: true,
        personalizationAcknowledged:
          preview.allowPersonalization && personalAck,
      },
      signature = JSON.stringify({ user, ...body });
    if (confirmRequest.current?.signature !== signature)
      confirmRequest.current = { signature, key: crypto.randomUUID() };
    setBusy(true);
    setNotice('');
    try {
      const publication = publicScenarioOwnerSchema.parse(
        await lifeApi(
          '/scenario-publications/confirm',
          {
            method: 'POST',
            headers: { 'Idempotency-Key': confirmRequest.current.key },
            body: JSON.stringify(body),
          },
          user,
        ),
      );
      if (
        publication.templateHash !== preview.templateHash ||
        publication.allowPersonalization !== preview.allowPersonalization
      )
        throw Error('Wrong publication');
      if (valid()) {
        setPreview(null);
        setAck(false);
        setPersonalAck(false);
        setUncertain(false);
        setNotice(
          'Scenario publication request resolved. Review its current status below.',
        );
        await read();
      }
    } catch (error) {
      if (valid()) {
        setUncertain(!(error instanceof ClientError));
        setNotice(
          error instanceof ClientError
            ? clientErrorMessage(error)
            : 'The confirmation response is uncertain. Retry this confirmation to resolve the same request.',
        );
      }
    } finally {
      if (valid()) setBusy(false);
    }
  }
  async function withdraw(id: string) {
    if (!valid() || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const next = publicScenarioOwnerSchema.parse(
        await lifeApi(
          `/scenario-publications/${id}/withdraw`,
          { method: 'POST', body: '{}' },
          user,
        ),
      );
      if (next.id !== id) throw Error('Wrong publication');
      if (valid()) {
        setPreview(null);
        setAck(false);
        setPersonalAck(false);
        await read();
      }
    } catch (error) {
      if (valid()) setNotice(clientErrorMessage(error));
    } finally {
      if (valid()) setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        {preview ? (
          <>
            <h2>Review the complete public copy</h2>
            <h3>{preview.template.title}</h3>
            <p>{preview.template.summary}</p>
            <ScenarioFacts facts={preview.template} />
            <p>
              This copy will be publicly readable as an Official Scenario. It is
              a starting template, not an Official Life or a forecast. No
              external indexing is enabled here.
            </p>
            <p>
              Personalized private starts:{' '}
              {preview.allowPersonalization ? 'Allowed' : 'Not allowed'}.
              Preview expires: {preview.expiresAt}
              {expired ? ' — expired' : ''}
            </p>
            <label>
              <input
                type="checkbox"
                checked={ack}
                disabled={busy}
                onChange={(e) => setAck(e.target.checked)}
              />
              I reviewed this exact public copy and approve publication.
            </label>
            {preview.allowPersonalization && (
              <label>
                <input
                  type="checkbox"
                  checked={personalAck}
                  disabled={busy}
                  onChange={(e) => setPersonalAck(e.target.checked)}
                />
                I separately allow people to create private lives using this
                scenario’s theme and their own approved profile.
              </label>
            )}
            <button
              type="button"
              disabled={
                busy ||
                !ack ||
                (preview.allowPersonalization && !personalAck) ||
                (expired && !confirmRequest.current)
              }
              onClick={() => void confirm()}
            >
              {confirmRequest.current
                ? 'Resolve this publication request'
                : 'Confirm publication'}
            </button>
            <button
              type="button"
              disabled={busy || uncertain}
              onClick={() => {
                setPreview(null);
                setAck(false);
                setPersonalAck(false);
                prepareRequest.current = null;
                confirmRequest.current = null;
              }}
            >
              Change publication settings
            </button>
          </>
        ) : source ? (
          <>
            <h2>{source.template.title}</h2>
            <p>{source.template.summary}</p>
            <ScenarioFacts facts={source.template} />
            <label>
              <input
                type="checkbox"
                checked={allow}
                disabled={busy}
                onChange={(e) => {
                  setAllow(e.target.checked);
                  setAck(false);
                  setPersonalAck(false);
                  prepareRequest.current = null;
                }}
              />
              Allow people to personalize this scenario into private lives
            </label>
            <p>
              Preparing the public copy does not publish it or generate an AI
              story.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void prepare()}
            >
              Prepare public copy
            </button>
          </>
        ) : (
          <p>
            {busy
              ? 'Loading your scenario…'
              : 'No current publishable source is available.'}
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Your publication history</h2>
        {history.length ? (
          <ul>
            {history.map((p) => (
              <li key={p.id}>
                <a href={`/scenarios/${p.slug}`}>Read scenario</a> · {p.status}{' '}
                · Private starts{' '}
                {p.allowPersonalization ? 'allowed' : 'not allowed'}
                {p.status === 'active' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void withdraw(p.id)}
                  >
                    Withdraw this scenario
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>No publications found.</p>
        )}
      </section>
      {notice && <p role="status">{notice}</p>}
    </>
  );
}
