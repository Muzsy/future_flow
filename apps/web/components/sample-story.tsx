import type { OfficialPublicationSnapshot } from '@future-flow/contracts';
import { ArrowUpRight } from 'lucide-react';

// Plan 053 A2/A3: the reader view of a published Official sample story. It
// shows the story as a reader meets it (chapters, the choice made at each
// fork, where the story pauses) and ends with the way to start one's own.
// Internal review vocabulary stays in the curator and preview screens.
type Story = OfficialPublicationSnapshot['story'];

const month = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

export function readingMinutes(story: Story) {
  const words = story.periods
    .map((p) => p.chapter.body.split(/\s+/).filter(Boolean).length)
    .reduce((a, b) => a + b, 0);
  return Math.max(1, Math.round(words / 230));
}

export function StartYourOwn({
  allowSignup,
  compact = false,
}: {
  allowSignup: boolean;
  compact?: boolean;
}) {
  const action = (
    <a className="primary" href={allowSignup ? '/signup' : '/login'}>
      {allowSignup ? 'Start your own story' : 'Sign in to start a story'}
      <ArrowUpRight size={16} aria-hidden="true" />
    </a>
  );
  if (compact)
    return (
      <aside className="sample-cta compact" aria-label="Start your own story">
        <p>
          Written by alterward from an ordinary starting point.{' '}
          {allowSignup
            ? 'Yours starts from your own, and your first chapter is free.'
            : 'Registration is currently limited.'}
        </p>
        {action}
      </aside>
    );
  return (
    <aside className="sample-cta panel" aria-label="Start your own story">
      <h2>What would your story be?</h2>
      <p>
        Start from your own situation, choose the direction, and decide at every
        turn.{' '}
        {allowSignup
          ? 'Your first chapter is free.'
          : 'Registration is currently limited; we open new places in waves.'}
      </p>
      {action}
      <p className="fineprint">
        These are works of fiction, not predictions or advice.
      </p>
    </aside>
  );
}

export function SampleStory({
  story,
  allowSignup,
}: {
  story: Story;
  allowSignup: boolean;
}) {
  return (
    <section lang="en" className="sample-story">
      <header className="sample-header">
        <div className="eyebrow">Sample story · AI-generated fiction</div>
        <h1>{story.title}</h1>
        <p className="intro">{story.summary}</p>
        <p className="subtle">
          {story.periods.length} chapters · about {readingMinutes(story)} min
          read
        </p>
      </header>
      <StartYourOwn allowSignup={allowSignup} compact />
      {story.periods.map((period, i) => {
        const chosen = period.decision.options.find(
          (o) => o.key === period.decision.selectedOptionKey,
        );
        const others = period.decision.options.filter((o) => o !== chosen);
        return (
          <article key={period.key} className="chapter panel">
            <div className="eyebrow">
              Chapter {i + 1} · {month(period.startDate)} –{' '}
              {month(period.endDate)}
            </div>
            <h2>{period.chapter.title}</h2>
            <div className="prose">
              {period.chapter.body.split(/\n\s*\n/).map((p, n) => (
                <p key={n}>{p}</p>
              ))}
            </div>
            <details>
              <summary>What happened in this chapter</summary>
              <ol className="life-timeline">
                {period.events.map((event) => (
                  <li key={event.key}>
                    <small>{day(event.effectiveAt)}</small>
                    <h3>{event.title}</h3>
                    <p>{event.summary}</p>
                  </li>
                ))}
              </ol>
            </details>
            {chosen ? (
              <div className="sample-decision">
                <h3>{period.decision.prompt}</h3>
                <p className="sample-choice">
                  <strong>Chosen: {chosen.label}.</strong> {chosen.description}
                </p>
                {others.length > 0 && (
                  <details>
                    <summary>The other options</summary>
                    <ul>
                      {others.map((o) => (
                        <li key={o.key}>
                          <strong>{o.label}.</strong> {o.description}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ) : (
              <div className="sample-decision open">
                <div className="eyebrow">Where the story pauses</div>
                <h3>{period.decision.prompt}</h3>
                <ul>
                  {period.decision.options.map((o) => (
                    <li key={o.key}>
                      <strong>{o.label}.</strong> {o.description}
                    </li>
                  ))}
                </ul>
                <p className="subtle">
                  In your own story, you make this choice and the next chapter
                  follows from it.
                </p>
              </div>
            )}
          </article>
        );
      })}
      <StartYourOwn allowSignup={allowSignup} />
    </section>
  );
}
