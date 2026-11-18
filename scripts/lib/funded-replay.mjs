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
    // Plan 052 K2 release over the serving 9d6add2 image.
    sourceCommit: '9d6add296ac22f87577f9cf9a4594141b204c1c3',
    imageId:
      'sha256:575838e0a68cc3b6c56db0b2eadafdb55c7c3e6d762f2d1a637ab856fe0824a4',
    files: {
      'packages/ai/src/fiction-prompts.ts':
        'a1e733e2146e6216a5fd1449aef9e62fef85da0917afb15fb32ce109d3b5a653',
      'packages/ai/src/index.ts':
        'fc2d24441267b6c63a112a4f32a0cc3a3b89694fb57cf440032a63da17cba642',
      'packages/contracts/src/fiction.ts':
        'be7548a9fe69382ceaef08d3390908f75737b168f99e6b93311e0cdc247b5ab1',
      'packages/core/src/fiction.ts':
        '957dcde51241ff11b4562ca4a92134b88ddeecb9c9e7a4557f93218b486dd9a4',
      'packages/core/src/official-life.ts':
        '4427e34b8766ad818441c4ef41668c15be9a3aee3dabf47a05a49c2ad27a2012',
      'packages/core/src/story-direction.ts':
        'adf0c729fb4ed240911893a87553419ea8cce6f68b3d0461827e6e135bb20fef',
      'packages/database/src/fiction-memory.ts':
        'e48cde27191baad7589431806d5b4e2c71999a21e116ae7f959011c4ac5706ab',
      'packages/database/src/life-job-state.ts':
        'a562731a8293003d6d5cca521819003e4040f8647f57d47f0afc83f265b92a53',
      'packages/database/src/life-jobs.ts':
        'c3cb0f512a1e5d3ee83e58cc89d7d33c864440073e230318f056c5a642a6a594',
      'packages/database/src/lives.ts':
        'eaff5e068b5113b9375520d364c1692f4bf7007b99c7ad0695f6ce7cc4be39cb',
      'packages/database/src/official-life.ts':
        'a11acacf7e078c1b6834a1325f6353513787d36dc45c1e55bcc2d485364684aa',
      'packages/database/src/service-fiction-policy.ts':
        '2ce801a3cf61629e647d332e7a1edbb8cefa817b6d697483e0871f0c82c7b296',
    },
  },
  {
    // Plan 052 release over the serving 7b6270a image.
    sourceCommit: '7b6270aa7ce24c24fb6b15c2700e5f89e8dc2ec4',
    imageId:
      'sha256:7417b3127be32018a9fd810180e93b6dcdb8b1729811dd2bb9833a03f180ec27',
    files: {
      'packages/ai/src/fiction-prompts.ts':
        'f81d47fa08e43c69515ae1b28acff0efb4fff84ac96d2496b4baaac2cf3df03b',
      'packages/ai/src/index.ts':
        '92d2ec688e33a9fd7aa177ec278bc8f515fd281a059418ee67d96ee66c410811',
      'packages/contracts/src/fiction-character.ts':
        'afee2b6b48f414f6a952505e21a65f70a6431a7e15dc6a7a7f4b2c4e2a7a34b8',
      'packages/contracts/src/fiction.ts':
        'e1a93cdc6ae974e7da53b3dafc4700ea71907c21973f839c58a8a700fb14ac0e',
      'packages/contracts/src/official-life.ts':
        'a649855d43c163dc8100749ecdd0375b09c099f715390eb860b1de47a4996e3c',
      'packages/core/src/fiction-character.ts':
        'd6673ed4a164215cf1053c758e595e74e37cd97b50390e55570e7b7950369388',
      'packages/core/src/fiction.ts':
        'f8d7a257fca8648e564e4d2d1cd5ab21cbf5f2d95618ba273c06cb58cf25caa3',
      'packages/core/src/official-life.ts':
        '73d55478e331810684ffd210277b0e759bfd34bc3fa0e64eb69864bcef423074',
      'packages/core/src/story-direction.ts':
        '33987bee3ef51164ac73df57aeaee0567b0b7bff7f5ded1c9f06945557d60eae',
      'packages/database/src/fiction-memory.ts':
        'f4c6dc43169d38d47e814cd56d05019cb37104492ee8689defaf2eca71f3e74a',
      'packages/database/src/index.ts':
        'd3ce61f589bc001625efadc28c9cc7f9efda5f077bde804a635da4363caca5fd',
      'packages/database/src/life-jobs.ts':
        '7f71fe3f9275524e410a276bfdc1ef760b7f6c938a53430baceb07a7e37ee72a',
      'packages/database/src/lives.ts':
        '3a9e65cfd84b417f7ad86f383239f74ad2ef2ee336793f228e38b7b9b5ae4649',
      'packages/database/src/service-fiction-policy.ts':
        'f1d3b3f1b5f41d64dc082010459691001d4640da02dda8e5ea5a31d7d7b078c4',
    },
  },
  {
    // Plan 051 release over the serving 9cc0b56 image.
    sourceCommit: '9cc0b563dd84bb8926a4313de38e29e228ee4037',
    imageId:
      'sha256:5b67a294076d578f8580a10b5914b152fa79eb7f77cbbbd4e8490332df6743fd',
    files: {
      'packages/access/src/index.ts':
        '46f61cc487f93576763ebf964a7ad11caec3c9d581cd2a76dc9b0ddf1d52abd4',
      'packages/contracts/src/official-life.ts':
        '60de21a3a4d83989fbed87d3a8cab6abbfd9f8bcadd9f9a4e0b069f3e172b70c',
      'packages/contracts/src/public-scenarios.ts':
        'ab57409bfe3a4d543168165781ff45f7c126032754dbca156a916b5bb09d2e97',
      'packages/core/src/official-life.ts':
        '586e2aab815523446422fe280b3fe4e5ab8a5c32f51168fcbb10a913c9577dc8',
      'packages/core/src/scenario-materialization.ts':
        '1f770b9fada1a8e9acd87249068169efcb98b283120d5c6d6fa4e0a46b6cf6c5',
      'packages/database/src/lives.ts':
        '3183f7a324fa8bf6d5fe7df30f3b7e2a8439ccab2a79b982728dc5293802cf1f',
      'packages/database/src/official-life.ts':
        'dcf4f39c19f25ba280e183c1545a7d1ec8a75ac0438caa7db74f26d4dfe5caea',
      'packages/database/src/public-scenarios.ts':
        'f0eccf9a299249a0b8a5dbefc71ceda4bae0a21ab4928aba60ec296a3678b1ff',
    },
  },
  {
    // UX audit release over the serving 6644062 image: only the story label text.
    sourceCommit: '664406223683f837f9e2dfeaacab271f9d9169aa',
    imageId:
      'sha256:996e7885092ac91bb5f197464d6d645af5f01923ba91f0791668e0357127009d',
    files: {
      'packages/contracts/src/story-labels.ts':
        'aba26917893eec51a1c8cf8fb3966dc65d6d7f23acade535ee82d77c66025bc6',
    },
  },
  {
    sourceCommit: '0b82cd50ca7af69320bfc663257b4a4418c52c9f',
    imageId:
      'sha256:b7e4de46b261e80dcd56d1d17baa652683320713a70c9d6ff08f5afa785aac20',
    files: {
      'packages/ai/src/fiction-prompts.ts':
        'cbde71fb137b7186551191d6cddd586c71a8cda884845eea753ca19f8ae6c810',
      'packages/ai/src/fiction-schema.ts':
        '1ccfa874d0ccd470816c22df42bbd3efe835ea021a11e99a8ab5099911c06e8d',
      'packages/ai/src/index.ts':
        'f6b77214281df6f3ab3678196678fd01d1a8bf7f32c73c498ed94773e72230db',
      'packages/contracts/src/error-messages.ts':
        'c6cda7d89a17154f93efb98853488ffa308d2ab30168bae22b7a608bfa1cc9cd',
      'packages/contracts/src/export-schemas.ts':
        'ac2e7fc5ce3dd76eaee3ef87596671208291ae6280a17bb35d24a88394faee8c',
      'packages/contracts/src/fiction.ts':
        '7d9cf8f2f9c0507a30001b7179e6b7e39b0b572bf4fd155c32f54b6fe464f526',
      'packages/contracts/src/index.ts':
        'eea2e5a72e7af17c03bc9a95a3a36529ffd2da57b366e078d1d2f7071f3b819e',
      'packages/contracts/src/life-v2.ts':
        '98e30412723167a20d9ceaabf097ca97acb3d196a5c09b086c9ce7d8c2e2c1a7',
      'packages/contracts/src/narrative.ts':
        '59d45281a32988b9c1c934c285f6f964f01c2aa935ec58a7be1c1ac0ffb99f8f',
      'packages/contracts/src/story-catalog.ts':
        'ed324707f3023d6652340153f12e8a012bf24ec5a28e63d18943fa66cf26d91c',
      'packages/contracts/src/story-draft.ts':
        'bc8da82b554946844a0d50298386d026e5993296ac1cfc2d79298da5d34ed9a5',
      'packages/contracts/src/story-labels.ts':
        '67b49dc5f7dc7d018293f074d7adc2f417e6825e352a59a83125fe1543533850',
      'packages/contracts/src/story.ts':
        '1b645c964080dcb8e5ade9f0d85d32bf7296085c316893ebbc669671d1333b7f',
      'packages/core/src/fiction.ts':
        'd4b79538e3d5feff4616a11b2d58b3a7ac236e6bfa2ec93269f5eb63e19e4ddd',
      'packages/core/src/index.ts':
        'af2666ec9c404e518269764875c76d0cc6b360e0d424405be802b6db6b180efa',
      'packages/core/src/life-v2.ts':
        '230cb0f8c7d2281532f0b02fd993b9140efa49d6b0e82051900ef471c54fa823',
      'packages/core/src/narrative.ts':
        '602be6425438fe3b65713223291e7ce715404986ee1cf8af40d3e8a72fc59a8d',
      'packages/core/src/public-draft.ts':
        'f0853467b11886ebadd30dee93f8b12fa1c2244058f42cc74017302c06f07733',
      'packages/core/src/public-fork.ts':
        '6c40d16c146e85f1411ce242edd98b7c8d61a61479e4651dc12a38c5615f7411',
      'packages/core/src/public-preview-editor.ts':
        '6dcf2dacb5191fa99099821c06a48837f6a45dd5c262ef3092d2411b687fdb4e',
      'packages/core/src/story-direction.ts':
        '919961d205c0f00b520b91e3c0e6e593a1eb3cc4e28c272892ee42cc502ecd53',
      'packages/database/src/fiction-memory.ts':
        '765471012c28004ba69aa6349d8509093237c31312831d5934bed7cb88bff609',
      'packages/database/src/life-jobs.ts':
        '8d7d9b401234a6e7399c7ba381d4a5cd04d5c9d43a60ede0991485fb67865d85',
      'packages/database/src/lives.ts':
        'b1a50be06642704bd1a9d2166532e90d929eb4e14a6577842e0bea4018146b82',
      'packages/database/src/narrative-memory.ts':
        'b72bcad75b31c3ce3749f4ba01b0ab38bceb775cfa053f62d3d5f522e3f97fdd',
      'packages/database/src/official-life.ts':
        '15711cae20207c96ff6009b83ae5e898231918e92af384ab18f1791cc87fab78',
      'packages/database/src/repository.ts':
        'aabd0c03ccfbe7b20f5a18aaa05f6da38280b92da5b1dec1d64d8fdb21ea31c5',
    },
  },
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
