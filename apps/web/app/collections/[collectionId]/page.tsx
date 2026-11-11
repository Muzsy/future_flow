import type { Metadata } from 'next';
import { publicCollectionKeySchema } from '@future-flow/contracts';
import { CuratedLives } from '../../../components/curated-lives';
export const metadata: Metadata = {
  title: 'Life collections · alterward',
  description: 'Explore curated AI-generated lives and turning points.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function Page({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) {
  const parsed = publicCollectionKeySchema.safeParse(
    (await params).collectionId,
  );
  return <CuratedLives collectionId={parsed.success ? parsed.data : null} />;
}
