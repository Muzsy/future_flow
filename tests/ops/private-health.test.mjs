import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProdHealth,
  normalizeMonitorCredentials,
} from '../../scripts/lib/private-health.mjs';

const now = Date.parse('2026-10-10T17:00:00Z');

test('normalizes CRLF and a missing final key newline before validation', () => {
  const key =
    '-----BEGIN OPENSSH PRIVATE KEY-----\nYWJj\n-----END OPENSSH PRIVATE KEY-----';
  for (const value of [key, key.replaceAll('\n', '\r\n')]) {
    const result = normalizeMonitorCredentials(
      '192.0.2.1',
      '192.0.2.1 ssh-ed25519 fixture\r\n',
      value,
    );
    assert.equal(result.key, key + '\n');
    assert.equal(result.pin, '192.0.2.1 ssh-ed25519 fixture');
  }
});
test('refuses additional host pins, option injection and malformed identities', () => {
  const key =
    '-----BEGIN OPENSSH PRIVATE KEY-----\nYWJj\n-----END OPENSSH PRIVATE KEY-----\n';
  for (const [host, pin, identity] of [
    ['-o', '-o ssh-ed25519 fixture', key],
    [
      '192.0.2.1',
      '192.0.2.1 ssh-ed25519 fixture\n192.0.2.2 ssh-ed25519 fixture',
      key,
    ],
    ['192.0.2.1', '192.0.2.2 ssh-ed25519 fixture', key],
    ['192.0.2.1', '192.0.2.1 ssh-ed25519 fixture', 'invalid'],
  ])
    assert.throws(() => normalizeMonitorCredentials(host, pin, identity));
});

const prod = () => ({
  schemaVersion: 'alterward-prod-health-1',
  checkedAt: '2026-10-10T17:00:00.123456+00:00',
  ok: true,
  checks: Object.fromEntries(
    [
      'containersHealthy',
      'diskSpaceHealthy',
      'originCertificateHealthy',
      'backupFresh',
      'restoreVerified',
      'serviceUsdQuiet',
    ].map((key) => [key, true]),
  ),
});

test('plan 055: accepts the new host projection with six fresh positive checks', () => {
  assert.equal(validateProdHealth(JSON.stringify(prod()), now).checksPassed, 6);
  assert.equal(validateProdHealth(JSON.stringify(prod()), now).checksPassed, 6);
});

test('plan 055: refuses a red, incomplete, extended or stale new host projection', () => {
  for (const name of Object.keys(prod().checks)) {
    const value = prod();
    value.checks[name] = false;
    assert.throws(() => validateProdHealth(JSON.stringify(value), now));
  }
  const empty = { ...prod(), ok: false, checks: {} };
  const extra = { ...prod(), checks: { ...prod().checks, more: true } };
  const field = { ...prod(), user: 'x' };
  const stale = { ...prod(), checkedAt: '2026-10-10T16:50:00+00:00' };
  for (const value of [empty, extra, field, stale, { ...prod(), ok: false }])
    assert.throws(() => validateProdHealth(JSON.stringify(value), now));
  assert.throws(() => validateProdHealth('not json', now));
});
