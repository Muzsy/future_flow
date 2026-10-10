import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectExternalAvailability } from '../../scripts/lib/external-monitor.mjs';
const response = (path, change = {}) =>
  new Response(
    path.endsWith('export')
      ? JSON.stringify({ error: { code: 'AUTH_REQUIRED' } })
      : path.includes('privacy')
        ? 'Privacy and your data'
        : 'Account access',
    {
      status: path.endsWith('export') ? 401 : 200,
      headers: {
        'content-type': path.endsWith('export')
          ? 'application/json'
          : 'text/html',
        'cache-control': 'private, no-store',
        ...change.headers,
      },
      ...change,
    },
  );
test('checks both web and API without cookies/authentication or redirect following', async () => {
  const calls = [];
  const proof = await inspectExternalAvailability(async (url, init) => {
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'manual');
    assert(!init.headers.Authorization);
    calls.push(url.pathname);
    return response(url.pathname);
  });
  assert.equal(proof.passed, true);
  assert.equal(calls.length, 3);
  assert.equal(proof.workerOrDatabaseHealthVerified, false);
});
test('rejects a Cloudflare login redirect and a plausible HTTP 200 generic page', async () => {
  for (const fake of [
    new Response(null, {
      status: 302,
      headers: { location: 'https://login.example.invalid' },
    }),
    new Response('Welcome', {
      headers: { 'content-type': 'text/html', 'cache-control': 'no-store' },
    }),
  ]) {
    assert.equal(
      (await inspectExternalAvailability(async () => fake.clone())).passed,
      false,
    );
  }
});
test('rejects cached/unguarded replies and unexpected authenticated payload', async () => {
  for (const headers of [
    { 'cf-cache-status': 'HIT' },
    { 'cache-control': 'public, max-age=600' },
  ]) {
    assert.equal(
      (
        await inspectExternalAvailability(async (url) =>
          response(url.pathname, { headers }),
        )
      ).passed,
      false,
    );
  }
  const proof = await inspectExternalAvailability(async (url) =>
    url.pathname.endsWith('export')
      ? new Response(
          JSON.stringify({
            error: { code: 'AUTH_REQUIRED' },
            stories: ['private'],
          }),
          {
            status: 401,
            headers: {
              'content-type': 'application/json',
              'cache-control': 'no-store',
            },
          },
        )
      : response(url.pathname),
  );
  assert.equal(proof.passed, false);
});
test('reports only fixed failure metadata for errors and oversized response bodies', async () => {
  for (const fetcher of [
    async () => {
      throw Error('secret-provider-error');
    },
    async () => new Response('private'.repeat(100000)),
  ]) {
    const proof = await inspectExternalAvailability(fetcher);
    assert.equal(proof.passed, false);
    assert(!JSON.stringify(proof).includes('secret-provider-error'));
    assert(!JSON.stringify(proof).includes('private'));
  }
});
test('refuses credential-bearing and non-HTTPS targets', async () => {
  for (const origin of [
    'http://example.invalid',
    'https://user:secret@example.invalid',
    'https://example.invalid/?key=secret',
    'https://example.invalid/path',
  ]) {
    await assert.rejects(
      inspectExternalAvailability(async () => {
        throw Error('must not fetch');
      }, origin),
    );
  }
});
