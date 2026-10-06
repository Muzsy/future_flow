import type { PublicSnapshotDraft } from '@future-flow/contracts';
import { publicPreviewMessages } from '../lib/public-preview-messages';

export function PublicContentPreview({
  snapshot,
}: {
  snapshot: Omit<PublicSnapshotDraft, 'snapshotKey'>;
}) {
  const m = publicPreviewMessages.en;
  return (
    <section
      lang="en"
      aria-label={m.content}
      className="public-content-preview"
    >
      <article className="panel">
        <div className="eyebrow">{m.private}</div>
        <h2>{snapshot.title}</h2>
        <p>{snapshot.summary}</p>
        <dl className="preview-facts">
          <div>
            <dt>{m.category}</dt>
            <dd>{m.categories[snapshot.category]}</dd>
          </div>
          <div>
            <dt>{m.goal}</dt>
            <dd>{snapshot.goal.description}</dd>
          </div>
          <div>
            <dt>{m.age}</dt>
            <dd>{snapshot.profile.ageBand.replace('_', '–')}</dd>
          </div>
          <div>
            <dt>{m.country}</dt>
            <dd>{snapshot.profile.country ?? m.unknown}</dd>
          </div>
          <div>
            <dt>{m.work}</dt>
            <dd>
              {snapshot.profile.employmentStatus?.replaceAll('_', ' ') ??
                m.unknown}
            </dd>
          </div>
          <div>
            <dt>{m.dates}</dt>
            <dd>{snapshot.startingPoint.effectiveAt}</dd>
          </div>
          <div>
            <dt>{m.labels}</dt>
            <dd>
              {m.aiGenerated} ·{' '}
              {snapshot.origin.userEdited ? m.edited : m.unchanged}
            </dd>
          </div>
        </dl>
        <p className="subtle">{m.noFork}</p>
      </article>
      {snapshot.periods.map((period, i) => (
        <article key={period.key} className="chapter panel">
          <div className="eyebrow">
            Chapter {i + 1} · {period.startDate} — {period.endDate}
          </div>
          <h2>{period.chapter.title}</h2>
          <div className="prose">
            {period.chapter.body.split(/\n\s*\n/).map((p, n) => (
              <p key={n}>{p}</p>
            ))}
          </div>
          <details>
            <summary>Timeline</summary>
            <ol className="life-timeline">
              {period.events.map((event) => (
                <li key={event.key}>
                  <small>{event.effectiveAt}</small>
                  <h3>{event.title}</h3>
                  <p>{event.summary}</p>
                </li>
              ))}
            </ol>
          </details>
          <h3>{period.decision.prompt}</h3>
          <ol>
            {period.decision.options.map((option) => (
              <li key={option.key} className="preview-option">
                <strong>{option.label}</strong>
                <p>{option.description}</p>
                {option.key === period.decision.selectedOptionKey && (
                  <small>{m.chosen}</small>
                )}
              </li>
            ))}
          </ol>
          {!period.decision.selectedOptionKey && (
            <p className="subtle">{m.openDecision}</p>
          )}
        </article>
      ))}
    </section>
  );
}
