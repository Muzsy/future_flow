import type { Metadata } from 'next';
import { OfficialPublicationReader } from '../../components/official-publication-reader';
import { signupUiAllowed } from '../../lib/signup';
export const metadata: Metadata = {
  title: 'Sample story · alterward',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function Page() {
  return <OfficialPublicationReader allowSignup={signupUiAllowed()} />;
}
