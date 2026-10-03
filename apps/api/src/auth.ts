import { createClient } from '@supabase/supabase-js';
import { DomainError } from '@future-flow/core';

export interface AuthProvider {
  verify(token: string): Promise<{ id: string }>;
  deleteUser(id: string): Promise<void>;
  assertDeletionConfigured?(): void;
  userExists?(id: string): Promise<boolean>;
}
export class SupabaseAuthProvider implements AuthProvider {
  private readonly client;
  constructor(
    url: string,
    private readonly key: string,
  ) {
    if (!url || !key)
      throw new Error('Supabase server configuration is required');
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  async verify(token: string) {
    const { data, error } = await this.client.auth.getUser(token);
    if (error || !data.user || data.user.is_anonymous)
      throw new DomainError('AUTH_INVALID_TOKEN', 'Jelentkezz be újra.', 401);
    return { id: data.user.id };
  }
  async deleteUser(id: string) {
    this.assertDeletionConfigured();
    const { error } = await this.client.auth.admin.deleteUser(id);
    if (error)
      throw new DomainError(
        'PRIVACY_AUTH_DELETE_FAILED',
        'A fiók törlése nem sikerült. Próbáld újra később.',
        503,
      );
  }
  assertDeletionConfigured() {
    let configured = this.key.startsWith('sb_secret_');
    try {
      configured ||=
        JSON.parse(
          Buffer.from(this.key.split('.')[1] ?? '', 'base64url').toString(),
        ).role === 'service_role';
    } catch {
      /* Publishable keys cannot delete accounts. */
    }
    if (!configured)
      throw new DomainError(
        'AUTH_ADMIN_NOT_CONFIGURED',
        'Server-side account deletion is not configured.',
        503,
      );
  }
  async userExists(id: string) {
    this.assertDeletionConfigured();
    const { data, error } = await this.client.auth.admin.getUserById(id);
    if (error?.code === 'user_not_found') return false;
    if (error || !data.user)
      throw new DomainError(
        'PRIVACY_AUTH_CHECK_FAILED',
        'Account state could not be confirmed.',
        503,
      );
    return true;
  }
}
// Call only after verify(): the payload must come from a validated Supabase token.
export function requireRecentAuthentication(token: string, now = Date.now()) {
  try {
    const part = token.split('.')[1];
    if (!part) throw new Error('Missing payload');
    const claims: unknown = JSON.parse(
      Buffer.from(part, 'base64url').toString('utf8'),
    );
    const amr = (claims as { amr?: unknown }).amr;
    if (
      !Array.isArray(amr) ||
      !amr.some((entry: unknown) => {
        if (!entry || typeof entry !== 'object') return false;
        const { method, timestamp } = entry as {
          method: unknown;
          timestamp: unknown;
        };
        return (
          [
            'password',
            'otp',
            'magiclink',
            'oauth',
            'email/signup',
            'totp',
          ].includes(String(method)) &&
          typeof timestamp === 'number' &&
          timestamp * 1000 <= now + 30000 &&
          now - timestamp * 1000 <= 300000
        );
      })
    )
      throw new Error('No recent authentication');
  } catch {
    throw new DomainError(
      'AUTH_REAUTH_REQUIRED',
      'Az adatletöltéshez és törléshez jelentkezz be újra az elmúlt 5 percen belül.',
      403,
    );
  }
}
