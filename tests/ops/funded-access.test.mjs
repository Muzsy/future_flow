import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFundedAccess } from '../../scripts/lib/funded-access.mjs';
const secret = {
  accountId: 'a'.repeat(32),
  applicationId: '12345678-1234-1234-1234-123456789abc',
  token: 'synthetic-not-a-token',
};
function fixture(
  policy = {
    id: 'p',
    decision: 'allow',
    include: [{ email: { email: 'reader@example.invalid' } }],
    require: [],
    exclude: [],
  },
) {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    const result = url.includes('/policies?')
      ? [policy]
      : url.endsWith('/organizations')
        ? { auth_domain: 'fixture.cloudflareaccess.com' }
        : {
            id: secret.applicationId,
            type: 'self_hosted',
            domain: 'alterward.com',
            aud: 'b'.repeat(64),
          };
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          result,
          result_info: { total_pages: 1 },
        }),
    };
  };
  return { calls, request };
}
test('read-only fixed-origin requests project exact emails and bind all policy bytes', async () => {
  const f = fixture();
  const r = await readFundedAccess(secret, f.request);
  assert.deepEqual(r.allowedEmails, ['reader@example.invalid']);
  assert.match(r.configurationSha256, /^[a-f0-9]{64}$/);
  assert.equal(f.calls.length, 3);
  assert(
    f.calls.every(
      (c) =>
        c.options.method === 'GET' &&
        c.options.redirect === 'error' &&
        c.url.startsWith('https://api.cloudflare.com/client/v4/accounts/'),
    ),
  );
});
test('bypass, group and additional requirements fail closed', async () => {
  for (const policy of [
    { id: 'p', decision: 'bypass', include: [{ everyone: {} }] },
    { id: 'p', decision: 'allow', include: [{ group: { id: 'x' } }] },
    {
      id: 'p',
      decision: 'allow',
      include: [{ email: { email: 'reader@example.invalid' } }],
      require: [{ everyone: {} }],
    },
  ]) {
    const f = fixture(policy);
    await assert.rejects(readFundedAccess(secret, f.request));
  }
});
