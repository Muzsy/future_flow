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
];

export function validateOwnerSelection(selection) {
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
      throw Error('Exact UTC owner trial required');
    const stamp = new Date(value);
    if (
      !Number.isFinite(stamp.getTime()) ||
      stamp.toISOString() !==
        value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z')
    )
      throw Error('Canonical UTC owner trial required');
    return stamp.getTime();
  };
  if (
    selection.purpose !== 'owner-e2e' ||
    terms.participants.length !== 1 ||
    terms.projectUsd !== '3' ||
    terms.userUsd !== '3' ||
    !/^[a-f0-9]{64}$/.test(selection.previousTermsSha256) ||
    time(terms.endsAt) - time(terms.startsAt) !== 30 * 86400000 ||
    time(selection.closePreviousAt) >= time(terms.startsAt)
  )
    throw Error('Explicit single-owner 3 USD selection required');
  return selection;
}

export function successorReleaseEvidence({
  selection,
  release,
  successorFixture,
  ...original
}) {
  validateOwnerSelection(selection);
  const result = releaseEvidence({ ...original, selection: release });
  if (
    JSON.stringify(result.runtime?.cohortUserIds) !==
      JSON.stringify(selection.next.participants.map((p) => p.userId)) ||
    result.runtime.timeoutMs !== 300000 ||
    result.runtime.maxRequestBytes !== 196608
  )
    throw Error('Exact owner v9 runtime required');
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
    successorFixture.version !== 'alterward-beta-successor-fixture-1' ||
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
