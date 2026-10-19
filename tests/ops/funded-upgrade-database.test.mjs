// Real PostgreSQL fixture for the N09 funded-runtime upgrade (Issue #34).
// A disposable, label-scoped container on 127.0.0.1 with synthetic data only:
// 001-037 -> funded ledger/jobs/periods -> the REAL scripts/migrate.ts adds 038
// -> funded state is compared -> pg_dump/pg_restore keeps narrative artifacts
// -> deletion replay still removes a deleted account. No provider, no network
// beyond loopback, no live database, no production credential.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  observeFundedState,
  runtimeCapability,
  migrationChecksum,
  digest,
} from '../../scripts/lib/funded-upgrade-observation.mjs';

const root = resolve(import.meta.dirname, '../..');
const image =
  'postgres@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826';
const require = createRequire(join(root, 'packages/database/package.json'));
const { Client } = require('pg');
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8', timeout: 120000 }).trim();
const available =
  spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 20000 }).status ===
  0;
const migrationsDir = join(root, 'database/migrations');
const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => ({
    name,
    text: readFileSync(join(migrationsDir, name), 'utf8'),
  }));
const NARRATIVE = '038_narrative_artifacts.sql';

async function connect(url) {
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

async function snapshot(url) {
  const client = await connect(url);
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const value = await observeFundedState(client);
    await client.query('COMMIT');
    return value;
  } finally {
    await client.end();
  }
}

// Same transaction and checksum contract as scripts/migrate.ts, but stopping
// before 038 to reproduce the active funded (pre-038) production schema.
async function migrateBefore(url, stop) {
  const client = await connect(url);
  try {
    await client.query('BEGIN');
    await client.query(
      'CREATE TABLE IF NOT EXISTS ff_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const { name, text } of files) {
      if (name >= stop) break;
      await client.query(text.replace(/\r\n/g, '\n'));
      await client.query(
        'INSERT INTO ff_migrations(name,checksum) VALUES($1,$2)',
        [name, migrationChecksum(text)],
      );
    }
    await client.query('COMMIT');
  } finally {
    await client.end();
  }
}

function python(script, input) {
  return JSON.parse(
    execFileSync('python3', ['-I', '-c', script], {
      input: JSON.stringify(input),
      encoding: 'utf8',
      env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: '1' },
    }),
  );
}

const POLICY = `
import importlib.util,json,sys
spec=importlib.util.spec_from_file_location('p','${join(root, 'scripts/ops/contabo-funded-upgrade-policy.py')}')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
v=json.load(sys.stdin);out={}
def attempt(name,fn):
  try:fn();out[name]=True
  except p.UpgradeRefused:out[name]=False
for k in v.get('drain',{}):attempt('drain:'+k,lambda k=k:p.drain_decision(v['drain'][k]))
if 'before' in v:
  attempt('preserved',lambda:p.require_preserved(v['before'],v['after']))
  cap={**v['capability'],'imageId':'sha256:'+'b'*64}
  attempt('schemaPlan',lambda:p.expected_schema_transition(v['before'],cap))
  attempt('schema',lambda:p.require_schema(v['after'],cap))
  attempt('covers',lambda:p.capability_covers(cap,v['after']))
  for k,r in v.get('recovery',{}).items():
    attempt('recovery:'+k,lambda r=r:p.validate_recovery_target({**r,'imageId':'sha256:'+'c'*64},target=cap,observation=v['after'],reviewed_images={'sha256:'+'c'*64}))
print(json.dumps(out))
`;

