import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const script = 'scripts/contabo-release-window.sh';
const run = (...args) =>
  spawnSync('bash', [script, ...args], { encoding: 'utf8', timeout: 10000 });
const valid = [
  '--commit',
  'a'.repeat(40),
  '--image',
  `sha256:${'b'.repeat(64)}`,
  '--tag',
  `alterward:contabo-${'a'.repeat(12)}`,
  '--build-dir',
  '/root/alterward-ops/image-test',
  '--label',
  'test',
];

test('the release window script parses', () => {
  assert.equal(spawnSync('bash', ['-n', script]).status, 0);
});

test('it refuses malformed or mismatched release arguments before any step', () => {
  for (const [flag, value] of [
    ['--commit', 'abc'],
    ['--image', 'sha256:short'],
    ['--tag', 'alterward:contabo-ffffffffffff'],
    ['--build-dir', '/tmp/elsewhere'],
    ['--label', 'bad label'],
    ['--capacity', 'ten'],
    ['--free', '-5'],
    ['--free', 'many'],
  ]) {
    const args = [...valid];
    const at = args.indexOf(flag);
    if (at >= 0) args[at + 1] = value;
    else args.push(flag, value);
    const result = run(...args);
    assert.equal(result.status, 2, `${flag} ${value}`);
    assert.match(result.stderr, /Invalid|Unknown/);
  }
  assert.equal(run('--surprise').status, 2);
});

test('preflight runs before the first service change', () => {
  const text = readFileSync(script, 'utf8');
  const preflight = text.indexOf("say 'preflight ok'");
  for (const check of [
    'operator HEAD is not the release commit',
    'the audit file is not written for this commit',
    'main CI on the release commit is not green',
    'server build or rehearsal evidence does not match',
  ])
    assert.ok(
      text.indexOf(check) > 0 && text.indexOf(check) < preflight,
      check,
    );
  assert.ok(preflight < text.indexOf('op pause'));
  // C1-C3 are part of the window, not manual steps.
  assert.match(text, /isolate_capability \|\| abort/);
  // --free counts the places used when the wave closes in this window.
  assert.ok(
    text.indexOf('CAPACITY=$((used + FREE))') >
      text.indexOf('op wave --close ||'),
  );
  assert.match(text, /wait_recovery \|\| return 1/);
  assert.match(text, /for _ in 1 2; do\n {4}wait_recovery/);
});
