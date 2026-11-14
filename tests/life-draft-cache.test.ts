import { afterEach, expect, it, vi } from 'vitest';
import {
  clearLifeDraftCache,
  lifeDraftCacheKey,
} from '../apps/web/lib/life-draft-cache';

afterEach(() => vi.unstubAllGlobals());

it('clears both draft layouts from the tab when the session ends', () => {
  const entries = new Map([
    [lifeDraftCacheKey('person'), 'legacy draft'],
    [lifeDraftCacheKey('person', true), 'private story draft'],
    ['alterward.locale', 'hu'],
  ]);
  vi.stubGlobal('window', {
    sessionStorage: {
      get length() {
        return entries.size;
      },
      key: (index: number) => [...entries.keys()][index] ?? null,
      removeItem: (key: string) => entries.delete(key),
    },
  });

  clearLifeDraftCache();

  expect([...entries]).toEqual([['alterward.locale', 'hu']]);
});
