import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  operatorSecretsDirectory,
  assertOperatorLocalInput,
  linuxSshHardening,
  supportedOperatorPlatform,
} from './lib/operator-platform.mjs';

// ADR-011 P2 operator client: uploads the reviewed root step
// (scripts/ops/contabo-service-env.py and the two modules it loads), asks the
// server for a read-only `plan`, and applies it only with the owner's exact
// sentence. The owner-chosen values are parameters of one private input file;
// nothing here knows a budget, a window or a key. The server step stays the
// authority: every rule below is a fail-early mirror, a parity test keeps it so.
// Nothing here prints or stores a server.env value: digests and key names only.

export const REQUEST_VERSION = 'alterward-service-env-request-1';
export const RECEIPT_VERSION = 'alterward-service-env-operator-1';
export const RESTORE_PROOF_PATH = 'daily/status/registry-restore.json';
export const PLAN_MAX_AGE_MS = 30 * 60 * 1000;
export const SERVER_FILES = [
  'scripts/ops/contabo-service-env.py',
  'scripts/ops/contabo-service-operator.py',
  'scripts/ops/contabo-service-profile.py',
];
const CLIENT_NAME = 'scripts/contabo-service-env.mjs';
const PLATFORM_NAME = 'scripts/lib/operator-platform.mjs';
const REPORT_NAME = 'scripts/lib/private-report.ts';
const INPUT_NAME = 'service-env-input.json';
const PLAN_RECEIPT = 'service-env-plan-proof.json';
const MAX_INPUT_BYTES = 64 * 1024;

// Ceilings agreed by the owner (first wave 45/6/2, later waves 100/8.50/3); the
// server step carries the same numbers and enforces them again.
export const MAX_PROJECT_USD = 100;
export const MAX_USER_USD = 8.5;
export const MAX_DAILY_LIMIT = 3;
export const MAX_WINDOW_DAYS = 31;

// Structural values of the P2 profile: not owner choices, never read from the input.
export const FIXED_VALUES = Object.freeze({
  SERVICE_ACCESS_ENFORCEMENT: 'true',
  CLOSED_SITE_ENABLED: 'true',
  CLOSED_BETA_USER_IDS: '',
  NARRATIVE_COHORT_USER_IDS: '',
  AI_BUDGET_WINDOW_REQUIRED: 'true',
});
// Owner parameters. The Access team domain is optional (it already is in the env).
export const REQUIRED_PARAMETERS = [
  'AI_PROJECT_BUDGET_USD',
  'AI_USER_BUDGET_USD',
  'GENERATION_DAILY_LIMIT',
  'AI_BUDGET_WINDOW_START',
  'AI_BUDGET_WINDOW_END',
  'CLOUDFLARE_ACCESS_AUD',
  'TURNSTILE_SITE_KEY',
];
export const OPTIONAL_PARAMETERS = ['CLOUDFLARE_ACCESS_TEAM_DOMAIN'];

const IMAGE = /^sha256:[a-f0-9]{64}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const USD = /^[0-9]{1,3}(\.[0-9]{1,2})?$/;
const STAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;
const SAFE_VALUE = /^[A-Za-z0-9_.,:-]*$/;
const TURNSTILE_KEY = /^[0-3]x[A-Za-z0-9_-]{15,64}$/;
const TEAM_DOMAIN = /^[a-z0-9][a-z0-9-]{0,62}\.cloudflareaccess\.com$/;
const BACKUP_MANIFEST =
  /^daily\/backups\/[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}\/manifest\.json$/;
const OPERATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const APPROVAL =
  /^activate-service-env ([a-f0-9]{16}) generation ([1-9][0-9]{0,5})$/;

// Static, secret-free refusal reasons the operator may print verbatim.
export class ServiceEnvGateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ServiceEnvGateError';
  }
}
const gate = (message) => {
  throw new ServiceEnvGateError(message);
};

export const sha256Hex = (data) =>
  createHash('sha256').update(data).digest('hex');

