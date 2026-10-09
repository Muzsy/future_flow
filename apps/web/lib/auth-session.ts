import type { SupabaseClient } from '@supabase/supabase-js';

// getSession reads retained storage but does not return URL initialization errors.
// Keep an existing session while also reporting a failed email-link callback.
export async function initializeAuthSession(
  auth: Pick<SupabaseClient['auth'], 'initialize' | 'getSession'>,
) {
  const initialized = await auth.initialize();
  const { data, error } = await auth.getSession();
  return { session: data.session, error: initialized.error ?? error };
}
