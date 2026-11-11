import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  OperatorGateError,
  archiveLocalPreparation,
  canonicalJson,
  readerArchiveIdentity,
  resolveArchivePreparedProof,
  sha256Hex,
} from '../../scripts/contabo-fence-operator.mjs';

// RRA-01: the CLI input resolution for archive-expired-readers. After the real
// local helper retired the active receipt, the retry must not depend on it.
const hash = (character) => character.repeat(64);
const NAMES = [
  'server.env',
  'pinned-image.json',
  'effective-compose.json',
  'manifest.json',
];
const prepared = {
  manifest: { commit: 'a'.repeat(40) },
  previousManifestSha256: hash('1'),
  originalFilesSha256: Object.fromEntries(NAMES.map((n) => [n, hash('2')])),
  candidateFilesSha256: Object.fromEntries(NAMES.map((n) => [n, hash('3')])),
  readersSha256: hash('4'),
  accessSha256: hash('5'),
  preparedAt: '2026-10-12T20:31:34.219585+00:00',
  sourceCommit: 'c'.repeat(40),
  proxyNetwork: { id: 'n', foreignMembers: ['p'] },
  selectedReaders: 1,
  accessEmailCount: 2,
};
// Python archive_identity(prepared): the cross-language contract.
const IDENTITY = 'expired-20261012T203134Z-ce73a0a4529f9f6e';
const IDENTITY_WHOLE_SECOND = 'expired-20261012T203134Z-f680bb0fbcd2056d';
const OWNER_DIGEST = prepared.previousManifestSha256;
const preparedSha = (value) => sha256Hex(canonicalJson(value));

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'reader-archive-retry-'));
  const releaseDirectory = join(root, 'release');
  mkdirSync(releaseDirectory);
  return { root, releaseDirectory, archiveBase: join(root, 'archive') };
}
const activePath = (s) =>
  join(s.releaseDirectory, 'personal-beta-readers-prepare-proof.json');
const writeActive = (s, value = prepared) =>
  writeFileSync(activePath(s), JSON.stringify({ preparedProof: value }));
const serverResult = (value = prepared, extra = {}) => ({
  archived: true,
  alreadyArchived: false,
  archiveId: readerArchiveIdentity(value),
  preparedSha256: preparedSha(value),
  ...extra,
});
const retire = (s, value = prepared, nowMs = 1) =>
  archiveLocalPreparation({
    releaseDirectory: s.releaseDirectory,
    archiveBase: s.archiveBase,
    result: serverResult(value),
    nowMs,
  });
const resolve = (s, archiveId, ownerManifestDigest = OWNER_DIGEST) =>
  resolveArchivePreparedProof({
    releaseDirectory: s.releaseDirectory,
    archiveBase: s.archiveBase,
    archiveId,
    ownerManifestDigest,
  });
