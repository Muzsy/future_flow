import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import {
  FIXED_VALUES,
  MAX_PROJECT_USD,
  PLAN_MAX_AGE_MS,
  REQUEST_VERSION,
  SERVER_FILES,
  ServiceEnvGateError,
  assertApplyBindsPlan,
  assertResumeArguments,
  buildLoader,
  buildPayload,
  buildRequest,
  canonicalJson,
  checkPlanResult,
  parseArguments,
  planReceipt,
  refusalReason,
  requestSha256,
  scriptSet,
  sha256Hex,
  sshArguments,
} from '../../scripts/contabo-service-env.mjs';

const IMAGE = 'sha256:' + 'b'.repeat(64);
const input = () => ({
  imageId: IMAGE,
  sourceDirectory: '/root/alterward-ops/image-1d312d2-20261106',
  backupManifestPath: 'daily/backups/20261106T031500Z-0a1b2c3d/manifest.json',
  values: {
    AI_PROJECT_BUDGET_USD: '45',
    AI_USER_BUDGET_USD: '6',
    GENERATION_DAILY_LIMIT: '2',
    AI_BUDGET_WINDOW_START: '2026-11-07T00:00:00Z',
    AI_BUDGET_WINDOW_END: '2026-11-21T00:00:00Z',
    CLOUDFLARE_ACCESS_AUD: 'c'.repeat(64),
    TURNSTILE_SITE_KEY: '0x4AAAAAAAtestSiteKey1234',
  },
});
const rejects = (change, pattern) => {
  const value = input();
  change(value);
  assert.throws(() => buildRequest(value), pattern ?? ServiceEnvGateError);
};
const PYTHON_VALIDATE = `
import importlib.util, json, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location('service_env', 'scripts/ops/contabo-service-env.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
try:
    module.validate_request(json.load(sys.stdin))
    print('accepted')
except module.Refusal:
    print('refused')
`;
const pythonVerdict = (request) =>
  execFileSync('python3', ['-I', '-c', PYTHON_VALIDATE], {
    input: JSON.stringify(request),
    encoding: 'utf8',
  }).trim();

test('the request carries the owner parameters and the fixed profile values, nothing else', () => {
  const request = buildRequest(input());
  assert.equal(request.version, REQUEST_VERSION);
  assert.deepEqual(
    Object.keys(request).sort(),
    [
      'backupManifestPath',
      'imageId',
      'restoreProofPath',
      'sourceDirectory',
      'values',
      'version',
    ].sort(),
  );
  assert.equal(request.restoreProofPath, 'daily/status/registry-restore.json');
  for (const [key, value] of Object.entries(FIXED_VALUES))
    assert.equal(request.values[key], value);
  assert.equal(request.values.AI_PROJECT_BUDGET_USD, '45');
  assert.equal(request.values.TURNSTILE_SITE_KEY, '0x4AAAAAAAtestSiteKey1234');
  // The owner input cannot pick the structural values or any other key.
  rejects((v) => (v.values.SERVICE_ACCESS_ENFORCEMENT = 'true'));
  rejects((v) => (v.values.OPENAI_API_KEY = 'x'));
  rejects((v) => (v.values.BILLING_ENABLED = 'true'));
  rejects((v) => (v.extra = 1));
  rejects((v) => delete v.values.TURNSTILE_SITE_KEY);
  rejects((v) => delete v.values.CLOUDFLARE_ACCESS_AUD);
  const withDomain = input();
  withDomain.values.CLOUDFLARE_ACCESS_TEAM_DOMAIN = 'team.cloudflareaccess.com';
  assert.equal(
    buildRequest(withDomain).values.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
    'team.cloudflareaccess.com',
  );
});

