import { hash } from '@future-flow/core';
import {
  fictionV9Policy,
  fictionV10Policy,
  fictionV11Policy,
} from '@future-flow/contracts';

// The fiction policies a service job may carry. New story jobs select v11
// (plan 052); v10 story jobs queued before that release keep their frozen
// policy and still complete.
export function serviceFictionPolicyAllowed(
  policy: unknown,
  story: boolean,
): boolean {
  const allowed = story
    ? [fictionV11Policy(), fictionV10Policy()]
    : [fictionV9Policy()];
  return allowed.some((candidate) => hash(candidate) === hash(policy ?? null));
}
