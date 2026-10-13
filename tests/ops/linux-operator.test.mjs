import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import {
  supportedOperatorPlatform,
  sameOperatorPath,
  assertLinuxPrivatePath,
  operatorSecretsDirectory,
  operatorCiReadToken,
} from '../../scripts/lib/operator-platform.mjs';
import { operatorChildEnvironment } from '../../scripts/contabo-personal-beta.mjs';

function fixture(run) {
  const root = fs.mkdtempSync(join(os.tmpdir(), 'alterward-private-'));
  fs.chmodSync(root, 0o700);
  const secrets = join(root, 'SSH inputs with spaces');
  fs.mkdirSync(secrets, { mode: 0o700 });
  for (const name of ['contabo_known_hosts', 'contabo_alterward_ed25519'])
    fs.writeFileSync(join(secrets, name), 'synthetic-not-a-credential', {
      mode: 0o600,
    });
  try {
    run({ root, secrets });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
test('only Windows and Linux operator hosts are supported', () => {
  assert.equal(supportedOperatorPlatform('linux'), true);
  assert.equal(supportedOperatorPlatform('win32'), true);
  assert.equal(supportedOperatorPlatform('darwin'), false);
  assert.equal(
    sameOperatorPath('/private/Keys', '/private/keys', 'linux'),
    false,
  );
  assert.equal(sameOperatorPath('C:/Keys', 'c:/keys', 'win32'), true);
});
test('funded child helpers retain only the explicit SSH directory and OS inputs', () => {
  assert.deepEqual(
    operatorChildEnvironment({
      PATH: '/usr/bin',
      ALTERWARD_SSH_SECRETS_DIR: '/private/ssh',
      OPENAI_API_KEY: 'never-child-env',
      SUPABASE_SERVICE_ROLE_KEY: 'never-child-env',
      NODE_OPTIONS: 'never-child-env',
      GIT_SSH_COMMAND: 'never-child-env',
    }),
    { PATH: '/usr/bin', ALTERWARD_SSH_SECRETS_DIR: '/private/ssh' },
  );
});
test(
  'Linux requires explicit original private SSH inputs, including paths with spaces',
  { skip: process.platform !== 'linux' },
  () =>
    fixture(({ secrets }) => {
      assert.equal(
        operatorSecretsDirectory({ ALTERWARD_SSH_SECRETS_DIR: secrets }),
        secrets,
      );
      assert.throws(
        () => operatorSecretsDirectory({ LOCALAPPDATA: '/synthetic/windows' }),
        /Explicit absolute/,
      );
      assert.throws(
        () =>
          operatorSecretsDirectory({
            ALTERWARD_SSH_SECRETS_DIR: 'relative/path',
          }),
        /Explicit absolute/,
      );
    }),
);
test(
  'Linux refuses public secrets without silently repairing permissions',
  { skip: process.platform !== 'linux' },
  () =>
    fixture(({ secrets }) => {
      const key = join(secrets, 'contabo_alterward_ed25519');
      fs.chmodSync(key, 0o644);
      assert.throws(
        () => operatorSecretsDirectory({ ALTERWARD_SSH_SECRETS_DIR: secrets }),
        /0600/,
      );
      assert.equal(fs.statSync(key).mode & 0o777, 0o644);
    }),
);
test(
  'Linux refuses aliases, hardlinks and shared ancestors',
  { skip: process.platform !== 'linux' },
  () =>
    fixture(({ root, secrets }) => {
      const alias = join(root, 'alias');
      fs.symlinkSync(secrets, alias);
      assert.throws(
        () => operatorSecretsDirectory({ ALTERWARD_SSH_SECRETS_DIR: alias }),
        /protected/,
      );
      const key = join(secrets, 'contabo_alterward_ed25519');
      const extra = join(root, 'hardlink');
      fs.linkSync(key, extra);
      assert.throws(
        () => operatorSecretsDirectory({ ALTERWARD_SSH_SECRETS_DIR: secrets }),
        /protected/,
      );
      fs.unlinkSync(extra);
      fs.chmodSync(root, 0o777);
      assert.throws(() => assertLinuxPrivatePath(key), /ancestor/);
    }),
);

// Run the real Linux entry point against a local transport double: validate
// committed dependencies, private inputs and exact SSH options, never a server.
test(
  'Linux daily CLI reaches pinned SSH with spaces and refuses dirty helper before SSH',
  { skip: process.platform !== 'linux' },
  async () => {
    const { execFileSync } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const root = fs.mkdtempSync(join(os.tmpdir(), 'alterward-cli-'));
    fs.chmodSync(root, 0o700);
    try {
      for (const path of [
        'scripts/contabo-daily.mjs',
        'scripts/lib/operator-platform.mjs',
        'scripts/lib/private-report.ts',
        'scripts/ops/contabo-daily-install.py',
      ]) {
        const dest = join(root, path);
        fs.mkdirSync(join(dest, '..'), { recursive: true });
        fs.copyFileSync(
          fileURLToPath(new URL('../../' + path, import.meta.url)),
          dest,
        );
      }
      const git = (args) =>
        execFileSync('git', args, { cwd: root, stdio: 'pipe' });
      git(['init', '-b', 'main']);
      git(['add', 'scripts']);
      git([
        '-c',
        'user.name=Synthetic Test',
        '-c',
        'user.email=test@example.invalid',
        'commit',
        '-m',
        'Synthetic isolated operator source',
      ]);
      const secrets = join(root, 'private SSH');
      fs.mkdirSync(secrets, { mode: 0o700 });
      fs.writeFileSync(
        join(secrets, 'contabo_known_hosts'),
        '192.0.2.1 ssh-ed25519 SYNTHETIC_PIN\n',
        { mode: 0o600 },
      );
      fs.writeFileSync(
        join(secrets, 'contabo_alterward_ed25519'),
        'SYNTHETIC_PRIVATE_KEY\n',
        { mode: 0o600 },
      );
      const bin = join(root, 'bin');
      fs.mkdirSync(bin, { mode: 0o700 });
      fs.writeFileSync(
        join(bin, 'ssh'),
        `#!/usr/bin/env node\nconst fs=require('fs');fs.writeFileSync('captured-transport.json',JSON.stringify(process.argv.slice(2)),{mode:0o600});let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',()=>{if(JSON.parse(input).action!=='status')process.exit(1);console.log(JSON.stringify({ok:true,result:{healthy:true,syntheticTransport:true}}));});\n`,
        { mode: 0o700 },
      );
      const env = {
        ...process.env,
        PATH: bin + ':' + process.env.PATH,
        ALTERWARD_SSH_SECRETS_DIR: secrets,
      };
      const output = execFileSync(
        process.execPath,
        ['scripts/contabo-daily.mjs', '--status'],
        { cwd: root, env, encoding: 'utf8', stdio: 'pipe' },
      );
      assert.equal(JSON.parse(output).ok, true);
      assert.ok(!output.includes('SYNTHETIC_PRIVATE_KEY'));
      const args = JSON.parse(
        fs.readFileSync(join(root, 'captured-transport.json')),
      );
      for (const required of [
        'none',
        'GlobalKnownHostsFile=none',
        'StrictHostKeyChecking=yes',
        'IdentitiesOnly=yes',
        'ClearAllForwardings=yes',
        'root@192.0.2.1',
      ])
        assert.ok(args.includes(required));
      assert.ok(
        args.includes(
          `UserKnownHostsFile="${join(secrets, 'contabo_known_hosts')}"`,
        ),
      );
      fs.unlinkSync(join(root, 'captured-transport.json'));
      fs.appendFileSync(
        join(root, 'scripts/lib/operator-platform.mjs'),
        "\nfs.writeFileSync('untrusted-helper-executed','bad');\n",
      );
      assert.throws(() =>
        execFileSync(
          process.execPath,
          ['scripts/contabo-daily.mjs', '--status'],
          { cwd: root, env, stdio: 'pipe' },
        ),
      );
      assert.equal(fs.existsSync(join(root, 'captured-transport.json')), false);
      assert.equal(
        fs.existsSync(join(root, 'untrusted-helper-executed')),
        false,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'Linux also protects a present recovery identity before any read',
  { skip: process.platform !== 'linux' },
  () =>
    fixture(({ secrets }) => {
      const identity = join(secrets, 'alterward_backup_identity.txt');
      fs.writeFileSync(identity, 'synthetic-identity', { mode: 0o644 });
      assert.throws(
        () => operatorSecretsDirectory({ ALTERWARD_SSH_SECRETS_DIR: secrets }),
        /0600/,
      );
      fs.chmodSync(identity, 0o600);
      assert.equal(
        operatorSecretsDirectory({ ALTERWARD_SSH_SECRETS_DIR: secrets }),
        secrets,
      );
    }),
);

test(
  'migrated GitHub CI credential is private and bound to the exact repository',
  { skip: process.platform !== 'linux' },
  () =>
    fixture(({ secrets }) => {
      const old = process.env.ALTERWARD_SSH_SECRETS_DIR;
      process.env.ALTERWARD_SSH_SECRETS_DIR = secrets;
      const file = join(secrets, 'github_ci_credential.json');
      const value = {
        protocol: 'https',
        host: 'github.com',
        path: 'Muzsy/future_flow.git',
        password: 'synthetic_ci_not_a_real_token',
      };
      try {
        fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
        assert.equal(operatorCiReadToken(), value.password);
        fs.writeFileSync(
          file,
          JSON.stringify({ ...value, path: 'someone/else.git' }),
        );
        assert.throws(() => operatorCiReadToken(), /Exact repository/);
        fs.writeFileSync(file, JSON.stringify(value));
        fs.chmodSync(file, 0o644);
        assert.throws(() => operatorCiReadToken(), /0600/);
      } finally {
        if (old === undefined) delete process.env.ALTERWARD_SSH_SECRETS_DIR;
        else process.env.ALTERWARD_SSH_SECRETS_DIR = old;
      }
    }),
);
