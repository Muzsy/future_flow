// A separate proof contract: never reinterpret original owner/zero receipts.
const digest = /^[a-f0-9]{64}$/;
function activeReplayProof(receipt, now, registry) {
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
  if (registry) keys.push('schema', 'recoveryProfile');
  const age = now - Date.parse(receipt?.capturedAt);
  if (
    receipt?.version !==
      (registry ? 'alterward-funded-replay-2' : 'alterward-funded-replay-1') ||
    (registry &&
      (receipt.schema !== 40 || receipt.recoveryProfile !== 'registry040')) ||
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

export function activeFundedReplayProof(receipt, now = Date.now()) {
  return activeReplayProof(receipt, now, false);
}

export function activeRegistryReplayProof(receipt, now = Date.now()) {
  return activeReplayProof(receipt, now, true);
}

function fundedReplayChanges(proof, sourceCommit, readChangedPaths) {
  if (
    !/^[a-f0-9]{40}$/.test(sourceCommit ?? '') ||
    !/^[a-f0-9]{40}$/.test(proof?.sourceCommit ?? '')
  )
    throw Error('Exact active image and operator source required');
  return readChangedPaths(proof.sourceCommit, sourceCommit, [
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
}

const rejectReplayChanges = () => {
  throw Error(
    'Funded replay image schema and dependencies differ from operator source',
  );
};

export function assertFundedReplayInputsUnchanged(
  proof,
  sourceCommit,
  readChangedPaths,
) {
  const changed = fundedReplayChanges(proof, sourceCommit, readChangedPaths);
  if (typeof changed !== 'string' || changed.trim()) rejectReplayChanges();
}

export function assertRegistryReplayInputsCompatible(
  proof,
  sourceCommit,
  readChangedPaths,
  committedSha256,
) {
  const changed = fundedReplayChanges(proof, sourceCommit, readChangedPaths);
  if (typeof changed === 'string' && !changed.trim()) return;
  // Before the one reviewed #185 image release, the current native040 image
  // must still be able to issue an up-to-date restore under the new operator.
  // This exception is forward-only and scoped to the old, immutable image and
  // the exact billing normalizer bytes. The root still re-derives active proof
  // from the original protected files and runs the normal replay checks.
  const path = 'packages/core/src/billing-stripe.ts';
  if (
    proof.version !== 'alterward-funded-replay-2' ||
    proof.schema !== 40 ||
    proof.recoveryProfile !== 'registry040' ||
    proof.sourceCommit !== '1d312d29f203738c9f9d9a6e5338408c74b82f0b' ||
    proof.imageId !==
      'sha256:2bc94ef68713c96f0fe46f5797e0368740d1da278f2eddb99994d86de3202050' ||
    changed !== path + '\n' ||
    committedSha256(sourceCommit, path) !==
      'e0b44f075357e86226f0b1bd671b8fc4b4ada074ea84b364bda3b75137a39b7a'
  )
    rejectReplayChanges();
}
