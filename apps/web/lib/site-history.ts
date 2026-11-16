// Where "Back" may go. The site sends no referrer (layout: no-referrer), so the
// previous page of this site is remembered per tab in sessionStorage instead.
// Only paths are kept, never query strings or anything about the reader.
const CURRENT = 'aw:page';
const PREVIOUS = 'aw:previous-page';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function store(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

// Record that this tab now shows `path`. Repeating the same path changes nothing.
export function markSitePage(path: string, storage: Store | null = store()) {
  if (!storage || !path.startsWith('/')) return;
  try {
    const current = storage.getItem(CURRENT);
    if (current === path) return;
    if (current) storage.setItem(PREVIOUS, current);
    storage.setItem(CURRENT, path);
  } catch {
    /* Storage unavailable: Back falls back to the home page. */
  }
}

// True when this tab reached `path` from another page of this site.
export function cameFromSitePage(
  path: string,
  storage: Store | null = store(),
): boolean {
  if (!storage) return false;
  try {
    const previous = storage.getItem(PREVIOUS);
    return storage.getItem(CURRENT) === path && !!previous && previous !== path;
  } catch {
    return false;
  }
}
