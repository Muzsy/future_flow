import { afterEach, describe, expect, it, vi } from 'vitest';
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getSession } }),
}));
import { api, lifeApi } from '../apps/web/lib/client';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe('explicit private-start identity across an async session lookup', () => {
  it('does not send a consent or paid start under a different account', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.invalid');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'technical-fixture-key');
    const sent = vi.fn();
    vi.stubGlobal('fetch', sent);
    const lookup = Promise.withResolvers<{
      data: { session: { user: { id: string }; access_token: string } };
    }>();
    getSession.mockReturnValueOnce(lookup.promise);
    const start = lifeApi(
      '/public-forks/life-' + 'a'.repeat(32),
      { method: 'POST', body: '{}' },
      'original-account',
    );
    lookup.resolve({
      data: {
        session: {
          user: { id: 'another-account' },
          access_token: 'technical-token',
        },
      },
    });
    await expect(start).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(sent).not.toHaveBeenCalled();
    getSession.mockResolvedValueOnce({
      data: {
        session: {
          user: { id: 'another-account' },
          access_token: 'technical-token',
        },
      },
    });
    await expect(
      api(
        '/me/consent',
        { method: 'POST', body: '{}' },
        'v1',
        'original-account',
      ),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(sent).not.toHaveBeenCalled();
  });
  it('accepts a refreshed token only for the same explicit account', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.invalid');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'technical-fixture-key');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://example.invalid/api/v1');
    getSession.mockResolvedValueOnce({
      data: {
        session: {
          user: { id: 'original-account' },
          access_token: 'refreshed-technical-token',
        },
      },
    });
    const sent = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ receipt: 'technical' }),
      });
    vi.stubGlobal('fetch', sent);
    expect(
      await lifeApi(
        '/public-forks/life-' + 'a'.repeat(32),
        {
          method: 'POST',
          headers: { 'Idempotency-Key': 'same-approved-request' },
          body: '{}',
        },
        'original-account',
      ),
    ).toEqual({ receipt: 'technical' });
    expect(sent).toHaveBeenCalledOnce();
    expect(sent.mock.calls[0]?.[1]).toMatchObject({
      cache: 'no-store',
      headers: {
        Authorization: 'Bearer refreshed-technical-token',
        'Idempotency-Key': 'same-approved-request',
      },
    });
  });
});
