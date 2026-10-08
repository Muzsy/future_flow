import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

// Production Next HTTP proof, on loopback with synthetic configuration and no
// browser execution, live database, provider credentials or paid calls.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reserve = createServer();
await new Promise((done) => reserve.listen(0, '127.0.0.1', done));
const port = reserve.address().port;
await new Promise((done) => reserve.close(done));
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    [
      'path',
      'systemroot',
      'windir',
      'temp',
      'tmp',
      'home',
      'userprofile',
    ].includes(key.toLowerCase()),
  ),
);
Object.assign(env, {
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
  CLOSED_SITE_ENABLED: 'true',
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'fixture.cloudflareaccess.com',
  CLOUDFLARE_ACCESS_AUD: 'a'.repeat(64),
  CLOSED_SITE_ALLOWED_EMAILS: 'owner@example.invalid',
  PUBLIC_EXTERNAL_EXPOSURE_ENABLED: 'false',
});
const server = spawn(
  process.execPath,
  [
    resolve(root, 'apps/web/node_modules/next/dist/bin/next'),
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ],
  {
    cwd: resolve(root, 'apps/web'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
);
let diagnostics = '',
  exited = false;
server.once('exit', () => {
  exited = true;
});
server.once('error', (error) => {
  diagnostics = error.message;
  exited = true;
});
for (const stream of [server.stdout, server.stderr])
  stream.on('data', (chunk) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-4000);
  });
const base = `http://127.0.0.1:${port}`;
const request = (path, options = {}) =>
  fetch(base + path, {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(3000),
  });
let checks = 0;
try {
  let ready = false;
  for (let attempt = 0; attempt < 50 && !exited; attempt++) {
    try {
      if ((await request('/healthz')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await setTimeout(200);
  }
  assert(ready, 'Production web failed to become healthy: ' + diagnostics);
  for (const path of [
    '/',
    '/login',
    '/settings',
    '/discover',
    '/scenarios',
    '/lives/fixture',
    '/official-lives/fixture',
    '/share-preview/fixture',
    '/sitemap.xml',
    '/_next/image?url=%2Fdiscover&w=640&q=75',
  ]) {
    const response = await request(path, {
      headers: {
        'cf-access-authenticated-user-email': 'owner@example.invalid',
        'cf-access-jwt-assertion': 'invalid.assertion.value',
        'x-forwarded-host': 'alterward.com',
        'x-middleware-subrequest': 'proxy:proxy:proxy:proxy:proxy',
        'x-nextjs-data': '1',
        RSC: '1',
      },
    });
    assert.equal(response.status, 403, path);
    assert.match(response.headers.get('Cache-Control'), /no-store/, path);
    assert.match(
      response.headers.get('Cloudflare-CDN-Cache-Control'),
      /no-store/,
      path,
    );
    assert.match(await response.text(), /Access is by invitation/, path);
    checks++;
  }
  for (const path of ['/account-access', '/privacy-notice']) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert(
      !html.includes('Start a new life branch.'),
      'Full application exposed by rights exception',
    );
    assert(
      html.includes(
        path === '/account-access' ? 'Account access' : 'Privacy and your data',
      ),
      path,
    );
    assert.match(response.headers.get('Cache-Control'), /no-store/, path);
    checks++;
    if (path === '/account-access') {
      const assets = [
        ...html.matchAll(
          /(?:src|href)="([^"?]*\/_next\/static\/[^"?]+)(?:\?[^"\s]*)?"/g,
        ),
      ];
      assert(assets.length > 0, 'Rights page build assets not found');
      for (const extension of ['.js', '.css']) {
        const asset = assets.find((item) => item[1].endsWith(extension));
        assert(asset, 'Rights asset not found: ' + extension);
        assert.equal((await request(asset[1])).status, 200, asset[1]);
        checks++;
      }
    }
  }
  const health = await request('/healthz');
  const spoofedHeaders = {
    'x-matched-path': '/discover',
    'x-invoke-path': '/discover',
    'next-url': '/discover',
    RSC: '1',
    'next-router-prefetch': '1',
  };
  let spoofedRights = await request('/account-access', {
    headers: spoofedHeaders,
  });
  // Next normalizes RSC prefetch requests by adding its cache-busting query.
  // A normalization redirect must stay on this exact rights route and origin.
  for (
    let redirect = 0;
    redirect < 3 && spoofedRights.status === 307;
    redirect++
  ) {
    const target = new URL(spoofedRights.headers.get('Location'), base);
    assert.equal(target.origin, base);
    assert.equal(target.pathname, '/account-access');
    spoofedRights = await request(target.pathname + target.search, {
      headers: spoofedHeaders,
    });
  }
  assert.equal(spoofedRights.status, 200);
  const rightsRsc = await spoofedRights.text();
  assert(
    rightsRsc.includes('account-access') && !rightsRsc.includes('Experience'),
    'Unexpected rights prefetch projection: ' + rightsRsc.slice(0, 1600),
  );
  checks++;
  assert.deepEqual(await health.json(), { status: 'ok' });
  checks++;
  for (const path of ['/account-access/story', '/privacy-notice/story']) {
    assert.equal((await request(path)).status, 403, path);
    checks++;
  }
  assert.equal(
    (await request('/account-access', { method: 'POST' })).status,
    403,
  );
  checks++;
  console.log(
    `Closed-site production web: ${checks} HTTP checks passed; no live credentials or paid calls.`,
  );
} finally {
  if (!exited) {
    server.kill('SIGTERM');
    for (let attempt = 0; attempt < 20 && !exited; attempt++)
      await setTimeout(100);
    if (!exited) server.kill('SIGKILL');
  }
}
