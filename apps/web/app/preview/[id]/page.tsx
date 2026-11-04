import type { Metadata } from 'next';
import { Experience } from '../../../components/experience';
import { signupUiAllowed } from '../../../lib/signup';
import { turnstileSiteKey } from '../../../lib/turnstile';

export const metadata: Metadata = {
  title: 'Private copy preview · alterward',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <Experience
      allowSignup={signupUiAllowed()}
      turnstileSiteKey={turnstileSiteKey()}
    />
  );
}
