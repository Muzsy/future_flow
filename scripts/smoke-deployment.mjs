import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

// Never point this test at the user's VPS, database, or experimental API budget.
assert.equal(process.platform, 'linux');
assert.equal(process.env.CI, 'true');
assert.equal(process.env.GITHUB_ACTIONS, 'true');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = realpathSync(tmpdir());
const fixture = mkdtempSync(join(temporaryRoot, 'alterward-ci-'));
const project = `alterward-ci-${process.pid}`;
const network = `${project}-proxy`;
const env = {
  ...process.env,
  PUBLIC_HOST: 'localhost',
  ALTERWARD_TAG: 'ci',
  ALTERWARD_PROXY_NETWORK: network,
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ci_unused',
  SUPABASE_SERVICE_ROLE_KEY: 'ci_admin_unused',
  OPENAI_API_KEY: 'ci_openai_unused',
  DATABASE_URL:
    'postgresql://postgres:ci_unused_outside_fixture@postgres:5432/postgres',
  DATABASE_SSL_CA_HOST_FILE: join(fixture, 'ca.crt'),
  CI_TLS_DIRECTORY: fixture,
  AI_PROJECT_BUDGET_USD: '0',
  AI_USER_BUDGET_USD: '0',
};
const envFile = join(fixture, 'empty.env');
writeFileSync(
  envFile,
  '# All test values are explicit in the process environment.\n',
  {
    mode: 0o600,
  },
);
const composeArgs = [
  'compose',
  '--project-name',
  project,
  '--env-file',
  envFile,
  '-f',
  join(root, 'deploy/compose.contabo.yaml'),
  '-f',
  join(root, 'tests/deployment/compose.smoke.yaml'),
];
function run(command, args, timeout = 120000) {
  return execFileSync(command, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
}
const compose = (...args) => run('docker', [...composeArgs, ...args]);
async function waitFor(label, check) {
  const deadline = Date.now() + 60000;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      if (check()) return;
    } catch (error) {
      lastError = error.stderr?.toString().trim() || error.message;
      // Services may still be starting. Retry for at most one minute.
    }
    await setTimeout(2000);
  }
  throw new Error(`${label} readiness timed out: ${lastError}`);
}
let networkCreated = false;
try {
  run('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-subj',
    '/CN=alterward CI ephemeral CA',
    '-keyout',
    join(fixture, 'ca.key'),
    '-out',
    join(fixture, 'ca.crt'),
    '-addext',
    'basicConstraints=critical,CA:TRUE',
  ]);
  run('openssl', [
    'req',
    '-new',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-subj',
    '/CN=localhost',
    '-keyout',
    join(fixture, 'server.key'),
    '-out',
    join(fixture, 'server.csr'),
  ]);
  writeFileSync(
    join(fixture, 'server.ext'),
    'subjectAltName=DNS:localhost,DNS:postgres\nbasicConstraints=critical,CA:FALSE\nextendedKeyUsage=serverAuth\n',
  );
  run('openssl', [
    'x509',
    '-req',
    '-days',
    '1',
    '-in',
    join(fixture, 'server.csr'),
    '-CA',
    join(fixture, 'ca.crt'),
    '-CAkey',
    join(fixture, 'ca.key'),
    '-CAcreateserial',
    '-extfile',
    join(fixture, 'server.ext'),
    '-out',
    join(fixture, 'server.crt'),
  ]);
  chmodSync(join(fixture, 'ca.key'), 0o600);
  chmodSync(join(fixture, 'ca.crt'), 0o644);
  chmodSync(join(fixture, 'server.crt'), 0o644);
  run('docker', ['pull', 'postgres:16-bookworm']);
  run('docker', ['pull', 'caddy:2']);
  const postgresGroup = run('docker', [
    'run',
    '--rm',
    '--entrypoint',
    'id',
    'postgres:16-bookworm',
    '-g',
    'postgres',
  ]).trim();
  assert(/^\d+$/.test(postgresGroup));
  run('sudo', ['chown', `root:${postgresGroup}`, join(fixture, 'server.key')]);
  run('sudo', ['chmod', '640', join(fixture, 'server.key')]);
  run('docker', ['network', 'create', '--internal', network]);
  networkCreated = true;
  compose(
    'up',
    '-d',
    '--no-build',
    '--wait',
    '--wait-timeout',
    '60',
    'postgres',
  );
  // Create the Supabase client roles in this disposable PostgreSQL fixture before
  // migration revokes run. These roles cannot log in and never touch a live DB.
  compose(
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    'CREATE ROLE anon NOLOGIN',
    '-c',
    'CREATE ROLE authenticated NOLOGIN',
  );
  // Both runs use verified DB TLS and the production migration/checksum runner.
  compose('run', '--rm', '--no-deps', 'api', 'pnpm', 'db:migrate');
  compose('run', '--rm', '--no-deps', 'api', 'pnpm', 'db:migrate');
  const sharedFoundation = JSON.parse(
    compose(
      'run',
      '--rm',
      '--no-deps',
      '-e',
      'CI=true',
      '-e',
      'GITHUB_ACTIONS=true',
      '-e',
      'AI_PROJECT_BUDGET_USD=0',
      '-e',
      'AI_USER_BUDGET_USD=0',
      'api',
      'node',
      'scripts/smoke-shared-foundation.mjs',
    ).trim(),
  );
  assert.equal(sharedFoundation.sharedFoundationPostgres, 'passed');
  assert.equal(sharedFoundation.publicReviewPostgres, 'passed');
  assert.equal(sharedFoundation.publicEditorPreflightPrivate, true);
  assert.equal(sharedFoundation.publicEditorConcurrentSaveOnce, true);
  assert.equal(sharedFoundation.publicEditorRestoreAndNewReview, true);
  assert.equal(sharedFoundation.publicReviewConcurrentStartOnce, true);
  assert.equal(sharedFoundation.publicReviewSourceDeletionGuard, true);
  assert.equal(sharedFoundation.publicReviewJobConcurrentEnqueueOnce, true);
  assert.equal(sharedFoundation.publicReviewJobConcurrentClaimOnce, true);
  assert.equal(sharedFoundation.publicReviewJobNoAutomaticRetry, true);
  assert.equal(sharedFoundation.publicReviewJobDeletionGuard, true);
  assert.equal(sharedFoundation.fullContentReviewConcurrentEnqueueOnce, true);
  assert.equal(sharedFoundation.fullContentReviewConcurrentClaimOnce, true);
  assert.equal(sharedFoundation.fullContentReviewNoAutomaticRetry, true);
  assert.equal(sharedFoundation.fullContentReviewSourceDeletionGuard, true);
  assert.equal(sharedFoundation.fullContentCurationConcurrentSubmitOnce, true);
  assert.equal(
    sharedFoundation.fullContentCurationConcurrentDecisionOnce,
    true,
  );
  assert.equal(
    sharedFoundation.fullContentCurationPrivateImmutableExported,
    true,
  );
  assert.equal(sharedFoundation.fullContentCurationSourceDeletionGuard, true);
  assert.equal(sharedFoundation.publicCurationConcurrentSubmitOnce, true);
  assert.equal(sharedFoundation.publicCurationConcurrentDecisionOnce, true);
  assert.equal(sharedFoundation.publicCurationSourceDeletionGuard, true);
  assert.equal(sharedFoundation.publicCurationNoPublication, true);
  assert.equal(sharedFoundation.scenarioConcurrentCreateOnce, true);
  assert.equal(sharedFoundation.scenarioConcurrentRevisionOnce, true);
  assert.equal(sharedFoundation.scenarioConcurrentStartOnce, true);
  assert.equal(sharedFoundation.scenarioPrivateFreshReferences, true);
  assert.equal(sharedFoundation.scenarioQuotaRollback, true);
  assert.equal(sharedFoundation.scenarioDeletionGuard, true);
  assert.equal(sharedFoundation.forkCheckpointConcurrentSaveOnce, true);
  assert.equal(sharedFoundation.forkCheckpointSourceDeletionGuard, true);
  assert.equal(sharedFoundation.forkCheckpointNoPublication, true);
  assert.equal(sharedFoundation.sharedEnginePostgres, 'passed');
  assert.equal(sharedFoundation.tenParallelIntents, true);
  assert.equal(sharedFoundation.decisionResolutionOnce, true);
  assert.equal(sharedFoundation.pendingDecisionDeletion, true);
  assert.equal(sharedFoundation.sharedJobsPostgres, 'passed');
  assert.equal(sharedFoundation.parallelSharedEnqueueAndClaim, true);
  assert.equal(sharedFoundation.reclaimedSharedLease, true);
  assert.equal(sharedFoundation.sharedPersonalPostgres, 'passed');
  assert.equal(sharedFoundation.delayedSharedResolution, true);
  assert.equal(sharedFoundation.concurrentPersonalMemoryOnce, true);
  assert.equal(sharedFoundation.personalMemoryDeletionRace, true);
  const officialLife = JSON.parse(
    compose(
      'run',
      '--rm',
      '--no-deps',
      '-e',
      'CI=true',
      '-e',
      'GITHUB_ACTIONS=true',
      '-e',
      'AI_PROJECT_BUDGET_USD=0',
      '-e',
      'AI_USER_BUDGET_USD=0',
      'api',
      'node',
      'node_modules/tsx/dist/cli.mjs',
      '--tsconfig',
      'tsconfig.scripts.json',
      'scripts/smoke-official-life.ts',
    ).trim(),
  );
  assert.equal(officialLife.officialLifePostgres, 'passed');
  for (const proof of [
    'prospectiveConcurrentStartOnce',
    'completeChainAndRepairEvidence',
    'concurrentExactGrantOnce',
    'technicalReceiptRejected',
    'crossOwnerRejected',
    'terminalRevocationRace',
    'deletionRecoveryExportCascadeRls',
  ])
    assert.equal(officialLife[proof], true);
  assert.equal(officialLife.publicationApproved, false);
  assert.equal(officialLife.actualProviderCalls, 0);
  assert.equal(officialLife.actualOfficialSeed, false);
  for (const proof of [
    'concurrentExactPreviewConfirmOnce',
    'distinctOfficialProjection',
    'concurrentSecretRotation',
    'sourceRevocationWithdrawsCopy',
    'deletionReaderRaceRecoveryCascadeRls',
  ])
    assert.equal(officialLife.officialPublication[proof], true);
  assert.equal(officialLife.officialPublication.actualProviderCalls, 0);
  assert.equal(officialLife.officialPublication.actualOfficialSeed, false);
  for (const proof of [
    'activePublicReaderCardsOnly',
    'boundedLiteralEnglishSearch',
    'stableNewestPages',
    'withdrawalBetweenLookupAndRead',
    'sourceRevocationAndDeletionExcluded',
    'noPrivateProvenanceInCards',
  ])
    assert.equal(officialLife.discovery[proof], true);
  assert.equal(officialLife.discovery.actualProviderCalls, 0);
  for (const proof of [
    'concurrentIdempotentSaveOnce',
    'oppositeDirectionLockOrder',
    'privateAccountIsolationAndMinimalExport',
    'withdrawAndUnsaveIdempotency',
    'deletionRaceRecoveryCascadeRls',
  ])
    assert.equal(officialLife.savedLives[proof], true);
  assert.equal(officialLife.savedLives.actualProviderCalls, 0);
  for (const proof of [
    'concurrentReportDedupOnce',
    'moderationDecisionRaceOnce',
    'warningPrivateToPublisher',
    'explicitRestrictionRestoreOnce',
    'liveOfficialPermissionAndExport',
    'deletionCascadeRls',
  ])
    assert.equal(officialLife.publicSafety[proof], true);
  assert.equal(officialLife.publicSafety.actualProviderCalls, 0);
  for (const proof of [
    'concurrentReadingAndSignalOnce',
    'dailyAdmissionRollbackRace',
    'serverElapsedTimeRequired',
    'serverActionsCountOnce',
    'unsavePublisherDeletionRace',
    'expiredCleanupAndPrivateExport',
    'livePermissionCascadeRls',
  ])
    assert.equal(officialLife.publicMetrics[proof], true);
  assert.equal(officialLife.publicMetrics.actualProviderCalls, 0);
  for (const proof of [
    'concurrentExactSelectionOnce',
    'competingRevisionDecisionOnce',
    'curatedOrderAndMinimalProjection',
    'officialCommunityEligibility',
    'liveWithdrawalDeletionRace',
    'publisherCascadePrivateRlsImmutableAudit',
  ])
    assert.equal(officialLife.publicCollections[proof], true);
  assert.equal(officialLife.publicCollections.actualProviderCalls, 0);
  for (const proof of [
    'concurrentExactPermissionOnce',
    'competingPermissionRevisionOnce',
    'explicitOwnerAndCuratorAuthority',
    'boundedSitemapAndMinimalProjection',
    'liveRevocationAndDeletionRecovery',
    'deletionRaceCascadePrivateAudit',
  ])
    assert.equal(officialLife.publicExposure[proof], true);
  assert.equal(officialLife.publicExposure.actualProviderCalls, 0);
  for (const proof of [
    'concurrentExactRefreshOnce',
    'competingReplacementOnce',
    'immutableNewCopyAndPrivateCanon',
    'oldPublicUnlistedAndExternalPermissionsStop',
    'exactOfficialGrantAndRollback',
    'inactiveReplayExportAndImmutableHistory',
    'physicalDeletionRaceAndCascade',
  ])
    assert.equal(officialLife.publicationRefresh[proof], true);
  assert.equal(officialLife.publicationRefresh.actualProviderCalls, 0);
  assert.equal(officialLife.publicationRefresh.actualOfficialSeed, false);
  for (const proof of [
    'concurrentExactDeleteOnce',
    'refreshDeletionRaceNoResurrection',
    'publicExternalSourceCascade',
    'sharedInFlightScrubAndRemainingLife',
    'quotaNotResetByDeletion',
    'minimalExportExpiryImmutableRls',
    'accountAdmissionCascade',
  ])
    assert.equal(officialLife.lifeDeletion[proof], true);
  assert.equal(officialLife.lifeDeletion.actualProviderCalls, 0);
  compose(
    'up',
    '-d',
    '--no-build',
    '--wait',
    '--wait-timeout',
    '60',
    'web',
    'api',
    'worker',
    'smoke-proxy',
  );
  // Internal networks have no published-port NAT. The host can reach their
  // bridge address directly; --resolve still verifies the localhost TLS name.
  const proxyId = compose('ps', '-q', 'smoke-proxy').trim();
  const proxy = JSON.parse(run('docker', ['inspect', proxyId]))[0];
  const proxyAddress = proxy.NetworkSettings.Networks[network].IPAddress;
  assert(/^\d{1,3}(\.\d{1,3}){3}$/.test(proxyAddress));
  const curlArgs = [
    '--silent',
    '--show-error',
    '--noproxy',
    '*',
    '--connect-timeout',
    '2',
    '--max-time',
    '5',
    '--cacert',
    join(fixture, 'ca.crt'),
    '--resolve',
    `localhost:443:${proxyAddress}`,
  ];
  await waitFor('HTTPS web', () =>
    run('curl', [...curlArgs, '--fail', 'https://localhost/']).includes(
      'alterward',
    ),
  );
  const response = JSON.parse(
    run('curl', [...curlArgs, 'https://localhost/api/v1/me']),
  );
  assert.equal(response.error.code, 'AUTH_REQUIRED');
  const disabledDiscovery = JSON.parse(
    run('curl', [...curlArgs, 'https://localhost/api/public/discovery']),
  );
  assert.equal(disabledDiscovery.error.code, 'DISCOVERY_DISABLED');
  const disabledMetrics = JSON.parse(
    run('curl', [
      ...curlArgs,
      '-X',
      'POST',
      '-H',
      'Content-Type: application/json',
      '--data',
      '{"readingId":"00000000-0000-4000-8000-000000000000"}',
      'https://localhost/api/public/reading/life-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ]),
  );
  assert.equal(disabledMetrics.error.code, 'PUBLIC_METRICS_DISABLED');
  const disabledCollections = JSON.parse(
    run('curl', [
      ...curlArgs,
      'https://localhost/api/public/collections/featured',
    ]),
  );
  assert.equal(disabledCollections.error.code, 'PUBLIC_COLLECTIONS_DISABLED');
  const sitemapXml = run('curl', [
    ...curlArgs,
    '--fail',
    'https://localhost/sitemap.xml',
  ]);
  assert(sitemapXml.includes('<urlset'));
  assert(!sitemapXml.includes('<url>'));
  const disabledPreview = run('curl', [
    ...curlArgs,
    '-o',
    '/dev/null',
    '-w',
    '%{http_code}',
    'https://localhost/share-preview/life-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  ]);
  assert.equal(disabledPreview, '404');
  const noindexPage = run('curl', [
    ...curlArgs,
    '-D',
    '-',
    'https://localhost/lives/life-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  ]);
  assert(noindexPage.includes('noindex'));
  assert(noindexPage.toLowerCase().includes('cdn-cache-control: no-store'));
  assert(!noindexPage.includes('property="og:title"'));
  assert.equal(
    run('curl', [
      ...curlArgs,
      '-o',
      '/dev/null',
      '-w',
      '%{http_code}',
      'https://localhost/api/v1/me',
    ]),
    '401',
  );
  await waitFor('Worker queue polling', () => {
    // The full statement log includes every preceding database proof. Read a
    // bounded recent window so a growing history cannot exhaust exec's buffer.
    const log = compose('logs', '--no-color', '--tail', '200', 'postgres');
    return (
      log.includes('SELECT j.* FROM aw_jobs') && log.includes('FROM ff_jobs')
    );
  });
  const tlsConnections = compose(
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'postgres',
    '-Atc',
    "SELECT count(*) FROM pg_stat_ssl s JOIN pg_stat_activity a USING(pid) WHERE s.ssl AND a.usename='postgres'",
  );
  assert(Number(tlsConnections.trim()) >= 1);
  assert.equal(
    compose(
      'exec',
      '-T',
      'api',
      'node',
      '-e',
      `const {connectDatabase}=require('@future-flow/database');
       (async()=>{const db=connectDatabase(process.env.DATABASE_URL,true);
       try {const rows=await db.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()');
       if(rows[0]?.ssl!==true)throw Error('TLS missing');console.log('api-db-tls-verified');}
       finally {await db.close();}})().catch(()=>{process.exitCode=1;});`,
    ).trim(),
    'api-db-tls-verified',
  );
  const counts = compose(
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'postgres',
    '-Atc',
    'SELECT (SELECT count(*) FROM ff_migrations), (SELECT count(*) FROM ff_jobs), (SELECT count(*) FROM aw_jobs), (SELECT count(*) FROM aw_public_review_jobs), (SELECT count(*) FROM aw_public_content_reviews)',
  );
  assert.equal(counts.trim(), '32|0|0|0|0');
  compose('stop', '-t', '10', 'worker');
  const workerId = compose('ps', '-aq', 'worker').trim();
  const worker = JSON.parse(run('docker', ['inspect', workerId]))[0];
  assert.equal(worker.State.Running, false);
  assert.equal(worker.State.ExitCode, 0, 'Worker did not exit cleanly');
  console.log(
    JSON.stringify({
      containerSmoke: 'passed',
      migrations: 32,
      sharedFoundation,
      officialLife,
      repeatMigration: 'passed',
      webAndApiViaVerifiedTls: true,
      apiUnauthorized: 401,
      workerPollingBothQueues: true,
      workerStoppedWithoutSigkill: true,
      databaseTlsConnections: Number(tlsConnections.trim()),
      actualCredentialsUsed: false,
      paidAiCalls: 0,
      networkEgressDisabled: true,
    }),
  );
} catch (error) {
  console.error(error.message);
  // This runner is guarded to synthetic, egress-disabled CI only. Preserve the
  // child launcher diagnostic instead of hiding it behind a Docker exit code.
  if (error.stderr) console.error(error.stderr.toString().slice(-8000));
  try {
    console.error(compose('logs', '--no-color', '--tail', '60'));
  } catch {
    /* Best effort. */
  }
  process.exitCode = 1;
} finally {
  try {
    compose('down', '--volumes', '--remove-orphans');
  } catch {
    process.exitCode = 1;
  }
  if (networkCreated) {
    try {
      run('docker', ['network', 'rm', network]);
    } catch {
      process.exitCode = 1;
    }
  }
  const withinTemp = relative(temporaryRoot, realpathSync(fixture));
  assert(withinTemp.startsWith('alterward-ci-') && !withinTemp.includes('..'));
  rmSync(fixture, { recursive: true, force: true });
}
