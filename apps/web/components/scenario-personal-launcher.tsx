'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  privacyConsentStatusSchema,
  personalScenarioStartReceiptSchema,
  type PublicScenarioReader,
  type ScenarioPersonalProfile,
  type PersonalScenarioPreview,
} from '@future-flow/contracts';
import {
  api,
  lifeApi,
  authConfigured,
  clientErrorMessage,
  ClientError,
} from '../lib/client';
import { useScenarioAccount } from '../lib/scenario-account';
import { publicLoginHref } from '../lib/public-return';
import { verifiedPersonalScenarioPreview } from '../lib/scenario-ui';
import { ScenarioFacts } from './scenario-facts';
import { ScenarioPersonalProfileForm } from './scenario-personal-profile';
export function ScenarioPersonalLauncher({
  source,
}: {
  source: PublicScenarioReader;
}) {
  const account = useScenarioAccount();
  if (!authConfigured) return <p>Private starts are not available here yet.</p>;
  if (!account.user)
    return (
      <p>
        <a href={publicLoginHref(source.slug)}>
          Sign in to explore this scenario with your own starting point
        </a>
        . Creating a life needs your separate approval.
      </p>
    );
  return (
    <PersonalLauncher
      key={account.user + account.version + source.templateHash}
      source={source}
      user={account.user}
      account={account}
    />
  );
}
function PersonalLauncher({
  source,
  user,
  account,
}: {
  source: PublicScenarioReader;
  user: string;
  account: ReturnType<typeof useScenarioAccount>;
}) {
  const router = useRouter(),
    [privacy, setPrivacy] = useState<boolean | null>(null),
    [adult, setAdult] = useState(false),
    [preview, setPreview] = useState<PersonalScenarioPreview | null>(null),
    [draft, setDraft] = useState<ScenarioPersonalProfile | null>(null),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [expired, setExpired] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [notice, setNotice] = useState('');
  const active = useRef(true),
    ownEpoch = useRef(account.epoch.current),
    prepared = useRef<{ signature: string; key: string } | null>(null),
    started = useRef<{ signature: string; key: string } | null>(null);
  const valid = () =>
    active.current &&
    account.current.current === user &&
    account.epoch.current === ownEpoch.current;
  useEffect(() => {
    active.current = true;
    const abort = new AbortController();
    void api('/me/consent', { signal: abort.signal }, 'v1', user)
      .then((raw) => {
        if (valid() && !abort.signal.aborted)
          setPrivacy(privacyConsentStatusSchema.parse(raw).acknowledged);
      })
      .catch(() => {
        if (valid() && !abort.signal.aborted)
          setNotice(
            'We could not load your privacy settings. Reload to try again.',
          );
      });
    return () => {
      active.current = false;
      abort.abort();
    };
  }, [user]);
  useEffect(() => {
    if (!preview) return;
    setExpired(false);
    const timer = setTimeout(
      () => {
        setExpired(true);
      },
      Math.max(0, Date.parse(preview.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [preview]);
  async function prepare(profile: ScenarioPersonalProfile) {
    if (!valid() || busy || privacy === null || (!privacy && !adult)) return;
    const body = {
        templateHash: source.templateHash,
        profile,
        acknowledged: true,
      },
      signature = JSON.stringify({ user, slug: source.slug, ...body });
    if (prepared.current?.signature !== signature)
      prepared.current = { signature, key: crypto.randomUUID() };
    setBusy(true);
    setNotice('');
    setDraft(profile);
    try {
      if (!privacy) {
        await api(
          '/me/consent',
          {
            method: 'POST',
            body: JSON.stringify({ adult: true, acknowledged: true }),
          },
          'v1',
          user,
        );
        if (!valid()) return;
        setPrivacy(true);
      }
      const raw = await lifeApi(
        `/personal-scenarios/sources/${source.slug}/preview`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': prepared.current.key },
          body: JSON.stringify(body),
        },
        user,
      );
      const next = await verifiedPersonalScenarioPreview(raw, source, profile);
      if (valid()) {
        setPreview(next);
        setAck(false);
        started.current = null;
        setUncertain(false);
      }
    } catch (error) {
      if (valid()) {
        if (
          error instanceof ClientError &&
          error.code === 'PERSONAL_SCENARIO_PREVIEW_EXPIRED'
        ) {
          prepared.current = null;
          setNotice(
            'The preview expired. Use the review button to explicitly prepare a fresh private preview.',
          );
        } else setNotice(clientErrorMessage(error));
      }
    } finally {
      if (valid()) setBusy(false);
    }
  }
  async function start() {
    if (
      !valid() ||
      busy ||
      !preview ||
      !ack ||
      (!started.current && Date.parse(preview.expiresAt) <= Date.now())
    )
      return;
    const body = {
        previewId: preview.id,
        previewHash: preview.previewHash,
        profile: preview.profile,
        acknowledged: true,
      },
      signature = JSON.stringify({ user, slug: source.slug, ...body });
    if (started.current?.signature !== signature)
      started.current = { signature, key: crypto.randomUUID() };
    setBusy(true);
    setNotice('');
    try {
      const receipt = personalScenarioStartReceiptSchema.parse(
        await lifeApi(
          `/personal-scenarios/sources/${source.slug}/start`,
          {
            method: 'POST',
            headers: { 'Idempotency-Key': started.current.key },
            body: JSON.stringify(body),
          },
          user,
        ),
      );
      if (valid()) router.push(`/life/${receipt.branchId}`);
    } catch (error) {
      if (valid()) {
        setUncertain(!(error instanceof ClientError));
        setNotice(
          error instanceof ClientError
            ? clientErrorMessage(error)
            : 'The response is uncertain. Use the same start button to check this request; it will not create a second life.',
        );
      }
    } finally {
      if (valid()) setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label="Personalize this scenario">
      <h2>Explore this scenario with your own starting point</h2>
      {!privacy && (
        <label>
          <input
            type="checkbox"
            checked={adult}
            disabled={busy || privacy === null}
            onChange={(e) => setAdult(e.target.checked)}
          />
          I am 18 or older and agree to the{' '}
          <a href="/privacy">privacy notice and AI processing</a>.
        </label>
      )}
      {!preview ? (
        <ScenarioPersonalProfileForm
          key={user}
          busy={busy || privacy === null || (!privacy && !adult)}
          contextLimit={Math.max(
            0,
            Math.min(
              1000,
              1000 -
                source.template.environment.description.length -
                '\nUser-approved personal context: '.length,
            ),
          )}
          onPreview={prepare}
          initialProfile={draft}
        />
      ) : (
        <>
          <h3>Your complete private starting point</h3>
          <p>
            The scenario’s primary theme remains as a secondary goal. Your own
            goal is primary. The example’s starting facts and conditions have
            been replaced with your approved profile.
          </p>
          <ScenarioFacts facts={preview.composition.facts} />
          <p>
            Private · English · No publication permission. Preparing this
            preview has not generated a story.
          </p>
          <p>
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
            I reviewed this complete starting point and approve creating one
            private AI-generated life.
          </label>
          <button
            type="button"
            disabled={busy || !ack || (expired && !started.current)}
            onClick={() => void start()}
          >
            {started.current
              ? 'Resolve this start request'
              : 'Create my private life'}
          </button>
          <button
            type="button"
            disabled={busy || uncertain}
            onClick={() => {
              setPreview(null);
              setAck(false);
              setNotice('');
              prepared.current = null;
              started.current = null;
            }}
          >
            Edit starting facts
          </button>
        </>
      )}
      {notice && <p role="alert">{notice}</p>}
      <p>AI explores a possible story. It does not predict what will happen.</p>
    </section>
  );
}
