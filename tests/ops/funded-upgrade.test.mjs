import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  releaseEvidence,
  fundedSourceBundle,
  validateFundedNarrativeRuntime,
} from '../../scripts/lib/funded-upgrade.mjs';
const commit = 'a'.repeat(40),
  bundleSha256 = 'b'.repeat(64),
  image = 'sha256:' + 'c'.repeat(64);
function proofs() {
  const build = {
    commit,
    imageId: image,
    imageTag: 'alterward:contabo-aaaaaaaaaaaa',
    sourceDirectory: '/root/alterward-ops/target/source',
  };
  return {
    commit,
    bundleSha256,
    selection: { target: build, recovery: build },
    audit: {
      sourceCommit: commit,
      bundleSha256,
      interpretedByOperator: true,
      critical: 0,
      high: 0,
      medium: 0,
    },
    fixture: {
      sourceCommit: commit,
      bundleSha256,
      targetImage: image,
      recoveryImage: image,
      paidAiCalls: 0,
      privacyFixtureSha256: 'd'.repeat(64),
      checks: Object.fromEntries(
        [
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
          'expiredPreparationArchive',
        ].map((k) => [k, true]),
      ),
    },
    ci: [{ head_sha: commit }],
  };
}
test('reviewed evidence binds exact source, image, bundle and actual fixture dimensions', () => {
  const r = releaseEvidence(proofs());
  assert.equal(r.target.imageId, image);
  assert.match(r.fixtureSha256, /^[a-f0-9]{64}$/);
});
test('rejects missing audit, foreign source, incomplete fixture and substituted recovery image', () => {
  for (const change of [
    (p) => (p.audit.medium = 1),
    (p) => (p.audit.sourceCommit = 'e'.repeat(40)),
    (p) => delete p.fixture.checks.privacyReplay,
    (p) =>
      (p.selection.recovery = {
        ...p.selection.recovery,
        imageId: 'sha256:' + 'f'.repeat(64),
      }),
    (p) => (p.audit.unknown = true),
  ]) {
    const p = proofs();
    change(p);
    assert.throws(() => releaseEvidence(p));
  }
});

test('source bundle binds Docker inputs and executable sources while excluding private state', () => {
  const paths = [
    'Dockerfile',
    '.dockerignore',
    'scripts/test.py',
    'packages/a/src/test.ts',
    'env/private.env',
    '.local/receipt.json',
    'docs/note.md',
  ];
  const bundle = fundedSourceBundle(paths, () =>
    Buffer.from('synthetic source'),
  );
  assert.deepEqual(Object.keys(bundle.sourceHashes), [
    '.dockerignore',
    'Dockerfile',
    'packages/a/src/test.ts',
    'scripts/test.py',
  ]);
});

const runtime = () => ({
  mode: 'narrative-fiction-v2',
  generation: 'v9',
  cohortUserIds: ['00000000-0000-4000-8000-000000000001'],
  timeoutMs: 300000,
  maxRequestBytes: 131072,
});
test('explicit v9 selection is retained in release evidence and rejects other authority', () => {
  const p = proofs();
  p.selection.runtime = runtime();
  assert.deepEqual(releaseEvidence(p).runtime, runtime());
  for (const change of [
    (r) => (r.generation = 'v10'),
    (r) => (r.mode = 'legacy'),
    (r) => r.cohortUserIds.push(r.cohortUserIds[0]),
    (r) => (r.cohortUserIds = []),
    (r) => (r.timeoutMs = 300001),
    (r) => (r.maxRequestBytes = 196609),
    (r) => (r.maxRequestBytes = 99999),
    (r) => (r.budget = 10),
  ]) {
    const r = runtime();
    change(r);
    assert.throws(() => validateFundedNarrativeRuntime(r));
  }
});
test('mutable GitHub metadata cannot prevent recovery; a new run attempt changes its binding', () => {
  const p = proofs();
  p.ci = [
    {
      id: 42,
      head_sha: commit,
      run_attempt: 1,
      status: 'completed',
      conclusion: 'success',
      updated_at: 'before',
    },
  ];
  const before = releaseEvidence(p).ciSha256;
  p.ci[0].updated_at = 'after';
  p.ci[0].actor = { login: 'irrelevant' };
  assert.equal(releaseEvidence(p).ciSha256, before);
  p.ci[0].run_attempt = 2;
  assert.notEqual(releaseEvidence(p).ciSha256, before);
});
