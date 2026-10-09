import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { connectDatabase } from '@future-flow/database';

// Runs only inside the isolated API container; contains no live credentials.
const ca = readFileSync('/run/secrets/supabase-ca.crt');
const headers = {
  'cf-access-jwt-assertion': 'invalid.assertion.value',
  'cf-access-authenticated-user-email': 'owner@example.invalid',
  'x-middleware-subrequest': 'proxy:proxy:proxy:proxy:proxy',
};
function request(path, method = 'GET', hostname = 'localhost') {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: 'smoke-proxy',
        port: 443,
        // Keep the fixture's configured SNI so a negative identity probe tests
        // the client certificate check, rather than Caddy's unknown-SNI policy.
        servername: 'localhost',
        checkServerIdentity: (_servername, certificate) =>
          checkServerIdentity(hostname, certificate),
        agent: false,
        path,
        method,
        ca,
        rejectUnauthorized: true,
        headers: { ...headers, host: 'localhost' },
        timeout: 5000,
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body,
          }),
        );
      },
    );
    req.on('timeout', () => req.destroy(Error('Fixture request timed out')));
    req.on('error', reject);
    req.end();
  });
}
let ready = false;
for (let attempt = 0; attempt < 20; attempt++) {
  try {
    if ((await request('/healthz')).status === 200) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert(ready, 'Isolated HTTPS proxy did not become ready');
let denied = 0;
for (const [method, path] of [
  ['GET', '/'],
  ['GET', '/discover'],
  ['GET', '/scenarios'],
  ['GET', '/sitemap.xml'],
  ['GET', '/account-access/extra'],
  ['POST', '/account-access'],
  ['GET', '/api/public/discovery'],
  ['GET', '/api/public/config'],
  ['GET', '/api/v1/me'],
  ['POST', '/api/v1/me/export'],
  ['GET', '/api/v1/me/export/'],
]) {
  const response = await request(path, method);
  assert.equal(response.status, 403, `${method} ${path}`);
  assert.match(response.headers['cache-control'], /no-store/);
  denied++;
}
let rightsPages = 0;
let assets = 0;
for (const path of ['/account-access', '/privacy-notice']) {
  const response = await request(path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers['cache-control'], /no-store/);
  assert.match(response.headers['x-robots-tag'], /noindex/);
  if (path === '/account-access') {
    const paths = [
      ...new Set(
        [...response.body.matchAll(/(?:src|href)="([^" ]+)"/g)]
          .map((match) => match[1])
          .filter((asset) => asset.startsWith('/_next/static/')),
      ),
    ];
    assert(paths.length > 0, 'Rights UI must have actual build assets');
    for (const asset of paths.slice(0, 3)) {
      assert.equal((await request(asset)).status, 200, asset);
      assets++;
    }
  }
  rightsPages++;
}
let authRequired = 0;
for (const [method, path] of [
  ['GET', '/api/v1/me/export'],
  ['DELETE', '/api/v1/me'],
]) {
  assert.equal((await request(path, method)).status, 401, path);
  authRequired++;
}
await assert.rejects(
  request('/healthz', 'GET', 'unrelated.invalid'),
  (error) => error.code === 'ERR_TLS_CERT_ALTNAME_INVALID',
);
const db = connectDatabase(process.env.DATABASE_URL, true);
try {
  const tls = await db.query(
    'SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()',
  );
  assert.equal(tls[0].ssl, true);
  const migrations = await db.query(
    'SELECT count(*)::int AS count FROM ff_migrations',
  );
  assert.equal(migrations[0].count, 36);
  console.log(
    JSON.stringify({
      denied,
      rightsPages,
      staticAssets: assets,
      ownRightsRequireAuth: authRequired,
      tlsHostnameMismatchRejected: true,
      migrations: migrations[0].count,
      databaseTls: true,
    }),
  );
} finally {
  await db.close();
}
