import type { Metadata } from 'next';
import { parseDiscoveryWireQuery } from '@future-flow/contracts';
import { DiscoverLives } from '../../components/discover-lives';
export const metadata: Metadata = {
  title: 'Discover lives · alterward',
  description:
    'Explore AI-generated lives, the choices they faced, and what came next.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsed = await searchParams;
  let query = null;
  try {
    query = parseDiscoveryWireQuery(parsed);
  } catch {
    /* Invalid links fail closed. */
  }
  return <DiscoverLives query={query} />;
}
