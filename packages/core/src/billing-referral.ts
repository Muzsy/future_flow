import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { entitlementOfSubscriptions } from './billing-service';
import {
  REFERRAL_GRANT_KEY_PREFIX,
  type BillingSubscription,
  type ChapterGrant,
  type EntitlementConfig,
} from './billing';

// Subscriber referral (invite) domain. No schema of its own: the gift chapter
// is one ordinary, non-expiring row of the existing chapter-grant table with a
// deterministic key, so the "at most one per inviter" rule is the grant's
// primary key, and the invite link is a stateless signed token. Pure functions
// only (no I/O, no clock).

export const REFERRAL_GIFT_CHAPTERS = 1;
// The gift never expires at a cycle turn. A far-future end keeps it last in the
// "earliest expiry first" order, so the monthly allowance is always spent first.
export const REFERRAL_GRANT_EXPIRES_AT = '9999-01-01T00:00:00.000Z';
export const REFERRAL_INVITE_TTL_SECONDS = 30 * 24 * 60 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^aw1\.([A-Za-z0-9_-]{27})([A-Za-z0-9_-]{22})$/;
const SIGNATURE_BYTES = 16;

export function referralGrantKey(inviterUserId: string) {
  return REFERRAL_GRANT_KEY_PREFIX + inviterUserId.toLowerCase();
}

export function referralGrant(inviterUserId: string): ChapterGrant {
  return {
    key: referralGrantKey(inviterUserId),
    cycleIndex: 1,
    amount: REFERRAL_GIFT_CHAPTERS,
    expiresAt: REFERRAL_GRANT_EXPIRES_AT,
  };
}

// The signing key is derived (HKDF, fixed label) from a server-only secret that
// the API already holds whenever billing is enabled, so the feature adds no
// configuration. A secret that is missing or too short disables invites.
export function referralInviteKey(secret: string | undefined): Buffer | null {
  if (typeof secret !== 'string' || secret.length < 16) return null;
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(secret, 'utf8'),
      Buffer.alloc(0),
      Buffer.from('alterward-referral-invite-v1', 'utf8'),
      32,
    ),
  );
}

function sign(key: Buffer, payload: Buffer) {
  return createHmac('sha256', key)
    .update('alterward-referral-invite-v1')
    .update(payload)
    .digest()
    .subarray(0, SIGNATURE_BYTES);
}

// Token = aw1.<base64url(16-byte inviter id | 4-byte expiry seconds)><base64url(signature)>.
// It names the inviter only; it carries no email and nothing about the invitee.
export function signReferralInvite(
  key: Buffer,
  inviterUserId: string,
  now: Date,
  ttlSeconds = REFERRAL_INVITE_TTL_SECONDS,
): string {
  if (!UUID.test(inviterUserId)) throw Error('Invalid inviter id');
  const payload = Buffer.alloc(20);
  Buffer.from(inviterUserId.replaceAll('-', ''), 'hex').copy(payload, 0);
  payload.writeUInt32BE(Math.floor(now.getTime() / 1000) + ttlSeconds, 16);
  return (
    'aw1.' +
    payload.toString('base64url') +
    sign(key, payload).toString('base64url')
  );
}

// Never throws: anything that is not a well-formed, correctly signed, unexpired
// token is simply null (fail closed).
export function verifyReferralInvite(
  key: Buffer | null,
  token: unknown,
  now: Date,
): { inviterUserId: string } | null {
  if (!key || typeof token !== 'string' || token.length > 64) return null;
  const match = TOKEN.exec(token);
  if (!match) return null;
  const payload = Buffer.from(match[1]!, 'base64url');
  const signature = Buffer.from(match[2]!, 'base64url');
  // Canonical encoding only: spare trailing bits must not give a second valid
  // spelling of the same token.
  if (
    payload.length !== 20 ||
    signature.length !== SIGNATURE_BYTES ||
    payload.toString('base64url') !== match[1] ||
    signature.toString('base64url') !== match[2]
  )
    return null;
  const expected = sign(key, payload);
  if (!timingSafeEqual(signature, expected)) return null;
  if (payload.readUInt32BE(16) <= Math.floor(now.getTime() / 1000)) return null;
  const hex = payload.subarray(0, 16).toString('hex');
  return {
    inviterUserId: [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-'),
  };
}

// The subscription a referral grant attaches to: a paid, active, unrevoked and
// non-quarantined one. Null means the account may not invite (fail closed).
export function referralEligibleSubscription(
  subscriptions: readonly BillingSubscription[],
  now: Date,
  config: EntitlementConfig,
): BillingSubscription | null {
  if (!entitlementOfSubscriptions(subscriptions, now, config).canGenerate)
    return null;
  return (
    subscriptions.find(
      (s) =>
        s.revoked === null &&
        !s.reconcileRequired &&
        s.paidInvoiceIds.length >= 1 &&
        (s.status === 'active' || s.status === 'trialing'),
    ) ?? null
  );
}
