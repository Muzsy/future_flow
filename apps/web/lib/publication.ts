import {
  publicationPreviewSchema,
  publicationOwnerViewSchema,
  type PublicContentView,
  type PublicContentCurationView,
  type PublicationSnapshot,
  type PublicationOwnerView,
} from '@future-flow/contracts';
import { canonicalPublicContent, publicContentHash } from './public-content';
export function reviewedContent(snapshot: PublicationSnapshot) {
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
export function publicationBinding(
  bundle: PublicContentView,
  curator: PublicContentCurationView,
) {
  if (
    curator.curation?.status !== 'content_reviewed' ||
    !curator.reviewId ||
    !curator.reviewHash ||
    curator.bundleId !== bundle.bundleId ||
    curator.contentHash !== bundle.contentHash ||
    curator.sourceRevision !== bundle.sourceRevision
  )
    throw Error('Complete curator binding required');
  return {
    bundleId: bundle.bundleId,
    contentHash: bundle.contentHash,
    sourceRevision: bundle.sourceRevision,
    reviewId: curator.reviewId,
    reviewHash: curator.reviewHash,
    policyVersion: curator.policyVersion,
    curationId: curator.curation.id,
    curationVersion: curator.curationVersion,
  };
}
export async function publicationPreviewForBundle(
  raw: unknown,
  bundle: PublicContentView,
  curator: PublicContentCurationView,
) {
  const view = publicationPreviewSchema.parse(raw);
  const { previewHash, ...value } = view;
  if (
    canonicalPublicContent(view.binding) !==
      canonicalPublicContent(publicationBinding(bundle, curator)) ||
    view.snapshotHash !== (await publicContentHash(view.snapshot)) ||
    previewHash !== (await publicContentHash(value)) ||
    bundle.contentHash !==
      (await publicContentHash(reviewedContent(view.snapshot))) ||
    view.settings.authorMode !== view.snapshot.author.mode
  )
    throw Error('Publication preview binding failed');
  return view;
}
export async function verifiedOwnedPublication(
  raw: unknown,
): Promise<PublicationOwnerView> {
  const view = publicationOwnerViewSchema.parse(raw);
  if (
    view.snapshotHash !== (await publicContentHash(view.snapshot)) ||
    view.settings.authorMode !== view.snapshot.author.mode ||
    (view.unlistedToken !== null &&
      (view.status !== 'active' || view.settings.visibility !== 'unlisted'))
  )
    throw Error('Publication binding failed');
  return view;
}
export function publicationLink(view: PublicationOwnerView) {
  if (view.status !== 'active') return null;
  return view.settings.visibility === 'public'
    ? `/lives/${view.slug}`
    : view.unlistedToken
      ? `/unlisted#${view.unlistedToken}`
      : null;
}
export function publicationError(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error ? error.code : '';
  return code === 'PUBLICATION_DISABLED'
    ? 'Publication is currently disabled.'
    : code === 'PUBLICATION_HANDLE_REQUIRED'
      ? 'Set a public handle first, or choose Anonymous.'
      : code === 'PUBLICATION_PREVIEW_EXPIRED' ||
          code === 'PUBLIC_PREVIEW_EXPIRED'
        ? 'This preview expired. Prepare and review a fresh copy.'
        : 'The copy or publication status could not be verified. Reload before continuing.';
}
