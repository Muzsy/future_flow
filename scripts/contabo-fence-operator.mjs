import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  privateReportDirectory,
  privateReportFile,
  privateRequestFile,
} from './lib/private-report.ts';

// Existing operator SSH identity only; no new credential, access or live restore.
// A drill requires exact CI, an interpreted Claude audit and an actual fresh plan.
const mode = process.argv[2]?.replace(/^--/, '');
if (
  process.platform !== 'win32' ||
  !['plan', 'drill'].includes(mode) ||
  process.argv.length !== 3
)
  throw Error('Explicit Windows operator --plan or reviewed --drill required');
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
const dir = privateReportDirectory('contabo-release');
function report(name) {
  const path = privateRequestFile(dir, join(dir, name));
  if (lstatSync(path).size > 2 * 1024 ** 2)
    throw Error('Bounded original report required');
  return JSON.parse(readFileSync(path, 'utf8'));
}
const prepared = report('owner-prepare-upgrade-proof.json'),
  applied = report('owner-apply-upgrade-proof.json');
const ownerKeys = [
  'commit',
  'imageId',
  'ownerEnvironmentSha256',
  'effectiveComposeSha256',
  'sourceComposeSha256',
  'databaseCaSha256',
  'accessConfigurationSha256',
];
if (
  ownerKeys.some((key) => prepared[key] !== applied[key]) ||
  applied.commit !== '9eb7732b69e84583cf7e63c237763b51b9bb4eab' ||
  applied.imageId !==
    'sha256:da00119b4257a0def0fde3bc9fe80fe09697f554fea8286f6bba600be621a4f3'
)
  throw Error('Original reviewed owner manifest and image required');
const ownerManifestDigest = prepared.candidateFilesSha256['manifest.json'];
if (!/^[a-f0-9]{64}$/.test(ownerManifestDigest))
  throw Error('Original owner manifest hash required');
if (mode === 'drill') {
  const ci = report('recovery-ci-proof.json'),
    audit = report('fence-transport-audit-proof.json'),
    plan = report('fence-transport-plan-proof.json');
  const age = Date.now() - Date.parse(plan.capturedAt);
  if (
    ci.commit !== sourceCommit ||
    !ci.runs.some(
      (run) =>
        run.sha === sourceCommit &&
        run.status === 'completed' &&
        run.conclusion === 'success',
    ) ||
    audit.sourceCommit !== sourceCommit ||
    audit.operatorApprovedDrill !== true ||
    plan.sourceCommit !== sourceCommit ||
    plan.mode !== 'plan' ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 30 * 60 * 1000 ||
    plan.servicesStopped !== 0 ||
    plan.pendingJobs !== 0 ||
    plan.liveLeases !== 0 ||
    plan.foreignActiveSessions !== 0 ||
    plan.databaseTlsVerified !== true ||
    plan.temporaryContainersAndPlaintextRemoved !== true
  )
    throw Error(
      'Exact successful CI, interpreted audit and fresh successful plan required',
    );
}
const files = {};
const names = [
  clientName,
  'scripts/ops/contabo-fence-drill.py',
  'scripts/ops/contabo-writer-fence.py',
  'scripts/capture-privacy-authority.ts',
  'scripts/lib/privacy-fence-envelope.ts',
  'scripts/lib/verified-privacy-authority.ts',
  'scripts/lib/privacy-restore.ts',
  'scripts/lib/privacy-recovery-schema.ts',
  'scripts/lib/privacy-recovery-coverage.ts',
  'scripts/lib/recovery-auth-inventory.ts',
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
// This fixed loader authenticates the exact bytes executed. The root executor
// checks both transport and this client's digests against the source bundle.
const loader =
  'python3 -c \'import sys,json,base64,io,hashlib; p=json.load(sys.stdin); data=base64.b64decode(p["script"],validate=True); sys.stdin=io.StringIO(json.dumps(p["request"])); exec(compile(data,"<reviewed-fence-transport>","exec"),{"__name__":"__main__","__operator_source_sha256__":hashlib.sha256(data).hexdigest(),"__operator_client_sha256__":p["clientSha256"]})\'';
const pending = promisify(execFile)(
  'ssh',
  [
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
    '-o',
    'IdentitiesOnly=yes',
    '-o',
    'ClearAllForwardings=yes',
    '-T',
    `root@${host}`,
    loader,
  ],
  { encoding: 'utf8', timeout: 600000, maxBuffer: 2 * 1024 ** 2 },
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
    `Scoped fence operation stopped in ${phase}; inspect the original owner state before retrying.`,
  );
  process.exitCode = 1;
}
