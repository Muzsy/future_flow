import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeFundedReplayProof,
  activeRegistryReplayProof,
  assertFundedReplayInputsUnchanged,
  assertRegistryReplayInputsCompatible,
} from '../../scripts/lib/funded-replay.mjs';
const now = Date.parse('2026-10-24T20:00:00Z');
const receipt = {
  version: 'alterward-funded-replay-1',
  sourceCommit: 'a'.repeat(40),
  imageId: 'sha256:' + 'b'.repeat(64),
  role: 'target',
  capturedAt: new Date(now).toISOString(),
  ...Object.fromEntries(
    [
      'bundleSha256',
      'preparedSha256',
      'ownerManifestDigest',
      'runtimeFilesSha256',
      'authoritySha256',
    ].map((k) => [k, 'c'.repeat(64)]),
  ),
};
test('funded proof has its own fresh exact contract without changing owner receipts', () => {
  const proof = activeFundedReplayProof(receipt, now);
  assert.equal(proof.imageId, receipt.imageId);
  assert(!('capturedAt' in proof));
  for (const bad of [
    { ...receipt, capturedAt: new Date(now - 900001).toISOString() },
    { ...receipt, capturedAt: new Date(now + 1).toISOString() },
    { ...receipt, role: 'owner' },
    { ...receipt, imageId: 'latest' },
    { ...receipt, version: undefined },
    { ...receipt, authoritySha256: '' },
  ])
    assert.throws(() => activeFundedReplayProof(bad, now));
});
test('the funded dependency guard compares to the actual active source, never legacy registry entries', () => {
  const proof = activeFundedReplayProof(receipt, now);
  let visits = 0;
  assertFundedReplayInputsUnchanged(
    proof,
    'd'.repeat(40),
    (base, head, paths) => {
      visits++;
      assert.equal(base, receipt.sourceCommit);
      assert.equal(head, 'd'.repeat(40));
      assert(paths.includes('database'));
      assert(paths.includes('packages'));
      assert(paths.includes('pnpm-lock.yaml'));
      return '';
    },
  );
  assert.equal(visits, 1);
  for (const changed of [
    'database/migrations/038_narrative_artifacts.sql\n',
    'packages/contracts/src/fiction.ts\n',
    undefined,
  ])
    assert.throws(() =>
      assertFundedReplayInputsUnchanged(proof, 'd'.repeat(40), () => changed),
    );
});

test('registry040 has a separate v2 proof and cannot be consumed as a legacy receipt', () => {
  const native = {
    ...receipt,
    version: 'alterward-funded-replay-2',
    schema: 40,
    recoveryProfile: 'registry040',
  };
  const proof = activeRegistryReplayProof(native, now);
  assert.equal(proof.schema, 40);
  assert.equal(proof.recoveryProfile, 'registry040');
  assert(!('capturedAt' in proof));
  assert.throws(() => activeFundedReplayProof(native, now));
  assert.throws(() => activeRegistryReplayProof(receipt, now));
  for (const bad of [
    { ...native, schema: 39 },
    { ...native, recoveryProfile: 'historical039' },
    { ...native, capturedAt: new Date(now - 900001).toISOString() },
  ])
    assert.throws(() => activeRegistryReplayProof(bad, now));
});

test('only the retained native040 image can replay across the exact reviewed billing correction', () => {
  const proof = {
    ...receipt,
    version: 'alterward-funded-replay-2',
    schema: 40,
    recoveryProfile: 'registry040',
    sourceCommit: '1d312d29f203738c9f9d9a6e5338408c74b82f0b',
    imageId:
      'sha256:2bc94ef68713c96f0fe46f5797e0368740d1da278f2eddb99994d86de3202050',
  };
  const candidate = '878ec93c3ee49a0af386b90736b4ab455ef4d984';
  const path = 'packages/core/src/billing-stripe.ts';
  const hash =
    'e0b44f075357e86226f0b1bd671b8fc4b4ada074ea84b364bda3b75137a39b7a';
  const check = (active, change = path + '\n', digest = hash) =>
    assertRegistryReplayInputsCompatible(
      active,
      candidate,
      () => change,
      (head, file) => {
        assert.equal(head, candidate);
        assert.equal(file, path);
        return digest;
      },
    );
  check(proof);
  assert.throws(() => check({ ...proof, imageId: receipt.imageId }));
  assert.throws(() => check({ ...proof, sourceCommit: candidate }));
  assert.throws(() => check({ ...proof, version: receipt.version }));
  assert.throws(() => check({ ...proof, schema: 39 }));
  assert.throws(() => check(proof, path + '\npackages/other.ts\n'));
  assert.throws(() => check(proof, path + '\n', '0'.repeat(64)));
  assert.throws(() =>
    assertFundedReplayInputsUnchanged(proof, candidate, () => path + '\n'),
  );
});

