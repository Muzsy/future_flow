import {
  discoveryQuerySchema,
  discoveryCardSchema,
  publicCategorySchema,
  type DiscoveryQuery,
  type DiscoveryCard,
} from '@future-flow/contracts';

export const discoveryCategories = publicCategorySchema.options.map(
  (value) => ({
    value,
    label: value.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase()),
  }),
);
export function discoverySearch(raw: DiscoveryQuery) {
  const query = discoveryQuerySchema.parse(raw),
    params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.category) params.set('category', query.category);
  if (query.classification !== 'all')
    params.set('classification', query.classification);
  if (query.page !== 1) params.set('page', String(query.page));
  if (query.pageSize !== 12) params.set('pageSize', String(query.pageSize));
  return params.toString();
}
export function discoveryPageLink(query: DiscoveryQuery, page: number) {
  const search = discoverySearch({ ...query, page });
  return '/discover' + (search ? '?' + search : '');
}
export function discoveryLifeLink(raw: DiscoveryCard) {
  const card = discoveryCardSchema.parse(raw);
  return `/${card.classification === 'official' ? 'official-lives' : 'lives'}/${card.slug}`;
}
