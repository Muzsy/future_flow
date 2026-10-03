import { z } from 'zod';

export const supportedLocales = ['en', 'hu'] as const;
export const localeSchema = z.enum(supportedLocales);
export type Locale = z.infer<typeof localeSchema>;
// Stored/research locales remain valid; only these languages are exposed by the product.
export const enabledLocales = ['en'] as const;
export const enabledLocaleSchema = z.enum(enabledLocales);
export function isEnabledLocale(
  value: unknown,
): value is (typeof enabledLocales)[number] {
  return enabledLocaleSchema.safeParse(value).success;
}
export function resolveEnabledLocale(value: string | null | undefined): Locale {
  const locale = resolveLocale(value);
  return isEnabledLocale(locale) ? locale : DEFAULT_LOCALE;
}
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'alterward_locale';
export const languages: Record<
  Locale,
  {
    nativeName: string;
    intlTag: string;
    aiName: string;
    newLifeTitle: string;
    baselineTitle: string;
  }
> = {
  en: {
    nativeName: 'English',
    intlTag: 'en-GB',
    aiName: 'English',
    newLifeTitle: 'New life branch',
    baselineTitle: 'Baseline scenario',
  },
  hu: {
    nativeName: 'Magyar',
    intlTag: 'hu-HU',
    aiName: 'Hungarian',
    newLifeTitle: 'Új életág',
    baselineTitle: 'Alapforgatókönyv',
  },
};
export function resolveLocale(value: string | null | undefined): Locale {
  const parsed = localeSchema.safeParse(
    value?.trim().toLowerCase().split('-')[0],
  );
  return parsed.success ? parsed.data : DEFAULT_LOCALE;
}
export function localeFromAcceptLanguage(header: string | undefined): Locale {
  const candidates = (header ?? '')
    .slice(0, 1024)
    .split(',')
    .map((entry, index) => {
      const [tag, ...parameters] = entry.trim().split(';');
      const quality = parameters.find((parameter) =>
        parameter.trim().startsWith('q='),
      );
      const q = quality ? Number(quality.trim().slice(2)) : 1;
      return {
        locale: localeSchema.safeParse(tag?.toLowerCase().split('-')[0]),
        q,
        index,
      };
    })
    .filter(
      (entry) =>
        entry.locale.success &&
        isEnabledLocale(entry.locale.data) &&
        Number.isFinite(entry.q) &&
        entry.q > 0 &&
        entry.q <= 1,
    )
    .sort((a, b) => b.q - a.q || a.index - b.index);
  const match = candidates[0]?.locale;
  return match?.success ? match.data : DEFAULT_LOCALE;
}
