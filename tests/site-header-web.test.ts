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

  it('offers the same destinations as the app header', () => {
    const source = readFileSync(
      new URL('../apps/web/components/site-header.tsx', import.meta.url),
      'utf8',
    );
    for (const destination of [
      "'/discover'",
      "'/scenarios'",
      "'/saved'",
      "'/lives'",
      '"/start"',
      "'/publications'",
      "'/billing'",
      '"/privacy"',
    ])
      expect(source).toContain(destination);
  });
});
