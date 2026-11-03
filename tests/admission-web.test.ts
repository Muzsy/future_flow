import { createRequire } from 'node:module';
import type { createElement as createElementType } from 'react';
import type { renderToStaticMarkup as renderType } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  CONSENT_BODY,
  admissionFromError,
  admissionFromStatus,
  admissionGated,
  canSubmitConsent,
  consentFailure,
  showsContent,
  type AdmissionState,
} from '../apps/web/lib/admission';
import { messages } from '../apps/web/lib/i18n';

const webRequire = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const { createElement } = webRequire('react') as {
  createElement: typeof createElementType;
};
const { renderToStaticMarkup } = webRequire('react-dom/server') as {
  renderToStaticMarkup: typeof renderType;
};

const status = (acknowledged: unknown, extra = {}) => ({
  schemaVersion: 'privacy-consent-status-1',
  acknowledged,
  policyVersion: 'alpha-privacy-v1',
  ...extra,
});

describe('web side of bounded open admission: state mapping', () => {
  it('routes an unacknowledged account to the consent step and an acknowledged one on', () => {
    expect(admissionFromStatus(status(false), 'x')).toEqual({
      kind: 'consent',
    });
    expect(admissionFromStatus(status(true), 'x')).toEqual({
      kind: 'admitted',
    });
  });
  it('fails closed on a status it cannot read', () => {
    for (const body of [
      null,
      undefined,
      'ok',
      [],
      {},
      status('true'),
      status(1),
      { acknowledged: true },
      { ...status(true), schemaVersion: 'other' },
    ])
      expect(admissionFromStatus(body, 'unreadable')).toEqual({
        kind: 'error',
        message: 'unreadable',
      });
  });
  it('shows the full page on capacity-full, the consent step when admission is missing, and the error otherwise', () => {
    expect(admissionFromError('SERVICE_ADMISSION_CLOSED', 'm')).toEqual({
      kind: 'full',
    });
    expect(admissionFromError('SERVICE_ADMISSION_REQUIRED', 'm')).toEqual({
      kind: 'consent',
    });
    for (const code of [
      'SERVICE_ACCESS_UNAVAILABLE',
      'SERVICE_INVITATION_REQUIRED',
      'SERVICE_IDENTITY_MISMATCH',
      'AUTH_REQUIRED',
      null,
    ])
      expect(admissionFromError(code, 'm')).toEqual({
        kind: 'error',
        message: 'm',
      });
  });
  it('renders the generation UI only for an admitted account', () => {
    const states: AdmissionState[] = [
      { kind: 'checking' },
      { kind: 'consent' },
      { kind: 'full' },
      { kind: 'error', message: 'm' },
    ];
    for (const state of states) expect(showsContent(state)).toBe(false);
    expect(showsContent({ kind: 'admitted' })).toBe(true);
  });
  it('gates the generation and personal-data pages but not account control or the public privacy page', () => {
    for (const page of [
      'lives',
      'start',
      'life',
      'onboarding',
      'futures',
      'job',
      'branch',
      'connections',
    ])
      expect(admissionGated(page)).toBe(true);
    for (const page of ['settings', 'privacy', 'home', 'login', 'billing'])
      expect(admissionGated(page)).toBe(false);
  });
  it('submits only the two literals the API requires, and only when both are ticked and idle', () => {
    expect(CONSENT_BODY).toEqual({ adult: true, acknowledged: true });
    expect(canSubmitConsent(true, true, false)).toBe(true);
    expect(canSubmitConsent(true, false, false)).toBe(false);
    expect(canSubmitConsent(false, true, false)).toBe(false);
    expect(canSubmitConsent(true, true, true)).toBe(false);
  });
  it('replaces the form with the full page when capacity ran out during the submit, otherwise keeps the form', () => {
    expect(consentFailure('SERVICE_ADMISSION_CLOSED', 'm')).toEqual({
      kind: 'full',
    });
    expect(consentFailure('SERVICE_ACCESS_UNAVAILABLE', 'm')).toEqual({
      kind: 'notice',
      message: 'm',
    });
    expect(consentFailure(null, 'm')).toEqual({ kind: 'notice', message: 'm' });
  });
});

describe('web side of bounded open admission: texts and screens', () => {
  const keys = Object.keys(messages.en).filter((key) =>
    key.startsWith('admission.'),
  );
  it('has every admission text in both languages', () => {
    expect(keys.length).toBeGreaterThan(10);
    for (const key of keys) {
      expect(messages.en[key as keyof typeof messages.en]).toBeTruthy();
      expect(messages.hu[key as keyof typeof messages.hu]).toBeTruthy();
    }
    expect(messages.hu['admission.fullTitle']).toContain(
      'megtelt, később nyitunk',
    );
  });
  it('promises no waiting list and collects nothing on the full page', () => {
    for (const locale of ['en', 'hu'] as const) {
      const body = messages[locale]['admission.fullBody'];
      expect(body).toMatch(/waiting list|Várólista/);
      expect(body).not.toMatch(/e-?mail|address|cím/i);
    }
  });
  async function render(state: AdmissionState) {
    vi.doMock(webRequire.resolve('next/navigation'), () => ({
      useRouter: () => ({ refresh: () => undefined }),
    }));
    const { LanguageProvider } =
      await import('../apps/web/components/language-provider');
    const { AdmissionPanel } =
      await import('../apps/web/components/admission-gate');
    const html = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        { initialLocale: 'en' },
        createElement(AdmissionPanel, {
          admission: {
            state,
            admitted: () => undefined,
            full: () => undefined,
            recheck: () => undefined,
          },
          onSignOut: () => undefined,
        }),
      ),
    );
    vi.doUnmock(webRequire.resolve('next/navigation'));
    return html;
  }
  it('renders the consent step with both statements, links to the unchanged legal pages and a disabled button', async () => {
    const html = await render({ kind: 'consent' });
    expect(html).toContain('data-admission="consent"');
    expect(html).toContain(messages.en['admission.adult']);
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy-notice"');
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>[^<]*Accept and continue/,
    );
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
  });
  it('renders the full page without any form, input or waiting-list control', async () => {
    const html = await render({ kind: 'full' });
    expect(html).toContain('data-admission="full"');
    expect(html).toContain(messages.en['admission.fullTitle']);
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<form');
  });
  it('renders the loading and error screens, never the consent form', async () => {
    const loading = await render({ kind: 'checking' });
    expect(loading).toContain(messages.en['admission.checking']);
    expect(loading).not.toContain('type="checkbox"');
    const error = await render({ kind: 'error', message: 'Not reachable' });
    expect(error).toContain('data-admission="error"');
    expect(error).toContain('Not reachable');
    expect(error).not.toContain('type="checkbox"');
  });
});
