import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  exactFenceCiRuns,
  assertExactFenceCiJobs,
  reviewedRecoveryRelease,
} from '../../scripts/contabo-fence-operator.mjs';

const sha = 'a'.repeat(40);
test('reviewed commit and image must belong to the same bounded registry entry', () => {
  const registry = {
    version: 1,
    releases: [
      { commit: sha, imageId: 'sha256:' + 'b'.repeat(64) },
      { commit: 'c'.repeat(40), imageId: 'sha256:' + 'd'.repeat(64) },
    ],
  };
  reviewedRecoveryRelease(registry.releases[0], registry);
  reviewedRecoveryRelease(registry.releases[1], registry);
  assert.throws(() =>
    reviewedRecoveryRelease(
      { commit: sha, imageId: registry.releases[1].imageId },
      registry,
    ),
  );
  for (const mutate of [
    (v) => (v.version = true),
    (v) => (v.extra = true),
    (v) => (v.releases = []),
    (v) => (v.releases[1].commit = sha),
    (v) => (v.releases[1].imageId = v.releases[0].imageId),
    (v) => (v.releases[0].extra = true),
    (v) => (v.releases[0].imageId = 'alterward:latest'),
  ]) {
    const bad = structuredClone(registry);
    mutate(bad);
    assert.throws(() => reviewedRecoveryRelease(registry.releases[0], bad));
  }
});
const run = (changes = {}) => ({
  id: 123,
  head_sha: sha,
  path: '.github/workflows/ci.yml',
  status: 'completed',
  conclusion: 'success',
  ...changes,
});
const jobs = () => ({
  total_count: 2,
  jobs: ['verify', 'container'].map((name) => ({
    name,
    head_sha: sha,
    status: 'completed',
    conclusion: 'success',
  })),
});
test('only the actual full main workflow and both successful exact jobs qualify', () => {
  assert.equal(
    exactFenceCiRuns({ total_count: 1, workflow_runs: [run()] }, sha).length,
    1,
  );
  assertExactFenceCiJobs(jobs(), sha);
});
test('a successful sibling cannot conceal a failed, cancelled or running verification', () => {
  for (const state of [
    { conclusion: 'failure' },
    { conclusion: 'cancelled' },
    { status: 'in_progress', conclusion: null },
    { head_sha: 'b'.repeat(40) },
  ])
    assert.throws(() =>
      exactFenceCiRuns(
        { total_count: 2, workflow_runs: [run(), run({ id: 124, ...state })] },
        sha,
      ),
    );
  assert.throws(() =>
    exactFenceCiRuns(
      {
        total_count: 1,
        workflow_runs: [run({ path: '.github/workflows/unrelated.yml' })],
      },
      sha,
    ),
  );
  assert.throws(() =>
    exactFenceCiRuns({ total_count: 101, workflow_runs: [run()] }, sha),
  );
});
test('a missing, duplicate, stale or failing required job refuses the drill', () => {
  for (const change of [
    { name: 'unrelated' },
    { name: 'verify' },
    { head_sha: 'b'.repeat(40) },
    { conclusion: 'failure' },
    { status: 'in_progress' },
  ]) {
    const value = jobs();
    value.jobs[1] = { ...value.jobs[1], ...change };
    assert.throws(() => assertExactFenceCiJobs(value, sha));
  }
  const value = jobs();
  value.jobs.pop();
  value.total_count = 1;
  assert.throws(() => assertExactFenceCiJobs(value, sha));
});
