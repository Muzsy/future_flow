import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  OperatorGateError,
  READER_PREPARATION_SECONDS,
  archiveLocalPreparation,
  assertNoPreviousPreparationReceipt,
  assertRestoreBindsPrepared,
  canonicalJson,
  readerPreparationAgeSeconds,
  sha256Hex,
} from '../../scripts/contabo-fence-operator.mjs';

const hash = (character) => character.repeat(64);
const NAMES = [
  'server.env',
  'pinned-image.json',
  'effective-compose.json',
  'manifest.json',
];
const PREFIX = 'root/alterward-ops/owner/personal-beta-readers/';
const PREPARED_AT = '2026-10-12T20:31:34.219585+00:00';
const preparedMs = Date.parse(PREPARED_AT);
const prepared = {
  manifest: { commit: 'a'.repeat(40) },
  previousManifestSha256: hash('1'),
  originalFilesSha256: Object.fromEntries(NAMES.map((n, i) => [n, hash('2')])),
  candidateFilesSha256: Object.fromEntries(NAMES.map((n, i) => [n, hash('3')])),
  readersSha256: hash('4'),
  accessSha256: hash('5'),
  preparedAt: PREPARED_AT,
  sourceCommit: 'c'.repeat(40),
  proxyNetwork: { id: 'n', foreignMembers: ['p'] },
  selectedReaders: 1,
  accessEmailCount: 2,
};
const RUN = '20261012T205702Z-d29c3182';
function backup() {
  const configFiles = { [PREFIX + 'original/stage.json']: hash('6') };
  for (const name of NAMES) {
    configFiles[PREFIX + name] = prepared.candidateFilesSha256[name];
    configFiles[PREFIX + 'original/' + name] =
      prepared.originalFilesSha256[name];
  }
  configFiles[PREFIX + 'readers.json'] = prepared.readersSha256;
  configFiles[PREFIX + 'access.json'] = prepared.accessSha256;
  configFiles[PREFIX + 'prepared.json'] = sha256Hex(canonicalJson(prepared));
  const manifest = {
    runId: RUN,
    capturedAt: '2026-10-12T20:35:00.000Z',
    encryptedFiles: { 'config.tar.age': { sha256: hash('7'), bytes: 10 } },
    expectedTables: [
      { name: 'a', count: 5 },
      { name: 'b', count: 7 },
    ],
    configFiles,
  };
  const restore = {
    schemaVersion: 'contabo-restore-proof-1',
    runId: RUN,
    liveDatabaseWrites: false,
    applicationStarted: false,
    publicPorts: 0,
    paidAiCalls: 0,
    offsiteCiphertextVerified: true,
    tamperedCiphertextRejected: true,
    proxyAdaptAndValidate: true,
    singleTransactionRestore: true,
    temporaryContainersRemoved: true,
    temporaryPlaintextRemoved: true,
    decryptionIdentityMemoryOnly: true,
    allExistingContainersUnchanged: true,
    encryptedFiles: structuredClone(manifest.encryptedFiles),
    configFilesRestored: Object.keys(configFiles).length,
    tablesRestoredAndDataMatched: 2,
    rowsMatched: 12,
    capturedAt: '2026-10-12T20:37:00.000Z',
  };
  return { manifest, restore };
}
const at = (seconds) => preparedMs + seconds * 1000;
const gate = (fn, pattern) =>
  assert.throws(fn, (error) => {
    assert.ok(error instanceof OperatorGateError, String(error));
    if (pattern) assert.match(error.message, pattern);
    return true;
  });

test('JS and Python share the canonical sorted compact ASCII JSON byte contract', () => {
  assert.equal(
    canonicalJson({ b: 1, a: ['\u00e9', 'x'], c: { z: true, y: null } }),
    '{"a":["\\u00e9","x"],"b":1,"c":{"y":null,"z":true}}\n',
  );
  assert.equal(READER_PREPARATION_SECONDS, 900);
});

test('apply is unlocked only by the restore of THIS preparation inside the 15 minute bound', () => {
  const { manifest, restore } = backup();
  const ok = (nowMs = at(400)) =>
    assertRestoreBindsPrepared({ restore, manifest, prepared, nowMs });
  assert.equal(ok(), RUN);
  assert.equal(ok(at(900)), RUN);
  gate(() => ok(at(901)), /expired/);
  gate(() => ok(at(-1)), /expired/);
});

