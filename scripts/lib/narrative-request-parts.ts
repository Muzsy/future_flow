// Splits the bytes of one provider request (the exact parameters the provider
// serialises) into the system prompt, the output schema and the user message,
// the user message by top-level key and `narrativeContext` by key. The parts
// always add up to the serialized request: `envelope` is whatever the three
// measured parts do not account for (the JSON wrapper and the escaping of the
// two strings inside it), so nothing is lost and nothing is counted twice.
// Diagnostics only: no gate or request depends on it.
type Json = Record<string, unknown>;

const bytes = (value: unknown) =>
  Buffer.byteLength(
    typeof value === 'string' ? value : JSON.stringify(value ?? null),
    'utf8',
  );
const sizes = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value as Json).map(([k, v]) => [k, bytes(v)]),
      )
    : {};

export type RequestParts = {
  // Bytes of JSON.stringify(parameters): what the production guard measures.
  total: number;
  system: number;
  schema: number;
  // The user message as text, before it is escaped into the request.
  user: number;
  // total - system - schema - user: the wrapper and the string escaping.
  envelope: number;
  userKeys: Record<string, number>;
  narrativeContext: Record<string, number>;
};

export function requestParts(parameters: unknown): RequestParts {
  const request = (parameters ?? {}) as {
    input?: { role?: string; content?: unknown }[];
    text?: unknown;
  };
  const messages = Array.isArray(request.input) ? request.input : [];
  const content = (role: string) =>
    messages.find((m) => m.role === role)?.content;
  const system = content('system'),
    user = content('user');
  let parsed: Json = {};
  if (typeof user === 'string')
    try {
      const value = JSON.parse(user) as unknown;
      if (value && typeof value === 'object') parsed = value as Json;
    } catch {
      // a user message that is not JSON has no keys to split
    }
  const total = bytes(parameters),
    systemBytes = system === undefined ? 0 : bytes(system),
    schemaBytes = request.text === undefined ? 0 : bytes(request.text),
    userBytes = user === undefined ? 0 : bytes(user);
  return {
    total,
    system: systemBytes,
    schema: schemaBytes,
    user: userBytes,
    envelope: total - systemBytes - schemaBytes - userBytes,
    userKeys: sizes(parsed),
    narrativeContext: sizes(parsed.narrativeContext),
  };
}
