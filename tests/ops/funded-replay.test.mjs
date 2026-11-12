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