test('only the running Generation 8 image can replay across the exact nine reviewed packages files', () => {
  const files = {
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
  };
  const paths = Object.keys(files);
  const proof = {
    ...receipt,
    version: 'alterward-funded-replay-2',
    schema: 40,
    recoveryProfile: 'registry040',
    sourceCommit: '0bbdb063619e9d3a4a655f869ed5c604a3509386',
    imageId:
      'sha256:a93bb2ba8d9a701965d60c217d3b8096b4cef33d7317ffa3cf11ccc1860a3c8a',
  };
  const candidate = '4b0d7b7a35619ebc2e8dc9228019897f6d90b74e';
  const joined = (list) => list.map((p) => p + '\n').join('');
  const check = (
    active,
    change = joined(paths),
    digests = files,
    head = candidate,
  ) =>
    assertRegistryReplayInputsCompatible(
      active,
      head,
      () => change,
      (commit, file) => {
        assert.equal(commit, head);
        return digests[file] ?? '0'.repeat(64);
      },
    );
  check(proof);
  // Wrong image, source commit, proof version, schema or profile.
  assert.throws(() => check({ ...proof, imageId: receipt.imageId }));
  assert.throws(() =>
    check({
      ...proof,
      imageId:
        'sha256:2bc94ef68713c96f0fe46f5797e0368740d1da278f2eddb99994d86de3202050',
    }),
  );
  assert.throws(() => check({ ...proof, sourceCommit: candidate }));
  assert.throws(() => check({ ...proof, version: receipt.version }));
  assert.throws(() => check({ ...proof, schema: 39 }));
  assert.throws(() => check({ ...proof, recoveryProfile: 'historical039' }));
  // One file missing, one extra file, a different file, or garbage output.
  assert.throws(() => check(proof, joined(paths.slice(1))));
  assert.throws(() =>
    check(proof, joined([...paths, 'packages/core/src/billing-stripe.ts'])),
  );
  assert.throws(() =>
    check(proof, joined([...paths.slice(1), 'packages/other.ts'])),
  );
  assert.throws(() =>
    assertRegistryReplayInputsCompatible(
      proof,
      candidate,
      () => undefined,
      (commit, file) => files[file],
    ),
  );
  assert.throws(() => check(proof, joined(paths).trimEnd()));
  // Every pinned file must match its bytes at the operator source commit.
  for (const path of paths)
    assert.throws(() =>
      check(proof, joined(paths), { ...files, [path]: 'f'.repeat(64) }),
    );
  assert.throws(() => check(proof, joined(paths), {}));
  // The exceptions never leak into the plain funded guard or across images.
  assert.throws(() =>
    assertFundedReplayInputsUnchanged(proof, candidate, () => joined(paths)),
  );
  assert.throws(() =>
    assertRegistryReplayInputsCompatible(
      { ...proof, sourceCommit: '1d312d29f203738c9f9d9a6e5338408c74b82f0b' },
      candidate,
      () => joined(paths),
      (commit, file) => files[file],
    ),
  );
  // Any change in the database, dependency or build inputs is still rejected.
  assert.throws(() =>
    check(proof, joined([...paths, 'database/migrations/041_next.sql'])),
  );
  assert.throws(() => check(proof, joined([...paths, 'pnpm-lock.yaml'])));
  // Identical sources need no exception.
  check(proof, '');
});

test('only the serving 6644062 image can replay across the UX audit story label text', () => {
  const proof = {
    ...receipt,
    version: 'alterward-funded-replay-2',
    schema: 40,
    recoveryProfile: 'registry040',
    sourceCommit: '664406223683f837f9e2dfeaacab271f9d9169aa',
    imageId:
      'sha256:996e7885092ac91bb5f197464d6d645af5f01923ba91f0791668e0357127009d',
  };
  const candidate = '9652d700c7b32f3b3359fc875332815a7305c397';
  const path = 'packages/contracts/src/story-labels.ts';
  const hash =
    'aba26917893eec51a1c8cf8fb3966dc65d6d7f23acade535ee82d77c66025bc6';
  const check = (active, change = path + '\n', digest = hash) =>
    assertRegistryReplayInputsCompatible(
      active,
      candidate,
      () => change,
      (head, file) => {
        assert.equal(head, candidate);
        assert.equal(file, path);
        return digest;
      },
    );
  check(proof);
  // Another image, source, proof version, schema or profile.
  assert.throws(() => check({ ...proof, imageId: receipt.imageId }));
  assert.throws(() => check({ ...proof, sourceCommit: candidate }));
  assert.throws(() => check({ ...proof, version: receipt.version }));
  assert.throws(() => check({ ...proof, schema: 39 }));
  assert.throws(() => check({ ...proof, recoveryProfile: 'historical039' }));
  // Any other packages, schema or dependency change, or other bytes.
  assert.throws(() =>
    check(proof, path + '\npackages/contracts/src/story.ts\n'),
  );
  assert.throws(() =>
    check(
      proof,
      path + '\ndatabase/migrations/041_political_start_history.sql\n',
    ),
  );
  assert.throws(() => check(proof, path + '\npnpm-lock.yaml\n'));
  assert.throws(() => check(proof, path + '\n', '0'.repeat(64)));
  assert.throws(() =>
    assertFundedReplayInputsUnchanged(proof, candidate, () => path + '\n'),
  );
});

