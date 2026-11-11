import { storyMetadata } from '../../../lib/public-exposure';
import { OfficialPublicationReader } from '../../../components/official-publication-reader';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return slug.startsWith('official-') ? storyMetadata(slug) : storyMetadata('');
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <OfficialPublicationReader slug={slug} />;
}
