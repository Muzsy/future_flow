import { createHash } from 'node:crypto';
export const registryImageFixtureVersion =
  'alterward-service-registry-image-fixture-1';
export const registryImageFixtureChecks = [
  'runtime039To040',
  'billingLedgerPreserved',
  'migrationReceiptsPreserved',
  'interruptedMigrationRolledBack',
  'physical039DumpRestored',
  'historicalPrivacyVerified',
  'registryPrivacyVerified',
  'lostOutputReadOnlyRecovery',
  'noSqlReplay',
  'driftRefused',
  'native040PrivacyProofBound',
  'cleanup',
];
export function schema040FixtureNames(nonce) {
  if (!/^[a-f0-9]{24}$/.test(nonce ?? ''))
    throw Error('Exact fixture nonce required');
  const snapshot = createHash('sha256')
    .update('registry-snapshot:' + nonce)
    .digest('hex')
    .slice(0, 24);
  return {
    source: 'aw_fixture_' + nonce,
    snapshot: 'aw_fixture_' + snapshot,
    target: 'aw_restore_' + nonce,
  };
}
