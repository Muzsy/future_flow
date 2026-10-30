import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertSafeUnitPath,
  changedPins,
  collectPins,
  readSyncState,
  readWrapperConfig,
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
    'UpdateHostKeys=no',
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
          state: join(root, 'wrapper-state.json'),
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

test(
  'wrapper counts consecutive failures and alerts only from the second one',
  linuxOnly,
  () => {
    const root = privateDirectory();
    try {
      fs.mkdirSync(join(root, 'scripts'));
      const pinned = join(root, 'scripts/recovery-local.mjs');
      const toggle = join(root, 'fail');
      fs.writeFileSync(
        pinned,
        `import fs from 'node:fs';
process.exit(fs.existsSync(${JSON.stringify(toggle)}) ? 5 : 0);
`,
      );
      fs.writeFileSync(join(root, '.env'), '');
      const notified = join(root, 'notified.txt');
      const notify = join(root, 'notify-send');
      fs.writeFileSync(
        notify,
        `#!/bin/sh\nprintf '%s|%s|%s\\n' "$1" "$2" "$3" >> ${JSON.stringify(notified)}\nenv > ${JSON.stringify(join(root, 'notify-env.txt'))}\n`,
        { mode: 0o700 },
      );
      const state = join(root, 'state.json');
      const wrapper = join(root, 'wrapper.mjs');
      const hash = (path) =>
        execFileSync('sha256sum', [path], { encoding: 'utf8' }).split(' ')[0];
      fs.writeFileSync(
        wrapper,
        renderWrapper({
          node: process.execPath,
          python: '/opt/python',
          secrets: '/opt/secrets',
          workspace: root,
          log: join(root, 'wrapper.log'),
          state,
          notify,
          pins: [{ path: pinned, hash: hash(pinned) }],
        }),
      );
      const run = () =>
        spawnSync(process.execPath, [wrapper], {
          cwd: '/',
          env: { ...process.env, ALTERWARD_SECRET_PROBE: 'must-not-leak' },
        });
      assert.equal(run().status, 0);
      let current = readSyncState(state);
      assert.equal(current.consecutiveFailures, 0);
      assert.ok(current.lastSuccessAt);
      assert.equal(current.lastFailure, null);
      assert.equal((fs.statSync(state).mode & 0o777).toString(8), '600');
      assert.equal(fs.existsSync(notified), false);

      fs.writeFileSync(toggle, '');
      assert.equal(run().status, 5);
      current = readSyncState(state);
      assert.equal(current.consecutiveFailures, 1);
      assert.equal(current.lastFailure, 'sync-failed');
      assert.equal(fs.existsSync(notified), false, 'one failure is silent');

      assert.equal(run().status, 5);
      assert.equal(readSyncState(state).consecutiveFailures, 2);
      const message = fs.readFileSync(notified, 'utf8');
      assert.match(message, /2 egymás utáni sikertelen futás/);
      assert.match(message, /--inspect/);
      // The notifier gets no sync environment, secret path or key material.
      const environment = fs.readFileSync(join(root, 'notify-env.txt'), 'utf8');
      assert.doesNotMatch(environment, /ALTERWARD_|must-not-leak|opt\/secrets/);
      assert.doesNotMatch(
        fs.readFileSync(state, 'utf8'),
        /opt\/secrets|\/opt\/python|[a-f0-9]{64}/,
      );

      // A pin mismatch is its own category and keeps counting, fail closed.
      fs.appendFileSync(pinned, '\n// tampered\n');
      assert.equal(run().status, 1);
      current = readSyncState(state);
      assert.equal(current.consecutiveFailures, 3);
      assert.equal(current.lastFailure, 'pin-mismatch');
      assert.equal(
        changedPins(readWrapperConfig(fs.readFileSync(wrapper, 'utf8'))).join(),
        'scripts/recovery-local.mjs',
      );

      // A missing notifier or corrupt state never hides the failure itself.
      fs.writeFileSync(state, 'not json');
      fs.rmSync(notify);
      assert.equal(run().status, 1);
      assert.equal(readSyncState(state).consecutiveFailures, 1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test('the wrapper needs an absolute state path and exposes its pins', () => {
  assert.throws(() =>
    renderWrapper({
      node: '/n',
      python: '/p',
      secrets: '/s',
      workspace: '/w',
      log: '/l',
      state: 'relative.json',
      pins: [],
    }),
  );
  const pins = [{ path: '/w/a.mjs', hash: 'a'.repeat(64) }];
  const source = renderWrapper({
    node: '/n',
    python: '/p',
    secrets: '/s',
    workspace: '/w',
    log: '/l',
    state: '/w/state.json',
    pins,
  });
  assert.deepEqual(readWrapperConfig(source).pins, pins);
  assert.throws(() => readWrapperConfig('// not generated'));
  assert.equal(readSyncState('/nonexistent/state.json'), null);
});

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

function commitFixture(root, files) {
  const git = (...args) =>
    execFileSync(
      'git',
      ['-c', 'user.name=Fixture', '-c', 'user.email=f@localhost', ...args],
      { cwd: root, encoding: 'utf8' },
    );
  git('init', '-q');
  for (const path of files) {
    fs.mkdirSync(join(root, path, '..'), { recursive: true });
    fs.copyFileSync(join(repository, path), join(root, path));
  }
  git('add', '.');
  git('commit', '-qm', 'fixture', '--no-gpg-sign');
}

function protectedSecrets(root, mode = 0o700) {
  const secrets = join(root, 'secrets');
  fs.mkdirSync(secrets, { mode });
  fs.chmodSync(secrets, mode);
  fs.writeFileSync(join(secrets, 'contabo_alterward_ed25519'), 'synthetic', {
    mode: 0o600,
  });
  fs.writeFileSync(
    join(secrets, 'contabo_known_hosts'),
    '192.0.2.7 ssh-ed25519 AAAAsynthetic\n',
    { mode: 0o600 },
  );
  return secrets;
}

function fakeBin(root, name, body) {
  const bin = join(root, 'bin');
  fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
  fs.writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o700 });
  return bin;
}

const retention = [
  {
    script: 'scripts/supabase-managed-retention.mts',
    support: [
      'scripts/lib/private-report.ts',
      'scripts/lib/operator-platform.mjs',
      'scripts/lib/local-managed-recovery.ts',
      'scripts/lib/managed-retention.ts',
      'scripts/ops/local-managed-recovery.py',
      'scripts/ops/contabo-managed-expiry.py',
      'pnpm-lock.yaml',
    ],
  },
  {
    script: 'scripts/legacy-recovery-retention.mts',
    support: [
      'scripts/lib/private-report.ts',
      'scripts/lib/operator-platform.mjs',
      'scripts/ops/legacy-recovery-retention.py',
      'scripts/ops/local-managed-recovery.py',
      'scripts/ops/contabo-managed-expiry.py',
      'pnpm-lock.yaml',
    ],
  },
];

for (const { script, support } of retention) {
  const run = (root, secrets, bin) =>
    spawnSync(
      process.execPath,
      [
        '--import',
        pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href,
        script,
        '--check',
      ],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          ALTERWARD_SSH_SECRETS_DIR: secrets,
          ALTERWARD_PYTHON: join(root, 'python-stub'),
          SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
        },
      },
    );
  const prepare = (mode) => {
    const root = privateDirectory();
    commitFixture(root, [script, ...support]);
    fs.mkdirSync(join(root, '.local/supabase-recovery'), {
      recursive: true,
      mode: 0o700,
    });
    // A regular wrapper that execs the system Python keeps the exact-file rules.
    fs.writeFileSync(
      join(root, 'python-stub'),
      '#!/bin/sh\nexec /usr/bin/python3 "$@"\n',
      { mode: 0o700 },
    );
    const secrets = protectedSecrets(root, mode);
    const calls = join(root, 'ssh-calls.txt');
    const bin = fakeBin(
      root,
      'ssh',
      `printf '%s\\n' "$*" >> ${JSON.stringify(calls)}\ncat > /dev/null\nprintf '{"ok":false}'`,
    );
    return { root, secrets, bin, calls };
  };
  test(
    `${script} runs on Linux over hardened SSH with the protected secrets directory`,
    linuxOnly,
    () => {
      const { root, secrets, bin, calls } = prepare(0o700);
      try {
        const result = run(root, secrets, bin);
        assert.equal(result.status, 1);
        const invoked = fs.readFileSync(calls, 'utf8').trim().split('\n');
        assert.match(invoked[0], /^-F none -o GlobalKnownHostsFile=none /);
        assert.match(invoked[0], /-o UpdateHostKeys=no /);
        assert.match(invoked[0], /-o StrictHostKeyChecking=yes/);
        assert.match(invoked[0], /root@192\.0\.2\.7 /);
        assert.doesNotMatch(
          result.stdout + result.stderr,
          /synthetic|192\.0\.2/,
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );
  test(
    `${script} refuses an unprotected secrets directory before any SSH call`,
    linuxOnly,
    () => {
      const { root, secrets, bin, calls } = prepare(0o755);
      try {
        assert.equal(run(root, secrets, bin).status, 1);
        assert.equal(fs.existsSync(calls), false);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );
}

test(
  'timer install writes pinned units, refuses a second install, and remove cleans the wrapper too',
  linuxOnly,
  () => {
    if (fs.realpathSync(process.execPath) !== process.execPath) return;
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
        if (
          [
            'scripts/contabo-recovery-sync-timer.mjs',
            'scripts/lib/operator-platform.mjs',
          ].includes(path)
        )
          fs.copyFileSync(join(repository, path), join(root, path));
        else fs.writeFileSync(join(root, path), `synthetic ${path}\n`);
      }
      fs.mkdirSync(join(root, 'node_modules/tsx/dist'), { recursive: true });
      fs.writeFileSync(join(root, 'node_modules/tsx/dist/a.mjs'), 'tsx\n');
      git('add', '.');
      git('commit', '-qm', 'fixture', '--no-gpg-sign');
      fs.mkdirSync(join(root, '.local'), { mode: 0o700 });
      const secrets = protectedSecrets(root);
      const python = join(root, 'python-real');
      fs.writeFileSync(python, 'synthetic-python');
      const home = join(root, 'home');
      fs.mkdirSync(home, { mode: 0o700 });
      const calls = join(root, 'systemctl-calls.txt');
      const bin = fakeBin(
        root,
        'systemctl',
        `printf '%s\\n' "$*" >> ${JSON.stringify(calls)}`,
      );
      const timerScript = join(root, 'scripts/contabo-recovery-sync-timer.mjs');
      const run = (action, cwd = root) =>
        spawnSync(process.execPath, [timerScript, action], {
          cwd,
          encoding: 'utf8',
          env: {
            ...process.env,
            HOME: home,
            PATH: `${bin}:${process.env.PATH}`,
            ALTERWARD_PYTHON: python,
            ALTERWARD_SSH_SECRETS_DIR: secrets,
          },
        });
      const installed = run('--install');
      assert.equal(installed.status, 0, installed.stderr);
      const wrapper = join(
        root,
        '.local/contabo-recovery/managed-sync-timer.mjs',
      );
      const unitDirectory = join(home, '.config/systemd/user');
      assert.ok(fs.existsSync(wrapper));
      assert.deepEqual(fs.readdirSync(unitDirectory).sort(), [SERVICE, TIMER]);
      assert.equal((fs.statSync(wrapper).mode & 0o777).toString(8), '600');
      assert.match(
        fs.readFileSync(calls, 'utf8'),
        /--user enable --now alterward-recovery-sync.timer/,
      );
      assert.equal(run('--install').status, 1);
      // A missing operator input is named (never its value) instead of a generic stop.
      for (const name of ['ALTERWARD_PYTHON', 'ALTERWARD_SSH_SECRETS_DIR']) {
        const refused = spawnSync(
          process.execPath,
          [timerScript, '--install'],
          {
            cwd: root,
            encoding: 'utf8',
            env: {
              ...process.env,
              HOME: home,
              PATH: `${bin}:${process.env.PATH}`,
              ALTERWARD_PYTHON: python,
              ALTERWARD_SSH_SECRETS_DIR: secrets,
              [name]: '',
            },
          },
        );
        assert.equal(refused.status, 1);
        assert.match(refused.stderr, new RegExp(`${name} must be`));
        assert.doesNotMatch(refused.stderr, new RegExp(root));
      }
      // --inspect compares the installed pins with the files and names drift.
      const inspected = () => JSON.parse(run('--inspect').stdout);
      assert.equal(inspected().pinsCurrent, true);
      assert.deepEqual(inspected().changedPins, []);
      assert.equal(inspected().syncState, null);
      fs.appendFileSync(join(root, 'pnpm-lock.yaml'), 'drift\n');
      assert.equal(inspected().pinsCurrent, false);
      assert.deepEqual(inspected().changedPins, ['pnpm-lock.yaml']);
      assert.doesNotMatch(run('--inspect').stdout, /[a-f0-9]{64}/);
      git('checkout', '--', 'pnpm-lock.yaml');
      assert.equal(inspected().pinsCurrent, true);
      // Started from another directory nothing is touched, not even a wrapper.
      assert.equal(run('--remove', home).status, 1);
      assert.equal(run('--install', home).status, 1);
      assert.ok(fs.existsSync(wrapper));
      assert.equal(run('--remove').status, 0);
      assert.equal(fs.existsSync(wrapper), false);
      assert.deepEqual(fs.readdirSync(unitDirectory), []);
      assert.match(
        fs.readFileSync(calls, 'utf8'),
        /--user disable --now alterward-recovery-sync.timer/,
      );
      // The reviewed source can be installed again after a removal.
      assert.equal(run('--install').status, 0);
      // A failed enable rolls the written files back instead of blocking reinstall.
      assert.equal(run('--remove').status, 0);
      fs.writeFileSync(
        join(bin, 'systemctl'),
        `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(calls)}\n[ "$2" = enable ] && exit 1\nexit 0\n`,
        { mode: 0o700 },
      );
      const before = fs.readFileSync(calls, 'utf8').split('\n').length;
      assert.equal(run('--install').status, 1);
      const after = fs
        .readFileSync(calls, 'utf8')
        .split('\n')
        .slice(before - 1);
      assert.match(
        after.join('|'),
        /enable --now.*\|--user disable --now.*\|--user daemon-reload/,
      );
      assert.equal(fs.existsSync(wrapper), false);
      assert.deepEqual(fs.readdirSync(unitDirectory), []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'Linux historical step reads only the enrolled server policy and never applies',
  linuxOnly,
  () => {
    const script = 'scripts/legacy-recovery-retention.mts';
    const root = privateDirectory();
    try {
      commitFixture(root, [
        script,
        'scripts/lib/private-report.ts',
        'scripts/lib/operator-platform.mjs',
        'scripts/ops/legacy-recovery-retention.py',
        'scripts/ops/local-managed-recovery.py',
        'scripts/ops/contabo-managed-expiry.py',
        'pnpm-lock.yaml',
      ]);
      const secrets = protectedSecrets(root);
      const calls = join(root, 'ssh-calls.txt');
      const digest = 'a'.repeat(64);
      const bin = fakeBin(
        root,
        'ssh',
        `printf 'CALL %s\\n' "$*" >> ${JSON.stringify(calls)}\ncat > /dev/null\nprintf '{"ok":true,"result":{"checkedAt":"2026-10-27T21:00:00+00:00","policyDigest":"${digest}","knownRuns":3}}'`,
      );
      const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        ALTERWARD_SSH_SECRETS_DIR: secrets,
      };
      delete env.ALTERWARD_PYTHON;
      const loader = pathToFileURL(
        createRequire(import.meta.url).resolve('tsx'),
      ).href;
      const result = spawnSync(
        process.execPath,
        ['--import', loader, script, '--server-check'],
        { cwd: root, encoding: 'utf8', env },
      );
      assert.equal(result.status, 0, result.stderr);
      const proof = JSON.parse(
        fs.readFileSync(
          join(root, '.local/legacy-retention/proof.json'),
          'utf8',
        ),
      );
      assert.equal(proof.mode, 'server-check');
      assert.equal(proof.localResult, null);
      assert.equal(proof.pythonHash, null);
      assert.equal(proof.serverResult.policyDigest, digest);
      assert.equal(fs.readFileSync(calls, 'utf8').match(/^CALL /gm).length, 1);
      assert.match(fs.readFileSync(calls, 'utf8'), /^CALL -F none /);
      // apply still demands the local operator Python and enrolled local state.
      const apply = spawnSync(
        process.execPath,
        ['--import', loader, script, '--apply'],
        { cwd: root, encoding: 'utf8', env },
      );
      assert.equal(apply.status, 1);
      assert.equal(fs.readFileSync(calls, 'utf8').match(/^CALL /gm).length, 1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'recovery-local on Linux asks for the server-only historical check and attests that digest',
  linuxOnly,
  () => {
    const root = privateDirectory();
    try {
      commitFixture(root, [
        'scripts/recovery-local.mjs',
        'scripts/lib/private-report.ts',
        'scripts/lib/operator-platform.mjs',
        'scripts/ops/contabo-recovery-install.py',
      ]);
      const git = (...args) =>
        execFileSync(
          'git',
          ['-c', 'user.name=Fixture', '-c', 'user.email=f@localhost', ...args],
          { cwd: root, encoding: 'utf8' },
        );
      const write = (path, text) => {
        fs.mkdirSync(join(root, path, '..'), { recursive: true });
        fs.writeFileSync(join(root, path), text);
      };
      const digest = 'b'.repeat(64);
      write('scripts/contabo-daily.mjs', 'process.exit(0);\n');
      write(
        'scripts/supabase-managed-retention.mts',
        `import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
fs.mkdirSync('.local/supabase-recovery', { recursive: true });
fs.writeFileSync('.local/supabase-recovery/managed-retention-proof.json', JSON.stringify({
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  mode: 'apply', metadataReconciled: true, checkedAt: new Date().toISOString(), serverFreshArchives: 3,
}));
`,
      );
      write(
        'scripts/legacy-recovery-retention.mts',
        `import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
fs.appendFileSync('.local/legacy-argv.txt', process.argv[2] + '\\n');
fs.mkdirSync('.local/legacy-retention', { recursive: true });
fs.writeFileSync('.local/legacy-retention/proof.json', JSON.stringify({
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  mode: process.argv[2] === '--server-check' ? 'server-check' : 'apply',
  checkedAt: new Date().toISOString(), localResult: null,
  serverResult: { policyDigest: ${JSON.stringify(digest)} },
}));
`,
      );
      git('add', '.');
      git('commit', '-qm', 'stubs', '--no-gpg-sign');
      fs.symlinkSync(
        join(repository, 'node_modules'),
        join(root, 'node_modules'),
      );
      const secrets = protectedSecrets(root);
      const requests = join(root, 'requests.jsonl');
      const bin = join(root, 'bin');
      fs.mkdirSync(bin, { mode: 0o700 });
      fs.writeFileSync(
        join(bin, 'ssh'),
        `#!${process.execPath}
const fs = require('node:fs');
const request = JSON.parse(fs.readFileSync(0, 'utf8')).request;
fs.appendFileSync(${JSON.stringify(requests)}, JSON.stringify(request) + '\\n');
const now = new Date().toISOString();
process.stdout.write(JSON.stringify(
  request.action === 'local-preconditions'
    ? { localExpiryPreconditionsVerified: true, observedAt: now, managedCapturedAt: now, applicationCapturedAt: now }
    : { localAttestationRecorded: true, ok: request.ok },
));
`,
        { mode: 0o700 },
      );
      fs.mkdirSync(join(root, '.local'), { recursive: true, mode: 0o700 });
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
          timeout: 60000,
        },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        fs.readFileSync(join(root, '.local/legacy-argv.txt'), 'utf8'),
        '--server-check\n',
      );
      const sent = fs
        .readFileSync(requests, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.deepEqual(
        sent.map((request) => request.action),
        ['local-preconditions', 'record-local'],
      );
      assert.equal(sent[1].ok, true);
      assert.equal(sent[1].managedArchives, 3);
      assert.equal(sent[1].legacyPolicyDigest, digest);
      assert.equal(sent[1].sourceCommit, git('rev-parse', 'HEAD').trim());
      const proof = JSON.parse(
        fs.readFileSync(
          join(root, '.local/contabo-recovery/local-sync-proof.json'),
          'utf8',
        ),
      );
      assert.equal(proof.externalAttestationRecorded, true);
      assert.equal(proof.keyRead, false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
