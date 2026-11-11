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
    assert.deepEqual(fs.readdirSync(root), ['.expiry-journal']);
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

test('interrupted unlink resumes with the original manifest removed last', () =>
  sandbox((root) => {
    const old = fixture(root, 8),
      actual = fs.unlinkSync;
    try {
      fs.unlinkSync = (path) => {
        actual(path);
        throw Error('Synthetic stop after unlink');
      };
      assert.throws(() => expireLocal(root));
    } finally {
      fs.unlinkSync = actual;
    }
    assert(fs.existsSync(path.join(old, 'manifest.json')));
    assert.equal(expireLocal(root), 1);
    assert.equal(expireLocal(root), 0);
    assert.deepEqual(localArchives(root), []);
  }));

test('empty archive after interrupted rmdir is safely completed', () =>
  sandbox((root) => {
    const old = fixture(root, 8),
      actual = fs.rmdirSync;
    try {
      fs.rmdirSync = () => {
        throw Error('Synthetic stop before rmdir');
      };
      assert.throws(() => expireLocal(root));
    } finally {
      fs.rmdirSync = actual;
    }
    assert.deepEqual(fs.readdirSync(old), []);
    assert.equal(expireLocal(root), 1);
    assert.equal(expireLocal(root), 0);
  }));

test('all expired run intents precede any deletion when publication fails', () =>
  sandbox((root) => {
    const first = fixture(root, 8),
      second = fixture(root, 9),
      actual = fs.renameSync;
    let calls = 0;
    try {
      fs.renameSync = (a, b) => {
        calls++;
        if (calls === 2) throw Error('Synthetic second publish failure');
        return actual(a, b);
      };
      assert.throws(() => expireLocal(root));
    } finally {
      fs.renameSync = actual;
    }
    assert.equal(fs.readdirSync(first).length, 3);
    assert.equal(fs.readdirSync(second).length, 3);
    assert.throws(() => expireLocal(root)); // Unpublished temp requires operator inspection.
  }));

test('torn metadata and modified fresh ciphertext block resumed deletion', () =>
  sandbox((root) => {
    const old = fixture(root, 8),
      fresh = fixture(root, 1),
      actual = fs.unlinkSync;
    try {
      fs.unlinkSync = () => {
        throw Error('Synthetic before first unlink');
      };
      assert.throws(() => expireLocal(root));
    } finally {
      fs.unlinkSync = actual;
    }
    fs.writeFileSync(path.join(fresh, 'config.tar.age'), 'corrupt');
    assert.throws(() => expireLocal(root));
    assert.equal(fs.readdirSync(old).length, 3);
    const journal = path.join(
      root,
      '.expiry-journal',
      path.basename(old) + '.json',
    );
    fs.writeFileSync(journal, '{');
    assert.throws(() => expireLocal(root));
    assert.equal(fs.readdirSync(old).length, 3);
  }));

test('recreated original ciphertext archive never authorizes a second deletion', () =>
  sandbox((root) => {
    const old = fixture(root, 8),
      saved = Object.fromEntries(
        fs
          .readdirSync(old)
          .map((name) => [name, fs.readFileSync(path.join(old, name))]),
      );
    assert.equal(expireLocal(root), 1);
    fs.mkdirSync(old);
    for (const [name, bytes] of Object.entries(saved))
      fs.writeFileSync(path.join(old, name), bytes);
    assert.throws(() => expireLocal(root));
    assert.equal(fs.readdirSync(old).length, 3);
  }));

test('pending incomplete archive cannot be listed as a usable local backup', () =>
  sandbox((root) => {
    fixture(root, 8);
    const actual = fs.unlinkSync;
    try {
      fs.unlinkSync = (path) => {
        actual(path);
        throw Error('Synthetic after unlink');
      };
      assert.throws(() => expireLocal(root));
    } finally {
      fs.unlinkSync = actual;
    }
    assert.throws(() => localArchives(root));
    assert.equal(expireLocal(root), 1);
  }));
