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
