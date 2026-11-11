import type { Metadata } from 'next';
import { parseSavedLivesWireQuery } from '@future-flow/contracts';
import { SavedLives } from '../../components/saved-lives';
export const metadata: Metadata = {
  title: 'Saved lives · alterward',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let page: number | null = null;
  try {
    page = parseSavedLivesWireQuery(await searchParams).page;
  } catch {
    /* Invalid query is an English notice, never a broad fallback fetch. */
  }
  return <SavedLives page={page} />;
}