// Same bytes as the server step's canonical(): sorted keys, compact, ASCII, newline.
export function canonicalJson(value) {
  const encode = (item) => {
    if (item === null || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number') return JSON.stringify(item);
    if (typeof item === 'string')
      return JSON.stringify(item).replace(
        /[\u007f-￿]/g,
        (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'),
      );
    if (Array.isArray(item)) return '[' + item.map(encode).join(',') + ']';
    return (
      '{' +
      Object.keys(item)
        .sort()
        .map((key) => encode(key) + ':' + encode(item[key]))
        .join(',') +
      '}'
    );
  };
  return encode(value) + '\n';
}

// Per-key value rules, mirrored from ALLOWED in contabo-service-env.py.
const VALUE_RULES = {
  AI_PROJECT_BUDGET_USD: (v) =>
    USD.test(v) && Number(v) > 0 && Number(v) <= MAX_PROJECT_USD,
  AI_USER_BUDGET_USD: (v) =>
    USD.test(v) && Number(v) > 0 && Number(v) <= MAX_USER_USD,
  GENERATION_DAILY_LIMIT: (v) =>
    /^[1-9]$/.test(v) && Number(v) <= MAX_DAILY_LIMIT,
  AI_BUDGET_WINDOW_START: (v) => STAMP.test(v),
  AI_BUDGET_WINDOW_END: (v) => STAMP.test(v),
  CLOUDFLARE_ACCESS_AUD: (v) => HEX64.test(v),
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: (v) => TEAM_DOMAIN.test(v),
  TURNSTILE_SITE_KEY: (v) => TURNSTILE_KEY.test(v),
};

function exactObject(value, keys, optional, message) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !keys.includes(key) && !optional.includes(key),
    ) ||
    keys.some((key) => !(key in value))
  )
    gate(message);
}

// Turns the owner's private input into the exact request the server step accepts.
export function buildRequest(input) {
  exactObject(
    input,
    ['imageId', 'sourceDirectory', 'backupManifestPath', 'values'],
    ['restoreProofPath'],
    'Exact service-env input keys required',
  );
  if (typeof input.imageId !== 'string' || !IMAGE.test(input.imageId))
    gate('Exact owner image id required');
  const source = input.sourceDirectory;
  if (
    typeof source !== 'string' ||
    !source.startsWith('/root/alterward-ops/') ||
    source.split('/').includes('..') ||
    /[^A-Za-z0-9_./-]/.test(source) ||
    source.includes('//')
  )
    gate('Exact release source directory required');
  if (
    typeof input.backupManifestPath !== 'string' ||
    !BACKUP_MANIFEST.test(input.backupManifestPath)
  )
    gate('Exact backup manifest path required');
  const restoreProofPath = input.restoreProofPath ?? RESTORE_PROOF_PATH;
  if (restoreProofPath !== RESTORE_PROOF_PATH)
    gate('Exact restore proof path required');
  exactObject(
    input.values,
    REQUIRED_PARAMETERS,
    OPTIONAL_PARAMETERS,
    'Exact owner parameter set required',
  );
  for (const [key, value] of Object.entries(input.values))
    if (
      typeof value !== 'string' ||
      !SAFE_VALUE.test(value) ||
      !VALUE_RULES[key](value)
    )
      gate('Owner parameter rejected: ' + key);
  const { values } = input;
  if (Number(values.AI_USER_BUDGET_USD) > Number(values.AI_PROJECT_BUDGET_USD))
    gate('The per-user budget cannot exceed the project budget');
  const span =
    Date.parse(values.AI_BUDGET_WINDOW_END) -
    Date.parse(values.AI_BUDGET_WINDOW_START);
  if (!(span > 0 && span <= MAX_WINDOW_DAYS * 86400000))
    gate(
      'The budget window must be positive and at most ' +
        MAX_WINDOW_DAYS +
        ' days',
    );
  return {
    version: REQUEST_VERSION,
    imageId: input.imageId,
    sourceDirectory: source,
    values: { ...FIXED_VALUES, ...values },
    backupManifestPath: input.backupManifestPath,
    restoreProofPath,
  };
}

export function requestSha256(request) {
  return sha256Hex(canonicalJson(request));
}

