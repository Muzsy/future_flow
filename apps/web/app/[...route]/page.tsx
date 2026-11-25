import { notFound } from 'next/navigation';
import { Experience } from '../../components/experience';
import { signupUiAllowed } from '../../lib/signup';
import { turnstileSiteKey } from '../../lib/turnstile';

// The client app's own pages. Any other first path segment is a real 404
// (plan 053 A5): before this, unknown addresses answered 200 with an empty
// page, which search engines would have indexed as content.
const APP_PAGES = new Set([
  'login',
  'signup',
  'lives',
  'start',
  'life',
  'preview',
  'onboarding',
  'profile',
  'futures',
  'branch',
  'job',
  'settings',
  'feedback',
  'connections',
  'privacy',
]);
export default async function Page({
  params,
}: {
  params: Promise<{ route: string[] }>;
}) {
  const { route } = await params;
  if (!APP_PAGES.has(route[0] ?? '')) notFound();
  return (
    <Experience
      allowSignup={signupUiAllowed()}
      turnstileSiteKey={turnstileSiteKey()}
      singlePageStoryStart={process.env.SINGLE_PAGE_STORY_START === 'true'}
    />
  );
}
