import { Experience } from '../../components/experience';
import { signupUiAllowed } from '../../lib/signup';
export default function Page() {
  return <Experience allowSignup={signupUiAllowed()} />;
}