test('every owner ceiling is refused before anything is sent', () => {
  rejects((v) => (v.values.AI_PROJECT_BUDGET_USD = '100.01'));
  rejects((v) => (v.values.AI_PROJECT_BUDGET_USD = '0'));
  rejects((v) => (v.values.AI_USER_BUDGET_USD = '8.51'));
  rejects((v) => (v.values.AI_USER_BUDGET_USD = '50'));
  rejects((v) => (v.values.AI_PROJECT_BUDGET_USD = '5'), /project budget/);
  rejects((v) => (v.values.GENERATION_DAILY_LIMIT = '4'));
  rejects((v) => (v.values.GENERATION_DAILY_LIMIT = '0'));
  rejects((v) => (v.values.GENERATION_DAILY_LIMIT = 2));
  rejects((v) => (v.values.AI_BUDGET_WINDOW_END = '2026-12-08T00:00:01Z'));
  rejects((v) => (v.values.AI_BUDGET_WINDOW_END = '2026-11-07T00:00:00Z'));
  rejects((v) => (v.values.AI_BUDGET_WINDOW_START = '2026-11-07'));
  rejects((v) => (v.values.CLOUDFLARE_ACCESS_AUD = 'C'.repeat(64)));
  rejects((v) => (v.values.CLOUDFLARE_ACCESS_AUD = 'c'.repeat(63)));
  rejects((v) => (v.values.TURNSTILE_SITE_KEY = 'sitekey'));
  rejects((v) => (v.values.TURNSTILE_SITE_KEY = '0x4AAA bad'));
  rejects((v) => (v.values.CLOUDFLARE_ACCESS_TEAM_DOMAIN = 'evil.example.com'));
  rejects((v) => (v.imageId = 'sha256:abc'));
  rejects((v) => (v.sourceDirectory = '/tmp/source'));
  rejects((v) => (v.sourceDirectory = '/root/alterward-ops/../etc'));
  rejects((v) => (v.sourceDirectory = '/root/alterward-ops/a b'));
  rejects((v) => (v.backupManifestPath = '../daily/backups/x/manifest.json'));
  rejects((v) => (v.restoreProofPath = 'daily/status/other.json'));
  const edge = input();
  edge.values.AI_PROJECT_BUDGET_USD = String(MAX_PROJECT_USD);
  edge.values.AI_USER_BUDGET_USD = '8.5';
  edge.values.GENERATION_DAILY_LIMIT = '3';
  edge.values.AI_BUDGET_WINDOW_END = '2026-12-08T00:00:00Z';
  assert.ok(buildRequest(edge));
});

test('the server step accepts exactly what this client builds and refuses what it refuses', () => {
  assert.equal(pythonVerdict(buildRequest(input())), 'accepted');
  // Same shape, values the server rules reject: the client refuses them too.
  const base = buildRequest(input());
  for (const [key, value] of [
    ['AI_PROJECT_BUDGET_USD', '100.01'],
    ['AI_USER_BUDGET_USD', '8.51'],
    ['GENERATION_DAILY_LIMIT', '4'],
    ['CLOUDFLARE_ACCESS_AUD', 'Z'.repeat(64)],
    ['TURNSTILE_SITE_KEY', 'nope'],
    ['AI_BUDGET_WINDOW_START', '2026-11-07'],
  ]) {
    const mutated = structuredClone(base);
    mutated.values[key] = value;
    assert.equal(pythonVerdict(mutated), 'refused', key);
  }
  // The ceilings are the same numbers on both sides.
  const python = readFileSync('scripts/ops/contabo-service-env.py', 'utf8');
  assert.match(python, /MAX_PROJECT_USD = 100\n/);
  assert.match(python, /MAX_USER_USD = 8\.5\n/);
  assert.match(python, /MAX_DAILY_LIMIT = 3\n/);
  assert.match(python, /MAX_WINDOW_DAYS = 31\n/);
});

test('canonical bytes and request digest are stable and key-order independent', () => {
  assert.equal(
    canonicalJson({ b: 'é', a: [1, null, true] }),
    '{"a":[1,null,true],"b":"\\u00e9"}\n',
  );
  const a = buildRequest(input());
  const reversed = {
    ...Object.fromEntries(Object.entries(a).reverse()),
    values: Object.fromEntries(Object.entries(a.values).reverse()),
  };
  assert.equal(requestSha256(a), requestSha256(reversed));
  const changed = structuredClone(a);
  changed.values.GENERATION_DAILY_LIMIT = '3';
  assert.notEqual(requestSha256(a), requestSha256(changed));
});

