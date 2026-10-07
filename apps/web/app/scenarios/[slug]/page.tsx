import type { Metadata } from 'next';
import { ScenarioReader } from '../../../components/scenario-reader';
export const metadata: Metadata = {
  title: 'Scenario | alterward',
  robots: { index: false, follow: false, noarchive: true },
  referrer: 'no-referrer',
};
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ScenarioReader slug={slug} />;
}
