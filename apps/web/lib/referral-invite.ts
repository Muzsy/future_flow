// Subscriber invite, web side. The invite link is `/login?invite=<token>`; the
// token only names the inviter and is checked (signature, expiry, one use) by
// the API, which stays the authority. This file only finds, remembers and
// forwards the token; nothing here grants anything and every read fails closed.

const TOKEN = /aw1\.[A-Za-z0-9_-]{49}(?![A-Za-z0-9_-])/;
const STORAGE_KEY = 'alterward.invite';

// A bare token, a full invite link or text around either: the one well-formed
// token in it, or null.
export function inviteTokenFrom(text: unknown): string | null {
  if (typeof text !== 'string' || text.length > 2048) return null;
  return TOKEN.exec(text)?.[0] ?? null;
}

export const inviteFromSearch = (search: string) =>
  inviteTokenFrom(new URLSearchParams(search).get('invite'));

export const inviteLink = (origin: string, token: string) =>
  `${origin}/login?invite=${encodeURIComponent(token)}`;

// The address the confirmation e-mail returns to: it keeps the invite so the
// token survives opening the link in another tab.
export function loginRedirectPath(
  returnTo: string | null,
  invite: string | null,
) {
  const parts = [
    ...(returnTo ? ['returnTo=' + encodeURIComponent(returnTo)] : []),
    ...(invite ? ['invite=' + encodeURIComponent(invite)] : []),
  ];
  return '/login' + (parts.length ? '?' + parts.join('&') : '');
}

// The pre-admission status read and the consent submit both carry the token.
export const consentStatusPath = (token: string | null) =>
  '/me/consent' + (token ? '?invite=' + encodeURIComponent(token) : '');

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function browserStore(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

// Browser storage can be missing or throw; the invite then simply is not kept.
export function rememberInvite(
  token: string,
  store: Store | null = browserStore(),
) {
  try {
    store?.setItem(STORAGE_KEY, token);
  } catch {
    /* not remembered */
  }
}
export function rememberedInvite(store: Store | null = browserStore()) {
  try {
    return inviteTokenFrom(store?.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}
export function forgetInvite(store: Store | null = browserStore()) {
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to forget */
  }
}
