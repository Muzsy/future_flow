import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePrivateHealth } from '../../scripts/lib/private-health.mjs';

const source = 'a'.repeat(64),
  now = Date.parse('2026-10-10T17:00:00Z');
const fixture = () => ({
  schemaVersion: 'alterward-private-health-1',
  checkedAt: '2026-10-10T17:00:00+00:00',
  sourceSha256: source,
  ok: true,
  checks: Object.fromEntries(
    [
      'sourceBindingCurrent',
      'monitorRecordCurrent',
      'backupRecordCurrent',
      'workerRuntimeHealthy',
      'databaseTlsHealthy',
      'accessBoundaryClosed',
      'backupFresh',
      'diskSpaceHealthy',
      'originCertificateHealthy',
    ].map((key) => [key, true]),
  ),
});
test('accepts exactly nine fresh source-bound positive checks', () => {
  assert.equal(
    validatePrivateHealth(JSON.stringify(fixture()), source, now).checksPassed,
    9,
  );
});
test('each unhealthy bit and false ok fail', () => {
  for (const key of Object.keys(fixture().checks)) {
    const value = fixture();
    value.checks[key] = false;
    assert.throws(() =>
      validatePrivateHealth(JSON.stringify(value), source, now),
    );
  }
  const value = fixture();
  value.ok = false;
  assert.throws(() =>
    validatePrivateHealth(JSON.stringify(value), source, now),
  );
});
test('refuses missing, extra, falsely typed and private fields', () => {
  for (const mutate of [
    (v) => delete v.checks.backupFresh,
    (v) => {
      v.checks.backupFresh = 1;
    },
    (v) => {
      v.privateData = 'secret';
    },
    (v) => {
      v.checks.other = true;
    },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(() =>
      validatePrivateHealth(JSON.stringify(value), source, now),
    );
  }
});
test('refuses stale, future and non-UTC timestamps', () => {
  for (const stamp of [
    '2026-10-10T16:54:59Z',
    '2026-10-10T17:05:01Z',
    '2026-10-10T19:00:00+02:00',
    'invalid',
  ]) {
    const value = fixture();
    value.checkedAt = stamp;
    assert.throws(() =>
      validatePrivateHealth(JSON.stringify(value), source, now),
    );
  }
});
test('refuses source mismatch and bounded or invalid envelopes', () => {
  assert.throws(() =>
    validatePrivateHealth(JSON.stringify(fixture()), 'b'.repeat(64), now),
  );
  for (const raw of ['x'.repeat(16385), '{}', 'null', '[]', '{'])
    assert.throws(() => validatePrivateHealth(raw, source, now));
});
