import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  languages,
  resolveLocale,
  type Locale,
} from '@future-flow/contracts';
import { en, hu, type MessageKey } from './messages';
export { type MessageKey } from './messages';
export const messages = { en, hu } satisfies Record<
  Locale,
  Record<MessageKey, string>
>;
export function translate(
  locale: Locale,
  key: MessageKey,
  parameters: Record<string, string | number> = {},
): string {
  const catalog = messages[locale] ?? messages[DEFAULT_LOCALE];
  return catalog[key].replace(/\{(\w+)\}/g, (_match, name: string) => {
    if (!Object.hasOwn(parameters, name))
      throw new Error(`Missing translation parameter: ${key}.${name}`);
    return String(parameters[name]);
  });
}
export function browserLocale(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE;
  const value = document.cookie
    .split(';')
    .find((part) => part.trim().startsWith(`${LOCALE_COOKIE}=`))
    ?.trim()
    .slice(LOCALE_COOKIE.length + 1);
  try {
    return resolveLocale(value ? decodeURIComponent(value) : undefined);
  } catch {
    return DEFAULT_LOCALE;
  }
}
export function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(languages[locale].intlTag, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(/^\d{4}-\d{2}-\d{2}$/.test(value) ? { timeZone: 'UTC' } : {}),
  }).format(new Date(value));
}
