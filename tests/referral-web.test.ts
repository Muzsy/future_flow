import { TERMS_ACCEPTANCE_VERSION } from '@future-flow/contracts';
import { describe, expect, it } from 'vitest';
import {
  admissionFromError,
  consentBody,
  consentFailure,
} from '../apps/web/lib/admission';
import {
  isBillingStatus,
  referralCard,
  type BillingStatus,
} from '../apps/web/lib/billing';
import { messages } from '../apps/web/lib/i18n';
import {
  consentStatusPath,
  forgetInvite,
  inviteFromSearch,
  inviteLink,
  inviteTokenFrom,
  loginRedirectPath,
  rememberInvite,
  rememberedInvite,
} from '../apps/web/lib/referral-invite';

const TOKEN = 'aw1.' + 'A'.repeat(27) + 'b'.repeat(22);

const memoryStore = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
};

describe('subscriber invite, web side', () => {
  it('finds one well-formed token in a bare token, a link or surrounding text', () => {
    expect(inviteTokenFrom(TOKEN)).toBe(TOKEN);
    expect(inviteTokenFrom(`  ${TOKEN}\n`)).toBe(TOKEN);
    expect(inviteTokenFrom(inviteLink('https://alterward.com', TOKEN))).toBe(
      TOKEN,
    );
    expect(inviteTokenFrom(`Gyere: ${TOKEN} :)`)).toBe(TOKEN);
    expect(inviteFromSearch(`?returnTo=%2Flives&invite=${TOKEN}`)).toBe(TOKEN);
  });
  it('rejects anything that is not exactly one token shape', () => {
    for (const bad of [
      '',
      'aw1.short',
      TOKEN + 'x',
      'aw2.' + 'A'.repeat(49),
      'aw1.' + '!'.repeat(49),
      null,
      undefined,
      42,
      'x'.repeat(3000) + TOKEN,
    ])
      expect(inviteTokenFrom(bad)).toBeNull();
    expect(inviteFromSearch('?returnTo=%2Flives')).toBeNull();
  });
  it('keeps the invite in the confirmation address next to returnTo', () => {
    expect(loginRedirectPath(null, null)).toBe('/login');
    expect(loginRedirectPath('/lives', null)).toBe('/login?returnTo=%2Flives');
    expect(loginRedirectPath(null, TOKEN)).toBe(`/login?invite=${TOKEN}`);
    expect(loginRedirectPath('/lives', TOKEN)).toBe(
      `/login?returnTo=%2Flives&invite=${TOKEN}`,
    );
  });
  it('sends the token with the status read and the consent body only when held', () => {
    expect(consentStatusPath(null)).toBe('/me/consent');
    expect(consentStatusPath(TOKEN)).toBe(`/me/consent?invite=${TOKEN}`);
    expect(consentBody(null)).toEqual({
      adult: true,
      acknowledged: true,
      termsVersion: TERMS_ACCEPTANCE_VERSION,
    });
    expect(consentBody(TOKEN)).toEqual({
      adult: true,
      acknowledged: true,
      termsVersion: TERMS_ACCEPTANCE_VERSION,
      inviteToken: TOKEN,
    });
  });
  it('remembers, rereads and forgets the token, and never throws on broken storage', () => {
    const store = memoryStore();
    expect(rememberedInvite(store)).toBeNull();
    rememberInvite(TOKEN, store);
    expect(rememberedInvite(store)).toBe(TOKEN);
    // A tampered stored value is not trusted.
    store.setItem('alterward.invite', 'not-a-token');
    expect(rememberedInvite(store)).toBeNull();
    rememberInvite(TOKEN, store);
    forgetInvite(store);
    expect(rememberedInvite(store)).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => rememberInvite(TOKEN, broken)).not.toThrow();
    expect(rememberedInvite(broken)).toBeNull();
    expect(() => forgetInvite(broken)).not.toThrow();
    expect(rememberedInvite(null)).toBeNull();
  });
  it('shows a refused invitation on the full page, never as admission', () => {
    expect(admissionFromError('SERVICE_INVITE_INVALID', 'refused')).toEqual({
      kind: 'full',
      notice: 'refused',
    });
    expect(consentFailure('SERVICE_INVITE_INVALID', 'refused')).toEqual({
      kind: 'full',
      notice: 'refused',
    });
    expect(admissionFromError('SERVICE_ADMISSION_CLOSED', 'm')).toEqual({
      kind: 'full',
    });
  });
  it('decides the invite card from the API answer only', () => {
    const base: BillingStatus = {
      state: 'active',
      canGenerate: true,
      paidChaptersAvailable: 8,
      tasterChaptersAvailable: 0,
    };
    expect(referralCard(base)).toBeNull();
    expect(
      referralCard({
        ...base,
        referralInvite: { eligible: true, state: 'none' },
      }),
    ).toBe('create');
    expect(
      referralCard({
        ...base,
        referralInvite: { eligible: false, state: 'none' },
      }),
    ).toBeNull();
    expect(
      referralCard({
        ...base,
        referralInvite: { eligible: false, state: 'redeemed' },
      }),
    ).toBe('redeemed');
    expect(
      referralCard({
        ...base,
        referralInvite: { eligible: false, state: 'revoked' },
      }),
    ).toBe('revoked');
  });
  it('validates the new status fields and stays compatible with an answer without them', () => {
    const base = {
      state: 'active',
      canGenerate: true,
      paidChaptersAvailable: 8,
      tasterChaptersAvailable: 0,
    };
    expect(isBillingStatus(base)).toBe(true);
    expect(
      isBillingStatus({
        ...base,
        referralChaptersAvailable: 1,
        referralInvite: { eligible: true, state: 'none' },
      }),
    ).toBe(true);
    expect(isBillingStatus({ ...base, referralChaptersAvailable: '1' })).toBe(
      false,
    );
    expect(
      isBillingStatus({
        ...base,
        referralInvite: { eligible: 'yes', state: 'none' },
      }),
    ).toBe(false);
    expect(
      isBillingStatus({
        ...base,
        referralInvite: { eligible: true, state: 'weird' },
      }),
    ).toBe(false);
  });
  it('has every invite text in both languages without the retired taster wording', () => {
    const keys = Object.keys(messages.en).filter(
      (key) =>
        key.startsWith('referral.') || key.startsWith('admission.invite'),
    ) as (keyof typeof messages.en)[];
    expect(keys.length).toBeGreaterThanOrEqual(12);
    for (const key of keys) {
      expect(messages.en[key]).toBeTruthy();
      expect(messages.hu[key]).toBeTruthy();
      expect(messages.hu[key]).not.toMatch(/ízelítő/i);
      expect(messages.en[key]).not.toMatch(/taster/i);
    }
    expect(messages.hu['referral.chapters']).toContain('{n}');
    expect(messages.en['referral.chapters']).toContain('{n}');
  });
});
