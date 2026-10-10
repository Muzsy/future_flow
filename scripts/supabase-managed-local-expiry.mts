import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';

async function main() {
  const action = process.argv[2]?.slice(2);
  if (
    process.platform !== 'win32' ||
    process.argv.length !== 3 ||
    !['check', 'apply'].includes(action ?? '')
  )
    throw Error('Explicit local expiry command required');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const ownSource = 'scripts/supabase-managed-local-expiry.mts';
  const verifiedHashes: Record<string, string> = {};
  // Verify dependencies with built-ins before importing/calling ACL helpers.
  for (const path of [
    ownSource,
    'scripts/lib/private-report.ts',
    'scripts/lib/local-managed-recovery.ts',
    'scripts/ops/local-managed-recovery.py',
    'scripts/ops/contabo-managed-expiry.py',
    'pnpm-lock.yaml',
  ]) {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
      throw Error('Original source required');
    const bytes = readFileSync(path);
    if (!bytes.equals(execFileSync('git', ['show', `${commit}:${path}`])))
      throw Error('Exact committed operator required');
    verifiedHashes[path] = createHash('sha256').update(bytes).digest('hex');
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
  const secrets = resolve(
    process.env.ALTERWARD_SSH_SECRETS_DIR ??
      join(process.env.LOCALAPPDATA ?? '', 'FutureFlow', 'secrets'),
  );
  if (
    !lstatSync(secrets).isDirectory() ||
    lstatSync(secrets).isSymbolicLink() ||
    realpathSync(secrets).toLowerCase() !== secrets.toLowerCase()
  )
    throw Error('Original private SSH directory required');
  const key = join(secrets, 'contabo_alterward_ed25519');
  const pin = join(secrets, 'contabo_known_hosts');
  for (const path of [key, pin]) {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
      throw Error('Original SSH files required');
  }
  const host = readFileSync(pin, 'utf8').trim().split(/\s+/)[0]!;
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))
    throw Error('Pinned host required');
  // Only a UTC clock is read remotely. No age identity or archive is accessed.
  const clock = await promisify(execFile)(
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
      "python3 -c 'import datetime; print(datetime.datetime.now(datetime.timezone.utc).isoformat())'",
    ],
    { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 },
  );
  const { result, sourceHashes, runtimeSha256, pythonIsolated } =
    await localManagedRecovery(
      {
        action,
        projectBinding: createHash('sha256')
          .update(project.hostname.split('.')[0]!)
          .digest('hex'),
        serverObservedAt: clock.stdout.trim(),
      },
      commit,
    );
  const proof = {
    ...result,
    sourceCommit: commit,
    sourceHashes,
    verifiedHashes,
    runtimeSha256,
    pythonIsolated,
    remoteClockOnly: true,
  };
  privateReportFile(directory, 'managed-local-expiry-proof.json', proof);
  console.log(JSON.stringify(proof));
}
main().catch(() => {
  console.error(
    'Local managed expiry stopped safely; no raw archive or SSH output.',
  );
  process.exitCode = 1;
});
