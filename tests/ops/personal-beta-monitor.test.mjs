import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Exercise the actual production SQL helper, not a duplicated implementation.
const source = readFileSync('scripts/ops/contabo-daily.py', 'utf8');
const helper = source.match(/^PERSONAL_QUEUE_PROBE = r"""([\s\S]*?)"""/m)?.[1];
assert.ok(helper);
const { personalBetaQueueProbe } = await import(
  `data:text/javascript;base64,${Buffer.from(helper).toString('base64')}`
);
const user = '11111111-1111-4111-8111-111111111111';
const branch = '22222222-2222-4222-8222-222222222222';
const lease = '33333333-3333-4333-8333-333333333333';

test('read-only aggregate SQL accepts normal personal work and diagnoses stale, expired, revoked, Shared and orphan work', async () => {
  const db = new PGlite();
  await db.waitReady;
  try {
    await db.exec(`CREATE TABLE ff_users(id uuid PRIMARY KEY,status text);
      CREATE TABLE aw_branches(id uuid PRIMARY KEY,user_id uuid,status text);
      CREATE TABLE aw_jobs(user_id uuid,branch_id uuid,status text,created_at timestamptz,lease_token uuid,lease_until timestamptz);
      CREATE TABLE aw_public_draft_reviews(status text);`);
    for (const table of [
      'ff_jobs',
      'aw_shared_jobs',
      'aw_public_review_jobs',
      'aw_public_content_reviews',
      'aw_scenario_reviews',
    ])
      await db.exec(`CREATE TABLE ${table}(status text)`);
    await db.query("INSERT INTO ff_users VALUES($1,'active')", [user]);
    await db.query("INSERT INTO aw_branches VALUES($1,$2,'generating')", [
      branch,
      user,
    ]);
    await db.query(
      "INSERT INTO aw_jobs VALUES($1,$2,'queued',now(),NULL,NULL)",
      [user, branch],
    );
    const run = async (policy = { queueAllowed: true, userIds: [user] }) => {
      await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        return await personalBetaQueueProbe(db, policy);
      } finally {
        await db.exec('ROLLBACK');
      }
    };
    const result = await run();
    assert.equal(result.queueHealthy, true);
    assert.equal(result.pendingJobs, 1);
    assert.ok(!JSON.stringify(result).includes(user));
    assert.equal(
      (await run({ queueAllowed: false, userIds: [] })).queueHealthy,
      false,
    );
    await db.exec("UPDATE aw_jobs SET created_at=now()-interval '31 minutes'");
    assert.equal((await run()).stalePersonal, 1);
    assert.equal((await run()).queueHealthy, false);
    await db.query(
      "UPDATE aw_jobs SET created_at=now(),status='running',lease_token=$1,lease_until=now()+interval '3 minutes'",
      [lease],
    );
    assert.equal((await run()).queueHealthy, true);
    await db.exec("UPDATE aw_jobs SET lease_until=now()-interval '3 minutes'");
    assert.equal((await run()).expiredPersonal, 1);
    await db.exec(
      "UPDATE aw_jobs SET status='queued',lease_until=NULL,lease_token=NULL;UPDATE ff_users SET status='deleted'",
    );
    assert.equal((await run()).unadmittedPersonal, 1);
    await db.exec(
      "UPDATE ff_users SET status='active';INSERT INTO aw_shared_jobs VALUES('queued')",
    );
    assert.equal((await run()).unexpectedPending, 1);
    assert.equal((await run()).queueHealthy, false);
    await db.exec('DELETE FROM aw_shared_jobs;DELETE FROM aw_jobs');
    assert.equal((await run()).unexpectedPending, 1);
    await db.exec("UPDATE aw_branches SET status='ready'");
    assert.equal(
      (await run({ queueAllowed: false, userIds: [] })).queueHealthy,
      true,
    );
  } finally {
    await db.close();
  }
});

test('invalid admission metadata is refused before any database query', async () => {
  let calls = 0;
  const db = {
    query: async () => {
      calls++;
      throw Error('No query expected');
    },
  };
  for (const policy of [
    { queueAllowed: true, userIds: [user, user] },
    { queueAllowed: true, userIds: ['user@example.invalid'] },
    { queueAllowed: 'true', userIds: [] },
  ])
    await assert.rejects(personalBetaQueueProbe(db, policy));
  assert.equal(calls, 0);
});
