import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  readFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  parseArguments,
  confirmation,
  assertConfirmation,
  scriptSet,
  buildLoader,
  buildPayload,
  checkResult,
  sshArguments,
  sha256,
  SERVER_FILES,
  transportEnvironment,
} from '../../scripts/contabo-service-operator.mjs';

const set = () => scriptSet((name) => readFileSync(name));
const source = 'a'.repeat(40);
const parse = (...a) => parseArguments(a);
test('closed commands; no grant, SQL, reconcile or env capability', () => {
  for (const name of ['status', 'bootstrap', 'pause', 'resume'])
    assert.equal(parse(name).command, name);
  for (const a of [
    [],
    ['grant'],
    ['reconcile'],
    ['restore-reconcile'],
    ['status', '--user', 'x'],
    ['pause', '--open'],
    ['resume', '--emergency'],
    ['status', '--confirm', 'x'],
    ['bootstrap', '--emergency'],
    ['pause', '--confirm'],
    ['pause', '--confirm', 'a', '--confirm', 'a'],
    ['pause', '--emergency', '--emergency'],
  ])
    assert.throws(() => parseArguments(a));
});
test('absolute bounded wave capacity and explicit added places; emergency only reduces exposure', () => {
  assert.deepEqual(
    parse('wave', '--open', '--capacity', '10', '--approve-added', '9').args,
    ['--open', '--capacity', '10', '--approve-added', '9'],
  );
  assert.deepEqual(parse('wave', '--close', '--emergency').args, [
    '--close',
    '--emergency',
  ]);
  for (const a of [
    [],
    ['--open'],
    ['--open', '--close'],
    ['--open', '--capacity', '10'],
    ['--close', '--capacity', '10'],
    ['--close', '--approve-added', '0'],
    ['--open', '--capacity', '10', '--approve-added', '9', '--emergency'],
  ])
    assert.throws(() => parseArguments(['wave', ...a]));
  for (const number of ['0', '-1', '01', '1.1', '100001', '1;id', '1e2', '１'])
    assert.throws(() =>
      parse('wave', '--open', '--capacity', number, '--approve-added', '0'),
    );
  assert.ok(
    parse('wave', '--open', '--capacity', '100000', '--approve-added', '0'),
  );
});
test('approval binds exact source, uploaded bytes, command and arguments', () => {
  const scripts = set();
  const p = parse('wave', '--open', '--capacity', '1', '--approve-added', '1');
  const phrase = confirmation(p, source, scripts.digest);
  assert.throws(
    () => assertConfirmation(p, source, scripts.digest),
    /Owner confirmation/,
  );
  const approved = { ...p, confirm: phrase };
  assert.doesNotThrow(() =>
    assertConfirmation(approved, source, scripts.digest),
  );
  for (const changed of [
    { ...approved, command: 'pause' },
    { ...approved, args: ['--close'] },
  ])
    assert.throws(() => assertConfirmation(changed, source, scripts.digest));
  assert.throws(() =>
    assertConfirmation(approved, 'b'.repeat(40), scripts.digest),
  );
  assert.throws(() => assertConfirmation(approved, source, 'b'.repeat(64)));
  assert.doesNotThrow(() =>
    assertConfirmation(parse('status'), source, scripts.digest),
  );
});
test('payload carries only two reviewed Python files and exact argv, no confirmation or credentials', () => {
  assert.deepEqual(SERVER_FILES, [
    'scripts/ops/contabo-service-operator.py',
    'scripts/ops/contabo-service-profile.py',
  ]);
  const scripts = set();
  for (const { name, bytes } of scripts.entries) {
    for (const m of bytes
      .toString()
      .matchAll(/_load\([^,]+,\s*'([a-z-]+\.py)'\)/g))
      assert.ok(SERVER_FILES.includes('scripts/ops/' + m[1]), name);
  }
  const payload = buildPayload(parse('pause', '--confirm', 'owner'), scripts);
  assert.deepEqual(Object.keys(payload).sort(), ['argv', 'files']);
  assert.deepEqual(payload.argv, ['pause']);
  assert.equal(JSON.stringify(payload).includes('owner'), false);
});
const stand = `import json,os,stat,sys
d=os.path.dirname(__file__)
print(json.dumps({"directory":d,"files":sorted(os.listdir(d)),"mode":stat.S_IMODE(os.stat(d).st_mode),"fileModes":[stat.S_IMODE(os.stat(os.path.join(d,n)).st_mode) for n in os.listdir(d)],"argv":sys.argv[1:],"stdin":sys.stdin.read(),"env":sorted(os.environ)}))
sys.exit(17 if sys.argv[1:]==["pause"] else 0)
`;
const files = () =>
  Object.fromEntries(
    SERVER_FILES.map((path, i) => {
      const bytes = Buffer.from(i === 0 ? stand : '# sibling');
      return [
        path.split('/').pop(),
        { data: bytes.toString('base64'), sha256: sha256(bytes) },
      ];
    }),
  );
