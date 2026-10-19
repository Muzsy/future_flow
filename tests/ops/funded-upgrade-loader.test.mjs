import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  BUNDLE,
  MODES,
  activeManifestDigest,
  buildProof,
  releaseEvidence,
} from '../../scripts/contabo-funded-upgrade.mjs';
import { reviewedRecoveryRelease } from '../../scripts/contabo-fence-operator.mjs';

const commit = 'e'.repeat(40);
const registry = {
  version: 1,
  releases: [{ commit: 'f'.repeat(40), imageId: 'sha256:' + 'a'.repeat(64) }],
};
const manifest = {
  commit: 'f'.repeat(40),
  imageId: 'sha256:' + 'a'.repeat(64),
  ownerEnvironmentSha256: '1'.repeat(64),
  effectiveComposeSha256: '2'.repeat(64),
  sourceComposeSha256: '3'.repeat(64),
  databaseCaSha256: '4'.repeat(64),
  accessConfigurationSha256: '5'.repeat(64),
};

test('only the five explicit modes and the reviewed root bundle', () => {
  assert.deepEqual(MODES, [
    'inspect',
    'prepare-funded-upgrade',
    'apply-funded-upgrade',
    'recover-funded-upgrade',
    'readback-funded-upgrade',
  ]);
  const names = BUNDLE.map(([, name]) => name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes('alterward_funded_upgrade'));
  // The root executor is not given owner-zero activation or fixture modules.
  assert.ok(
    !BUNDLE.some(([, , file]) => /fixture|owner-upgrade-fixture/.test(file)),
  );
});

test('active manifest digest equals the root encoding of manifest.json', () => {
  const expected = createHash('sha256')
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.keys(manifest)
            .sort()
            .map((k) => [k, manifest[k]]),
        ),
      ) + '\n',
    )
    .digest('hex');
  const personal = {
    ...manifest,
    configurationMode: 'personal-beta',
    paidAiCalls: 0,
  };
  assert.equal(
    activeManifestDigest(personal, registry, reviewedRecoveryRelease),
    expected,
  );
  assert.equal(
    activeManifestDigest(
      { configurationMode: 'funded-upgrade', paidAiCalls: 0, manifest },
      registry,
      reviewedRecoveryRelease,
    ),
    expected,
  );
  for (const stage of [
    { ...manifest, configurationMode: 'readers', paidAiCalls: 0 },
    { ...manifest, paidAiCalls: 0 },
    { ...personal, paidAiCalls: 1 },
    { ...personal, imageId: 'sha256:' + 'b'.repeat(64) },
  ])
    assert.throws(() =>
      activeManifestDigest(stage, registry, reviewedRecoveryRelease),
    );
});

test('build proofs are exact, tagged and confined to the target workspace', () => {
  const proof = {
    commit,
    imageId: 'sha256:' + 'b'.repeat(64),
    imageTag: 'alterward:contabo-' + commit.slice(0, 12),
    sourceDirectory: '/root/alterward-ops/target/source-' + commit,
  };
  assert.equal(buildProof(proof, 'target'), proof);
  for (const broken of [
    { ...proof, imageTag: 'alterward:latest' },
    { ...proof, sourceDirectory: '/tmp/source' },
    { ...proof, imageId: 'b'.repeat(64) },
    { ...proof, extra: true },
  ])
    assert.throws(() => buildProof(broken, 'target'));
});

test('audit and fixture must both name this exact operator commit', () => {
  const audit = {
    sourceCommit: commit,
    scope: 'funded-runtime-upgrade',
    interpretedByOperator: true,
    critical: 0,
    high: 0,
    medium: 0,
  };
  const fixture = {
    sourceCommit: commit,
    actualFundedUpgradePassed: true,
    paidAiCalls: 0,
    existingContainersUnchanged: true,
  };
  assert.match(
    releaseEvidence({ audit, fixture, sourceCommit: commit }),
    /^[a-f0-9]{64}$/,
  );
  for (const [a, f] of [
    [{ ...audit, sourceCommit: 'd'.repeat(40) }, fixture],
    [{ ...audit, medium: 1 }, fixture],
    [{ ...audit, scope: 'personal-beta' }, fixture],
    [audit, { ...fixture, sourceCommit: 'd'.repeat(40) }],
    [audit, { ...fixture, paidAiCalls: 1 }],
    [audit, { ...fixture, actualFundedUpgradePassed: false }],
  ])
    assert.throws(() =>
      releaseEvidence({ audit: a, fixture: f, sourceCommit: commit }),
    );
});

test('the loader ships the same observation library the root binds by hash', () => {
  const source = readFileSync(
    new URL(
      '../../scripts/lib/funded-upgrade-observation.mjs',
      import.meta.url,
    ),
  );
  assert.ok(source.length < 128 * 1024);
  assert.doesNotMatch(source.toString(), /INSERT|UPDATE|DELETE|DROP|ALTER/);
});
