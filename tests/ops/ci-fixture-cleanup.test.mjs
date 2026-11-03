import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { cleanupCiFixture } from '../../scripts/lib/ci-fixture-cleanup.mjs';

test('successful cleanup actually removes only the caller-owned fixture tree', () => {
  const directory = mkdtempSync(join(tmpdir(), 'alterward-ci-cleanup-test-'));
  mkdirSync(join(directory, 'child'));
  writeFileSync(join(directory, 'child', 'synthetic.txt'), 'synthetic');
  assert.equal(cleanupCiFixture(directory), true);
  assert.equal(existsSync(directory), false);
});

test('root-private cleanup failure preserves the primary timeout and failure status', () => {
  const primary = Object.assign(new Error('spawnSync sudo ETIMEDOUT'), {
    code: 'ETIMEDOUT',
  });
  const secondary = Object.assign(
    new Error('private path and synthetic payload'),
    {
      code: 'EACCES',
    },
  );
  const diagnostics = [];
  let status = 0;
  let original;
  try {
    try {
      throw primary;
    } catch (error) {
      original = error;
      status = 1;
    }
  } finally {
    if (
      !cleanupCiFixture('/synthetic', {
        remove: () => {
          throw secondary;
        },
        report: (value) => diagnostics.push(value),
      })
    )
      status = 1;
  }
  assert.equal(original, primary);
  assert.equal(status, 1);
  assert.deepEqual(diagnostics, [
    '{"ciFixtureCleanup":"failed","code":"EACCES"}',
  ]);
});

test('a cleanup-only failure still fails and never prints arbitrary error content', () => {
  const diagnostics = [];
  const ok = cleanupCiFixture('/synthetic', {
    remove: () => {
      throw new Error('do not print this');
    },
    report: (value) => diagnostics.push(value),
  });
  assert.equal(ok, false);
  assert.deepEqual(diagnostics, [
    '{"ciFixtureCleanup":"failed","code":"UNKNOWN"}',
  ]);
});
