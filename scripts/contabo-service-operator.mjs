import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import {
  readFileSync,
  lstatSync,
  writeFileSync,
  openSync,
  fsyncSync,
  closeSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import {
  operatorSecretsDirectory,
  linuxSshHardening,
  supportedOperatorPlatform,
  assertLinuxPrivatePath,
} from './lib/operator-platform.mjs';

// Transport only: the existing root operator owns SPR validation, CAS, durable
// intent/journal and reconciliation. No automatic retry, grants or env changes.
export const SERVER_FILES = [
  'scripts/ops/contabo-service-operator.py',
  'scripts/ops/contabo-service-profile.py',
];
const CLIENT = 'scripts/contabo-service-operator.mjs';
const PLATFORM = 'scripts/lib/operator-platform.mjs';
const REPORT = 'scripts/lib/private-report.ts';
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
export class ServiceOperatorError extends Error {}
const refuse = (message) => {
  throw new ServiceOperatorError(message);
};

export function parseArguments(argv) {
  const [command, ...rest] = argv;
  if (!['status', 'bootstrap', 'wave', 'pause', 'resume'].includes(command))
    refuse('Explicit status/bootstrap/wave/pause/resume required');
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const name = rest[i];
    if (
      ![
        '--open',
        '--close',
        '--emergency',
        '--capacity',
        '--approve-added',
        '--confirm',
      ].includes(name) ||
      name in flags
    )
      refuse('Exact, non-duplicate arguments required');
    if (['--open', '--close', '--emergency'].includes(name)) flags[name] = true;
    else {
      const value = rest[++i];
      if (value === undefined || value.startsWith('--'))
        refuse('Flag value required');
      flags[name] = value;
    }
  }
  const allowed =
    command === 'wave'
      ? [
          '--open',
          '--close',
          '--capacity',
          '--approve-added',
          '--emergency',
          '--confirm',
        ]
      : command === 'pause'
        ? ['--emergency', '--confirm']
        : command === 'status'
          ? []
          : ['--confirm'];
  if (Object.keys(flags).some((k) => !allowed.includes(k)))
    refuse('Flag does not belong to this operation');
  const args = [];
  if (command === 'wave') {
    if (Boolean(flags['--open']) === Boolean(flags['--close']))
      refuse('Exactly one of --open/--close required');
    if (flags['--open']) {
      if (flags['--emergency']) refuse('Emergency opening is forbidden');
      if (
        !/^[1-9][0-9]{0,5}$/.test(flags['--capacity'] ?? '') ||
        Number(flags['--capacity']) > 100000 ||
        !/^(0|[1-9][0-9]{0,5})$/.test(flags['--approve-added'] ?? '') ||
        Number(flags['--approve-added']) > 100000
      )
        refuse('Explicit bounded capacity and approve-added required');
      args.push(
        '--open',
        '--capacity',
        flags['--capacity'],
        '--approve-added',
        flags['--approve-added'],
      );
    } else {
      if ('--capacity' in flags || '--approve-added' in flags)
        refuse('Closing takes no capacity or added places');
      args.push('--close');
    }
  }
  if (flags['--emergency']) args.push('--emergency');
  return { command, args, confirm: flags['--confirm'] };
}

export function scriptSet(read) {
  const entries = SERVER_FILES.map((name) => ({ name, bytes: read(name) }));
  return {
    entries,
    digest: sha256(
      JSON.stringify(entries.map(({ name, bytes }) => [name, sha256(bytes)])),
    ),
  };
}
export function confirmation(options, sourceCommit, scriptsDigest) {
  if (
    !/^[a-f0-9]{40}$/.test(sourceCommit) ||
    !/^[a-f0-9]{64}$/.test(scriptsDigest)
  )
    refuse('Exact source and scripts required');
  return (
    'service-operation ' +
    sha256(
      JSON.stringify({
        sourceCommit,
        scriptsDigest,
        command: options.command,
        args: options.args,
      }),
    ).slice(0, 24)
  );
}
export function assertConfirmation(options, sourceCommit, scriptsDigest) {
  if (options.command === 'status') return;
  const expected = confirmation(options, sourceCommit, scriptsDigest);
  if (options.confirm !== expected)
    refuse('Owner confirmation required: --confirm "' + expected + '"');
}

