import { describe, it, expect } from 'vitest';
import {
  publicReturnPath,
  publicLoginHref,
} from '../apps/web/lib/public-return';
describe('public reader return after authentication', () => {
  it('round trips both approved public reader routes without starting a life', () => {
    for (const slug of [
      'life-' + 'a'.repeat(32),
      'official-' + 'b'.repeat(32),
    ]) {
      const href = publicLoginHref(slug),
        value = new URL(href, 'https://alterward.com').searchParams.get(
          'returnTo',
        );
      expect(publicReturnPath(value)).toBe(
        `/${slug.startsWith('official-') ? 'official-lives' : 'lives'}/${slug}`,
      );
    }
  });
  it('refuses external, encoded, credential-bearing, malformed and arbitrary redirects', () => {
    const source = '/lives/life-' + 'a'.repeat(32);
    for (const value of [
      null,
      12,
      {},
      'https://example.invalid' + source,
      '//example.invalid' + source,
      'javascript:alert(1)',
      '/\\example.invalid',
      source + '?token=secret',
      source + '#secret',
      '/unlisted?token=secret',
      '/life/' + crypto.randomUUID(),
      '/lives/../settings',
      '/official-lives/life-' + 'a'.repeat(32),
      '%2Flives%2Flife-' + 'a'.repeat(32),
      source + '%0d%0a',
      '/login?returnTo=/settings',
    ])
      expect(publicReturnPath(value)).toBeNull();
    expect(publicLoginHref('malformed')).toBe('/login');
  });
});
