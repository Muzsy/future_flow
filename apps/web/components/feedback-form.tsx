'use client';
import { useId, useRef, useState, type FormEvent } from 'react';
import {
  betaFeedbackSchema,
  feedbackCategories,
  type BetaFeedback,
} from '@future-flow/contracts';
import { lifeApi, clientErrorMessage } from '../lib/client';
const categoryLabels = {
  experience: 'Overall experience',
  language: 'English wording',
  repetition: 'Repetitive story',
  consistency: 'A detail does not fit',
  decision: 'Choice or consequences',
  technical: 'Something is not working',
};
export function FeedbackForm({
  branchId = null,
  periodId = null,
  compact = false,
}: {
  branchId?: string | null;
  periodId?: string | null;
  compact?: boolean;
}) {
  const privacyId = useId();
  const [category, setCategory] =
      useState<BetaFeedback['category']>('experience'),
    [wouldContinue, setWouldContinue] =
      useState<BetaFeedback['wouldContinue']>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState('');
  const pending = useRef<{ signature: string; id: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const values = {
        branchId,
        periodId,
        category,
        wouldContinue,
        message: message.trim() || null,
      },
      signature = JSON.stringify(values);
    if (pending.current?.signature !== signature)
      pending.current = { signature, id: crypto.randomUUID() };
    const parsed = betaFeedbackSchema.safeParse({
      ...values,
      feedbackId: pending.current.id,
    });
    if (!parsed.success) {
      setError('Add a short note or tell us whether you would continue.');
      return;
    }
    setBusy(true);
    try {
      await lifeApi('/feedback', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setSent(true);
    } catch (error) {
      setError(clientErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const form = sent ? (
    <p role="status">Thank you. Your feedback has been saved for review.</p>
  ) : (
    <form onSubmit={(event) => void submit(event)} className="feedback-form">
      <p>
        Your feedback helps improve alterward. This is private feedback for the
        team.
      </p>
      <label className="field">
        <span>What would you like to tell us about?</span>
        <select
          value={category}
          onChange={(event) =>
            setCategory(event.target.value as BetaFeedback['category'])
          }
        >
          {feedbackCategories.map((value) => (
            <option key={value} value={value}>
              {categoryLabels[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Would you continue this life? (optional)</span>
        <select
          value={wouldContinue ?? ''}
          onChange={(event) =>
            setWouldContinue(
              (event.target.value || null) as BetaFeedback['wouldContinue'],
            )
          }
        >
          <option value="">Choose…</option>
          <option value="yes">Yes</option>
          <option value="maybe">Maybe</option>
          <option value="no">No</option>
        </select>
      </label>
      <label className="field">
        <span>Your note (optional)</span>
        <textarea
          maxLength={1200}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          aria-describedby={privacyId}
        />
      </label>
      <p id={privacyId} className="subtle">
        Describe the issue in your own words. Please leave out real names,
        contact details and sensitive information. We attach this feedback to
        your account{branchId ? ' and this life' : ''}; your full story and
        profile are not submitted. Feedback is included in your data export and
        removed when you delete your account.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? 'Sending…' : 'Send feedback'}
      </button>
    </form>
  );
  return compact ? (
    <details className="panel feedback-panel">
      <summary>Give feedback on this chapter</summary>
      {form}
    </details>
  ) : (
    <section className="panel narrow feedback-panel">
      <h1>Help shape alterward</h1>
      {form}
    </section>
  );
}
