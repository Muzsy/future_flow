import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  exactFenceCiRuns,
  assertExactFenceCiJobs,
  reviewedRecoveryRelease,
  activeRecoveryManifest,
  assertReplayInputsUnchanged,
} from '../../scripts/contabo-fence-operator.mjs';

const sha = 'a'.repeat(40);
test('JS and Python share one pinned canonical manifest byte contract', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/recovery-manifest.json', import.meta.url)),
  );
  const stage = {
    ...fixture.manifest,
    upgraded: true,
    imageOnly: true,
    runningServices: 3,
    paidAiCalls: 0,
    betaWindowActive: false,
  };
  const build = { commit: stage.commit, imageId: stage.imageId };
  assert.equal(
    activeRecoveryManifest(stage, build, { version: 1, releases: [build] }),
    fixture.expectedCanonicalSha256,
  );
});
test('a registry entry cannot silently change the replay schema or runtime dependencies', () => {
  const registry = {
    version: 1,
    releases: [{ commit: sha, imageId: 'sha256:' + 'b'.repeat(64) }],
  };
  let visited = false;
  assertReplayInputsUnchanged(registry, sha, (base, commit, paths) => {
    visited = true;
    assert.equal(base, '9eb7732b69e84583cf7e63c237763b51b9bb4eab');
    assert.equal(commit, sha);
    assert.deepEqual(paths, [
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
    return '';
  });
  assert.equal(visited, true);
  for (const path of [
    'database/migrations/new.sql',
    'packages/ai/src/new-provider.ts',
    'pnpm-lock.yaml',
    'apps/api/package.json',
    'pnpm-workspace.yaml',
    'tsconfig.base.json',
  ])
    assert.throws(() =>
      assertReplayInputsUnchanged(registry, sha, () => path + '\n'),
    );
  assert.throws(() =>
    assertReplayInputsUnchanged(registry, sha, () => undefined),
  );
  for (const source of ['--help', undefined, 'b'.repeat(39)])
    assert.throws(() =>
      assertReplayInputsUnchanged(registry, source, () => ''),
    );
  assert.throws(() =>
    assertReplayInputsUnchanged(
      { version: 1, releases: [{ commit: '--help' }] },
      sha,
      () => '',
    ),
  );
  const mounted = 'c'.repeat(40);
  assert.throws(() =>
    assertReplayInputsUnchanged(registry, mounted, (_base, current) =>
      current === mounted ? 'packages/database/src/ai-budget.ts\n' : '',
    ),
  );
});
test('a future prepared candidate cannot replace the still-active manifest binding', () => {
  const stage = {
    commit: sha,
    imageId: 'sha256:' + 'b'.repeat(64),
    upgraded: true,
    imageOnly: true,
    runningServices: 3,
    paidAiCalls: 0,
    betaWindowActive: false,
    ownerEnvironmentSha256: 'c'.repeat(64),
    effectiveComposeSha256: 'd'.repeat(64),
    sourceComposeSha256: 'e'.repeat(64),
    databaseCaSha256: 'f'.repeat(64),
    accessConfigurationSha256: '1'.repeat(64),
  };
  const build = { commit: stage.commit, imageId: stage.imageId };
  const registry = {
    version: 1,
    releases: [
      build,
      { commit: '2'.repeat(40), imageId: 'sha256:' + '3'.repeat(64) },
    ],
  };
  const expected = activeRecoveryManifest(stage, build, registry);
  assert.match(expected, /^[a-f0-9]{64}$/);
  assert.equal(
    activeRecoveryManifest(
      { ...stage, capturedAt: 'another-time' },
      build,
      registry,
    ),
    expected,
  );
  assert.equal(
    activeRecoveryManifest(
      {
        ...stage,
        imageOnly: false,
        configurationOnly: true,
        configurationMode: 'readers',
        selectedReaders: 10,
        accessEmailCount: 11,
      },
      build,
      registry,
    ),
    expected,
  );
  for (const changes of [
    { commit: registry.releases[1].commit },
    { imageId: registry.releases[1].imageId },
    { ownerEnvironmentSha256: 'changed' },
    { upgraded: false },
    { imageOnly: false },
    { paidAiCalls: 1 },
    { betaWindowActive: true },
    { runningServices: 2 },
    {
      imageOnly: false,
      configurationOnly: true,
      configurationMode: 'funded',
      selectedReaders: 1,
      accessEmailCount: 2,
    },
    {
      imageOnly: false,
      configurationOnly: true,
      configurationMode: 'readers',
      selectedReaders: 11,
      accessEmailCount: 12,
    },
    {
      imageOnly: false,
      configurationOnly: true,
      configurationMode: 'readers',
      selectedReaders: 1,
      accessEmailCount: 11,
    },
  ]) {
    assert.throws(() =>
      activeRecoveryManifest({ ...stage, ...changes }, build, registry),
    );
  }
  assert.throws(() =>
    activeRecoveryManifest(stage, registry.releases[1], registry),
  );
});
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
