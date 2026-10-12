import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import {
  readFileSync,
  lstatSync,
  existsSync,
  openSync,
  closeSync,
  writeFileSync,
  fsyncSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Existing operator identity only. This program has no funded/UUID/provider mode.
async function main() {
  const mode = process.argv[2]?.replace(/^--/, '');
  if (
    process.platform !== 'win32' ||
    ![
      'inspect',
      'fixture',
      'prepare-readers',
      'apply-readers',
      'archive-expired-readers',
      'disable',
    ].includes(mode) ||
    // prepare takes the selection file; archive may take the exact archive id
    // that is required to retry after the local receipt was already retired.
    process.argv.length >
      (mode === 'prepare-readers' || mode === 'archive-expired-readers'
        ? 4
        : 3) ||
    process.argv.length < (mode === 'prepare-readers' ? 4 : 3)
  )
    throw Error('Explicit unpaid reader operator mode required');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const source = (path) => execFileSync('git', ['show', `${commit}:${path}`]);
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const regular = (path) => {
    const stat = lstatSync(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.size > 2 * 1024 ** 2
    )
      throw Error('Bounded private regular file required');
    return readFileSync(path);
  };
  if (
    digest(regular(fileURLToPath(import.meta.url))) !==
      digest(source('scripts/contabo-personal-beta-readers.mjs')) ||
    execFileSync('git', ['branch', '--show-current'], {
      encoding: 'utf8',
    }).trim() !== 'main' ||
    (mode !== 'disable' &&
      execFileSync('git', ['status', '--porcelain'], {
        encoding: 'utf8',
      }).trim())
  )
    throw Error('Exact committed main operator required');
  for (const path of [
    'scripts/contabo-fence-operator.mjs',
    'scripts/lib/private-report.ts',
  ])
    if (digest(regular(path)) !== digest(source(path)))
      throw Error('Exact committed operator dependencies required');
  const {
    activeRecoveryManifest,
    reviewedRecoveryRelease,
    exactFenceCiRuns,
    assertExactFenceCiJobs,
    retainOriginalZeroReceipt,
    assertNoPreviousPreparationReceipt,
    assertRestoreBindsPrepared,
    archiveLocalPreparation,
    resolveArchivePreparedProof,
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
    mode === 'apply-readers' ||
    mode === 'disable' ||
    mode === 'archive-expired-readers'
      ? report('personal-beta-readers-zero-proof.json')
      : {
          stage: report('owner-stage-proof.json'),
          build: report('owner-active-build-proof.json'),
        };
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
    request.ownerManifestDigest = activeRecoveryManifest(
      report('owner-stage-proof.json'),
      report('owner-active-build-proof.json'),
      registry,
    );
  if (
    mode === 'prepare-readers' ||
    mode === 'apply-readers' ||
    mode === 'archive-expired-readers'
  ) {
    const audit = report('personal-beta-readers-audit-proof.json');
    const fixture = report('personal-beta-readers-fixture-proof.json');
    if (
      audit.sourceCommit !== commit ||
      audit.interpretedByOperator !== true ||
      audit.critical !== 0 ||
      audit.high !== 0 ||
      audit.medium !== 0 ||
      fixture.sourceCommit !== commit ||
      fixture.actualReaderTransitionPassed !== true ||
      fixture.paidAiCalls !== 0 ||
      fixture.existingContainersUnchanged !== true ||
      (mode === 'archive-expired-readers' &&
        fixture.expiredPreparationArchivePassed !== true)
    )
      throw Error(
        'Exact interpreted audit and actual isolated fixture required',
      );
    const credential = execFileSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\npath=Muzsy/future_flow.git\n\n',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    const token = credential
      .split(/\r?\n/)
      .find((line) => line.startsWith('password='))
      ?.slice(9);
    if (!token) throw Error('Existing CI read credential required');
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
  if (mode === 'prepare-readers') {
    // A new cycle starts only after the previous receipt was archived locally.
    assertNoPreviousPreparationReceipt(directory);
    const privateDirectory = privateReportDirectory('personal-beta-operator');
    const file = privateRequestFile(privateDirectory, process.argv[3]);
    const selection = JSON.parse(regular(file));
    if (Object.keys(selection).sort().join(',') !== 'readerAccess,readers')
      throw Error(
        'Exact reader selection and reviewed Access receipt required',
      );
    request.readers = selection.readers;
    request.readerAccess = selection.readerAccess;
    // Retain the original receipt locally BEFORE a remote preparation can exist.
    const originalFile = join(
      directory,
      'personal-beta-readers-zero-proof.json',
    );
    const existing = existsSync(originalFile)
      ? JSON.parse(regular(originalFile))
      : undefined;
    if (retainOriginalZeroReceipt(zero, registry, existing)) {
      // An exclusive, durable first write; retries can only reuse equal bytes.
      const fd = openSync(originalFile, 'wx', 0o600);
      try {
        writeFileSync(fd, JSON.stringify(zero, null, 2) + '\n');
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    }
  }
  let archiveBase;
  if (mode === 'archive-expired-readers') {
    archiveBase = privateReportDirectory('reader-preparation-archive');
    request.preparedProof = resolveArchivePreparedProof({
      releaseDirectory: directory,
      archiveBase,
      archiveId: process.argv[3],
      ownerManifestDigest: request.ownerManifestDigest,
    }).preparedProof;
  }
  if (mode === 'apply-readers') {
    request.preparedProof = report(
      'personal-beta-readers-prepare-proof.json',
    ).preparedProof;
    // Only THIS preparation's candidate backup and isolated restore may unlock
    // apply, and only inside the same 15 minute bound the server enforces.
    const daily = privateReportDirectory('contabo-daily');
    const restore = JSON.parse(
      regular(join(daily, 'restore-latest-proof.json')),
    );
    if (!/^\d{8}T\d{6}Z-[a-f0-9]{8}$/.test(restore.runId ?? ''))
      throw Error('Restore proof run required');
    assertRestoreBindsPrepared({
      restore,
      manifest: JSON.parse(
        regular(join(daily, 'archives', restore.runId, 'manifest.json')),
      ),
      prepared: request.preparedProof,
      nowMs: Date.now(),
    });
  }
  const names = [
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
      'fixture',
      'alterward_readers_fixture',
      'contabo-personal-beta-readers-fixture.py',
    ],
  ];
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
   result=sys.modules['alterward_readers_fixture'].main(p['request'])
 else:result=sys.modules['alterward_readers'].main(p['request'])
 print(json.dumps({'ok':True,'result':result}))
except BaseException:
 print(json.dumps({'ok':False,'phase':'unpaid-reader-operator'}));sys.exit(1)
`;
  const secrets = join(process.env.LOCALAPPDATA, 'FutureFlow', 'secrets');
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
    { encoding: 'utf8', timeout: 600000, maxBuffer: 1024 * 1024 },
  );
  pending.child.stdin.end(JSON.stringify({ names, bundle, request }));
  const result = JSON.parse((await pending).stdout);
  if (result.ok !== true) throw Error('Unpaid reader operator failed');
  const saved = {
    ...result.result,
    opsCommit: commit,
    capturedAt: new Date().toISOString(),
  };
  let archivedTo;
  if (mode === 'archive-expired-readers') {
    // The server move is done and durable. Retire the matching local receipt;
    // the owner/zero receipts stay untouched. After an interruption the same mode
    // finishes this step: with the active receipt still present it needs no
    // argument, once it was already retired it needs the exact archive id.
    archivedTo = archiveLocalPreparation({
      releaseDirectory: directory,
      archiveBase,
      result: saved,
      nowMs: Date.now(),
    });
  } else
    privateReportFile(
      directory,
      `personal-beta-readers-${mode === 'prepare-readers' ? 'prepare' : mode === 'apply-readers' ? 'apply' : mode}-proof.json`,
      saved,
    );
  if (mode === 'apply-readers' || mode === 'disable') {
    privateReportFile(directory, 'owner-stage-proof.json', saved);
    privateReportFile(directory, 'owner-active-build-proof.json', zero.build);
  }
  console.log(
    JSON.stringify({
      mode,
      ok: true,
      resultKeys: Object.keys(result.result),
      // Scalar state only: booleans, counts and the archive id (no proof bodies).
      state: Object.fromEntries(
        Object.entries(result.result).filter(
          ([key, value]) =>
            typeof value === 'boolean' ||
            typeof value === 'number' ||
            key === 'archiveId',
        ),
      ),
      ...(archivedTo ? { localArchive: true } : {}),
      paidAiCalls: 0,
    }),
  );
}
main().catch((error) => {
  // Only the operator's own static gate reasons are printed; everything else
  // (remote output, paths, proofs) stays out of the console.
  console.error(
    error?.name === 'OperatorGateError'
      ? `Reader operation refused: ${error.message}`
      : 'Unpaid reader operation refused or incomplete. Inspect its private proof and server journal before retrying.',
  );
  process.exitCode = 1;
});
