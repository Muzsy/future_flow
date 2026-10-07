import {
  publicScenarioReaderSchema,
  publicScenarioPreviewSchema,
  personalScenarioPreviewSchema,
  scenarioPublicationSourceSchema,
  type PublicScenarioReader,
  type ScenarioPersonalProfile,
  type ScenarioPublicationSource,
} from '@future-flow/contracts';
import { publicContentHash, canonicalPublicContent } from './public-content';

export async function verifiedScenarioReader(raw: unknown, slug: string) {
  const value = publicScenarioReaderSchema.parse(raw);
  if (
    value.slug !== slug ||
    value.templateHash !== (await publicContentHash(value.template))
  )
    throw Error('Scenario changed');
  return value;
}
export async function verifiedScenarioSource(raw: unknown, versionId: string) {
  const value = scenarioPublicationSourceSchema.parse(raw);
  if (
    value.scenarioVersionId !== versionId ||
    value.templateHash !== (await publicContentHash(value.template))
  )
    throw Error('Scenario changed');
  return value;
}
export async function verifiedScenarioPublicationPreview(
  raw: unknown,
  source: ScenarioPublicationSource,
  allow: boolean,
) {
  const value = publicScenarioPreviewSchema.parse(raw),
    { previewHash, ...body } = value;
  if (
    value.scenarioVersionId !== source.scenarioVersionId ||
    value.sourceGrantId !== source.sourceGrantId ||
    value.templateHash !== source.templateHash ||
    value.allowPersonalization !== allow ||
    canonicalPublicContent(value.template) !==
      canonicalPublicContent(source.template) ||
    previewHash !== (await publicContentHash(body))
  )
    throw Error('Review the current Scenario');
  return value;
}
export async function verifiedPersonalScenarioPreview(
  raw: unknown,
  source: PublicScenarioReader,
  profile: ScenarioPersonalProfile,
) {
  const value = personalScenarioPreviewSchema.parse(raw),
    { previewHash, ...body } = value;
  const { previewHash: compositionHash, ...composition } = value.composition;
  if (
    value.sourceSlug !== source.slug ||
    value.templateHash !== source.templateHash ||
    value.profileHash !== (await publicContentHash(profile)) ||
    canonicalPublicContent(value.profile) !== canonicalPublicContent(profile) ||
    value.composition.templateHash !== source.templateHash ||
    value.composition.profileHash !== value.profileHash ||
    compositionHash !== (await publicContentHash(composition)) ||
    previewHash !== (await publicContentHash(body))
  )
    throw Error('Review your changed starting context');
  return value;
}
export function scenarioPublicApi(path: string, signal?: AbortSignal) {
  const base = (
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'
  ).replace(/\/v[12]\/?$/, '/public');
  return fetch(base + path, {
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal,
  }).then(async (response) => {
    if (!response.ok) throw Error('Scenario unavailable');
    return response.json() as Promise<unknown>;
  });
}
