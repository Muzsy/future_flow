'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorMessage } from '@future-flow/contracts';
import { clientErrorMessage } from '../lib/client';
import type { ConnectionDetail, SharedEvent } from '../lib/shared-types';
import { SharedNotice, sharedApi, useSharedAction } from './shared-controls';
import { SharedDecision } from './shared-decision';
import { SharedSafetyControls } from './shared-safety';

export function SharedContextView({ id }: { id: string }) {
  const router = useRouter(),
    action = useSharedAction();
  const [detail, setDetail] = useState<ConnectionDetail | null>(null),
    [events, setEvents] = useState<SharedEvent[]>([]),
    [loading, setLoading] = useState(true),
    [invite, setInvite] = useState(''),
    [inviteId, setInviteId] = useState(''),
    [confirm, setConfirm] = useState<'leave' | 'end' | 'archive' | null>(null);
  const load = useCallback(
    async (live: () => boolean = () => true) => {
      const d = await sharedApi<ConnectionDetail>(`/shared-contexts/${id}`);
      const e = await sharedApi<SharedEvent[]>(`/shared-contexts/${id}/events`);
      if (live()) {
        setDetail(d);
        setEvents(e);
        setLoading(false);
      }
    },
    [id],
  );
  useEffect(() => {
    let stopped = false,
      running = false;
    async function refresh() {
      if (stopped || running || document.visibilityState !== 'visible') return;
      running = true;
      try {
        await load(() => !stopped);
      } catch (e) {
        if (!stopped) {
          action.setNotice(clientErrorMessage(e));
          setLoading(false);
        }
      } finally {
        running = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    const visible = () => void refresh();
    document.addEventListener('visibilitychange', visible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [load]);
  if (loading) return <div className="panel">Loading your connection…</div>;
  if (!detail)
    return (
      <div className="panel">
        <SharedNotice notice={action.notice} />
        <button
          className="secondary"
          onClick={() => router.push('/connections')}
        >
          Back to Connections
        </button>
      </div>
    );
  const own = detail.members.find((m) => m.id === detail.ownMemberId),
    live = ['inviting', 'active', 'paused'].includes(detail.status),
    generating =
      detail.generation &&
      ['queued', 'running'].includes(detail.generation.status),
    eligible = own?.status === 'active',
    pending = detail.pendingEventId !== null;
  async function mutate(path: string, body: unknown) {
    await action.post(path, body);
    await load();
  }
  return (
    <div className="shared-fields">
      <button
        className="text-button"
        onClick={() => router.push('/connections')}
      >
        ← Connections
      </button>
      <SharedNotice notice={action.notice} />
      <section className="panel shared-fields">
        <div className="eyebrow">
          Private friend group ·{' '}
          {detail.moderationHold ? 'Paused for review' : detail.status}
        </div>
        <h1>{detail.title}</h1>
        <p>Shared date: {detail.simulationAt}</p>
        {detail.moderationHold && (
          <p className="notice" role="status">
            This group is paused for a safety review. You can still read its
            history and continue your personal life.
          </p>
        )}
        <div className="shared-members">
          {detail.members.map((m) => (
            <span key={m.id} className="chip">
              {m.interactionProfile.displayName}
              {m.id === own?.id ? ' (you)' : ''} ·{' '}
              {m.status.replaceAll('_', ' ')}
            </span>
          ))}
        </div>
        {own?.branchId && (
          <a className="secondary" href={`/life/${own.branchId}`}>
            Continue my personal life
          </a>
        )}
        <p className="subtle">
          Common events stay in this group. Only your own relevant outcome
          becomes background in your next personal continuation.
        </p>
        {generating ? (
          <p role="status">Creating your shared AI event…</p>
        ) : (
          <button
            className="primary"
            disabled={
              action.busy ||
              detail.status !== 'active' ||
              !eligible ||
              pending ||
              detail.moderationHold
            }
            onClick={() =>
              void action.run(async () => {
                await mutate(`/shared-contexts/${id}/continue`, {
                  contextRevision: detail!.revision,
                });
              })
            }
          >
            Generate the next shared event
          </button>
        )}
        {detail.generation?.status === 'failed' && (
          <p role="alert">
            {errorMessage(
              'en',
              detail.generation.errorCode ?? 'REQUEST_FAILED',
            )}{' '}
            No automatic generation retry will run.
          </p>
        )}
        {pending && (
          <p className="subtle">
            A common decision is waiting below. Your personal story can still
            continue.
          </p>
        )}
        {live && eligible && own?.adminRole === 'owner' && (
          <>
            <button
              className="secondary"
              disabled={action.busy || pending || detail.moderationHold}
              onClick={() =>
                void action.run(async () => {
                  const result = await action.post<{
                    token: string;
                    inviteId: string;
                  }>(`/shared-contexts/${id}/invites`, {
                    contextRevision: detail!.revision,
                  });
                  const url = new URL(
                    '/connections/invite',
                    window.location.origin,
                  );
                  url.hash = new URLSearchParams({
                    invite: result.token,
                  }).toString();
                  setInvite(url.toString());
                  setInviteId(result.inviteId);
                  await load();
                })
              }
            >
              Create a private invitation link
            </button>
            {invite && (
              <div className="shared-fields">
                <label>
                  Invitation link
                  <input
                    value={invite}
                    readOnly
                    type="password"
                    autoComplete="off"
                  />
                </label>
                <button
                  className="secondary"
                  onClick={() =>
                    void action.run(async () => {
                      await navigator.clipboard.writeText(invite);
                    })
                  }
                >
                  Copy invitation link
                </button>
                <button
                  className="text-button"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      await action.post(
                        `/shared-contexts/${id}/invites/${inviteId}/revoke`,
                        { contextRevision: detail!.revision },
                      );
                      setInvite('');
                      setInviteId('');
                      await load();
                    })
                  }
                >
                  Revoke this invitation
                </button>
                <p className="subtle">
                  Share this link privately with someone you trust. It expires
                  in seven days. Revoking this invitation stops new accepts
                  through it.
                </p>
              </div>
            )}
          </>
        )}
      </section>
      <section className="panel shared-fields">
        <h2>Shared timeline</h2>
        {!events.length && (
          <p>
            {detail.status === 'inviting'
              ? 'Invite a friend. After they accept, you can generate your first common event.'
              : 'Your common AI events will appear here.'}
          </p>
        )}
        {[...events].reverse().map((event) => (
          <article className="shared-event" key={event.id}>
            <div className="eyebrow">{event.effectiveAt} · AI generated</div>
            <h3>{event.title}</h3>
            <p className="shared-prose">{event.summary}</p>
            {event.privacyRedacted && (
              <p className="subtle">
                Some original text is hidden for privacy. The common date and
                recorded result are kept.
              </p>
            )}
            <SharedDecision
              event={event}
              ownMemberId={detail.ownMemberId}
              busy={action.busy || !eligible || !live || detail.moderationHold}
              respond={(optionId) =>
                void action.run(() =>
                  mutate(`/shared-contexts/${id}/events/${event.id}/intents`, {
                    contextRevision: detail!.revision,
                    optionId,
                  }),
                )
              }
              resolve={() =>
                void action.run(() =>
                  mutate(`/shared-contexts/${id}/events/${event.id}/resolve`, {
                    contextRevision: detail!.revision,
                  }),
                )
              }
            />
          </article>
        ))}
      </section>
      <SharedSafetyControls detail={detail} events={events} changed={load} />
      <section className="panel shared-fields">
        <h2>Manage this connection</h2>
        <p>
          Leaving stops future shared effects on this branch. Your personal life
          and already learned memories remain.
        </p>
        <div className="shared-buttons">
          <button
            className="secondary"
            disabled={action.busy}
            onClick={() => setConfirm('leave')}
          >
            Leave and continue solo
          </button>
          {own?.adminRole === 'owner' && live && (
            <button
              className="secondary"
              disabled={action.busy}
              onClick={() => setConfirm('end')}
            >
              End group
            </button>
          )}
          {own?.adminRole === 'owner' && detail.status === 'ended' && (
            <button
              className="secondary"
              disabled={action.busy}
              onClick={() => setConfirm('archive')}
            >
              Archive group
            </button>
          )}
        </div>
        {confirm && (
          <div className="shared-result">
            <p>
              {confirm === 'leave'
                ? 'Leave this group? Pending shared effects are detached. Your private story is kept.'
                : confirm === 'end'
                  ? 'End this group for its members? Pending decisions, generation and invitations are cancelled.'
                  : 'Archive this ended group?'}
            </p>
            <div className="shared-buttons">
              <button
                className="primary"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await action.post(`/shared-contexts/${id}/${confirm}`, {
                      contextRevision: detail!.revision,
                    });
                    setInvite('');
                    router.push(
                      confirm === 'leave' && own?.branchId
                        ? `/life/${own.branchId}`
                        : '/connections',
                    );
                  })
                }
              >
                Confirm {confirm}
              </button>
              <button
                className="text-button"
                disabled={action.busy}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
