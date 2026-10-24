// A separate proof contract: never reinterpret original owner/zero receipts.
const digest = /^[a-f0-9]{64}$/;
export function activeFundedReplayProof(receipt, now = Date.now()) {
  const keys = [
    'version',
    'sourceCommit',
    'bundleSha256',
    'preparedSha256',
    'imageId',
    'role',
    'ownerManifestDigest',
    'runtimeFilesSha256',
    'authoritySha256',
  ];
  const age = now - Date.parse(receipt?.capturedAt);
  if (
    receipt?.version !== 'alterward-funded-replay-1' ||
    !/^[a-f0-9]{40}$/.test(receipt.sourceCommit ?? '') ||
    !/^sha256:[a-f0-9]{64}$/.test(receipt.imageId ?? '') ||
    !['target', 'recovery'].includes(receipt.role) ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 900000 ||
    keys
      .filter((k) => k.endsWith('Sha256') || k === 'ownerManifestDigest')
      .some((k) => !digest.test(receipt[k] ?? ''))
  )
    throw Error('Fresh original active funded replay proof required');
  return Object.fromEntries(keys.map((k) => [k, receipt[k]]));
}

export function assertFundedReplayInputsUnchanged(
  proof,
  sourceCommit,
  readChangedPaths,
) {
  if (
    !/^[a-f0-9]{40}$/.test(sourceCommit ?? '') ||
    !/^[a-f0-9]{40}$/.test(proof?.sourceCommit ?? '')
  )
    throw Error('Exact active image and operator source required');
  const changed = readChangedPaths(proof.sourceCommit, sourceCommit, [
    'database',
    'packages',
    'Dockerfile',
    '.dockerignore',
    '.nvmrc',
    'package.json',
    'apps/api/package.json',
    'apps/web/package.json',
    'apps/worker/package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig.base.json',
    'tsconfig.scripts.json',
  ]);
  if (typeof changed !== 'string' || changed.trim())
    throw Error(
      'Funded replay image schema and dependencies differ from operator source',
    );
}