// The server's answers are bound again here: a wrong or foreign result is never trusted.
export function checkPlanResult(result, request) {
  const approval = APPROVAL.exec(result?.confirm ?? '');
  const plan = result?.plan;
  if (
    !result ||
    typeof result !== 'object' ||
    !HEX64.test(result.planSha256 ?? '') ||
    !approval ||
    approval[1] !== result.planSha256.slice(0, 16) ||
    !plan ||
    String(plan.generation) !== approval[2] ||
    result.paidAiCalls !== 0 ||
    plan.imageId !== request.imageId ||
    plan.sourceDirectory !== request.sourceDirectory ||
    !Array.isArray(result.changedKeys) ||
    !result.changedKeys.length ||
    !isSortedUnique(result.changedKeys) ||
    result.changedKeys.some((key) => !(key in request.values)) ||
    !isSameList(result.changedKeys, Object.keys(plan.changes ?? {}).sort())
  )
    gate('The server plan is not the requested one');
  return result;
}
const isSortedUnique = (list) =>
  list.every((item, index) => index === 0 || list[index - 1] < item);
const isSameList = (a, b) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export function planReceipt({ request, scripts, result, sourceCommit, nowMs }) {
  return {
    version: RECEIPT_VERSION,
    kind: 'plan',
    sourceCommit,
    scriptsSha256: scripts.digest,
    requestSha256: requestSha256(request),
    planSha256: result.planSha256,
    confirm: result.confirm,
    generation: result.plan.generation,
    changedKeys: result.changedKeys,
    plan: result.plan,
    capturedAt: new Date(nowMs).toISOString(),
  };
}

// apply may only follow its own fresh plan for the very same request and code.
export function assertApplyBindsPlan({
  receipt,
  request,
  scripts,
  sourceCommit,
  confirm,
  nowMs,
}) {
  const age = nowMs - Date.parse(receipt?.capturedAt ?? '');
  if (
    receipt?.version !== RECEIPT_VERSION ||
    receipt.kind !== 'plan' ||
    !HEX64.test(receipt.planSha256 ?? '') ||
    !Number.isFinite(age)
  )
    gate('A successful plan receipt is required');
  if (age < 0 || age > PLAN_MAX_AGE_MS)
    gate('The plan is older than 30 minutes: run plan again');
  if (
    receipt.sourceCommit !== sourceCommit ||
    receipt.scriptsSha256 !== scripts.digest ||
    receipt.requestSha256 !== requestSha256(request)
  )
    gate('The request or the code changed since the plan: run plan again');
  if (typeof confirm !== 'string' || confirm !== receipt.confirm)
    gate('Owner confirmation required: --confirm "' + receipt.confirm + '"');
  return receipt.planSha256;
}

export function assertResumeArguments({ operationId, rollback, confirm }) {
  if (typeof operationId !== 'string' || !OPERATION_ID.test(operationId))
    gate('Exact operation id required');
  const phrase = 'rollback-service-env ' + operationId;
  if (rollback) {
    if (confirm !== phrase)
      gate('Owner confirmation required: --confirm "' + phrase + '"');
  } else if (confirm !== undefined)
    gate('--confirm only belongs to --rollback');
  return { operationId, rollback: Boolean(rollback), confirm };
}

export function parseArguments(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index++) {
    const name = rest[index];
    if (name === '--rollback') flags.rollback = true;
    else if (['--confirm', '--operation-id'].includes(name)) {
      const value = rest[++index];
      if (
        value === undefined ||
        value.startsWith('--') ||
        flags[name.slice(2)] !== undefined
      )
        gate('Exact arguments required');
      flags[name.slice(2)] = value;
    } else gate('Exact arguments required');
  }
  const allowed = {
    plan: [],
    apply: ['confirm'],
    resume: ['operation-id', 'rollback', 'confirm'],
  }[command];
  if (
    !allowed ||
    Object.keys(flags).some((key) => !allowed.includes(key)) ||
    (command === 'apply' && flags.confirm === undefined) ||
    (command === 'resume' && flags['operation-id'] === undefined)
  )
    gate('Explicit plan, apply --confirm or resume --operation-id required');
  return { command, ...flags };
}

