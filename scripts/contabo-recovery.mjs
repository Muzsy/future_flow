// Explicit source-bound Windows operator for the separate recovery units.
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  privateReportDirectory,
  privateReportFile,
} from './lib/private-report.ts';

const paths = {
  'lifecycle.py': 'scripts/ops/contabo-recovery-lifecycle.py',
  'managed.py': 'scripts/ops/contabo-managed-recovery.py',
  'expiry.py': 'scripts/ops/contabo-managed-expiry.py',
  'local.py': 'scripts/ops/local-managed-recovery.py',
  'legacy.py': 'scripts/ops/legacy-recovery-retention.py',
  'catalog.mjs': 'scripts/ops/managed-catalog.mjs',
};
const directory = privateReportDirectory('contabo-recovery');
let phase = 'validation';
try {
  const action = process.argv[2]?.slice(2);
  if (
    process.platform !== 'win32' ||
    process.argv.length !== 3 ||
    !['install', 'run', 'status', 'activate', 'disable'].includes(action)
  )
    throw Error('Explicit scoped action required');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const sources = {};
  const hashes = {};
  for (const path of [
    'scripts/contabo-recovery.mjs',
    'scripts/ops/contabo-recovery-install.py',
    'scripts/lib/private-report.ts',
    ...Object.values(paths),
  ]) {
    const state = lstatSync(path);
    const bytes = readFileSync(path);
    if (
      !state.isFile() ||
      state.isSymbolicLink() ||
      state.nlink !== 1 ||
      !bytes.equals(execFileSync('git', ['show', `${commit}:${path}`]))
    )
      throw Error('Exact committed source required');
    sources[path] = bytes.toString('base64');
    hashes[path] = createHash('sha256').update(bytes).digest('hex');
  }
  const secrets = realpathSync(
    resolve(
      process.env.ALTERWARD_SSH_SECRETS_DIR ??
        join(process.env.LOCALAPPDATA ?? '', 'FutureFlow', 'secrets'),
    ),
  );
  const key = join(secrets, 'contabo_alterward_ed25519');
  const pin = join(secrets, 'contabo_known_hosts');
  for (const path of [key, pin]) {
    const state = lstatSync(path);
    if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1)
      throw Error('Original operator key and host pin required');
  }
  const host = readFileSync(pin, 'utf8').trim().split(/\s+/)[0];
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))
    throw Error('Pinned origin required');
  let request = { action };
  if (action === 'install') {
    const project = new URL(process.env.SUPABASE_URL ?? '');
    if (
      project.protocol !== 'https:' ||
      !/^[a-z]{20}\.supabase\.co$/.test(project.hostname)
    )
      throw Error('Original project required');
    const legacy = JSON.parse(
      readFileSync('.local/legacy-retention/proof.json', 'utf8'),
    );
    const digest = legacy.serverResult.policyDigest;
    if (
      !/^[a-f0-9]{64}$/.test(digest) ||
      digest !== legacy.localResult.policyDigest ||
      legacy.serverResult.knownRuns !== 3
    )
      throw Error('Original joint three-run enrollment proof required');
    request = {
      action,
      sourceCommit: commit,
      projectBinding: createHash('sha256')
        .update(project.hostname.split('.')[0])
        .digest('hex'),
      legacyPolicyDigest: digest,
      scripts: Object.fromEntries(
        Object.entries(paths).map(([name, path]) => [name, sources[path]]),
      ),
    };
  }
  const loader =
    'python3 -I -c \'import sys,json,base64,types; p=json.load(sys.stdin); m=types.ModuleType("recovery_installer"); exec(compile(base64.b64decode(p["source"]),"<reviewed-recovery-installer>","exec"),m.__dict__); print(json.dumps({"ok":True,"result":m.main(p["request"])}))\'';
  phase = 'scoped-remote';
  const pending = promisify(execFile)(
    'ssh',
    [
      '-F',
      'NUL',
      '-i',
      key,
      '-o',
      `UserKnownHostsFile="${pin.replaceAll('\\', '/')}"`,
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'BatchMode=yes',
      '-o',
      'IdentitiesOnly=yes',
      '-o',
      'IdentityAgent=none',
      '-o',
      'ConnectTimeout=10',
      `root@${host}`,
      loader,
    ],
    { encoding: 'utf8', timeout: 500000, maxBuffer: 128 * 1024 },
  );
  pending.child.stdin.end(
    JSON.stringify({
      source: sources['scripts/ops/contabo-recovery-install.py'],
      request,
    }),
  );
  const response = JSON.parse((await pending).stdout);
  if (response.ok !== true) throw Error('Scoped operation refused');
  const proof = {
    checkedAt: new Date().toISOString(),
    operatorSourceCommit: commit,
    operatorSourceHashes: hashes,
    ...response.result,
  };
  privateReportFile(directory, `${action}-proof.json`, proof);
  console.log(JSON.stringify(proof));
} catch {
  privateReportFile(directory, 'failure.json', {
    checkedAt: new Date().toISOString(),
    phase,
    rawErrorRecorded: false,
    paidAiCalls: 0,
  });
  console.error('Scoped recovery operation stopped; inspect private evidence.');
  process.exitCode = 1;
}
