import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

let recordFailure: ((error: unknown) => void) | undefined;

async function main() {
  const mode = process.argv[2]?.slice(2);
  if (
    process.platform !== 'win32' ||
    process.argv.length !== 3 ||
    !['check', 'sync', 'apply'].includes(mode ?? '')
  )
    throw Error('Explicit managed retention action required');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const hashes: Record<string, string> = {};
  const sources: Record<string, string> = {};
  for (const path of [
    'scripts/supabase-managed-retention.mts',
    'scripts/lib/private-report.ts',
    'scripts/lib/local-managed-recovery.ts',
    'scripts/lib/managed-retention.ts',
    'scripts/ops/local-managed-recovery.py',
    'scripts/ops/contabo-managed-expiry.py',
    'pnpm-lock.yaml',
  ]) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
      throw Error('Original operator source required');
    const data = readFileSync(path);
    if (!data.equals(execFileSync('git', ['show', `${commit}:${path}`])))
      throw Error('Exact committed operator required');
    sources[path] = data.toString('base64');
    hashes[path] = createHash('sha256').update(data).digest('hex');
  }
  const { privateReportDirectory, privateReportFile } =
    await import('./lib/private-report.js');
  const { localManagedRecovery } =
    await import('./lib/local-managed-recovery.js');
  const directory = privateReportDirectory('supabase-recovery');
  const project = new URL(process.env.SUPABASE_URL ?? '');
  if (
    project.protocol !== 'https:' ||
    !/^[a-z]{20}\.supabase\.co$/.test(project.hostname)
  )
    throw Error('Original hosted project required');
  const projectBinding = createHash('sha256')
    .update(project.hostname.split('.')[0]!)
    .digest('hex');
  const secrets = realpathSync(
    resolve(
      process.env.ALTERWARD_SSH_SECRETS_DIR ??
        join(process.env.LOCALAPPDATA ?? '', 'FutureFlow', 'secrets'),
    ),
  );
  const key = join(secrets, 'contabo_alterward_ed25519');
  const pin = join(secrets, 'contabo_known_hosts');
  for (const path of [key, pin]) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
      throw Error('Original SSH files required');
  }
  const host = readFileSync(pin, 'utf8').trim().split(/\s+/)[0]!;
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))
    throw Error('Pinned host required');
  const loader =
    'python3 -I -c \'import sys,json,base64,types; p=json.load(sys.stdin); m=types.ModuleType("expiry_operator"); exec(compile(base64.b64decode(p["source"]),"<exact-expiry>","exec"),m.__dict__); print(json.dumps({"ok":True,"result":m.main(p["request"])}))\'';
  async function remote(action: object): Promise<any> {
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
        `root@${host}`,
        loader,
      ],
      { encoding: 'utf8', timeout: 90000, maxBuffer: 360 * 1024 * 1024 },
    );
    pending.child.stdin!.end(
      JSON.stringify({
        source: sources['scripts/ops/contabo-managed-expiry.py'],
        request: {
          ...action,
          projectBinding,
          clientObservedAt: new Date().toISOString(),
        },
      }),
    );
    try {
      const response = JSON.parse((await pending).stdout);
      if (response.ok !== true) throw Error('Remote action refused');
      return response.result;
    } catch {
      throw Error('Managed remote operation stopped safely');
    }
  }
  let localPythonRuntimeSha256;
  async function local(action: object): Promise<any> {
    const value = await localManagedRecovery(
      { ...action, projectBinding },
      commit,
    );
    localPythonRuntimeSha256 = value.runtimeSha256;
    return value.result;
  }
  const { reconcileManagedRetention, RetentionStopped } =
    await import('./lib/managed-retention.js');
  recordFailure = (error) =>
    privateReportFile(directory, 'managed-retention-failure.json', {
      checkedAt: new Date().toISOString(),
      sourceCommit: commit,
      phase: error instanceof RetentionStopped ? error.phase : 'reconciliation',
      localExpiryMayHaveCompleted:
        error instanceof RetentionStopped
          ? error.localExpiryMayHaveCompleted
          : null,
      operatorIncident: true,
      automaticRetryWithoutValidationAllowed: false,
      rawErrorRecorded: false,
      keyRead: false,
      serviceActivationAllowed: false,
    });
  const result = await reconcileManagedRetention(
    mode as 'check' | 'sync' | 'apply',
    local,
    remote,
  );
  const proof = {
    ...result,
    sourceCommit: commit,
    sourceHashes: hashes,
    localPythonRuntimeSha256,
    localPythonIsolated: true,
  };
  privateReportFile(directory, 'managed-retention-proof.json', proof);
  console.log(JSON.stringify(proof));
}
main().catch((error: unknown) => {
  recordFailure?.(error);
  console.error(
    'Managed reconciliation stopped safely; no raw archive or SSH output.',
  );
  process.exitCode = 1;
});
