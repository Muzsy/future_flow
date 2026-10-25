import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeFundedReplayProof,
  assertFundedReplayInputsUnchanged,
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
