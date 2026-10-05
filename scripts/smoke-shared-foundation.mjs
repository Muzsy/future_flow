import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

// This fixture only runs inside the ephemeral, egress-disabled CI PostgreSQL
// network. Shared jobs use explicit synthetic output; no provider call, live credentials or UI.
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
  SharedEventRepository,
  SharedJobRepository,
  SharedSafetyRepository,
  LifeRepository,
  LifeJobRepository,
  PublicReviewRepository,
  PublicReviewJobRepository,
  PublicCurationRepository,
  ScenarioRepository,
  buildLifeInput,
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
  shared = new SharedContextRepository(db, '1'.repeat(64)),
  events = new SharedEventRepository(db, '1'.repeat(64));
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
  // Valid synthetic private input, never a generated or published story.
  const input = buildLifeInput(
    {
      locale: 'en',
      identity: { mode: 'alternate', label: null, ageBand: '35_44' },
      location: { country: 'GB', region: null, housing: null },
      employment: { status: null, employerLabel: null, workDomain: null },
      finance: { currency: null, monthlyIncome: null, liquidFunds: null },
      skills: [],
      relationships: [],
      resources: { energy: null, availableHoursPerWeek: null },
      goal: {
        category: 'personal_growth',
        description: 'A synthetic private CI goal',
        horizonMonths: 24,
        motivation: null,
        acceptableTradeoffs: [],
        unacceptableTradeoffs: [],
      },
      stayInCountry: false,
      context: null,
    },
    '2026-10-04',
  );
  input.lifeId = lifeId;
  input.branchId = branchId;
  await db.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO aw_lives(id,user_id,title,content_locale,input,root_branch_id) VALUES($1,$2,'CI fixture','en',$4,$3)",
      [lifeId, id, branchId, JSON.stringify(input)],
    );
    await tx.query(
      "INSERT INTO aw_branches(id,user_id,life_id,name,state) VALUES($1,$2,$3,'CI fixture',$4)",
      [branchId, id, lifeId, JSON.stringify(input.initialState)],
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
async function testEvent(userId, contextId) {
  const context = await shared.detail(userId, contextId);
  const yes = randomUUID(),
    no = randomUUID();
  const candidate = {
    schemaVersion: '1.0.0',
    eventId: randomUUID(),
    contextId,
    baseRevision: context.revision,
    effectiveAt: context.simulationAt,
    title: 'Isolated CI invitation',
    summary: 'Members consider an optional shared activity.',
    participantMemberIds: context.members
      .filter((m) => m.status === 'active')
      .map((m) => m.id),
    sharedChanges: [],
    decision: {
      id: randomUUID(),
      prompt: 'Would you like to join?',
      policy: { type: 'individual_opt_in' },
      eligibleMemberIds: context.members
        .filter((m) => m.status === 'active')
        .map((m) => m.id),
      deadlineSeconds: 172800,
      options: [
        {
          id: yes,
          label: 'Join',
          description: 'Participate voluntarily.',
          sharedChanges: [],
          impactProposals: [],
        },
        {
          id: no,
          label: 'Decline',
          description: 'Keep your own plans.',
          sharedChanges: [],
          impactProposals: [],
        },
      ],
    },
  };
  const committed = await events.commitCandidate(
    userId,
    contextId,
    candidate,
    randomUUID(),
    { deadlineSeconds: 172800, participatingOptionIds: [yes], quorum: null },
  );
  return { ...committed, yes };
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
  // Real PostgreSQL connections: ten simultaneous member intents retry only a
  // stale revision. The immutable resolution and ten pending effects occur once.
  const participantRows = await db.query(
    "SELECT user_id,branch_id FROM aw_shared_members WHERE context_id=$1 AND status='active' ORDER BY id",
    [c.contextId],
  );
  const branchesBefore = await db.query(
    'SELECT id,state,revision FROM aw_branches WHERE id=ANY($1::uuid[]) ORDER BY id',
    [participantRows.map((p) => p.branch_id)],
  );
  const event = await testEvent(owner.id, c.contextId);
  const sameRevision = await Promise.allSettled(
    participantRows
      .slice(0, 2)
      .map((p) =>
        events.submitIntent(
          p.user_id,
          c.contextId,
          event.eventId,
          { contextRevision: event.revision, optionId: event.yes },
          randomUUID(),
        ),
      ),
  );
  winner(sameRevision, 'SHARED_REVISION_CONFLICT');
  await Promise.all(
    participantRows.map(async (p) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const current = await shared.detail(p.user_id, c.contextId);
        const own = await db.query(
          'SELECT i.id FROM aw_shared_intents i JOIN aw_shared_members m ON m.id=i.member_id WHERE i.event_id=$1 AND m.user_id=$2',
          [event.eventId, p.user_id],
        );
        if (own.length) return;
        try {
          await events.submitIntent(
            p.user_id,
            c.contextId,
            event.eventId,
            { contextRevision: current.revision, optionId: event.yes },
            randomUUID(),
          );
          return;
        } catch (error) {
          if (error.code !== 'SHARED_REVISION_CONFLICT') throw error;
        }
      }
      throw Error('Concurrent intent did not make progress');
    }),
  );
  assert.equal(
    (
      await db.query('SELECT id FROM aw_shared_intents WHERE event_id=$1', [
        event.eventId,
      ])
    ).length,
    10,
  );
  assert.equal(
    (
      await db.query('SELECT id FROM aw_shared_resolutions WHERE event_id=$1', [
        event.eventId,
      ])
    ).length,
    1,
  );
  assert.equal(
    (
      await db.query('SELECT id FROM aw_shared_impacts WHERE event_id=$1', [
        event.eventId,
      ])
    ).length,
    10,
  );
  const finished = await shared.detail(owner.id, c.contextId);
  await Promise.all(
    participantRows
      .slice(0, 2)
      .map((p) =>
        events.resolvePending(
          p.user_id,
          c.contextId,
          event.eventId,
          finished.revision,
          randomUUID(),
        ),
      ),
  );
  assert.equal(
    (
      await db.query('SELECT id FROM aw_shared_resolutions WHERE event_id=$1', [
        event.eventId,
      ])
    ).length,
    1,
  );
  assert.deepEqual(
    await db.query(
      'SELECT id,state,revision FROM aw_branches WHERE id=ANY($1::uuid[]) ORDER BY id',
      [participantRows.map((p) => p.branch_id)],
    ),
    branchesBefore,
  );

  const sharedJobs = new SharedJobRepository(db, undefined, 180, 172800);
  const enqueues = await Promise.allSettled(
    [0, 1].map(() =>
      sharedJobs.enqueue(
        owner.id,
        c.contextId,
        finished.revision,
        randomUUID(),
      ),
    ),
  );
  winner(enqueues, 'SHARED_REVISION_CONFLICT');
  const claims = await Promise.all([sharedJobs.claim(), sharedJobs.claim()]);
  assert.equal(claims.filter(Boolean).length, 1);
  const claimed = claims.find(Boolean),
    input = claimed.payload;
  const proposal = {
    schemaVersion: '1.0.0',
    eventId: input.eventId,
    contextId: input.context.id,
    baseRevision: input.context.revision,
    effectiveAt: input.context.simulationAt,
    title: 'Isolated S2 opportunity',
    summary: 'Members consider another optional shared activity.',
    participantMemberIds: input.members.map((m) => m.memberId),
    sharedChanges: [],
    decision: {
      id: input.decision.id,
      prompt: 'Would you like to join?',
      policy: { type: 'individual_opt_in' },
      eligibleMemberIds: input.members.map((m) => m.memberId),
      deadlineSeconds: input.decision.rules.deadlineSeconds,
      options: [
        {
          id: input.decision.participationOptionId,
          label: 'Join',
          description: 'Participate voluntarily.',
          sharedChanges: [],
          impactProposals: [],
        },
        {
          id: input.decision.optOutOptionId,
          label: 'Decline',
          description: 'Keep your own plans.',
          sharedChanges: [],
          impactProposals: [],
        },
      ],
    },
  };
  await sharedJobs.checkpoint(claimed, 'OUTPUT_RETURNED', {
    candidate: proposal,
    initialCallStarted: true,
  });
  await db.query(
    "UPDATE aw_shared_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",
    [claimed.id],
  );
  await assert.rejects(
    () => sharedJobs.complete(claimed, proposal),
    (e) => e.code === 'JOB_LEASE_LOST',
  );
  const reclaimed = await sharedJobs.claim();
  assert.notEqual(reclaimed.lease_token, claimed.lease_token);
  assert.equal(reclaimed.attempt, 2);
  await sharedJobs.complete(reclaimed, reclaimed.checkpoints.candidate);
  await assert.rejects(
    () => sharedJobs.complete(reclaimed, proposal),
    (e) => e.code === 'JOB_LEASE_LOST',
  );
  assert.equal(
    (
      await db.query('SELECT id FROM aw_shared_events WHERE id=$1', [
        input.eventId,
      ])
    ).length,
    1,
  );
  assert.deepEqual(
    await db.query(
      'SELECT id,state,revision FROM aw_branches WHERE id=ANY($1::uuid[]) ORDER BY id',
      [participantRows.map((p) => p.branch_id)],
    ),
    branchesBefore,
  );

  // 011: deleting a former member preserves a newer job for the remaining pair.
  for (const running of [false, true]) {
    const trio = await Promise.all([
      person('world'),
      person('world'),
      person('world'),
    ]);
    const own = trio[0],
      cid = (await group(own)).contextId;
    for (const p of trio.slice(1)) {
      const i = await invite(own, cid);
      await shared.acceptInvite(
        p.id,
        i.inviteId,
        {
          token: i.token,
          branchId: p.branchId,
          revision: 0,
          contextRevision: i.revision,
          sharingAcknowledged: true,
        },
        randomUUID(),
      );
    }
    let d = await shared.detail(own.id, cid);
    const first = await sharedJobs.enqueue(
        own.id,
        cid,
        d.revision,
        randomUUID(),
      ),
      old = await sharedJobs.claim();
    assert.equal(old.id, first.jobId);
    await sharedJobs.fail(old, new Error('Synthetic rejected output'));
    d = await shared.detail(own.id, cid);
    await shared.lifecycle(trio[2].id, cid, d.revision, 'leave', randomUUID());
    d = await shared.detail(own.id, cid);
    const next = await sharedJobs.enqueue(
      own.id,
      cid,
      d.revision,
      randomUUID(),
    );
    let lease = running ? await sharedJobs.claim() : null;
    const before = await db.query(
      'SELECT revision,status FROM aw_shared_contexts WHERE id=$1',
      [cid],
    );
    const beforeJob = await db.query(
      'SELECT status,payload,checkpoints,lease_token FROM aw_shared_jobs WHERE id=$1',
      [next.jobId],
    );
    await repo.markDeleting(trio[2].id);
    await repo.deleteAccountData(trio[2].id);
    assert.deepEqual(
      await db.query(
        'SELECT revision,status FROM aw_shared_contexts WHERE id=$1',
        [cid],
      ),
      before,
    );
    assert.deepEqual(
      await db.query(
        'SELECT status,payload,checkpoints,lease_token FROM aw_shared_jobs WHERE id=$1',
        [next.jobId],
      ),
      beforeJob,
    );
    assert.deepEqual(
      await db.query(
        'SELECT payload,checkpoints FROM aw_shared_jobs WHERE id=$1',
        [first.jobId],
      ),
      [{ payload: {}, checkpoints: {} }],
    );
    lease ??= await sharedJobs.claim();
    assert.equal(lease.id, next.jobId);
    await sharedJobs.verify(lease);
    await sharedJobs.fail(lease, new Error('Synthetic verification complete'));
    for (const p of trio.slice(0, 2)) {
      await repo.markDeleting(p.id);
      await repo.deleteAccountData(p.id);
    }
  }

  // S3 safety: actual PostgreSQL lock race, lease cancellation and private reports.
  const sa = await person('world'),
    sb = await person('world'),
    sc = (await group(sa)).contextId;
  const si = await invite(sa, sc);
  await shared.acceptInvite(
    sb.id,
    si.inviteId,
    {
      token: si.token,
      branchId: sb.branchId,
      revision: 0,
      contextRevision: si.revision,
      sharingAcknowledged: true,
    },
    randomUUID(),
  );
  const safety = new SharedSafetyRepository(db),
    sd = await shared.detail(sa.id, sc);
  const sr = await safety.report(
    sa.id,
    sc,
    { targetType: 'context', reason: 'privacy', details: 'Isolated CI report' },
    randomUUID(),
  );
  const sj = await sharedJobs.enqueue(sa.id, sc, sd.revision, randomUUID()),
    sl = await sharedJobs.claim();
  assert.equal(sl.id, sj.jobId);
  const ownIds = await db.query(
    'SELECT id,user_id FROM aw_shared_members WHERE context_id=$1',
    [sc],
  );
  winner(
    await Promise.allSettled(
      [sa, sb].map((p) =>
        safety.setBlock(
          p.id,
          sc,
          {
            contextRevision: sj.revision,
            memberId: ownIds.find((m) => m.user_id !== p.id).id,
          },
          true,
          randomUUID(),
        ),
      ),
    ),
    'SHARED_REVISION_CONFLICT',
  );
  assert.equal((await sharedJobs.job(sa.id, sj.jobId)).status, 'cancelled');
  await assert.rejects(() => sharedJobs.verify(sl));
  assert.equal((await safety.safety(sb.id, sc)).reports.length, 0);
  const held = await safety.moderate(sc, {
    actionId: randomUUID(),
    contextRevision: (await shared.detail(sa.id, sc)).revision,
    action: 'hold',
    actorLabel: 'isolated-ci',
    reason: 'Synthetic review',
    reportId: sr.reportId,
  });
  assert.equal(
    (await new SharedSafetyRepository(db).detail(sb.id, sc)).moderationHold,
    true,
  );
  await assert.rejects(
    () => sharedJobs.enqueue(sb.id, sc, held.revision, randomUUID()),
    (e) => e.code === 'SHARED_MODERATION_HOLD',
  );
  await repo.markDeleting(sa.id);
  await repo.deleteAccountData(sa.id);
  assert.equal(
    (
      await db.query(
        'SELECT id FROM aw_shared_reports WHERE reporter_user_id=$1',
        [sa.id],
      )
    ).length,
    0,
  );
  assert.equal(
    (
      await db.query(
        'SELECT report_id FROM aw_shared_moderation_audit WHERE context_id=$1',
        [sc],
      )
    )[0].report_id,
    null,
  );
  await repo.markDeleting(sb.id);
  await repo.deleteAccountData(sb.id);

  // S3 deliberately changes only the requesting personal branch. Earlier S0/S1/S2
  // no-personal-write assertions above remain scoped to their separate fixtures.
  const personal = new LifeRepository(db),
    personalJobs = new LifeJobRepository(db);
  async function personalPeriod(p) {
    const branch = await personal.branch(p.id, p.branchId);
    const q = await personal.continue(
      p.id,
      p.branchId,
      branch.revision,
      randomUUID(),
    );
    const j = await personalJobs.claim();
    assert.equal(j.id, q.jobId);
    const event = {
      id: randomUUID(),
      title: 'Synthetic private reflection',
      summary: 'A test-only canonical personal reflection.',
      effectiveAt: j.payload.endDate,
      actorIds: [],
      preconditions: [],
      changes: [],
      decision: {
        id: randomUUID(),
        prompt: 'Which synthetic path?',
        options: [
          {
            id: randomUUID(),
            label: 'First path',
            description: 'Synthetic alternative one.',
            preconditions: [],
            changes: [],
          },
          {
            id: randomUUID(),
            label: 'Second path',
            description: 'Synthetic alternative two.',
            preconditions: [],
            changes: [],
          },
        ],
      },
    };
    const candidate = {
      schemaVersion: '2.0.0',
      periodId: j.payload.periodId,
      branchId: p.branchId,
      baseRevision: j.base_revision,
      startDate: j.payload.startDate,
      endDate: j.payload.endDate,
      durationMonths: 6,
      title: 'Synthetic CI period',
      events: [{ ...event, id: randomUUID(), decision: null }, event],
    };
    await personalJobs.complete(
      j,
      candidate,
      {
        title: 'Synthetic CI chapter',
        body: Array.from({ length: 300 }, (_, i) => 'fixture' + i).join(' '),
        eventIds: candidate.events.map((e) => e.id),
        decisionId: event.decision.id,
      },
      [],
    );
    return j;
  }
  async function ownChoice(p, branch, key = randomUUID()) {
    return personal.choose(
      p.id,
      p.branchId,
      branch.revision,
      branch.pending_decision.id,
      branch.pending_decision.options[0].id,
      key,
    );
  }
  const pa = await person('world'),
    pb = await person('world');
  await personalPeriod(pa);
  await personalPeriod(pb);
  const pab = await personal.branch(pa.id, pa.branchId),
    pbb = await personal.branch(pb.id, pb.branchId);
  const pc = await shared.create(
    pa.id,
    {
      type: 'friend_group',
      title: 'Synthetic S3 group',
      branchId: pa.branchId,
      revision: pab.revision,
      sharingAcknowledged: true,
    },
    randomUUID(),
  );
  const pi = await invite(pa, pc.contextId);
  await shared.acceptInvite(
    pb.id,
    pi.inviteId,
    {
      token: pi.token,
      branchId: pb.branchId,
      revision: pbb.revision,
      contextRevision: pi.revision,
      sharingAcknowledged: true,
    },
    randomUUID(),
  );
  const pe = await testEvent(pa.id, pc.contextId);
  const respondPersonal = async (p) =>
    events.submitIntent(
      p.id,
      pc.contextId,
      pe.eventId,
      {
        contextRevision: (await shared.detail(p.id, pc.contextId)).revision,
        optionId: pe.yes,
      },
      randomUUID(),
    );
  assert.equal((await respondPersonal(pa)).status, 'waiting');
  await ownChoice(pa, pab);
  const earlier = await personalPeriod(pa);
  assert.equal(earlier.payload.memory.sharedEvents, undefined);
  const advanced = await personal.branch(pa.id, pa.branchId);
  assert.equal((await respondPersonal(pb)).status, 'resolved');
  assert.equal(
    (await personal.branch(pa.id, pa.branchId)).revision,
    advanced.revision,
  );
  winner(
    await Promise.allSettled([
      ownChoice(pa, advanced),
      ownChoice(pa, advanced),
    ]),
    'LIFE_REVISION_CONFLICT',
  );
  const [pm] = await db.query(
    'SELECT payload,first_history_position FROM aw_shared_personal_memories WHERE branch_id=$1',
    [pa.branchId],
  );
  assert.equal(pm.payload.knownAt, advanced.state.effectiveAt);
  assert.equal(pm.payload.effectiveAt, pab.state.effectiveAt);
  assert.equal(pm.first_history_position, 3);
  const later = await personalPeriod(pa);
  assert.equal(later.payload.memory.sharedEvents.length, 1);
  const retainedCanon = await db.query(
    'SELECT candidate,canon_hash FROM aw_shared_events WHERE id=$1',
    [pe.eventId],
  );
  await ownChoice(pa, await personal.branch(pa.id, pa.branchId));
  const unsafe = await personal.continue(
    pa.id,
    pa.branchId,
    (await personal.branch(pa.id, pa.branchId)).revision,
    randomUUID(),
  );
  const unsafeLease = await personalJobs.claim();
  assert.equal(unsafeLease.id, unsafe.jobId);
  const race = await Promise.allSettled([
    ownChoice(pb, pbb),
    repo.markDeleting(pb.id),
  ]);
  for (const result of race)
    if (result.status === 'rejected')
      assert.equal(result.reason.code, 'ACCOUNT_DELETING');
  const [redacted] = await events.events(pa.id, pc.contextId);
  assert.equal(redacted.privacyRedacted, true);
  assert.equal(redacted.effectiveAt, pab.state.effectiveAt);
  assert.equal(redacted.resolution.participatingCount, 2);
  assert.deepEqual(
    await db.query(
      'SELECT status,payload,checkpoints FROM aw_jobs WHERE id=$1',
      [unsafe.jobId],
    ),
    [{ status: 'cancelled', payload: {}, checkpoints: {} }],
  );
  await assert.rejects(() => personalJobs.verifySharedPrivacy(unsafeLease), {
    code: 'JOB_LEASE_LOST',
  });
  const fresh = await personal.retry(
    pa.id,
    unsafe.jobId,
    (await personal.branch(pa.id, pa.branchId)).revision,
    randomUUID(),
  );
  assert.notEqual(fresh.jobId, unsafe.jobId);
  const freshLease = await personalJobs.claim();
  assert.equal(freshLease.id, fresh.jobId);
  assert.equal(
    freshLease.payload.memory.sharedEvents[0].title,
    'Shared opportunity (details hidden)',
  );
  await repo.deleteAccountData(pb.id);
  await personalJobs.verifySharedPrivacy(freshLease);
  assert.deepEqual(
    await db.query(
      'SELECT candidate,canon_hash FROM aw_shared_events WHERE id=$1',
      [pe.eventId],
    ),
    retainedCanon,
  );
  assert.equal(
    (await repo.exportAccount(pa.id)).shared.personalMemories[0].payload.title,
    'Shared opportunity (details hidden)',
  );
  await personalJobs.fail(
    freshLease,
    new Error('Synthetic privacy verification complete'),
  );
  assert.equal(
    (
      await db.query(
        'SELECT id FROM aw_shared_personal_memories WHERE user_id=$1',
        [pb.id],
      )
    ).length,
    0,
  );
  assert.equal(
    (
      await db.query('SELECT id FROM aw_shared_events WHERE id=$1', [
        pe.eventId,
      ])
    ).length,
    1,
  );
  assert.equal(
    (
      await db.query(
        'SELECT id FROM aw_shared_personal_memories WHERE branch_id=$1',
        [pa.branchId],
      )
    ).length,
    1,
  );
  await repo.markDeleting(pa.id);
  await repo.deleteAccountData(pa.id);

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
  const pendingEvents = [];
  for (const id of joined) pendingEvents.push(await testEvent(world.id, id));
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
  for (const event of pendingEvents) {
    const resolved = await db.query(
      'SELECT result FROM aw_shared_resolutions WHERE event_id=$1',
      [event.eventId],
    );
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].result.status, 'cancelled');
    assert.equal(
      (
        await db.query('SELECT id FROM aw_shared_impacts WHERE event_id=$1', [
          event.eventId,
        ])
      ).length,
      0,
    );
  }
  const [queues] = await db.query(
    "SELECT (SELECT count(*) FROM ff_jobs)::int AS v1,(SELECT count(*) FROM aw_jobs)::int AS v2,(SELECT count(*) FROM aw_shared_jobs WHERE status IN ('queued','running'))::int AS shared",
  );
  assert.deepEqual(queues, { v1: 0, v2: 0, shared: 0 });
  {
    // Synthetic canon in the isolated fixture only; no provider, UI or publication.
    const { hash } = require('@future-flow/core');
    const { PublicDraftRepository } = require('@future-flow/database');
    const owner = await person();
    await personalPeriod(owner);
    const drafts = new PublicDraftRepository(db),
      workspace = await drafts.workspace(owner.id, owner.branchId),
      copy = workspace.source.copy,
      key = randomUUID();
    assert.equal(workspace.preview, null);
    const unsafe = {
      ...copy,
      summary: 'A technical contact address: ci@example.invalid',
    };
    const checked = await drafts.preflight(
      owner.id,
      owner.branchId,
      workspace.source.sourceRevision,
      unsafe,
    );
    assert.deepEqual(checked.issues, [{ path: 'summary', codes: ['email'] }]);
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_publication_drafts WHERE user_id=$1',
          [owner.id],
        )
      ).length,
      0,
    );
    const copies = await Promise.all([
      drafts.prepare(
        owner.id,
        owner.branchId,
        workspace.source.sourceRevision,
        copy,
        key,
      ),
      drafts.prepare(
        owner.id,
        owner.branchId,
        workspace.source.sourceRevision,
        copy,
        key,
      ),
    ]);
    assert.equal(copies[0].draftId, copies[1].draftId);
    const draftId = copies[0].draftId;
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_publication_drafts WHERE user_id=$1',
          [owner.id],
        )
      ).length,
      1,
    );
    assert.equal(
      (await drafts.workspace(owner.id, owner.branchId)).preview.draftId,
      draftId,
    );
    assert.equal(
      (await drafts.get(owner.id, draftId)).snapshot.origin.userEdited,
      false,
    );
    const reviews = new PublicReviewRepository(db);
    const starts = await Promise.allSettled([
      reviews.start(owner.id, draftId),
      reviews.start(owner.id, draftId),
    ]);
    winner(starts, 'PUBLIC_REVIEW_ALREADY_STARTED');
    const started = starts.find((r) => r.status === 'fulfilled').value;
    const output = { verdict: 'no_findings', findings: [] };
    const receipt = {
      task: 'public_review',
      promptVersion: 'isolated-ci',
      locale: 'en',
      model: 'isolated-fixture-no-provider',
      requestId: null,
      inputHash: hash(started.input),
      outputHash: hash(output),
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
    };
    await reviews.complete(
      owner.id,
      draftId,
      started.reviewId,
      output,
      receipt,
    );
    assert.equal((await reviews.start(owner.id, draftId)).reused, true);
    assert.equal(
      (await reviews.get(owner.id, draftId)).publicationApproved,
      false,
    );
    const next = await drafts.prepare(
      owner.id,
      owner.branchId,
      workspace.source.sourceRevision,
      { ...copy, title: 'A revised synthetic copy' },
      randomUUID(),
    );
    const staleDraft = next.draftId;
    assert.equal(next.snapshot.origin.userEdited, true);
    assert.equal(
      (await reviews.get(owner.id, staleDraft)).status,
      'not_started',
    );
    assert.equal(
      (await drafts.get(owner.id, draftId)).snapshot.title,
      copy.title,
    );
    const stale = await reviews.start(owner.id, staleDraft);
    await db.query('UPDATE aw_branches SET revision=revision+1 WHERE id=$1', [
      owner.branchId,
    ]);
    await assert.rejects(
      reviews.complete(owner.id, staleDraft, stale.reviewId, output, receipt),
      (e) => e.code === 'LIFE_REVISION_CONFLICT',
    );
    await repo.markDeleting(owner.id);
    await assert.rejects(
      reviews.complete(owner.id, staleDraft, stale.reviewId, output, receipt),
      (e) => e.code === 'ACCOUNT_DELETING',
    );
    await repo.deleteAccountData(owner.id);
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_public_draft_reviews WHERE user_id=$1',
          [owner.id],
        )
      ).length,
      0,
    );
    const [guard] = await db.query(
      "SELECT c.relrowsecurity AS rls,has_table_privilege('anon','aw_public_draft_reviews','SELECT') AS anon,has_table_privilege('authenticated','aw_public_draft_reviews','INSERT') AS client FROM pg_class c WHERE c.oid='aw_public_draft_reviews'::regclass",
    );
    assert.deepEqual(guard, { rls: true, anon: false, client: false });
  }
  {
    const { PublicDraftRepository } = require('@future-flow/database');
    const { hash } = require('@future-flow/core');
    const owner = await person();
    await personalPeriod(owner);
    const drafts = new PublicDraftRepository(db),
      workspace = await drafts.workspace(owner.id, owner.branchId);
    const preview = await drafts.prepare(
      owner.id,
      owner.branchId,
      workspace.source.sourceRevision,
      workspace.source.copy,
      randomUUID(),
    );
    // Only a closed technical fixture: positive queue config with no provider or budget reservation.
    const queue = new PublicReviewJobRepository(db, {
      enabled: true,
      daily: 5,
      projectUsd: 1,
      userUsd: 1,
    });
    const request = {
      snapshotHash: preview.snapshotHash,
      sourceRevision: preview.sourceRevision,
      policyVersion: 'public-review-1',
      acknowledged: true,
    };
    const key = randomUUID();
    const starts = await Promise.all([
      queue.enqueue(owner.id, preview.draftId, request, key),
      queue.enqueue(owner.id, preview.draftId, request, key),
      queue.enqueue(owner.id, preview.draftId, request, randomUUID()),
    ]);
    assert.equal(new Set(starts.map((r) => r.job.id)).size, 1);
    const claimed = await Promise.all([queue.claim(), queue.claim()]);
    assert.equal(claimed.filter(Boolean).length, 1);
    const job = claimed.find(Boolean),
      input = await queue.input(job);
    const output = { verdict: 'no_findings', findings: [] },
      receipt = {
        task: 'public_review',
        promptVersion: 'isolated-ci',
        locale: 'en',
        model: 'isolated-fixture-no-provider',
        requestId: null,
        inputHash: hash(input),
        outputHash: hash(output),
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
      };
    await queue.complete(job, output, receipt);
    assert.equal(
      (await queue.enqueue(owner.id, preview.draftId, request, key)).job.status,
      'completed',
    );
    assert.equal(await queue.claim(), null);
    const next = await drafts.prepare(
      owner.id,
      owner.branchId,
      workspace.source.sourceRevision,
      { ...workspace.source.copy, title: 'Queued synthetic copy' },
      randomUUID(),
    );
    await queue.enqueue(
      owner.id,
      next.draftId,
      { ...request, snapshotHash: next.snapshotHash },
      randomUUID(),
    );
    const interrupted = await queue.claim();
    await db.query(
      "UPDATE aw_public_review_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",
      [interrupted.id],
    );
    assert.equal(await queue.claim(), null);
    assert.equal(
      (await queue.get(owner.id, next.draftId)).job.status,
      'failed',
    );
    await assert.rejects(
      queue.complete(interrupted, output, receipt),
      (e) => e.code === 'JOB_LEASE_LOST',
    );
    const deletion = await drafts.prepare(
      owner.id,
      owner.branchId,
      workspace.source.sourceRevision,
      { ...workspace.source.copy, title: 'Deletion race copy' },
      randomUUID(),
    );
    await queue.enqueue(
      owner.id,
      deletion.draftId,
      { ...request, snapshotHash: deletion.snapshotHash },
      randomUUID(),
    );
    const deleting = await queue.claim();
    await repo.markDeleting(owner.id);
    await assert.rejects(
      queue.complete(deleting, output, receipt),
      (e) => e.code === 'JOB_LEASE_LOST',
    );
    await repo.restoreActive(owner.id);
    assert.equal(
      (await queue.get(owner.id, deletion.draftId)).job.status,
      'cancelled',
    );
    assert.equal(
      (await repo.exportAccount(owner.id)).aw_public_review_jobs.length,
      3,
    );
    await repo.deleteAccountData(owner.id);
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_public_review_jobs WHERE user_id=$1',
          [owner.id],
        )
      ).length,
      0,
    );
    const [guard] = await db.query(
      "SELECT c.relrowsecurity AS rls,has_table_privilege('anon','aw_public_review_jobs','SELECT') AS anon,has_table_privilege('authenticated','aw_public_review_jobs','INSERT') AS client FROM pg_class c WHERE c.oid='aw_public_review_jobs'::regclass",
    );
    assert.deepEqual(guard, { rls: true, anon: false, client: false });
  }
  {
    const { PublicDraftRepository } = require('@future-flow/database');
    const { hash } = require('@future-flow/core');
    const owner = await person();
    await personalPeriod(owner);
    const drafts = new PublicDraftRepository(db),
      reviews = new PublicReviewRepository(db),
      curations = new PublicCurationRepository(db, true);
    const workspace = await drafts.workspace(owner.id, owner.branchId);
    async function prepareCopy(title) {
      const preview = await drafts.prepare(
        owner.id,
        owner.branchId,
        workspace.source.sourceRevision,
        { ...workspace.source.copy, title },
        randomUUID(),
      );
      const started = await reviews.start(owner.id, preview.draftId),
        output = { verdict: 'no_findings', findings: [] };
      await reviews.complete(
        owner.id,
        preview.draftId,
        started.reviewId,
        output,
        {
          task: 'public_review',
          promptVersion: 'isolated-ci',
          locale: 'en',
          model: 'isolated-fixture-no-provider',
          requestId: null,
          inputHash: hash(started.input),
          outputHash: hash(output),
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
        },
      );
      return {
        preview,
        request: {
          snapshotHash: preview.snapshotHash,
          sourceRevision: preview.sourceRevision,
          curationVersion: 'text-curation-1',
          acknowledged: true,
        },
      };
    }
    const { preview, request } = await prepareCopy('Synthetic curation copy'),
      key = randomUUID();
    const submitted = await Promise.all([
      curations.submit(owner.id, preview.draftId, request, key),
      curations.submit(owner.id, preview.draftId, request, key),
      curations.submit(owner.id, preview.draftId, request, randomUUID()),
    ]);
    assert.equal(new Set(submitted.map((x) => x.curation.id)).size, 1);
    const curationId = submitted[0].curation.id;
    const input = {
      curationId,
      snapshotHash: preview.snapshotHash,
      sourceRevision: preview.sourceRevision,
      status: 'text_reviewed',
      reasonCode: null,
      actorLabel: 'Isolated CI technical fixture',
      privacyChecked: true,
      contentChecked: true,
    };
    const competing = await Promise.allSettled([
      curations.decide(input),
      curations.decide({ ...input, status: 'rejected', reasonCode: 'content' }),
    ]);
    assert.equal(competing.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal(
      competing.find((x) => x.status === 'rejected').reason.code,
      'PUBLIC_CURATION_DECIDED',
    );
    const winner = competing.find((x) => x.status === 'fulfilled').value;
    const reapply =
      winner.curation.status === 'text_reviewed'
        ? input
        : { ...input, status: 'rejected', reasonCode: 'content' };
    assert.deepEqual(await curations.decide(reapply), winner);
    assert.equal(winner.publicationApproved, false);
    assert.equal(
      (await drafts.get(owner.id, preview.draftId)).status,
      'awaiting_review',
    );
    await assert.rejects(
      db.query(
        'UPDATE aw_public_text_curations SET actor_label=$1 WHERE id=$2',
        ['Replacement actor', curationId],
      ),
    );
    const next = await prepareCopy('Synthetic pending curation'),
      pending = await curations.submit(
        owner.id,
        next.preview.draftId,
        next.request,
        randomUUID(),
      );
    await db.query('UPDATE aw_branches SET revision=revision+1 WHERE id=$1', [
      owner.branchId,
    ]);
    const nextDecision = {
      ...input,
      curationId: pending.curation.id,
      snapshotHash: next.preview.snapshotHash,
    };
    await assert.rejects(
      curations.decide(nextDecision),
      (e) => e.code === 'LIFE_REVISION_CONFLICT',
    );
    assert.equal(
      (await curations.pending()).some(
        (x) => x.curationId === pending.curation.id,
      ),
      false,
    );
    await repo.markDeleting(owner.id);
    await assert.rejects(
      curations.decide(nextDecision),
      (e) => e.code === 'ACCOUNT_DELETING',
    );
    await repo.restoreActive(owner.id);
    assert.equal(
      (await repo.exportAccount(owner.id)).aw_public_text_curations.length,
      2,
    );
    await repo.deleteAccountData(owner.id);
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_public_text_curations WHERE user_id=$1',
          [owner.id],
        )
      ).length,
      0,
    );
    const [guard] = await db.query(
      "SELECT c.relrowsecurity AS rls,has_table_privilege('anon','aw_public_text_curations','SELECT') AS anon,has_table_privilege('authenticated','aw_public_text_curations','INSERT') AS client FROM pg_class c WHERE c.oid='aw_public_text_curations'::regclass",
    );
    assert.deepEqual(guard, { rls: true, anon: false, client: false });
  }
  {
    const owner = await person(),
      scenarios = new ScenarioRepository(db, true, { daily: 1, concurrent: 1 });
    const template = {
      schemaVersion: 'scenario-1',
      contentLocale: 'en',
      title: 'Synthetic executable CI scenario',
      summary: 'A fictional template used only to check database behavior.',
      identity: { mode: 'alternate', label: null, ageBand: '35_44' },
      environment: {
        version: 'fictional-neutral-1',
        description: 'A fictional neutral environment.',
      },
      goals: [
        {
          key: 'goal-1',
          category: 'business',
          description: 'A synthetic independent studio goal',
          priority: 'primary',
          horizonMonths: 24,
          motivation: null,
          acceptableTradeoffs: [],
          unacceptableTradeoffs: [],
          status: 'active',
          note: null,
        },
      ],
      startingState: {
        effectiveAt: '2026-10-05',
        employment: {
          status: 'self_employed',
          employerLabel: null,
          workDomain: null,
        },
        location: { country: 'GB', region: null, housing: null },
        finance: { currency: 'USD', monthlyIncome: 2000, liquidFunds: 5000 },
        ownedAssets: [
          {
            key: 'asset-1',
            kind: 'business',
            label: 'A fictional studio',
            sharePercent: 100,
          },
        ],
        actors: [],
        skills: [],
        opportunities: [],
        resources: { energy: null, availableHoursPerWeek: null },
      },
      constraints: [
        {
          key: 'constraint-1',
          description: 'Keep the studio initially.',
          strength: 'hard',
          scope: 'branch',
          validFrom: '2026-10-05',
          validUntil: '2027-04-05',
          predicate: {
            type: 'asset_is_owned',
            assetKey: 'asset-1',
            owned: true,
          },
        },
      ],
    };
    const key = randomUUID(),
      copies = await Promise.all([
        scenarios.create(owner.id, { template }, key),
        scenarios.create(owner.id, { template }, key),
      ]),
      first = copies[0];
    assert.equal(copies[1].id, first.id);
    const request = {
        expectedVersion: 1,
        expectedHash: first.templateHash,
        template: { ...template, title: 'A revised synthetic CI template' },
      },
      race = await Promise.allSettled([
        scenarios.revise(owner.id, first.scenarioId, request, randomUUID()),
        scenarios.revise(owner.id, first.scenarioId, request, randomUUID()),
      ]);
    assert.equal(race.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal(
      race.find((x) => x.status === 'rejected').reason.code,
      'SCENARIO_REVISION_CONFLICT',
    );
    assert.deepEqual(await scenarios.get(owner.id, first.id), first);
    const startKey = randomUUID(),
      startRequest = { templateHash: first.templateHash, acknowledged: true },
      starts = await Promise.all([
        scenarios.start(owner.id, first.id, startRequest, startKey),
        scenarios.start(owner.id, first.id, startRequest, startKey),
      ]);
    assert.equal(starts[0].lifeId, starts[1].lifeId);
    const branch = await new LifeRepository(db).branch(
      owner.id,
      starts[0].branchId,
    );
    assert.notEqual(branch.life_id, owner.lifeId);
    assert.equal(branch.input.visibility, 'private');
    assert.equal(branch.state.goals[0].goalId, branch.input.goals[0].id);
    assert.equal(
      branch.input.constraints[0].predicate.assetId,
      branch.state.ownedAssets[0].id,
    );
    assert.deepEqual(branch.accepted_decision_ids, []);
    await assert.rejects(
      scenarios.start(owner.id, first.id, startRequest, randomUUID()),
      (e) => e.code === 'GENERATION_LIMIT',
    );
    assert.equal(
      (
        await db.query(
          'SELECT life_id FROM aw_scenario_starts WHERE user_id=$1',
          [owner.id],
        )
      ).length,
      1,
    );
    await assert.rejects(
      db.query('UPDATE aw_scenario_versions SET template_hash=$1 WHERE id=$2', [
        '0'.repeat(64),
        first.id,
      ]),
    );
    await repo.markDeleting(owner.id);
    await assert.rejects(
      scenarios.start(owner.id, first.id, startRequest, startKey),
      (e) => e.code === 'ACCOUNT_DELETING',
    );
    await repo.restoreActive(owner.id);
    assert.equal(
      (await repo.exportAccount(owner.id)).aw_scenario_versions.length,
      2,
    );
    await repo.deleteAccountData(owner.id);
    for (const table of [
      'aw_scenarios',
      'aw_scenario_versions',
      'aw_scenario_starts',
    ]) {
      assert.equal(
        (
          await db.query(
            `SELECT * FROM ${table} WHERE user_id=$1`,
            [owner.id],
          )
        ).length,
        0,
      );
      const [guard] = await db.query(
        "SELECT c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'INSERT') AS client FROM pg_class c WHERE c.oid=$1::regclass",
        [table],
      );
      assert.deepEqual(guard, { rls: true, anon: false, client: false });
    }
  }
  console.log(
    JSON.stringify({
      sharedFoundationPostgres: 'passed',
      publicReviewPostgres: 'passed',
      publicEditorPreflightPrivate: true,
      publicEditorConcurrentSaveOnce: true,
      publicEditorRestoreAndNewReview: true,
      publicReviewConcurrentStartOnce: true,
      publicReviewSourceDeletionGuard: true,
      publicReviewJobConcurrentEnqueueOnce: true,
      publicReviewJobConcurrentClaimOnce: true,
      publicReviewJobNoAutomaticRetry: true,
      publicReviewJobDeletionGuard: true,
      publicCurationConcurrentSubmitOnce: true,
      publicCurationConcurrentDecisionOnce: true,
      publicCurationSourceDeletionGuard: true,
      publicCurationNoPublication: true,
      scenarioConcurrentCreateOnce: true,
      scenarioConcurrentRevisionOnce: true,
      scenarioConcurrentStartOnce: true,
      scenarioPrivateFreshReferences: true,
      scenarioQuotaRollback: true,
      scenarioDeletionGuard: true,
      lastExplorerSlotRace: true,
      lastWorldSlotRace: true,
      lastMemberRace: true,
      overlappingFiveContextDeletion: true,
      sharedEnginePostgres: 'passed',
      sharedJobsPostgres: 'passed',
      sharedPersonalPostgres: 'passed',
      delayedSharedResolution: true,
      concurrentPersonalMemoryOnce: true,
      personalMemoryDeletionRace: true,
      sharedPrivacyProjection: true,
      stalePersonalInputCancelled: true,
      safePersonalRetrySurvivesPhysicalDeletion: true,
      formerMemberDeletionPreservesGeneration: true,
      sharedSafetyPostgres: 'passed',
      overlappingBlockRace: true,
      moderationHoldAfterRestart: true,
      privateReportsCascade: true,
      parallelSharedEnqueueAndClaim: true,
      reclaimedSharedLease: true,
      tenParallelIntents: true,
      decisionResolutionOnce: true,
      pendingDecisionDeletion: true,
      zeroPersonalBranchWrites: true,
      verifiedDatabaseTls: true,
      paidAiCalls: 0,
    }),
  );
} finally {
  await raw.close();
}
