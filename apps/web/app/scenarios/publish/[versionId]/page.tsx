import type { Metadata } from 'next';
import { ScenarioPublicationConfirm } from '../../../../components/scenario-publication-confirm';
export const metadata: Metadata = {
  title: 'Publish scenario | alterward',
  robots: { index: false, follow: false, noarchive: true },
  referrer: 'no-referrer',
};
export default async function Page({
  params,
}: {
  params: Promise<{ versionId: string }>;
}) {
  const { versionId } = await params;
  return <ScenarioPublicationConfirm versionId={versionId} />;
}
