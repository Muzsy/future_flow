// The SDK defaults missing pagination headers to zero/null. A short HTTP page
// alone cannot attest completeness; compare against the read-only DB snapshot.
export function assertCompleteAuthInventory(
  apiIds: ReadonlySet<string>,
  databaseIds: string[],
) {
  const databaseSet = new Set(databaseIds);
  if (
    databaseSet.size !== databaseIds.length ||
    databaseSet.size !== apiIds.size ||
    databaseIds.some((id) => !apiIds.has(id))
  )
    throw Error('Auth inventory changed or is incomplete; retry separately');
}
