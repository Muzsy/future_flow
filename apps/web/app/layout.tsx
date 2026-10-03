import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, resolveLocale } from '@future-flow/contracts';
import { LanguageProvider } from '../components/language-provider';
import { translate } from '../lib/i18n';
import './globals.css';
async function selectedLocale() {
  return resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}
export async function generateMetadata(): Promise<Metadata> {
  const locale = await selectedLocale();
  return {
    title: translate(locale, 'metadata.title'),
    description: translate(locale, 'metadata.description'),
  };
}
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await selectedLocale();
  return (
    <html lang={locale}>
      <body>
        <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