// Fixed remote program. User strings never enter the SSH command: only JSON
// stdin. Validate again BEFORE creating the temporary directory or executing.
export function buildLoader() {
  const code = [
    'import sys,json,base64,hashlib,os,shutil,subprocess,tempfile',
    'p=json.load(sys.stdin)',
    'names=["contabo-service-operator.py","contabo-service-profile.py"]',
    'f=p["files"]; a=p["argv"]',
    'ok=set(p)=={"files","argv"} and isinstance(f,dict) and sorted(f)==sorted(names) and isinstance(a,list) and all(isinstance(v,str) for v in a)',
    'ok or sys.exit(2)',
    'valid=a in (["status"],["bootstrap"],["pause"],["pause","--emergency"],["resume"],["wave","--close"],["wave","--close","--emergency"])',
    'if len(a)==6 and a[:2]==["wave","--open"] and a[2]=="--capacity" and a[4]=="--approve-added":',
    ' valid=a[3].isascii() and a[3].isdigit() and a[5].isascii() and a[5].isdigit() and 1<=len(a[3])<=6 and 1<=len(a[5])<=6 and 0<int(a[3])<=100000 and 0<=int(a[5])<=100000 and str(int(a[3]))==a[3] and str(int(a[5]))==a[5]',
    'valid or sys.exit(2)',
    'd=tempfile.mkdtemp(prefix="alterward-service-operator-",dir="/run" if os.access("/run",os.W_OK) else None)',
    'try:',
    ' os.chmod(d,0o700)',
    ' for n in names:',
    '  b=base64.b64decode(f[n]["data"],validate=True)',
    '  hashlib.sha256(b).hexdigest()==f[n]["sha256"] or sys.exit(2)',
    '  fd=os.open(os.path.join(d,n),os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)',
    '  with os.fdopen(fd,"wb") as out: out.write(b);out.flush();os.fsync(out.fileno())',
    ' sys.exit(subprocess.run(["python3","-B",os.path.join(d,names[0])]+a,stdin=subprocess.DEVNULL,env={"PATH":"/usr/sbin:/usr/bin:/sbin:/bin","LANG":"C"}).returncode)',
    'finally:',
    ' shutil.rmtree(d)',
  ].join('\n');
  return "python3 -I -c '" + code + "'";
}
export function buildPayload(options, scripts) {
  return {
    argv: [options.command, ...options.args],
    files: Object.fromEntries(
      scripts.entries.map(({ name, bytes }) => [
        name.split('/').pop(),
        { data: bytes.toString('base64'), sha256: sha256(bytes) },
      ]),
    ),
  };
}
// SSH needs OS execution settings, never provider/Auth/DB keys or Node injection.
export function transportEnvironment(environment = process.env) {
  return Object.fromEntries(
    ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL']
      .filter((key) => typeof environment[key] === 'string')
      .map((key) => [key, environment[key]]),
  );
}
export function sshArguments({ key, pin, host, platform = process.platform }) {
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))
    refuse('Pinned IPv4 host required');
  return [
    '-i',
    key,
    ...linuxSshHardening(platform),
    '-o',
    `UserKnownHostsFile="${pin.replaceAll('\\', '/')}"`,
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=10',
    '-T',
    `root@${host}`,
    buildLoader(),
  ];
}
export function checkResult(options, result) {
  if (!result || typeof result !== 'object' || Array.isArray(result))
    refuse('Unexpected server response');
  if (options.command === 'status') {
    if (
      typeof result.runningMatchesProfile !== 'boolean' ||
      !/^[a-f0-9]{64}$/.test(result.journalHeadSha256 ?? '') ||
      !Array.isArray(result.unfinishedOperations)
    )
      refuse('Unexpected status response');
  } else {
    const kind = {
      bootstrap: 'bootstrap',
      wave: 'wave',
      pause: 'policy',
      resume: 'policy',
    }[options.command];
    if (
      result.kind !== kind ||
      result.outcome !== 'committed' ||
      result.paidAiCalls !== 0 ||
      result.authProviderWrites !== false ||
      typeof result.unverifiedAuthority !== 'boolean' ||
      (result.unverifiedAuthority && !options.args.includes('--emergency')) ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
        result.operationId ?? '',
      )
    )
      refuse('Commit response not proven: inspect the root journal');
  }
  return result;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!supportedOperatorPlatform()) refuse('Unsupported operator platform');
  const git = (args) =>
    execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const sourceCommit = git(['rev-parse', 'HEAD']);
  if (
    git(['branch', '--show-current']) !== 'main' ||
    git(['status', '--porcelain'])
  )
    refuse('Clean reviewed main checkout required');
  const committed = (name) =>
    execFileSync('git', ['show', `${sourceCommit}:${name}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const regular = (name) => {
    const info = lstatSync(name);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
      refuse('Committed regular file required');
    const bytes = readFileSync(name);
    if (sha256(bytes) !== sha256(committed(name)))
      refuse('Committed source mismatch');
    return bytes;
  };
  if (
    sha256(readFileSync(fileURLToPath(import.meta.url))) !==
    sha256(committed(CLIENT))
  )
    refuse('Executing client mismatch');
  regular(PLATFORM);
  regular(REPORT);
  const scripts = scriptSet(regular);
  assertConfirmation(options, sourceCommit, scripts.digest);
  const secrets = operatorSecretsDirectory();
  const key = join(secrets, 'contabo_alterward_ed25519');
  const pin = join(secrets, 'contabo_known_hosts');
  const host = readFileSync(pin, 'utf8').trim().split(/\s+/)[0];
  const { privateReportDirectory } = await import('./lib/private-report.ts');
  const dir = privateReportDirectory('contabo-service-operator');
  assertLinuxPrivatePath(resolve('.local'), true);
  assertLinuxPrivatePath(dir, true);
  const id = randomUUID();
  const base = {
    version: 'alterward-service-operator-client-1',
    clientOperationId: id,
    sourceCommit,
    scriptsSha256: scripts.digest,
    command: options.command,
    args: options.args,
    confirmation: options.confirm ?? null,
  };
  const save = (stage, value) => {
    const fd = openSync(join(dir, `${id}-${stage}.json`), 'wx', 0o600);
    try {
      writeFileSync(
        fd,
        JSON.stringify(
          { ...base, capturedAt: new Date().toISOString(), ...value },
          null,
          2,
        ) + '\n',
      );
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (process.platform === 'linux') {
      const directory = openSync(dir, 'r');
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
    }
  };
  // Keep an immutable local intent BEFORE SSH, including when transport dies.
  save('intent', { outcome: 'not-started' });
  try {
    const pending = promisify(execFile)(
      'ssh',
      sshArguments({ key, pin, host }),
      {
        encoding: 'utf8',
        timeout: 900000,
        maxBuffer: 2 * 1024 ** 2,
        env: transportEnvironment(),
      },
    );
    pending.child.stdin.on('error', () => {});
    pending.child.stdin.end(JSON.stringify(buildPayload(options, scripts)));
    const { stdout } = await pending;
    const result = checkResult(options, JSON.parse(stdout));
    save('result', { result });
    // Full result/UUIDs stay private; status is an observation, not a PASS claim.
    console.log(
      JSON.stringify({
        ok: true,
        command: options.command,
        ...(options.command === 'status'
          ? {
              runningMatchesProfile: result.runningMatchesProfile,
              unfinishedOperations: result.unfinishedOperations.length,
            }
          : { outcome: result.outcome }),
        evidence: dir,
      }),
    );
  } catch {
    save('failure', {
      outcome: options.command === 'status' ? 'observation-failed' : 'unknown',
      retry: false,
    });
    console.error(
      'Service operation stopped; inspect private evidence and /var/lib/alterward/service-operations/journal.jsonl. Do not repeat SQL blindly; use the existing root reconcile procedure after proving the original helper has stopped.',
    );
    process.exitCode = 1;
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(
      error instanceof ServiceOperatorError
        ? error.message
        : 'Service operator precondition failed; inspect private evidence before any retry.',
    );
    process.exitCode = 1;
  });
