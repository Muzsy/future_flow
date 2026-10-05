import type { Metadata } from 'next';
import { Experience } from '../../../components/experience';

export const metadata: Metadata = {
  title: 'Private copy preview · alterward',
  robots: { index: false, follow: false },
};
export default function Page() {
  return <Experience />;
}
