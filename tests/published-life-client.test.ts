import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getSession } }),
}));

const fetchStory = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://auth.example.invalid');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'technical-fixture-key');
  vi.stubEnv('NEXT_PUBLIC_API_URL', '/api/v1');
  vi.stubGlobal('fetch', fetchStory);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('published life reads', () => {
  it.each([
    '/discovery?classification=official',
    '/collections/featured',
    '/official-lives/official-example',
    '/lives/community-example',
  ] as const)('sends the current application session to %s', async (path) => {
    const { readPublishedLife } = await import('../apps/web/lib/client');
    getSession.mockResolvedValue({
      data: { session: { access_token: 'session-token' } },
    });
    const { signal } = new AbortController();
    await readPublishedLife(path, signal);
    expect(fetchStory).toHaveBeenCalledWith(
      '/api/public' + path,
      expect.objectContaining({
        headers: {
          'Accept-Language': 'en',
          Authorization: 'Bearer session-token',
        },
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
      }),
    );
  });

  it('preserves a secret link without looking up the account session', async () => {
    const { readPublishedLife } = await import('../apps/web/lib/client');
    await readPublishedLife(
      '/official-unlisted',
      new AbortController().signal,
      'link-token',
    );
    expect(getSession).not.toHaveBeenCalled();
    expect(fetchStory).toHaveBeenCalledWith(
      '/api/public/official-unlisted',
      expect.objectContaining({
        headers: {
          'Accept-Language': 'en',
          Authorization: 'Bearer link-token',
        },
        referrerPolicy: 'no-referrer',
      }),
    );
  });

  it('leaves the anonymous request to the server where there is no session', async () => {
    const { readPublishedLife } = await import('../apps/web/lib/client');
    getSession.mockResolvedValue({ data: { session: null } });
    await readPublishedLife('/discovery', new AbortController().signal);
    expect(fetchStory).toHaveBeenCalledWith(
      '/api/public/discovery',
      expect.objectContaining({ headers: { 'Accept-Language': 'en' } }),
    );
  });
});
