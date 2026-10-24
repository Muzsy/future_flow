import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import {
  hash,
  buildFictionArtifact,
  emptyFictionCharacterState,
  fictionCharacterProjectionFromEnvelope,
} from '@future-flow/core';
import { fictionFixture, fictionProof } from './fiction-fixtures';
import { LifeRepository, type Database } from '@future-flow/database';
import {
  narrativeV1Policy,
  reviewedNarrativePolicy,
  contextNarrativePolicy,
  fictionV1Policy,
  fictionV2Policy,
  fictionV3Policy,
  fictionV4Policy,
  fictionV5Policy,
  fictionV6Policy,
  fictionV6Quality25Policy,
  fictionV7Policy,
  fictionV8Policy,
  fictionV9Policy,
} from '@future-flow/contracts';
import { setupFixture } from './life-fixtures';
import {
  captureFundedRuntime,
  migrateFundedRuntime,
  fundedRuntimeCapabilities,
} from '../scripts/lib/funded-runtime';
import { assertReviewedPrivacyRecoverySchema } from '../scripts/lib/privacy-recovery-schema';

let engine: PGlite;
const user = randomUUID();
const input = {
  participants: [{ email: 'funded@example.invalid', userId: user }],
  connectionHostname: 'synthetic-postgres',
  databaseIdentitySha256: hash(['synthetic-postgres', 'template1', 'postgres']),
};
function adapter(e: Pick<PGlite, 'query'>): Database {
  const db: Database = {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await e.query<T>(sql, values)).rows,
    transaction: async (run) => run(db),
  };
  return db;
}
let db: Database;
beforeAll(async () => {
  engine = new PGlite();
  await engine.waitReady;
  db = adapter(engine);
  await engine.exec(
    'CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE ff_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());',
  );
  for (const name of readdirSync('database/migrations')
    .filter((n) => n.endsWith('.sql') && !n.startsWith('038_'))
    .sort()) {
    const sql = readFileSync('database/migrations/' + name, 'utf8').replace(
      /\r\n/g,
      '\n',
    );
    await engine.exec(sql);
    await engine.query(
      'INSERT INTO ff_migrations(name,checksum) VALUES($1,$2)',
      [name, hash(sql)],
    );
  }
  await engine.exec(`CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid,email text,aud text,role text,is_anonymous boolean,
    deleted_at timestamptz,email_confirmed_at timestamptz,last_sign_in_at timestamptz,banned_until timestamptz,email_change text);`);
  await engine.query('INSERT INTO ff_users(id) VALUES($1)', [user]);
  await engine.query(
    "INSERT INTO auth.users VALUES($1,$2,'authenticated','authenticated',false,NULL,now()-interval '1 day',now()-interval '1 hour',NULL,'')",
    [user, 'funded@example.invalid'],
  );
  await engine.query(
    "INSERT INTO aw_budget_accounts(id,user_id,limit_micro,accounted_micro) VALUES('funded-project',NULL,2000000,188585),('funded-user',$1,500000,188585)",
    [user],
  );
  await engine.query(
    `INSERT INTO aw_budget_reservations(id,user_id,project_key,user_key,job_id,model,task,reserved_micro,accounted_micro,status,input_tokens,output_tokens,settled_at)
    VALUES(gen_random_uuid(),$1,'funded-project','funded-user',gen_random_uuid(),'synthetic-history','synthetic-history',200000,188585,'completed',321,654,now())`,
    [user],
  );
}, 60000);
afterAll(async () => {
  await engine?.close();
});
async function tx<T>(run: (db: Database) => Promise<T>) {
  return engine.transaction((e) => run(adapter(e)));
}