test('only the serving 9cc0b56 image can replay across the plan 051 packages files', () => {
  const files = {
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
  };
  const paths = Object.keys(files);
  const proof = {
    ...receipt,
    version: 'alterward-funded-replay-2',
    schema: 40,
    recoveryProfile: 'registry040',
    sourceCommit: '9cc0b563dd84bb8926a4313de38e29e228ee4037',
    imageId:
      'sha256:5b67a294076d578f8580a10b5914b152fa79eb7f77cbbbd4e8490332df6743fd',
  };
  const candidate = '254733891e021f322d5e713dc6566813ae528003';
  const joined = (list) => list.map((p) => p + '\n').join('');
  const check = (active, change = joined(paths), digests = files) =>
    assertRegistryReplayInputsCompatible(
      active,
      candidate,
      () => change,
      (head, file) => {
        assert.equal(head, candidate);
        return digests[file] ?? '0'.repeat(64);
      },
    );
  check(proof);
  assert.throws(() => check({ ...proof, imageId: receipt.imageId }));
  assert.throws(() => check({ ...proof, sourceCommit: candidate }));
  assert.throws(() => check({ ...proof, schema: 39 }));
  assert.throws(() => check(proof, joined(paths.slice(1))));
  assert.throws(() => check(proof, joined([...paths, 'pnpm-lock.yaml'])));
  assert.throws(() =>
    check(proof, joined([...paths, 'database/migrations/041_next.sql'])),
  );
  for (const path of paths)
    assert.throws(() =>
      check(proof, joined(paths), { ...files, [path]: 'f'.repeat(64) }),
    );
  assert.throws(() =>
    assertFundedReplayInputsUnchanged(proof, candidate, () => joined(paths)),
  );
});

test('only the serving 7b6270a image can replay across the plan 052 packages files', () => {
  const files = {
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
  };
  const paths = Object.keys(files);
  const proof = {
    ...receipt,
    version: 'alterward-funded-replay-2',
    schema: 40,
    recoveryProfile: 'registry040',
    sourceCommit: '7b6270aa7ce24c24fb6b15c2700e5f89e8dc2ec4',
    imageId:
      'sha256:7417b3127be32018a9fd810180e93b6dcdb8b1729811dd2bb9833a03f180ec27',
  };
  const candidate = 'fc5e38a0c0ffee0000000000000000000000000a';
  const joined = (list) => list.map((p) => p + '\n').join('');
  const check = (active, change = joined(paths), digests = files) =>
    assertRegistryReplayInputsCompatible(
      active,
      candidate,
      () => change,
      (head, file) => {
        assert.equal(head, candidate);
        return digests[file] ?? '0'.repeat(64);
      },
    );
  check(proof);
  assert.throws(() => check({ ...proof, imageId: receipt.imageId }));
  assert.throws(() => check({ ...proof, sourceCommit: candidate }));
  assert.throws(() => check({ ...proof, schema: 39 }));
  assert.throws(() => check(proof, joined(paths.slice(1))));
  assert.throws(() => check(proof, joined([...paths, 'pnpm-lock.yaml'])));
  assert.throws(() =>
    check(proof, joined([...paths, 'database/migrations/041_next.sql'])),
  );
  for (const path of paths)
    assert.throws(() =>
      check(proof, joined(paths), { ...files, [path]: 'f'.repeat(64) }),
    );
  assert.throws(() =>
    assertFundedReplayInputsUnchanged(proof, candidate, () => joined(paths)),
  );
});