test('command-line arguments are exact', () => {
  assert.deepEqual(parseArguments(['plan']), { command: 'plan' });
  assert.throws(() => parseArguments([]), ServiceEnvGateError);
  assert.throws(
    () => parseArguments(['plan', '--confirm', 'x']),
    ServiceEnvGateError,
  );
  assert.throws(() => parseArguments(['apply']), ServiceEnvGateError);
  assert.throws(
    () => parseArguments(['apply', '--confirm']),
    ServiceEnvGateError,
  );
  assert.throws(
    () => parseArguments(['apply', '--confirm', 'a', '--confirm', 'b']),
    ServiceEnvGateError,
  );
  assert.throws(() => parseArguments(['resume']), ServiceEnvGateError);
  assert.throws(
    () => parseArguments(['apply', '--confirm', 'x', '--rollback']),
    ServiceEnvGateError,
  );
  assert.throws(() => parseArguments(['status']), ServiceEnvGateError);
  assert.deepEqual(
    parseArguments([
      'apply',
      '--confirm',
      'activate-service-env aaaa generation 1',
    ]),
    {
      command: 'apply',
      confirm: 'activate-service-env aaaa generation 1',
    },
  );
});

const scripts = () => scriptSet((name) => readFileSync(name));
const planResult = (request, overrides = {}) => {
  const planSha256 = 'a'.repeat(16) + 'f'.repeat(48);
  return {
    planSha256,
    confirm: `activate-service-env ${planSha256.slice(0, 16)} generation 1`,
    paidAiCalls: 0,
    changedKeys: ['AI_PROJECT_BUDGET_USD', 'SERVICE_ACCESS_ENFORCEMENT'],
    plan: {
      generation: 1,
      imageId: request.imageId,
      sourceDirectory: request.sourceDirectory,
      changes: {
        AI_PROJECT_BUDGET_USD: { beforeSha256: 'x', afterSha256: 'y' },
        SERVICE_ACCESS_ENFORCEMENT: { beforeSha256: null, afterSha256: 'z' },
      },
    },
    ...overrides,
  };
};

test('a server plan is accepted only when it is exactly the requested one', () => {
  const request = buildRequest(input());
  assert.ok(checkPlanResult(planResult(request), request));
  const refuse = (overrides) =>
    assert.throws(
      () => checkPlanResult(planResult(request, overrides), request),
      ServiceEnvGateError,
    );
  refuse({ paidAiCalls: 1 });
  refuse({
    confirm: 'activate-service-env ' + 'b'.repeat(16) + ' generation 1',
  });
  refuse({ confirm: 'activate-service-env aaaaaaaaaaaaaaaa generation 2' });
  refuse({ confirm: 'something else' });
  refuse({ changedKeys: ['OPENAI_API_KEY'] });
  refuse({ changedKeys: [] });
  refuse({
    changedKeys: ['SERVICE_ACCESS_ENFORCEMENT', 'AI_PROJECT_BUDGET_USD'],
  });
  refuse({
    plan: { ...planResult(request).plan, imageId: 'sha256:' + 'c'.repeat(64) },
  });
  refuse({ plan: { ...planResult(request).plan, changes: {} } });
  assert.throws(() => checkPlanResult(null, request), ServiceEnvGateError);
});

