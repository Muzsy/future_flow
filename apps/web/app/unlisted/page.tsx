import type { Metadata } from 'next';
import { PublicationReader } from '../../components/publication-reader';
export const metadata: Metadata = {
  title: 'Shared life · alterward',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function Page() {
  return <PublicationReader />;
}
