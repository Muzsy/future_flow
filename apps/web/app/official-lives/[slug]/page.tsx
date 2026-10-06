import type { Metadata } from 'next';
import { OfficialPublicationReader } from '../../../components/official-publication-reader';
export const metadata: Metadata = {
  title: 'Official life · alterward',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <OfficialPublicationReader slug={slug} />;
}
