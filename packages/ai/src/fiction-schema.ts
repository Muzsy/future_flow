// v9 request-schema compaction (plan: lasting cost root cause, 2026-10-21).
// zodTextFormat renders every z.uuid() as {"format":"uuid","pattern":"<178 B
// regex>"}; the v9 author and plan schemas carry 66 and 52 of them, a third of
// the schema bytes sent on every call. The server never relies on the model's
// copy of that regex: the provider parses every output with the full zod
// schema, so a malformed identifier still fails closed there.
//
// The pattern stays where the model MINTS an identifier (a property named
// `id` or `sceneId`: events, decisions, options, facts, scenes, threads and
// the asset/actor/opportunity records), because there the regex is the only
// shape guard decoding gets. Everywhere else the field copies an identifier
// that already exists in the request or earlier in the same output, so
// `format: uuid` is enough.
const MINTED_UUID_PROPERTIES = new Set(['id', 'sceneId']);

const FICTION_COMPACT_UUID_PROMPTS = /^life_fiction_(?:plan|author)\.v9\./;

export const fictionCompactUuidFor = (promptVersion?: string) =>
  promptVersion !== undefined &&
  FICTION_COMPACT_UUID_PROMPTS.test(promptVersion);

type JsonNode = { [key: string]: unknown };
const isNode = (value: unknown): value is JsonNode =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Removes `pattern` from copied uuid fields of a freshly rendered JSON schema,
// in place, and returns how many it removed. `property` is the name of the
// property the node sits under (array items inherit their parent's name).
export function stripCopiedUuidPatterns(
  node: unknown,
  property: string | undefined = undefined,
): number {
  if (Array.isArray(node))
    return node.reduce<number>(
      (n, item) => n + stripCopiedUuidPatterns(item, property),
      0,
    );
  if (!isNode(node)) return 0;
  let removed = 0;
  if (
    node.format === 'uuid' &&
    typeof node.pattern === 'string' &&
    !MINTED_UUID_PROPERTIES.has(property ?? '')
  ) {
    delete node.pattern;
    removed += 1;
  }
  if (isNode(node.properties))
    for (const [name, child] of Object.entries(node.properties))
      removed += stripCopiedUuidPatterns(child, name);
  for (const key of ['items', 'anyOf', 'oneOf', 'allOf'])
    if (node[key] !== undefined)
      removed += stripCopiedUuidPatterns(node[key], property);
  return removed;
}
