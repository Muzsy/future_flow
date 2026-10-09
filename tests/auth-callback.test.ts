import { describe, expect, it, vi } from 'vitest';
import {
  AuthApiError,
  AuthImplicitGrantRedirectError,
  AuthSessionMissingError,
  AuthRetryableFetchError,
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
