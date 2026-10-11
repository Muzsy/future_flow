import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  exactFenceCiRuns,
  assertExactFenceCiJobs,
} from '../../scripts/contabo-fence-operator.mjs';

const sha = 'a'.repeat(40);
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
