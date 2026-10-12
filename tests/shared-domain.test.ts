import { describe, it, expect } from 'vitest';
import {
  interactionProfileSchema,
  sharedStateSchema,
  sharedCreateRequestSchema,
  sharedPolicySchema,
  sharedContextTypeSchema,
  sharedErrorMessages,
  errorMessage,
  LIFE_CONTRACT_VERSION,
  SHARED_CONTEXT_CONTRACT_VERSION,
} from '@future-flow/contracts';
import {
  isSharedTimeCompatible,
  requireSharedEntitlement,
  requireSharedSponsoredGuestEntitlement,
  SHARED_MEMBER_LIMITS,
  SHARED_TIER_LIMITS,
  SHARED_SPONSORED_GUEST_LIMITS,
  minimalInteractionProfile,
} from '@future-flow/core';
import { sharedFeaturesFromEnv } from '../apps/api/src/shared-context';

describe('Shared Context foundation domain', () => {
  it('keeps personal and shared versions separate and requires explicit sharing acknowledgement', () => {
    expect(LIFE_CONTRACT_VERSION).toBe('2.0.0');
    expect(SHARED_CONTEXT_CONTRACT_VERSION).toBe('1.0.0');
    expect(
      sharedCreateRequestSchema.safeParse({
        type: 'friend_group',
        title: 'Friends',
        branchId: '11111111-1111-4111-8111-111111111111',
        revision: 0,
      }).success,
    ).toBe(false);
  });
  it('has categorical shared state and rejects private or arbitrary fields', () => {
    expect(
      sharedStateSchema.safeParse({
        type: 'friend_group',
        summary: null,
        cohesion: 50,
        currentFocus: null,
      }).success,
    ).toBe(false);
    const profile = minimalInteractionProfile('Explicit alias');
    for (const forbidden of [
      'email',
      'finance',
      'goals',
      'memory',
      'otherContexts',
    ])
      expect(
        interactionProfileSchema.safeParse({
          ...profile,
          [forbidden]: 'private',
        }).success,
      ).toBe(false);
    expect(profile).toEqual({
      displayName: 'Explicit alias',
      ageBand: null,
      country: null,
      occupationLabel: null,
      sharedRole: null,
    });
    expect(
      sharedPolicySchema.safeParse({ type: 'majority', arbitraryScript: 'run' })
        .success,
    ).toBe(false);
  });
  it.each(sharedContextTypeSchema.options)(
    'enforces tier/type and the absolute/member cap for %s',
    (type) => {
      expect(() => requireSharedEntitlement('free', type, 0)).toThrow();
      expect(() => requireSharedEntitlement('world', type, 4)).not.toThrow();
      expect(() => requireSharedEntitlement('world', type, 5)).toThrow();
      if (type !== 'friend_group')
        expect(() => requireSharedEntitlement('explorer', type, 0)).toThrow();
      if (type === 'sports_team')
        expect(() => requireSharedEntitlement('connected', type, 0)).toThrow();
      expect(SHARED_MEMBER_LIMITS[type]).toBe(
        type === 'sports_team' ? 20 : type === 'romantic_relationship' ? 2 : 10,
      );
    },
  );
  it('keeps a single sponsored Friend guest slot separate from subscription slots', () => {
    expect(SHARED_SPONSORED_GUEST_LIMITS).toEqual({
      activeContexts: 1,
      types: ['friend_group'],
    });
    expect(() =>
      requireSharedSponsoredGuestEntitlement('friend_group', 0),
    ).not.toThrow();
    expect(() =>
      requireSharedSponsoredGuestEntitlement('friend_group', 1),
    ).toThrow();
    for (const type of sharedContextTypeSchema.options.filter(
      (type) => type !== 'friend_group',
    ))
      expect(() => requireSharedSponsoredGuestEntitlement(type, 0)).toThrow();
  });
  it('counts paused/inviting slots without allowing a higher subscription to bypass its cap', () => {
    for (const tier of ['explorer', 'connected', 'world'] as const)
      expect(() =>
        requireSharedEntitlement(
          tier,
          'friend_group',
          SHARED_TIER_LIMITS[tier].activeContexts,
        ),
      ).toThrow();
  });
  it('fails closed on time mismatch, invalid dates and same-month different days', () => {
    expect(isSharedTimeCompatible('2026-10-04', '2026-10-04')).toBe(true);
    for (const date of ['2026-10-05', '2026-09-04', '2026-11-04'])
      expect(isSharedTimeCompatible('2026-10-04', date)).toBe(false);
    expect(isSharedTimeCompatible('2026-02-30', '2026-02-30')).toBe(false);
    expect(isSharedTimeCompatible('invalid', 'invalid')).toBe(false);
  });
  it('defaults all feature flags off and rejects misspelled flag values', () => {
    expect(sharedFeaturesFromEnv({})).toMatchObject({
      enabled: false,
      friend: false,
      connected: false,
      world: false,
    });
    expect(() =>
      sharedFeaturesFromEnv({ SHARED_CONTEXTS_ENABLED: 'yes' }),
    ).toThrow();
  });
  it('has specific English messages for every shared code while keeping HU disabled', () => {
    for (const [code, pair] of Object.entries(sharedErrorMessages))
      expect(errorMessage('en', code)).toBe(pair[0]);
  });
});
