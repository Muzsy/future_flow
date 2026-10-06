import {
  publicContentCurationViewSchema,
  type PublicContentView,
  type PublicContentReviewJobView,
} from '@future-flow/contracts';
import { publicContentHash } from './public-content';
import { contentReviewForBundle } from './public-content-review';

export async function contentCurationForBundle(
  raw: unknown,
  bundle: PublicContentView,
  rawReview: PublicContentReviewJobView,
) {
  const review = await contentReviewForBundle(rawReview, bundle),
    view = publicContentCurationViewSchema.parse(raw);
  const reviewHash = review.report
    ? await publicContentHash(review.report)
    : null;
  const eligible =
    review.job?.status === 'completed' &&
    review.report?.verdict === 'no_findings';
  if (
    view.bundleId !== bundle.bundleId ||
    view.draftId !== bundle.draftId ||
    view.snapshotHash !== bundle.snapshotHash ||
    view.sourceRevision !== bundle.sourceRevision ||
    view.contentHash !== bundle.contentHash ||
    view.reviewId !== (review.job?.id ?? null) ||
    view.reviewHash !== reviewHash ||
    view.eligible !== eligible ||
    (view.curation &&
      (!eligible ||
        ['pending', 'content_reviewed'].includes(view.curation.status) !==
          (view.curation.reasonCode === null)))
  )
    throw Error('Complete curator binding changed');
  return view;
}