const runLoader = (payload) => {
  const loader = buildLoader();
  assert.ok(loader.startsWith("python3 -I -c '") && loader.endsWith("'"));
  const code = loader.slice("python3 -I -c '".length, -1);
  assert.equal(code.includes("'"), false);
  return spawnSync('python3', ['-I', '-c', code], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, OPENAI_API_KEY: 'never-propagate' },
  });
};
test('real loader uses private sibling files, exact argv, EOF stdin, scrubbed env and cleans up', () => {
  const argv = ['wave', '--open', '--capacity', '10', '--approve-added', '9'];
  const done = runLoader({ argv, files: files() });
  assert.equal(done.status, 0, done.stderr);
  const seen = JSON.parse(done.stdout);
  assert.equal(seen.mode, 0o700);
  assert.deepEqual(seen.fileModes, [0o600, 0o600]);
  assert.deepEqual(seen.argv, argv);
  assert.equal(seen.stdin, '');
  assert.equal(seen.env.includes('OPENAI_API_KEY'), false);
  assert.deepEqual(seen.files, [
    'contabo-service-operator.py',
    'contabo-service-profile.py',
  ]);
  assert.equal(existsSync(seen.directory), false);
});
test('child failure keeps exit code and still cleans temporary files', () => {
  const done = runLoader({ argv: ['pause'], files: files() });
  assert.equal(done.status, 17);
  assert.equal(existsSync(JSON.parse(done.stdout).directory), false);
});
test('loader rejects tampered files, extra paths and forbidden argv before child execution', () => {
  const bad = files();
  bad['contabo-service-profile.py'].sha256 = '0'.repeat(64);
  const extra = {
    ...files(),
    '../escape.py': { data: '', sha256: sha256('') },
  };
  for (const payload of [
    { argv: ['status'], files: bad },
    { argv: ['status'], files: extra },
    ...[
      [
        'wave',
        '--open',
        '--capacity',
        '10',
        '--approve-added',
        '9',
        '--emergency',
      ],
      ['resume', '--emergency'],
      ['reconcile'],
      ['status', '--help'],
      ['wave', '--close', '--capacity', '0'],
      ['wave', '--open', '--capacity', '01', '--approve-added', '0'],
      ['wave', '--open', '--capacity', '1;id', '--approve-added', '0'],
    ].map((argv) => ({ argv, files: files() })),
  ]) {
    const done = runLoader(payload);
    assert.notEqual(done.status, 0);
    assert.equal(done.stdout, '');
  }
});
test('all supported argv reach the real Python parser', () => {
  const python = `import importlib.util,json,sys\ns=importlib.util.spec_from_file_location("op","scripts/ops/contabo-service-operator.py");m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\na=m.parser().parse_args(json.load(sys.stdin));print(a.command)`;
  for (const a of [
    ['status'],
    ['bootstrap'],
    ['pause'],
    ['pause', '--emergency'],
    ['resume'],
    ['wave', '--close'],
    ['wave', '--close', '--emergency'],
    ['wave', '--open', '--capacity', '10', '--approve-added', '9'],
  ]) {
    const p = parseArguments(a);
    const done = spawnSync('python3', ['-B', '-c', python], {
      input: JSON.stringify([p.command, ...p.args]),
      encoding: 'utf8',
    });
    assert.equal(done.status, 0, done.stderr);
    assert.equal(done.stdout.trim(), p.command);
  }
});
test('SSH host pin, no config/agent/forwarding; shell receives fixed loader only', () => {
  const args = sshArguments({
    key: '/private/key',
    pin: '/private/pin',
    host: '203.0.113.9',
    platform: 'linux',
  });
  for (const option of [
    'StrictHostKeyChecking=yes',
    'BatchMode=yes',
    'IdentityAgent=none',
    'ClearAllForwardings=yes',
    'GlobalKnownHostsFile=none',
  ])
    assert.ok(args.includes(option));
  assert.equal(args.at(-1), buildLoader());
  assert.throws(() => sshArguments({ key: '/k', pin: '/p', host: 'host;id' }));
});
test('mutation result requires exact committed kind and no provider writes or spend', () => {
  const p = parse('pause');
  const result = {
    kind: 'policy',
    outcome: 'committed',
    operationId: '123e4567-e89b-42d3-a456-426614174000',
    paidAiCalls: 0,
    authProviderWrites: false,
    unverifiedAuthority: false,
  };
  assert.equal(checkResult(p, result), result);
  for (const change of [
    { kind: 'wave' },
    { outcome: 'unknown' },
    { paidAiCalls: 1 },
    { authProviderWrites: true },
    { unverifiedAuthority: true },
    { operationId: 'latest' },
  ])
    assert.throws(() => checkResult(p, { ...result, ...change }));
  assert.ok(
    checkResult(parse('pause', '--emergency'), {
      ...result,
      unverifiedAuthority: true,
    }),
  );
});
test('unhealthy status is an observation, never a successful mutation or hidden PASS', () => {
  const result = {
    runningMatchesProfile: false,
    journalHeadSha256: '0'.repeat(64),
    unfinishedOperations: ['pending'],
  };
  assert.ok(checkResult(parse('status'), result));
  assert.throws(() => checkResult(parse('status'), {}));
  assert.throws(() => checkResult(parse('pause'), result));
});

