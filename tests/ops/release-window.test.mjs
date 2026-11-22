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
  '--pr',
  '224',
  '--card',
];

test('the release window script parses', () => {
  assert.equal(spawnSync('bash', ['-n', script]).status, 0);
});

test('no committed file is executable (the target build drops the mode bits)', () => {
  const modes = spawnSync('git', ['ls-files', '-s'], {
    encoding: 'utf8',
  }).stdout;
  assert.doesNotMatch(modes, /^100755 /m);
});

test('it refuses malformed or mismatched release arguments before any step', () => {
  for (const [flag, value] of [
    ['--commit', 'abc'],
    ['--image', 'sha256:short'],
    ['--tag', 'alterward:contabo-ffffffffffff'],
    ['--build-dir', '/tmp/elsewhere'],
    ['--label', 'bad label'],
    ['--capacity', 'ten'],
    ['--pr', 'x'],
    ['--approved-card', 'abc'],
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
  assert.equal(run(...valid, '--capacity', '53', '--free', '50').status, 2);
  // The window itself needs the approved card (KP5).
  const window = valid.filter((v) => v !== '--card');
  const missing = run(...window);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /--approved-card/);
});

test('preflight runs before the first service change', () => {
  const text = readFileSync(script, 'utf8');
  const preflight = text.indexOf("say 'preflight ok'");
  for (const check of [
    'operator HEAD is not the release commit',
    'main CI on the release commit is not green',
    'server build or rehearsal evidence does not match',
  ])
    assert.ok(
      text.indexOf(check) > 0 && text.indexOf(check) < preflight,
      check,
    );
  assert.ok(preflight < text.indexOf('op pause'));
  // KP5: the approved card is checked and the audit file written before pause.
  const approved = text.indexOf(
    'the release card differs from the approved one',
  );
  assert.ok(approved > preflight && approved < text.indexOf('op pause'));
  assert.ok(text.indexOf('owner approved release card') > approved);
  assert.ok(
    text.indexOf('owner approved release card') < text.indexOf('op pause'),
  );
  // C1-C3 are part of the window, not manual steps.
  assert.match(text, /isolate_capability \|\| abort/);
  // KP4 (053 lessons): added places get the exact approval the server asks
  // for, Daily is reactivated only when this window disabled it, and the
  // local recovery sync is refreshed for the new checkout.
  assert.match(text, /added=\$\(\( CAPACITY > cap \? CAPACITY - cap : 0 \)\)/);
  assert.match(text, /--approve-added "\$added"/);
  assert.doesNotMatch(text, /--approve-added 0/);
  assert.match(text, /if \[ "\$DAILY_DISABLED" = 1 \]; then daily activate/);
  assert.ok(
    text.indexOf('DAILY_DISABLED=1') > text.indexOf('daily disable ||'),
  );
  assert.ok(
    text.lastIndexOf('refresh_recovery_sync') >
      text.indexOf("say 'after apply'"),
  );
  // KP6: retention runs at the end, after the service is open again.
  assert.ok(
    text.indexOf('contabo-release-retention.py') >
      text.lastIndexOf('open_service\n'),
  );
  // --free counts the places used when the wave closes in this window.
  assert.ok(
    text.indexOf('CAPACITY=$((used + FREE))') >
      text.indexOf('op wave --close ||'),
  );
  assert.match(text, /wait_recovery \|\| return 1/);
  assert.match(text, /for _ in 1 2; do\n {4}wait_recovery/);
});
