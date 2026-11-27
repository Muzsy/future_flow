import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, resolveEnabledLocale } from '@future-flow/contracts';
import { Experience } from '../components/experience';
import { translate } from '../lib/i18n';
import { publicIndexingAllowed, publicSiteOrigin } from '../lib/seo';
import { signupUiAllowed } from '../lib/signup';
import { turnstileSiteKey } from '../lib/turnstile';

export async function generateMetadata(): Promise<Metadata> {
  const locale = resolveEnabledLocale(
    (await cookies()).get(LOCALE_COOKIE)?.value,
  );
  const title = translate(locale, 'metadata.title');
  const description = translate(locale, 'metadata.description');
  const origin = publicSiteOrigin();
  const indexable = publicIndexingAllowed();
  return {
    title,
    description,
    alternates: { canonical: `${origin}/` },
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: false, noarchive: true },
    openGraph: {
      type: 'website',
      url: `${origin}/`,
      siteName: 'alterward',
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function Home() {
  return (
    <Experience
      allowSignup={signupUiAllowed()}
      turnstileSiteKey={turnstileSiteKey()}
    />
  );
}
