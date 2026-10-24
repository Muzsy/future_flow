import { createHash } from 'node:crypto';

export const fundedUpgradeModules = [
  ['alterward_backup', 'contabo-backup.py'],
  ['alterward_target', 'contabo-target.py'],
  ['alterward_owner', 'contabo-owner.py'],
  ['alterward_activation', 'contabo-owner-activation.py'],
  ['alterward_upgrade', 'contabo-owner-upgrade.py'],
  ['alterward_fence', 'contabo-writer-fence.py'],
  ['alterward_readers', 'contabo-personal-beta-readers.py'],
  ['alterward_personal_beta', 'contabo-personal-beta.py'],
  ['alterward_funded_watchdog', 'contabo-funded-watchdog.py'],
  ['alterward_funded_upgrade', 'contabo-funded-upgrade.py'],
];
export function sha(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
export function exactObject(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  )
    throw Error('Exact funded-upgrade proof required');
  return value;
}
export function releaseEvidence({
  commit,
  bundleSha256,
  selection,
  audit,
  fixture,
  ci,
}) {
  exactObject(selection, ['target', 'recovery']);
  for (const build of Object.values(selection)) {
    exactObject(build, ['commit', 'imageId', 'imageTag', 'sourceDirectory']);
    if (
      build.commit !== commit ||
      !/^sha256:[a-f0-9]{64}$/.test(build.imageId) ||
      !/^alterward:contabo-[a-f0-9]{12}$/.test(build.imageTag) ||
      !/^\/root\/alterward-ops\//.test(build.sourceDirectory)
    )
      throw Error('Exact immutable Linux build required');
  }
  exactObject(audit, [
    'sourceCommit',
    'bundleSha256',
    'interpretedByOperator',
    'critical',
    'high',
    'medium',
  ]);
  if (
    audit.sourceCommit !== commit ||
    audit.bundleSha256 !== bundleSha256 ||
    audit.interpretedByOperator !== true ||
    [audit.critical, audit.high, audit.medium].some((v) => v !== 0)
  )
    throw Error('Independent interpreted exact-source audit required');
  exactObject(fixture, [
    'sourceCommit',
    'bundleSha256',
    'targetImage',
    'recoveryImage',
    'checks',
    'privacyFixtureSha256',
    'paidAiCalls',
  ]);
  const checks = [
    'success',
    'stale',
    'postcheck',
    'interruption',
    'locks',
    'reservations',
    'leases',
    'incompatibleRecovery',
    'foreign',
    'fundedState',
    'artifactRestore',
    'privacyReplay',
    'frozenPolicies',
  ];
  exactObject(fixture.checks, checks);
  if (
    fixture.sourceCommit !== commit ||
    fixture.bundleSha256 !== bundleSha256 ||
    fixture.targetImage !== selection.target.imageId ||
    fixture.recoveryImage !== selection.recovery.imageId ||
    fixture.paidAiCalls !== 0 ||
    checks.some((k) => fixture.checks[k] !== true) ||
    !/^[a-f0-9]{64}$/.test(fixture.privacyFixtureSha256)
  )
    throw Error('Actual commit/image-bound Linux fixture required');
  return {
    ...selection,
    auditSha256: sha(JSON.stringify(audit)),
    fixtureSha256: sha(JSON.stringify(fixture)),
    privacyFixtureSha256: fixture.privacyFixtureSha256,
    ciSha256: sha(JSON.stringify(ci)),
  };
}

// Shared by the operator and the isolated fixture evidence producer. A checkout
// with uncommitted code cannot use these hashes as a committed release proof.
export function fundedSourceBundle(paths, read) {
  const selected = paths
    .filter(
      (p) =>
        p === 'Dockerfile' ||
        p === '.dockerignore' ||
        /^(scripts\/|tests\/|apps\/|packages\/|database\/migrations\/|deploy\/compose|(?:pnpm-|package|tsconfig))/.test(
          p,
        ),
    )
    .filter(
      (p) =>
        p === 'Dockerfile' ||
        p === '.dockerignore' ||
        /\.(?:ts|tsx|mts|mjs|cjs|py|json|yaml|sql|sh|css)$/.test(p),
    )
    .sort();
  const sourceHashes = Object.fromEntries(
    selected.map((p) => [p, sha(read(p))]),
  );
  return { sourceHashes, bundleSha256: sha(JSON.stringify(sourceHashes)) };
}
