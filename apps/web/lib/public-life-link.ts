import { publicLifeSlugSchema } from '@future-flow/contracts';
export function publicLifePath(rawSlug: unknown) {
  const slug = publicLifeSlugSchema.parse(rawSlug);
  return `/${slug.startsWith('official-') ? 'official-lives' : 'lives'}/${slug}`;
}
export function publicLifeShareUrl(origin: string, rawSlug: unknown) {
  const base = new URL(origin);
  if (
    !['https:', 'http:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.origin !== origin
  )
    throw Error('Invalid public site origin');
  return new URL(publicLifePath(rawSlug), base).href;
}
