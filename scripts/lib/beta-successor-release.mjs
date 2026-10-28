import {
  fundedUpgradeModules,
  releaseEvidence,
  exactObject,
  sha,
} from './funded-upgrade.mjs';
import { validateParticipants } from './personal-beta-admission-observation.mjs';

export const successorModules = [
  ...fundedUpgradeModules,
  ['alterward_successor_transition', 'beta-successor-transition.py'],
  ['alterward_beta_successor', 'contabo-beta-successor.py'],
];
export const successorChecks = [
  'oldAllowanceClosed',
  'historyPreserved',
  'differentOwner',
  'ownerCap',
  'lostCommitRecovery',
  'noSqlReplay',
  'interruptionHeld',
  'stagedIngress',
  'watchdog',
  'effectiveAuthority',
  'candidateBackup',
  'expiredArchive',
  'foreignStable',
  'cleanup',
  'readerAdmission',
  'testerBetaWindow',
  'chainedAuthority',
];

const READER_PURPOSE = 'reader-admission';
// purpose -> [participants, projectUsd, userUsd]; the only allowance-changing selections.
const windowPurposes = {
  'owner-e2e': [1, '3', '3'],
  'tester-beta': [3, '10', '3.33'],
};
const digestPattern = /^[a-f0-9]{64}$/;
const readerEmail = /^[-a-z0-9._+]+@[-a-z0-9.]+$/;

function validateWindowSelection(selection, purposes) {
  exactObject(selection, [
    'purpose',
    'previousTermsSha256',
    'closePreviousAt',
    'next',
  ]);
  const terms = exactObject(selection.next, [
    'participants',
    'projectUsd',
    'userUsd',
    'startsAt',
    'endsAt',
  ]);
  validateParticipants(terms.participants);
  const time = (value) => {
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    )
      throw Error('Exact UTC trial window required');
    const stamp = new Date(value);
    if (
      !Number.isFinite(stamp.getTime()) ||
      stamp.toISOString() !==
        value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z')
    )
      throw Error('Canonical UTC trial window required');
    return stamp.getTime();
  };
  const [count, projectUsd, userUsd] = windowPurposes[selection.purpose] ?? [];
  if (
    !purposes.includes(selection.purpose) ||
    terms.participants.length !== count ||
    terms.projectUsd !== projectUsd ||
    terms.userUsd !== userUsd ||
    !digestPattern.test(selection.previousTermsSha256) ||
    time(terms.endsAt) - time(terms.startsAt) !== 30 * 86400000 ||
    time(selection.closePreviousAt) >= time(terms.startsAt)
  )
    throw Error('Explicit approved participant count and allowance required');
  return selection;
}

// Exactly the first, single-owner 3 USD trial (already exposed in production).
export function validateOwnerSelection(selection) {
  return validateWindowSelection(selection, ['owner-e2e']);
}

// Reader admission changes only who may reach the closed site: no allowance,
// window, cohort or account. The list is sorted, unique and canonical.
export function validateReaderSelection(selection) {
  exactObject(selection, ['purpose', 'previousTermsSha256', 'readers']);
  exactObject(selection.readers, ['allowedEmails']);
  const emails = selection.readers.allowedEmails;
  if (
    selection.purpose !== READER_PURPOSE ||
    !digestPattern.test(selection.previousTermsSha256) ||
    !Array.isArray(emails) ||
    emails.length < 1 ||
    emails.length > 10 ||
    emails.some(
      (email, i) =>
        typeof email !== 'string' ||
        email.length > 254 ||
        !readerEmail.test(email) ||
        (i > 0 && emails[i - 1] >= email),
    )
  )
    throw Error('Exact sorted reader-admission selection required');
  return selection;
}

// Dispatches on the explicit purpose. The generation a purpose is allowed in is
// enforced where the chain is known (Daily authority and the root adapter).
export function validateSuccessorSelection(selection) {
  if (selection?.purpose === READER_PURPOSE)
    return validateReaderSelection(selection);
  return validateWindowSelection(selection, ['owner-e2e', 'tester-beta']);
}

export function successorReleaseEvidence({
  selection,
  release,
  successorFixture,
  ...original
}) {
  validateSuccessorSelection(selection);
  const result = releaseEvidence({ ...original, selection: release });
  const cohort = result.runtime?.cohortUserIds;
  // A window selection names its cohort. Reader admission has none of its own:
  // the root adapter proves the cohort equals the still-active window's.
  if (
    (selection.purpose === READER_PURPOSE
      ? !Array.isArray(cohort) || cohort.length < 1 || cohort.length > 10
      : JSON.stringify(cohort) !==
        JSON.stringify(selection.next.participants.map((p) => p.userId))) ||
    result.runtime.timeoutMs !== 300000 ||
    result.runtime.maxRequestBytes !== 196608
  )
    throw Error('Exact approved v9 runtime required');
  exactObject(successorFixture, [
    'version',
    'sourceCommit',
    'bundleSha256',
    'targetImage',
    'recoveryImage',
    'checks',
    'paidAiCalls',
  ]);
  exactObject(successorFixture.checks, successorChecks);
  if (
    successorFixture.version !== 'alterward-beta-successor-fixture-2' ||
    successorFixture.sourceCommit !== original.commit ||
    successorFixture.bundleSha256 !== original.bundleSha256 ||
    successorFixture.targetImage !== release.target.imageId ||
    successorFixture.recoveryImage !== release.recovery.imageId ||
    successorFixture.paidAiCalls !== 0 ||
    successorChecks.some((k) => successorFixture.checks[k] !== true)
  )
    throw Error('Actual source/image-bound successor fixture required');
  return {
    ...result,
    successorFixtureSha256: sha(JSON.stringify(successorFixture)),
  };
}
