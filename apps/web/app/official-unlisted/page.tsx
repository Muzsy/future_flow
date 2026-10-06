import type { Metadata } from 'next';
import { OfficialPublicationReader } from '../../components/official-publication-reader';
export const metadata: Metadata = {
  title: 'Official life · alterward',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function Page() {
  return <OfficialPublicationReader />;
}
