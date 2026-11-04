import { Experience } from '../../components/experience';
import { signupUiAllowed } from '../../lib/signup';
import { turnstileSiteKey } from '../../lib/turnstile';
export default function Page() {
  return (
    <Experience
      allowSignup={signupUiAllowed()}
      turnstileSiteKey={turnstileSiteKey()}
    />
  );
}