test('a stale, foreign or incomplete restore proof is rejected for the exact reason', () => {
  const cases = [
    [
      'other run',
      (m, r) => (r.runId = '20261012T000000Z-aaaaaaaa'),
      /bound to this backup run/,
    ],
    [
      'bad schema',
      (m, r) => (r.schemaVersion = 'x'),
      /bound to this backup run/,
    ],
    ['live DB write', (m, r) => (r.liveDatabaseWrites = true), /incomplete/],
    [
      'tamper not rejected',
      (m, r) => (r.tamperedCiphertextRejected = false),
      /incomplete/,
    ],
    [
      'plaintext left',
      (m, r) => (r.temporaryPlaintextRemoved = false),
      /incomplete/,
    ],
    ['paid AI', (m, r) => (r.paidAiCalls = 1), /incomplete/],
    [
      'ciphertext differs',
      (m, r) => (r.encryptedFiles['config.tar.age'].bytes = 11),
      /manifest/,
    ],
    ['fewer config files', (m, r) => (r.configFilesRestored -= 1), /manifest/],
    ['rows differ', (m, r) => (r.rowsMatched = 11), /manifest/],
    [
      'backup before preparation',
      (m) => (m.capturedAt = '2026-10-12T20:31:00.000Z'),
      /follow this preparation/,
    ],
    [
      'restore before backup',
      (m, r) => (r.capturedAt = '2026-10-12T20:34:00.000Z'),
      /follow this preparation/,
    ],
    [
      'restore in the future',
      (m, r) => (r.capturedAt = '2026-10-12T20:59:00.000Z'),
      /follow this preparation/,
    ],
    [
      'old candidate bytes',
      (m) => (m.configFiles[PREFIX + 'server.env'] = hash('9')),
      /server\.env/,
    ],
    [
      'old original bytes',
      (m) => (m.configFiles[PREFIX + 'original/manifest.json'] = hash('9')),
      /original\/manifest\.json/,
    ],
    [
      'old selection',
      (m) => (m.configFiles[PREFIX + 'readers.json'] = hash('9')),
      /readers\.json/,
    ],
    [
      'old access',
      (m) => (m.configFiles[PREFIX + 'access.json'] = hash('9')),
      /access\.json/,
    ],
    [
      'old prepared receipt',
      (m) => (m.configFiles[PREFIX + 'prepared.json'] = hash('9')),
      /prepared\.json/,
    ],
    [
      'no original receipt',
      (m) => delete m.configFiles[PREFIX + 'original/stage.json'],
      /stage\.json/,
    ],
  ];
  for (const [name, mutate, pattern] of cases) {
    const { manifest, restore } = backup();
    mutate(manifest, restore);
    // Keep the file count consistent except where the count itself is the fault.
    restore.configFilesRestored =
      Object.keys(manifest.configFiles).length -
      (name === 'fewer config files' ? 1 : 0);
    gate(
      () =>
        assertRestoreBindsPrepared({
          restore,
          manifest,
          prepared,
          nowMs: at(600),
        }),
      pattern,
    );
  }
  gate(
    () => readerPreparationAgeSeconds({ preparedAt: '2026-10-12 20:31:34' }, 0),
    /UTC/,
  );
  gate(
    () =>
      readerPreparationAgeSeconds({ preparedAt: '2026-10-12T20:31:34Z' }, 0),
    /UTC/,
  );
});

test('malformed inputs fail closed instead of matching by accident (AUD-04)', () => {
  const run = (overrides = {}, mutate = () => {}, nowMs = at(600)) => {
    const { manifest, restore } = backup();
    mutate(manifest, restore);
    return () =>
      assertRestoreBindsPrepared({
        restore,
        manifest,
        prepared: { ...prepared, ...overrides },
        nowMs,
      });
  };
  // A receipt that lacks an expected hash must not match a backup that lacks the entry.
  const missing = structuredClone(prepared.candidateFilesSha256);
  delete missing['server.env'];
  gate(
    run({ candidateFilesSha256: missing }, (m, r) => {
      delete m.configFiles[PREFIX + 'server.env'];
      r.configFilesRestored = Object.keys(m.configFiles).length;
      m.configFiles[PREFIX + 'prepared.json'] = sha256Hex(
        canonicalJson({ ...prepared, candidateFilesSha256: missing }),
      );
    }),
    /server\.env/,
  );
  gate(run({ readersSha256: undefined }), /readers\.json|prepared\.json/);
  // An impossible date passes the textual UTC format but is not a time.
  gate(run({ preparedAt: '2026-13-45T25:61:61.000000+00:00' }), /UTC/);
  gate(
    () =>
      readerPreparationAgeSeconds(
        { preparedAt: '2026-13-45T25:61:61+00:00' },
        0,
      ),
    /UTC/,
  );
  // A restore proof of nothing is not a restore proof.
  gate(
    run({}, (m, r) => {
      m.expectedTables = [];
      r.tablesRestoredAndDataMatched = 0;
      r.rowsMatched = 0;
    }),
    /does not match the backup manifest/,
  );
});

test('the server answer must describe this receipt: hash and identity (AUD-05)', () => {
  const { root, releaseDirectory, archiveBase } = release();
  try {
    writeFileSync(
      proofPath(releaseDirectory),
      JSON.stringify({ preparedProof: prepared }),
    );
    gate(
      () =>
        archiveLocalPreparation({
          releaseDirectory,
          archiveBase,
          result: result({
            archiveId: 'expired-20261012T203135Z-ce73a0a4529f9f6e',
          }),
          nowMs: 0,
        }),
      /differs from the archived one/,
    );
    assert.equal(existsSync(proofPath(releaseDirectory)), true);
  } finally {
    rmSync(root, { recursive: true });
  }
});