test('only the serving 9d6add2 image can replay across the plan 052 K2 packages files', () => {
  const files = {
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
  };
  const paths = Object.keys(files);
  const proof = {
    ...receipt,
    version: 'alterward-funded-replay-2',
    schema: 40,
    recoveryProfile: 'registry040',
    sourceCommit: '9d6add296ac22f87577f9cf9a4594141b204c1c3',
    imageId:
      'sha256:575838e0a68cc3b6c56db0b2eadafdb55c7c3e6d762f2d1a637ab856fe0824a4',
  };
  const candidate = 'c1151e068369508a9419f9f014843ddab1bc6ca9';
  const joined = (list) => list.map((p) => p + '\n').join('');
  const check = (active, change = joined(paths), digests = files) =>
    assertRegistryReplayInputsCompatible(
      active,
      candidate,
      () => change,
      (head, file) => {
        assert.equal(head, candidate);
        return digests[file] ?? '0'.repeat(64);
      },
    );
  check(proof);
  assert.throws(() => check({ ...proof, imageId: receipt.imageId }));
  assert.throws(() => check({ ...proof, sourceCommit: candidate }));
  assert.throws(() => check({ ...proof, schema: 39 }));
  assert.throws(() => check(proof, joined(paths.slice(1))));
  assert.throws(() => check(proof, joined([...paths, 'pnpm-lock.yaml'])));
  assert.throws(() =>
    check(proof, joined([...paths, 'database/migrations/041_next.sql'])),
  );
  for (const path of paths)
    assert.throws(() =>
      check(proof, joined(paths), { ...files, [path]: 'f'.repeat(64) }),
    );
  assert.throws(() =>
    assertFundedReplayInputsUnchanged(proof, candidate, () => joined(paths)),
  );
});

test('only the serving e000b4c image can replay across the generic relation label file', () => {
  const files = {
    'packages/core/src/public-draft.ts':
      '7c1353ccc0c9c9e372e9afacf952850b3268c8f9fb3102679196c69ce599b3a7',
  };
  const paths = Object.keys(files);
  const proof = {
    ...receipt,
    version: 'alterward-funded-replay-2',
    schema: 40,
    recoveryProfile: 'registry040',
    sourceCommit: 'e000b4c11f8eff5b0673fbbc03111f67c13d7575',
    imageId:
      'sha256:743277d3996d7ced58b05eb45c4afe61a40730eb55dd7899a4ebdf5aa12ffea5',
  };
  const candidate = '5fd030d6a8d317c960f47668ca44d3d07e6c1cfb';
  const joined = (list) => list.map((p) => p + '\n').join('');
  const check = (active, change = joined(paths), digests = files) =>
    assertRegistryReplayInputsCompatible(
      active,
      candidate,
      () => change,
      (head, file) => {
        assert.equal(head, candidate);
        return digests[file] ?? '0'.repeat(64);
      },
    );
  check(proof);
  assert.throws(() => check({ ...proof, imageId: receipt.imageId }));
  assert.throws(() => check({ ...proof, sourceCommit: candidate }));
  assert.throws(() => check(proof, joined([...paths, 'pnpm-lock.yaml'])));
  assert.throws(() =>
    check(proof, joined(paths), { ...files, [paths[0]]: 'f'.repeat(64) }),
  );
});

test('only the serving 2622661 image can replay across the fictional Official curation file', () => {
  const files = {
    'packages/database/src/public-content-curation.ts':
      '9853cc3bc3801a051b30ec2842069a28e5f126de6abaa4d157029ce8339b7038',
  };
  const paths = Object.keys(files);
  const proof = {
    ...receipt,
    version: 'alterward-funded-replay-2',
    schema: 40,
    recoveryProfile: 'registry040',
    sourceCommit: '2622661d53f2926436f5b57ebc1bf6b9f318910d',
    imageId:
      'sha256:f0bab3e368c762b1a4347ef6b5d5b484d3b71115e606043c6bede1268bb83d94',
  };
  const candidate = '99006b9181e2f80688882671e5e8a56e7ac55745';
  const joined = (list) => list.map((p) => p + '\n').join('');
  const check = (active, change = joined(paths), digests = files) =>
    assertRegistryReplayInputsCompatible(
      active,
      candidate,
      () => change,
      (head, file) => {
        assert.equal(head, candidate);
        return digests[file] ?? '0'.repeat(64);
      },
    );
  check(proof);
  assert.throws(() => check({ ...proof, imageId: receipt.imageId }));
  assert.throws(() => check({ ...proof, sourceCommit: candidate }));
  assert.throws(() => check(proof, joined([...paths, 'pnpm-lock.yaml'])));
  assert.throws(() =>
    check(proof, joined(paths), { ...files, [paths[0]]: 'f'.repeat(64) }),
  );
});

