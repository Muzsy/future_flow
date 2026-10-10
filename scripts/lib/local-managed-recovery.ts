import { execFile, execFileSync } from 'node:child_process';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

export const localManagedSources = [
  'scripts/ops/contabo-managed-expiry.py',
  'scripts/ops/local-managed-recovery.py',
  'scripts/lib/local-managed-recovery.ts',
  'scripts/lib/private-report.ts',
  'pnpm-lock.yaml',
] as const;

// Python holds the kernel lock in the same process that reads/writes/unlinks.
// Ciphertext goes only through internal pipes; never surface stdout/errors.
export async function localManagedRecovery(request: object, commit: string) {
  if (!/^[a-f0-9]{40}$/.test(commit))
    throw Error('Committed operator required');
  const source: Record<string, string> = {};
  const sourceHashes: Record<string, string> = {};
  for (const path of localManagedSources) {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
      throw Error('Original committed local helper required');
    const bytes = readFileSync(path);
    if (!bytes.equals(execFileSync('git', ['show', `${commit}:${path}`])))
      throw Error('Exact committed local helper required');
    source[path] = bytes.toString('base64');
    sourceHashes[path] = createHash('sha256').update(bytes).digest('hex');
  }
  const loader = [
    'import sys,json,base64,types,io',
    'p=json.load(sys.stdin)',
    'm=types.ModuleType("alterward_managed_expiry")',
    'exec(compile(base64.b64decode(p["source"]["scripts/ops/contabo-managed-expiry.py"]),"<expiry-validation>","exec"),m.__dict__)',
    'sys.modules[m.__name__]=m',
    'sys.stdin=io.StringIO(json.dumps(p["request"]))',
    'exec(compile(base64.b64decode(p["source"]["scripts/ops/local-managed-recovery.py"]),"<local-managed-recovery>","exec"),{"__name__":"__main__"})',
  ].join('\n');
  const python = process.env.ALTERWARD_PYTHON ?? '';
  if (!isAbsolute(python)) throw Error('Absolute operator Python required');
  const runtime = lstatSync(python);
  if (
    !runtime.isFile() ||
    runtime.isSymbolicLink() ||
    runtime.nlink !== 1 ||
    runtime.size > 64 * 1024 * 1024 ||
    realpathSync(python).toLowerCase() !== python.toLowerCase()
  )
    throw Error('Original bounded operator Python required');
  const runtimeSha256 = createHash('sha256')
    .update(readFileSync(python))
    .digest('hex');
  const pending = promisify(execFile)(python, ['-I', '-c', loader], {
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 360 * 1024 * 1024,
  });
  pending.child.stdin!.end(JSON.stringify({ source, request }));
  try {
    const response = JSON.parse((await pending).stdout);
    if (response.ok !== true) throw Error('Local operation refused');
    return {
      result: response.result,
      sourceHashes,
      runtimeSha256,
      pythonIsolated: true,
    };
  } catch {
    throw Error('Local managed operation stopped safely');
  }
}
