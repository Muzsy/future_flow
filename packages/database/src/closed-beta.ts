import { DomainError } from '@future-flow/core';
export type ClosedBetaConfig = { enabled: boolean; userIds: string[] };
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function validateClosedBetaConfig(
  raw: ClosedBetaConfig,
): ClosedBetaConfig {
  if (
    typeof raw.enabled !== 'boolean' ||
    !Array.isArray(raw.userIds) ||
    raw.userIds.length > 10 ||
    raw.userIds.some((id) => typeof id !== 'string' || !uuid.test(id))
  )
    throw Error('Invalid closed beta configuration');
  const userIds = raw.userIds.map((id) => id.toLowerCase());
  if (new Set(userIds).size !== userIds.length)
    throw Error('Invalid closed beta configuration');
  return { enabled: raw.enabled, userIds: [...userIds] };
}
export function closedBetaConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ClosedBetaConfig {
  const enabled = env.CLOSED_BETA_ENABLED ?? 'false';
  if (!['true', 'false'].includes(enabled))
    throw Error('Invalid closed beta configuration');
  const ids = env.CLOSED_BETA_USER_IDS?.trim() ?? '';
  return validateClosedBetaConfig({
    enabled: enabled === 'true',
    userIds: ids ? ids.split(',').map((id) => id.trim()) : [],
  });
}
export function assertClosedBetaAdmission(
  config: ClosedBetaConfig,
  userId: string,
) {
  if (config.enabled && !config.userIds.includes(userId.toLowerCase()))
    throw new DomainError(
      'CLOSED_BETA_INVITE_REQUIRED',
      'This closed beta is available to invited testers.',
      403,
    );
}

// The original three closed-beta accounts are exempt from chapter counting only
// for the proven original tester window (it ends 2026-11-28 01:17:38 CET). The
// end is a code constant on purpose: a new USD period, a successor generation or
// an environment value can never extend it. After this instant the accounts are
// ordinary users of the chapter ledger.
export const LEGACY_BETA_CHAPTER_EXEMPTION_ENDS_AT = '2026-11-28T00:17:38.000Z';
export function legacyBetaChapterExemption(config: ClosedBetaConfig): {
  exemptUserIds: string[];
  exemptEndsAt: string;
} {
  return {
    exemptUserIds: config.enabled ? config.userIds : [],
    exemptEndsAt: LEGACY_BETA_CHAPTER_EXEMPTION_ENDS_AT,
  };
}
