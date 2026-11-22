const checks = [
  'sourceBindingCurrent',
  'monitorRecordCurrent',
  'backupRecordCurrent',
  'workerRuntimeHealthy',
  'databaseTlsHealthy',
  'accessBoundaryClosed',
  'backupFresh',
  'diskSpaceHealthy',
  'originCertificateHealthy',
];

export function normalizeMonitorCredentials(host, pin, key) {
  if ([host, pin, key].some((value) => typeof value !== 'string'))
    throw Error('Dedicated restricted monitor credentials required');
  const normalizedPin = pin.replaceAll('\r\n', '\n').trimEnd();
  const normalizedKey = key.replaceAll('\r\n', '\n').trimEnd() + '\n';
  if (
    !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) ||
    !normalizedPin.startsWith(`${host} ssh-ed25519 `) ||
    normalizedPin.split('\n').length !== 1 ||
    !/^-----BEGIN OPENSSH PRIVATE KEY-----\n[A-Za-z0-9+/=\n]+-----END OPENSSH PRIVATE KEY-----\n$/.test(
      normalizedKey,
    )
  )
    throw Error('Dedicated restricted monitor key and exact host pin required');
  return { host, pin: normalizedPin, key: normalizedKey };
}

export function validatePrivateHealth(raw, expectedSource, now = Date.now()) {
  if (
    typeof raw !== 'string' ||
    Buffer.byteLength(raw) > 16384 ||
    !/^[a-f0-9]{64}$/.test(expectedSource)
  )
    throw Error('Bounded source-bound health response required');
  const value = JSON.parse(raw);
  const keys = (object) => Object.keys(object).sort().join('|');
  if (
    keys(value) !== 'checkedAt|checks|ok|schemaVersion|sourceSha256' ||
    value.schemaVersion !== 'alterward-private-health-1' ||
    value.sourceSha256 !== expectedSource ||
    !value.checks ||
    Array.isArray(value.checks) ||
    keys(value.checks) !== [...checks].sort().join('|') ||
    checks.some((name) => typeof value.checks[name] !== 'boolean') ||
    value.ok !== true ||
    checks.some((name) => !value.checks[name]) ||
    typeof value.checkedAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(
      value.checkedAt,
    ) ||
    !Number.isFinite(Date.parse(value.checkedAt)) ||
    Math.abs(now - Date.parse(value.checkedAt)) > 300000
  )
    throw Error(
      'Private health is unavailable, unhealthy, stale or differs from the pinned source',
    );
  return { ok: true, checkedAt: value.checkedAt, checksPassed: checks.length };
}

// Plan 055: the new production host answers with scripts/prod/monitor.py health.
const prodChecks = [
  'containersHealthy',
  'diskSpaceHealthy',
  'originCertificateHealthy',
  'backupFresh',
  'restoreVerified',
  'serviceUsdQuiet',
];

export function validateProdHealth(raw, now = Date.now()) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 16384)
    throw Error('Bounded health response required');
  const value = JSON.parse(raw);
  const keys = (object) => Object.keys(object).sort().join('|');
  if (
    keys(value) !== 'checkedAt|checks|ok|schemaVersion' ||
    value.schemaVersion !== 'alterward-prod-health-1' ||
    !value.checks ||
    Array.isArray(value.checks) ||
    keys(value.checks) !== [...prodChecks].sort().join('|') ||
    prodChecks.some((name) => value.checks[name] !== true) ||
    value.ok !== true ||
    typeof value.checkedAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(
      value.checkedAt,
    ) ||
    !Number.isFinite(Date.parse(value.checkedAt)) ||
    Math.abs(now - Date.parse(value.checkedAt)) > 300000
  )
    throw Error('Production health is unavailable, unhealthy or stale');
  return {
    ok: true,
    checkedAt: value.checkedAt,
    checksPassed: prodChecks.length,
  };
}

// The old host answers in its own format until the move; the new host in the
// plan 055 format. The response itself names its schema.
export function validateAnyHealth(raw, expectedSource, now = Date.now()) {
  let schema;
  try {
    schema = JSON.parse(raw)?.schemaVersion;
  } catch {
    throw Error('Health response is not JSON');
  }
  return schema === 'alterward-prod-health-1'
    ? validateProdHealth(raw, now)
    : validatePrivateHealth(raw, expectedSource, now);
}
