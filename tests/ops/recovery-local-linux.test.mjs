import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { join, resolve } from 'node:path';
import {
  assertSafeUnitPath,
  collectPins,
  renderUnits,
  renderWrapper,
  sourcePaths,
  SERVICE,
  TIMER,
} from '../../scripts/contabo-recovery-sync-timer.mjs';
import { linuxSshHardening } from '../../scripts/lib/operator-platform.mjs';

const linuxOnly = { skip: process.platform !== 'linux' };
const repository = resolve(import.meta.dirname, '../..');

function privateDirectory() {
  const root = fs.mkdtempSync(join(os.tmpdir(), 'alterward-recovery-'));
  fs.chmodSync(root, 0o700);
  return root;
}

test('Linux SSH never uses config, agents, global pins or forwarding', () => {
  assert.deepEqual(linuxSshHardening('win32'), []);
  const options = linuxSshHardening('linux').join(' ');
  for (const expected of [
    '-F none',
    'GlobalKnownHostsFile=none',
    'IdentitiesOnly=yes',
    'IdentityAgent=none',
    'ClearAllForwardings=yes',
  ])
    assert.match(options, new RegExp(expected));
});

test('the user timer is hourly at :11 UTC, persistent and one-shot', () => {
  const units = renderUnits({
    node: '/usr/bin/node',
    wrapper: '/home/op/ws/.local/contabo-recovery/managed-sync-timer.mjs',
    workspace: '/home/op/ws',
  });
  assert.match(units[TIMER], /OnCalendar=\*-\*-\* \*:11:00 UTC/);
  assert.match(units[TIMER], /Persistent=true/);
  assert.match(units[SERVICE], /Type=oneshot/);
  assert.match(units[SERVICE], /ExecStart=\/usr\/bin\/node \/home\/op\/ws\//);
  assert.match(units[SERVICE], /TimeoutStartSec=900/);
  assert.doesNotMatch(units[SERVICE] + units[TIMER], /Password|Environment/);
});

test('unit paths must be plain absolute paths', () => {
  for (const bad of ['relative/path', '/a b/c', '/a/../b', '/a;rm', '/a\n/b'])
    assert.throws(() => assertSafeUnitPath(bad));
  assert.equal(assertSafeUnitPath('/home/op/ws'), '/home/op/ws');
  assert.throws(() =>
    renderUnits({ node: '/n', wrapper: '/w w', workspace: '/ws' }),
  );
});

test('the pin list covers the whole reviewed sync chain and itself', () => {
  for (const path of [
    'scripts/recovery-local.mjs',
    'scripts/supabase-managed-retention.mts',
    'scripts/legacy-recovery-retention.mts',
    'scripts/lib/local-managed-recovery.ts',
    'scripts/lib/operator-platform.mjs',
    'scripts/contabo-daily.mjs',
    'scripts/contabo-recovery-sync-timer.mjs',
    'pnpm-lock.yaml',
  ])
    assert.ok(sourcePaths.includes(path), path);
  for (const path of sourcePaths)
    assert.ok(fs.existsSync(join(repository, path)), path);
});

test(
  'wrapper refuses a changed pinned file and runs the sync only when pins match',
  linuxOnly,
  () => {
    const root = privateDirectory();
    try {
      fs.mkdirSync(join(root, 'scripts'));
      const marker = join(root, 'ran.txt');
      fs.writeFileSync(
        join(root, 'scripts/recovery-local.mjs'),
        `import fs from 'node:fs';
if (process.argv[2] !== '--sync-and-expire') process.exit(3);
fs.writeFileSync(${JSON.stringify(marker)}, [process.env.ALTERWARD_PYTHON, process.env.ALTERWARD_SSH_SECRETS_DIR, process.env.FROM_ENV_FILE].join('|'));
`,
      );
      fs.writeFileSync(join(root, '.env'), 'FROM_ENV_FILE=env-file-loaded\n');
      const pinned = join(root, 'scripts/recovery-local.mjs');
      const wrapper = join(root, 'wrapper.mjs');
      const log = join(root, 'wrapper.log');
      const hash = (path) =>
        execFileSync('sha256sum', [path], { encoding: 'utf8' }).split(' ')[0];
      fs.writeFileSync(
        wrapper,
        renderWrapper({
          node: process.execPath,
          python: '/opt/python',
          secrets: '/opt/secrets',
          workspace: root,
          log,
          pins: [
            { path: pinned, hash: hash(pinned) },
            { path: process.execPath, hash: hash(process.execPath) },
          ],
        }),
      );
      const ok = spawnSync(process.execPath, [wrapper], { cwd: '/' });
      assert.equal(ok.status, 0);
      assert.equal(
        fs.readFileSync(marker, 'utf8'),
        '/opt/python|/opt/secrets|env-file-loaded',
      );
      assert.equal((fs.statSync(log).mode & 0o777).toString(8), '600');
      fs.rmSync(marker);
      fs.appendFileSync(pinned, '\n// tampered\n');
      const refused = spawnSync(process.execPath, [wrapper], { cwd: '/' });
      assert.equal(refused.status, 1);
      assert.equal(fs.existsSync(marker), false);
      assert.match(
        fs.readFileSync(log, 'utf8'),
        /Managed recovery sync failed/,
      );
      assert.doesNotMatch(fs.readFileSync(log, 'utf8'), /opt\/secrets/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test('collectPins requires exact committed bytes', linuxOnly, () => {
  const root = privateDirectory();
  try {
    const git = (...args) =>
      execFileSync(
        'git',
        ['-c', 'user.name=Fixture', '-c', 'user.email=f@localhost', ...args],
        { cwd: root, encoding: 'utf8' },
      );
    git('init', '-q');
    for (const path of sourcePaths) {
      fs.mkdirSync(join(root, path, '..'), { recursive: true });
      fs.writeFileSync(join(root, path), `synthetic ${path}\n`);
    }
    fs.mkdirSync(join(root, 'node_modules/tsx/dist'), { recursive: true });
    fs.writeFileSync(join(root, 'node_modules/tsx/dist/a.mjs'), 'tsx\n');
    git('add', '.');
    git('commit', '-qm', 'fixture', '--no-gpg-sign');
    const python = join(root, 'python');
    fs.writeFileSync(python, 'synthetic-python');
    const pins = collectPins({
      workspace: root,
      node: process.execPath,
      python,
    });
    assert.equal(pins.length, sourcePaths.length + 3);
    fs.appendFileSync(join(root, 'pnpm-lock.yaml'), 'drift\n');
    assert.throws(() =>
      collectPins({ workspace: root, node: process.execPath, python }),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test(
  'Linux sync uses the pinned hardened SSH path and records a failure receipt',
  linuxOnly,
  () => {
    const root = privateDirectory();
    try {
      const git = (...args) =>
        execFileSync(
          'git',
          ['-c', 'user.name=Fixture', '-c', 'user.email=f@localhost', ...args],
          { cwd: root, encoding: 'utf8' },
        );
      git('init', '-q');
      const files = [
        'scripts/recovery-local.mjs',
        'scripts/lib/private-report.ts',
        'scripts/lib/operator-platform.mjs',
        'scripts/ops/contabo-recovery-install.py',
      ];
      for (const path of files) {
        fs.mkdirSync(join(root, path, '..'), { recursive: true });
        fs.copyFileSync(join(repository, path), join(root, path));
      }
      git('add', '.');
      git('commit', '-qm', 'fixture', '--no-gpg-sign');
      // An uncommitted operator helper must stop the sync before any work and
      // still send the limited false receipt through the hardened Linux SSH path.
      fs.appendFileSync(
        join(root, 'scripts/lib/operator-platform.mjs'),
        '\n//\n',
      );
      const secrets = join(root, 'secrets');
      fs.mkdirSync(secrets, { mode: 0o700 });
      fs.writeFileSync(
        join(secrets, 'contabo_alterward_ed25519'),
        'synthetic',
        {
          mode: 0o600,
        },
      );
      fs.writeFileSync(
        join(secrets, 'contabo_known_hosts'),
        '192.0.2.7 ssh-ed25519 AAAAsynthetic\n',
        { mode: 0o600 },
      );
      const bin = join(root, 'bin');
      fs.mkdirSync(bin, { mode: 0o700 });
      const calls = join(root, 'ssh-calls.txt');
      fs.writeFileSync(
        join(bin, 'ssh'),
        `#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(calls)}
cat > /dev/null
printf '{"localAttestationRecorded":true,"ok":false}'
`,
        { mode: 0o700 },
      );
      const result = spawnSync(
        process.execPath,
        ['scripts/recovery-local.mjs', '--sync-and-expire'],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            ALTERWARD_SSH_SECRETS_DIR: secrets,
          },
        },
      );
      assert.equal(result.status, 1);
      const invoked = fs.readFileSync(calls, 'utf8').trim().split('\n');
      assert.equal(invoked.length, 1);
      assert.match(invoked[0], /^-F none -o GlobalKnownHostsFile=none /);
      assert.match(invoked[0], /-o StrictHostKeyChecking=yes/);
      assert.match(invoked[0], /-o BatchMode=yes/);
      assert.match(invoked[0], /root@192\.0\.2\.7 /);
      assert.doesNotMatch(result.stdout + result.stderr, /synthetic|192\.0\.2/);
      const failure = JSON.parse(
        fs.readFileSync(
          join(root, '.local/contabo-recovery/local-sync-failure.json'),
          'utf8',
        ),
      );
      assert.equal(failure.ok, false);
      assert.equal(failure.rawErrorRecorded, false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'Linux sync refuses an unprotected secrets directory without contacting the server',
  linuxOnly,
  () => {
    const root = privateDirectory();
    try {
      const git = (...args) =>
        execFileSync(
          'git',
          ['-c', 'user.name=Fixture', '-c', 'user.email=f@localhost', ...args],
          { cwd: root, encoding: 'utf8' },
        );
      git('init', '-q');
      for (const path of [
        'scripts/recovery-local.mjs',
        'scripts/lib/private-report.ts',
        'scripts/lib/operator-platform.mjs',
        'scripts/ops/contabo-recovery-install.py',
      ]) {
        fs.mkdirSync(join(root, path, '..'), { recursive: true });
        fs.copyFileSync(join(repository, path), join(root, path));
      }
      git('add', '.');
      git('commit', '-qm', 'fixture', '--no-gpg-sign');
      fs.appendFileSync(
        join(root, 'scripts/lib/operator-platform.mjs'),
        '\n//\n',
      );
      const secrets = join(root, 'secrets');
      fs.mkdirSync(secrets, { mode: 0o755 });
      fs.chmodSync(secrets, 0o755);
      for (const name of ['contabo_alterward_ed25519', 'contabo_known_hosts'])
        fs.writeFileSync(join(secrets, name), '192.0.2.7 ssh-ed25519 x', {
          mode: 0o600,
        });
      const bin = join(root, 'bin');
      fs.mkdirSync(bin, { mode: 0o700 });
      const calls = join(root, 'ssh-calls.txt');
      fs.writeFileSync(join(bin, 'ssh'), `#!/bin/sh\necho x >> ${calls}\n`, {
        mode: 0o700,
      });
      const result = spawnSync(
        process.execPath,
        ['scripts/recovery-local.mjs', '--sync-and-expire'],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            ALTERWARD_SSH_SECRETS_DIR: secrets,
          },
        },
      );
      assert.equal(result.status, 1);
      assert.equal(fs.existsSync(calls), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
