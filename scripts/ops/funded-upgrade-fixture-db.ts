// Synthetic PostgreSQL companion to the Linux/root Docker transition fixture.
// It cannot address a hosted project or run without the explicit fixture marker.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { connectDatabase } from '@future-flow/database';
import { hash } from '@future-flow/core';
import {
  captureFundedRuntime,
  migrateFundedRuntime,
} from '../lib/funded-runtime';
import { successorDatabaseRequest } from '../lib/beta-successor-operation';
import { successorPlan } from '../lib/beta-successor';

async function main() {
  assert.equal(process.env.ALTERWARD_FUNDED_FIXTURE, 'true');
  assert.equal(process.env.AI_PROJECT_BUDGET_USD, '0');
  assert.equal(process.env.AI_USER_BUDGET_USD, '0');
  assert(!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY);
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(url.hostname, 'postgres');
  assert.equal(url.username, 'postgres');
  assert.equal(url.pathname, '/postgres');
  assert(
    ['rehearsal_unused', 'ci_unused_outside_fixture'].includes(url.password),
  );
  assert.equal(url.search, '');
  const request = JSON.parse(readFileSync(0, 'utf8'));
  assert(/^(aw_fixture_|aw_restore_)[a-f0-9]{24}$/.test(request.database));
  assert(
    [
      'init',
      'capture',
      'migrate',
      'drop',
      'unsafe',
      'successor-setup',
      'successor-capture',
      'successor-apply',
      'successor-reconcile',
      'successor-verify',
      'successor-tester-setup',
      'successor-tester-verify',
    ].includes(request.mode),
  );
  const admin = connectDatabase(url.href, true);
  let db: ReturnType<typeof connectDatabase> | undefined;
  const user = '11111111-1111-4111-8111-111111111111';
  const input = {
    participants: [{ email: 'funded@example.invalid', userId: user }],
    connectionHostname: 'postgres',
    databaseIdentitySha256: hash(['postgres', request.database, 'postgres']),
  };
  try {
    if (request.mode === 'drop') {
      await admin.query(`DROP DATABASE ${request.database} WITH (FORCE)`);
      return { dropped: true };
    }
    if (request.mode === 'init' || request.mode === 'unsafe')
      await admin.query(`CREATE DATABASE ${request.database}`);
    url.pathname = '/' + request.database;
    db = connectDatabase(url.href, true);
    if (request.mode.startsWith('successor-')) {
      const { previous, selection, expected } = request.expected;
      const owner = {
        email: 'owner@example.invalid',
        userId: '22222222-2222-4222-8222-222222222222',
      };
      const testers = [
        owner,
        {
          email: 'tester-one@example.invalid',
          userId: '33333333-3333-4333-8333-333333333333',
        },
        {
          email: 'tester-two@example.invalid',
          userId: '44444444-4444-4444-8444-444444444444',
        },
      ];
      if (selection.purpose === 'tester-beta') {
        // Chained from the owner window: previous is the owner's own terms.
        assert.deepEqual(previous.participants, [owner]);
        assert.deepEqual(selection.next.participants, testers);
      } else {
        assert.deepEqual(previous.participants, input.participants);
        assert.deepEqual(selection.next.participants, [owner]);
      }
      if (request.mode === 'successor-tester-setup') {
        // Synthetic stand-ins for the two signed-in invited readers.
        for (const tester of testers.slice(1)) {
          await db.query('INSERT INTO ff_users(id) VALUES($1)', [
            tester.userId,
          ]);
          await db.query(
            "INSERT INTO auth.users VALUES($1,$2,'authenticated','authenticated',false,NULL,now()-interval '1 day',now()-interval '1 hour',NULL,'')",
            [tester.userId, tester.email],
          );
        }
        return { syntheticSeeded: true };
      }
      if (request.mode === 'successor-tester-verify') {
        const plan = expected.plan;
        const rows = await db.query<{
          id: string;
          user_id: string | null;
          limit_micro: string;
          accounted_micro: string;
        }>(
          'SELECT id,user_id,limit_micro::text,accounted_micro::text FROM aw_budget_accounts WHERE id=ANY($1::text[]) ORDER BY id',
          [
            [
              plan.previousKeys.project,
              ...plan.previousKeys.users,
              plan.nextKeys.project,
              ...plan.nextKeys.users,
            ],
          ],
        );
        assert.equal(rows.length, 6);
        // The still-unspent owner allowance is closed, its history retained.
        assert.deepEqual(
          rows.find((r) => r.id === plan.previousKeys.project),
          {
            id: plan.previousKeys.project,
            user_id: null,
            limit_micro: '0',
            accounted_micro: '0',
          },
        );
        assert.deepEqual(
          rows.find((r) => r.id === plan.previousKeys.users[0]),
          {
            id: plan.previousKeys.users[0],
            user_id: owner.userId,
            limit_micro: '0',
            accounted_micro: '0',
          },
        );
        assert.deepEqual(
          rows.find((r) => r.id === plan.nextKeys.project),
          {
            id: plan.nextKeys.project,
            user_id: null,
            limit_micro: '10000000',
            accounted_micro: '0',
          },
        );
        testers.forEach((tester, index) =>
          assert.deepEqual(
            rows.find((r) => r.id === plan.nextKeys.users[index]),
            {
              id: plan.nextKeys.users[index],
              user_id: tester.userId,
              limit_micro: '3330000',
              accounted_micro: '0',
            },
          ),
        );
        const { DatabaseAiBudget } = await import('@future-flow/database');
        const old = new DatabaseAiBudget(
          db,
          owner.userId,
          crypto.randomUUID(),
          {
            projectUsd: 3,
            userUsd: 3,
            window: previous,
          },
        );
        await assert.rejects(
          () =>
            old.reserve({
              model: 'gpt-6.1-sol',
              max_output_tokens: 1,
              input: [],
            }),
          { code: 'AI_BUDGET_EXCEEDED' },
        );
        const next = new DatabaseAiBudget(
          db,
          owner.userId,
          crypto.randomUUID(),
          {
            projectUsd: 10,
            userUsd: 3.33,
            window: selection.next,
            closedBetaUserIds: testers.map((t) => t.userId),
          },
        );
        await assert.rejects(
          () =>
            next.reserve({
              model: 'gpt-6.1-sol',
              max_output_tokens: 1,
              input: [],
            }),
          { code: 'AI_BUDGET_WINDOW_CLOSED' },
        );
        return { testerBetaWindow: true };
      }
      if (request.mode === 'successor-setup') {
        // This synthetic seed is NEVER part of the production controller. It
        // starts from the fixture's completed 039 database and retains history.
        const plan = successorPlan(
          previous,
          selection,
          new Date().toISOString(),
        );
        await db.query('INSERT INTO ff_users(id) VALUES($1)', [owner.userId]);
        await db.query(
          "INSERT INTO auth.users VALUES($1,$2,'authenticated','authenticated',false,NULL,now()-interval '1 day',now()-interval '1 hour',NULL,'')",
          [owner.userId, owner.email],
        );
        await db.query(
          'INSERT INTO aw_budget_accounts(id,user_id,limit_micro,accounted_micro) VALUES($1,NULL,2000000,188585),($2,$3,500000,188585)',
          [plan.previousKeys.project, plan.previousKeys.users[0], user],
        );
        return { syntheticSeeded: true };
      }
      if (request.mode === 'successor-verify') {
        const plan = expected.plan;
        const rows = await db.query<{
          id: string;
          user_id: string | null;
          limit_micro: string;
          accounted_micro: string;
        }>(
          'SELECT id,user_id,limit_micro::text,accounted_micro::text FROM aw_budget_accounts WHERE id=ANY($1::text[]) ORDER BY id',
          [
            [
              plan.previousKeys.project,
              ...plan.previousKeys.users,
              plan.nextKeys.project,
              ...plan.nextKeys.users,
            ],
          ],
        );
        assert.equal(rows.length, 4);
        for (const id of [
          plan.previousKeys.project,
          ...plan.previousKeys.users,
        ])
          assert.deepEqual(
            rows.find((r) => r.id === id),
            {
              id,
              user_id: id === plan.previousKeys.project ? null : user,
              limit_micro: '0',
              accounted_micro: '188585',
            },
          );
        for (const id of [plan.nextKeys.project, ...plan.nextKeys.users])
          assert.deepEqual(
            rows.find((r) => r.id === id),
            {
              id,
              user_id: id === plan.nextKeys.project ? null : owner.userId,
              limit_micro: '3000000',
              accounted_micro: '0',
            },
          );
        const { DatabaseAiBudget } = await import('@future-flow/database');
        const old = new DatabaseAiBudget(db, user, crypto.randomUUID(), {
          projectUsd: 2,
          userUsd: 0.5,
          window: previous,
        });
        await assert.rejects(
          () =>
            old.reserve({
              model: 'gpt-6.1-sol',
              max_output_tokens: 1,
              input: [],
            }),
          { code: 'AI_BUDGET_EXCEEDED' },
        );
        const next = new DatabaseAiBudget(
          db,
          owner.userId,
          crypto.randomUUID(),
          {
            projectUsd: 3,
            userUsd: 3,
            window: selection.next,
            closedBetaUserIds: [owner.userId],
          },
        );
        await assert.rejects(
          () =>
            next.reserve({
              model: 'gpt-6.1-sol',
              max_output_tokens: 1,
              input: [],
            }),
          { code: 'AI_BUDGET_WINDOW_CLOSED' },
        );
        return {
          oldAllowanceClosed: true,
          ownerCap: true,
          differentOwner: true,
        };
      }
      const mode = request.mode.slice('successor-'.length);
      return await db.transaction(async (tx) => {
        await tx.query(
          mode === 'apply'
            ? 'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE'
            : 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
        );
        return successorDatabaseRequest(
          tx,
          { mode, previous, selection, expected: expected ?? null },
          {
            connectionHostname: input.connectionHostname,
            databaseIdentitySha256: input.databaseIdentitySha256,
          },
        );
      });
    }
    if (request.mode === 'init' || request.mode === 'unsafe') {
      await db.query(
        'CREATE TABLE ff_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
      );
      for (const name of readdirSync('database/migrations')
        .filter((n) => n.endsWith('.sql') && Number(n.slice(0, 3)) <= 36)
        .sort()) {
        const sql = readFileSync('database/migrations/' + name, 'utf8').replace(
          /\r\n/g,
          '\n',
        );
        await db.transaction(async (tx) => {
          await tx.query(sql);
          await tx.query(
            'INSERT INTO ff_migrations(name,checksum) VALUES($1,$2)',
            [name, hash(sql)],
          );
        });
      }
      await db.query(`CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid,email text,aud text,role text,is_anonymous boolean,
        deleted_at timestamptz,email_confirmed_at timestamptz,last_sign_in_at timestamptz,banned_until timestamptz,email_change text)`);
      await db.query('INSERT INTO ff_users(id) VALUES($1)', [user]);
      await db.query(
        "INSERT INTO auth.users VALUES($1,$2,'authenticated','authenticated',false,NULL,now()-interval '1 day',now()-interval '1 hour',NULL,'')",
        [user, 'funded@example.invalid'],
      );
      await db.query(
        "INSERT INTO aw_budget_accounts(id,user_id,limit_micro,accounted_micro) VALUES('funded-project',NULL,2000000,188585),('funded-user',$1,500000,188585)",
        [user],
      );
      const { LifeRepository, Repository } =
        await import('@future-flow/database');
      const { setupFixture } = await import('../../tests/life-fixtures');
      await new Repository(db).acceptPrivacy(user);
      const historical = await new LifeRepository(db).create(
        user,
        setupFixture(),
        crypto.randomUUID(),
      );
      await db.query("UPDATE aw_branches SET status='ready' WHERE id=$1", [
        historical.branchId,
      ]);
      await db.query(
        "UPDATE aw_jobs SET status='completed',stage='COMMITTED',completed_at=now(),checkpoints='{\"historicalSynthetic\":true}' WHERE id=$1",
        [historical.jobId],
      );
      await db.query(
        `INSERT INTO aw_budget_reservations(id,user_id,project_key,user_key,job_id,model,task,reserved_micro,accounted_micro,status,input_tokens,output_tokens,settled_at)
        VALUES(gen_random_uuid(),$1,'funded-project','funded-user',$2,'synthetic-history','synthetic-history',200000,188585,'completed',321,654,now())`,
        [user, historical.jobId],
      );
      await db.query(
        'INSERT INTO aw_ai_runs(id,user_id,job_id,metadata) VALUES(gen_random_uuid(),$1,$2,$3::jsonb)',
        [
          user,
          historical.jobId,
          JSON.stringify({
            historicalSynthetic: true,
            inputTokens: 321,
            outputTokens: 654,
            accountedMicro: 188585,
          }),
        ],
      );
    }
    if (request.mode === 'unsafe') {
      const checks = { reservations: false, leases: false };
      for (const status of ['reserved', 'unknown']) {
        let refused = false;
        try {
          await db.transaction(async (tx) => {
            await tx.query(
              `INSERT INTO aw_budget_reservations(id,user_id,project_key,user_key,job_id,model,task,reserved_micro,accounted_micro,status)
            VALUES(gen_random_uuid(),$1,'funded-project','funded-user',gen_random_uuid(),'synthetic','synthetic',123,123,$2)`,
              [user, status],
            );
            try {
              await captureFundedRuntime(tx, input);
            } catch {
              refused = true;
            }
            throw Error('Rollback test-owned unsafe reservation');
          });
        } catch {
          /* The test owns and rolls back its synthetic transaction. */
        }
        assert(refused);
        checks.reservations = true;
      }
      // A real job row with its actual lease columns. Required life/branch FKs
      // are supplied by the same repository fixture as the worker tests.
      const { LifeRepository } = await import('@future-flow/database');
      const { setupFixture } = await import('../../tests/life-fixtures');
      await db.query(
        "INSERT INTO ff_consents(id,user_id,policy_version,consent_type) VALUES(gen_random_uuid(),$1,'alpha-privacy-v1','adult_and_ai_acknowledgement') ON CONFLICT DO NOTHING",
        [user],
      );
      const life = await new LifeRepository(db).create(
        user,
        setupFixture(),
        crypto.randomUUID(),
      );
      assert(life);
      let refused = false;
      try {
        await db.transaction(async (tx) => {
          await tx.query(
            "UPDATE aw_branches SET status='ready';UPDATE aw_jobs SET status='completed',lease_token=gen_random_uuid(),lease_until=now()+interval '1 minute'",
          );
          try {
            await captureFundedRuntime(tx, input);
          } catch {
            refused = true;
          }
          throw Error('Rollback test-owned lease');
        });
      } catch {
        /* Keep unsafe-state testing out of the operator. */
      }
      assert(refused);
      checks.leases = true;
      return checks;
    }
    if (request.mode === 'migrate')
      return await db.transaction((tx) =>
        migrateFundedRuntime(tx, input, request.expected),
      );
    return await db.transaction(async (tx) => {
      await tx.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      );
      return captureFundedRuntime(tx, input);
    });
  } finally {
    await db?.close();
    await admin.close();
  }
}
main()
  .then((r) => console.log(JSON.stringify(r)))
  .catch(() => {
    console.error('Isolated funded database fixture failed');
    process.exitCode = 1;
  });
