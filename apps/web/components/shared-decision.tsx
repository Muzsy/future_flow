'use client';
import { useState } from 'react';
import type { SharedEvent } from '../lib/shared-types';
export function SharedDecision({
  event,
  ownMemberId,
  busy,
  respond,
  resolve,
}: {
  event: SharedEvent;
  ownMemberId: string;
  busy: boolean;
  respond: (optionId: string) => void;
  resolve: () => void;
}) {
  const [optionId, setOptionId] = useState('');
  const d = event.decision;
  if (!d) return null;
  if (event.resolution)
    return (
      <div className="shared-result">
        <h3>
          {event.resolution.status === 'cancelled'
            ? 'Decision cancelled'
            : 'Decision closed'}
        </h3>
        <p>
          {event.resolution.status === 'resolved'
            ? `${event.resolution.participatingMemberIds.length} ${event.resolution.participatingMemberIds.length === 1 ? 'member' : 'members'} expressed interest. This does not confirm that the activity took place.`
            : 'No new personal participation has been recorded.'}
        </p>
      </div>
    );
  const expired =
    d.closesAt !== null && new Date(d.closesAt).getTime() <= Date.now();
  const eligible = d.eligibleMemberIds.includes(ownMemberId);
  return (
    <div className="decision shared-fields">
      <div className="eyebrow">Your shared decision</div>
      <h3>{d.prompt}</h3>
      <p className="subtle">
        {event.responseCount} of {d.eligibleMemberIds.length} responses
        received. Other members’ choices stay private until closure.
      </p>
      <p className="subtle">
        {d.closesAt
          ? `Response deadline: ${new Date(d.closesAt).toLocaleString('en-GB')}`
          : 'This decision waits for every eligible response.'}
      </p>
      {event.ownResponse ? (
        <p>
          Your response:{' '}
          <strong>
            {d.options.find((o) => o.id === event.ownResponse?.optionId)
              ?.label ?? 'Recorded'}
          </strong>
        </p>
      ) : eligible && !expired ? (
        <>
          <fieldset disabled={busy}>
            <legend>Choose for yourself</legend>
            {d.options.map((o) => (
              <label className="shared-choice" key={o.id}>
                <input
                  type="radio"
                  name={`decision-${event.id}`}
                  value={o.id}
                  checked={optionId === o.id}
                  onChange={() => setOptionId(o.id)}
                />
                <span>
                  <strong>{o.label}</strong>
                  <small>{o.description}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <button
            className="primary"
            disabled={busy || !optionId}
            onClick={() => respond(optionId)}
          >
            Submit my response
          </button>
        </>
      ) : (
        <p>
          {eligible
            ? 'The response deadline has passed.'
            : 'You are not a participant in this decision.'}
        </p>
      )}
      {expired && (
        <button className="secondary" disabled={busy} onClick={resolve}>
          Close with the recorded responses
        </button>
      )}
      <p className="subtle">
        You can keep continuing your personal life while this decision waits. A
        later result becomes background in your next continuation.
      </p>
    </div>
  );
}
