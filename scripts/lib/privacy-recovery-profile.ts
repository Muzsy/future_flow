import {
  assertPrivacyRecoveryCoverage,
  assertPoliticalPrivacyRecoveryCoverage,
  assertHistorical039PrivacyRecoveryCoverage,
} from './privacy-recovery-coverage';
import {
  assertPrivacySecurityCatalog,
  assertPoliticalPrivacySecurityCatalog,
  hardenPoliticalPrivacyQuarantine,
  assertHistorical039PrivacySecurityCatalog,
  hardenPrivacyQuarantine,
  hardenHistorical039PrivacyQuarantine,
} from './privacy-security-catalog';
import {
  reviewedPrivacyRecoveryTables,
  reviewedPoliticalPrivacyRecoveryTables,
  reviewedPre040PrivacyRecoveryTables,
} from './privacy-recovery-schema';

// Explicit, source-owned profiles. Never select from observed/missing tables or
// retry a weaker profile after an error. The outer proof binds the same choice.
export const historical039RecoveryProfile = Object.freeze({
  schema: 39 as const,
  name: 'historical039' as const,
  tables: reviewedPre040PrivacyRecoveryTables,
  coverage: assertHistorical039PrivacyRecoveryCoverage,
  catalog: assertHistorical039PrivacySecurityCatalog,
  harden: hardenHistorical039PrivacyQuarantine,
});
export const registry040RecoveryProfile = Object.freeze({
  schema: 40 as const,
  name: 'registry040' as const,
  tables: reviewedPrivacyRecoveryTables,
  coverage: assertPrivacyRecoveryCoverage,
  catalog: assertPrivacySecurityCatalog,
  harden: hardenPrivacyQuarantine,
});
export const political041RecoveryProfile = Object.freeze({
  schema: 41 as const,
  name: 'political041' as const,
  tables: reviewedPoliticalPrivacyRecoveryTables,
  coverage: assertPoliticalPrivacyRecoveryCoverage,
  catalog: assertPoliticalPrivacySecurityCatalog,
  harden: hardenPoliticalPrivacyQuarantine,
});
export type PrivacyRecoveryProfile =
  | typeof historical039RecoveryProfile
  | typeof registry040RecoveryProfile
  | typeof political041RecoveryProfile;
