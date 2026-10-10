import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectExternalAvailability } from '../../scripts/lib/external-monitor.mjs';
const response = (path, change = {}) =>
  new Response(
    path.endsWith('export')
      ? JSON.stringify({ error: { code: 'AUTH_REQUIRED' } })
      : path.includes('privacy')
        ? '<h1>Privacy and your data</h1>'
        : '<h1>Account access</h1>',
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
    new Response(
      '<h1>Service unavailable</h1><footer>Account access · Privacy and your data</footer>',
      {
        headers: { 'content-type': 'text/html', 'cache-control': 'no-store' },
      },
    ),
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
test('rejects correct-looking content with wrong status or media type', async () => {
  for (const change of [
    { status: 500 },
    { headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } },
    {
      headers: {
        'content-type': 'text/html-fake',
        'cache-control': 'no-store',
      },
    },
  ]) {
    assert.equal(
      (
        await inspectExternalAvailability(async (url) =>
          response(url.pathname, change),
        )
      ).passed,
      false,
    );
  }
});
test('handles a fetch or body which aborts at the request deadline without exposing errors', async (t) => {
  const realTimeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    assert.equal(milliseconds, 10000);
    return realTimeout(5);
  });
  // Keep the test loop alive while the unref'ed timeout signals fire.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    for (const bodyHangs of [false, true]) {
      const proof = await inspectExternalAvailability(async (_url, init) => {
        if (!bodyHangs)
          return new Promise((_resolve, reject) => {
            init.signal.addEventListener(
              'abort',
              () => reject(Error('private-timeout-detail')),
              { once: true },
            );
          });
        return new Response(
          new ReadableStream({
            start(controller) {
              init.signal.addEventListener(
                'abort',
                () => controller.error(Error('private-body-detail')),
                { once: true },
              );
            },
          }),
        );
      });
      assert.equal(proof.passed, false);
      assert.equal(proof.checks.length, 3);
      assert(!JSON.stringify(proof).includes('private-'));
    }
  } finally {
    clearInterval(keepAlive);
  }
});
