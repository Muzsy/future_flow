// Explicit Linux active-funded transition. No activation, provider input, key
// rotation or implicit rollout. All helpers are verified BEFORE importing them.
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';

async function main() {
  const mode = process.argv[2]?.replace(/^--/, '');
  if (
    process.platform !== 'linux' ||
    !['inspect', 'prepare', 'apply', 'recover', 'archive-expired'].includes(
      mode,
    ) ||
    process.argv.length !== (mode === 'prepare' ? 4 : 3)
  )
    throw Error('Explicit Linux funded-upgrade mode required');
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
    'scripts/contabo-funded-upgrade.mjs',
    'scripts/lib/funded-upgrade.mjs',
    'scripts/lib/funded-access.mjs',
    'scripts/lib/operator-platform.mjs',
    'scripts/lib/private-report.ts',
    'scripts/contabo-personal-beta.mjs',
    'scripts/contabo-fence-operator.mjs',
  ])
    verify(p);
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
  const {
    fundedUpgradeModules,
    releaseEvidence,
    exactObject,
    fundedSourceBundle,
  } = await import('./lib/funded-upgrade.mjs');
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
  for (const [, file] of fundedUpgradeModules)
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
    const token = operatorCiReadToken();
    const get = async (path) => {
      const response = await fetch(
        'https://api.github.com/repos/Muzsy/future_flow/' + path,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Alterward-funded-upgrade',
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
    const selection =
      mode === 'prepare'
        ? read(process.argv[3])
        : report('funded-upgrade-release.json');
    const release = releaseEvidence({
      commit,
      bundleSha256,
      selection,
      audit: report('funded-upgrade-audit-proof.json'),
      fixture: report('funded-upgrade-fixture-proof.json'),
      ci: runs,
    });
    request.release = release;
    const { readFundedAccess } = await import('./lib/funded-access.mjs');
    request.accessSnapshot = await readFundedAccess(
      read(join(operatorSecretsDirectory(), 'cloudflare-access-read.json')),
    );
    if (mode !== 'prepare') {
      request.preparedSha256 = report(
        'funded-upgrade-prepare-proof.json',
      ).preparedSha256;
      request.restoreProof = report('funded-upgrade-restore-proof.json');
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
      privateReportFile(directory, 'funded-upgrade-release.json', selection);
  }
  if (mode === 'archive-expired') {
    request.preparedSha256 = report(
      'funded-upgrade-prepare-proof.json',
    ).preparedSha256;
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
  const modules = fundedUpgradeModules.map(([name, file]) => ({
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
 result=sys.modules['alterward_funded_upgrade'].main(p['request'])
 print(json.dumps({'ok':True,'result':result}))
except BaseException:
 print(json.dumps({'ok':False,'phase':'funded-upgrade'}));sys.exit(1)
`;
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
  const output = JSON.parse((await pending).stdout);
  if (output.ok !== true) throw Error('Funded transition refused');
  privateReportFile(directory, `funded-upgrade-${mode}-proof.json`, {
    ...output.result,
    opsCommit: commit,
    capturedAt: new Date().toISOString(),
  });
  console.log(
    JSON.stringify({ mode, ok: true, paidAiCalls: 0, receiptSaved: true }),
  );
}
main().catch(() => {
  console.error(
    'Funded upgrade refused or incomplete. Keep serving closed and inspect the private journal before explicit recovery.',
  );
  process.exitCode = 1;
});