test('apply is bound to its own fresh plan, the same request, the same code and the exact sentence', () => {
  const request = buildRequest(input());
  const set = scripts();
  const now = Date.parse('2026-11-06T10:00:00Z');
  const receipt = planReceipt({
    request,
    scripts: set,
    result: planResult(request),
    sourceCommit: '1'.repeat(40),
    nowMs: now,
  });
  assert.equal(receipt.requestSha256, requestSha256(request));
  assert.equal(
    JSON.stringify(receipt).includes(input().values.CLOUDFLARE_ACCESS_AUD),
    false,
  );
  const arguments_ = {
    receipt,
    request,
    scripts: set,
    sourceCommit: '1'.repeat(40),
    confirm: receipt.confirm,
    nowMs: now + 60000,
  };
  assert.equal(assertApplyBindsPlan(arguments_), receipt.planSha256);
  const refuse = (change, pattern) =>
    assert.throws(
      () => assertApplyBindsPlan({ ...arguments_, ...change }),
      pattern ?? ServiceEnvGateError,
    );
  refuse(
    { confirm: 'activate-service-env ' + 'a'.repeat(16) + ' generation 2' },
    /Owner confirmation/,
  );
  refuse({ confirm: undefined }, /Owner confirmation/);
  refuse({ nowMs: now + PLAN_MAX_AGE_MS + 1 }, /older than 30 minutes/);
  refuse({ nowMs: now - 1 });
  refuse({ sourceCommit: '2'.repeat(40) }, /changed since the plan/);
  refuse(
    { scripts: { ...set, digest: 'd'.repeat(64) } },
    /changed since the plan/,
  );
  const other = structuredClone(request);
  other.values.GENERATION_DAILY_LIMIT = '3';
  refuse({ request: other }, /changed since the plan/);
  refuse({ receipt: { ...receipt, kind: 'apply' } });
  refuse({ receipt: undefined });
});

test('resume arguments need the exact operation id and the rollback sentence', () => {
  const id = '123e4567-e89b-42d3-a456-426614174000';
  assert.deepEqual(assertResumeArguments({ operationId: id }), {
    operationId: id,
    rollback: false,
    confirm: undefined,
  });
  assert.ok(
    assertResumeArguments({
      operationId: id,
      rollback: true,
      confirm: `rollback-service-env ${id}`,
    }),
  );
  for (const bad of [
    { operationId: 'latest' },
    { operationId: id, rollback: true },
    { operationId: id, rollback: true, confirm: 'rollback-service-env other' },
    { operationId: id, confirm: `rollback-service-env ${id}` },
  ])
    assert.throws(() => assertResumeArguments(bad), ServiceEnvGateError);
});

test('only the value-free refusal line of the step is ever shown', () => {
  assert.equal(
    refusalReason(
      'noise\nService env step refused: Queued or running jobs exist: wait until the queue is empty\n',
    ),
    'Queued or running jobs exist: wait until the queue is empty',
  );
  assert.equal(refusalReason('Traceback: sk_live_secret'), undefined);
  assert.equal(refusalReason(undefined), undefined);
  assert.equal(
    refusalReason('Service env step refused: invalid input'),
    'invalid input',
  );
});

test('the uploaded set is the reviewed step and its exact dependencies', () => {
  assert.deepEqual(SERVER_FILES, [
    'scripts/ops/contabo-service-env.py',
    'scripts/ops/contabo-service-operator.py',
    'scripts/ops/contabo-service-profile.py',
    'scripts/ops/contabo-funded-image-rehearsal.py',
  ]);
  // Every module the step loads from its own directory is uploaded with it.
  const python = readFileSync('scripts/ops/contabo-service-env.py', 'utf8');
  const loaded = new Set(
    [...python.matchAll(/_load\([^,]+,\s*'([a-z-]+\.py)'\)/g)].map((m) => m[1]),
  );
  const operator = readFileSync(
    'scripts/ops/contabo-service-operator.py',
    'utf8',
  );
  for (const m of operator.matchAll(/_load\([^,]+,\s*'([a-z-]+\.py)'\)/g))
    loaded.add(m[1]);
  for (const name of loaded)
    assert.ok(readdirSync('scripts/ops').includes(name), name);
  for (const name of loaded)
    assert.ok(
      SERVER_FILES.includes('scripts/ops/' + name),
      name + ' must be uploaded',
    );
  const set = scripts();
  assert.match(set.digest, /^[a-f0-9]{64}$/);
  const payload = buildPayload({
    command: 'plan',
    args: [],
    request: buildRequest(input()),
    scripts: set,
  });
  assert.deepEqual(Object.keys(payload.files).sort(), [
    'contabo-funded-image-rehearsal.py',
    'contabo-service-env.py',
    'contabo-service-operator.py',
    'contabo-service-profile.py',
  ]);
});

