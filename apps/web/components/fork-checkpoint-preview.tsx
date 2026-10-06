'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  forkCheckpointSchema,
  forkCheckpointViewSchema,
  type ForkCheckpoint,
  type PublicPreviewRecord,
} from '@future-flow/contracts';
import { lifeApi, ClientError, clientErrorMessage } from '../lib/client';
import {
  checkpointsForPreview,
  checkpointTextFields,
  editCheckpointText,
  checkpointStateFacts,
  predicateDescription,
  changeDescription,
  type CheckpointRecord,
} from '../lib/fork-preview';
import { forkPreviewMessages } from '../lib/fork-preview-messages';

export function ForkCheckpointPreview({
  preview,
}: {
  preview: PublicPreviewRecord;
}) {
  const m = forkPreviewMessages.en;
  const [data, setData] = useState<ReturnType<
      typeof checkpointsForPreview
    > | null>(null),
    [checkpoint, setCheckpoint] = useState<ForkCheckpoint | null>(null),
    [decisionKey, setDecisionKey] = useState(''),
    [version, setVersion] = useState('candidate'),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState(''),
    [acknowledged, setAcknowledged] = useState(false),
    [invalid, setInvalid] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null),
    request = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    void load(abort.signal);
    return () => abort.abort();
  }, [preview.draftId, preview.snapshotHash, preview.sourceRevision]);
  function select(
    next: NonNullable<typeof data>,
    key: string,
    recordId?: string,
  ) {
    const records = next.saved.filter(
        (record) => record.checkpoint.decision.key === key,
      ),
      record =
        recordId === 'candidate'
          ? undefined
          : recordId
            ? records.find((record) => record.checkpointId === recordId)
            : records.at(-1);
    setDecisionKey(key);
    setVersion(record?.checkpointId ?? 'candidate');
    setCheckpoint(
      record?.checkpoint ??
        next.candidates.find((candidate) => candidate.decisionKey === key)
          ?.checkpoint ??
        null,
    );
    setAcknowledged(false);
    setInvalid([]);
    setNotice('');
  }
  async function load(signal: AbortSignal) {
    setLoading(true);
    setBusy(true);
    setData(null);
    setCheckpoint(null);
    setNotice('');
    setAcknowledged(false);
    setInvalid([]);
    try {
      const [candidates, saved] = await Promise.all([
        lifeApi(
          `/public-previews/${preview.draftId}/fork-checkpoint-candidates`,
          { signal },
        ),
        lifeApi(`/public-previews/${preview.draftId}/fork-checkpoints`, {
          signal,
        }),
      ]);
      if (signal.aborted) return;
      const next = checkpointsForPreview(candidates, saved, preview);
      setData(next);
      select(next, next.candidates[0]!.decisionKey);
      request.current = null;
    } catch (error) {
      if (!signal.aborted)
        setNotice(
          error instanceof ClientError
            ? clientErrorMessage(error)
            : m.invalidResponse,
        );
    } finally {
      if (!signal.aborted) {
        setLoading(false);
        setBusy(false);
      }
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const signal = controller.current?.signal;
    if (!signal || busy || !checkpoint || !acknowledged || !data) return;
    const parsed = forkCheckpointSchema.safeParse(checkpoint);
    if (!parsed.success) {
      setInvalid(parsed.error.issues.map((issue) => issue.path.join('.')));
      setNotice(m.validation);
      return;
    }
    const payload = {
        snapshotHash: preview.snapshotHash,
        sourceRevision: preview.sourceRevision,
        checkpoint: parsed.data,
      },
      signature = JSON.stringify(payload);
    if (request.current?.signature !== signature)
      request.current = { signature, key: crypto.randomUUID() };
    setBusy(true);
    setNotice('');
    setInvalid([]);
    try {
      const raw = await lifeApi(
        `/public-previews/${preview.draftId}/fork-checkpoints`,
        {
          method: 'POST',
          signal,
          headers: { 'Idempotency-Key': request.current.key },
          body: JSON.stringify(payload),
        },
      );
      if (signal.aborted) return;
      const record = forkCheckpointViewSchema.parse(raw);
      checkpointsForPreview(data.candidates, [record], preview);
      if (JSON.stringify(record.checkpoint) !== JSON.stringify(parsed.data))
        throw new Error('Saved details changed');
      const next = {
        ...data,
        saved: [
          ...data.saved.filter(
            (saved) => saved.checkpointId !== record.checkpointId,
          ),
          record,
        ],
      };
      setData(next);
      select(next, record.checkpoint.decision.key, record.checkpointId);
      setNotice(m.saved);
    } catch (error) {
      if (!signal.aborted) {
        if (
          error instanceof ClientError &&
          [
            'LIFE_REVISION_CONFLICT',
            'PUBLIC_PREVIEW_EXPIRED',
            'PUBLIC_FORK_SOURCE',
            'ACCOUNT_DELETING',
            'AUTH_REQUIRED',
          ].includes(error.code)
        ) {
          setData(null);
          setCheckpoint(null);
        }
        setNotice(
          error instanceof ClientError
            ? clientErrorMessage(error)
            : m.invalidResponse,
        );
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  const candidate = data?.candidates.find(
      (candidate) => candidate.decisionKey === decisionKey,
    ),
    records =
      data?.saved.filter(
        (record) => record.checkpoint.decision.key === decisionKey,
      ) ?? [];
  return (
    <section className="panel fork-preview" lang="en" aria-label={m.heading}>
      <div className="eyebrow">{m.private}</div>
      <h2>{m.heading}</h2>
      <p>{m.intro}</p>
      <p className="notice">{m.fullReview}</p>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">{m.loading}</p>
      ) : (
        data && (
          <>
            <label className="field">
              <span>{m.decision}</span>
              <select
                value={decisionKey}
                disabled={busy}
                onChange={(event) => select(data, event.target.value)}
              >
                {preview.snapshot.periods.map((period, i) => (
                  <option key={period.decision.key} value={period.decision.key}>
                    Chapter {i + 1} · {period.decision.prompt}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{m.version}</span>
              <select
                value={version}
                disabled={busy}
                onChange={(event) =>
                  select(data, decisionKey, event.target.value)
                }
              >
                <option value="candidate">{m.candidate}</option>
                {records.map((record: CheckpointRecord, i) => (
                  <option key={record.checkpointId} value={record.checkpointId}>
                    {m.savedVersion} {i + 1}
                  </option>
                ))}
              </select>
            </label>
            {!checkpoint ? (
              <p>
                {m.unavailable}{' '}
                {candidate?.unavailableReason &&
                  m.unavailableReasons[candidate.unavailableReason]}
              </p>
            ) : (
              <>
                <h3>{m.startingState}</h3>
                <dl className="preview-facts">
                  {checkpointStateFacts(checkpoint).map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <h3>{m.goals}</h3>
                <ol>
                  {checkpoint.goals.map((goal) => (
                    <li key={goal.key}>
                      <p>
                        <strong>{goal.description}</strong> ·{' '}
                        {goal.category.replaceAll('_', ' ')} · {goal.priority} ·{' '}
                        {goal.horizonMonths} months · {goal.status}
                      </p>
                      <p>
                        Motivation: {goal.motivation ?? 'Not specified'};
                        progress note: {goal.note ?? 'None'}
                      </p>
                      <p>
                        Acceptable tradeoffs:{' '}
                        {goal.acceptableTradeoffs.join('; ') || 'None recorded'}
                        ; unacceptable tradeoffs:{' '}
                        {goal.unacceptableTradeoffs.join('; ') ||
                          'None recorded'}
                      </p>
                    </li>
                  ))}
                </ol>
                <h3>{m.constraints}</h3>
                {checkpoint.constraints.length ? (
                  <ol>
                    {checkpoint.constraints.map((constraint) => (
                      <li key={constraint.key}>
                        <p>
                          <strong>{constraint.description}</strong> ·{' '}
                          {constraint.strength === 'hard'
                            ? 'Required'
                            : 'Preference'}{' '}
                          ·{' '}
                          {constraint.scope === 'life'
                            ? 'Whole life'
                            : 'This branch'}
                        </p>
                        <p>
                          {predicateDescription(
                            constraint.predicate,
                            checkpoint,
                          )}
                        </p>
                        <p>
                          From {constraint.validFrom};{' '}
                          {constraint.validUntil
                            ? `ends before ${constraint.validUntil}`
                            : 'no fixed expiry'}
                          {constraint.endsOnDecisionKey
                            ? '; ends when this choice is made'
                            : ''}
                          .
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>{m.noConstraints}</p>
                )}
                <h3>{m.choices}</h3>
                <p>{checkpoint.decision.prompt}</p>
                <p className="subtle">{m.optionsHint}</p>
                <ol>
                  {checkpoint.decision.options.map((option) => (
                    <li className="preview-option" key={option.key}>
                      <strong>{option.label}</strong>
                      <p>{option.description}</p>
                      <h4>{m.conditions}</h4>
                      {option.preconditions.length ? (
                        <ul>
                          {option.preconditions.map((condition, i) => (
                            <li key={i}>
                              {predicateDescription(condition, checkpoint)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>{m.noConditions}</p>
                      )}
                      <h4>{m.consequences}</h4>
                      {option.changes.length ? (
                        <ul>
                          {option.changes.map((change, i) => (
                            <li key={i}>
                              {changeDescription(change, checkpoint)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>{m.noChanges}</p>
                      )}
                    </li>
                  ))}
                </ol>
                <form
                  className="preview-form"
                  onSubmit={(event) => void save(event)}
                >
                  <details>
                    <summary>{m.descriptions}</summary>
                    <p>{m.descriptionHint}</p>
                    {checkpointTextFields(checkpoint).map((field) => {
                      const id = `checkpoint-${field.path.join('-')}`,
                        bad = invalid.includes(field.path.join('.'));
                      return (
                        <label className="field" key={id}>
                          <span id={`${id}-label`}>{field.label}</span>
                          <textarea
                            id={id}
                            aria-labelledby={`${id}-label`}
                            rows={field.max > 500 ? 4 : 2}
                            maxLength={field.max}
                            value={field.value}
                            aria-invalid={bad}
                            disabled={busy}
                            onChange={(event) => {
                              setCheckpoint(
                                editCheckpointText(
                                  checkpoint,
                                  field.path,
                                  event.target.value,
                                ),
                              );
                              setAcknowledged(false);
                              setInvalid([]);
                              setNotice('');
                            }}
                          />
                          {bad && (
                            <small className="preview-field-error">
                              {m.validation}
                            </small>
                          )}
                        </label>
                      );
                    })}
                  </details>
                  <label className="shared-check">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      disabled={busy}
                      onChange={(event) =>
                        setAcknowledged(event.target.checked)
                      }
                    />
                    <span>{m.acknowledge}</span>
                  </label>
                  <p className="subtle">{m.saveHint}</p>
                  <button className="primary" disabled={busy || !acknowledged}>
                    {busy ? m.saving : m.save}
                  </button>
                </form>
              </>
            )}
          </>
        )
      )}
      <button
        className="secondary"
        disabled={busy}
        onClick={() => {
          if (controller.current) void load(controller.current.signal);
        }}
      >
        {m.reload}
      </button>
      <p className="subtle">{m.reloadHint}</p>
    </section>
  );
}
