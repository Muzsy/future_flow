import { Experience } from '../components/experience';
import { signupUiAllowed } from '../lib/signup';
export default function Home() {
  return <Experience allowSignup={signupUiAllowed()} />;
}
