import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve, basename, dirname } from 'node:path';
import { promisify } from 'node:util';
import {
  linuxSshHardening,
  operatorSecretsDirectory,
  sameOperatorPath,
} from './lib/operator-platform.mjs';

async function main() {
  const mode = process.argv[2]?.slice(2);
  if (
    !['win32', 'linux'].includes(process.platform) ||
    process.argv.length !== 3 ||
    !['enroll', 'check', 'apply'].includes(mode ?? '')
  )
    throw Error('Explicit historical operator action required');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const sources: Record<string, string> = {},
    hashes: Record<string, string> = {};
  function original(path: string, limit = 2 * 1024 ** 2) {
    const before = lstatSync(path);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      before.size > limit ||
      !sameOperatorPath(realpathSync(path), resolve(path))
    )
      throw Error('Original bounded operator input required');
    const data = readFileSync(path),
      after = lstatSync(path);
    if (
      before.ino !== after.ino ||
      before.dev !== after.dev ||
      before.mtimeMs !== after.mtimeMs ||
      data.length !== before.size
    )
      throw Error('Operator input changed during read');
    return data;
  }
  for (const path of [
    'scripts/legacy-recovery-retention.mts',
    'scripts/ops/legacy-recovery-retention.py',
    'scripts/ops/local-managed-recovery.py',
    'scripts/ops/contabo-managed-expiry.py',
    'scripts/lib/private-report.ts',
    'scripts/lib/operator-platform.mjs',
    'pnpm-lock.yaml',
  ]) {
    const data = original(path);
    if (!data.equals(execFileSync('git', ['show', `${commit}:${path}`])))
      throw Error('Exact committed source required');
    sources[path] = data.toString('base64');
    hashes[path] = createHash('sha256').update(data).digest('hex');
  }
  const { privateReportDirectory, privateReportFile } =
    await import('./lib/private-report.js');
  const directory = privateReportDirectory('legacy-retention');
  const secrets =
    process.platform === 'linux'
      ? operatorSecretsDirectory()
      : realpathSync(
          resolve(
            process.env.ALTERWARD_SSH_SECRETS_DIR ??
              join(process.env.LOCALAPPDATA ?? '', 'FutureFlow', 'secrets'),
          ),
        );
  const key = join(secrets, 'contabo_alterward_ed25519'),
    pin = join(secrets, 'contabo_known_hosts');
  const keyInfo = lstatSync(key);
  if (
    !keyInfo.isFile() ||
    keyInfo.isSymbolicLink() ||
    keyInfo.nlink !== 1 ||
    keyInfo.size > 4096 ||
    realpathSync(key) !== key
  )
    throw Error('Original pinned SSH identity required');
  const host = original(pin, 4096).toString().trim().split(/\s+/)[0]!;
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))
    throw Error('Original pinned host required');
  const python = process.env.ALTERWARD_PYTHON ?? '';
  if (!isAbsolute(python)) throw Error('Explicit absolute Python required');
  const pythonHash = createHash('sha256')
    .update(original(python, 64 * 1024 ** 2))
    .digest('hex');
  const loader = [
    'import sys,json,base64,types,datetime,pathlib',
    'p=json.load(sys.stdin)',
    'for name,path in [("alterward_managed_expiry","scripts/ops/contabo-managed-expiry.py"),("alterward_managed_local","scripts/ops/local-managed-recovery.py"),("legacy_retention","scripts/ops/legacy-recovery-retention.py")]:',
    ' m=types.ModuleType(name);exec(compile(base64.b64decode(p["sources"][path]),"<exact-retention>","exec"),m.__dict__);sys.modules[name]=m',
    'r=p["request"]',
    'if r["action"]=="enroll" and r["side"]=="server":',
    ' m.validate_records(r["records"],"server",datetime.datetime.now(datetime.timezone.utc));parent=pathlib.Path("/root/alterward-ops");m.location(parent,True);meta=parent/"legacy-retention"',
    ' if not meta.exists():meta.mkdir(mode=0o700);m.sync_directory(parent)',
    'try:',
    ' print(json.dumps({"ok":True,"result":m.main(r)}))',
    'except Exception:',
    ' print(json.dumps({"ok":False,"phase":"legacy-retention"}));sys.exit(1)',
  ].join('\n');
  async function invoke(side: 'local' | 'server', action: object) {
    const args =
      side === 'local'
        ? ['-I', '-c', loader]
        : [
            ...linuxSshHardening(),
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
            `python3 -I -c '${loader.replaceAll("'", "'\\''")}'`,
          ];
    const child = promisify(execFile)(side === 'local' ? python : 'ssh', args, {
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 65536,
    });
    child.child.stdin!.end(
      JSON.stringify({ sources, request: { ...action, side } }),
    );
    try {
      const value = JSON.parse((await child).stdout);
      if (value.ok !== true) throw Error('Refused');
      return value.result;
    } catch {
      throw Error('Historical operator stopped safely');
    }
  }
  let enrollments;
  if (mode === 'enroll') {
    const registryRaw = original(
      '.local/contabo-release/recovery-archive-registry-proof.json',
    );
    const registry = JSON.parse(registryRaw.toString());
    const copies = JSON.parse(
      original(
        '.local/contabo-release/local-recovery-registry-proof.json',
      ).toString(),
    );
    if (
      registry.schemaVersion !== 'alterward-readonly-archive-registry-1' ||
      registry.filesDeleted !== 0 ||
      copies.unmatchedCopies !== 0 ||
      copies.sourceRegistryDigest !==
        createHash('sha256').update(registryRaw).digest('hex')
    )
      throw Error('Matching original readonly inventories required');
    const legacy = registry.records.filter(
      (r: any) =>
        r.path.startsWith('backups/') &&
        r.capturedAt === null &&
        r.timestampEvidence === 'named-operation-start-only',
    );
    if (legacy.length !== 3)
      throw Error('Three finite original historical runs required');
    const policies = legacy.map((r: any) => ({
      runId: r.runId,
      scope: r.scope,
      baseAt: r.namedOperationStartAt,
      expiresAt: r.expiryCandidateAt,
      timestampEvidence: 'named-operation-start-conservative',
    }));
    const serverRecords = policies.map((p: any, i: number) => ({
      ...p,
      directory: legacy[i].path.slice(8),
      files: [
        ...legacy[i].files.map((f: any) => ({ ...f, field: null })),
        {
          name: 'manifest.json',
          field: null,
          sha256: legacy[i].manifestSha256,
          bytes: legacy[i].manifestBytes,
        },
      ],
    }));
    const matches = copies.copies.filter((c: any) =>
      legacy.some((r: any) => r.runId === c.runId),
    );
    if (
      matches.length !== 8 ||
      matches.filter((c: any) => c.embeddedJsonField !== null).length !== 4
    )
      throw Error(
        'Eight historical local copies including four embedded fields required',
      );
    const localRecords = policies.map((p: any) => ({
      ...p,
      directory: null,
      files: matches
        .filter((c: any) => c.runId === p.runId)
        .map((c: any) => {
          if (
            !c.matchedRemote ||
            dirname(resolve(c.localPath)) !==
              resolve('.local/contabo-release') ||
            !legacy.some(
              (r: any) =>
                r.runId === c.runId &&
                r.files.some(
                  (f: any) => f.sha256 === c.sha256 && f.bytes === c.bytes,
                ),
            )
          )
            throw Error('Original ciphertext relationship required');
          return {
            name: basename(c.localPath),
            field: c.embeddedJsonField?.slice(2) ?? null,
            sha256: c.sha256,
            bytes: c.bytes,
          };
        }),
    }));
    enrollments = {
      server: await invoke('server', {
        action: 'enroll',
        records: serverRecords,
      }),
      local: await invoke('local', { action: 'enroll', records: localRecords }),
    };
  }
  const serverCheck = await invoke('server', {
    action: 'check',
    peerObservedAt: new Date().toISOString(),
  });
  const localCheck = await invoke('local', {
    action: 'check',
    peerObservedAt: serverCheck.checkedAt,
  });
  if (serverCheck.policyDigest !== localCheck.policyDigest)
    throw Error('Original historical policies disagree');
  let localResult = localCheck,
    serverResult = serverCheck;
  if (mode === 'apply') {
    try {
      localResult = await invoke('local', {
        action: 'apply',
        peerObservedAt: serverCheck.checkedAt,
      });
      serverResult = await invoke('server', {
        action: 'apply',
        peerObservedAt: new Date().toISOString(),
      });
    } catch {
      privateReportFile(directory, 'failure.json', {
        checkedAt: new Date().toISOString(),
        sourceCommit: commit,
        localExpiryMayHaveCompleted: true,
        rawErrorRecorded: false,
        automaticRetryWithoutValidationAllowed: false,
      });
      throw Error('Historical apply stopped safely');
    }
  }
  const proof = {
    checkedAt: new Date().toISOString(),
    mode,
    sourceCommit: commit,
    sourceHashes: hashes,
    pythonHash,
    enrollments,
    serverResult,
    localResult,
    automaticRetentionConfigured: false,
    policy: 'original-operation-start-plus-seven-days',
    actualCaptureTimeClaimed: false,
    paidApplicationAiCalls: 0,
    messagesSent: 0,
    serviceActivationAllowed: false,
  };
  privateReportFile(directory, 'proof.json', proof);
  console.log(JSON.stringify(proof));
}
main().catch(() => {
  console.error(
    'Historical retention stopped safely; private data and raw SSH errors suppressed.',
  );
  process.exitCode = 1;
});
