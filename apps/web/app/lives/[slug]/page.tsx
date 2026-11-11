import { storyMetadata } from '../../../lib/public-exposure';
import { PublicationReader } from '../../../components/publication-reader';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return slug.startsWith('life-') ? storyMetadata(slug) : storyMetadata('');
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PublicationReader slug={slug} />;
}
