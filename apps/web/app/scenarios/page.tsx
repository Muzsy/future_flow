import type { Metadata } from 'next';
import { parseScenarioDiscoveryWireQuery } from '@future-flow/contracts';
import { DiscoverScenarios } from '../../components/discover-scenarios';
export const metadata: Metadata = {
  title: 'Explore Scenarios · alterward',
  description:
    'Find a fictional starting situation for your own AI-generated life.',
  robots: { index: false, follow: false, noarchive: true },
  referrer: 'no-referrer',
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let query = null;
  try {
    query = parseScenarioDiscoveryWireQuery(await searchParams);
  } catch {
    /* Invalid or duplicated links fail closed. */
  }
  return <DiscoverScenarios query={query} />;
}
