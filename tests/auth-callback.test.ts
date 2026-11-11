import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AuthApiError,
  AuthImplicitGrantRedirectError,
  AuthSessionMissingError,
  AuthRetryableFetchError,
  GoTrueClient,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { clientErrorMessage, ClientError } from '../apps/web/lib/client';
import { initializeAuthSession } from '../apps/web/lib/auth-session';
import { errorMessage } from '@future-flow/contracts';

describe('email callback errors and retained account sessions', () => {
  it('explains a consumed or expired implicit email link using the actual SDK error', () => {
    const error = new AuthImplicitGrantRedirectError(
      'private provider description',
      { error: 'access_denied', code: 'otp_expired' },
    );
    expect(error.code).toBeUndefined();
    expect(clientErrorMessage(error)).toBe(errorMessage('en', 'otp_expired'));
    expect(clientErrorMessage(error)).toContain(
      'invalid, expired, or has already been used',
    );
    expect(clientErrorMessage(error)).not.toContain(
      'private provider description',
    );
  });
  it('uses the same message for the provider API expiry code', () => {
    expect(
      clientErrorMessage(
        new AuthApiError('private detail', 403, 'otp_expired'),
      ),
    ).toBe(errorMessage('en', 'otp_expired'));
  });
  it('does not turn unknown redirect failures into network errors or expose raw provider text', () => {
    const error = new AuthImplicitGrantRedirectError(
      'private callback description',
      { error: 'access_denied', code: 'unknown_future_code' },
    );
    expect(clientErrorMessage(error)).toBe(
      errorMessage('en', 'AUTH_CALLBACK_FAILED'),
    );
    expect(clientErrorMessage(error)).not.toContain(
      'private callback description',
    );
  });
  it('asks for a sign-in when the SDK session is missing', () => {
    expect(clientErrorMessage(new AuthSessionMissingError())).toBe(
      errorMessage('en', 'AUTH_REQUIRED'),
    );
  });
  it.each(['same_password', 'signup_disabled', 'invalid_credentials'])(
    'explains the provider %s result',
    (code) => {
      expect(
        clientErrorMessage(
          new AuthApiError('untrusted provider text', 400, code),
        ),
      ).toBe(errorMessage('en', code));
    },
  );
  it('preserves genuine fetch failures and application errors', () => {
    expect(clientErrorMessage(new TypeError('fetch failed'))).toBe(
      'The service could not be reached. Please try again.',
    );
    expect(
      clientErrorMessage(new AuthRetryableFetchError('fetch failed', 0)),
    ).toBe('The service could not be reached. Please try again.');
    expect(clientErrorMessage(new ClientError('AUTH_REAUTH_REQUIRED'))).toBe(
      errorMessage('en', 'AUTH_REAUTH_REQUIRED'),
    );
  });
  const storedSession: Session = {
    access_token: 'synthetic-token',
    refresh_token: 'synthetic-refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'synthetic-user',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-10-09T00:00:00Z',
    },
  };
  function auth(
    initialError: AuthImplicitGrantRedirectError | null,
    sessionError: AuthSessionMissingError | null = null,
  ) {
    return {
      initialize: vi.fn(async () => ({ error: initialError })),
      getSession: vi.fn(async () => ({
        data: { session: sessionError ? null : storedSession },
        error: sessionError,
      })),
    } as Pick<SupabaseClient['auth'], 'initialize' | 'getSession'>;
  }
  it('returns callback failure alongside an existing session instead of treating storage as callback success', async () => {
    const expired = new AuthImplicitGrantRedirectError('expired', {
      error: 'access_denied',
      code: 'otp_expired',
    });
    const client = auth(expired);
    expect(await initializeAuthSession(client)).toEqual({
      session: storedSession,
      error: expired,
    });
    expect(client.initialize).toHaveBeenCalledOnce();
    expect(client.getSession).toHaveBeenCalledOnce();
  });
  it('keeps normal initialization and stored sessions successful', async () => {
    expect(await initializeAuthSession(auth(null))).toEqual({
      session: storedSession,
      error: null,
    });
  });
  it('reports a session read failure after successful initialization', async () => {
    const error = new AuthSessionMissingError();
    expect(await initializeAuthSession(auth(null, error))).toEqual({
      session: null,
      error,
    });
  });
});

describe('pinned SDK callback initialization with real in-memory storage', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([true, false])(
    'reports expiry without removing an existing session: stored=%s',
    async (hasSession) => {
      vi.stubGlobal('window', {
        location: {
          href: 'https://fixture.invalid/account-access#error=access_denied&error_code=otp_expired&error_description=Synthetic%20expired%20link',
        },
      });
      vi.stubGlobal('document', { visibilityState: 'hidden', cookie: '' });
      vi.stubGlobal('BroadcastChannel', undefined);
      const session: Session = {
        access_token: 'synthetic-token',
        refresh_token: 'synthetic-refresh',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: {
          id: 'synthetic-user',
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: '2026-10-09T00:00:00Z',
        },
      };
      const storageKey = `callback-sdk-${hasSession}`;
      const values = new Map<string, string>(
        hasSession ? [[storageKey, JSON.stringify(session)]] : [],
      );
      const fetch = vi.fn(async () => {
        throw new Error('Provider transport is forbidden in this SDK fixture');
      });
      const auth = new GoTrueClient({
        url: 'https://fixture.invalid/auth/v1',
        storageKey,
        autoRefreshToken: false,
        persistSession: true,
        detectSessionInUrl: true,
        fetch,
        storage: {
          getItem: (key) => values.get(key) ?? null,
          setItem: (key, value) => {
            values.set(key, value);
          },
          removeItem: (key) => {
            values.delete(key);
          },
        },
      });
      const result = await initializeAuthSession(auth);
      expect(result.error).toBeInstanceOf(AuthImplicitGrantRedirectError);
      expect(clientErrorMessage(result.error)).toContain(
        'invalid, expired, or has already been used',
      );
      expect(result.session).toEqual(hasSession ? session : null);
      expect(values.get(storageKey)).toBe(
        hasSession ? JSON.stringify(session) : undefined,
      );
      // getSession alone does not expose the cached URL initialization error.
      expect((await auth.getSession()).error).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
      await auth.stopAutoRefresh();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
