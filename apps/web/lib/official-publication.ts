import {
  officialPublicationPreviewSchema,
  officialPublicationOwnerViewSchema,
  type PublicContentView,
  type OfficialLifeSourceView,
  type PublicContentCurationView,
  type OfficialPublicationSnapshot,
  type OfficialPublicationOwnerView,
} from '@future-flow/contracts';
import { canonicalPublicContent, publicContentHash } from './public-content';
export function reviewedOfficialContent(snapshot: OfficialPublicationSnapshot) {
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
export function officialPublicationBinding(
  bundle: PublicContentView,
  curator: PublicContentCurationView,
  source: OfficialLifeSourceView,
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
  if (
    !source.grant?.usable ||
    source.grant.status !== 'active' ||
    source.bundleId !== bundle.bundleId ||
    source.contentHash !== bundle.contentHash
  )
    throw Error('Active exact Official source required');
  return {
    sourceVersion: source.sourceVersion,
    grantId: source.grant.id,
    evidenceHash: source.grant.evidenceHash,
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
export async function officialPublicationPreviewForBundle(
  raw: unknown,
  bundle: PublicContentView,
  curator: PublicContentCurationView,
  source: OfficialLifeSourceView,
) {
  const view = officialPublicationPreviewSchema.parse(raw);
  const { previewHash, ...value } = view;
  if (
    canonicalPublicContent(view.binding) !==
      canonicalPublicContent(
        officialPublicationBinding(bundle, curator, source),
      ) ||
    view.snapshotHash !== (await publicContentHash(view.snapshot)) ||
    previewHash !== (await publicContentHash(value)) ||
    bundle.contentHash !==
      (await publicContentHash(reviewedOfficialContent(view.snapshot))) ||
    view.settings.authorMode !== view.snapshot.author.mode
  )
    throw Error('Publication preview binding failed');
  return view;
}
export async function verifiedOwnedOfficialPublication(
  raw: unknown,
): Promise<OfficialPublicationOwnerView> {
  const view = officialPublicationOwnerViewSchema.parse(raw);
  if (
    view.snapshotHash !== (await publicContentHash(view.snapshot)) ||
    view.settings.authorMode !== view.snapshot.author.mode ||
    (view.unlistedToken !== null &&
      (view.status !== 'active' || view.settings.visibility !== 'unlisted'))
  )
    throw Error('Publication binding failed');
  return view;
}
export function officialPublicationLink(view: OfficialPublicationOwnerView) {
  if (view.status !== 'active') return null;
  return view.settings.visibility === 'public'
    ? `/official-lives/${view.slug}`
    : view.unlistedToken
      ? `/official-unlisted#${view.unlistedToken}`
      : null;
}
export function officialPublicationError(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error ? error.code : '';
  return code === 'OFFICIAL_PUBLICATION_DISABLED'
    ? 'Publication is currently disabled.'
    : code === 'OFFICIAL_PUBLICATION_HANDLE_REQUIRED'
      ? 'Set a public handle first, or choose Anonymous.'
      : code === 'OFFICIAL_PUBLICATION_PREVIEW_EXPIRED' ||
          code === 'PUBLIC_PREVIEW_EXPIRED'
        ? 'This preview expired. Prepare and review a fresh copy.'
        : 'The copy or publication status could not be verified. Reload before continuing.';
}