describe('funded runtime schema and accounting boundary', () => {
  it('normal recovery still rejects 037; dedicated preflight accepts the exact 855-column catalog', async () => {
    await expect(
      tx((d) => assertReviewedPrivacyRecoverySchema(d)),
    ).rejects.toThrow(/columns/);
    const before = await tx((d) => captureFundedRuntime(d, input));
    expect(before.schema).toBe(37);
    expect(before.drained).toBe(true);
  });
  it('exercises all legacy narrative prompt pairs and the mandatory plan-review ceiling', () => {
    const c = fundedRuntimeCapabilities();
    expect(c.policies).toHaveLength(19);
    expect(c.policies).toContain('fiction-v8');
    expect(c.policies).toContain('fiction-v9');
    expect(c.fictionV9Policy).toEqual(fictionV9Policy());
    expect(c.characterStateVersion).toBe('1.0.0');
    expect(c.reviewedPolicy.maxPhysicalRequests).toBe(8);
  });
  it('rejects schema drift rather than adjusting expected fingerprints', async () => {
    await expect(
      engine.transaction(async (e) => {
        await e.exec('ALTER TABLE aw_periods ADD COLUMN surprise text');
        await captureFundedRuntime(adapter(e), input);
      }),
    ).rejects.toThrow(/columns/);
  });
  it('rejects unmatched Auth binding without producing new authority', async () => {
    await expect(
      tx((d) =>
        captureFundedRuntime(d, {
          ...input,
          participants: [{ email: 'other@example.invalid', userId: user }],
        }),
      ),
    ).rejects.toThrow();
  });
  it('rejects a reserved or unknown-cost call even when narrative flags would be off', async () => {
    for (const status of ['reserved', 'unknown'])
      await expect(
        engine.transaction(async (e) => {
          await e.query(
            `INSERT INTO aw_budget_reservations(id,user_id,project_key,user_key,job_id,model,task,reserved_micro,accounted_micro,status)
       VALUES($1,$2,'funded-project','funded-user',$3,'synthetic-model','synthetic-task',123,123,$4)`,
            [randomUUID(), user, randomUUID(), status],
          );
          await captureFundedRuntime(adapter(e), input);
        }),
      ).rejects.toThrow(/not drained/);
  });
  it('rejects tampered migration receipts before migration', async () => {
    await expect(
      engine.transaction(async (e) => {
        await e.query(
          "UPDATE ff_migrations SET checksum='tampered' WHERE name LIKE '037%'",
        );
        await captureFundedRuntime(adapter(e), input);
      }),
    ).rejects.toThrow(/checksums/);
  });
  it('rejects queued and held leases independently; accepts supported stored historical policy markers', async () => {
    let observed = 0;
    await expect(
      engine.transaction(async (e) => {
        const d = adapter(e);
        await d.query(
          "INSERT INTO ff_consents(id,user_id,policy_version,consent_type) VALUES(gen_random_uuid(),$1,'alpha-privacy-v1','adult_and_ai_acknowledgement')",
          [user],
        );
        await new LifeRepository(d).create(user, setupFixture(), randomUUID());
        await expect(captureFundedRuntime(d, input)).rejects.toThrow(
          /not drained/,
        );
        await d.query("UPDATE aw_branches SET status='ready'");
        await d.query(
          "UPDATE aw_jobs SET status='completed',lease_token=gen_random_uuid(),lease_until=now()+interval '1 minute'",
        );
        await expect(captureFundedRuntime(d, input)).rejects.toThrow(
          /not drained/,
        );
        await d.query('UPDATE aw_jobs SET lease_token=NULL,lease_until=NULL');
        for (const policy of [
          contextNarrativePolicy(),
          narrativeV1Policy(),
          reviewedNarrativePolicy(),
          fictionV1Policy(),
          fictionV2Policy(),
          fictionV3Policy(),
          fictionV4Policy(),
          fictionV5Policy(),
          fictionV6Policy(),
          fictionV6Quality25Policy(),
          fictionV7Policy(),
          fictionV8Policy(),
          fictionV9Policy(),
        ]) {
          await d.query(
            "UPDATE aw_jobs SET payload=jsonb_set(payload,'{narrativeContext}',$1::jsonb)",
            [JSON.stringify({ policy })],
          );
          expect((await captureFundedRuntime(d, input)).drained).toBe(true);
          observed++;
        }
        await d.query(
          "UPDATE aw_jobs SET payload=jsonb_set(payload,'{narrativeContext}',$1::jsonb)",
          [
            JSON.stringify({
              policy: { ...reviewedNarrativePolicy(), maxPhysicalRequests: 7 },
            }),
          ],
        );
        await expect(captureFundedRuntime(d, input)).rejects.toThrow();
        // A checkpoint snapshot the image cannot interpret blocks as well.
        await d.query(
          "UPDATE aw_jobs SET payload=jsonb_set(payload,'{narrativeContext}',$1::jsonb),checkpoints=$2::jsonb",
          [
            JSON.stringify({ policy: fictionV8Policy() }),
            JSON.stringify({
              policy: { ...fictionV8Policy(), mode: 'narrative-fiction-v9' },
            }),
          ],
        );
        await expect(captureFundedRuntime(d, input)).rejects.toThrow();
        throw Error('rollback synthetic job inventory');
      }),
    ).rejects.toThrow('rollback synthetic job inventory');
    expect(observed).toBe(13);
  });
  it('appends only migration 038 and preserves every existing data/accounting row', async () => {
    const before = await tx((d) => captureFundedRuntime(d, input));
    const after = await tx((d) => migrateFundedRuntime(d, input, before));
    expect(after.schema).toBe(38);
    expect(after.dataSha256).toBe(before.dataSha256);
    expect(after.artifactSha256).toBe(before.artifactSha256);
    const accounts = await engine.query(
      'SELECT limit_micro,accounted_micro FROM aw_budget_accounts ORDER BY id',
    );
    expect(accounts.rows).toEqual([
      { limit_micro: 2000000, accounted_micro: 188585 },
      { limit_micro: 500000, accounted_micro: 188585 },
    ]);
    expect(
      (
        await engine.query(
          'SELECT accounted_micro,input_tokens,output_tokens,status FROM aw_budget_reservations',
        )
      ).rows,
    ).toEqual([
      {
        accounted_micro: 188585,
        input_tokens: 321,
        output_tokens: 654,
        status: 'completed',
      },
    ]);
    await tx((d) => assertReviewedPrivacyRecoverySchema(d));
  });
  it('captures a stored v9 artifact and refuses missing character state without discarding history', async () => {
    const base = fictionFixture().input;
    const envelope = {
      version: '1.0.0' as const,
      state: emptyFictionCharacterState(),
      fictionalOrigins: [],
      suppliedActorIds: [],
      signals: {
        openThreadActors: [],
        goalOrOpportunityActors: [],
        overduePrivateLifeActors: [],
      },
    };
    const context = base.narrativeContext!;
    if (context.policy.mode !== 'narrative-fiction-v2')
      throw Error('Fiction required');
    context.policy = fictionV9Policy();
    context.characterProjection = fictionCharacterProjectionFromEnvelope(
      envelope,
      false,
    );
    base.fictionCharacters = envelope;
    const f = fictionFixture(base);
    const artifact = buildFictionArtifact(
      f.input,
      f.draft,
      f.authored,
      f.review,
      f.fidelity,
      f.editor,
      fictionProof(f),
    );
    for (const valid of [true, false]) {
      const stored = structuredClone(artifact);
      if (!valid) delete stored.characterDelta;
      await expect(
        engine.transaction(async (e) => {
          const d = adapter(e);
          await d.query(
            "INSERT INTO ff_consents(id,user_id,policy_version,consent_type) VALUES(gen_random_uuid(),$1,'alpha-privacy-v1','adult_and_ai_acknowledgement')",
            [user],
          );
          await new LifeRepository(d).create(
            user,
            setupFixture(),
            randomUUID(),
          );
          await d.query("UPDATE aw_branches SET status='ready'");
          await d.query(
            "UPDATE aw_jobs SET status='completed',lease_token=NULL,lease_until=NULL,payload=jsonb_set(payload,'{narrativeContext}',$1::jsonb),checkpoints=$2::jsonb",
            [
              JSON.stringify({ policy: fictionV9Policy() }),
              JSON.stringify({ policy: fictionV9Policy() }),
            ],
          );
          const inserted = await d.query(
            `INSERT INTO aw_periods(id,user_id,life_id,branch_id,period_no,base_revision,candidate,events,start_state,end_state,accepted_before,chapter,canon_hash,narrative_artifact)
          SELECT gen_random_uuid(),user_id,life_id,id,1,0,'{}','[]',state,state,'[]','{}','synthetic',$1::jsonb FROM aw_branches RETURNING id`,
            [JSON.stringify(stored)],
          );
          expect(inserted.length).toBeGreaterThan(0);
          if (valid)
            expect((await captureFundedRuntime(d, input)).schema).toBe(38);
          else
            await expect(captureFundedRuntime(d, input)).rejects.toThrow(
              /character/,
            );
          throw Error('rollback v9 artifact fixture');
        }),
      ).rejects.toThrow('rollback v9 artifact fixture');
    }
  });
  it('does not reset allowance or data to force a saved baseline to match', async () => {
    const before = await tx((d) => captureFundedRuntime(d, input));
    await expect(
      engine.transaction(async (e) => {
        await e.query(
          "UPDATE aw_budget_accounts SET accounted_micro=188586 WHERE id='funded-user'",
        );
        await migrateFundedRuntime(adapter(e), input, before);
      }),
    ).rejects.toThrow(/source drift/);
  });
});
