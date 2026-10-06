import type { PublicationSnapshot } from '@future-flow/contracts';
import { PublicContentPreview } from './public-content-preview';
import { CheckpointDetails } from './fork-checkpoint-preview';
export function PublicationContent({
  snapshot,
  preview = false,
}: {
  snapshot: PublicationSnapshot;
  preview?: boolean;
}) {
  return (
    <>
      <p className="subtle">
        {preview ? 'Publication preview' : 'Community life'} · AI-generated
        {snapshot.story.origin.userEdited
          ? ', edited by its author'
          : ''} ·{' '}
        {snapshot.author.handle
          ? `By @${snapshot.author.handle}`
          : 'Anonymous author'}
      </p>
      <PublicContentPreview
        snapshot={snapshot.story}
        label={preview ? 'Private release preview' : 'Community life'}
      />
      <section className="panel" aria-label="Reviewed decision points">
        <h2>Decision points ({snapshot.checkpoints.length})</h2>
        <p>
          These are the reviewed starting states and choices. Starting your own
          life from them will be available later.
        </p>
        {snapshot.checkpoints.map((point, i) => (
          <details key={point.decision.key}>
            <summary>
              Decision point {i + 1}: {point.decision.prompt}
            </summary>
            <CheckpointDetails
              checkpoint={{
                ...point,
                schemaVersion: 'fork-checkpoint-1',
                requiresFullReview: true,
                readyForPublicFork: false,
              }}
            />
          </details>
        ))}
      </section>
    </>
  );
}
