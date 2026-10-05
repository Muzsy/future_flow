'use client';
import { useEffect, useState } from 'react';
import type { ConnectionDetail, SharedEvent } from '../lib/shared-types';
import { clientErrorMessage } from '../lib/client';
import { sharedApi, SharedNotice, useSharedAction } from './shared-controls';
type Safety = {
  blockedMemberIds: string[];
  reports: { id: string; targetType: string; reason: string; status: string }[];
};
const reasons = [
  ['harassment', 'Harassment'],
  ['privacy', 'Personal information'],
  ['unsafe_content', 'Unsafe content'],
  ['spam', 'Spam'],
  ['other', 'Other'],
] as const;
export function SharedSafetyControls({
  detail,
  events,
  changed,
}: {
  detail: ConnectionDetail;
  events: SharedEvent[];
  changed: () => Promise<void>;
}) {
  const action = useSharedAction();
  const [safety, setSafety] = useState<Safety | null>(null),
    [block, setBlock] = useState<string | null>(null),
    [target, setTarget] = useState('context'),
    [reason, setReason] = useState('privacy'),
    [details, setDetails] = useState(''),
    [recorded, setRecorded] = useState(false);
  async function load() {
    setSafety(await sharedApi<Safety>(`/shared-contexts/${detail.id}/safety`));
  }
  useEffect(() => {
    let stopped = false;
    void sharedApi<Safety>(`/shared-contexts/${detail.id}/safety`)
      .then((s) => {
        if (!stopped) setSafety(s);
      })
      .catch((e) => {
        if (!stopped) action.setNotice(clientErrorMessage(e));
      });
    return () => {
      stopped = true;
    };
  }, [detail.id, detail.revision]);
  const other = detail.members.filter(
      (m) => m.id !== detail.ownMemberId && m.status !== 'deleted',
    ),
    selected = other.find((m) => m.id === block);
  return (
    <section className="panel shared-fields">
      <h2>Safety and privacy</h2>
      <SharedNotice notice={action.notice} />
      <p>
        Blocking stops new invitations and shared interactions with that person.
        Existing chapters and other members’ history stay intact. You can also
        leave this group and continue solo.
      </p>
      {safety &&
        other.map((m) => (
          <div className="shared-fields" key={m.id}>
            <span>{m.interactionProfile.displayName}</span>
            <button
              className="secondary"
              disabled={action.busy}
              onClick={() => {
                if (safety.blockedMemberIds.includes(m.id))
                  void action.run(async () => {
                    await action.post(`/shared-contexts/${detail.id}/unblock`, {
                      contextRevision: detail.revision,
                      memberId: m.id,
                    });
                    await changed();
                    await load();
                  });
                else setBlock(m.id);
              }}
            >
              {safety.blockedMemberIds.includes(m.id) ? 'Unblock' : 'Block'}{' '}
              {m.interactionProfile.displayName}
            </button>
          </div>
        ))}
      {selected && (
        <div className="notice shared-fields">
          <p>
            Block {selected.interactionProfile.displayName}? Pending shared
            decisions and generation involving both of you will be cancelled.
            This does not remove either person from the group.
          </p>
          <button
            className="primary"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await action.post(`/shared-contexts/${detail.id}/block`, {
                  contextRevision: detail.revision,
                  memberId: selected.id,
                });
                setBlock(null);
                await changed();
                await load();
              })
            }
          >
            Confirm block
          </button>
          <button
            className="text-button"
            disabled={action.busy}
            onClick={() => setBlock(null)}
          >
            Cancel
          </button>
        </div>
      )}
      <form
        className="shared-fields"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            const [targetType, targetId] = target.split(':');
            await action.post(`/shared-contexts/${detail.id}/reports`, {
              targetType,
              ...(targetId ? { targetId } : {}),
              reason,
              details,
            });
            setRecorded(true);
            setDetails('');
            await load();
          });
        }}
      >
        <h3>Report a concern</h3>
        <p>
          Reports go to the site’s moderation team. Other members cannot read
          your report. Reporting does not automatically restrict the group.
        </p>
        {recorded && (
          <p role="status">Your report has been recorded for review.</p>
        )}
        <label>
          Report about
          <select
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setRecorded(false);
            }}
          >
            <option value="context">This group</option>
            {other.map((m) => (
              <option key={m.id} value={`member:${m.id}`}>
                {m.interactionProfile.displayName}
              </option>
            ))}
            {events.map((e) => (
              <option key={e.id} value={`event:${e.id}`}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reason
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {reasons.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Describe the concern
          <textarea
            value={details}
            required
            maxLength={2000}
            onChange={(e) => setDetails(e.target.value)}
          />
        </label>
        <p className="subtle">
          Include only information needed to review this concern. Never include
          passwords or API keys.
        </p>
        <button className="secondary" disabled={action.busy || !details.trim()}>
          Send report
        </button>
      </form>
      {safety && safety.reports.length > 0 && (
        <div>
          <h3>Your reports</h3>
          {safety.reports.map((r) => (
            <p key={r.id}>
              {r.targetType} ·{' '}
              {reasons.find(([id]) => id === r.reason)?.[1] ?? r.reason} ·{' '}
              {r.status}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
export function InviteSafetyReport({ token }: { token: string }) {
  const action = useSharedAction(),
    [open, setOpen] = useState(false),
    [reason, setReason] = useState('spam'),
    [details, setDetails] = useState(''),
    [recorded, setRecorded] = useState(false);
  return (
    <div className="shared-fields">
      <button className="text-button" onClick={() => setOpen((v) => !v)}>
        Report this invitation
      </button>
      {open && (
        <form
          className="shared-fields"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await action.post('/shared-invites/reports', {
                token,
                reason,
                details,
              });
              setRecorded(true);
              setDetails('');
            });
          }}
        >
          <SharedNotice notice={action.notice} />
          <p>Your report is private and does not accept this invitation.</p>
          {recorded && (
            <p role="status">Your report has been recorded for review.</p>
          )}
          <label>
            Reason
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {reasons.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Describe the concern
            <textarea
              required
              maxLength={2000}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </label>
          <button
            className="secondary"
            disabled={action.busy || !token || !details.trim()}
          >
            Send invitation report
          </button>
        </form>
      )}
    </div>
  );
}
