import {
  publicCollectionTitles,
  type PublicCollectionKey,
} from '@future-flow/contracts';
export function CollectionNavigation({
  current,
}: {
  current?: PublicCollectionKey;
}) {
  return (
    <nav className="header-actions" aria-label="Life collections">
      <a href="/discover">All lives</a>
      <a href="/scenarios">Explore Scenarios</a>
      <a href="/discover?classification=official">Official lives</a>
      {(Object.keys(publicCollectionTitles) as PublicCollectionKey[]).map(
        (key) => (
          <a
            key={key}
            href={'/collections/' + key}
            aria-current={key === current ? 'page' : undefined}
          >
            {publicCollectionTitles[key]}
          </a>
        ),
      )}
    </nav>
  );
}
