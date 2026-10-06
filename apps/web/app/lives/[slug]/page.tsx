import type { Metadata } from 'next';
import { PublicationReader } from '../../../components/publication-reader';
export const metadata: Metadata = {
  title: 'Community life · alterward',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PublicationReader slug={slug} />;
}
