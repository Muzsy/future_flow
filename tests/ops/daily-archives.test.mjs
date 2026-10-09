import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expireLocal, localArchives } from '../../scripts/contabo-daily.mjs';

const digest = (data) => createHash('sha256').update(data).digest('hex');
function fixture(root, ageDays) {
  const created = new Date(Date.now() - ageDays * 86400000 - 1000);
  const run =
    created.toISOString().replaceAll('-', '').replaceAll(':', '').slice(0, 15) +
    'Z-12345678';
  const dir = path.join(root, run);
  fs.mkdirSync(dir);
  const encryptedFiles = {};
  for (const name of ['config.tar.age', 'application.dump.age']) {
    const bytes = Buffer.from('isolated-encrypted-fixture');
    fs.writeFileSync(path.join(dir, name), bytes);
    encryptedFiles[name] = { bytes: bytes.length, sha256: digest(bytes) };
  }
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 'contabo-backup-1',
      managedBy: 'alterward-daily-1',
      runId: run,
      capturedAt: created.toISOString(),
      encryptedFiles,
    }),
  );
  return dir;
}
function sandbox(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alterward-daily-test-'));
  try {
    callback(root);
  } finally {
    assert.equal(
      path.dirname(fs.realpathSync(root)),
      fs.realpathSync(os.tmpdir()),
    );
    assert(path.basename(root).startsWith('alterward-daily-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
}
test('only expired managed ciphertext disappears; current copy survives', () =>
  sandbox((root) => {
    const old = fixture(root, 8),
      fresh = fixture(root, 1);
    assert.equal(expireLocal(root), 1);
    assert.equal(fs.existsSync(old), false);
    assert.equal(fs.existsSync(fresh), true);
  }));
test('approved retention also removes a sole expired copy', () =>
  sandbox((root) => {
    fixture(root, 8);
    assert.equal(expireLocal(root), 1);
    assert.deepEqual(fs.readdirSync(root), []);
  }));
test('hash corruption blocks every deletion', () =>
  sandbox((root) => {
    const old = fixture(root, 8),
      fresh = fixture(root, 1);
    fs.writeFileSync(path.join(fresh, 'config.tar.age'), 'corrupt');
    assert.throws(() => expireLocal(root));
    assert(fs.existsSync(old));
  }));
test('foreign names and extra entries are preserved and block expiry', () =>
  sandbox((root) => {
    const old = fixture(root, 8);
    fs.writeFileSync(path.join(old, 'extra'), 'keep');
    assert.throws(() => expireLocal(root));
    assert(fs.existsSync(old));
  }));
test('hardlinked archive cannot authorize expiry', () =>
  sandbox((root) => {
    const old = fixture(root, 8);
    fs.linkSync(path.join(old, 'config.tar.age'), path.join(root, 'linked'));
    assert.throws(() => localArchives(root));
    assert(fs.existsSync(old));
  }));
test('incomplete pending download is cleaned inside its reserved directory', () =>
  sandbox((root) => {
    const pending = path.join(root, '.pending-20261010T000000Z-12345678');
    fs.mkdirSync(pending);
    fs.writeFileSync(path.join(pending, 'config.tar.age'), 'partial');
    assert.equal(expireLocal(root), 0);
    assert.deepEqual(fs.readdirSync(root), []);
  }));
