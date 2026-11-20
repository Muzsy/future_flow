import { storyMetadata } from '../../../lib/public-exposure';
import { OfficialPublicationReader } from '../../../components/official-publication-reader';
import { signupUiAllowed } from '../../../lib/signup';
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
  return (
    <OfficialPublicationReader slug={slug} allowSignup={signupUiAllowed()} />
  );
}
