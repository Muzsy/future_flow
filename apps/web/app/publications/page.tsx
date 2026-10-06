import type { Metadata } from 'next';
import { OwnedPublications } from '../../components/owned-publications';
export const metadata: Metadata = {
  title: 'My published copies · alterward',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function Page() {
  return <OwnedPublications />;
}