function release() {
  const root = mkdtempSync(join(tmpdir(), 'reader-lifecycle-'));
  const releaseDirectory = join(root, 'release');
  mkdirSync(releaseDirectory);
  return { root, releaseDirectory, archiveBase: join(root, 'archive') };
}
const proofPath = (dir) =>
  join(dir, 'personal-beta-readers-prepare-proof.json');
// Python archive_identity(prepared): the helper binds the server answer to it.
const ARCHIVE_ID = 'expired-20261012T203134Z-ce73a0a4529f9f6e';
const result = (overrides = {}) => ({
  archived: true,
  archiveId: ARCHIVE_ID,
  preparedSha256: sha256Hex(canonicalJson(prepared)),
  alreadyArchived: false,
  ...overrides,
});

test('a previous cycle receipt blocks the next prepare until it is archived', () => {
  const { root, releaseDirectory } = release();
  try {
    assertNoPreviousPreparationReceipt(releaseDirectory);
    writeFileSync(proofPath(releaseDirectory), '{}');
    gate(
      () => assertNoPreviousPreparationReceipt(releaseDirectory),
      /archive it first/,
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('the local receipt moves into its archive exactly once and the repeat is idempotent', () => {
  const { root, releaseDirectory, archiveBase } = release();
  try {
    writeFileSync(
      proofPath(releaseDirectory),
      JSON.stringify({ preparedProof: prepared, prepared: true }),
    );
    const target = archiveLocalPreparation({
      releaseDirectory,
      archiveBase,
      result: result(),
      nowMs: at(2000),
    });
    assert.equal(existsSync(proofPath(releaseDirectory)), false);
    assert.deepEqual(readdirSync(target).sort(), [
      'archive-proof.json',
      'prepare-proof.json',
    ]);
    assert.equal(
      JSON.parse(readFileSync(join(target, 'prepare-proof.json'))).preparedProof
        .preparedAt,
      PREPARED_AT,
    );
    assert.equal(
      JSON.parse(readFileSync(join(target, 'archive-proof.json'))).archiveId,
      ARCHIVE_ID,
    );
    // Repeat after the move (server answers alreadyArchived): nothing changes.
    const before = readFileSync(join(target, 'archive-proof.json'), 'utf8');
    archiveLocalPreparation({
      releaseDirectory,
      archiveBase,
      result: result({ alreadyArchived: true }),
      nowMs: at(4000),
    });
    assert.equal(
      readFileSync(join(target, 'archive-proof.json'), 'utf8'),
      before,
    );
    // A fresh cycle may now start locally.
    assertNoPreviousPreparationReceipt(releaseDirectory);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('an interrupted local archive is finished without overwriting anything', () => {
  const { root, releaseDirectory, archiveBase } = release();
  try {
    writeFileSync(
      proofPath(releaseDirectory),
      JSON.stringify({ preparedProof: prepared }),
    );
    const target = join(archiveBase, ARCHIVE_ID);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'archive-proof.json'), '{"existing":true}\n');
    archiveLocalPreparation({
      releaseDirectory,
      archiveBase,
      result: result(),
      nowMs: at(2000),
    });
    assert.equal(
      readFileSync(join(target, 'archive-proof.json'), 'utf8'),
      '{"existing":true}\n',
    );
    assert.equal(existsSync(join(target, 'prepare-proof.json')), true);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('local archiving refuses mismatched, missing, conflicting or unconfirmed receipts', () => {
  const { root, releaseDirectory, archiveBase } = release();
  try {
    gate(
      () =>
        archiveLocalPreparation({
          releaseDirectory,
          archiveBase,
          result: { archived: false },
          nowMs: 0,
        }),
      /Completed server archive/,
    );
    gate(
      () =>
        archiveLocalPreparation({
          releaseDirectory,
          archiveBase,
          result: result({ archiveId: '../escape' }),
          nowMs: 0,
        }),
      /Completed server archive/,
    );
    gate(
      () =>
        archiveLocalPreparation({
          releaseDirectory,
          archiveBase,
          result: result(),
          nowMs: 0,
        }),
      /No local preparation receipt/,
    );
    writeFileSync(
      proofPath(releaseDirectory),
      JSON.stringify({ preparedProof: { ...prepared, selectedReaders: 2 } }),
    );
    gate(
      () =>
        archiveLocalPreparation({
          releaseDirectory,
          archiveBase,
          result: result(),
          nowMs: 0,
        }),
      /differs from the archived/,
    );
    assert.equal(existsSync(proofPath(releaseDirectory)), true); // never moved on a mismatch
    writeFileSync(
      proofPath(releaseDirectory),
      JSON.stringify({ preparedProof: prepared }),
    );
    writeFileSync(join(archiveBase, ARCHIVE_ID, 'prepare-proof.json'), '{}');
    gate(
      () =>
        archiveLocalPreparation({
          releaseDirectory,
          archiveBase,
          result: result(),
          nowMs: 0,
        }),
      /already exists/,
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});
