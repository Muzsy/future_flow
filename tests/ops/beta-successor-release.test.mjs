import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  successorReleaseEvidence,
  validateOwnerSelection,
  validateReaderSelection,
  validateSuccessorSelection,
  successorChecks,
  successorModules,
} from '../../scripts/lib/beta-successor-release.mjs';

const commit = 'a'.repeat(40),
  bundleSha256 = 'b'.repeat(64),
  image = 'sha256:' + 'c'.repeat(64);
function proof() {
  const owner = '22222222-2222-4222-8222-222222222222';
  const build = {
    commit,
    imageId: image,
    imageTag: 'alterward:contabo-aaaaaaaaaaaa',
    sourceDirectory: '/root/alterward-ops/target/source',
  };
  return {
    commit,
    bundleSha256,
    selection: {
      purpose: 'owner-e2e',
      previousTermsSha256: 'd'.repeat(64),
      closePreviousAt: '2026-01-01T00:00:00Z',
      next: {
        participants: [{ email: 'owner@example.invalid', userId: owner }],
        projectUsd: '3',
        userUsd: '3',
        startsAt: '2026-01-01T00:01:00Z',
        endsAt: '2026-01-31T00:01:00Z',
      },
    },
    release: {
      target: build,
      recovery: build,
      runtime: {
        mode: 'narrative-fiction-v2',
        generation: 'v9',
        cohortUserIds: [owner],
        timeoutMs: 300000,
        maxRequestBytes: 196608,
      },
    },
    audit: {
      sourceCommit: commit,
      bundleSha256,
      interpretedByOperator: true,
      critical: 0,
      high: 0,
      medium: 0,
    },
    ci: [],
    fixture: {
      sourceCommit: commit,
      bundleSha256,
      targetImage: image,
      recoveryImage: image,
      paidAiCalls: 0,
      privacyFixtureSha256: 'e'.repeat(64),
      checks: Object.fromEntries(
        [
          'success',
          'stale',
          'postcheck',
          'interruption',
          'locks',
          'reservations',
          'leases',
          'incompatibleRecovery',
          'foreign',
          'fundedState',
          'artifactRestore',
          'privacyReplay',
          'frozenPolicies',
          'expiredPreparationArchive',
          'probeCleanup',
          'fundedReplayProof',
        ].map((k) => [k, true]),
      ),
    },
    successorFixture: {
      version: 'alterward-beta-successor-fixture-2',
      sourceCommit: commit,
      bundleSha256,
      targetImage: image,
      recoveryImage: image,
      paidAiCalls: 0,
      checks: Object.fromEntries(successorChecks.map((k) => [k, true])),
    },
  };
}
test('requires the distinct source/image-bound successor acceptance and the existing audit/fixture', () => {
  const p = proof();
  assert.equal(successorReleaseEvidence(p).target.imageId, image);
  for (const change of [
    (p) => delete p.successorFixture,
    (p) => (p.successorFixture.sourceCommit = 'f'.repeat(40)),
    (p) => (p.successorFixture.recoveryImage = 'sha256:' + 'f'.repeat(64)),
    (p) => (p.audit.medium = 1),
    (p) => (p.fixture.checks.privacyReplay = false),
    (p) => (p.successorFixture.paidAiCalls = 1),
  ]) {
    const p = proof();
    change(p);
    assert.throws(() => successorReleaseEvidence(p));
  }
});
test('every actual successor check is mandatory, with no unrecognized check accepted', () => {
  for (const name of successorChecks) {
    const p = proof();
    p.successorFixture.checks[name] = false;
    assert.throws(() => successorReleaseEvidence(p));
    delete p.successorFixture.checks[name];
    assert.throws(() => successorReleaseEvidence(p));
  }
  const p = proof();
  p.successorFixture.checks.invented = true;
  assert.throws(() => successorReleaseEvidence(p));
});
test('does not convert the owner trial into an arbitrary allowance/cohort or malformed date', () => {
  for (const change of [
    (s) => (s.next.projectUsd = '10'),
    (s) => (s.next.userUsd = '3.33'),
    (s) => (s.purpose = 'tester-beta'),
    (s) => s.next.participants.push(s.next.participants[0]),
    (s) => (s.next.startsAt = '2026-02-30T00:01:00Z'),
    (s) => (s.next.endsAt = '2026-01-31T00:01:00+00:00'),
    (s) => (s.next.participants[0].email = 'Owner@example.invalid'),
    (s) => (s.extra = true),
  ]) {
    const s = proof().selection;
    change(s);
    assert.throws(() => validateOwnerSelection(s));
  }
  const p = proof();
  p.release.runtime.cohortUserIds = ['11111111-1111-4111-8111-111111111111'];
  assert.throws(() => successorReleaseEvidence(p));
});
const testers = [
  {
    email: 'owner@example.invalid',
    userId: '22222222-2222-4222-8222-222222222222',
  },
  {
    email: 'tester-one@example.invalid',
    userId: '11111111-1111-4111-8111-111111111111',
  },
  {
    email: 'tester-two@example.invalid',
    userId: '33333333-3333-4333-8333-333333333333',
  },
];
function testerProof() {
  const p = proof();
  p.selection.purpose = 'tester-beta';
  p.selection.next.participants = structuredClone(testers);
  p.selection.next.projectUsd = '10';
  p.selection.next.userUsd = '3.33';
  p.release.runtime.cohortUserIds = testers.map((t) => t.userId);
  return p;
}
function readerProof() {
  const p = proof();
  p.selection = {
    purpose: 'reader-admission',
    previousTermsSha256: 'd'.repeat(64),
    readers: {
      allowedEmails: ['owner@example.invalid', 'tester-one@example.invalid'],
    },
  };
  return p;
}
test('tester-beta is exactly three unique participants with the 10 / 3.33 USD allowance', () => {
  const p = testerProof();
  assert.equal(successorReleaseEvidence(p).target.imageId, image);
  assert.throws(() => validateOwnerSelection(p.selection));
  for (const change of [
    (s) => s.next.participants.pop(),
    (s) =>
      s.next.participants.push({
        email: 'fourth@example.invalid',
        userId: '44444444-4444-4444-8444-444444444444',
      }),
    (s) => (s.next.projectUsd = '11'),
    (s) => (s.next.projectUsd = '3'),
    (s) => (s.next.userUsd = '3.34'),
    (s) => (s.next.userUsd = '3'),
    (s) => (s.next.participants[2].userId = s.next.participants[1].userId),
    (s) => (s.next.participants[2].email = 'Tester@example.invalid'),
    (s) => (s.next.endsAt = '2026-02-01T00:01:00Z'),
    (s) => (s.closePreviousAt = s.next.startsAt),
  ]) {
    const s = testerProof().selection;
    change(s);
    assert.throws(() => validateSuccessorSelection(s));
  }
  const wrong = testerProof();
  wrong.release.runtime.cohortUserIds = [testers[0].userId];
  assert.throws(() => successorReleaseEvidence(wrong));
});
test('reader admission is a sorted unique reader list and carries no allowance', () => {
  const p = readerProof();
  assert.equal(successorReleaseEvidence(p).target.imageId, image);
  assert.throws(() => validateOwnerSelection(p.selection));
  for (const change of [
    (s) => (s.readers.allowedEmails = []),
    (s) => s.readers.allowedEmails.reverse(),
    (s) => s.readers.allowedEmails.push(s.readers.allowedEmails[1]),
    (s) => (s.readers.allowedEmails[1] = 'Tester@example.invalid'),
    (s) =>
      (s.readers.allowedEmails = Array.from(
        { length: 11 },
        (_, i) => `reader${String(i).padStart(2, '0')}@example.invalid`,
      )),
    (s) => (s.previousTermsSha256 = 'xyz'),
    (s) => (s.next = {}),
    (s) => (s.projectUsd = '10'),
    (s) => (s.purpose = 'owner-e2e'),
  ]) {
    const s = readerProof().selection;
    change(s);
    assert.throws(() => validateSuccessorSelection(s));
  }
  assert.throws(() => validateReaderSelection(testerProof().selection));
  const runtime = readerProof();
  runtime.release.runtime.cohortUserIds = [];
  assert.throws(() => successorReleaseEvidence(runtime));
  const bytes = readerProof();
  bytes.release.runtime.maxRequestBytes = 100000;
  assert.throws(() => successorReleaseEvidence(bytes));
});
test('the fixture contract demands the chained-generation checks', () => {
  for (const name of [
    'readerAdmission',
    'testerBetaWindow',
    'chainedAuthority',
  ])
    assert.ok(successorChecks.includes(name));
  const p = proof();
  p.successorFixture.version = 'alterward-beta-successor-fixture-1';
  assert.throws(() => successorReleaseEvidence(p));
});
test('privileged imports are finite and leave the original CLI mode contract unchanged', () => {
  assert.equal(
    new Set(successorModules.map(([name]) => name)).size,
    successorModules.length,
  );
  for (const [, file] of successorModules)
    assert.ok(readFileSync('scripts/ops/' + file).length);
  assert.ok(
    !readFileSync('scripts/contabo-funded-upgrade.mjs', 'utf8').includes(
      'beta-successor',
    ),
  );
});
