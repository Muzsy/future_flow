const draftPrefixes = [
  'alterward.lifeDraft:',
  'alterward.lifeDraft.v2:',
] as const;

export function lifeDraftCacheKey(
  user: string | null,
  storyDirections = false,
) {
  return `${draftPrefixes[storyDirections ? 1 : 0]}${user}`;
}

export function clearLifeDraftCache() {
  try {
    const storage = window.sessionStorage;
    for (let index = storage.length - 1; index >= 0; index--) {
      const key = storage.key(index);
      if (key && draftPrefixes.some((prefix) => key.startsWith(prefix)))
        storage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable. Authentication must still be able to end.
  }
}
