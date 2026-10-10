// Hourly original encrypted-copy reconciliation. No age identity or paid API.
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import {
  privateReportDirectory,
  privateReportFile,
} from './lib/private-report.ts';

const directory = privateReportDirectory('contabo-recovery');
const startedAt = Date.now();
const deadline = startedAt + 14 * 60 * 1000;
let phase = 'validation';
let commit;
async function remote(request) {
  const remaining = request.ok === false ? 30000 : deadline - Date.now();
  if (remaining <= 0) throw Error('Bounded local operation deadline reached');
  const secrets = realpathSync(
    process.env.ALTERWARD_SSH_SECRETS_DIR ??
      join(process.env.LOCALAPPDATA ?? '', 'FutureFlow', 'secrets'),
  );
  const pin = join(secrets, 'contabo_known_hosts');
  const key = join(secrets, 'contabo_alterward_ed25519');
  for (const path of [pin, key]) {
    const state = lstatSync(path);
    if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1)
      throw Error('Original operator credential required');
  }
  const host = readFileSync(pin, 'utf8').trim().split(/\s+/)[0];
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))
    throw Error('Original host pin required');
  const installer = readFileSync('scripts/ops/contabo-recovery-install.py');
  if (
    !installer.equals(
      execFileSync('git', [
        'show',
        `${commit}:scripts/ops/contabo-recovery-install.py`,
      ]),
    )
  )
    throw Error('Exact committed receipt source required');
  const loader =
    'python3 -I -c \'import sys,json,base64,types;p=json.load(sys.stdin);m=types.ModuleType("recovery_receipt");exec(compile(base64.b64decode(p["source"]),"<reviewed-local-receipt>","exec"),m.__dict__);print(json.dumps(m.main(p["request"])))\'';
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
    { encoding: 'utf8', timeout: Math.min(30000, remaining), maxBuffer: 4096 },
  );
  pending.child.stdin.end(
    JSON.stringify({
      source: installer.toString('base64'),
      request,
    }),
  );
  return JSON.parse((await pending).stdout);
}
async function receipt(ok, managedArchives, legacyPolicyDigest) {
  const proof = await remote({
    action: 'record-local',
    ok,
    sourceCommit: commit,
    observedAt: new Date().toISOString(),
    managedArchives,
    legacyPolicyDigest,
  });
  if (proof.localAttestationRecorded !== true || proof.ok !== ok)
    throw Error('Original local attestation refused');
}
function fresh(value, seconds) {
  const age = Date.now() - Date.parse(value);
  return Number.isFinite(age) && age >= -300000 && age <= seconds * 1000;
}

try {
  if (
    process.platform !== 'win32' ||
    process.argv.slice(2).join('|') !== '--sync-and-expire'
  )
    throw Error('Explicit local recovery action required');
  commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const self = readFileSync('scripts/recovery-local.mjs');
  if (
    !self.equals(
      execFileSync('git', ['show', `${commit}:scripts/recovery-local.mjs`]),
    )
  )
    throw Error('Committed local operator required');
  const run = async (args) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw Error('Bounded local operation deadline reached');
    await promisify(execFile)(process.execPath, args, {
      timeout: Math.min(300000, remaining),
      maxBuffer: 2 * 1024 * 1024,
      env: process.env,
    });
  };
  const reconcile = async () => {
    phase = 'application-copy';
    await run(['scripts/contabo-daily.mjs', '--sync']);
    phase = 'managed-reconciliation';
    await run([
      '--import',
      'tsx',
      'scripts/supabase-managed-retention.mts',
      '--apply',
    ]);
    const managed = JSON.parse(
      readFileSync(
        '.local/supabase-recovery/managed-retention-proof.json',
        'utf8',
      ),
    );
    if (
      managed.sourceCommit !== commit ||
      managed.mode !== 'apply' ||
      managed.metadataReconciled !== true ||
      !fresh(managed.checkedAt, 300) ||
      managed.serverFreshArchives < 1
    )
      throw Error('Fresh joint metadata and encrypted copy proof required');
    phase = 'historical-preconditions';
    const prerequisites = await remote({ action: 'local-preconditions' });
    if (
      prerequisites.localExpiryPreconditionsVerified !== true ||
      !fresh(prerequisites.observedAt, 300) ||
      !fresh(prerequisites.managedCapturedAt, 26 * 3600) ||
      !fresh(prerequisites.applicationCapturedAt, 26 * 3600)
    )
      throw Error(
        'Authenticated fresh backups required before local historical expiry',
      );
    phase = 'historical-expiry';
    await run([
      '--import',
      'tsx',
      'scripts/legacy-recovery-retention.mts',
      '--apply',
    ]);
    const legacy = JSON.parse(
      readFileSync('.local/legacy-retention/proof.json', 'utf8'),
    );
    if (
      legacy.sourceCommit !== commit ||
      legacy.mode !== 'apply' ||
      legacy.serverResult.policyDigest !== legacy.localResult.policyDigest ||
      !fresh(legacy.checkedAt, 300)
    )
      throw Error('Fresh joint historical expiry proof required');
    phase = 'external-attestation';
    await receipt(
      true,
      managed.serverFreshArchives,
      legacy.serverResult.policyDigest,
    );
    return managed;
  };
  let managed;
  try {
    managed = await reconcile();
  } catch {
    // Original journaled operations can be safely retried after a transient
    // lock collision. A false receipt is sent only after both attempts fail.
    if (Date.now() - startedAt > 6 * 60 * 1000)
      throw Error('Slow attempt requires the next scheduled retry');
    await new Promise((done) => setTimeout(done, 150000));
    managed = await reconcile();
  }
  const proof = {
    ok: true,
    capturedAt: new Date().toISOString(),
    sourceCommit: commit,
    managedArchives: managed.serverFreshArchives,
    encryptedCopiesReconciled: true,
    externalAttestationRecorded: true,
    decryptionPerformed: false,
    keyRead: false,
    paidAiCalls: 0,
  };
  privateReportFile(directory, 'local-sync-proof.json', proof);
  console.log(JSON.stringify(proof));
} catch {
  if (commit) {
    try {
      await receipt(false, 0, '0'.repeat(64));
    } catch {
      // An unreachable host cannot receive failure; stale receipt alerts later.
    }
  }
  privateReportFile(directory, 'local-sync-failure.json', {
    ok: false,
    capturedAt: new Date().toISOString(),
    phase,
    rawErrorRecorded: false,
    localExpiryMayHaveCompleted: true,
  });
  console.error('Local recovery stopped; inspect private phase evidence.');
  process.exitCode = 1;
}
