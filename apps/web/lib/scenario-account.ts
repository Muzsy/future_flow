'use client';
import { useEffect, useRef, useState } from 'react';
import { authConfigured, supabase } from './client';
// Account epochs bind private responses and in-flight actions to the account
// that initiated them. A switch clears the whole private component via its key.
export function useScenarioAccount() {
  const [sessionState, setSessionState] = useState<{
      user: string | null;
      version: number;
    }>({ user: null, version: 0 }),
    epoch = useRef(0),
    current = useRef<string | null>(null);
  useEffect(() => {
    if (!authConfigured) return;
    let live = true;
    const {
      data: { subscription },
    } = supabase().auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (live && next !== current.current) {
        current.current = next;
        epoch.current++;
        setSessionState({ user: next, version: epoch.current });
      }
    });
    return () => {
      live = false;
      epoch.current++;
      current.current = null;
      subscription.unsubscribe();
    };
  }, []);
  return {
    user: sessionState.user,
    version: sessionState.version,
    epoch,
    current,
  };
}