test('only the serving 49b8eda image can replay across the Official story timing file', () => {
  const files = {
    'packages/core/src/official-life.ts':
      'abaf8510b389529cdfb7f7fdf675f20d3780a980ce0a57ff5d57d10c744b967d',
  };
  const paths = Object.keys(files);
  const proof = {
    ...receipt,
    version: 'alterward-funded-replay-2',
    schema: 40,
    recoveryProfile: 'registry040',
    sourceCommit: '49b8edaa937a55da0c82051e57e98c668259df3f',
    imageId:
      'sha256:30c44801cb9fad951f7a930613f81805d78cabf4e8909ef89280c81bd2abe64a',
  };
  const candidate = 'ba09b32a524241248d533ca8bd6470cca9fc7aa7';
  const joined = (list) => list.map((p) => p + '\n').join('');
  const check = (active, change = joined(paths), digests = files) =>
    assertRegistryReplayInputsCompatible(
      active,
      candidate,
      () => change,
      (head, file) => {
        assert.equal(head, candidate);
        return digests[file] ?? '0'.repeat(64);
      },
    );
  check(proof);
  assert.throws(() => check({ ...proof, imageId: receipt.imageId }));
  assert.throws(() => check({ ...proof, sourceCommit: candidate }));
  assert.throws(() => check(proof, joined([...paths, 'pnpm-lock.yaml'])));
  assert.throws(() =>
    check(proof, joined(paths), { ...files, [paths[0]]: 'f'.repeat(64) }),
  );
});

test('only the serving f07d604 image can replay across the plan 053 minimum files', () => {
  const files = {
    'apps/web/app/[...route]/page.tsx':
      '747d9918f42616a5b027b26e0a6f2b4ca56b6ee2a8f6c8c3b04b36deee543171',
    'apps/web/app/globals.css':
      '36ef399c1bf6805ed51137421240c5f6f69f7bf5bfd0c9d3af28eff7ac0a2c5e',
    'apps/web/app/not-found.tsx':
      'd77c8677ffb88ba6c49e3cfc52c4003099c9dd0f505362c121b50837987c9aa3',
    'apps/web/app/official-lives/[slug]/page.tsx':
      '4319048bd1e1420909ed9652d4a18f84219b42c2ac7c13acd6912e5d052ba65d',
    'apps/web/app/official-unlisted/page.tsx':
      '201afe1d079a7f9f086f9b10fd1e765d85fd5120ef0beefeff37311adacf9935',
    'apps/web/components/experience.tsx':
      '3980629763e43e8be8ad5d5475196a76d78735186ca48dcd8481cf0d0862fbf8',
    'apps/web/components/official-publication-reader.tsx':
      '72b18b981396cb56be287a6f37af7ec37c82ceb1ffc9809f279cc6a866487af2',
    'apps/web/components/sample-story.tsx':
      'd30a33bb082db36679d44b802fb3562e95049ad3fbac617affa6301c870b67ab',
    'apps/web/lib/i18n/messages.ts':
      '9565d2dd92fb1c45938d20183592eca797e52ae928a584faff250186bc317a67',
    'apps/web/lib/sample-stories.ts':
      '16cec0b57741c404bb27195c76be1d998737fce00c7bc29832abeec933c945b3',
    'packages/core/src/story-direction.ts':
      '25238a74148c298feb85f1af4596b267d7da7b1deda787ca631451504ee46bfc',
  };
  const paths = Object.keys(files);
  const proof = {
    ...receipt,
    version: 'alterward-funded-replay-2',
    schema: 40,
    recoveryProfile: 'registry040',
    sourceCommit: 'f07d604d71ec1058d6ab12231fb72068de510ae7',
    imageId:
      'sha256:5af1273cec2857bb404f3ba90757ccb7a4596c15c2b9be7561ff98de314ec982',
  };
  const candidate = '01a2ecadda438d136a65aa04a1d83c45f0944b41';
  const joined = (list) => list.map((p) => p + '\n').join('');
  const check = (active, change = joined(paths), digests = files) =>
    assertRegistryReplayInputsCompatible(
      active,
      candidate,
      () => change,
      (head, file) => {
        assert.equal(head, candidate);
        return digests[file] ?? '0'.repeat(64);
      },
    );
  check(proof);
  assert.throws(() => check({ ...proof, imageId: receipt.imageId }));
  assert.throws(() => check({ ...proof, sourceCommit: candidate }));
  assert.throws(() => check(proof, joined([...paths, 'pnpm-lock.yaml'])));
  assert.throws(() =>
    check(proof, joined(paths), { ...files, [paths[0]]: 'f'.repeat(64) }),
  );
});
