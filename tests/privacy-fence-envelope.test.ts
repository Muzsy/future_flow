import { describe, it, expect } from 'vitest';
import { hash } from '@future-flow/core';
import {
  privacyRestoreFingerprintTables,
  type PrivacyRestoreAuthority,
} from '../scripts/lib/privacy-restore';
import {
  createPrivacyFenceEnvelope,
  validateRecoveryFenceEnvelope,
  type PrivacyFenceBinding,
} from '../scripts/lib/privacy-fence-envelope';

const now = new Date('2026-10-11T00:00:00Z');
const authority: PrivacyRestoreAuthority = {
  schemaVersion: 'privacy-restore-authority-1',
  projectBinding: hash('synthetic-project'),
  schemaDigest: hash('synthetic-schema'),
  securityCatalog: {
    schemaVersion: 'privacy-security-catalog-1',
    immutableDigest: hash('synthetic-reviewed-catalog'),
    sourcePrivilegesDigest: hash('synthetic-source-grants'),
  },
  writerFenceDigest: hash('synthetic-stopped-fence'),
  capturedAt: now.toISOString(),
  authVerifiedAt: now.toISOString(),
  activeUserIds: [],
  lives: [],
  futures: [],
  blocks: [],
  budgetAccounts: [],
  fingerprints: Object.fromEntries(
    privacyRestoreFingerprintTables.map((t) => [t, []]),
  ) as PrivacyRestoreAuthority['fingerprints'],
};
const binding: PrivacyFenceBinding = {
  mode: 'recovery',
  nonce: 'a'.repeat(24),
  sourceCommit: 'b'.repeat(40),
  sourceFilesDigest: hash('synthetic-files'),
  ownerManifestDigest: hash('synthetic-owner'),
  projectBinding: authority.projectBinding,
  writerFenceDigest: authority.writerFenceDigest,
  expiresAt: '2026-10-11T00:10:00Z',
};
function fixture() {
  const envelope = createPrivacyFenceEnvelope(
    authority,
    hash('synthetic-auth'),
    binding,
    now,
  );
  return { envelope, held: { ...binding, stateDigest: envelope.stateDigest } };
}
describe('recovery envelope requires the same independently held root fence', () => {
  it('accepts only matching current recovery state and never permits serving', () => {
    const { envelope, held } = fixture();
    expect(
      validateRecoveryFenceEnvelope(envelope, held, now)
        .serviceActivationAllowed,
    ).toBe(false);
    const changedTimes = createPrivacyFenceEnvelope(
      {
        ...authority,
        capturedAt: '2026-10-11T00:00:02Z',
        authVerifiedAt: '2026-10-11T00:00:02Z',
      },
      envelope.authStateDigest,
      binding,
      new Date('2026-10-11T00:00:02Z'),
    );
    expect(changedTimes.stateDigest).toBe(envelope.stateDigest);
  });
  it('rejects drill output and legacy fixture authority for recovery', () => {
    const { held } = fixture();
    const drill = createPrivacyFenceEnvelope(
      authority,
      hash('synthetic-auth'),
      { ...binding, mode: 'drill' },
      now,
    );
    expect(() => validateRecoveryFenceEnvelope(drill, held, now)).toThrow(
      'held recovery',
    );
    expect(() => validateRecoveryFenceEnvelope(authority, held, now)).toThrow();
  });
  it('rejects changed nonce/source/project/owner bindings', () => {
    const { envelope, held } = fixture();
    for (const patch of [
      { nonce: 'c'.repeat(24) },
      { sourceCommit: 'c'.repeat(40) },
      { sourceFilesDigest: hash('changed') },
      { projectBinding: hash('other-project') },
      { ownerManifestDigest: hash('other-owner') },
      { writerFenceDigest: hash('other-fence') },
    ]) {
      expect(() =>
        validateRecoveryFenceEnvelope(envelope, { ...held, ...patch }, now),
      ).toThrow('held recovery');
    }
  });
  it('rejects mutated Auth/app state and any changed independent re-observation', () => {
    const { envelope, held } = fixture();
    expect(() =>
      validateRecoveryFenceEnvelope(
        { ...envelope, authStateDigest: hash('changed-auth') },
        held,
        now,
      ),
    ).toThrow('state binding');
    expect(() =>
      validateRecoveryFenceEnvelope(
        {
          ...envelope,
          authority: {
            ...authority,
            activeUserIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
          },
        },
        held,
        now,
      ),
    ).toThrow('state binding');
    expect(() =>
      validateRecoveryFenceEnvelope(
        envelope,
        { ...held, stateDigest: hash('changed-source') },
        now,
      ),
    ).toThrow('held recovery');
  });
  it('rejects expired or unbounded fence lifetime and activation flags', () => {
    const { envelope, held } = fixture();
    expect(() =>
      validateRecoveryFenceEnvelope(
        envelope,
        held,
        new Date('2026-10-11T00:10:00Z'),
      ),
    ).toThrow('bounded physical');
    expect(() =>
      createPrivacyFenceEnvelope(
        authority,
        envelope.authStateDigest,
        { ...binding, expiresAt: '2026-10-11T00:16:00Z' },
        now,
      ),
    ).toThrow('bounded physical');
    expect(() =>
      validateRecoveryFenceEnvelope(
        { ...envelope, serviceActivationAllowed: true },
        held,
        now,
      ),
    ).toThrow();
  });
});
