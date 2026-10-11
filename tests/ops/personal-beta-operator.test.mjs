import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  personalRuntimeManifest,
  operatorChildEnvironment,
} from '../../scripts/contabo-personal-beta.mjs';
import {
  activeRecoveryManifest,
  reviewedRecoveryRelease,
} from '../../scripts/contabo-fence-operator.mjs';
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/recovery-manifest.json', import.meta.url)),
);
const manifest = fixture.manifest;
const build = { commit: manifest.commit, imageId: manifest.imageId };
const registry = { version: 1, releases: [build] };
const stage = {
  ...manifest,
  upgraded: true,
  imageOnly: false,
  configurationOnly: true,
  configurationMode: 'personal-beta',
  runningServices: 3,
  paidAiCalls: 0,
  betaWindowActive: false,
  budgetWindowConfigured: true,
  selectedReaders: 2,
  accessEmailCount: 3,
  startsAt: '2026-10-11T18:00:00Z',
  endsAt: '2026-11-10T18:00:00Z',
  projectUsd: '2',
  userUsd: '0.5',
};
const bound = (value) =>
  personalRuntimeManifest(
    value,
    build,
    registry,
    activeRecoveryManifest,
    reviewedRecoveryRelease,
  );
test('funded mode uses the same canonical seven-field root manifest without relaxing the owner fence', () => {
  assert.equal(bound(stage), fixture.expectedCanonicalSha256);
  assert.throws(() => activeRecoveryManifest(stage, build, registry));
});
test('bounded accounts, exact window, positive approved allowance and mode are mandatory', () => {
  for (const patch of [
    { selectedReaders: 0 },
    { selectedReaders: 11 },
    { selectedReaders: true },
    { accessEmailCount: 5 },
    { runningServices: 2 },
    { imageOnly: true },
    { configurationOnly: false },
    { budgetWindowConfigured: false },
    { betaWindowActive: true },
    { paidAiCalls: 1 },
    { projectUsd: '2.000001' },
    { projectUsd: '0' },
    { projectUsd: 2 },
    { userUsd: '0.500001' },
    { projectUsd: '0.1', userUsd: '0.5' },
    { startsAt: 'invalid' },
    { endsAt: '2026-11-11T18:00:00Z' },
    { ownerEnvironmentSha256: 'x' },
    { imageId: 'sha256:' + 'f'.repeat(64) },
    { configurationMode: 'shared' },
  ])
    assert.throws(
      () => bound({ ...stage, ...patch }),
      undefined,
      JSON.stringify(patch),
    );
});
test('existing unpaid owner and reader receipts keep their original validator', () => {
  const owner = {
    ...manifest,
    upgraded: true,
    imageOnly: true,
    runningServices: 3,
    paidAiCalls: 0,
    betaWindowActive: false,
  };
  assert.equal(bound(owner), fixture.expectedCanonicalSha256);
  assert.equal(
    bound({
      ...owner,
      imageOnly: false,
      configurationOnly: true,
      configurationMode: 'readers',
      selectedReaders: 2,
      accessEmailCount: 3,
    }),
    fixture.expectedCanonicalSha256,
  );
});
test('operator helpers inherit only OS paths, never provider, database or Auth credentials', () => {
  assert.deepEqual(
    operatorChildEnvironment({
      Path: 'safe_os_path',
      SystemRoot: 'safe_os_root',
      LOCALAPPDATA: 'safe_user_appdata',
      ProgramData: 'safe_system_appdata',
      ALLUSERSPROFILE: 'safe_system_profile',
      TEMP: 'safe_temp',
      OPENAI_API_KEY: 'synthetic_provider',
      ANTHROPIC_API_KEY: 'synthetic_claude',
      DATABASE_URL: 'synthetic_database',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic_auth_admin',
      GIT_ASKPASS: 'untrusted_override',
      NODE_OPTIONS: 'untrusted_child_code',
    }),
    {
      Path: 'safe_os_path',
      SystemRoot: 'safe_os_root',
      LOCALAPPDATA: 'safe_user_appdata',
      ProgramData: 'safe_system_appdata',
      ALLUSERSPROFILE: 'safe_system_profile',
      TEMP: 'safe_temp',
    },
  );
});
