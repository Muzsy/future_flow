import { afterEach, it, expect, vi } from 'vitest';
import { SupabaseAuthProvider } from '../apps/api/src/auth';
import { narrativeConfigFromEnv } from '@future-flow/database';
import { serviceAccessEnforcementFromEnv } from '@future-flow/core';
import { configureWorkerChapterBilling } from '../apps/worker/src/chapter-billing';
afterEach(() => vi.unstubAllGlobals());
it('binds to the provider-verified email and confirmation rather than mutable user metadata', async () => {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'Actual@example.invalid',
    email_confirmed_at: new Date(Date.now() - 60000).toISOString(),
    is_anonymous: false,
    user_metadata: {
      email: 'attacker@example.invalid',
      email_confirmed: true,
      role: 'admin',
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(user)),
  );
  const auth = new SupabaseAuthProvider(
    'https://fixture.supabase.co',
    'sb_publishable_fixture',
  );
  expect(await auth.verify('synthetic-provider-token')).toEqual({
    id: user.id,
    email: 'actual@example.invalid',
    emailConfirmed: true,
  });
  delete (user as { email_confirmed_at?: string }).email_confirmed_at;
  expect((await auth.verify('synthetic-provider-token')).emailConfirmed).toBe(
    false,
  );
  user.is_anonymous = true;
  await expect(auth.verify('synthetic-provider-token')).rejects.toMatchObject({
    code: 'AUTH_INVALID_TOKEN',
  });
});
it('refuses an invalid rollout flag, a weaker engine or missing worker chapter enforcement', () => {
  expect(serviceAccessEnforcementFromEnv({})).toBe(false);
  expect(() =>
    serviceAccessEnforcementFromEnv({ SERVICE_ACCESS_ENFORCEMENT: 'yes' }),
  ).toThrow();
  expect(() =>
    narrativeConfigFromEnv({
      SERVICE_ACCESS_ENFORCEMENT: 'true',
      NARRATIVE_PIPELINE_MODE: 'legacy',
    }),
  ).toThrow();
  expect(() =>
    configureWorkerChapterBilling({ SERVICE_ACCESS_ENFORCEMENT: 'true' }),
  ).toThrow('chapter billing');
  expect(
    narrativeConfigFromEnv({
      SERVICE_ACCESS_ENFORCEMENT: 'true',
      NARRATIVE_PIPELINE_MODE: 'narrative-fiction-v2',
      NARRATIVE_FICTION_GENERATION: 'v9',
    }),
  ).toMatchObject({
    accessMode: 'service-admission',
    cohortUserIds: [],
    fictionGeneration: 'v9',
  });
});
