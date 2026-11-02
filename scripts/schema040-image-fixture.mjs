import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { realpathSync, readFileSync } from 'node:fs';
import {
  registryImageFixtureVersion,
  registryImageFixtureChecks,
  schema040FixtureNames,
} from './lib/schema040-fixture-contract.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const call = (args, options = {}) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
export function runRegistryImageFixture(context, scope) {
  assert.equal(process.platform, 'linux');
  assert(['ci', 'image-rehearsal'].includes(scope));
  if (scope === 'ci') {
    assert.equal(process.env.CI, 'true');
    assert.equal(process.env.GITHUB_ACTIONS, 'true');
  } else {
    assert(!process.env.CI && !process.env.GITHUB_ACTIONS);
  }
  assert(/^sha256:[a-f0-9]{64}$/.test(context.image));
  assert(/^[a-f0-9]{40}$/.test(context.sourceCommit));
  assert.equal(context.privacy.serviceAccessQuarantined, true);
  assert.equal(context.privacy.serviceActivationAllowed, false);
  assert(
    /^(alterward-ci-|alterward-image-rehearsal-)/.test(context.databaseNetwork),
  );
  const network = JSON.parse(
    call(['network', 'inspect', context.databaseNetwork]),
  )[0];
  const postgres = JSON.parse(call(['inspect', context.postgres]))[0];
  assert.equal(network.Internal, true);
  assert.equal(postgres.State.Running, true);
  assert.equal(Object.keys(postgres.NetworkSettings.Networks).length, 1);
  assert(postgres.NetworkSettings.Networks[context.databaseNetwork]);
  assert.equal(
    postgres.Config.Labels['com.docker.compose.service'],
    'postgres',
  );
  const password = postgres.Config.Env.find((v) =>
    v.startsWith('POSTGRES_PASSWORD='),
  )?.slice('POSTGRES_PASSWORD='.length);
  assert(['ci_unused_outside_fixture', 'rehearsal_unused'].includes(password));
  const ca = realpathSync(context.ca);
  assert.equal(ca, context.ca);
  const nonce = randomUUID().replaceAll('-', '').slice(0, 24),
    names = schema040FixtureNames(nonce);
  const binding = {
    sourceCommit: context.sourceCommit,
    image: context.image,
    sourceHashes: context.sourceHashes,
    bundleSha256: context.bundleSha256,
  };
  const instanceSha256 = sha(
    JSON.stringify({
      container: postgres.Id,
      network: network.Id,
      ca: sha(readFileSync(ca)),
    }),
  );
  let count = 0,
    phase = 'initialization',
    result;
  function clean(id, name) {
    const inspected = spawnSync('docker', ['inspect', id], {
      encoding: 'utf8',
      timeout: 10000,
    });
    if (inspected.status !== 0) {
      if (/No such (object|container)/i.test(inspected.stderr ?? '')) return;
      throw Error('Cannot inspect fixture cleanup');
    }
    const value = JSON.parse(inspected.stdout)[0];
    assert.equal(value.Id, id);
    assert.equal(value.Name, '/' + name);
    assert.equal(value.Image, context.image);
    assert.equal(value.Config.Labels['com.alterward.schema040-fixture'], nonce);
    call(['rm', '-f', id]);
  }
  function rpc(mode, values = {}) {
    const name = 'alterward-schema040-' + nonce + '-' + ++count;
    const id = call([
      'create',
      '--rm',
      '-i',
      '--name',
      name,
      '--label',
      'com.alterward.schema040-fixture=' + nonce,
      '--network',
      context.databaseNetwork,
      '--user',
      'node',
      '--read-only',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=64m',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges:true',
      '--memory',
      '1g',
      '--cpus',
      '1',
      '--pids-limit',
      '128',
      '--mount',
      'type=bind,src=' + ca + ',dst=/run/secrets/supabase-ca.crt,readonly',
      '-e',
      'ALTERWARD_SCHEMA040_FIXTURE=true',
      '-e',
      'AI_PROJECT_BUDGET_USD=0',
      '-e',
      'AI_USER_BUDGET_USD=0',
      '-e',
      'OPENAI_API_KEY=',
      '-e',
      'ANTHROPIC_API_KEY=',
      '-e',
      'DATABASE_URL=postgresql://postgres:' +
        password +
        '@postgres:5432/postgres',
      '-e',
      'DATABASE_SSL_CA_FILE=/run/secrets/supabase-ca.crt',
      '--entrypoint',
      'node',
      context.image,
      'node_modules/tsx/dist/cli.mjs',
      '--tsconfig',
      'tsconfig.scripts.json',
      'scripts/ops/service-registry-fixture-db.ts',
    ]).trim();
    assert(/^[a-f0-9]{64}$/.test(id));
    try {
      return JSON.parse(
        call(['start', '-ai', id], {
          input: JSON.stringify({ mode, nonce, binding, ...values }),
        }),
      );
    } finally {
      clean(id, name);
    }
  }
  function expectedFailure(mode, values, expectedPhase) {
    try {
      rpc(mode, values);
      throw Error('Fixture unexpectedly succeeded');
    } catch (error) {
      assert(
        error.status !== undefined,
        'A real fixture process failure is required',
      );
      const lines = String(error.stderr ?? '')
        .trim()
        .split('\n');
      const report = JSON.parse(lines.at(-1));
      assert.equal(report.schema040FixtureFailure, true);
      assert.equal(report.phase, expectedPhase);
    }
  }
  const checks = {};
  try {
    phase = 'runtime';
    const source = rpc('source');
    assert.deepEqual(source.names, names);
    for (const key of [
      'runtime039To040',
      'billingLedgerPreserved',
      'migrationReceiptsPreserved',
      'interruptedMigrationRolledBack',
    ])
      assert.equal(source.runtime[key], true, key);
    Object.assign(checks, source.runtime);
    phase = 'dump039';
    // Genuine data-only PostgreSQL archive bytes from the frozen039 snapshot.
    // Nothing here is an offsite/age/production backup or operator audit proof.
    const archive = call(
      [
        'exec',
        postgres.Id,
        'pg_dump',
        '-U',
        'postgres',
        '--format=custom',
        '--data-only',
        '--schema=public',
        '--no-owner',
        '--no-privileges',
        names.snapshot,
      ],
      { encoding: null },
    );
    assert(Buffer.isBuffer(archive) && archive.length > 0);
    const dumpSha256 = sha(archive);
    phase = 'target039';
    const target = rpc('target', {
      source: source.source,
      dumpSha256,
      instanceSha256,
    });
    assert.equal(target.context.quarantineDatabase, names.target);
    assert.equal(target.context.backupDumpSha256, dumpSha256);
    call(
      [
        'exec',
        '-i',
        postgres.Id,
        'pg_restore',
        '-U',
        'postgres',
        '--dbname=' + names.target,
        '--data-only',
        '--no-owner',
        '--no-privileges',
        '--disable-triggers',
        '--single-transaction',
      ],
      { input: archive },
    );
    checks.physical039DumpRestored = true;
    phase = 'plan039';
    const intent = rpc('plan', target);
    assert.equal(intent.before.schema, 39);
    assert.equal(
      intent.sourceAuthoritySha256,
      shaStable(source.source.authority),
    );
    checks.historicalPrivacyVerified = true;
    phase = 'interrupted-append';
    expectedFailure(
      'apply',
      { ...target, intent, interrupt: 'before-receipt' },
      'before-receipt',
    );
    assert.deepEqual(rpc('state039', target).before, intent.before);
    phase = 'lost-output';
    expectedFailure(
      'apply',
      { ...target, intent, interrupt: 'lost-output' },
      'lost-output',
    );
    phase = 'readonly-recovery';
    const proof = rpc('verify', { ...target, intent });
    assert.equal(proof.version, 'alterward-registry-migration-restore-proof-1');
    assert.equal(proof.replayedDataPreserved, true);
    assert.equal(proof.newRegistryEmpty, true);
    assert.equal(proof.reviewedTables, 102);
    assert.equal(proof.reviewedForeignKeys, 226);
    assert.equal(proof.serviceActivationAllowed, false);
    assert.equal(proof.providerApiCalls, 0);
    checks.registryPrivacyVerified = true;
    checks.lostOutputReadOnlyRecovery = true;
    const receipt = call([
      'exec',
      postgres.Id,
      'psql',
      '-U',
      'postgres',
      '-d',
      names.target,
      '-At',
      '-c',
      "SELECT (applied_at AT TIME ZONE 'UTC')::text FROM ff_migrations WHERE name='040_service_access_registry.sql'",
    ]).trim();
    assert(receipt);
    const repeated = rpc('verify', { ...target, intent });
    for (const key of [
      'before',
      'after',
      'intentSha256',
      'newRegistryEmpty',
      'replayedDataPreserved',
    ])
      assert.deepEqual(repeated[key], proof[key]);
    assert.equal(
      call([
        'exec',
        postgres.Id,
        'psql',
        '-U',
        'postgres',
        '-d',
        names.target,
        '-At',
        '-c',
        "SELECT (applied_at AT TIME ZONE 'UTC')::text FROM ff_migrations WHERE name='040_service_access_registry.sql'",
      ]).trim(),
      receipt,
    );
    checks.noSqlReplay = true;
    phase = 'drift';
    for (const kind of ['billing', 'registry', 'receipt']) {
      rpc('drift', { ...target, kind });
      expectedFailure('verify', { ...target, intent }, 'verify');
      rpc('drift', { ...target, kind, reset: true });
      assert.equal(rpc('verify', { ...target, intent }).newRegistryEmpty, true);
    }
    checks.driftRefused = true;
    checks.native040PrivacyProofBound = true;
    result = {
      version: registryImageFixtureVersion,
      scope,
      sourceCommit: context.sourceCommit,
      imageId: context.image,
      bundleSha256: context.bundleSha256,
      profile: 'historical039-to-registry040',
      backupDumpSha256: dumpSha256,
      instanceSha256,
      native040PrivacyFixtureSha256: shaStable(context.privacy),
      intentSha256: shaStable(intent),
      migrationRestoreProofSha256: shaStable(proof),
      checks,
      syntheticFixture: true,
      operatorAudit: false,
      serviceActivationAllowed: false,
      providerApiCalls: 0,
    };
  } catch {
    throw Error('Registry040 image fixture refused at ' + phase);
  } finally {
    assert.equal(rpc('cleanup').cleanup, true);
    checks.cleanup = true;
  }
  assert.deepEqual(
    Object.keys(checks).sort(),
    [...registryImageFixtureChecks].sort(),
  );
  assert(Object.values(checks).every((value) => value === true));
  return result;
}
function shaStable(value) {
  const normalize = (item) =>
    Array.isArray(item)
      ? item.map(normalize)
      : item && typeof item === 'object'
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, normalize(v)]),
          )
        : item;
  return sha(JSON.stringify(normalize(value)));
}
if (
  process.argv[1] &&
  new URL(import.meta.url).pathname === realpathSync(process.argv[1])
) {
  try {
    const raw = readFileSync(0, 'utf8');
    assert(Buffer.byteLength(raw) < 4 * 1024 * 1024);
    const { context, scope } = JSON.parse(raw);
    console.log(JSON.stringify(runRegistryImageFixture(context, scope)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
