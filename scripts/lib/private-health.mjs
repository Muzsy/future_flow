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
