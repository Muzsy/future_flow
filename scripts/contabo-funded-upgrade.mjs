import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// N09 / Issue #34: git-bound Linux loader for the funded-runtime upgrade of
// an already active personal beta. It never starts a window, changes a
// budget, edits Access, rotates a key or calls a provider; the root executor
// (scripts/ops/contabo-funded-upgrade.py) re-verifies the live state, the
// preparation bindings and the image proofs. CI run ids, the audit hash and
// the helper hashes are checked by this loader and carried, not re-derived.

export const MODES = [
  'inspect',
  'prepare-funded-upgrade',
  'apply-funded-upgrade',
  'recover-funded-upgrade',
  'readback-funded-upgrade',
];
const MUTATING = new Set(['apply-funded-upgrade', 'recover-funded-upgrade']);
const EVIDENCE = new Set(['prepare-funded-upgrade', 'apply-funded-upgrade']);
export const BUNDLE = [
  ['backup', 'alterward_backup', 'contabo-backup.py'],
  ['target', 'alterward_target', 'contabo-target.py'],
  ['owner', 'alterward_owner', 'contabo-owner.py'],
  ['activation', 'alterward_activation', 'contabo-owner-activation.py'],
  ['upgrade', 'alterward_upgrade', 'contabo-owner-upgrade.py'],
  ['fence', 'alterward_fence', 'contabo-writer-fence.py'],
  ['readers', 'alterward_readers', 'contabo-personal-beta-readers.py'],
  [
    'observation',
    'alterward_personal_observation',
    'contabo-personal-beta-observation.py',
  ],
  ['policy', 'alterward_funded_policy', 'contabo-funded-upgrade-policy.py'],
  ['funded', 'alterward_funded_upgrade', 'contabo-funded-upgrade.py'],
];
const hex64 = /^[a-f0-9]{64}$/;
const commit40 = /^[a-f0-9]{40}$/;
const image = /^sha256:[a-f0-9]{64}$/;

export function buildProof(value, label) {
  if (
    !value ||
    Object.keys(value).sort().join(',') !==
      'commit,imageId,imageTag,sourceDirectory' ||
    !commit40.test(value.commit) ||
    !image.test(value.imageId) ||
    value.imageTag !== 'alterward:contabo-' + value.commit.slice(0, 12) ||
    typeof value.sourceDirectory !== 'string' ||
    !value.sourceDirectory.startsWith('/root/alterward-ops/target/')
  )
    throw Error(`Exact ${label} build proof required`);
  return value;
}

// Audit and isolated target fixture must name THIS exact operator commit.
export function releaseEvidence({ audit, fixture, sourceCommit }) {
  if (
    audit?.sourceCommit !== sourceCommit ||
    audit.scope !== 'funded-runtime-upgrade' ||
    audit.interpretedByOperator !== true ||
    audit.critical !== 0 ||
    audit.high !== 0 ||
    audit.medium !== 0 ||
    fixture?.sourceCommit !== sourceCommit ||
    fixture.actualFundedUpgradePassed !== true ||
    fixture.paidAiCalls !== 0 ||
    fixture.existingContainersUnchanged !== true
  )
    throw Error('Exact interpreted audit and actual isolated fixture required');
  return createHash('sha256')
    .update(JSON.stringify(audit) + '\n')
    .digest('hex');
}

// The active manifest digest the root executor recomputes from its file.
export function activeManifestDigest(stage, registry, reviewed) {
  const keys = [
    'accessConfigurationSha256',
    'commit',
    'databaseCaSha256',
    'effectiveComposeSha256',
    'imageId',
    'ownerEnvironmentSha256',
    'sourceComposeSha256',
  ];
  const manifest =
    stage?.configurationMode === 'funded-upgrade' ? stage.manifest : stage;
  reviewed(manifest, registry);
  if (
    !['personal-beta', 'funded-upgrade'].includes(stage?.configurationMode) ||
    stage.paidAiCalls !== 0 ||
    keys.some((k) => typeof manifest?.[k] !== 'string') ||
    keys
      .filter((k) => !['commit', 'imageId'].includes(k))
      .some((k) => !hex64.test(manifest[k]))
  )
    throw Error('Exact active funded runtime receipt required');
  return createHash('sha256')
    .update(
      JSON.stringify(Object.fromEntries(keys.map((k) => [k, manifest[k]]))) +
        '\n',
    )
    .digest('hex');
}