// Fixed loader: it writes the verified files into a fresh root-private directory
// (the step loads its sibling modules from its own directory), runs the step and
// removes the directory. The only data it takes is on stdin.
export const SERVER_FILE_NAMES = SERVER_FILES.map((name) =>
  name.split('/').pop(),
);
export function buildLoader() {
  const lines = [
    'import sys,json,base64,hashlib,os,shutil,subprocess,tempfile',
    'p=json.load(sys.stdin)',
    'n=' + JSON.stringify(SERVER_FILE_NAMES),
    'f=p["files"]',
    'ok=isinstance(f,dict) and sorted(f)==sorted(n) and p["command"] in ("plan","apply","resume") and all(isinstance(a,str) for a in p["args"])',
    'ok or sys.exit(2)',
    'd=tempfile.mkdtemp(prefix="alterward-service-env-",dir="/run" if os.access("/run",os.W_OK) else None)',
    'try:',
    ' os.chmod(d,0o700)',
    ' def put(name,data):',
    '  fd=os.open(os.path.join(d,name),os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)',
    '  os.write(fd,data);os.fsync(fd);os.close(fd)',
    ' for k in n:',
    '  b=base64.b64decode(f[k]["data"],validate=True)',
    '  hashlib.sha256(b).hexdigest()==f[k]["sha256"] or sys.exit(2)',
    '  put(k,b)',
    ' a=["python3","-B",os.path.join(d,n[0]),p["command"]]',
    ' if p.get("request") is not None:',
    '  put("request.json",json.dumps(p["request"]).encode());a+=["--request",os.path.join(d,"request.json")]',
    ' sys.exit(subprocess.run(a+p["args"],stdin=subprocess.DEVNULL,env={"PATH":"/usr/sbin:/usr/bin:/sbin:/bin","LANG":"C"}).returncode)',
    'finally:',
    ' shutil.rmtree(d,ignore_errors=True)',
  ];
  return "python3 -I -c '" + lines.join('\n') + "'";
}

export function buildPayload({ command, args, request, scripts }) {
  return {
    command,
    args,
    ...(request ? { request } : {}),
    files: Object.fromEntries(
      scripts.entries.map(({ name, bytes }) => [
        name.split('/').pop(),
        { data: bytes.toString('base64'), sha256: sha256Hex(bytes) },
      ]),
    ),
  };
}

export function scriptSet(read) {
  const entries = SERVER_FILES.map((name) => ({ name, bytes: read(name) }));
  const digest = sha256Hex(
    canonicalJson(
      Object.fromEntries(
        entries.map(({ name, bytes }) => [name, sha256Hex(bytes)]),
      ),
    ),
  );
  return { entries, digest };
}

// The refusal line the server step prints is value-free by construction; anything else is not shown.
export function refusalReason(stderr) {
  const match = /^Service env step refused: ([\x20-\x7e]{1,400})\s*$/m.exec(
    stderr ?? '',
  );
  return match ? match[1] : undefined;
}

