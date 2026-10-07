import {
  publicationSlugSchema,
  officialPublicationSlugSchema,
  publicScenarioSlugSchema,
} from '@future-flow/contracts';
// Only a public reader route can survive login. Never accept origins, tokens or arbitrary paths.
export function publicReturnPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const match = /^\/(lives|official-lives|scenarios)\/([^/?#\\]+)$/.exec(raw);
  if (!match) return null;
  const schema =
    match[1] === 'scenarios'
      ? publicScenarioSlugSchema
      : match[1] === 'lives'
        ? publicationSlugSchema
        : officialPublicationSlugSchema;
  return schema.safeParse(match[2]).success ? raw : null;
}
export function publicLoginHref(slug: string) {
  const path = publicReturnPath(
    `/${slug.startsWith('scenario-') ? 'scenarios' : slug.startsWith('official-') ? 'official-lives' : 'lives'}/${slug}`,
  );
  return path ? '/login?returnTo=' + encodeURIComponent(path) : '/login';
}
