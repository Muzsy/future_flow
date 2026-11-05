// Explicit successor-generation transition: owner-e2e (first), then reader
// admission and the tester window, each chained to the previous exposed one, and
// the one-time schema-039 upgrade (database 038 to 039 and the reviewed image) and the
// ordered billing-config stages (Stripe test, live, enforcement; api and worker only).
// No provider call or implicit rollout; only schema-039 migrates, only once. Verify the committed helpers
// before importing any of them.
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Localisation of a refusal (see scripts/lib/successor-failure.mjs): a fixed phase label, error type
// and source locations only. The helper is imported after its committed bytes are verified.
const failure = { mode: undefined, phase: 'start', server: null };

async function main() {
  const mode = process.argv[2]?.replace(/^--/, '');
  failure.mode = mode;
  if (
    process.platform !== 'linux' ||
    ![
      'inspect',
      'prepare',
      'apply',
      'recover',
      'archive-expired',
      'cleanup-probe',
    ].includes(mode) ||
    process.argv.length < (mode === 'prepare' ? 4 : 3) ||
    process.argv.length >
      (mode === 'prepare'
        ? 4
        : ['apply', 'recover', 'archive-expired'].includes(mode)
          ? 4
          : 3)
  )
    throw Error('Explicit Linux beta-successor mode required');
  // Every generation keeps its own receipts; a later one never overwrites an
  // earlier proof. The first (owner) generation keeps its original names.
  // Billing stages keep one receipt set each (sandbox, live, enforce), so no stage ever
  // overwrites another's proof.
  const slots = {
    owner: ['owner-e2e', ''],
    reader: ['reader-admission', 'reader-'],
    tester: ['tester-beta', 'tester-'],
    schema: ['schema-039', 'schema-'],
    'schema-040': ['schema-040', 'registry-schema-'],
    'billing-registry-sandbox': [
      'billing-config-040',
      'billing-registry-sandbox-',
    ],
    'billing-registry-live': ['billing-config-040', 'billing-registry-live-'],
    'billing-registry-enforce': [
      'billing-config-040',
      'billing-registry-enforce-',
    ],
    'billing-sandbox': ['billing-config', 'billing-sandbox-'],
    'billing-live': ['billing-config', 'billing-live-'],
    'billing-enforce': ['billing-config', 'billing-enforce-'],
  };
  const prefixes = {
    'owner-e2e': '',
    'reader-admission': 'reader-',
    'tester-beta': 'tester-',
    'schema-039': 'schema-',
    'schema-040': 'registry-schema-',
  };
  let purpose = 'owner-e2e';
  let prefix = '';
  if (mode !== 'prepare' && process.argv[3] !== undefined) {
    if (!Object.hasOwn(slots, process.argv[3]))
      throw Error('Explicit successor generation required');
    [purpose, prefix] = slots[process.argv[3]];
  }
  const receipt = (kind) => `beta-successor-${prefix}${kind}.json`;
  failure.phase = 'git-bundle';
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const source = (p) =>
    execFileSync('git', ['show', `${commit}:${p}`], {
      maxBuffer: 8 * 1024 * 1024,
    });
  const verify = (p) => {
    const info = lstatSync(p);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.nlink !== 1 ||
      realpathSync(p) !== resolve(p) ||
      !readFileSync(p).equals(source(p))
    )
      throw Error('Exact committed helper required');
  };
  for (const p of [
    'scripts/contabo-beta-successor.mjs',
    'scripts/lib/beta-successor-release.mjs',
    'scripts/lib/personal-beta-admission-observation.mjs',
    'scripts/lib/funded-upgrade.mjs',
    'scripts/lib/successor-failure.mjs',
    'scripts/lib/funded-access.mjs',
    'scripts/lib/operator-platform.mjs',
    'scripts/lib/private-report.ts',
    'scripts/contabo-personal-beta.mjs',
    'scripts/contabo-fence-operator.mjs',
  ])
    verify(p);
  {
    const { successorFailureReport, serverFailure } =
      await import('./lib/successor-failure.mjs');
    failure.report = successorFailureReport;
    failure.parse = serverFailure;
  }
  const { operatorChildEnvironment } =
    await import('./contabo-personal-beta.mjs');
  const childEnv = operatorChildEnvironment(process.env);
  for (const key of Object.keys(process.env))
    if (!(key in childEnv)) delete process.env[key];
  const {
    assertLinuxPrivatePath,
    operatorSecretsDirectory,
    operatorCiReadToken,
  } = await import('./lib/operator-platform.mjs');
  const { privateReportDirectory, privateReportFile } =
    await import('./lib/private-report.ts');
  failure.write = (report) =>
    privateReportFile(
      privateReportDirectory('contabo-release'),
      'beta-successor-last-failure.json',
      report,
    );
  const { exactObject, fundedSourceBundle } =
    await import('./lib/funded-upgrade.mjs');
  const { successorModules, successorReleaseEvidence } =
    await import('./lib/beta-successor-release.mjs');
  const { exactFenceCiRuns, assertExactFenceCiJobs } =
    await import('./contabo-fence-operator.mjs');
  if (
    execFileSync('git', ['branch', '--show-current'], {
      encoding: 'utf8',
    }).trim() !== 'main' ||
    execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
  )
    throw Error('Clean exact main required');
  assertLinuxPrivatePath(process.cwd(), true);
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', commit], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  const { sourceHashes, bundleSha256 } = fundedSourceBundle(paths, (p) => {
    verify(p);
    return source(p);
  });
  for (const [, file] of successorModules)
    if (!('scripts/ops/' + file in sourceHashes))
      throw Error('Incomplete privileged bundle');
  const request = { mode, sourceCommit: commit, bundleSha256, sourceHashes };
  const directory = privateReportDirectory('contabo-release');
  const read = (p) => {
    assertLinuxPrivatePath(p);
    if (lstatSync(p).size > 2 * 1024 * 1024)
      throw Error('Bounded private proof required');
    return JSON.parse(readFileSync(p, 'utf8'));
  };
  const report = (name) => read(join(directory, name));
  if (mode === 'prepare' || mode === 'apply' || mode === 'recover') {
    failure.phase = 'ci-readback';
    const token = operatorCiReadToken();
    const get = async (path) => {
      const response = await fetch(
        'https://api.github.com/repos/Muzsy/future_flow/' + path,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Alterward-beta-successor',
          },
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) throw Error('Exact CI readback unavailable');
      return response.json();
    };
    const runs = exactFenceCiRuns(
      await get(`actions/runs?head_sha=${commit}&per_page=100`),
      commit,
    );
    for (const run of runs)
      assertExactFenceCiJobs(
        await get(`actions/runs/${run.id}/jobs?per_page=100`),
        commit,
      );
    failure.phase = 'receipts';
    const packet =
      mode === 'prepare' ? read(process.argv[3]) : report(receipt('release'));
    exactObject(packet, ['selection', 'release']);
    if (mode === 'prepare') {
      purpose = packet.selection?.purpose;
      if (['billing-config', 'billing-config-040'].includes(purpose)) {
        // The stage is validated below (successorReleaseEvidence) before the receipt is written.
        const stage = packet.selection?.billing?.stage;
        if (!['sandbox', 'live', 'enforce'].includes(stage))
          throw Error('Approved billing stage required');
        prefix = `${purpose === 'billing-config-040' ? 'billing-registry' : 'billing'}-${stage}-`;
      } else {
        if (!Object.hasOwn(prefixes, purpose))
          throw Error('Approved successor purpose required');
        prefix = prefixes[purpose];
      }
    } else if (
      packet.selection?.purpose !== purpose ||
      (['billing-config', 'billing-config-040'].includes(purpose) &&
        `${purpose === 'billing-config-040' ? 'billing-registry' : 'billing'}-${packet.selection.billing?.stage}-` !==
          prefix)
    )
      throw Error('Receipt belongs to another successor generation');
    failure.phase = 'release-evidence';
    const release = successorReleaseEvidence({
      commit,
      bundleSha256,
      selection: packet.selection,
      release: packet.release,
      successorFixture: report(
        ['schema-040', 'billing-config-040'].includes(purpose)
          ? 'registry-successor-fixture-proof.json'
          : 'beta-successor-fixture-proof.json',
      ),
      audit: report('beta-successor-audit-proof.json'),
      fixture: report('funded-upgrade-fixture-proof.json'),
      ci: runs,
    });
    request.release = release;
    request.selection = packet.selection;
    if (
      mode === 'prepare' &&
      ['billing-config', 'billing-config-040'].includes(purpose) &&
      packet.selection.billing.stage !== 'enforce'
    ) {
      // The two Stripe secrets never enter a packet, receipt or report: they come from their own
      // private operator file, are checked against the selection's digests here and again on the
      // server, and reach only the candidate environment through the SSH stdin.
      const secrets = read(
        join(operatorSecretsDirectory(), 'stripe-billing-secrets.json'),
      );
      exactObject(secrets, ['secretKey', 'webhookSecret']);
      const digest = (value) =>
        createHash('sha256')
          .update(String(value ?? ''))
          .digest('hex');
      if (
        digest(secrets.secretKey) !==
          packet.selection.billing.secretKeySha256 ||
        digest(secrets.webhookSecret) !==
          packet.selection.billing.webhookSecretSha256
      )
        throw Error('Exact approved Stripe secrets required');
      request.billingSecrets = {
        secretKey: secrets.secretKey,
        webhookSecret: secrets.webhookSecret,
      };
    }
    failure.phase = 'access-readback';
    const { readFundedAccess } = await import('./lib/funded-access.mjs');
    request.accessSnapshot = await readFundedAccess(
      read(join(operatorSecretsDirectory(), 'cloudflare-access-read.json')),
    );
    failure.phase = 'receipts';
    if (mode !== 'prepare') {
      request.preparedSha256 = report(receipt('prepare-proof')).preparedSha256;
      request.restoreProof = report(receipt('restore-proof'));
      exactObject(request.restoreProof, [
        'sourceCommit',
        'preparedSha256',
        'runId',
        'targetImage',
        'recoveryImage',
        'privacyFixtureSha256',
      ]);
    }
    // The selected images are retained as a NEW receipt. Historical activation
    // and owner-zero receipts are never hand-edited or substituted.
    if (mode === 'prepare')
      privateReportFile(directory, receipt('release'), packet);
  }
  if (mode === 'archive-expired') {
    failure.phase = 'receipts';
    request.preparedSha256 = report(receipt('prepare-proof')).preparedSha256;
    failure.phase = 'access-readback';
    const { readFundedAccess } = await import('./lib/funded-access.mjs');
    request.accessSnapshot = await readFundedAccess(
      read(join(operatorSecretsDirectory(), 'cloudflare-access-read.json')),
    );
  }
  const secrets = operatorSecretsDirectory();
  const key = join(secrets, 'contabo_alterward_ed25519'),
    pin = join(secrets, 'contabo_known_hosts');
  assertLinuxPrivatePath(key);
  assertLinuxPrivatePath(pin);
  const host = readFileSync(pin, 'utf8').trim().split(/\s+/)[0];
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))
    throw Error('Original pinned host required');
  const modules = successorModules.map(([name, file]) => ({
    name,
    source: source('scripts/ops/' + file).toString('base64'),
  }));
  const code = `import sys,json,types,base64,signal
p=json.load(sys.stdin)
try:
 for item in p['modules']:
  m=types.ModuleType(item['name']);sys.modules[item['name']]=m;exec(compile(base64.b64decode(item['source']),'<reviewed-'+item['name']+'>','exec'),m.__dict__)
 a=sys.modules['alterward_activation']
 for n in a.INTERRUPTION_SIGNALS:signal.signal(n,a.interrupted)
 result=sys.modules['alterward_beta_successor'].main(p['request'])
 print(json.dumps({'ok':True,'result':result}))
except BaseException as e:
 d=None
 try: d=sys.modules['alterward_beta_successor'].failure_diagnostic(e)
 except BaseException: pass
 print(json.dumps({'ok':False,'phase':'beta-successor','failure':d}));sys.exit(1)
`;
  failure.phase = 'ssh';
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
      '-o',
      'ConnectTimeout=10',
      '-T',
      `root@${host}`,
      "python3 -c '" + code.replaceAll("'", "'\\''") + "'",
    ],
    {
      encoding: 'utf8',
      timeout: 720000,
      maxBuffer: 1024 * 1024,
      env: childEnv,
    },
  );
  pending.child.stdin.on('error', () => {});
  pending.child.stdin.end(JSON.stringify({ modules, request }));
  let finished;
  try {
    finished = await pending;
  } catch (error) {
    // A refusal on the host exits non-zero with its allowlisted localisation on stdout.
    failure.server = failure.parse(error?.stdout, successorModules);
    throw error;
  }
  failure.phase = 'report';
  const output = JSON.parse(finished.stdout);
  if (output.ok !== true) throw Error('Successor transition refused');
  privateReportFile(directory, receipt(`${mode}-proof`), {
    ...output.result,
    opsCommit: commit,
    capturedAt: new Date().toISOString(),
  });
  console.log(
    JSON.stringify({ mode, ok: true, paidAiCalls: 0, receiptSaved: true }),
  );
}
main().catch((error) => {
  console.error(
    'Successor refused or incomplete. Keep serving closed and inspect the private journal before explicit recovery.',
  );
  try {
    if (!failure.report)
      console.error(
        'Failure localisation: ' +
          JSON.stringify({ phase: failure.phase, helperNotLoaded: true }),
      );
    else {
      const report = failure.report({
        mode: failure.mode,
        phase: failure.phase,
        error,
        server: failure.server,
      });
      console.error('Failure localisation: ' + JSON.stringify(report));
      failure.write?.(report);
    }
  } catch {
    // The localisation must never replace the actual refusal.
  }
  process.exitCode = 1;
});
