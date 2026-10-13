import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, lstatSync, existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export function operatorChildEnvironment(environment) {
  const allowed = new Set([
    'PATH',
    'PATHEXT',
    'SYSTEMROOT',
    'WINDIR',
    'COMSPEC',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'ALTERWARD_SSH_SECRETS_DIR',
    'PROGRAMDATA',
    'ALLUSERSPROFILE',
    'TEMP',
    'TMP',
    'HOME',
    'HOMEDRIVE',
    'HOMEPATH',
    'SYSTEMDRIVE',
    'PROGRAMFILES',
    'PROGRAMFILES(X86)',
    'PROGRAMW6432',
    'USERNAME',
    'USERDOMAIN',
  ]);
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) =>
      allowed.has(name.toUpperCase()),
    ),
  );
}

export function personalRuntimeManifest(
  stage,
  build,
  registry,
  inactive,
  reviewed,
) {
  if (stage?.configurationMode !== 'personal-beta')
    return inactive(stage, build, registry);
  reviewed(stage, registry);
  const keys = [
    'commit',
    'imageId',
    'ownerEnvironmentSha256',
    'effectiveComposeSha256',
    'sourceComposeSha256',
    'databaseCaSha256',
    'accessConfigurationSha256',
  ].sort();
  if (
    stage.commit !== build?.commit ||
    stage.imageId !== build?.imageId ||
    stage.upgraded !== true ||
    stage.imageOnly !== false ||
    stage.configurationOnly !== true ||
    stage.runningServices !== 3 ||
    stage.budgetWindowConfigured !== true ||
    stage.betaWindowActive !== false ||
    stage.paidAiCalls !== 0 ||
    !Number.isSafeInteger(stage.selectedReaders) ||
    stage.selectedReaders < 1 ||
    stage.selectedReaders > 10 ||
    !Number.isSafeInteger(stage.accessEmailCount) ||
    stage.accessEmailCount < stage.selectedReaders ||
    stage.accessEmailCount > stage.selectedReaders + 1 ||
    [stage.startsAt, stage.endsAt].some(
      (x) =>
        typeof x !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(x) ||
        !Number.isFinite(Date.parse(x)),
    ) ||
    Date.parse(stage.endsAt) - Date.parse(stage.startsAt) !== 30 * 86400000 ||
    [stage.projectUsd, stage.userUsd].some(
      (x) =>
        typeof x !== 'string' ||
        !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(x),
    ) ||
    !(
      Number(stage.projectUsd) > 0 &&
      Number(stage.projectUsd) <= 2 &&
      Number(stage.userUsd) > 0 &&
      Number(stage.userUsd) <= 0.5 &&
      Number(stage.userUsd) <= Number(stage.projectUsd)
    ) ||
    keys
      .filter((k) => !['commit', 'imageId'].includes(k))
      .some(
        (k) => typeof stage[k] !== 'string' || !/^[a-f0-9]{64}$/.test(stage[k]),
      )
  )
    throw Error('Exact active personal runtime receipt required');
  return createHash('sha256')
    .update(
      JSON.stringify(Object.fromEntries(keys.map((k) => [k, stage[k]]))) + '\n',
    )
    .digest('hex');
}

