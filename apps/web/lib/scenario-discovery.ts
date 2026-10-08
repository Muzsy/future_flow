import {
  scenarioDiscoveryQuerySchema,
  scenarioDiscoveryCardSchema,
  scenarioDiscoveryPageSchema,
  type ScenarioDiscoveryQuery,
  type ScenarioDiscoveryCard,
} from '@future-flow/contracts';
export function scenarioDiscoverySearch(raw: ScenarioDiscoveryQuery) {
  const query = scenarioDiscoveryQuerySchema.parse(raw),
    params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.page !== 1) params.set('page', String(query.page));
  if (query.pageSize !== 12) params.set('pageSize', String(query.pageSize));
  return params.toString();
}
export function scenarioDiscoveryPageLink(
  query: ScenarioDiscoveryQuery,
  page: number,
) {
  const search = scenarioDiscoverySearch({ ...query, page });
  return '/scenarios' + (search ? '?' + search : '');
}
export function scenarioDiscoveryReaderLink(raw: ScenarioDiscoveryCard) {
  return '/scenarios/' + scenarioDiscoveryCardSchema.parse(raw).slug;
}
export function verifiedScenarioDiscoveryPage(
  raw: unknown,
  query: ScenarioDiscoveryQuery,
) {
  const expected = scenarioDiscoveryQuerySchema.parse(query),
    page = scenarioDiscoveryPageSchema.parse(raw);
  if (page.page !== expected.page || page.pageSize !== expected.pageSize)
    throw Error('Wrong Scenario page');
  return page;
}
