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

// Reviewed native040 replay exceptions. Each entry is forward-only and bound
// to one old, immutable image, its exact source commit and the exact set of
// changed product files, every file pinned by the SHA-256 of its bytes at the
// operator source commit. Anything else (another image, another file, other
// bytes, an extra or missing path) is rejected. The root still re-derives
// active proof from the original protected files and runs the normal replay
// checks; these exceptions never relax them.
const REVIEWED_REGISTRY_REPLAY_EXCEPTIONS = [
  {
    // #185: the Stripe cancellation normalizer.
    sourceCommit: '1d312d29f203738c9f9d9a6e5338408c74b82f0b',
    imageId:
      'sha256:2bc94ef68713c96f0fe46f5797e0368740d1da278f2eddb99994d86de3202050',
    files: {
      'packages/core/src/billing-stripe.ts':
        'e0b44f075357e86226f0b1bd671b8fc4b4ada074ea84b364bda3b75137a39b7a',
    },
  },
  {
    // #194 worker pool, #176 terms and #193 subscriber invite, reviewed as
    // one combined release over the running Generation 8 image.
    sourceCommit: '0bbdb063619e9d3a4a655f869ed5c604a3509386',
    imageId:
      'sha256:a93bb2ba8d9a701965d60c217d3b8096b4cef33d7317ffa3cf11ccc1860a3c8a',
    files: {
      'packages/contracts/src/error-messages.ts':
        'c28a6025edb83fcc18015382e2f252fea628d4ab953a5335cf55ab15cc9563ab',
      'packages/contracts/src/privacy-consent.ts':
        'a74d7cefaf752896d3f01ae1c1b3b9b4828ae8876f5073b52da7bbb0be80c44c',
      'packages/core/src/billing-referral.ts':
        '53fb901a33b194f62fece70925dbc94791d1a7897c50e6f0712fb1b032d39383',
      'packages/core/src/billing.ts':
        'f832a25a6f0786bd344ee18495a8276ee4166f1bbb6c9ad3e3e4a3edfe591390',
      'packages/core/src/index.ts':
        '952ce99a6e2340a2c07a3ad1fe0e3a32cd4e5b9999419771c6679d8ecee28297',
      'packages/database/src/billing.ts':
        'af53e4db05fcf82423d549497b886c7aae2d3644ca69c0c36584eefd425a8712',
      'packages/database/src/index.ts':
        '5983a43d68892e255ead824d03c60057de1668b58993dada1dc5b00df12ce8bb',
      'packages/database/src/referral.ts':
        'd313a4b09f092f2d33d5f8ad3015494dcf29e3e689f939c67f9c24d19e5fe469',
      'packages/database/src/service-access.ts':
        '21f4734e6282f07f00bc353121de4eec2e5b905ea8d42d7b01a8089894cda622',
    },
  },
];

export function assertRegistryReplayInputsCompatible(
  proof,
  sourceCommit,
  readChangedPaths,
  committedSha256,
) {
  const changed = fundedReplayChanges(proof, sourceCommit, readChangedPaths);
  if (typeof changed === 'string' && !changed.trim()) return;
  const rule = REVIEWED_REGISTRY_REPLAY_EXCEPTIONS.find(
    (r) => r.sourceCommit === proof.sourceCommit && r.imageId === proof.imageId,
  );
  const expected = rule && Object.keys(rule.files).sort();
  if (
    !rule ||
    typeof changed !== 'string' ||
    proof.version !== 'alterward-funded-replay-2' ||
    proof.schema !== 40 ||
    proof.recoveryProfile !== 'registry040' ||
    changed !== expected.map((path) => path + '\n').join('') ||
    expected.some(
      (path) => committedSha256(sourceCommit, path) !== rule.files[path],
    )
  )
    rejectReplayChanges();
}
