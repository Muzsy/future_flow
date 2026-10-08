// Isolated operational cohorts with deterministic AI doubles, never public seed.
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import {
  Repository,
  LifeRepository,
  LifeJobRepository,
  PublicForkStartRepository,
  PublicForkPermissionRepository,
  PersonalScenarioRepository,
  publicOriginMetricsSummary,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import {
  publicOriginMetricsReportSchema,
  publicReadingSignalSchema,
  publicReadingSignals,
} from '@future-flow/contracts';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  communityForkCopy,
  officialForkCopy,
} from './public-fork-permission-fixtures';
import { publicScenarioFixture } from './public-scenario-publication-fixtures';
import { personalScenarioFixture } from './scenario-personalization-fixtures';
import { lifeTestAi, setupFixture } from './life-fixtures';
import { processLifeJob } from '../apps/worker/src/life-processor';
const config = { enabled: true, linkSecret: 'b'.repeat(64) };
const flags = { enabled: true, startsEnabled: true };
let engine: PGlite, db: Database;
function adapter(
  client: Pick<PGlite, 'query' | 'transaction'>,
  nested = false,
): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await client.query<T>(sql, values)).rows,
    transaction: (run) =>
      nested
        ? run(adapter(client, true))
        : client.transaction((tx) =>
            run(adapter(tx as unknown as PGlite, true)),
          ),
  };
}
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
  await applyMigrations(engine);
  db = adapter(engine);
});
afterEach(async () => {
  for (const u of await db.query<{ id: string }>('SELECT id FROM ff_users'))
    await new Repository(db).deleteAccountData(u.id);
});
afterAll(async () => {
  await engine?.close();
});
async function target() {
  const user = randomUUID(),
    repo = new Repository(db);
  await repo.ensureUser(user);
  await repo.acceptPrivacy(user);
  return user;
}
async function checkpoint(official = false) {
  const f = official
    ? await officialForkCopy(db, config)
    : await communityForkCopy(db, config);
  const permission = new PublicForkPermissionRepository(
    db,
    flags,
    config,
    config,
  );
  const approval = {
    publicationRevision: f.view.revision,
    snapshotHash: f.view.snapshotHash,
    permissionRevision: 0,
    allowed: true,
    acknowledged: true,
  };
  if (official)
    await permission.setOfficial({
      slug: f.view.slug,
      actorLabel: 'Isolated curator',
      ...approval,
    });
  else await permission.setOwner(f.owner, f.view.slug, approval);
  const capability = await permission.capability(f.view.slug),
    user = await target();
  const starts = new PublicForkStartRepository(db, flags, config, config);
  const body = {
    capabilityHash: capability.capabilityHash,
    checkpointIndex: 0,
    optionKey: capability.checkpoints[0]!.options[0]!.key,
    acknowledged: true,
  };
  const key = randomUUID(),
    receipt = await starts.start(user, f.view.slug, body, key);
  return {
    owner: f.owner,
    user,
    starts,
    slug: f.view.slug,
    body,
    key,
    receipt,
  };
}
async function scenario() {
  const f = await publicScenarioFixture(db),
    publication = await f.pubs.confirm(f.owner, f.confirm, randomUUID()),
    user = await target();
  const starts = new PersonalScenarioRepository(
    db,
    { enabled: true },
    { enabled: true, operatorEnabled: false },
  );
  const profile = personalScenarioFixture(),
    preview = await starts.prepare(
      user,
      publication.slug,
      { templateHash: f.version.templateHash, profile, acknowledged: true },
      randomUUID(),
    );
  const body = {
      previewId: preview.id,
      previewHash: preview.previewHash,
      profile,
      acknowledged: true,
    },
    key = randomUUID();
  const receipt = await starts.start(user, publication.slug, body, key);
  return {
    owner: f.owner,
    user,
    starts,
    slug: publication.slug,
    body,
    key,
    receipt,
  };
}
async function process(user: string, jobId: string) {
  const [job] = await db.query<LifeJob>(
    "UPDATE aw_jobs SET status='running',attempt=1,lease_token=$1,lease_until=now()+interval '10 minutes' WHERE id=$2 AND user_id=$3 AND status='queued' RETURNING *",
    [randomUUID(), jobId, user],
  );
  if (!job) throw Error('Missing isolated job');
  await processLifeJob(job, new LifeJobRepository(db), lifeTestAi);
}
describe('private public-origin operational cohort report', () => {
  it('validates bounded windows before SQL and exposes only an empty UTC aggregate', async () => {
    let queries = 0;
    const observed: Database = {
      ...db,
      query: async () => {
        queries++;
        throw Error('No query expected');
      },
    };
    for (const raw of [
      { windowDays: 0 },
      { windowDays: 91 },
      { windowDays: 1.5 },
      { windowDays: '30' },
      { userId: randomUUID() },
    ])
      await expect(publicOriginMetricsSummary(observed, raw)).rejects.toThrow();
    expect(queries).toBe(0);
    await db.query("SET TIME ZONE 'Pacific/Kiritimati'");
    try {
      const report = await publicOriginMetricsSummary(db, { windowDays: 1 });
      const [clock] = await db.query<{ day: string }>(
        "SELECT (now() AT TIME ZONE 'UTC')::date::text AS day",
      );
      expect(report).toMatchObject({
        fromDay: clock!.day,
        throughDay: clock!.day,
        cohorts: [],
        windowDays: 1,
      });
    } finally {
      await db.query("SET TIME ZONE 'UTC'");
    }
  });
  it('separates three real start channels, counts replay once, excludes ordinary lives and emits no source/profile identity', async () => {
    const community = await checkpoint(),
      official = await checkpoint(true),
      personalized = await scenario();
    for (const f of [community, official, personalized])
      await f.starts.start(f.user, f.slug, f.body, f.key);
    const ordinary = await target();
    await new LifeRepository(db).create(ordinary, setupFixture(), randomUUID());
    const budgetBefore = await db.query(
      'SELECT * FROM aw_budget_reservations ORDER BY id',
    );
    const before = await db.query(
      'SELECT id,status,checkpoints FROM aw_jobs ORDER BY id',
    );
    const report = await publicOriginMetricsSummary(db);
    expect(
      report.cohorts.map((c) => [
        c.channel,
        c.createdLives,
        c.firstPeriodCompletedLives,
      ]),
    ).toEqual([
      ['community_public_checkpoint', 1, 0],
      ['official_personal_scenario', 1, 0],
      ['official_public_checkpoint', 1, 0],
    ]);
    for (const f of [community, official, personalized])
      for (const id of [
        f.owner,
        f.user,
        f.slug,
        f.receipt.lifeId,
        f.receipt.branchId,
        f.receipt.jobId,
      ])
        expect(JSON.stringify(report)).not.toContain(id);
    expect(JSON.stringify(report)).not.toMatch(
      /templateHash|profileHash|state|EUR|decisionId|monthlyIncome|readingId/,
    );
    expect(
      await db.query('SELECT id,status,checkpoints FROM aw_jobs ORDER BY id'),
    ).toEqual(before);
    expect(await db.query('SELECT id FROM aw_public_reading_sessions')).toEqual(
      [],
    );
    expect(
      await db.query('SELECT * FROM aw_budget_reservations ORDER BY id'),
    ).toEqual(budgetBefore);
  });
  it('requires successful original-branch period jobs and ignores historical child-branch continuations', async () => {
    const f = await scenario(),
      lives = new LifeRepository(db);
    expect(
      (await publicOriginMetricsSummary(db)).cohorts[0]!
        .firstPeriodCompletedLives,
    ).toBe(0);
    await process(f.user, f.receipt.jobId);
    let detail = await lives.detail(f.user, f.receipt.branchId);
    const period = detail.periods[0]!,
      decision = (period.events as any[]).at(-1).decision;
    const fork = await lives.fork(
      f.user,
      f.receipt.branchId,
      period.id as string,
      detail.branch.revision,
      decision.options[1].id,
      randomUUID(),
    );
    await process(f.user, fork.jobId);
    expect((await publicOriginMetricsSummary(db)).cohorts[0]).toMatchObject({
      firstPeriodCompletedLives: 1,
      secondPeriodCompletedLives: 0,
    });
    for (let i = 2; i <= 3; i++) {
      detail = await lives.detail(f.user, f.receipt.branchId);
      const nextDecision = (detail.periods.at(-1)!.events as any[]).at(
        -1,
      ).decision;
      await lives.choose(
        f.user,
        f.receipt.branchId,
        detail.branch.revision,
        nextDecision.id,
        nextDecision.options[0].id,
        randomUUID(),
      );
      const branch = await lives.branch(f.user, f.receipt.branchId),
        next = await lives.continue(
          f.user,
          f.receipt.branchId,
          branch.revision,
          randomUUID(),
        );
      await process(f.user, next.jobId);
      expect((await publicOriginMetricsSummary(db)).cohorts[0]).toMatchObject({
        firstPeriodCompletedLives: 1,
        secondPeriodCompletedLives: 1,
        thirdPeriodCompletedLives: i === 3 ? 1 : 0,
      });
    }
    // An inconsistent fixture without a completed first job cannot inflate later stages.
    await db.query("UPDATE aw_jobs SET status='failed' WHERE id=$1", [
      f.receipt.jobId,
    ]);
    expect((await publicOriginMetricsSummary(db)).cohorts[0]).toMatchObject({
      firstPeriodCompletedLives: 0,
      secondPeriodCompletedLives: 0,
      thirdPeriodCompletedLives: 0,
    });
  });
  it('keeps independent lives after source detachment, excludes deleting owners and follows actual account cascade', async () => {
    const f = await scenario();
    await process(f.user, f.receipt.jobId);
    await new Repository(db).deleteAccountData(f.owner);
    expect((await publicOriginMetricsSummary(db)).cohorts[0]).toMatchObject({
      createdLives: 1,
      firstPeriodCompletedLives: 1,
    });
    await db.query("UPDATE ff_users SET status='deleting' WHERE id=$1", [
      f.user,
    ]);
    expect((await publicOriginMetricsSummary(db)).cohorts).toEqual([]);
    await new Repository(db).deleteAccountData(f.user);
    expect((await publicOriginMetricsSummary(db)).cohorts).toEqual([]);
  });
  it('rejects forged or inconsistent aggregates and preserves the seven original anonymous signals', async () => {
    const report = await publicOriginMetricsSummary(db, { windowDays: 1 });
    const row = {
      day: report.fromDay,
      channel: 'official_personal_scenario',
      createdLives: 1,
      firstPeriodCompletedLives: 1,
      secondPeriodCompletedLives: 0,
      thirdPeriodCompletedLives: 0,
    };
    for (const cohorts of [
      [{ ...row, createdLives: 0 }],
      [{ ...row, secondPeriodCompletedLives: 2 }],
      [{ ...row, thirdPeriodCompletedLives: 1 }],
      [row, row],
      [{ ...row, ownerId: randomUUID() }],
      [{ ...row, day: '2000-01-01' }],
    ])
      expect(
        publicOriginMetricsReportSchema.safeParse({ ...report, cohorts })
          .success,
      ).toBe(false);
    expect(
      publicOriginMetricsReportSchema.safeParse({ ...report, windowDays: 2 })
        .success,
    ).toBe(false);
    expect(publicReadingSignals).toHaveLength(7);
    expect(
      publicReadingSignalSchema.safeParse({
        readingId: randomUUID(),
        signal: 'fork_created',
      }).success,
    ).toBe(false);
  });
});
