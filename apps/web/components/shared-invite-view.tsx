'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InvitePreview, Social } from '../lib/shared-types';
import { InviteSafetyReport } from './shared-safety';
import {
  currentOwnBranch,
  OwnBranchSelect,
  SharingConsent,
  SharedNotice,
  sharedApi,
  useSharedAction,
} from './shared-controls';

export function SharedInviteView({
  social,
  initialToken,
}: {
  social: Social;
  initialToken: string;
}) {
  const router = useRouter(),
    action = useSharedAction();
  const [token, setToken] = useState(initialToken),
    [preview, setPreview] = useState<InvitePreview | null>(null),
    [branchId, setBranchId] = useState(''),
    [consent, setConsent] = useState(false);
  const included = social.entitlement.tier !== 'free';
  return (
    <section className="panel shared-fields">
      <div className="eyebrow">Private invitation</div>
      <h1>Join a shared life</h1>
      <p>Preview an invitation before choosing a branch or sharing anything.</p>
      <SharedNotice notice={action.notice} />
      <form
        className="shared-fields"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            const result = await sharedApi<InvitePreview>(
              '/shared-invites/preview',
              { method: 'POST', body: JSON.stringify({ token }) },
            );
            setPreview(result);
            setConsent(false);
            setBranchId('');
          });
        }}
      >
        <label>
          Invitation code
          <input
            type="password"
            value={token}
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setToken(e.target.value.trim());
              setPreview(null);
              setConsent(false);
            }}
            required
          />
        </label>
        <button className="secondary" disabled={action.busy || !token}>
          Preview invitation
        </button>
      </form>
      {token && <InviteSafetyReport key={token} token={token} />}
      {preview && (
        <>
          <h2>{preview.title}</h2>
          <p>Invited by {preview.inviter}</p>
          <p>
            Shared date: {preview.simulationAt}. Expires{' '}
            {new Date(preview.expiresAt).toLocaleString('en-GB')}.
          </p>
          {!included && (
            <p className="notice">
              Your current plan allows previews. Joining a friend group requires
              an eligible plan. Plan activation is not available here yet.
            </p>
          )}
          {!social.profile && (
            <p>
              Save your connection profile on the Connections page before
              joining.
            </p>
          )}
          {included && social.profile && (
            <>
              <OwnBranchSelect
                value={branchId}
                onChange={setBranchId}
                disabled={action.busy}
              />
              <p className="subtle">
                Your branch must be in the same calendar month as the group’s
                current branches. Joining does not move your personal timeline.
              </p>
              <SharingConsent checked={consent} onChange={setConsent} />
              <button
                className="primary"
                disabled={action.busy || !branchId || !consent}
                onClick={() =>
                  void action.run(async () => {
                    const branch = await currentOwnBranch(branchId);
                    await action.post(
                      `/shared-invites/${preview.inviteId}/accept`,
                      {
                        token,
                        branchId,
                        revision: branch.revision,
                        contextRevision: preview.contextRevision,
                        sharingAcknowledged: true,
                      },
                    );
                    setToken('');
                    router.push(`/connections/${preview.contextId}`);
                  })
                }
              >
                Accept and share this branch’s group events
              </button>
            </>
          )}
          <button
            className="text-button"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                if (preview.canDecline)
                  await action.post(
                    `/shared-invites/${preview.inviteId}/decline`,
                    { token },
                  );
                setToken('');
                setPreview(null);
                router.push('/connections');
              })
            }
          >
            {preview.canDecline ? 'Decline invitation' : 'Dismiss invitation'}
          </button>
        </>
      )}
    </section>
  );
}
