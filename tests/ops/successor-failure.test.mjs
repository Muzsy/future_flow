import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  clientPhases,
  serverFailure,
  serverPhases,
  successorFailureReport,
} from '../../scripts/lib/successor-failure.mjs';
import { successorModules } from '../../scripts/lib/beta-successor-release.mjs';

const secret = 'postgres://person:hunter2@private-host/db';
const modules = successorModules;
const hostFailure = (value) => JSON.stringify({ ok: false, failure: value });

test('the host failure is re-validated field by field and keeps only reviewed locations', () => {
  const parsed = serverFailure(
    hostFailure({
      version: 'alterward-successor-failure-1',
      phase: 'baseline',
      exceptions: [
        {
          type: 'ValueError',
          frames: [
            { module: 'alterward_beta_successor', line: 1055 },
            { module: 'alterward_funded_upgrade', line: 701 },
            { module: 'not_a_reviewed_module', line: 5 },
            { module: 'alterward_beta_successor', line: -3 },
            { module: 'alterward_beta_successor', line: 1.5 },
          ],
          message: secret,
          program: 'docker',
          exitCode: 3,
        },
        { type: 'Bad ' + secret, frames: 'x', program: secret, exitCode: 9999 },
        'not an object',
      ],
    }),
    modules,
  );
  assert.deepEqual(parsed, {
    phase: 'baseline',
    exceptions: [
      {
        type: 'ValueError',
        frames: [
          { source: 'scripts/ops/contabo-beta-successor.py', line: 1055 },
          { source: 'scripts/ops/contabo-funded-upgrade.py', line: 701 },
        ],
        program: 'docker',
        exitCode: 3,
      },
      { type: 'Exception', frames: [] },
    ],
  });
  assert.ok(!JSON.stringify(parsed).includes('hunter2'));
});

test('anything that is not the exact host report is dropped, never trusted', () => {
  for (const stdout of [
    '',
    'not json',
    '{"ok":false}',
    hostFailure(null),
    hostFailure({ version: 'other', phase: 'baseline', exceptions: [] }),
    hostFailure({
      version: 'alterward-successor-failure-1',
      phase: 'x',
      exceptions: 'no',
    }),
    undefined,
  ])
    assert.equal(serverFailure(stdout, modules), null);
  assert.equal(
    serverFailure(
      hostFailure({
        version: 'alterward-successor-failure-1',
        phase: secret,
        exceptions: [],
      }),
      modules,
    ).phase,
    'unknown',
  );
  for (const phase of serverPhases.filter((p) => p !== 'unknown'))
    assert.equal(
      serverFailure(
        hostFailure({
          version: 'alterward-successor-failure-1',
          phase,
          exceptions: [],
        }),
        modules,
      ).phase,
      phase,
    );
});

test('the client report carries a phase, error type and repository locations without any message', () => {
  const error = Object.assign(new Error(secret), { code: 255, signal: null });
  error.stack = `Error: ${secret}\n    at read (file:///home/person/work/scripts/contabo-beta-successor.mjs:312:7)\n    at other (/home/person/work/node_modules/x/index.js:1:1)\n    at f (/home/person/work/${secret}/scripts/lib/successor-failure.mjs:9:3)`;
  const report = successorFailureReport({
    mode: 'apply',
    phase: 'ssh',
    error,
    server: null,
  });
  assert.equal(report.mode, 'apply');
  assert.equal(report.phase, 'ssh');
  assert.equal(report.errorType, 'Error');
  assert.deepEqual(report.ssh, {
    exitCode: 255,
    signal: null,
    systemCode: null,
    killed: false,
  });
  assert.ok(
    report.frames.some(
      (f) =>
        f.source === 'scripts/contabo-beta-successor.mjs' && f.line === 312,
    ),
  );
  assert.ok(!JSON.stringify(report).includes('hunter2'));
  assert.ok(!JSON.stringify(report).includes('person'));
  const odd = successorFailureReport({
    mode: secret,
    phase: secret,
    error: Object.assign(new TypeError(secret), {
      name: secret,
      code: secret,
      signal: secret,
    }),
  });
  assert.deepEqual(
    [odd.mode, odd.phase, odd.errorType, odd.server],
    [null, 'start', 'Error', null],
  );
  assert.ok(!JSON.stringify(odd).includes('hunter2'));
  assert.ok(clientPhases.includes('ssh'));
});