// Existing operator identity only. Funding is explicit, audited and single-window.
async function main() {
  const mode = process.argv[2]?.replace(/^--/, '');
  // Capture only the one explicitly required input, then scrub this operator
  // process before git, SSH or private-report's OS helpers can spawn.
  const providerInput =
    mode === 'prepare-personal' ? process.env.OPENAI_API_KEY : undefined;
  const childEnvironment = operatorChildEnvironment(process.env);
  for (const name of Object.keys(process.env))
    if (!(name in childEnvironment)) delete process.env[name];
  if (
    !['win32', 'linux'].includes(process.platform) ||
    ![
      'inspect',
      'fixture',
      'prepare-personal',
      'apply-personal',
      'disable',
    ].includes(mode) ||
    process.argv.length !== (mode === 'prepare-personal' ? 4 : 3)
  )
    throw Error('Explicit personal beta operator mode required');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const source = (path) => execFileSync('git', ['show', `${commit}:${path}`]);
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const platformPath = 'scripts/lib/operator-platform.mjs';
  const platformInfo = lstatSync(platformPath);
  if (
    !platformInfo.isFile() ||
    platformInfo.isSymbolicLink() ||
    platformInfo.nlink !== 1 ||
    digest(readFileSync(platformPath)) !== digest(source(platformPath))
  )
    throw Error('Exact committed operator platform helper required');
  // Validate bytes BEFORE importing code, especially before funded secrets
  // can be observed by an untrusted helper module.
  const {
    operatorSecretsDirectory,
    assertOperatorLocalInput,
    assertLinuxPrivatePath,
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
  if (
    digest(regular(fileURLToPath(import.meta.url))) !==
      digest(source('scripts/contabo-personal-beta.mjs')) ||
    (mode !== 'disable' &&
      (execFileSync('git', ['branch', '--show-current'], {
        encoding: 'utf8',
      }).trim() !== 'main' ||
        execFileSync('git', ['status', '--porcelain'], {
          encoding: 'utf8',
        }).trim()))
  )
    throw Error('Exact committed main operator required');
  for (const path of [
    'scripts/contabo-fence-operator.mjs',
    'scripts/lib/private-report.ts',
    'scripts/lib/operator-platform.mjs',
    ...(mode === 'disable'
      ? []
      : ['scripts/lib/personal-beta-admission-observation.mjs']),
  ])
    if (digest(regular(path)) !== digest(source(path)))
      throw Error('Exact committed operator dependencies required');
  const {
    activeRecoveryManifest,
    reviewedRecoveryRelease,
    exactFenceCiRuns,
    assertExactFenceCiJobs,
    retainOriginalZeroReceipt,
  } = await import('./contabo-fence-operator.mjs');
  const { privateReportDirectory, privateReportFile, privateRequestFile } =
    await import('./lib/private-report.ts');
  const directory = privateReportDirectory('contabo-release');
  const report = (name) => JSON.parse(regular(join(directory, name)));
  const registry = JSON.parse(source('deploy/reviewed-recovery-images.json'));
  const operator = JSON.parse(
    regular('.local/closed-site-operator/operator-config.json'),
  );
  if (
    operator.cloudflareAccess?.allowedEmails?.length !== 1 ||
    operator.cloudflareAccess.allowedEmails[0] !== operator.operatorLoginEmail
  )
    throw Error('Original owner Access receipt required');
  const zero =
    ['inspect', 'fixture'].includes(mode) &&
    !existsSync(join(directory, 'personal-beta-readers-zero-proof.json'))
      ? {
          stage: report('owner-stage-proof.json'),
          build: report('owner-active-build-proof.json'),
        }
      : report('personal-beta-readers-zero-proof.json');
  retainOriginalZeroReceipt(zero, registry, zero);
  reviewedRecoveryRelease(zero.build, registry);
  const request = {
    mode,
    sourceCommit: commit,
    buildProof: zero.build,
    previousBuildProof: zero.build,
    previousStageProof: zero.stage,
    zeroStageProof: zero.stage,
    ownerAccess: operator.cloudflareAccess,
    // Emergency restore remains bound to the original release, even after HEAD
    // changes its overlay. This is the source validate_inputs checks remotely.
    ownerFlags: execFileSync('git', [
      'show',
      `${zero.build.commit}:deploy/closed-site-owner.flags.env`,
    ]).toString(),
  };
  if (mode !== 'disable')
    request.ownerManifestDigest = personalRuntimeManifest(
      report('owner-stage-proof.json'),
      report('owner-active-build-proof.json'),
      registry,
      activeRecoveryManifest,
      reviewedRecoveryRelease,
    );
  if (mode === 'prepare-personal' || mode === 'apply-personal') {
    const audit = report('personal-beta-audit-proof.json');
    const fixture = report('personal-beta-fixture-proof.json');
    if (
      audit.sourceCommit !== commit ||
      audit.interpretedByOperator !== true ||
      audit.critical !== 0 ||
      audit.high !== 0 ||
      audit.medium !== 0 ||
      fixture.sourceCommit !== commit ||
      fixture.actualPersonalTransitionPassed !== true ||
      fixture.paidAiCalls !== 0 ||
      fixture.existingContainersUnchanged !== true
    )
      throw Error(
        'Exact interpreted audit and actual isolated fixture required',
      );
    const token = operatorCiReadToken();
    const github = async (path) => {
      const response = await fetch(
        'https://api.github.com/repos/Muzsy/future_flow/' + path,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Alterward-reader-CI',
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
  }
  if (mode === 'prepare-personal' || mode === 'apply-personal') {
    const seed = JSON.parse(regular('.local/closed-beta-catalog/state.json'));
    const suffix = 'window:' + seed.window.startsAt + ':' + seed.window.endsAt;
    request.observationSelection = {
      seedProjectKeys: ['project:' + suffix, 'project:anthropic:' + suffix],
      seedUserKeys: Object.values(seed.topics).map(
        (topic) => 'user:' + topic.owner + ':' + suffix,
      ),
    };
  }
  if (
    mode === 'prepare-personal' ||
    mode === 'apply-personal' ||
    mode === 'fixture'
  )
    request.observationSource = source(
      'scripts/lib/personal-beta-admission-observation.mjs',
    ).toString();
  if (mode === 'prepare-personal') {
    if (process.platform === 'linux') assertLinuxPrivatePath(process.argv[3]);
    const file = privateRequestFile(
      privateReportDirectory('personal-beta-operator'),
      process.argv[3],
    );
    const terms = JSON.parse(regular(file));
    if (
      Object.keys(terms).sort().join(',') !==
      'endsAt,participants,projectUsd,startsAt,userUsd'
    )
      throw Error('Exact personal terms required');
    const { validateObservationRequest } =
      await import('./lib/personal-beta-admission-observation.mjs');
    validateObservationRequest({
      ...request.observationSelection,
      participants: terms.participants,
    });
    if (report('owner-stage-proof.json').configurationMode !== 'readers')
      throw Error('Personal beta stage required before funding');
    request.terms = terms;
    const key = providerInput;
    if (
      typeof key !== 'string' ||
      !/^[A-Za-z0-9_\-]{16,4096}$/.test(key) ||
      key === 'alterward_owner_provider_access_disabled'
    )
      throw Error('Bounded existing worker provider input required');
    request.openaiKey = key;
  }
  if (mode === 'apply-personal')
    request.preparedProof = report(
      'personal-beta-prepare-proof.json',
    ).preparedProof;
  let names = [
    ['backup', 'alterward_backup', 'contabo-backup.py'],
    ['target', 'alterward_target', 'contabo-target.py'],
    ['owner', 'alterward_owner', 'contabo-owner.py'],
    ['activation', 'alterward_activation', 'contabo-owner-activation.py'],
    ['upgrade', 'alterward_upgrade', 'contabo-owner-upgrade.py'],
    ['fence', 'alterward_fence', 'contabo-writer-fence.py'],
    ['daily', 'alterward_daily', 'contabo-daily.py'],
    ['policy', 'alterward_personal_policy', 'contabo-personal-beta-policy.py'],
    ['readers', 'alterward_readers', 'contabo-personal-beta-readers.py'],
    [
      'observation',
      'alterward_personal_observation',
      'contabo-personal-beta-observation.py',
    ],
    ['personal', 'alterward_personal_beta', 'contabo-personal-beta.py'],
    [
      'reader_fixture',
      'alterward_readers_fixture',
      'contabo-personal-beta-readers-fixture.py',
    ],
    [
      'fixture',
      'alterward_personal_fixture',
      'contabo-personal-beta-fixture.py',
    ],
  ];
  if (mode !== 'fixture')
    names = names.filter(
      ([name]) => !['reader_fixture', 'fixture'].includes(name),
    );
  if (mode === 'disable')
    names = names.filter(
      ([name]) => !['daily', 'policy', 'observation'].includes(name),
    );
  const bundle = Object.fromEntries(
    names.map(([key, , file]) => [
      key,
      source('scripts/ops/' + file).toString('base64'),
    ]),
  );
  const code = `import sys,json,types,base64,signal
p=json.load(sys.stdin)
try:
 for key,name,_ in p['names']:
  m=types.ModuleType(name);sys.modules[name]=m;exec(compile(base64.b64decode(p['bundle'][key]),'<reviewed-'+name+'>','exec'),m.__dict__)
 a=sys.modules['alterward_activation']
 for number in a.INTERRUPTION_SIGNALS:signal.signal(number,a.interrupted)
 if p['request']['mode']=='fixture':
  import fcntl
  f=sys.modules['alterward_fence'];f.original(f.DAILY/'job.lock');f.original(f.OWNER/'activation.lock')
  with (f.DAILY/'job.lock').open('rb') as job,(f.OWNER/'activation.lock').open('rb') as owner:
   fcntl.flock(job,fcntl.LOCK_EX|fcntl.LOCK_NB);fcntl.flock(owner,fcntl.LOCK_EX|fcntl.LOCK_NB)
   result=sys.modules['alterward_personal_fixture'].main(p['request'])
 else:result=sys.modules['alterward_personal_beta'].main(p['request'])
 print(json.dumps({'ok':True,'result':result}))
except BaseException:
 print(json.dumps({'ok':False,'phase':'personal-beta-operator'}));sys.exit(1)
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
      `UserKnownHostsFile="${pin.replaceAll('\\', '/')}"`,
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
      timeout: 600000,
      maxBuffer: 1024 * 1024,
      env: childEnvironment,
    },
  );
  // An early SSH refusal rejects the awaited process; do not let its closed
  // input pipe turn that safe refusal into an unhandled Node socket error.
  pending.child.stdin.on('error', () => {});
  pending.child.stdin.end(JSON.stringify({ names, bundle, request }));
  const result = JSON.parse((await pending).stdout);
  if (result.ok !== true) throw Error('Personal beta operator failed');
  const saved = {
    ...result.result,
    opsCommit: commit,
    capturedAt: new Date().toISOString(),
  };
  privateReportFile(
    directory,
    `personal-beta-${mode === 'prepare-personal' ? 'prepare' : mode === 'apply-personal' ? 'apply' : mode}-proof.json`,
    saved,
  );
  if (mode === 'apply-personal' || mode === 'disable') {
    privateReportFile(directory, 'owner-stage-proof.json', saved);
    privateReportFile(directory, 'owner-active-build-proof.json', zero.build);
  }
  console.log(
    JSON.stringify({
      mode,
      ok: true,
      resultKeys: Object.keys(result.result),
      paidAiCalls: 0,
      operationPaidAiCalls: 0,
      paidAiCallsScope: 'this-configuration-operation',
    }),
  );
}
if (
  process.argv[1] &&
  (process.platform === 'win32'
    ? realpathSync(process.argv[1]).toLowerCase() ===
      realpathSync(fileURLToPath(import.meta.url)).toLowerCase()
    : realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url)))
)
  main().catch(() => {
    console.error(
      'Personal beta operation refused or incomplete. Inspect its private proof and server journal before retrying.',
    );
    process.exitCode = 1;
  });
