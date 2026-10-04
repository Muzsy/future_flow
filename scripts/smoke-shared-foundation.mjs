import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

// This fixture only runs inside the ephemeral, egress-disabled CI PostgreSQL
// network. It never creates AI jobs, uses live credentials, or exposes a UI.
assert.equal(process.platform, 'linux');
assert.equal(process.env.CI, 'true');
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.AI_PROJECT_BUDGET_USD, '0');
assert.equal(process.env.AI_USER_BUDGET_USD, '0');
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, 'postgres');
assert.equal(url.username, 'postgres');
assert.equal(url.password, 'ci_unused_outside_fixture');
const require = createRequire(import.meta.url);
const {
  connectDatabase,
  Repository,
  SharedContextRepository,
} = require('@future-flow/database');
const raw = connectDatabase(process.env.DATABASE_URL, true);
const db = {
  query: (...args) => raw.query(...args),
  transaction: (run) =>
    raw.transaction(async (tx) => {
      await tx.query("SET LOCAL lock_timeout='10s'");
      await tx.query("SET LOCAL statement_timeout='15s'");
      return run(tx);
    }),
};
const repo = new Repository(db),
  shared = new SharedContextRepository(db, '1'.repeat(64));
async function person(tier = 'explorer') {
  const id = randomUUID(),
    lifeId = randomUUID(),
    branchId = randomUUID();
  await repo.ensureUser(id);
  await repo.acceptPrivacy(id);
  await db.query(
    "INSERT INTO aw_user_entitlements(user_id,tier,source) VALUES($1,$2,'isolated-ci')",
    [id, tier],
  );
  await shared.saveSocialProfile(id, {
    handle: 'ci_' + id.replaceAll('-', '').slice(0, 12),
    displayName: 'Synthetic CI alias',
    discoverability: 'private',
  });
  // Minimal database-only branch fixture, not a generated or published story.
  await db.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO aw_lives(id,user_id,title,content_locale,input,root_branch_id) VALUES($1,$2,'CI fixture','en','{}',$3)",
      [lifeId, id, branchId],
    );
    await tx.query(
      'INSERT INTO aw_branches(id,user_id,life_id,name,state) VALUES($1,$2,$3,\'CI fixture\',\'{"effectiveAt":"2026-10-04"}\')',
      [branchId, id, lifeId],
    );
  });
  return { id, lifeId, branchId, revision: 0 };
}
const group = (p) =>
  shared.create(
    p.id,
    {
      type: 'friend_group',
      title: 'Synthetic CI group',
      branchId: p.branchId,
      revision: 0,
      sharingAcknowledged: true,
    },
    randomUUID(),
  );
async function invite(p, id) {
  const c = await shared.detail(p.id, id);
  return shared.createInvite(
    p.id,
    id,
    { contextRevision: c.revision },
    randomUUID(),
  );
}
const accept = (p, i, revision = i.revision) =>
  shared.acceptInvite(
    p.id,
    i.inviteId,
    {
      token: i.token,
      branchId: p.branchId,
      revision: 0,
      contextRevision: revision,
      sharingAcknowledged: true,
    },
    randomUUID(),
  );
function winner(results, code) {
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, code);
}
try {
  assert.equal(
    (
      await db.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')
    )[0].ssl,
    true,
  );
  assert.equal(
    (await db.query('SELECT count(*)::int AS count FROM ff_users'))[0].count,
    0,
  );
  const a = await person(),
    b = await person(),
    guest = await person();
  const ca = await group(a),
    cb = await group(b),
    ia = await invite(a, ca.contextId),
    ib = await invite(b, cb.contextId);
  winner(
    await Promise.allSettled([accept(guest, ia), accept(guest, ib)]),
    'SHARED_CONTEXT_LIMIT',
  );
  assert.equal((await shared.list(guest.id)).length, 1);

  const owner = await person(),
    c = await group(owner);
  for (let n = 0; n < 8; n++)
    await accept(await person(), await invite(owner, c.contextId));
  const first = await person(),
    second = await person(),
    i1 = await invite(owner, c.contextId),
    i2 = await invite(owner, c.contextId);
  const revision = i2.revision;
  const caps = await Promise.allSettled([
    accept(first, i1, revision),
    accept(second, i2, revision),
  ]);
  winner(caps, 'SHARED_REVISION_CONFLICT');
  const latest = await shared.detail(owner.id, c.contextId);
  assert.equal(latest.members.length, 10);
  const loser = caps[0].status === 'rejected' ? [first, i1] : [second, i2];
  await assert.rejects(() => accept(loser[0], loser[1], latest.revision), {
    code: 'SHARED_CONTEXT_FULL',
  });

  // Five shared contexts overlap at the same World member. Accept races and
  // account cleanup must acquire user/context locks in a consistent order.
  const world = await person('world'),
    owners = [],
    contexts = [],
    invites = [];
  for (let n = 0; n < 6; n++) {
    const p = await person(),
      ctx = await group(p),
      i = await invite(p, ctx.contextId);
    owners.push(p);
    contexts.push(ctx.contextId);
    invites.push(i);
    if (n < 4) await accept(world, i);
  }
  winner(
    await Promise.allSettled([
      accept(world, invites[4]),
      accept(world, invites[5]),
    ]),
    'SHARED_CONTEXT_LIMIT',
  );
  assert.equal((await shared.list(world.id)).length, 5);
  const joined = (await shared.list(world.id)).map((c) => c.id);
  // Simultaneous deletions touch overlapping aggregates, one touching five.
  await Promise.all(
    [world.id, owners[0].id].map(async (id) => {
      await repo.markDeleting(id);
      await repo.deleteAccountData(id);
    }),
  );
  for (const id of joined) {
    const [row] = await db.query(
      'SELECT count(*)::int AS count FROM aw_shared_members WHERE context_id=$1 AND user_id=$2',
      [id, world.id],
    );
    assert.equal(row.count, 0);
    assert.equal(
      (await db.query('SELECT id FROM aw_shared_contexts WHERE id=$1', [id]))
        .length,
      1,
    );
  }
  const [queues] = await db.query(
    'SELECT (SELECT count(*) FROM ff_jobs)::int AS v1,(SELECT count(*) FROM aw_jobs)::int AS v2,(SELECT count(*) FROM aw_shared_jobs)::int AS shared',
  );
  assert.deepEqual(queues, { v1: 0, v2: 0, shared: 0 });
  console.log(
    JSON.stringify({
      sharedFoundationPostgres: 'passed',
      lastExplorerSlotRace: true,
      lastWorldSlotRace: true,
      lastMemberRace: true,
      overlappingFiveContextDeletion: true,
      verifiedDatabaseTls: true,
      paidAiCalls: 0,
    }),
  );
} finally {
  await raw.close();
}
