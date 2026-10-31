import { createRequire } from 'node:module';
import type { createElement as createElementType } from 'react';
import type { renderToStaticMarkup as renderType } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { messages } from '../apps/web/lib/i18n';
import { en } from '../apps/web/lib/i18n/messages';
import { publicWebException } from '../packages/access/src';

// react is a dependency of the web app only, so resolve it from there.
const webRequire = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const { createElement } = webRequire('react') as {
  createElement: typeof createElementType;
};
const { renderToStaticMarkup } = webRequire('react-dom/server') as {
  renderToStaticMarkup: typeof renderType;
};

const legalKeys = Object.keys(en).filter((key) =>
  /^(terms|legal)\.|^privacy\.(operatorTitle|collect|purpose|processor|transfers|retention|rights|cookies|automated|betaAccess|activity|accountLink)/.test(
    key,
  ),
) as (keyof typeof en)[];

async function render(locale: 'en' | 'hu', page: 'terms' | 'privacy') {
  // Not hoisted: the module id must be resolved from the web app.
  vi.doMock(webRequire.resolve('next/navigation'), () => ({
    useRouter: () => ({ refresh: () => undefined }),
  }));
  const { LanguageProvider } =
    await import('../apps/web/components/language-provider');
  const { TermsOfUse } = await import('../apps/web/components/terms-of-use');
  const { PrivacyNotice } =
    await import('../apps/web/components/privacy-notice');
  return renderToStaticMarkup(
    createElement(
      LanguageProvider,
      { initialLocale: locale },
      createElement(page === 'terms' ? TermsOfUse : PrivacyNotice),
    ),
  );
}

describe('legal pages', () => {
  it('has a complete English and Hungarian catalog without unbalanced placeholders', () => {
    expect(legalKeys.length).toBeGreaterThan(60);
    for (const key of legalKeys)
      for (const locale of ['en', 'hu'] as const) {
        const text = messages[locale][key];
        expect(text.trim(), `${locale}:${key}`).not.toBe('');
        expect(text.split('[').length, `${locale}:${key}`).toBe(
          text.split(']').length,
        );
        expect(text, `${locale}:${key}`).not.toMatch(/\{\w+\}/);
      }
  });

  it('has no unresolved [bracket] placeholder or draft banner left, in both languages', () => {
    for (const locale of ['en', 'hu'] as const)
      for (const key of legalKeys)
        expect(messages[locale][key], `${locale}:${key}`).not.toMatch(/[[\]]/);
    expect(Object.keys(messages.en)).not.toContain('legal.draftNotice');
  });

  it('renders the terms page with every section and no draft banner', async () => {
    // Hungarian is stored but not enabled yet, so the page renders English.
    const html = await render('en', 'terms');
    expect(html).toContain('<h1>Terms of Use</h1>');
    expect(html).not.toContain('role="note"');
    expect(html.match(/<h2>/g)).toHaveLength(11);
    expect(html).toContain('Nagypeterd');
    expect(html).toContain('at least 18 years old');
    expect(html).toContain('href="/account-access"');
    expect(html).toContain('href="/privacy-notice"');
    expect(html).toContain('mailto:info@alterward.com');
    expect(html).not.toContain('{');
  });

  it('renders the privacy notice with processors, retention, rights and the existing smoke-test title', async () => {
    const html = await render('en', 'privacy');
    expect(html).toContain('Privacy and your data');
    for (const provider of [
      'OpenAI',
      'Supabase',
      'Cloudflare',
      'SMTP2GO',
      'Contabo',
    ])
      expect(html).toContain(provider);
    expect(html).toContain('7 days');
    expect(html).toContain('withdraw it at any time');
    expect(html).toContain('href="/account-access"');
    expect(html).toContain('href="/terms"');
    expect(html).not.toContain('legal-placeholder');
    expect(messages.hu['privacy.rights2']).toContain('visszavonhatod');
  });

  it('does not put personal data or secrets in the legal text', () => {
    const text = legalKeys.map((key) => en[key]).join('\n');
    expect(text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)).toEqual([
      'info@alterward.com',
    ]);
    expect(text).not.toMatch(/sk-|eyJ|api[_-]?key|password\s*[:=]/i);
  });

  it('exposes /terms next to /privacy-notice through the closed-site exception', () => {
    expect(publicWebException('GET', '/terms')).toBe(true);
    expect(publicWebException('GET', '/privacy-notice')).toBe(true);
  });
});
