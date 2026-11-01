import { describe, expect, it } from 'vitest';
import {
  evaluateServiceAccess,
  parseServiceAccessPolicy,
  type ServiceAction,
} from '@future-flow/core';

const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const policy = Object.freeze({
  version: 1,
  revision: 1,
  mode: 'invitation',
  generationEnabled: true,
  checkoutEnabled: true,
});
const active = Object.freeze({
  status: 'found',
  admission: Object.freeze({ userId: user, revision: 1, state: 'active' }),
});
const absent = { status: 'not-found' };
const actions: ServiceAction[] = ['read', 'generate', 'checkout'];
const decide = (
  p: unknown,
  lookup: unknown,
  action: ServiceAction = 'generate',
  id: unknown = user,
) => evaluateServiceAccess(p, id, lookup, action);

describe('service admission independent of billing and cohort size', () => {
  it.each(actions)('admits a verified invited account for %s', (action) => {
    expect(decide(policy, active, action)).toEqual({ allowed: true });
    expect(decide(policy, absent, action)).toMatchObject({
      allowed: false,
      status: 403,
    });
  });
  it.each(actions)(
    'keeps explicit revocation effective in open mode for %s',
    (action) => {
      const open = { ...policy, mode: 'open' };
      expect(decide(open, absent, action)).toEqual({ allowed: true });
      expect(
        decide(
          open,
          {
            status: 'found',
            admission: { ...active.admission, state: 'revoked' },
          },
          action,
        ),
      ).toMatchObject({ allowed: false, code: 'SERVICE_INVITATION_REQUIRED' });
      expect(decide(open, { status: 'unavailable' }, action)).toMatchObject({
        allowed: false,
        status: 503,
      });
    },
  );
  it('does not treat a lookup failure, stale identity or malformed state as a missing invitation', () => {
    for (const lookup of [
      undefined,
      null,
      {},
      [],
      { status: 'not-found', admission: active.admission },
      { status: 'found' },
      { status: 'found', admission: { ...active.admission, userId: other } },
      {
        status: 'found',
        admission: { ...active.admission, state: ['active'] },
      },
      { status: 'found', admission: { ...active.admission, revision: 0 } },
      { status: 'found', admission: { ...active.admission, coupon: true } },
    ]) {
      expect(decide({ ...policy, mode: 'open' }, lookup)).toMatchObject({
        allowed: false,
        status: 503,
      });
    }
  });
  it('never uses client metadata, a coupon or a beta exemption as admission', () => {
    expect(
      decide(policy, { status: 'not-found', user_metadata: { invited: true } }),
    ).toMatchObject({ allowed: false, status: 503 });
    expect(
      decide(policy, { status: 'not-found', coupon: true, closedBeta: true }),
    ).toMatchObject({ allowed: false, status: 503 });
    expect(decide({ ...policy, cohort: 'next-ten' }, active)).toMatchObject({
      allowed: false,
      status: 503,
    });
  });
  it('separates generation pause from reading, checkout and data rights', () => {
    const paused = { ...policy, generationEnabled: false };
    expect(decide(paused, active)).toEqual({
      allowed: false,
      code: 'SERVICE_GENERATION_PAUSED',
      status: 503,
    });
    expect(decide(paused, active, 'read')).toEqual({ allowed: true });
    expect(decide(paused, active, 'checkout')).toEqual({ allowed: true });
    expect(decide(paused, active, 'account-control')).toEqual({
      allowed: true,
    });
    const noCheckout = { ...policy, checkoutEnabled: false };
    expect(decide(noCheckout, active, 'checkout')).toEqual({
      allowed: false,
      code: 'SERVICE_CHECKOUT_PAUSED',
      status: 503,
    });
    expect(decide(noCheckout, active)).toEqual({ allowed: true });
  });
  it('keeps authenticated data rights independent of unavailable or revoked admission', () => {
    for (const p of [
      undefined,
      { ...policy, generationEnabled: false, checkoutEnabled: false },
    ])
      for (const lookup of [
        { status: 'unavailable' },
        absent,
        {
          status: 'found',
          admission: { ...active.admission, state: 'revoked' },
        },
      ])
        expect(decide(p, lookup, 'account-control')).toEqual({ allowed: true });
    for (const id of [undefined, '', 'forged', {}, { id: user }, user + '\n'])
      expect(
        evaluateServiceAccess(policy, id, active, 'account-control'),
      ).toEqual({
        allowed: false,
        code: 'AUTH_REQUIRED',
        status: 401,
      });
  });
  it('rejects malformed or widening policy snapshots without coercion', () => {
    for (const p of [
      undefined,
      null,
      [],
      {},
      { ...policy, version: 2 },
      { ...policy, revision: 0 },
      { ...policy, revision: 1.5 },
      { ...policy, revision: Number.MAX_SAFE_INTEGER + 1 },
      { ...policy, mode: ['open'] },
      { ...policy, mode: 'public' },
      { ...policy, generationEnabled: 'false' },
      { ...policy, checkoutEnabled: 1 },
      { ...policy, budgetReset: true },
    ]) {
      expect(parseServiceAccessPolicy(p)).toBeNull();
      for (const action of actions)
        expect(decide(p, active, action)).toMatchObject({
          allowed: false,
          status: 503,
        });
    }
  });
  it('normalizes verified account ids, snapshots configuration and mutates no input', () => {
    const id = 'aabbccdd-aabb-4abc-8abc-aabbccddeeff';
    const p: Record<string, unknown> = { ...policy };
    const snapshot = parseServiceAccessPolicy(p)!;
    p.mode = 'open';
    expect(snapshot.mode).toBe('invitation');
    expect(Object.isFrozen(snapshot)).toBe(true);
    const lookup = {
      status: 'found',
      admission: { userId: id.toUpperCase(), revision: 5, state: 'active' },
    };
    const before = JSON.stringify(lookup);
    expect(decide(snapshot, lookup, 'generate', id)).toEqual({ allowed: true });
    expect(JSON.stringify(lookup)).toBe(before);
    expect(decide(policy, active, 'unknown' as ServiceAction)).toMatchObject({
      allowed: false,
      status: 503,
    });
  });
});
