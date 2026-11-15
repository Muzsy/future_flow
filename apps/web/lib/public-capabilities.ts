'use client';
import { useEffect, useState } from 'react';
import { api } from './client';

// Which public areas are switched on. The signed-in navigation shows a link
// only for an area the API reports as available; until the answer arrives, or
// when it cannot be read, every area stays hidden (fail closed).
export type PublicCapabilities = {
  discover: boolean;
  scenarios: boolean;
  saved: boolean;
  publications: boolean;
};
export const NO_PUBLIC_CAPABILITIES: PublicCapabilities = Object.freeze({
  discover: false,
  scenarios: false,
  saved: false,
  publications: false,
});

export function publicCapabilitiesFrom(body: unknown): PublicCapabilities {
  if (body === null || typeof body !== 'object') return NO_PUBLIC_CAPABILITIES;
  const value = body as Record<string, unknown>;
  return {
    discover: value.discover === true,
    scenarios: value.scenarios === true,
    saved: value.saved === true,
    publications: value.publications === true,
  };
}

export function usePublicCapabilities(user: string | null) {
  const [capabilities, setCapabilities] = useState<PublicCapabilities>(
    NO_PUBLIC_CAPABILITIES,
  );
  useEffect(() => {
    let stopped = false;
    setCapabilities(NO_PUBLIC_CAPABILITIES);
    if (user)
      void api<unknown>('/public-capabilities', {}, 'v2')
        .then((body) => {
          if (!stopped) setCapabilities(publicCapabilitiesFrom(body));
        })
        .catch(() => {});
    return () => {
      stopped = true;
    };
  }, [user]);
  return capabilities;
}
