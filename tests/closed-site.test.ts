import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import {
  closedSiteConfigFromEnv,
  createClosedSiteGate,
  publicWebException,
  publicApiException,
} from '@future-flow/access';
import { NextRequest } from '../apps/web/node_modules/next/server';
import { externalWebConfig } from '../apps/web/lib/public-exposure';

const env = {
  CLOSED_SITE_ENABLED: 'true',
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'fixture.cloudflareaccess.com',
  CLOUDFLARE_ACCESS_AUD: 'a'.repeat(64),
  CLOSED_SITE_ALLOWED_EMAILS: 'owner@example.invalid',
};
let signing: CryptoKey, jwk: JWK, rotated: CryptoKey, rotatedJwk: JWK;
beforeAll(async () => {
  const pair = await generateKeyPair('RS256'),
    next = await generateKeyPair('RS256');
  signing = pair.privateKey;
  rotated = next.privateKey;
  jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: 'first',
    alg: 'RS256',
    use: 'sig',
  };
  rotatedJwk = {
    ...(await exportJWK(next.publicKey)),
    kid: 'next',
    alg: 'RS256',
    use: 'sig',
  };
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});
async function signed(
  claims: Record<string, unknown> = {},
  key?: CryptoKey,
  kid = 'first',
) {
  return new SignJWT({
    iss: 'https://fixture.cloudflareaccess.com',
    aud: env.CLOUDFLARE_ACCESS_AUD,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    sub: 'fixture-subject',
    email: 'owner@example.invalid',
    type: 'app',
    ...claims,
  })
    .setProtectedHeader({
      alg: 'RS256',
      kid,
      jku: 'https://attacker.invalid/certs',
    })
    .sign(key ?? signing);
}
function certs(keys: JWK[] = [jwk]) {
  return vi.fn<typeof fetch>(async (url) => {
    expect(String(url)).toBe(
      'https://fixture.cloudflareaccess.com/cdn-cgi/access/certs',
    );
    return Response.json({ keys });
  });
}
describe('closed-site origin proof', () => {
  it('rejects ambiguous flags and incomplete, arbitrary-host or URL-based configuration', () => {
    expect(closedSiteConfigFromEnv({})).toEqual({ enabled: false });
    for (const change of [
      { CLOSED_SITE_ENABLED: 'yes' },
      { CLOUDFLARE_ACCESS_TEAM_DOMAIN: '' },
      { CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'https://fixture.cloudflareaccess.com' },
      {
        CLOUDFLARE_ACCESS_TEAM_DOMAIN:
          'fixture.cloudflareaccess.com.attacker.invalid',
      },
      { CLOUDFLARE_ACCESS_TEAM_DOMAIN: '127.0.0.1' },
      { CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'fixture.cloudflareaccess.com/path' },
      { CLOUDFLARE_ACCESS_AUD: '' },
      { CLOUDFLARE_ACCESS_AUD: 'anything' },
      { CLOSED_SITE_ALLOWED_EMAILS: '' },
      {
        CLOSED_SITE_ALLOWED_EMAILS:
          'owner@example.invalid,OWNER@example.invalid',
      },
      {
        CLOSED_SITE_ALLOWED_EMAILS: Array.from(
          { length: 12 },
          (_, i) => `user${i}@example.invalid`,
        ).join(','),
      },
    ])
      expect(() => closedSiteConfigFromEnv({ ...env, ...change })).toThrow();
  });
  it('verifies real RSA signatures, pinned issuer/audience and mandatory time/user claims', async () => {
    const transport = certs(),
      gate = createClosedSiteGate(env, transport);
    expect(await gate.verify(await signed())).toBe(true);
    for (const claims of [
      { iss: 'https://attacker.invalid' },
      { aud: 'b'.repeat(64) },
      { exp: Math.floor(Date.now() / 1000) - 1 },
      { exp: undefined },
      { iat: undefined },
      { iat: Math.floor(Date.now() / 1000) + 100 },
      { nbf: Math.floor(Date.now() / 1000) + 100 },
      { sub: undefined },
      { email: undefined },
      { email: '' },
      { email: 'revoked@example.invalid' },
      { type: 'service' },
    ])
      expect(await gate.verify(await signed(claims))).toBe(false);
    expect(await gate.verify(await signed({}, rotated))).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('does not accept unsigned, oversized, duplicate or malformed assertions and never trusts email headers', async () => {
    const transport = certs(),
      gate = createClosedSiteGate(env, transport);
    const unsigned =
      Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url') +
      '.' +
      Buffer.from('{}').toString('base64url') +
      '.';
    for (const value of [
      undefined,
      '',
      'x'.repeat(16385),
      unsigned,
      'owner@example.invalid',
      'a.b.c',
      (await signed()) + ',other',
    ])
      expect(await gate.verify(value)).toBe(false);
  });
  it('rejects a still-unexpired signed token once its identity is removed from the new origin configuration', async () => {
    const token = await signed(),
      transport = certs();
    const previous = createClosedSiteGate(env, transport);
    const restarted = createClosedSiteGate(
      { ...env, CLOSED_SITE_ALLOWED_EMAILS: 'new-owner@example.invalid' },
      transport,
    );
    expect(await previous.verify(token)).toBe(true);
    expect(await restarted.verify(token)).toBe(false);
    expect(
      await createClosedSiteGate(
        { ...env, CLOSED_SITE_ALLOWED_EMAILS: ' OWNER@EXAMPLE.INVALID ' },
        transport,
      ).verify(token),
    ).toBe(true);
  });
  it('refreshes rotated keys after cooldown, retains cached valid keys, and denies unavailable keys', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    let keys = [jwk];
    const transport = vi.fn<typeof fetch>(async () => Response.json({ keys }));
    const gate = createClosedSiteGate(env, transport);
    expect(await gate.verify(await signed())).toBe(true);
    keys = [jwk, rotatedJwk];
    vi.setSystemTime(Date.now() + 31000);
    expect(await gate.verify(await signed({}, rotated, 'next'))).toBe(true);
    expect(transport).toHaveBeenCalledTimes(2);
    transport.mockRejectedValue(Error('Unavailable'));
    expect(await gate.verify(await signed())).toBe(true);
    vi.setSystemTime(Date.now() + 301000);
    expect(await gate.verify(await signed())).toBe(false);
    expect(
      await createClosedSiteGate(env, transport).verify(await signed()),
    ).toBe(false);
  });
  it('allows only exact own-rights endpoints and inert assets, without method or prefix bypasses', () => {
    expect(publicApiException('GET', '/api/v1/me/export')).toBe(true);
    expect(publicApiException('DELETE', '/api/v1/me')).toBe(true);
    for (const [method, path] of [
      ['GET', '/api/v1/me'],
      ['GET', '/api/v1/me/consent'],
      ['POST', '/api/v1/me/consent'],
      ['POST', '/api/v1/me/export'],
      ['POST', '/api/v1/me'],
      ['GET', '/api/v1/me/export/other'],
      ['GET', '/api/v1/me/export/'],
      ['GET', '/api/public/discover'],
      ['OPTIONS', '/api/public/discover'],
    ])
      expect(publicApiException(method!, path!)).toBe(false);
    expect(publicWebException('GET', '/account-access')).toBe(true);
    expect(publicWebException('GET', '/_next/static/chunks/example.js')).toBe(
      true,
    );
    for (const path of [
      '/login',
      '/settings',
      '/discover',
      '/account-access/story',
      '/privacy-notice/',
      '/terms/',
      '/Terms',
      '/terms/story',
      '/terms/../login',
      '/_next/image',
      '/_next/data/build/discover.json',
      '/_next/static/%2e%2e/data',
      '/sitemap.xml',
      '/share-preview/story',
    ])
      expect(publicWebException('GET', path)).toBe(false);
    expect(publicWebException('POST', '/account-access')).toBe(false);
    expect(publicWebException('GET', '/terms')).toBe(true);
    expect(publicWebException('HEAD', '/terms')).toBe(true);
    expect(publicWebException('POST', '/terms')).toBe(false);
    expect(
      externalWebConfig({
        ...env,
        PUBLIC_EXTERNAL_EXPOSURE_ENABLED: 'true',
        PUBLIC_SITE_URL: 'https://alterward.com',
        API_INTERNAL_URL: 'http://api:4000/api/public',
      }),
    ).toBeNull();
  });
});
describe('Next origin gate', () => {
  it('denies content and RSC/spoofed internal requests, exposes only rights, and admits a signed identity without leaking its token', async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.stubGlobal('fetch', certs());
    const { proxy } = await import('../apps/web/proxy');
    for (const path of [
      '/',
      '/discover',
      '/lives/story',
      '/sitemap.xml',
      '/share-preview/story',
      '/_next/image?url=/lives/story',
    ]) {
      const response = await proxy(
        new NextRequest('http://127.0.0.1:3000' + path, {
          headers: {
            Host: 'alterward.com',
            'cf-access-authenticated-user-email': 'owner@example.invalid',
            'x-middleware-subrequest': 'proxy:proxy:proxy:proxy:proxy',
            RSC: '1',
          },
        }),
      );
      expect(response.status, path).toBe(403);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(await response.text()).not.toContain('owner@example.invalid');
    }
    for (const path of [
      '/account-access',
      '/privacy-notice',
      '/terms',
      '/healthz',
      '/_next/static/chunks/example.js',
    ])
      expect(
        (
          await proxy(new NextRequest('http://127.0.0.1:3000' + path))
        ).headers.get('x-middleware-next'),
      ).toBe('1');
    const token = await signed();
    const accepted = await proxy(
      new NextRequest('http://127.0.0.1:3000/discover', {
        headers: { 'cf-access-jwt-assertion': token },
      }),
    );
    expect(accepted.headers.get('x-middleware-next')).toBe('1');
    expect(accepted.headers.get('cf-access-jwt-assertion')).toBeNull();
    expect(await accepted.text()).not.toContain(token);
  });
});
