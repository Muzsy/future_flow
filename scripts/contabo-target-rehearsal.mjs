import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import {
  privateReportDirectory,
  privateReportFile,
} from './lib/private-report.ts';

// Explicit pinned Windows operator command; all runtime fixtures are isolated.
const directory = privateReportDirectory('contabo-release');
const operator = JSON.parse(
  readFileSync('.local/closed-site-operator/operator-config.json', 'utf8'),
);
let phase = 'local-validation';
async function main() {
  const runtimeOnly = process.argv[2] === '--runtime-existing';
  if (process.argv.length > 3 || (process.argv[2] && !runtimeOnly))
    throw Error('Unknown rehearsal argument');
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA)
    throw Error('Pinned Windows operator context required');
  const secrets = join(process.env.LOCALAPPDATA, 'FutureFlow', 'secrets');
  const pin = join(secrets, 'contabo_known_hosts');
  const key = join(secrets, 'contabo_alterward_ed25519');
  for (const file of [pin, key]) {
    if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink())
      throw Error('SSH pin and key must be regular files');
  }
  const host = readFileSync(pin, 'utf8').trim().split(/\s+/)[0];
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))
    throw Error('Unexpected host pin');
  const sshOptions = [
    '-i',
    key,
    '-o',
    `UserKnownHostsFile="${pin.replaceAll('\\', '/')}"`,
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=10',
    `root@${host}`,
  ];
  const script = readFileSync('scripts/ops/contabo-target.py');
  const library = readFileSync('scripts/ops/contabo-backup.py');
  const command =
    'python3 -c \'import sys,json,base64,io,types; p=json.load(sys.stdin); m=types.ModuleType("alterward_backup"); exec(compile(base64.b64decode(p["library"]),"<backup-library>","exec"),m.__dict__); sys.modules["alterward_backup"]=m; sys.stdin=io.StringIO(json.dumps(p["request"])); exec(compile(base64.b64decode(p["script"]),"<target-rehearsal>","exec"))\'';
  const remote = async (request) => {
    const promise = promisify(execFile)('ssh', [...sshOptions, command], {
      encoding: 'utf8',
      timeout: 1600000,
      maxBuffer: 2 * 1024 ** 2,
    });
    // The script and configuration use stdin; no Windows command-length limit,
    // authentication secrets in arguments, or raw remote diagnostic output.
    promise.child.stdin.end(
      JSON.stringify({
        script: script.toString('base64'),
        library: library.toString('base64'),
        request,
      }),
    );
    try {
      const { stdout } = await promise;
      const result = JSON.parse(stdout);
      if (!result.ok) throw Error('Target rehearsal failed');
      return result.result;
    } catch (error) {
      try {
        const failure = JSON.parse(error.stdout);
        if (/^[a-z-]{1,60}$/.test(failure.phase)) phase = failure.phase;
      } catch {}
      throw Error('Target rehearsal failed');
    }
  };
  let buildProof;
  if (runtimeOnly) {
    buildProof = JSON.parse(
      readFileSync(join(directory, 'target-build-proof.json'), 'utf8'),
    );
  } else {
    const dirty = execFileSync('git', ['status', '--porcelain'], {
      encoding: 'utf8',
    }).trim();
    if (dirty) throw Error('Build source must be a committed clean checkout');
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const archive = execFileSync(
      'git',
      ['archive', '--format=tar.gz', commit],
      {
        maxBuffer: 32 * 1024 ** 2,
      },
    );
    const publicBuild = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_API_URL: '/api/v1',
    };
    const publishable = publicBuild.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (
      !publishable ||
      publishable === process.env.SUPABASE_SERVICE_ROLE_KEY ||
      (!publishable.startsWith('sb_publishable_') &&
        JSON.parse(Buffer.from(publishable.split('.')[1], 'base64url')).role !==
          'anon')
    )
      throw Error('Only a public Supabase key can be used for the image');
    phase = 'limited-target-build';
    console.log(
      'Building the committed image with a dedicated 2 GiB/1 CPU builder.',
    );
    buildProof = await remote({
      action: 'build',
      commit,
      archive: archive.toString('base64'),
      archiveSha256: createHash('sha256').update(archive).digest('hex'),
      publicBuild,
    });
    privateReportFile(directory, 'target-build-proof.json', {
      ...buildProof,
      capturedAt: new Date().toISOString(),
      operatorScriptSha256: createHash('sha256')
        .update(script)
        .update(library)
        .digest('hex'),
    });
    console.log('Committed image built; dedicated builder removed.');
  }
  const tools = JSON.parse(
    readFileSync(join(directory, 'backup-tool-versions.json'), 'utf8'),
  );
  const manifest = JSON.parse(
    readFileSync(join(directory, 'backup-manifest.json'), 'utf8'),
  );
  const access = operator.cloudflareAccess;
  if (
    !access ||
    !/^[a-f0-9]{64}$/.test(access.audience) ||
    access.allowedEmails.length !== 1 ||
    access.allowedEmails[0] !== operator.operatorLoginEmail
  )
    throw Error('Saved owner-only Access configuration required');
  phase = 'isolated-target-runtime';
  console.log(
    'Starting isolated web/API/worker, temporary PostgreSQL and private HTTPS.',
  );
  // Bind the actual bytes transmitted, even if a local file changes while waiting.
  const lifeRecoveryChecker = readFileSync(
    'scripts/ops/life-recovery-runtime.mjs',
  );
  const upgradeBytes = Object.fromEntries(
    [
      ['owner', 'contabo-owner.py'],
      ['activation', 'contabo-owner-activation.py'],
      ['upgrade', 'contabo-owner-upgrade.py'],
      ['fixture', 'contabo-owner-upgrade-fixture.py'],
    ].map(([name, file]) => [name, readFileSync(join('scripts/ops', file))]),
  );
  const proof = await remote({
    action: 'rehearse',
    buildProof,
    postgresImage: tools.postgresImage,
    proxyImage: manifest.proxyImage,
    access,
    proxyCandidate: readFileSync('deploy/Caddyfile.contabo.example', 'utf8'),
    checker: readFileSync('scripts/ops/contabo-target-check.mjs', 'utf8'),
    lifeRecoveryChecker: lifeRecoveryChecker.toString('utf8'),
    upgradeSources: Object.fromEntries(
      Object.entries(upgradeBytes).map(([name, bytes]) => [
        name,
        bytes.toString('base64'),
      ]),
    ),
    upgradePreviousBuildProof: JSON.parse(
      readFileSync(
        join(directory, 'owner-upgrade-rehearsal-baseline.json'),
        'utf8',
      ),
    ),
  });
  privateReportFile(directory, 'target-runtime-proof.json', {
    ...proof,
    capturedAt: new Date().toISOString(),
    lifeRecoveryCheckerSha256: createHash('sha256')
      .update(lifeRecoveryChecker)
      .digest('hex'),
    operatorScriptSha256: createHash('sha256')
      .update(script)
      .update(library)
      .update(upgradeBytes.upgrade)
      .update(upgradeBytes.fixture)
      .digest('hex'),
    ownerUpgradeScriptsSha256: createHash('sha256')
      .update(script)
      .update(library)
      .update(upgradeBytes.owner)
      .update(upgradeBytes.activation)
      .update(upgradeBytes.upgrade)
      .update(upgradeBytes.fixture)
      .digest('hex'),
  });
  console.log(JSON.stringify(proof));
}
main().catch(() => {
  console.error(
    `Target rehearsal stopped safely (${phase}); no live deployment or AI activation.`,
  );
  process.exitCode = 1;
});