test('the SSH command pins the host and the loader is a fixed quote-free string', () => {
  const loader = buildLoader();
  assert.ok(loader.startsWith("python3 -I -c '") && loader.endsWith("'"));
  assert.equal(loader.slice(15, -1).includes("'"), false);
  const linux = sshArguments({
    key: '/k',
    pin: '/p',
    host: '203.0.113.9',
    loader,
    platform: 'linux',
  });
  assert.ok(linux.includes('StrictHostKeyChecking=yes'));
  assert.ok(linux.includes('BatchMode=yes'));
  assert.ok(linux.includes('ClearAllForwardings=yes'));
  assert.equal(linux.at(-2), 'root@203.0.113.9');
  assert.equal(linux.at(-1), loader);
});

// Runs the real loader with a stand-in step: it must verify the hashes, place the
// files and the request in one private directory, pass exact arguments and clean up.
test('the loader runs the step from a private temporary directory and removes it', () => {
  const stand = `import json,os,stat,sys
d=os.path.dirname(os.path.abspath(__file__))
names=sorted(os.listdir(d))
mode=stat.S_IMODE(os.stat(d).st_mode)
req=sys.argv[sys.argv.index("--request")+1] if "--request" in sys.argv else None
body=json.load(open(req)) if req else None
print(json.dumps({"dir":d,"names":names,"mode":mode,"argv":sys.argv[1:],"request":body,"reqmode":stat.S_IMODE(os.stat(req).st_mode) if req else None}))
`;
  const bytes = Buffer.from(stand);
  const digest = (data) => sha256Hex(data);
  const files = (override = {}) =>
    Object.fromEntries(
      [
        'contabo-funded-image-rehearsal.py',
        'contabo-service-env.py',
        'contabo-service-operator.py',
        'contabo-service-profile.py',
      ].map((name) => [
        name,
        {
          data: (name === 'contabo-service-env.py'
            ? bytes
            : Buffer.from('# ' + name)
          ).toString('base64'),
          sha256: digest(
            name === 'contabo-service-env.py'
              ? bytes
              : Buffer.from('# ' + name),
          ),
          ...override[name],
        },
      ]),
    );
  const run = (payload) => {
    const loader = buildLoader()
      .replace(/^python3 -I -c '/, '')
      .slice(0, -1);
    return spawnSync('python3', ['-I', '-c', loader], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
    });
  };
  const request = buildRequest(input());
  const done = run({
    command: 'apply',
    args: ['--plan-sha256', 'a'.repeat(64), '--confirm', 'x'],
    request,
    files: files(),
  });
  assert.equal(done.status, 0, done.stderr);
  const seen = JSON.parse(done.stdout);
  assert.deepEqual(seen.names, [
    'contabo-funded-image-rehearsal.py',
    'contabo-service-env.py',
    'contabo-service-operator.py',
    'contabo-service-profile.py',
    'request.json',
  ]);
  assert.equal(seen.mode, 0o700);
  assert.equal(seen.reqmode, 0o600);
  assert.deepEqual(seen.request, request);
  assert.deepEqual(seen.argv.slice(0, 3), [
    'apply',
    '--request',
    seen.dir + '/request.json',
  ]);
  assert.deepEqual(seen.argv.slice(3), [
    '--plan-sha256',
    'a'.repeat(64),
    '--confirm',
    'x',
  ]);
  assert.throws(() => readdirSync(seen.dir), /ENOENT/);
  const resume = JSON.parse(
    run({ command: 'resume', args: ['--operation-id', 'x'], files: files() })
      .stdout,
  );
  assert.equal(resume.request, null);
  assert.equal(resume.names.includes('request.json'), false);
  // A tampered file, a foreign file or an unknown command never runs anything.
  const tampered = run({
    command: 'plan',
    args: [],
    request,
    files: files({ 'contabo-service-env.py': { sha256: 'e'.repeat(64) } }),
  });
  assert.notEqual(tampered.status, 0);
  assert.equal(tampered.stdout, '');
  const extra = {
    ...files(),
    'evil.py': { data: '', sha256: digest(Buffer.alloc(0)) },
  };
  assert.notEqual(
    run({ command: 'plan', args: [], request, files: extra }).status,
    0,
  );
  assert.notEqual(
    run({ command: 'rm', args: [], request, files: files() }).status,
    0,
  );
});
