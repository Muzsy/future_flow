import { hash } from '@future-flow/core';
import {
  fictionV9Policy,
  fictionV10Policy,
  fictionV11Policy,
  fictionV12Policy,
  politicalFictionPolicy,
  isPoliticalStory,
  type StoryV1,
} from '@future-flow/contracts';

// The fiction policies a service job may carry. New story jobs select v12
// (plan 052); v10 and v11 story jobs queued before that release keep their
// frozen policy and still complete. A political story of catalogue 1.1.0
// (plan 049/07) carries exactly the public-life policy, and no other story
// may carry it.
export function serviceFictionPolicyAllowed(
  policy: unknown,
  story: StoryV1 | undefined | null,
): boolean {
  const allowed = !story
    ? [fictionV9Policy()]
    : isPoliticalStory(story)
      ? [politicalFictionPolicy()]
      : [fictionV12Policy(), fictionV11Policy(), fictionV10Policy()];
  return allowed.some((candidate) => hash(candidate) === hash(policy ?? null));
}
