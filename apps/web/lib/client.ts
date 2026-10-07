import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { errorMessage } from '@future-flow/contracts';
import { browserLocale, translate } from './i18n';
export class ClientError extends Error {
  constructor(public readonly code: string) {
    super(errorMessage(browserLocale(), code));
  }
}
export function clientErrorMessage(error: unknown): string {
  if (error instanceof ClientError)
    return errorMessage(browserLocale(), error.code);
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
  )
    return errorMessage(browserLocale(), error.code);
  return translate(browserLocale(), 'error.network');
}
let client: SupabaseClient | null = null;
export function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new ClientError('AUTH_NOT_CONFIGURED');
  client ??= createClient(url, key);
  return client;
}
export const authConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
export async function api<T>(
  path: string,
  options: RequestInit = {},
  version: 'v1' | 'v2' = 'v1',
  expectedUserId?: string,
): Promise<T> {
  const { data } = await supabase().auth.getSession();
  if (!data.session) throw new ClientError('AUTH_REQUIRED');
  if (expectedUserId !== undefined && data.session.user.id !== expectedUserId)
    throw new ClientError('AUTH_REQUIRED');
  const response = await fetch(
    `${(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/v1\/?$/, `/${version}`)}${path}`,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': browserLocale(),
        Authorization: `Bearer ${data.session.access_token}`,
        ...options.headers,
      },
      cache: 'no-store',
    },
  );
  const body: unknown = await response.json();
  if (!response.ok)
    throw new ClientError(
      (body as { error?: { code?: string } }).error?.code ?? 'REQUEST_FAILED',
    );
  return body as T;
}
export const lifeApi = <T>(
  path: string,
  options: RequestInit = {},
  expectedUserId?: string,
) => api<T>(path, options, 'v2', expectedUserId);
