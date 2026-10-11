import { execFile, execFileSync } from 'node:child_process';
import { promisify, isDeepStrictEqual } from 'node:util';
import { readFileSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Existing operator SSH identity only; no new credential, access or live restore.
// A drill requires exact CI, an interpreted Claude audit and an actual fresh plan.
export function reviewedRecoveryRelease(manifest, registry) {
  if (
    !registry ||
    Object.keys(registry).sort().join(',') !== 'releases,version' ||
    registry.version !== 1 ||
    !Array.isArray(registry.releases) ||
    !registry.releases.length ||
    registry.releases.length > 8 ||
    registry.releases.some(
      (item) =>
        !item ||
        Object.keys(item).sort().join(',') !== 'commit,imageId' ||
        typeof item.commit !== 'string' ||
        !/^[a-f0-9]{40}$/.test(item.commit) ||
        typeof item.imageId !== 'string' ||
        !/^sha256:[a-f0-9]{64}$/.test(item.imageId),
    ) ||
    new Set(registry.releases.map((item) => item.commit)).size !==
      registry.releases.length ||
    new Set(registry.releases.map((item) => item.imageId)).size !==
      registry.releases.length ||
    !registry.releases.some(
      (item) =>
        item.commit === manifest?.commit && item.imageId === manifest?.imageId,
    )
  )
    throw Error('Exact reviewed recovery commit/image pair required');
}
export function activeRecoveryManifest(stage, build, registry) {
  reviewedRecoveryRelease(stage, registry);
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
    !(
      (stage.imageOnly === true &&
        stage.configurationOnly !== true &&
        stage.configurationMode === undefined) ||
      (stage.imageOnly === false &&
        stage.configurationOnly === true &&
        stage.configurationMode === 'readers' &&
        Number.isSafeInteger(stage.selectedReaders) &&
        stage.selectedReaders >= 1 &&
        stage.selectedReaders <= 10 &&
        Number.isSafeInteger(stage.accessEmailCount) &&
        stage.accessEmailCount >= stage.selectedReaders &&
        stage.accessEmailCount <= stage.selectedReaders + 1)
    ) ||
    stage.runningServices !== 3 ||
    stage.paidAiCalls !== 0 ||
    stage.betaWindowActive !== false ||
    keys
      .filter((key) => !['commit', 'imageId'].includes(key))
      .some(
        (key) =>
          typeof stage[key] !== 'string' || !/^[a-f0-9]{64}$/.test(stage[key]),
      )
  )
    throw Error('Exact active owner-only release proof required');
  const manifest = Object.fromEntries(keys.map((key) => [key, stage[key]]));
  return createHash('sha256')
    .update(JSON.stringify(manifest) + '\n')
    .digest('hex');
}
export function retainOriginalZeroReceipt(zero, registry, existing) {
  activeRecoveryManifest(zero?.stage, zero?.build, registry);
  if (zero.stage.imageOnly !== true || zero.stage.configurationOnly === true)
    throw Error('Original image-only zero owner receipt required');
  if (existing !== undefined && !isDeepStrictEqual(existing, zero))
    throw Error('An existing original zero receipt cannot be replaced');
  return existing === undefined;
}
export function assertReplayInputsUnchanged(
  registry,
  sourceCommit,
  readChangedPaths,
) {
  // The clean replay image stays pinned to this immutable base. Registry
  // additions cannot silently introduce new migrations or runtime packages.
  const base = '9eb7732b69e84583cf7e63c237763b51b9bb4eab';
  reviewedRecoveryRelease(registry?.releases?.[0], registry);
  if (typeof sourceCommit !== 'string' || !/^[a-f0-9]{40}$/.test(sourceCommit))
    throw Error('Exact mounted-source commit required');
  for (const commit of new Set([
    sourceCommit,
    ...registry.releases.map((release) => release.commit),
  ])) {
    const changed = readChangedPaths(base, commit, [
      'database',
      'packages',
      'Dockerfile',
      '.dockerignore',
      '.nvmrc',
      'package.json',
      'apps/api/package.json',
      'apps/web/package.json',
      'apps/worker/package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'tsconfig.base.json',
      'tsconfig.scripts.json',
    ]);
    if (typeof changed !== 'string' || changed.trim())
      throw Error(
        'Reviewed capture/replay schema and dependencies must remain identical',
      );
  }
}
export function exactFenceCiRuns(listing, sourceCommit) {
  const runs = listing.workflow_runs.filter(
    (run) => run.path === '.github/workflows/ci.yml',
  );
  if (
    !runs.length ||
    listing.total_count > 100 ||
    runs.some(
      (run) =>
        run.head_sha !== sourceCommit ||
        run.status !== 'completed' ||
        run.conclusion !== 'success' ||
        !Number.isSafeInteger(run.id),
    )
  )
    throw Error('Every exact main verification run must succeed');
  return runs;
}
export function assertExactFenceCiJobs(detail, sourceCommit) {
  if (
    detail.total_count !== 2 ||
    detail.jobs.length !== 2 ||
    detail.jobs.some(
      (job) =>
        !['verify', 'container'].includes(job.name) ||
        job.head_sha !== sourceCommit ||
        job.status !== 'completed' ||
        job.conclusion !== 'success',
    ) ||
    new Set(detail.jobs.map((job) => job.name)).size !== 2
  )
    throw Error('Exact verify and container jobs required');
}
async function main() {
  const mode = process.argv[2]?.replace(/^--/, '');
  if (
    process.platform !== 'win32' ||
    !['plan', 'drill', 'rehearsal'].includes(mode) ||
    process.argv.length !== 3
  )
    throw Error(
      'Explicit Windows operator --plan, reviewed --drill or --rehearsal required',
    );
  const sha = (data) => createHash('sha256').update(data).digest('hex');
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (
    execFileSync('git', ['branch', '--show-current'], {
      encoding: 'utf8',
    }).trim() !== 'main'
  )
    throw Error('Reviewed main checkout required');
  const source = (name) =>
    execFileSync('git', ['show', `${sourceCommit}:${name}`]);
  const clientName = 'scripts/contabo-fence-operator.mjs';
  const clientBytes = source(clientName);
  if (sha(readFileSync(fileURLToPath(import.meta.url))) !== sha(clientBytes))
    throw Error('Executing operator must match committed source');
  const helperName = 'scripts/lib/private-report.ts';
  const helperPath = fileURLToPath(
    new URL('./lib/private-report.ts', import.meta.url),
  );
  const helperInfo = lstatSync(helperPath);
  if (
    !helperInfo.isFile() ||
    helperInfo.isSymbolicLink() ||
    helperInfo.nlink !== 1 ||
    sha(readFileSync(helperPath)) !== sha(source(helperName)) ||
    execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
  )
    throw Error('Exact committed helper and clean checkout required');
  // Check its bytes before importing executable report/path confinement code.
  const { privateReportDirectory, privateReportFile, privateRequestFile } =
    await import('./lib/private-report.ts');
  const dir = privateReportDirectory('contabo-release');
  function report(name) {
    const path = privateRequestFile(dir, join(dir, name));
    if (lstatSync(path).size > 2 * 1024 ** 2)
      throw Error('Bounded original report required');
    return JSON.parse(readFileSync(path, 'utf8'));
  }
  const registryName = 'deploy/reviewed-recovery-images.json';
  const registry = JSON.parse(source(registryName));
  // Preparing another image must not make the still-running release's plan
  // impossible. Derive its canonical manifest only from the active receipts;
  // the root executor independently compares it to the real protected bytes.
  const ownerManifestDigest = activeRecoveryManifest(
    report('owner-stage-proof.json'),
    report('owner-active-build-proof.json'),
    registry,
  );
  assertReplayInputsUnchanged(registry, sourceCommit, (base, commit, paths) =>
    execFileSync('git', ['diff', '--name-only', base, commit, '--', ...paths], {
      encoding: 'utf8',
    }),
  );
  if (mode === 'drill' || mode === 'rehearsal') {
    const audit = report('fence-transport-audit-proof.json'),
      plan = report('fence-transport-plan-proof.json');
    const age = Date.now() - Date.parse(plan.capturedAt);
    if (
      audit.sourceCommit !== sourceCommit ||
      audit.operatorApprovedDrill !== true ||
      (mode === 'rehearsal' && audit.operatorApprovedRehearsal !== true) ||
      plan.sourceCommit !== sourceCommit ||
      plan.ownerManifestDigest !== ownerManifestDigest ||
      !/^[a-f0-9]{24}$/.test(plan.planNonce) ||
      plan.mode !== 'plan' ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > 30 * 60 * 1000 ||
      plan.servicesStopped !== 0 ||
      plan.pendingJobs !== 0 ||
      plan.liveLeases !== 0 ||
      plan.foreignActiveSessions !== 0 ||
      plan.databaseTlsVerified !== true ||
      plan.discardedAuthorityAndEncryptionPreflightPassed !== true ||
      plan.temporaryContainersAndPlaintextRemoved !== true
    )
      throw Error(
        'Exact successful CI, interpreted audit and fresh successful plan required',
      );
    // Verify GitHub's actual workflow and both required jobs, not a local boolean
    // or an arbitrary successful run for this SHA. Reuse only the existing git
    // credential in memory; it is never passed to SSH or written in a report.
    let rawCredential;
    try {
      rawCredential = execFileSync('git', ['credential', 'fill'], {
        input:
          'protocol=https\nhost=github.com\npath=Muzsy/future_flow.git\n\n',
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 15000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
    } catch {
      throw Error('Existing read-only CI credential unavailable');
    }
    const credential = rawCredential
      .split(/\r?\n/)
      .find((line) => line.startsWith('password='))
      ?.slice(9);
    if (!credential) throw Error('Existing read-only CI credential required');
    async function github(path) {
      const response = await fetch(
        'https://api.github.com/repos/Muzsy/future_flow/' + path,
        {
          headers: {
            Authorization: 'Bearer ' + credential,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Alterward-fence-ci-check',
          },
          signal: AbortSignal.timeout(15000),
          redirect: 'error',
        },
      );
      if (!response.ok) throw Error('Exact CI metadata unavailable');
      return response.json();
    }
    const listing = await github(
      'actions/runs?head_sha=' + sourceCommit + '&per_page=100',
    );
    const runs = exactFenceCiRuns(listing, sourceCommit);
    const jobs = [];
    for (const run of runs) {
      const detail = await github(
        'actions/runs/' + run.id + '/jobs?per_page=100',
      );
      assertExactFenceCiJobs(detail, sourceCommit);
      jobs.push({
        runId: run.id,
        jobs: detail.jobs.map((job) => ({
          name: job.name,
          conclusion: job.conclusion,
        })),
      });
    }
    privateReportFile(dir, 'fence-ci-proof.json', {
      sourceCommit,
      jobs,
      checkedAt: new Date().toISOString(),
    });
  }
  const files = {};
  const names = [
    registryName,
    clientName,
    'scripts/ops/contabo-fence-drill.py',
    'scripts/ops/contabo-writer-fence.py',
    'scripts/capture-privacy-authority.ts',
    'scripts/lib/privacy-fence-envelope.ts',
    'scripts/lib/verified-privacy-authority.ts',
    'scripts/lib/privacy-restore.ts',
    'scripts/lib/privacy-recovery-schema.ts',
    'scripts/lib/privacy-security-catalog.ts',
    'scripts/lib/privacy-recovery-coverage.ts',
    'scripts/lib/recovery-auth-inventory.ts',
    'scripts/lib/privacy-restore-verifier.ts',
    'scripts/lib/quarantined-replay.ts',
    'scripts/lib/migrations.ts',
    'scripts/replay-fenced-backup.ts',
    'scripts/ops/contabo-quarantine-rehearsal.py',
  ];
  for (const name of names) {
    const data = source(name);
    files[name] = { data: data.toString('base64'), sha256: sha(data) };
  }
  const secrets = join(process.env.LOCALAPPDATA, 'FutureFlow', 'secrets');
  const key = join(secrets, 'contabo_alterward_ed25519'),
    pin = join(secrets, 'contabo_known_hosts');
  for (const path of [key, pin]) {
    const value = lstatSync(path);
    if (!value.isFile() || value.isSymbolicLink() || value.nlink !== 1)
      throw Error('Original regular protected SSH input required');
  }
  const host = readFileSync(pin, 'utf8').trim().split(/\s+/)[0];
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))
    throw Error('Original pinned host required');
  const payload = {
    request: { mode, sourceCommit, ownerManifestDigest, files },
    script: files['scripts/ops/contabo-fence-drill.py'].data,
    clientSha256: sha(clientBytes),
  };
  if (mode === 'rehearsal') {
    const identityPath = privateRequestFile(
      secrets,
      join(secrets, 'alterward_backup_identity.txt'),
    );
    if (lstatSync(identityPath).size > 4096)
      throw Error('Bounded original recovery identity required');
    // Same original key and destination as earlier authorized backup drills.
    // SSH stdin only: no command argument, request file or report receives it.
    payload.request.recoveryIdentity = readFileSync(identityPath, 'utf8');
  }
  // This fixed loader authenticates the exact bytes executed. The root executor
  // checks both transport and this client's digests against the source bundle.
  const loader =
    'python3 -c \'import sys,json,base64,io,hashlib; p=json.load(sys.stdin); data=base64.b64decode(p["script"],validate=True); sys.stdin=io.StringIO(json.dumps(p["request"])); exec(compile(data,"<reviewed-fence-transport>","exec"),{"__name__":"__main__","__operator_source_sha256__":hashlib.sha256(data).hexdigest(),"__operator_client_sha256__":p["clientSha256"]})\'';
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
      'ConnectTimeout=10',
      '-o',
      'IdentitiesOnly=yes',
      '-o',
      'ClearAllForwardings=yes',
      '-T',
      `root@${host}`,
      loader,
    ],
    {
      encoding: 'utf8',
      timeout: mode === 'rehearsal' ? 1200000 : 900000,
      maxBuffer: 2 * 1024 ** 2,
    },
  );
  pending.child.stdin.end(JSON.stringify(payload));
  try {
    const { stdout } = await pending;
    const output = JSON.parse(stdout);
    if (output.ok !== true) throw Error('Root preflight refused');
    if (
      output.result.sourceCommit !== sourceCommit ||
      output.result.mode !== mode ||
      output.result.serviceActivationAllowed !== false
    )
      throw Error('Root result binding differs');
    privateReportFile(dir, `fence-transport-${mode}-proof.json`, {
      ...output.result,
      capturedAt: new Date().toISOString(),
    });
    console.log(
      JSON.stringify({
        ok: true,
        mode,
        sourceCommit,
        resultKeys: Object.keys(output.result),
      }),
    );
  } catch (error) {
    let phase = 'transport';
    try {
      const value = JSON.parse(error.stdout ?? '');
      if (value.ok === false && /^[a-z-]{2,50}$/.test(value.phase))
        phase = value.phase;
    } catch {}
    privateReportFile(dir, `fence-transport-${mode}-failure.json`, {
      sourceCommit,
      mode,
      phase,
      capturedAt: new Date().toISOString(),
    });
    console.error(
      mode === 'plan'
        ? `Read-only plan refused in ${phase}; no service stop was requested. Inspect the original state before retrying.`
        : `Scoped fence operation stopped in ${phase}; the owner may be stopped. Inspect the original owner state before retrying.`,
    );
    process.exitCode = 1;
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    // A failed credential/process can carry private stdout/stderr properties.
    // Never print an unclassified exception from a precondition.
    console.error(
      'Fence operator precondition refused; no root operation started.',
    );
    process.exitCode = 1;
  });
}
