import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  privateReportDirectory,
  privateReportFile,
} from './lib/private-report.ts';

async function main() {
  if (
    process.platform !== 'win32' ||
    !process.env.LOCALAPPDATA ||
    process.argv.length !== 2
  )
    throw Error('Pinned Windows owner preflight required');
  const directory = privateReportDirectory('contabo-release');
  const secrets = join(process.env.LOCALAPPDATA, 'FutureFlow', 'secrets');
  const pin = join(secrets, 'contabo_known_hosts');
  const key = join(secrets, 'contabo_alterward_ed25519');
  const environmentFile = join(directory, 'owner-server.env');
  for (const file of [pin, key, environmentFile]) {
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
      throw Error('Regular protected operator files required');
  }
  const host = readFileSync(pin, 'utf8').trim().split(/\s+/)[0];
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))
    throw Error('Unexpected pinned host');
  const operator = JSON.parse(
    readFileSync('.local/closed-site-operator/operator-config.json', 'utf8'),
  );
  if (
    operator.cloudflareAccess?.allowedEmails?.length !== 1 ||
    operator.cloudflareAccess.allowedEmails[0] !== operator.operatorLoginEmail
  )
    throw Error('Saved exact owner-only Access configuration required');
  const buildProof = JSON.parse(
    readFileSync(join(directory, 'target-build-proof.json'), 'utf8'),
  );
  const runtimeProof = JSON.parse(
    readFileSync(join(directory, 'target-runtime-proof.json'), 'utf8'),
  );
  if (
    buildProof.commit !== runtimeProof.commit ||
    buildProof.imageId !== runtimeProof.imageId ||
    !runtimeProof.existingContainersUnchanged ||
    runtimeProof.paidAiCalls !== 0
  )
    throw Error('Exact successful target image proof required');
  const script = readFileSync('scripts/ops/contabo-owner.py');
  const target = readFileSync('scripts/ops/contabo-target.py');
  const library = readFileSync('scripts/ops/contabo-backup.py');
  const request = {
    buildProof,
    access: operator.cloudflareAccess,
    ownerFlags: readFileSync('deploy/closed-site-owner.flags.env', 'utf8'),
    ownerEnvironment: readFileSync(environmentFile, 'utf8'),
    operatorScriptSha256: createHash('sha256')
      .update(script)
      .update(target)
      .update(library)
      .digest('hex'),
  };
  const loader =
    'python3 -c \'import sys,json,base64,types,io; p=json.load(sys.stdin); b=types.ModuleType("alterward_backup"); exec(compile(base64.b64decode(p["library"]),"<backup-library>","exec"),b.__dict__); sys.modules["alterward_backup"]=b; t=types.ModuleType("alterward_target"); exec(compile(base64.b64decode(p["target"]),"<target-library>","exec"),t.__dict__); sys.modules["alterward_target"]=t; sys.stdin=io.StringIO(json.dumps(p["request"])); exec(compile(base64.b64decode(p["script"]),"<owner-preflight>","exec"),{"__name__":"__main__"})\'';
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
    { encoding: 'utf8', timeout: 90000, maxBuffer: 1024 * 1024 },
  );
  pending.child.stdin.end(
    JSON.stringify({
      script: script.toString('base64'),
      target: target.toString('base64'),
      library: library.toString('base64'),
      request,
    }),
  );
  const { stdout } = await pending;
  const result = JSON.parse(stdout);
  if (!result.ok) throw Error('Real owner preflight failed');
  privateReportFile(directory, 'owner-preflight-proof.json', {
    ...result.result,
    capturedAt: new Date().toISOString(),
  });
  console.log(JSON.stringify(result.result));
}

main().catch(() => {
  console.error(
    'Real owner preflight stopped safely; no app, route or paid use activated.',
  );
  process.exitCode = 1;
});
