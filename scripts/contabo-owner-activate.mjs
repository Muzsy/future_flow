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
  const action = process.argv[2]?.slice(2);
  if (
    process.platform !== 'win32' ||
    !process.env.LOCALAPPDATA ||
    process.argv.length !== 3 ||
    !['stage', 'launch'].includes(action)
  )
    throw Error('Explicit pinned owner activation action required');
  const directory = privateReportDirectory('contabo-release');
  const secrets = join(process.env.LOCALAPPDATA, 'FutureFlow', 'secrets');
  const key = join(secrets, 'contabo_alterward_ed25519');
  const pin = join(secrets, 'contabo_known_hosts');
  for (const file of [key, pin]) {
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
      throw Error('Protected regular SSH files required');
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
    throw Error('Exact owner Access profile required');
  const proof = (name) => {
    const file = join(directory, name);
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
      throw Error('Protected regular proof required');
    return JSON.parse(readFileSync(file, 'utf8'));
  };
  const buildProof = proof('target-build-proof.json');
  const runtime = proof('target-runtime-proof.json');
  const preflight = proof('owner-preflight-proof.json');
  if (
    [runtime, preflight].some(
      (value) =>
        value.imageId !== buildProof.imageId ||
        value.commit !== buildProof.commit ||
        !value.existingContainersUnchanged,
    ) ||
    runtime.paidAiCalls !== 0 ||
    !preflight.fullOwnerMatrixValidated
  )
    throw Error('Successful exact image and actual env proofs required');
  const request = {
    action,
    buildProof,
    access: operator.cloudflareAccess,
    ownerFlags: readFileSync('deploy/closed-site-owner.flags.env', 'utf8'),
  };
  if (action === 'stage') {
    for (const name of ['owner-server.env', 'owner-supabase-ca.crt']) {
      const info = lstatSync(join(directory, name));
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
        throw Error('Protected regular deployment input required');
    }
    request.ownerEnvironment = readFileSync(
      join(directory, 'owner-server.env'),
      'utf8',
    );
    if (
      createHash('sha256').update(request.ownerEnvironment).digest('hex') !==
      preflight.ownerEnvironmentSha256
    )
      throw Error('Owner environment changed after preflight');
    const ca = readFileSync(join(directory, 'owner-supabase-ca.crt'));
    request.databaseCa = ca.toString('base64');
    request.databaseCaSha256 = createHash('sha256').update(ca).digest('hex');
    if (request.databaseCaSha256 !== proof('owner-env-proof.json').caSha256)
      throw Error('Database CA changed after verification');
  } else request.stageProof = proof('owner-stage-proof.json');
  const sources = Object.fromEntries(
    [
      ['library', 'contabo-backup.py'],
      ['target', 'contabo-target.py'],
      ['owner', 'contabo-owner.py'],
      ['script', 'contabo-owner-activation.py'],
    ].map(([name, file]) => [name, readFileSync(join('scripts/ops', file))]),
  );
  const scriptDigest = createHash('sha256');
  for (const value of Object.values(sources)) scriptDigest.update(value);
  const operatorScriptSha256 = scriptDigest.digest('hex');
  if (
    action === 'launch' &&
    request.stageProof.operatorScriptSha256 !== operatorScriptSha256
  )
    throw Error('Activation code changed after staging');
  const loader =
    'python3 -c \'import sys,json,base64,types,io; p=json.load(sys.stdin);\nfor key,name in [("library","alterward_backup"),("target","alterward_target"),("owner","alterward_owner")]:\n m=types.ModuleType(name);exec(compile(base64.b64decode(p[key]),"<"+name+">","exec"),m.__dict__);sys.modules[name]=m\nsys.stdin=io.StringIO(json.dumps(p["request"]));exec(compile(base64.b64decode(p["script"]),"<owner-activation>","exec"),{"__name__":"__main__"})\'';
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
    { encoding: 'utf8', timeout: 420000, maxBuffer: 1024 * 1024 },
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
  if (!result.ok) throw Error('Guarded owner action failed');
  const saved = {
    ...result.result,
    operatorScriptSha256,
    capturedAt: new Date().toISOString(),
  };
  privateReportFile(directory, `owner-${action}-proof.json`, saved);
  console.log(JSON.stringify(saved));
}

main().catch(() => {
  console.error(
    'Guarded owner action stopped; inspect the protected operator evidence. DNS and Caddy remain unchanged.',
  );
  process.exitCode = 1;
});
