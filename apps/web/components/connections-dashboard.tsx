'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientErrorMessage } from '../lib/client';
import type { Connection, Social } from '../lib/shared-types';
import {
  currentOwnBranch,
  OwnBranchSelect,
  SharingConsent,
  SharedNotice,
  SocialProfileForm,
  sharedApi,
  useSharedAction,
} from './shared-controls';
import { SharedContextView } from './shared-context-view';
import { SharedInviteView } from './shared-invite-view';

export function ConnectionsExperience({
  id,
  inviteCode = '',
}: {
  id?: string;
  inviteCode?: string;
}) {
  const router = useRouter(),
    action = useSharedAction();
  const [ready, setReady] = useState(false),
    [enabled, setEnabled] = useState(false),
    [social, setSocial] = useState<Social | null>(null),
    [contexts, setContexts] = useState<Connection[]>([]),
    [invitations, setInvitations] = useState<{ id: string; title: string }[]>(
      [],
    ),
    [branchId, setBranchId] = useState(''),
    [title, setTitle] = useState(''),
    [consent, setConsent] = useState(false),
    [editProfile, setEditProfile] = useState(false);
  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const capabilities = await sharedApi<{ friendEnabled: boolean }>(
          '/shared-capabilities',
        );
        if (stopped) return;
        setEnabled(capabilities.friendEnabled);
        if (!capabilities.friendEnabled) return;
        const [s, c, i] = await Promise.all([
          sharedApi<Social>('/social-profile'),
          sharedApi<Connection[]>('/shared-contexts'),
          sharedApi<typeof invitations>('/shared-invites'),
        ]);
        if (!stopped) {
          setSocial(s);
          setContexts(c);
          setInvitations(i);
        }
      } catch (e) {
        if (!stopped) action.setNotice(clientErrorMessage(e));
      } finally {
        if (!stopped) setReady(true);
      }
    }
    void load();
    return () => {
      stopped = true;
    };
  }, []);
  if (!ready) return <section className="panel">Loading Connections…</section>;
  if (!enabled || !social)
    return (
      <section className="panel shared-fields">
        <h1>Connections</h1>
        <SharedNotice notice={action.notice} />
        <p>Connections are not available yet.</p>
        <a href="/lives">Return to my lives</a>
      </section>
    );
  if (id && id !== 'invite')
    return (
      <div className="connections">
        <SharedContextView key={id} id={id} />
      </div>
    );
  if (id === 'invite')
    return (
      <div className="connections">
        <a className="text-button" href="/connections">
          ← Connections
        </a>
        <SharedInviteView
          key={inviteCode}
          social={social}
          initialToken={inviteCode}
        />
      </div>
    );
  const slots = contexts.filter((c) =>
    ['inviting', 'active', 'paused'].includes(c.status),
  ).length;
  return (
    <div className="connections shared-fields">
      <section className="page-heading">
        <div className="eyebrow">Your private shared lives</div>
        <h1>Connections</h1>
        <p>
          Share common AI events while keeping your own story, choices and
          personal life private.
        </p>
      </section>
      <SharedNotice notice={action.notice} />
      <section className="panel shared-fields">
        <h2>Your access</h2>
        <p>
          {social.entitlement.tier.charAt(0).toUpperCase() +
            social.entitlement.tier.slice(1)}{' '}
          · {slots} of {social.entitlement.activeContexts} connection slots in
          use.
        </p>
        <button
          className="secondary"
          onClick={() => router.push('/connections/invite')}
        >
          Open an invitation
        </button>
        <button
          className="text-button"
          onClick={() => setEditProfile((v) => !v)}
        >
          {editProfile ? 'Close profile' : 'Edit connection profile'}
        </button>
      </section>
      {(!social.profile || editProfile) && (
        <SocialProfileForm
          social={social}
          saved={(s) => {
            setSocial(s);
            setEditProfile(false);
          }}
        />
      )}
      <section className="panel shared-fields">
        <h2>Your groups</h2>
        {!contexts.length && (
          <p>
            You have no connections yet. Create a group or preview a private
            invitation.
          </p>
        )}
        <div className="shared-cards">
          {contexts.map((c) => (
            <a className="shared-card" key={c.id} href={`/connections/${c.id}`}>
              <strong>{c.title}</strong>
              <span>
                {c.moderationHold ? 'Paused for review' : c.status} ·{' '}
                {c.simulation_at}
              </span>
              {c.membershipStatus === 'paused_entitlement' && (
                <small>Your membership is paused by your current plan.</small>
              )}
            </a>
          ))}
        </div>
      </section>
      {invitations.length > 0 && (
        <section className="panel shared-fields">
          <h2>Pending invitations</h2>
          <p>
            Use the private link or code from the inviter to preview and accept.
          </p>
          {invitations.map((i) => (
            <div key={i.id}>{i.title}</div>
          ))}
        </section>
      )}
      {social.entitlement.tier !== 'free' && social.profile && (
        <form
          className="panel shared-fields"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              const branch = await currentOwnBranch(branchId);
              const created = await action.post<{ contextId: string }>(
                '/shared-contexts',
                {
                  type: 'friend_group',
                  title,
                  branchId,
                  revision: branch.revision,
                  sharingAcknowledged: true,
                },
              );
              router.push(`/connections/${created.contextId}`);
            });
          }}
        >
          <h2>Create a friend group</h2>
          <p>
            Connect one of your own branches. Each friend chooses their own
            branch and consents before joining.
          </p>
          <label>
            Group name
            <input
              value={title}
              required
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <OwnBranchSelect
            value={branchId}
            onChange={setBranchId}
            disabled={action.busy}
          />
          <SharingConsent checked={consent} onChange={setConsent} />
          <button
            className="primary"
            disabled={
              action.busy ||
              !branchId ||
              !consent ||
              !title.trim() ||
              slots >= social.entitlement.activeContexts
            }
          >
            Create friend group
          </button>
        </form>
      )}
    </div>
  );
}