async function main() {
  const mode = process.argv[2]?.replace(/^--/, '');
  const { operatorChildEnvironment } =
    await import('./contabo-personal-beta.mjs');
  const childEnvironment = operatorChildEnvironment(process.env);
  for (const name of Object.keys(process.env))
    if (!(name in childEnvironment)) delete process.env[name];
  if (
    process.platform !== 'linux' ||
    !MODES.includes(mode) ||
    process.argv.length !== 3
  )
    throw Error('Explicit Linux funded upgrade mode required');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const source = (path) => execFileSync('git', ['show', `${commit}:${path}`]);
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const {
    assertOperatorLocalInput,
    operatorSecretsDirectory,
    operatorCiReadToken,
    operatorInputMaximum,
  } = await import('./lib/operator-platform.mjs');
  const regular = (path) => {
    assertOperatorLocalInput(path);
    const stat = lstatSync(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.size > operatorInputMaximum(path)
    )
      throw Error('Bounded private regular file required');
    return readFileSync(path);
  };
  for (const path of [
    'scripts/contabo-funded-upgrade.mjs',
    'scripts/contabo-personal-beta.mjs',
    'scripts/contabo-fence-operator.mjs',
    'scripts/lib/operator-platform.mjs',
    'scripts/lib/private-report.ts',
    'scripts/lib/funded-upgrade-observation.mjs',
  ])
    if (digest(regular(path)) !== digest(source(path)))
      throw Error('Exact committed operator sources required');
  if (
    execFileSync('git', ['branch', '--show-current'], {
      encoding: 'utf8',
    }).trim() !== 'main' ||
    execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
  )
    throw Error('Exact committed clean main operator required');
  const { reviewedRecoveryRelease, exactFenceCiRuns, assertExactFenceCiJobs } =
    await import('./contabo-fence-operator.mjs');
  const { privateReportDirectory, privateReportFile } =
    await import('./lib/private-report.ts');
  const directory = privateReportDirectory('contabo-release');
  const report = (name) => JSON.parse(regular(join(directory, name)));
  const registry = JSON.parse(source('deploy/reviewed-recovery-images.json'));
  const operator = JSON.parse(
    regular('.local/closed-site-operator/operator-config.json'),
  );
  const observationSource = source(
    'scripts/lib/funded-upgrade-observation.mjs',
  ).toString();
  const bundle = Object.fromEntries(
    BUNDLE.map(([key, , file]) => [
      key,
      source('scripts/ops/' + file).toString('base64'),
    ]),
  );
  const request = {
    mode,
    sourceCommit: commit,
    ownerAccess: operator.cloudflareAccess,
    ownerManifestDigest: activeManifestDigest(
      report('owner-stage-proof.json'),
      registry,
      reviewedRecoveryRelease,
    ),
    observationSource,
    observationSourceSha256: digest(Buffer.from(observationSource)),
    helperSourcesSha256: Object.fromEntries(
      BUNDLE.map(([key]) => [key, digest(Buffer.from(bundle[key], 'base64'))]),
    ),
    reviewedImageIds: registry.releases.map((item) => item.imageId),
  };
  if (EVIDENCE.has(mode)) {
    const auditResultSha256 = releaseEvidence({
      audit: report('funded-upgrade-audit-proof.json'),
      fixture: report('funded-upgrade-fixture-proof.json'),
      sourceCommit: commit,
    });
    const token = operatorCiReadToken();
    const github = async (path) => {
      const response = await fetch(
        'https://api.github.com/repos/Muzsy/future_flow/' + path,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Alterward-funded-upgrade-CI',
          },
          signal: AbortSignal.timeout(15000),
          redirect: 'error',
        },
      );
      if (!response.ok) throw Error('Exact CI readback unavailable');
      return response.json();
    };
    const runs = exactFenceCiRuns(
      await github(`actions/runs?head_sha=${commit}&per_page=100`),
      commit,
    );
    for (const run of runs)
      assertExactFenceCiJobs(
        await github(`actions/runs/${run.id}/jobs?per_page=100`),
        commit,
      );
    Object.assign(request, {
      auditSourceCommit: commit,
      auditResultSha256,
      ciRunIds: runs.map((run) => run.id),
      buildProof: buildProof(
        report('funded-upgrade-target-build-proof.json'),
        'target',
      ),
      recoveryProof: buildProof(
        report('funded-upgrade-recovery-build-proof.json'),
        'recovery',
      ),
    });
  }
  if (mode !== 'inspect' && mode !== 'prepare-funded-upgrade') {
    const prepared = report('funded-upgrade-prepare-proof.json');
    request.preparedProof = prepared.preparedProof;
    request.attempt = prepared.attempt;
  }
  const code = `import sys,json,types,base64,signal
p=json.load(sys.stdin)
try:
 for key,name,_ in p['names']:
  m=types.ModuleType(name);sys.modules[name]=m;exec(compile(base64.b64decode(p['bundle'][key]),'<reviewed-'+name+'>','exec'),m.__dict__)
 a=sys.modules['alterward_activation']
 for number in a.INTERRUPTION_SIGNALS:signal.signal(number,a.interrupted)
 print(json.dumps({'ok':True,'result':sys.modules['alterward_funded_upgrade'].main(p['request'])}))
except BaseException:
 print(json.dumps({'ok':False,'phase':'funded-upgrade-operator'}));sys.exit(1)
`;
  const secrets = operatorSecretsDirectory();
  const pin = join(secrets, 'contabo_known_hosts');
  const key = join(secrets, 'contabo_alterward_ed25519');
  const host = regular(pin).toString().trim().split(/\s+/)[0];
  regular(key);
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))
    throw Error('Original pinned host required');
  const pending = promisify(execFile)(
    'ssh',
    [
      '-i',
      key,
      '-F',
      'none',
      '-o',
      'GlobalKnownHostsFile=none',
      '-o',
      `UserKnownHostsFile="${pin}"`,
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'BatchMode=yes',
      '-o',
      'IdentitiesOnly=yes',
      '-o',
      'ClearAllForwardings=yes',
      '-T',
      `root@${host}`,
      "python3 -c '" + code.replaceAll("'", "'\\''") + "'",
    ],
    {
      encoding: 'utf8',
      timeout: MUTATING.has(mode) ? 1800000 : 600000,
      maxBuffer: 4 * 1024 * 1024,
      env: childEnvironment,
    },
  );
  pending.child.stdin.on('error', () => {});
  pending.child.stdin.end(JSON.stringify({ names: BUNDLE, bundle, request }));
  const result = JSON.parse((await pending).stdout);
  if (result.ok !== true) throw Error('Funded upgrade operator failed');
  const saved = {
    ...result.result,
    opsCommit: commit,
    capturedAt: new Date().toISOString(),
  };
  privateReportFile(
    directory,
    `funded-upgrade-${mode.replace(/-funded-upgrade$/, '')}-proof.json`,
    saved,
  );
  // Only a verified apply or an explicit readback becomes the active receipt.
  if (
    (mode === 'apply-funded-upgrade' || mode === 'readback-funded-upgrade') &&
    saved.configurationMode === 'funded-upgrade'
  ) {
    activeManifestDigest(saved, registry, reviewedRecoveryRelease);
    privateReportFile(directory, 'owner-stage-proof.json', saved);
  }
  console.log(
    JSON.stringify({
      mode,
      ok: true,
      resultKeys: Object.keys(result.result),
      paidAiCalls: 0,
    }),
  );
}
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
)
  main().catch(() => {
    console.error(
      'Funded upgrade refused or incomplete. Inspect its private proof and the server journal; never retry blindly.',
    );
    process.exitCode = 1;
  });