test(
  'funded state survives 038, restore and deletion replay in real PostgreSQL',
  {
    skip:
      !available &&
      !process.env.FUNDED_FIXTURE_REQUIRED &&
      'Docker is required',
    timeout: 300000,
  },
  async () => {
    assert.ok(available, 'CI requires the real PostgreSQL fixture');
    const name = 'alterward-funded-fixture-' + randomBytes(6).toString('hex');
    const password = 'fixture_' + randomBytes(12).toString('hex');
    docker(
      'run',
      '-d',
      '--rm',
      '--name',
      name,
      '--label',
      'com.alterward.funded-upgrade-fixture=true',
      '-e',
      'POSTGRES_PASSWORD=' + password,
      '-p',
      '127.0.0.1::5432',
      image,
    );
    try {
      for (let i = 0; ; i++) {
        const ready = spawnSync('docker', [
          'exec',
          name,
          'pg_isready',
          '-U',
          'postgres',
          '-h',
          '127.0.0.1',
        ]);
        if (ready.status === 0) break;
        if (i > 120) throw Error('PostgreSQL fixture did not start');
        await new Promise((r) => setTimeout(r, 500));
      }
      const port = docker('port', name, '5432/tcp').split(':').at(-1);
      const base = `postgresql://postgres:${password}@127.0.0.1:${port}`;
      const url = base + '/postgres';
      const psql = (database, sql) =>
        docker(
          'exec',
          name,
          'psql',
          '-U',
          'postgres',
          '-d',
          database,
          '-v',
          'ON_ERROR_STOP=1',
          '-qAtc',
          sql,
        );
      psql(
        'postgres',
        'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;',
      );
      await migrateBefore(url, NARRATIVE);

      const contracts = await import(
        pathToFileURL(require.resolve('@future-flow/contracts')).href
      );
      const [kept, deleted] = [randomUUID(), randomUUID()];
      const window = 'window:2026-10-13T10:00:00Z:2026-11-12T10:00:00Z';
      const client = await connect(url);
      const lives = {};
      try {
        await client.query('BEGIN');
        for (const user of [kept, deleted]) {
          await client.query('INSERT INTO ff_users(id) VALUES($1)', [user]);
          const life = randomUUID(),
            branch = randomUUID();
          lives[user] = { life, branch };
          await client.query(
            "INSERT INTO aw_lives(id,user_id,title,content_locale,input,root_branch_id) VALUES($1,$2,'Synthetic','en','{}',$3)",
            [life, user, branch],
          );
          await client.query(
            "INSERT INTO aw_branches(id,user_id,life_id,name,state) VALUES($1,$2,$3,'main','{}')",
            [branch, user, life],
          );
          await client.query(
            "INSERT INTO aw_periods(id,user_id,life_id,branch_id,period_no,base_revision,candidate,events,start_state,end_state,accepted_before,chapter,canon_hash) VALUES($1,$2,$3,$4,1,0,'{}','[]','{}','{}','[]','{\"title\":\"Legacy chapter\"}','legacy')",
            [randomUUID(), user, life, branch],
          );
        }
        await client.query(
          'INSERT INTO aw_budget_accounts(id,limit_micro,accounted_micro) VALUES($1,10000000,1234567)',
          ['project:' + window],
        );
        await client.query(
          'INSERT INTO aw_budget_accounts(id,user_id,limit_micro,accounted_micro) VALUES($1,$2,3340000,1234567)',
          ['user:' + kept + ':' + window, kept],
        );
        for (const [status, accounted] of [
          ['completed', 1000000],
          ['completed', 34567],
          ['unknown', 200000],
        ])
          await client.query(
            "INSERT INTO aw_budget_reservations(id,user_id,project_key,user_key,job_id,model,task,reserved_micro,accounted_micro,status,settled_at) VALUES($1,$2,$3,$4,$5,'gpt-6.1-sol','story',$6,$6,$7,now())",
            [
              randomUUID(),
              kept,
              'project:' + window,
              'user:' + kept + ':' + window,
              randomUUID(),
              accounted,
              status,
            ],
          );
        // Frozen narrative policies from several generations, all terminal.
        const frozen = [
          ['completed', contracts.fictionV1Policy(), null],
          [
            'completed',
            contracts.fictionV3Policy(),
            contracts.fictionV3Policy(),
          ],
          ['failed', contracts.fictionV7Policy(), contracts.fictionV7Policy()],
          ['cancelled', contracts.narrativeV1Policy(), null],
          ['completed', contracts.contextNarrativePolicy(), null],
        ];
        for (const [status, policy, checkpoint] of frozen)
          await client.query(
            'INSERT INTO aw_jobs(id,user_id,life_id,branch_id,base_revision,status,payload,checkpoints) VALUES($1,$2,$3,$4,0,$5,$6,$7)',
            [
              randomUUID(),
              kept,
              lives[kept].life,
              lives[kept].branch,
              status,
              { narrativeContext: { policy } },
              checkpoint ? { policy: checkpoint } : {},
            ],
          );
        await client.query('COMMIT');
      } finally {
        await client.end();
      }

      const before = await snapshot(url);
      assert.equal(before.schema.narrativeArtifactColumn, false);
      assert.equal(before.schema.migrations.length, files.length - 1);
      assert.equal(before.ledger.accountCount, 2);
      assert.equal(before.ledger.accountedMicroTotal, '2469134');
      assert.deepEqual(before.ledger.reservations.unknown, {
        count: 1,
        reservedMicro: '200000',
        accountedMicro: '200000',
      });
      assert.equal(before.policies.length, 5);
      assert.equal(before.queue.pendingJobs, 0);
      assert.doesNotMatch(JSON.stringify(before), new RegExp(kept));

      // Flag-off is never a drain: queued work, a lease and an open
      // reservation are each visible to the probe (inside a rolled-back txn).
      const drain = {};
      for (const [label, sql] of [
        [
          'queued',
          "INSERT INTO aw_jobs(id,user_id,life_id,branch_id,base_revision,status,payload) VALUES(gen_random_uuid(),$1,$2,$3,0,'queued','{}')",
        ],
        [
          'leased',
          "INSERT INTO aw_jobs(id,user_id,life_id,branch_id,base_revision,status,payload,lease_token,lease_until) VALUES(gen_random_uuid(),$1,$2,$3,0,'completed','{}',gen_random_uuid(),now())",
        ],
        [
          'reserved',
          "INSERT INTO aw_budget_reservations(id,user_id,project_key,job_id,model,task,reserved_micro,accounted_micro,status) VALUES(gen_random_uuid(),$1,'project:" +
            window +
            "',gen_random_uuid(),'gpt-6.1-sol','story',5000,0,'reserved') RETURNING $2::uuid,$3::uuid",
        ],
      ]) {
        const c = await connect(url);
        try {
          await c.query('BEGIN');
          await c.query(sql, [kept, lives[kept].life, lives[kept].branch]);
          drain[label] = await observeFundedState(c);
        } finally {
          await c.query('ROLLBACK');
          await c.end();
        }
      }
      drain.clean = before;

      // The reviewed checksum runner adds exactly 038.
      const output = execFileSync(
        join(root, 'node_modules/.bin/tsx'),
        [join(root, 'scripts/migrate.ts')],
        {
          cwd: root,
          encoding: 'utf8',
          env: { PATH: process.env.PATH, DATABASE_URL: url },
        },
      );
      assert.equal(output.trim(), 'Applied ' + NARRATIVE);
      const after = await snapshot(url);
      assert.equal(after.schema.narrativeArtifactColumn, true);
      assert.equal(after.artifacts.legacyNull, 2);

      const capability = runtimeCapability(contracts, inventory(after), files);
      assert.deepEqual(capability.migrations, after.schema.migrations);
      assert.equal(capability.rejected.length, 0);
      const pre038 = runtimeCapability(
        contracts,
        inventory(after),
        files.filter((f) => f.name !== NARRATIVE),
      );
      // An image that only knows the first fiction generation.
      const v1Only = runtimeCapability(
        {
          ...contracts,
          fictionPolicySchema: {
            safeParse: (p) => ({
              success: p?.promptVersions?.writer === 'life_fiction_author.v1',
            }),
          },
        },
        inventory(after),
        files,
      );
      const verdict = python(POLICY, {
        drain,
        before,
        after,
        capability,
        recovery: { compatible: capability, pre038, v1Only },
      });
      assert.deepEqual(verdict, {
        'drain:queued': false,
        'drain:leased': false,
        'drain:reserved': false,
        'drain:clean': true,
        preserved: true,
        schemaPlan: true,
        schema: true,
        covers: true,
        'recovery:compatible': true,
        'recovery:pre038': false,
        'recovery:v1Only': false,
      });

      // New narrative artifact for the account that will be deleted, then a
      // real dump/restore into an isolated database.
      const writer = await connect(url);
      try {
        await writer.query(
          "INSERT INTO aw_periods(id,user_id,life_id,branch_id,period_no,base_revision,candidate,events,start_state,end_state,accepted_before,chapter,canon_hash,narrative_artifact) VALUES($1,$2,$3,$4,2,1,'{}','[]','{}','{}','[]','{}','fiction',$5)",
          [
            randomUUID(),
            deleted,
            lives[deleted].life,
            lives[deleted].branch,
            {
              pipelineVersion: 'narrative-fiction-v2',
              policy: contracts.fictionV7Policy(),
            },
          ],
        );
      } finally {
        await writer.end();
      }
      const source = await snapshot(url);
      assert.equal(source.artifacts.stored, 1);
      docker(
        'exec',
        name,
        'sh',
        '-c',
        'pg_dump -U postgres -Fc postgres > /tmp/fixture.dump && createdb -U postgres restored && pg_restore -U postgres --single-transaction --exit-on-error -d restored /tmp/fixture.dump && rm /tmp/fixture.dump',
      );
      const restored = await snapshot(base + '/restored');
      assert.deepEqual(restored, source);
      assert.equal(
        psql(
          'restored',
          "SELECT chapter->>'title' FROM aw_periods WHERE narrative_artifact IS NULL ORDER BY user_id LIMIT 1",
        ),
        'Legacy chapter',
      );
      // Deletion replay after restore still removes the deleted account's artifact.
      psql('restored', `DELETE FROM ff_users WHERE id='${deleted}'`);
      const replayed = await snapshot(base + '/restored');
      assert.equal(replayed.artifacts.stored, 0);
      assert.equal(replayed.accounts.userCount, 1);
      assert.equal(
        replayed.ledger.accountsSha256,
        source.ledger.accountsSha256,
      );
      assert.notEqual(digest(replayed.artifacts), digest(source.artifacts));
    } finally {
      spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
    }
  },
);

function inventory(observation) {
  return observation.policies.map((item) => item.policy);
}
