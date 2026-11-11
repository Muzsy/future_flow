import { Experience } from '../components/experience';
import { signupUiAllowed } from '../lib/signup';
import { turnstileSiteKey } from '../lib/turnstile';
export default function Home() {
  return (
    <Experience
      allowSignup={signupUiAllowed()}
      turnstileSiteKey={turnstileSiteKey()}
    />
  );
}