export function sshArguments({
  key,
  pin,
  host,
  loader,
  platform = process.platform,
}) {
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
    loader,
  ];
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!supportedOperatorPlatform()) gate('Unsupported operator platform');
  const sha = sha256Hex;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (
    execFileSync('git', ['branch', '--show-current'], {
      encoding: 'utf8',
    }).trim() !== 'main'
  )
    gate('Reviewed main checkout required');
  const committed = (name) =>
    execFileSync('git', ['show', `${sourceCommit}:${name}`]);
  // Everything executed here or uploaded must be the committed bytes of a clean main.
  const regular = (name) => {
    const info = lstatSync(name);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
      gate('Exact committed regular file required');
    const data = readFileSync(name);
    if (sha(data) !== sha(committed(name)))
      gate('Executing operator must match committed source');
    return data;
  };
  if (
    sha(readFileSync(fileURLToPath(import.meta.url))) !==
      sha(committed(CLIENT_NAME)) ||
    execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
  )
    gate('Exact committed operator and clean checkout required');
  regular(PLATFORM_NAME);
  regular(REPORT_NAME);
  const scripts = scriptSet(regular);
  // Check its bytes before importing executable report/path confinement code.
  const { privateReportDirectory, privateReportFile, privateRequestFile } =
    await import('./lib/private-report.ts');
  const dir = privateReportDirectory('contabo-release');
  const readPrivate = (name) => {
    const path = privateRequestFile(dir, join(dir, name));
    assertOperatorLocalInput(path);
    if (lstatSync(path).size > MAX_INPUT_BYTES)
      gate('Bounded private input required');
    return JSON.parse(readFileSync(path, 'utf8'));
  };

  let request;
  let args = [];
  let timeout = 300000;
  if (options.command === 'resume') {
    const resume = assertResumeArguments({
      operationId: options['operation-id'],
      rollback: options.rollback,
      confirm: options.confirm,
    });
    args = ['--operation-id', resume.operationId];
    if (resume.rollback) args.push('--rollback', '--confirm', resume.confirm);
    timeout = 900000;
  } else {
    request = buildRequest(readPrivate(INPUT_NAME));
    if (options.command === 'apply') {
      const planSha256 = assertApplyBindsPlan({
        receipt: readPrivate(PLAN_RECEIPT),
        request,
        scripts,
        sourceCommit,
        confirm: options.confirm,
        nowMs: Date.now(),
      });
      args = ['--plan-sha256', planSha256, '--confirm', options.confirm];
      timeout = 900000;
    }
  }

  const secrets = operatorSecretsDirectory();
  const key = join(secrets, 'contabo_alterward_ed25519');
  const pin = join(secrets, 'contabo_known_hosts');
  for (const path of [key, pin]) {
    const value = lstatSync(path);
    if (!value.isFile() || value.isSymbolicLink() || value.nlink !== 1)
      gate('Original regular protected SSH input required');
  }
  const host = readFileSync(pin, 'utf8').trim().split(/\s+/)[0];
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))
    gate('Original pinned host required');

  const pending = promisify(execFile)(
    'ssh',
    sshArguments({ key, pin, host, loader: buildLoader() }),
    { encoding: 'utf8', timeout, maxBuffer: 2 * 1024 ** 2 },
  );
  pending.child.stdin.end(
    JSON.stringify(
      buildPayload({ command: options.command, args, request, scripts }),
    ),
  );
  try {
    const { stdout } = await pending;
    const result = JSON.parse(stdout);
    if (options.command === 'plan') {
      checkPlanResult(result, request);
      const receipt = planReceipt({
        request,
        scripts,
        result,
        sourceCommit,
        nowMs: Date.now(),
      });
      privateReportFile(dir, PLAN_RECEIPT, receipt);
      console.log(
        JSON.stringify({
          ok: true,
          command: 'plan',
          planSha256: result.planSha256,
          generation: receipt.generation,
          changedKeys: result.changedKeys,
          changes: result.plan.changes,
          confirm: result.confirm,
        }),
      );
    } else {
      if (
        result.paidAiCalls !== 0 ||
        result.databaseConnections !== 0 ||
        !(
          (options.command === 'apply' &&
            HEX64.test(result.profileSha256 ?? '')) ||
          (options.command === 'resume' &&
            (HEX64.test(result.profileSha256 ?? '') ||
              result.outcome === 'rolled-back'))
        )
      )
        gate('Server result differs from the requested operation');
      privateReportFile(dir, `service-env-${options.command}-proof.json`, {
        version: RECEIPT_VERSION,
        kind: options.command,
        sourceCommit,
        scriptsSha256: scripts.digest,
        result,
        capturedAt: new Date().toISOString(),
      });
      console.log(
        JSON.stringify({ ok: true, command: options.command, result }),
      );
    }
  } catch (error) {
    const reason = refusalReason(error?.stderr);
    privateReportFile(dir, 'service-env-failure.json', {
      version: RECEIPT_VERSION,
      command: options.command,
      sourceCommit,
      reason:
        error instanceof ServiceEnvGateError
          ? error.message
          : (reason ?? 'transport'),
      capturedAt: new Date().toISOString(),
    });
    console.error(
      options.command === 'plan'
        ? `Read-only plan refused${reason ? ': ' + reason : ''}; nothing was changed.`
        : `Service-env ${options.command} stopped${reason ? ': ' + reason : ''}. ` +
            'Do not repeat it blindly: inspect /root/alterward-ops/service-env/journal.jsonl ' +
            'and finish the open operation with resume --operation-id.',
    );
    process.exitCode = 1;
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    // A failed credential/process can carry private stdout/stderr properties.
    console.error(
      error instanceof ServiceEnvGateError
        ? 'Service-env precondition refused: ' + error.message
        : 'Service-env operator precondition refused; no root operation started.',
    );
    process.exitCode = 1;
  });
}
