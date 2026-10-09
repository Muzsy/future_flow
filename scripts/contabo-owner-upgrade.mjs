import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, lstatSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  privateReportDirectory,
  privateReportFile,
} from './lib/private-report.ts';

async function main() {
  const action = process.argv[2]?.slice(2);
  if (
    process.platform !== 'win32' ||
    !process.env.LOCALAPPDATA ||
    process.argv.length !== 3 ||
    !['prepare-upgrade', 'apply-upgrade', 'recover-upgrade'].includes(action)
  )
    throw Error('Explicit pinned owner image-upgrade action required');
  const directory = privateReportDirectory('contabo-release');
  const secrets = join(process.env.LOCALAPPDATA, 'FutureFlow', 'secrets');
  const key = join(secrets, 'contabo_alterward_ed25519');
  const pin = join(secrets, 'contabo_known_hosts');
  const regular = (file) => {
    const value = lstatSync(file);
    if (!value.isFile() || value.isSymbolicLink() || value.nlink !== 1)
      throw Error('Regular private input required');
    return readFileSync(file);
  };
  regular(key);
  const host = regular(pin).toString().trim().split(/\s+/)[0];
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))
    throw Error('Unexpected pinned host');
  const proof = (name) => JSON.parse(regular(join(directory, name)).toString());
  const operator = JSON.parse(
    regular('.local/closed-site-operator/operator-config.json').toString(),
  );
  if (
    operator.cloudflareAccess?.allowedEmails?.length !== 1 ||
    operator.cloudflareAccess.allowedEmails[0] !== operator.operatorLoginEmail
  )
    throw Error('Exact owner Access required');
  const buildProof = proof('target-build-proof.json');
  const runtime = proof('target-runtime-proof.json');
  const baselineProof =
    action === 'prepare-upgrade'
      ? null
      : proof('owner-upgrade-baseline-proof.json');
  const previousBuildProof =
    baselineProof?.previousBuildProof ??
    proof(
      existsSync(join(directory, 'owner-active-build-proof.json'))
        ? 'owner-active-build-proof.json'
        : 'target-build-proof-before-recovery.json',
    );
  const previousStageProof =
    baselineProof?.previousStageProof ?? proof('owner-stage-proof.json');
  if (
    previousBuildProof.commit !== previousStageProof.commit ||
    previousBuildProof.imageId !== previousStageProof.imageId
  )
    throw Error('Exact previous live manifest proof required');
  if (
    action !== 'recover-upgrade' &&
    (runtime.commit !== buildProof.commit ||
      runtime.imageId !== buildProof.imageId ||
      !runtime.existingContainersUnchanged ||
      !runtime.temporaryFixturesRemoved ||
      runtime.paidAiCalls !== 0 ||
      runtime.lifeProcessRecovery?.processRecovery !== 'passed' ||
      runtime.ownerUpgradeFixture?.upgradeAndRollback !== 'passed')
  )
    throw Error('Exact isolated target proof required');
  const request = {
    action,
    buildProof,
    previousBuildProof,
    previousStageProof,
    access: operator.cloudflareAccess,
    ownerFlags: readFileSync('deploy/closed-site-owner.flags.env', 'utf8'),
  };
  const sources = Object.fromEntries(
    [
      ['library', 'contabo-backup.py'],
      ['target', 'contabo-target.py'],
      ['owner', 'contabo-owner.py'],
      ['activation', 'contabo-owner-activation.py'],
      ['script', 'contabo-owner-upgrade.py'],
    ].map(([name, file]) => [name, readFileSync(join('scripts/ops', file))]),
  );
  const digest = createHash('sha256');
  for (const value of Object.values(sources)) digest.update(value);
  const operatorScriptSha256 = digest.digest('hex');
  const fixtureDigest = createHash('sha256');
  for (const file of [
    'contabo-owner.py',
    'contabo-owner-activation.py',
    'contabo-owner-upgrade.py',
    'contabo-owner-upgrade-fixture.py',
  ])
    fixtureDigest.update(readFileSync(join('scripts/ops', file)));
  if (
    action !== 'recover-upgrade' &&
    fixtureDigest.digest('hex') !== runtime.ownerUpgradeScriptsSha256
  )
    throw Error('Operational source changed after actual fixture proof');
  if (action !== 'prepare-upgrade') {
    const saved = proof('owner-prepare-upgrade-proof.json');
    request.preparedProof = saved.preparedProof;
    if (
      saved.commit !== buildProof.commit ||
      saved.operatorScriptSha256 !== operatorScriptSha256
    )
      throw Error('Prepared source or scripts changed');
  }
  const opsCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (
    execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
  )
    throw Error('Committed clean ops checkout required');
  const loader =
    'python3 -c \'import sys,json,base64,types,io; p=json.load(sys.stdin);\nfor key,name in [("library","alterward_backup"),("target","alterward_target"),("owner","alterward_owner"),("activation","alterward_activation")]:\n m=types.ModuleType(name);exec(compile(base64.b64decode(p[key]),"<"+name+">","exec"),m.__dict__);sys.modules[name]=m\nsys.stdin=io.StringIO(json.dumps(p["request"]));exec(compile(base64.b64decode(p["script"]),"<owner-upgrade>","exec"),{"__name__":"__main__"})\'';
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
    { encoding: 'utf8', timeout: 720000, maxBuffer: 1024 * 1024 },
  );
  pending.child.stdin.end(
    JSON.stringify({
      ...Object.fromEntries(
        Object.entries(sources).map(([name, value]) => [
          name,
          value.toString('base64'),
        ]),
      ),
      request,
    }),
  );
  const { stdout } = await pending;
  const result = JSON.parse(stdout);
  if (!result.ok) throw Error('Guarded owner upgrade failed');
  const saved = {
    ...result.result,
    operatorScriptSha256,
    opsCommit,
    capturedAt: new Date().toISOString(),
  };
  privateReportFile(directory, `owner-${action}-proof.json`, saved);
  privateReportFile(
    directory,
    `owner-${action}-${buildProof.commit}.json`,
    saved,
  );
  if (action === 'prepare-upgrade')
    privateReportFile(directory, 'owner-upgrade-baseline-proof.json', {
      previousBuildProof,
      previousStageProof,
    });
  if (action === 'apply-upgrade' && saved.upgraded) {
    privateReportFile(directory, 'owner-active-build-proof.json', buildProof);
    privateReportFile(directory, 'owner-stage-proof.json', saved);
  }
  if (action === 'recover-upgrade' && saved.rollbackVerified) {
    privateReportFile(
      directory,
      'owner-active-build-proof.json',
      previousBuildProof,
    );
    privateReportFile(directory, 'owner-stage-proof.json', previousStageProof);
  }
  console.log(JSON.stringify(saved));
}
main().catch(() => {
  console.error(
    'Owner image-upgrade stopped safely; inspect private evidence before retry. No DNS, proxy or paid-access change.',
  );
  process.exitCode = 1;
});
