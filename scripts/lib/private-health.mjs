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
