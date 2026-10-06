import {
  officialPublicationSnapshotSchema,
  OFFICIAL_PUBLICATION_VERSION,
  type PublicContent,
  type OfficialPublicationSnapshot,
} from '@future-flow/contracts';
import {
  releasePublicContent,
  validatePublicationSnapshot,
} from './publication';

// The caller must verify the trusted exact grant. No client-selected classification.
export function releaseOfficialPublicContent(
  content: PublicContent,
  handle: string | null,
) {
  const checked = releasePublicContent(content, handle);
  return officialPublicationSnapshotSchema.parse({
    ...checked,
    schemaVersion: OFFICIAL_PUBLICATION_VERSION,
    classification: 'official',
  });
}
export function validateOfficialPublicationSnapshot(raw: unknown) {
  const checked = officialPublicationSnapshotSchema.parse(raw);
  validatePublicationSnapshot({
    ...checked,
    schemaVersion: 'publication-1',
    classification: 'community',
  });
  return checked;
}
export function reviewedOfficialPublicationContent(
  snapshot: OfficialPublicationSnapshot,
) {
  return {
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
  };
}
