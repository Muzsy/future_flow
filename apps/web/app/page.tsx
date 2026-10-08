import { Experience } from '../components/experience';
import { closedSiteConfigFromEnv } from '@future-flow/access';
export default function Home() {
  return <Experience allowSignup={!closedSiteConfigFromEnv().enabled} />;
}