const gate = (fn, pattern) =>
  assert.throws(fn, (error) => {
    assert.ok(error instanceof OperatorGateError, String(error));
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
const cleanup = (s) => rmSync(s.root, { recursive: true, force: true });

test('the archive id is the identity the server derives', () => {
  assert.equal(readerArchiveIdentity(prepared), IDENTITY);
  assert.equal(
    readerArchiveIdentity({
      ...prepared,
      preparedAt: '2026-10-12T20:31:34+00:00',
    }),
    IDENTITY_WHOLE_SECOND,
  );
  gate(
    () =>
      readerArchiveIdentity({
        ...prepared,
        preparedAt: '2026-10-12T20:31:34Z',
      }),
    /UTC/,
  );
});

test('first run uses the active receipt; the id is optional but must match', () => {
  const s = workspace();
  try {
    writeActive(s);
    const first = resolve(s, undefined);
    assert.deepEqual([first.source, first.archiveId], ['active', IDENTITY]);
    assert.deepEqual(first.preparedProof, prepared);
    assert.equal(resolve(s, IDENTITY).source, 'active');
    gate(
      () => resolve(s, 'expired-20261012T203134Z-0000000000000000'),
      /does not match/,
    );
    gate(() => resolve(s, '../escape'), /archive id/);
    gate(() => resolve(s, undefined, hash('9')), /baseline/);
  } finally {
    cleanup(s);
  }
});

test('retry after the real local rename: the lost-output case resolves by exact id', () => {
  const s = workspace();
  try {
    writeActive(s);
    retire(s); // server archived; the REAL helper retired the receipt; output lost
    assert.equal(existsSync(activePath(s)), false);
    gate(() => resolve(s, undefined), /exact archive id/);
    const retry = resolve(s, IDENTITY);
    assert.equal(retry.source, 'archived');
    assert.deepEqual(retry.preparedProof, prepared);
    // Server answers alreadyArchived; the helper completes idempotently and
    // nothing is ever copied back into the active path.
    const target = archiveLocalPreparation({
      releaseDirectory: s.releaseDirectory,
      archiveBase: s.archiveBase,
      result: serverResult(prepared, { alreadyArchived: true }),
      nowMs: 2,
    });
    assert.equal(existsSync(activePath(s)), false);
    assert.deepEqual(readdirSync(target).sort(), [
      'archive-proof.json',
      'prepare-proof.json',
    ]);
    gate(
      () =>
        archiveLocalPreparation({
          releaseDirectory: s.releaseDirectory,
          archiveBase: s.archiveBase,
          result: serverResult(prepared, { preparedSha256: hash('a') }),
          nowMs: 3,
        }),
      /differs from the server archive/,
    );
  } finally {
    cleanup(s);
  }
});

test('interruption before the rename leaves the active receipt and finishes unchanged', () => {
  const s = workspace();
  try {
    writeActive(s);
    const target = join(s.archiveBase, IDENTITY);
    mkdirSync(target, { recursive: true });
    writeFileSync(
      join(target, 'archive-proof.json'),
      JSON.stringify(serverResult()) + '\n',
    );
    assert.equal(resolve(s, undefined).source, 'active');
    retire(s);
    assert.equal(existsSync(activePath(s)), false);
    assert.equal(resolve(s, IDENTITY).source, 'archived');
  } finally {
    cleanup(s);
  }
});

test('several archives never lead to a guess: only the exact id resolves', () => {
  const s = workspace();
  try {
    writeActive(s);
    retire(s);
    const later = {
      ...prepared,
      preparedAt: '2026-10-12T22:00:00+00:00',
      readersSha256: hash('8'),
    };
    writeActive(s, later);
    retire(s, later, 2);
    const laterId = readerArchiveIdentity(later);
    gate(() => resolve(s, undefined), /exact archive id/);
    assert.equal(resolve(s, IDENTITY).archiveId, IDENTITY);
    assert.equal(resolve(s, laterId).archiveId, laterId);
    gate(
      () => resolve(s, 'expired-20260101T000000Z-aaaaaaaaaaaaaaaa'),
      /No archived local receipt/,
    );
  } finally {
    cleanup(s);
  }
});

test('damaged, mismatching, oversized or hardlinked archived receipts are refused', () => {
  const proof = (d, name) => join(d, name);
  const cases = [
    [
      'corrupt receipt',
      (d) => writeFileSync(proof(d, 'prepare-proof.json'), '{not json'),
    ],
    ['missing receipt', (d) => rmSync(proof(d, 'prepare-proof.json'))],
    ['missing archive proof', (d) => rmSync(proof(d, 'archive-proof.json'))],
    [
      'other preparation under the id',
      (d) =>
        writeFileSync(
          proof(d, 'prepare-proof.json'),
          JSON.stringify({
            preparedProof: { ...prepared, readersSha256: hash('7') },
          }),
        ),
    ],
    [
      'archive proof for another hash',
      (d) =>
        writeFileSync(
          proof(d, 'archive-proof.json'),
          JSON.stringify({
            archived: true,
            archiveId: IDENTITY,
            preparedSha256: hash('b'),
          }),
        ),
    ],
    [
      'archive not completed',
      (d) =>
        writeFileSync(
          proof(d, 'archive-proof.json'),
          JSON.stringify({
            archived: false,
            archiveId: IDENTITY,
            preparedSha256: preparedSha(prepared),
          }),
        ),
    ],
    [
      'oversized receipt',
      (d) =>
        writeFileSync(
          proof(d, 'prepare-proof.json'),
          ' '.repeat(2 * 1024 ** 2 + 1),
        ),
    ],
    [
      'hardlinked receipt',
      (d, s) =>
        linkSync(proof(d, 'prepare-proof.json'), join(s.root, 'alias.json')),
    ],
  ];
  for (const [name, mutate] of cases) {
    const s = workspace();
    try {
      writeActive(s);
      retire(s);
      mutate(join(s.archiveBase, IDENTITY), s);
      assert.throws(() => resolve(s, IDENTITY), OperatorGateError, name);
    } finally {
      cleanup(s);
    }
  }
});

test('symlinked receipts or folders are refused (skipped where links need privileges)', (t) => {
  const s = workspace();
  try {
    writeActive(s);
    retire(s);
    const dir = join(s.archiveBase, IDENTITY);
    const target = join(s.root, 'elsewhere.json');
    writeFileSync(target, readFileSync(join(dir, 'prepare-proof.json')));
    rmSync(join(dir, 'prepare-proof.json'));
    try {
      symlinkSync(target, join(dir, 'prepare-proof.json'));
    } catch (error) {
      if (error.code === 'EPERM')
        return t.skip('symlinks need privileges here');
      throw error;
    }
    gate(() => resolve(s, IDENTITY), /incomplete or not private/);
    rmSync(join(dir, 'prepare-proof.json'));
    rmSync(dir, { recursive: true });
    const real = join(s.root, 'real-folder');
    mkdirSync(real);
    symlinkSync(real, dir, 'junction');
    gate(() => resolve(s, IDENTITY), /not private/);
  } finally {
    cleanup(s);
  }
});

test('an active receipt next to its archived copy conflicts; the owner baseline must match', () => {
  const s = workspace();
  try {
    writeActive(s);
    retire(s);
    writeActive(s);
    gate(() => resolve(s, undefined), /already exists/);
    rmSync(activePath(s));
    gate(() => resolve(s, IDENTITY, hash('9')), /baseline/);
    assert.equal(resolve(s, IDENTITY).source, 'archived');
  } finally {
    cleanup(s);
  }
});

test('the loader reaches its archive input only through the bound resolver', () => {
  const source = readFileSync(
    new URL('../../scripts/contabo-personal-beta-readers.mjs', import.meta.url),
    'utf8',
  );
  const start = source.indexOf("if (mode === 'archive-expired-readers') {");
  const branch = source.slice(
    start,
    source.indexOf("if (mode === 'apply-readers')"),
  );
  assert.ok(start > 0);
  assert.match(branch, /resolveArchivePreparedProof\(/);
  assert.match(branch, /archiveId: process\.argv\[3\]/);
  assert.doesNotMatch(
    branch,
    /report\(\s*'personal-beta-readers-prepare-proof\.json'/,
  );
  assert.match(source, /process\.argv\.length >/);
});
