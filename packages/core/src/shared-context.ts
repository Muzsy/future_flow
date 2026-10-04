import {
  sharedStateSchema,
  type SharedContextType,
  type SharedTier,
  type InteractionProfile,
  interactionProfileSchema,
} from '@future-flow/contracts';
import { DomainError } from './errors';

export const SHARED_MEMBER_LIMITS: Record<SharedContextType, number> = {
  friend_group: 10,
  romantic_relationship: 2,
  work_project: 10,
  hobby_group: 10,
  sports_team: 20,
};
export const SHARED_TIER_LIMITS: Record<
  SharedTier,
  { activeContexts: number; types: readonly SharedContextType[] }
> = {
  free: { activeContexts: 0, types: [] },
  explorer: { activeContexts: 1, types: ['friend_group'] },
  connected: {
    activeContexts: 3,
    types: [
      'friend_group',
      'romantic_relationship',
      'work_project',
      'hobby_group',
    ],
  },
  world: {
    activeContexts: 5,
    types: [
      'friend_group',
      'romantic_relationship',
      'work_project',
      'hobby_group',
      'sports_team',
    ],
  },
};
export function requireSharedEntitlement(
  tier: SharedTier,
  type: SharedContextType,
  usedSlots?: number,
) {
  const limits = SHARED_TIER_LIMITS[tier];
  if (!limits.types.includes(type))
    throw new DomainError(
      'SUBSCRIPTION_REQUIRED',
      'Shared context type requires a different plan.',
      403,
    );
  if (
    usedSlots !== undefined &&
    usedSlots >= Math.min(5, limits.activeContexts)
  )
    throw new DomainError(
      'SHARED_CONTEXT_LIMIT',
      'Shared context limit reached.',
      409,
    );
}
export function validateSharedState(raw: unknown, type?: SharedContextType) {
  const state = sharedStateSchema.parse(raw);
  if (type && state.type !== type)
    throw new DomainError(
      'SHARED_CONTEXT_TYPE_NOT_ALLOWED',
      'Context state type does not match.',
    );
  return state;
}
export function isSharedTimeCompatible(
  contextDate: string,
  branchDate: string,
): boolean {
  // Fail closed until the later impact pipeline can handle different days safely.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(contextDate) || contextDate !== branchDate)
    return false;
  const parsed = new Date(contextDate + 'T00:00:00.000Z');
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === contextDate
  );
}
export function requireSharedTime(contextDate: string, branchDate: string) {
  if (!isSharedTimeCompatible(contextDate, branchDate))
    throw new DomainError(
      'SHARED_TIME_MISMATCH',
      'Life branches have different simulation dates.',
      409,
    );
}
export function minimalInteractionProfile(
  displayName: string,
): InteractionProfile {
  return interactionProfileSchema.parse({
    displayName,
    ageBand: null,
    country: null,
    occupationLabel: null,
    sharedRole: null,
  });
}
