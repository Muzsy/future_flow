import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { createElement as createElementType } from 'react';
import type { renderToStaticMarkup as renderType } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { cameFromSitePage, markSitePage } from '../apps/web/lib/site-history';

const webRequire = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const { createElement } = webRequire('react') as {
  createElement: typeof createElementType;
};
const { renderToStaticMarkup } = webRequire('react-dom/server') as {
  renderToStaticMarkup: typeof renderType;
};

function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe('site history for the Back button', () => {
  it('goes back only to another page of this site in the same tab', () => {
    const storage = memory();
    // A direct link or a new tab: nothing to go back to.
    markSitePage('/billing', storage);
    expect(cameFromSitePage('/billing', storage)).toBe(false);
    // From the stories list to the terms: back is allowed.
    markSitePage('/lives', storage);
    markSitePage('/terms', storage);
    expect(cameFromSitePage('/terms', storage)).toBe(true);
    // Repeating the same page (a re-render or reload) changes nothing.
    markSitePage('/terms', storage);
    expect(cameFromSitePage('/terms', storage)).toBe(true);
    // A different current page never claims the previous one.
    expect(cameFromSitePage('/billing', storage)).toBe(false);
  });

  it('ignores non-paths and survives a missing or failing storage', () => {
    const storage = memory();
    markSitePage('https://example.com/x', storage);
    expect(storage.getItem('aw:page')).toBeNull();
    expect(cameFromSitePage('/terms', null)).toBe(false);
    const failing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(() => markSitePage('/terms', failing)).not.toThrow();
    expect(cameFromSitePage('/terms', failing)).toBe(false);
  });
});

describe('shared site header', () => {
  async function render(locale: 'en' | 'hu') {
    vi.doMock(webRequire.resolve('next/navigation'), () => ({
      useRouter: () => ({ refresh: () => undefined }),
    }));
    const { LanguageProvider } =
      await import('../apps/web/components/language-provider');
    const { SiteHeader, BackLink } =
      await import('../apps/web/components/site-header');
    return renderToStaticMarkup(
      createElement(
        LanguageProvider,
        { initialLocale: locale },
        createElement(SiteHeader, { current: 'billing' }),
        createElement(BackLink),
      ),
    );
  }

  it('signed out: language choice, privacy and sign-in, plus a Back button', async () => {
    const html = await render('en');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/login"');
    expect(html).toContain('Back');
    vi.doUnmock(webRequire.resolve('next/navigation'));
  });

  it('every former headerless page renders the shared header and a Back button', () => {
    const root = new URL('../apps/web/app/', import.meta.url);
    for (const page of [
      'billing/page.tsx',
      'terms/page.tsx',
      'privacy-notice/page.tsx',
      'account-access/page.tsx',
    ]) {
      const source = readFileSync(new URL(page, root), 'utf8');
      expect(source, page).toContain('<SiteHeader');
      expect(source, page).toContain('<BackLink');
    }
    for (const page of [
      'scenarios/[slug]/page.tsx',
      'scenarios/publish/[versionId]/page.tsx',
    ])
      expect(readFileSync(new URL(page, root), 'utf8'), page).toContain(
        '<SiteHeader',
      );
  });

  it('offers the same destinations as the app header, account pages in the profile menu', () => {
    const read = (name: string) =>
      readFileSync(
        new URL(`../apps/web/components/${name}`, import.meta.url),
        'utf8',
      );
    const header = read('site-header.tsx');
    for (const destination of [
      "'/discover'",
      "'/scenarios'",
      "'/saved'",
      "'/lives'",
      '"/start"',
      "'/publications'",
    ])
      expect(header).toContain(destination);
    // Billing and privacy left the main menu for the profile menu.
    expect(header).not.toContain("'/billing'");
    const profile = read('profile-menu.tsx');
    for (const destination of ['"/account"', '"/billing"', '"/privacy"'])
      expect(profile).toContain(destination);
    // Both headers use the same profile menu and no direct sign-out button.
    const app = read('experience.tsx');
    for (const source of [header, app]) {
      expect(source).toContain('<ProfileMenu');
      expect(source).not.toContain('<LogOut');
    }
  });

  it('asks before signing out from the profile menu', async () => {
    const source = readFileSync(
      new URL('../apps/web/components/profile-menu.tsx', import.meta.url),
      'utf8',
    );
    // The sign-out button only opens the confirmation; onSignOut runs from it.
    expect(source).toContain('onClick={() => setConfirming(true)}');
    expect(source.indexOf('onSignOut()')).toBeGreaterThan(
      source.indexOf('confirming ?'),
    );
    vi.doMock(webRequire.resolve('next/navigation'), () => ({
      useRouter: () => ({ refresh: () => undefined }),
    }));
    const { LanguageProvider } =
      await import('../apps/web/components/language-provider');
    const { ProfileMenu } = await import('../apps/web/components/profile-menu');
    const html = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        { initialLocale: 'en' },
        createElement(ProfileMenu, {
          email: 'reader@example.invalid',
          onSignOut: () => undefined,
        }),
      ),
    );
    // Closed by default: only the initial, no sign-out action rendered.
    expect(html).toContain('>R<');
    expect(html).not.toContain('Sign out');
    vi.doUnmock(webRequire.resolve('next/navigation'));
  });

  it('has the account page with header, Back, invite and the data controls', () => {
    const page = readFileSync(
      new URL('../apps/web/app/account/page.tsx', import.meta.url),
      'utf8',
    );
    expect(page).toContain('<SiteHeader current="account"');
    expect(page).toContain('<BackLink');
    const panel = readFileSync(
      new URL('../apps/web/components/account-panel.tsx', import.meta.url),
      'utf8',
    );
    expect(panel).toContain('<ReferralInviteCard');
    expect(panel).toContain('<AccountAccess');
    expect(panel).toContain('embedded');
    // The invite card left the billing page.
    const billing = readFileSync(
      new URL('../apps/web/components/billing-panel.tsx', import.meta.url),
      'utf8',
    );
    expect(billing).not.toContain('referral-invite');
    expect(billing).toContain('href="/account"');
  });
});
