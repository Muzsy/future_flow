import {
  publicationSnapshotSchema,
  PUBLICATION_VERSION,
  type PublicContent,
  type PublicationSnapshot,
} from '@future-flow/contracts';
import { validatePublicContent } from './public-content';

export function releasePublicContent(
  raw: PublicContent,
  handle: string | null,
): PublicationSnapshot {
  const content = validatePublicContent(raw);
  const { classification: _classification, ...origin } =
    content.snapshot.origin;
  return publicationSnapshotSchema.parse({
    schemaVersion: PUBLICATION_VERSION,
    contentLocale: 'en',
    classification: 'community',
    author: { mode: handle === null ? 'anonymous' : 'handle', handle },
    story: { ...content.snapshot, origin },
    checkpoints: content.checkpoints.map(
      ({
        schemaVersion: _version,
        requiresFullReview: _review,
        readyForPublicFork: _fork,
        ...facts
      }) => facts,
    ),
    forkEnabled: false,
  });
}
// Restoring preparation metadata verifies exactly the same reviewed prose/facts.
export function validatePublicationSnapshot(raw: unknown): PublicationSnapshot {
  const snapshot = publicationSnapshotSchema.parse(raw);
  validatePublicContent({
    schemaVersion: 'public-content-1',
    contentLocale: 'en',
    publicationApproved: false,
    snapshot: {
      ...snapshot.story,
      origin: { ...snapshot.story.origin, classification: 'unreviewed' },
    },
    checkpoints: snapshot.checkpoints.map((facts) => ({
      ...facts,
      schemaVersion: 'fork-checkpoint-1',
      requiresFullReview: true,
      readyForPublicFork: false,
    })),
  });
  return snapshot;
}
