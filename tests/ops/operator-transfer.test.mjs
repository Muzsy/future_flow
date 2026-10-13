import test from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { createHash, generateKeyPairSync } from 'node:crypto';
import {
  encryptTransfer,
  decryptTransfer,
  validateTransfer,
  importTransfer,
} from '../../scripts/operator-state-transfer.mjs';
const pair = generateKeyPairSync('rsa', {
  modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
function payload() {
  return {
    schemaVersion: 'alterward-operator-transfer-1',
    sourceCommit: 'a'.repeat(40),
    files: [
      'closed-site-operator/operator-config.json',
      'contabo-release/owner-stage-proof.json',
      'contabo-release/owner-active-build-proof.json',
      'contabo-release/backup-tool-versions.json',
      'contabo-daily/prepare-proof.json',
      'operator-secrets/contabo_known_hosts',
      'operator-secrets/contabo_alterward_ed25519',
      'operator-secrets/alterward_backup_identity.txt',
    ].map((path) => {
      const bytes = Buffer.from('synthetic-original-secret-or-receipt\r\n');
      return {
        path,
        data: bytes.toString('base64'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    }),
  };
}
test('authenticated encrypted transfer preserves every original byte and carries no plaintext credentials', () => {
  const input = payload(),
    envelope = encryptTransfer(input, pair.publicKey);
  assert.ok(!JSON.stringify(envelope).includes('synthetic-original'));
  assert.deepEqual(decryptTransfer(envelope, pair.privateKey), input);
});
test('ciphertext modification, wrong recipient and hash modification are rejected', () => {
  const envelope = encryptTransfer(payload(), pair.publicKey);
  const data = Buffer.from(envelope.ciphertext, 'base64');
  data[0] ^= 1;
  assert.throws(() =>
    decryptTransfer(
      { ...envelope, ciphertext: data.toString('base64') },
      pair.privateKey,
    ),
  );
  assert.throws(
    () =>
      decryptTransfer(
        { ...envelope, recipientSha256: '0'.repeat(64) },
        pair.privateKey,
      ),
    /recipient/,
  );
  const bad = payload();
  bad.files[0].sha256 = '0'.repeat(64);
  assert.throws(() => validateTransfer(bad), /hash/);
});
for (const path of [
  '../outside.json',
  'contabo-release/../../outside.json',
  'operator-secrets/provider-key',
  '/tmp/outside.json',
  'contabo-release/archives/anything.json',
  'contabo-release\\alias.json',
])
  test('rejects transfer path ' + path, () => {
    const bad = payload();
    bad.files[0].path = path;
    assert.throws(() => validateTransfer(bad), /path/);
  });
test('missing provenance, required input or duplicate entry is rejected', () => {
  const bad = payload();
  bad.files.pop();
  assert.throws(() => validateTransfer(bad), /missing/);
  assert.throws(() => validateTransfer({ ...payload(), sourceCommit: 'fake' }));
  const duplicate = payload();
  duplicate.files.push(duplicate.files[0]);
  assert.throws(() => validateTransfer(duplicate), /path/);
});
test(
  'Linux import verifies original hashes, creates private files, and refuses overwrite',
  { skip: process.platform !== 'linux' },
  () => {
    const root = fs.mkdtempSync(join(os.tmpdir(), 'alterward-import-'));
    fs.chmodSync(root, 0o700);
    try {
      const input = payload();
      assert.equal(importTransfer(input, root).hashesVerified, true);
      for (const entry of input.files) {
        const path = join(root, '.local', entry.path);
        assert.deepEqual(
          fs.readFileSync(path),
          Buffer.from(entry.data, 'base64'),
        );
        assert.equal(fs.statSync(path).mode & 0o777, 0o600);
        assert.equal(fs.statSync(join(root, '.local')).mode & 0o777, 0o700);
      }
      assert.throws(() => importTransfer(input, root), /Empty private/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test('standalone exporter captures original receipts and identity without changing sources', () => {
  const root = fs.mkdtempSync(join(os.tmpdir(), 'alterward-export-'));
  fs.chmodSync(root, 0o700);
  try {
    execFileSync('git', ['init', '-b', 'main'], { cwd: root, stdio: 'pipe' });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Synthetic Test',
        '-c',
        'user.email=test@example.invalid',
        'commit',
        '--allow-empty',
        '-m',
        'Synthetic source',
      ],
      { cwd: root, stdio: 'pipe' },
    );
    const input = payload();
    const originals = [];
    for (const entry of input.files) {
      const path = join(root, '.local', entry.path);
      fs.mkdirSync(join(path, '..'), { recursive: true, mode: 0o700 });
      fs.writeFileSync(path, Buffer.from(entry.data, 'base64'), {
        mode: 0o600,
      });
      originals.push({
        path,
        bytes: fs.readFileSync(path),
        mtime: fs.statSync(path).mtimeMs,
      });
    }
    const credentialHelper = join(root, 'synthetic-credential-helper.cjs');
    fs.writeFileSync(
      credentialHelper,
      "process.stdout.write('username=synthetic\\npassword=synthetic_ci_not_a_real_token\\n');",
      { mode: 0o600 },
    );
    execFileSync(
      'git',
      [
        'config',
        'credential.helper',
        '!' + process.execPath + ' ' + credentialHelper,
      ],
      { cwd: root, stdio: 'pipe' },
    );
    const pub = join(root, 'recipient-public.pem');
    fs.writeFileSync(pub, pair.publicKey, { mode: 0o600 });
    const output = join(root, 'transfer.enc.json');
    const stdout = execFileSync(
      process.execPath,
      [
        new URL('../../scripts/operator-state-transfer.mjs', import.meta.url)
          .pathname,
        '--export',
        pub,
        join(root, '.local/operator-secrets'),
        output,
      ],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' },
    );
    assert.equal(JSON.parse(stdout).originalsUnchanged, true);
    assert.equal(JSON.parse(stdout).githubCredentialCaptured, true);
    assert.ok(!stdout.includes('synthetic_ci_not_a_real_token'));
    assert.ok(!stdout.includes('synthetic-original'));
    const restored = decryptTransfer(
      JSON.parse(fs.readFileSync(output)),
      pair.privateKey,
    );
    const ciEntry = restored.files.find(
      (x) => x.path === 'operator-secrets/github_ci_credential.json',
    );
    assert.equal(
      JSON.parse(Buffer.from(ciEntry.data, 'base64').toString()).password,
      'synthetic_ci_not_a_real_token',
    );
    restored.files = restored.files.filter(
      (x) => x.path !== 'operator-secrets/github_ci_credential.json',
    );
    assert.deepEqual(
      restored.files.sort((a, b) => a.path.localeCompare(b.path)),
      input.files.sort((a, b) => a.path.localeCompare(b.path)),
    );
    for (const original of originals) {
      assert.deepEqual(fs.readFileSync(original.path), original.bytes);
      assert.equal(fs.statSync(original.path).mtimeMs, original.mtime);
    }
    assert.throws(() =>
      execFileSync(
        process.execPath,
        [
          new URL('../../scripts/operator-state-transfer.mjs', import.meta.url)
            .pathname,
          '--export',
          pub,
          join(root, '.local/operator-secrets'),
          output,
        ],
        { cwd: root, stdio: 'pipe' },
      ),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