// Exercise the actual CLI in an isolated, committed main checkout. SSH is a
// local stand-in; no production host, credentials or Docker are used.
test('actual CLI preserves private evidence, rejects unknown outcomes and never retries', () => {
  const root = mkdtempSync(join(tmpdir(), 'alterward-service-client-'));
  try {
    const repo = join(root, 'repo'),
      bin = join(root, 'bin'),
      secrets = join(root, 'secrets');
    for (const dir of [repo, bin, secrets]) mkdirSync(dir, { mode: 0o700 });
    for (const name of [
      'scripts/contabo-service-operator.mjs',
      'scripts/lib/operator-platform.mjs',
      'scripts/lib/private-report.ts',
      ...SERVER_FILES,
    ]) {
      mkdirSync(dirname(join(repo, name)), { recursive: true });
      writeFileSync(join(repo, name), readFileSync(name));
    }
    writeFileSync(join(repo, '.gitignore'), '.local/\n');
    const git = (args) => {
      const done = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
      assert.equal(done.status, 0, done.stderr);
      return done.stdout.trim();
    };
    git(['init', '-q', '-b', 'main']);
    git(['add', '.']);
    git([
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'fixture',
    ]);
    const commit = git(['rev-parse', 'HEAD']);
    const scripts = scriptSet((name) => readFileSync(join(repo, name)));
    writeFileSync(
      join(secrets, 'contabo_known_hosts'),
      '203.0.113.9 ssh-ed25519 fixture\n',
      { mode: 0o600 },
    );
    writeFileSync(
      join(secrets, 'contabo_alterward_ed25519'),
      'not-a-real-key\n',
      { mode: 0o600 },
    );
    const ssh = `#!${process.execPath}
const fs=require('fs');let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{fs.appendFileSync('ssh-count','x');const p=JSON.parse(s);const mode=fs.existsSync('ssh-mode')?fs.readFileSync('ssh-mode','utf8'):'';if(process.env.OPENAI_API_KEY||process.env.NODE_OPTIONS)process.exit(99);if(mode==='failure'){console.error('provider-secret-never-print');process.exit(1);}console.log(JSON.stringify({kind:'policy',outcome:mode==='invalid'?'unknown':'committed',operationId:'123e4567-e89b-42d3-a456-426614174000',paidAiCalls:0,authProviderWrites:false,unverifiedAuthority:false}));});
`;
    writeFileSync(join(bin, 'ssh'), ssh, { mode: 0o700 });
    // Count file is ignored to keep the transport checkout clean between runs.
    writeFileSync(join(repo, '.git/info/exclude'), 'ssh-count\nssh-mode\n');
    const env = {
      ...process.env,
      PATH: bin + ':' + process.env.PATH,
      ALTERWARD_SSH_SECRETS_DIR: secrets,
    };
    const run = (argv, extra = {}) =>
      spawnSync(
        process.execPath,
        ['scripts/contabo-service-operator.mjs', ...argv],
        { cwd: repo, encoding: 'utf8', env: { ...env, ...extra } },
      );
    const p = parse('pause');
    const phrase = confirmation(p, commit, scripts.digest);
    const missing = run(['pause']);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Owner confirmation/);
    assert.equal(existsSync(join(repo, 'ssh-count')), false);
    const done = run(['pause', '--confirm', phrase]);
    assert.equal(done.status, 0, done.stderr);
    const dir = join(repo, '.local/contabo-service-operator');
    assert.equal(statSync(dir).mode & 0o777, 0o700);
    assert.equal(readdirSync(dir).length, 2);
    for (const name of readdirSync(dir))
      assert.equal(statSync(join(dir, name)).mode & 0o777, 0o600);
    writeFileSync(join(repo, 'ssh-mode'), 'failure');
    const failed = run(['pause', '--confirm', phrase], {
      OPENAI_API_KEY: 'must-not-propagate',
    });
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /Do not repeat SQL blindly/);
    assert.equal(failed.stderr.includes('provider-secret'), false);
    writeFileSync(join(repo, 'ssh-mode'), 'invalid');
    const invalid = run(['pause', '--confirm', phrase]);
    assert.notEqual(invalid.status, 0);
    assert.equal(readFileSync(join(repo, 'ssh-count'), 'utf8'), 'xxx');
    const records = readdirSync(dir).map((name) =>
      JSON.parse(readFileSync(join(dir, name), 'utf8')),
    );
    assert.equal(
      records.filter((r) => r.outcome === 'unknown' && r.retry === false)
        .length,
      2,
    );
    assert.equal(records.length, 6);
    assert.equal(JSON.stringify(records).includes('provider-secret'), false);
    writeFileSync(
      join(repo, 'scripts/lib/operator-platform.mjs'),
      '// tampered',
    );
    const dirty = run(['pause', '--confirm', phrase]);
    assert.notEqual(dirty.status, 0);
    assert.equal(readFileSync(join(repo, 'ssh-count'), 'utf8'), 'xxx');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('local SSH gets OS settings only, not provider, DB, Auth or Node injection', () => {
  assert.deepEqual(
    transportEnvironment({
      PATH: '/bin',
      SystemRoot: 'C:/Windows',
      OPENAI_API_KEY: 'secret',
      DATABASE_URL: 'secret',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
      NODE_OPTIONS: '--require evil',
      SSH_AUTH_SOCK: '/agent',
    }),
    { PATH: '/bin', SystemRoot: 'C:/Windows' },
  );
});