test('a refusal before the host is reached carries no ssh block and a local phase', () => {
  const report = successorFailureReport({
    mode: 'apply',
    phase: 'receipts',
    error: new Error('Bounded private proof required'),
  });
  assert.equal(report.ssh, null);
  assert.equal(report.phase, 'receipts');
  assert.equal(JSON.stringify(report).includes('Bounded'), false);
});

test('the CLI loads the verified helper, localises both sides and names the same phases as the host', () => {
  const cli = readFileSync('scripts/contabo-beta-successor.mjs', 'utf8');
  // The helper is verified against the committed bytes before it is imported.
  assert.ok(
    cli.indexOf("'scripts/lib/successor-failure.mjs',") <
      cli.indexOf("import('./lib/successor-failure.mjs')"),
  );
  // The host prints the diagnostic of the reviewed module only, with the generic phase kept.
  assert.match(cli, /failure_diagnostic\(e\)/);
  assert.match(cli, /'ok':False,'phase':'beta-successor','failure':d/);
  for (const phase of clientPhases.filter(
    (p) => !['start', 'report'].includes(p),
  ))
    assert.ok(cli.includes(`failure.phase = '${phase}'`), phase);
  const hostPhases = execFileSync(
    'python3',
    [
      '-I',
      '-c',
      "import re,sys;t=open('scripts/ops/contabo-beta-successor.py').read();print(re.search(r'FAILURE_PHASES = \\(([^)]*)\\)',t,re.S).group(1))",
    ],
    { encoding: 'utf8' },
  );
  const declared = [...hostPhases.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    declared,
    serverPhases.filter((p) => p !== 'unknown'),
  );
});

test('the host wrapper prints the localisation, and a failing diagnostic never hides the refusal', () => {
  const cli = readFileSync('scripts/contabo-beta-successor.mjs', 'utf8');
  const code = cli.match(/const code = `([\s\S]*?)`;/)[1];
  const module = (source) => Buffer.from(source).toString('base64');
  const run = (diagnostic) =>
    spawnSync('python3', ['-I', '-c', code], {
      encoding: 'utf8',
      input: JSON.stringify({
        modules: [
          {
            name: 'alterward_activation',
            source: module(
              'INTERRUPTION_SIGNALS = []\ndef interrupted(*a): pass\n',
            ),
          },
          {
            name: 'alterward_beta_successor',
            source: module(
              diagnostic +
                "def main(request):\n    raise ValueError('hunter2')\n",
            ),
          },
        ],
        request: {},
      }),
    });
  const good = run(
    "def failure_diagnostic(e):\n    return {'version': 'alterward-successor-failure-1', 'phase': 'baseline', 'exceptions': [{'type': type(e).__name__, 'frames': []}]}\n",
  );
  assert.equal(good.status, 1);
  assert.deepEqual(JSON.parse(good.stdout), {
    ok: false,
    phase: 'beta-successor',
    failure: {
      version: 'alterward-successor-failure-1',
      phase: 'baseline',
      exceptions: [{ type: 'ValueError', frames: [] }],
    },
  });
  for (const broken of [
    "def failure_diagnostic(e):\n    raise RuntimeError('x')\n",
    '',
  ]) {
    const result = run(broken);
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stdout), {
      ok: false,
      phase: 'beta-successor',
      failure: null,
    });
    assert.ok(!result.stdout.includes('hunter2'));
  }
});
