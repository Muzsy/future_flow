import { createClient, type SupabaseClient } from '@supabase/supabase-js';
let client: SupabaseClient | null = null;
export function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('A belépés még nincs beállítva.');
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
): Promise<T> {
  const { data } = await supabase().auth.getSession();
  if (!data.session) throw new Error('Jelentkezz be a folytatáshoz.');
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}${path}`,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session.access_token}`,
        ...options.headers,
      },
      cache: 'no-store',
    },
  );
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      (body as { error?: { message?: string } }).error?.message ??
        'A kérés nem sikerült.',
    );
  return body as T;
}
