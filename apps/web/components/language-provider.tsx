'use client';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  LOCALE_COOKIE,
  languages,
  supportedLocales,
  type Locale,
} from '@future-flow/contracts';
import { translate, type MessageKey } from '../lib/i18n';

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, parameters?: Record<string, string | number>) => string;
};
const LanguageContext = createContext<LanguageContextValue | null>(null);
export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, updateLocale] = useState(initialLocale);
  const router = useRouter();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      t: (key, parameters) => translate(locale, key, parameters),
      setLocale: (next) => {
        document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
        updateLocale(next);
        router.refresh();
      },
    }),
    [locale, router],
  );
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
export function useLanguage() {
  const language = useContext(LanguageContext);
  if (!language) throw new Error('LanguageProvider is required.');
  return language;
}
export function LanguageSelect() {
  const { locale, setLocale, t } = useLanguage();
  return (
    <label className="language-select">
      <span>{t('language.label')}</span>
      <select
        aria-label={t('language.label')}
        value={locale}
        onChange={(event) => {
          const selected = supportedLocales.find(
            (code) => code === event.target.value,
          );
          if (selected) setLocale(selected);
        }}
      >
        {supportedLocales.map((code) => (
          <option key={code} value={code} lang={code}>
            {languages[code].nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}
