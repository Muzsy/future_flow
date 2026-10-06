import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type OpenAIClient from 'openai';
import { createRequire } from 'node:module';
import { OpenAiProvider } from '@future-flow/ai';
import {
  ScenarioReleaseRepository,
  Repository,
  scenarioReleaseConfigFromEnv,
  type Database,
} from '@future-flow/database';
import {
  SCENARIO_REVIEW_VERSION,
  scenarioReviewRequestSchema,
  officialScenarioSourceRequestSchema,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  prepareScenarioReviewInput,
  validateScenarioReviewReport,
} from '@future-flow/core';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
import { runScenarioReview } from '../scripts/lib/scenario-release';
import { scenarioFixture } from './scenario-fixtures';
import {
  scenarioReleaseFixture,
  completeScenarioFixture,
  scenarioDecision,
  scenarioGrant,
  scenarioReleaseTestConfig,
} from './scenario-release-fixtures';
let engine: PGlite, db: Database, app: INestApplication, base: string;
const users = new Set<string>();
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
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await applyMigrations(engine);
  db = adapter(engine);
  app = await createApp(
    new Repository(db),
    {
      verify: async (token) => {
        if (users.has(token)) return { id: token };
        throw new DomainError('AUTH_INVALID_TOKEN', 'Invalid.', 401);
      },
      deleteUser: async () => {},
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    true,
  );
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  await engine?.close();
});
async function fixture() {
  const f = await scenarioReleaseFixture(db);
  users.add(f.owner);
  return f;
}
async function approved() {
  const f = await fixture(),
    completed = await completeScenarioFixture(db, f, true);
  const curated = await f.release.decide(scenarioDecision(f, completed.view));
  return { f, completed, curated, request: scenarioGrant(f, curated) };
}
describe('Complete ScenarioVersion review and separate Official scenario source', () => {
  it('covers numbers/null/booleans/predicates with exact paths and rejects omitted/tampered input or reports', async () => {
    const input = prepareScenarioReviewInput(scenarioFixture());
    for (const path of [
      'startingState.finance.liquidFunds',
      'startingState.employment.employerLabel',
      'constraints.0.predicate.owned',
      'goals.0.status',
      'identity.ageBand',
    ])
      expect(input.fields.some((f) => f.path === path)).toBe(true);
    const report = {
      policyVersion: SCENARIO_REVIEW_VERSION,
      scope: 'complete_scenario_template',
      templateHash: hash(input.template),
      publicationApproved: false,
      verdict: 'no_findings',
      findings: [],
    };
    expect(validateScenarioReviewReport(report, input.template)).toEqual(
      report,
    );
    expect(() =>
      validateScenarioReviewReport(
        { ...report, templateHash: '1'.repeat(64) },
        input.template,
      ),
    ).toThrow();
    expect(() =>
      validateScenarioReviewReport(
        {
          ...report,
          verdict: 'review_required',
          findings: [
            {
              fieldKey: 'field-99999',
              category: 'meaning_mismatch',
              action: 'manual_review',
            },
          ],
        },
        input.template,
      ),
    ).toThrow();
    expect(
      scenarioReviewRequestSchema.safeParse({
        scenarioVersionId: randomUUID(),
        templateHash: hash(input.template),
        policyVersion: 'public-content-review-1',
        acknowledged: true,
      }).success,
    ).toBe(false);
  });
  it('defaults operator access off and requires real consent, strict requests and exact current hash', async () => {
    const f = await fixture();
    expect(scenarioReleaseConfigFromEnv({}).operatorEnabled).toBe(false);
    expect(() =>
      scenarioReleaseConfigFromEnv({
        SCENARIO_RELEASE_OPERATOR_ENABLED: 'yes',
      }),
    ).toThrow();
    await expect(
      new ScenarioReleaseRepository(db).start(f.owner, f.request),
    ).rejects.toMatchObject({ code: 'SCENARIO_RELEASE_DISABLED' });
    await expect(
      f.release.start(f.owner, { ...f.request, acknowledged: false }),
    ).rejects.toThrow();
    await expect(
      f.release.start(f.owner, { ...f.request, templateHash: '1'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'SCENARIO_RELEASE_INVALID' });
    await db.query('DELETE FROM ff_consents WHERE user_id=$1', [f.owner]);
    await expect(f.release.start(f.owner, f.request)).rejects.toMatchObject({
      code: 'PRIVACY_ACKNOWLEDGEMENT_REQUIRED',
    });
  });
  it('uses the checker, full input, no store, bounded output and server-assigned scope/hash metadata', async () => {
    const parse = vi.fn().mockResolvedValue({
      status: 'completed',
      model: 'gpt-6.1-sol',
      _request_id: 'test-only',
      usage: { input_tokens: 32, output_tokens: 12 },
      output_parsed: { verdict: 'no_findings', findings: [] },
    });
    const ai = new OpenAiProvider(
      {
        apiKey: 'test-only',
        eventModel: 'events',
        storyModel: 'stories',
        checkModel: 'gpt-6.1-sol',
        timeoutMs: 1000,
        maxOutputTokens: 12000,
      },
      { responses: { parse } } as unknown as OpenAIClient,
    );
    const input = prepareScenarioReviewInput(scenarioFixture()),
      result = await ai.reviewScenario(input);
    expect(result.output).toMatchObject({
      scope: 'complete_scenario_template',
      templateHash: hash(input.template),
      publicationApproved: false,
    });
    expect(result.receipt).toMatchObject({
      task: 'scenario_review',
      promptVersion: 'scenario_review.v1.en',
      inputHash: hash(input),
      outputHash: hash(result.output),
    });
    expect(parse.mock.calls[0]![0]).toMatchObject({
      model: 'gpt-6.1-sol',
      store: false,
      max_output_tokens: 2200,
    });
    expect(JSON.parse(parse.mock.calls[0]![0].input[1].content)).toEqual(input);
    await expect(
      ai.reviewScenario({ ...input, fields: input.fields.slice(1) }),
    ).rejects.toMatchObject({ code: 'SCENARIO_REVIEW_INVALID' });
    expect(parse).toHaveBeenCalledTimes(1);
  });
  it('does not retry transient provider failure and retains one durable failed attempt', async () => {
    const f = await fixture(),
      OpenAI = createRequire(import.meta.url)('openai').default;
    const parse = vi
      .fn()
      .mockRejectedValue(
        new OpenAI.InternalServerError(500, {}, 'Temporary', new Headers()),
      );
    const ai = new OpenAiProvider(
      {
        apiKey: 'test-only',
        eventModel: 'events',
        storyModel: 'stories',
        checkModel: 'gpt-6.1-sol',
        timeoutMs: 1000,
        maxOutputTokens: 2200,
      },
      { responses: { parse } } as unknown as OpenAIClient,
    );
    await expect(
      runScenarioReview(
        db,
        scenarioReleaseTestConfig,
        f.owner,
        f.request,
        () => ai,
      ),
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_FAILED' });
    expect(parse).toHaveBeenCalledTimes(1);
    expect((await f.release.get(f.owner, f.version.id)).review?.status).toBe(
      'failed',
    );
    await expect(
      runScenarioReview(
        db,
        scenarioReleaseTestConfig,
        f.owner,
        f.request,
        () => ai,
      ),
    ).rejects.toMatchObject({ code: 'SCENARIO_REVIEW_ALREADY_STARTED' });
    expect(parse).toHaveBeenCalledTimes(1);
  });
  it('reuses completed review without provider work, keeps immutable receipt and blocks a finding/ambiguity', async () => {
    const f = await fixture(),
      completed = await completeScenarioFixture(
        db,
        f,
        false,
        'unable_to_assess',
      ),
      create = vi.fn();
    expect(
      (
        await runScenarioReview(
          db,
          scenarioReleaseTestConfig,
          f.owner,
          f.request,
          create,
        )
      ).reused,
    ).toBe(true);
    expect(create).not.toHaveBeenCalled();
    await expect(
      f.release.decide(scenarioDecision(f, completed.view)),
    ).rejects.toMatchObject({ code: 'SCENARIO_RELEASE_INVALID' });
    await expect(
      db.query('UPDATE aw_scenario_reviews SET report_hash=$1 WHERE id=$2', [
        '1'.repeat(64),
        completed.started.reviewId,
      ]),
    ).rejects.toThrow();
  });
  it('checks receipt input/output binding and lease, and never commits after source revision changes', async () => {
    const f = await fixture(),
      started = await f.release.start(f.owner, f.request);
    const report = {
      policyVersion: SCENARIO_REVIEW_VERSION,
      scope: 'complete_scenario_template',
      templateHash: f.version.templateHash,
      publicationApproved: false,
      verdict: 'no_findings',
      findings: [],
    };
    const receipt = {
      task: 'scenario_review',
      promptVersion: 'scenario_review.v1.en',
      locale: 'en',
      model: 'isolated-no-provider',
      requestId: null,
      inputHash: hash(started.input),
      outputHash: hash(report),
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
    };
    await expect(
      f.release.complete(
        f.owner,
        f.version.id,
        started.reviewId,
        randomUUID(),
        report,
        receipt,
      ),
    ).rejects.toMatchObject({ code: 'SCENARIO_REVIEW_INTERRUPTED' });
    await expect(
      f.release.complete(
        f.owner,
        f.version.id,
        started.reviewId,
        started.leaseToken!,
        report,
        { ...receipt, inputHash: '1'.repeat(64) },
      ),
    ).rejects.toMatchObject({ code: 'SCENARIO_RELEASE_INVALID' });
    await f.scenarios.revise(
      f.owner,
      f.version.scenarioId,
      {
        expectedVersion: 1,
        expectedHash: f.version.templateHash,
        template: { ...scenarioFixture(), title: 'Another direction' },
      },
      randomUUID(),
    );
    await expect(
      f.release.complete(
        f.owner,
        f.version.id,
        started.reviewId,
        started.leaseToken!,
        report,
        receipt,
      ),
    ).rejects.toMatchObject({ code: 'SCENARIO_RELEASE_STALE' });
    const view = await f.release.get(f.owner, f.version.id);
    expect(view.current).toBe(false);
    expect(view.review?.status).toBe('failed');
  });
  it('fails an expired lease and includes scenario attempts in the common review allowance', async () => {
    const f = await fixture(),
      started = await f.release.start(f.owner, f.request);
    // Only this test may move the clock on a running fixture row.
    await engine.exec(
      'ALTER TABLE aw_scenario_reviews DISABLE TRIGGER aw_scenario_review_immutable',
    );
    try {
      await db.query(
        "UPDATE aw_scenario_reviews SET lease_until=now()-interval '1 second' WHERE id=$1",
        [started.reviewId],
      );
    } finally {
      await engine.exec(
        'ALTER TABLE aw_scenario_reviews ENABLE TRIGGER aw_scenario_review_immutable',
      );
    }
    expect((await f.release.get(f.owner, f.version.id)).review?.status).toBe(
      'failed',
    );
    const next = await f.scenarios.revise(
      f.owner,
      f.version.scenarioId,
      {
        expectedVersion: 1,
        expectedHash: f.version.templateHash,
        template: { ...scenarioFixture(), title: 'A revised life' },
      },
      randomUUID(),
    );
    await expect(
      new ScenarioReleaseRepository(db, {
        ...scenarioReleaseTestConfig,
        daily: 1,
      }).start(f.owner, {
        ...f.request,
        scenarioVersionId: next.id,
        templateHash: next.templateHash,
      }),
    ).rejects.toMatchObject({ code: 'PUBLIC_REVIEW_LIMIT' });
  });
  it('does not infer Official source from a clear technical review or curator decision', async () => {
    const f = await fixture(),
      completed = await completeScenarioFixture(db, f),
      curated = await f.release.decide(scenarioDecision(f, completed.view));
    expect(curated.review?.providerEvidence).toBe(false);
    expect(curated.sourceGrant).toBeNull();
    await expect(
      f.release.grant(scenarioGrant(f, curated)),
    ).rejects.toMatchObject({ code: 'OFFICIAL_SCENARIO_EVIDENCE_REQUIRED' });
    expect(curated.publicationApproved).toBe(false);
    expect(curated.officialLifeApproved).toBe(false);
  });
  it('requires a separate exact curator decision and explicit source/rights grant; replays once', async () => {
    const f = await fixture(),
      completed = await completeScenarioFixture(db, f, true),
      decision = scenarioDecision(f, completed.view);
    await expect(
      f.release.grant({
        ...scenarioGrant(f, {
          ...completed.view,
          curation: {
            id: randomUUID(),
            status: 'scenario_reviewed',
            reasonCode: null,
            curationVersion: 'scenario-curation-1',
          },
        }),
      }),
    ).rejects.toMatchObject({ code: 'OFFICIAL_SCENARIO_EVIDENCE_REQUIRED' });
    const curated = await f.release.decide(decision);
    expect((await f.release.decide(decision)).curation?.id).toBe(
      curated.curation?.id,
    );
    await expect(
      f.release.decide({
        ...decision,
        status: 'rejected',
        reasonCode: 'quality',
      }),
    ).rejects.toMatchObject({ code: 'SCENARIO_RELEASE_INVALID' });
    const request = scenarioGrant(f, curated);
    expect(
      officialScenarioSourceRequestSchema.safeParse({
        ...request,
        rightsChecked: false,
      }).success,
    ).toBe(false);
    const granted = await f.release.grant(request);
    expect(granted.sourceGrant).toMatchObject({
      status: 'active',
      usable: true,
    });
    expect((await f.release.grant(request)).sourceGrant?.id).toBe(
      granted.sourceGrant?.id,
    );
    expect(granted.publicationApproved).toBe(false);
    expect(granted.officialLifeApproved).toBe(false);
  });
  it('invalidates source eligibility on new version and permanently revokes without restoring via replay', async () => {
    const { f, request } = await approved(),
      granted = await f.release.grant(request);
    await f.scenarios.revise(
      f.owner,
      f.version.scenarioId,
      {
        expectedVersion: 1,
        expectedHash: f.version.templateHash,
        template: { ...scenarioFixture(), title: 'Different source version' },
      },
      randomUUID(),
    );
    expect(
      (await f.release.get(f.owner, f.version.id)).sourceGrant?.usable,
    ).toBe(false);
    const revoke = {
      grantId: granted.sourceGrant!.id,
      templateHash: f.version.templateHash,
      reasonCode: 'origin',
      actorLabel: 'Technical fixture moderator',
      acknowledged: true,
    };
    expect((await f.release.revoke(revoke)).sourceGrant?.status).toBe(
      'revoked',
    );
    expect((await f.release.revoke(revoke)).sourceGrant?.status).toBe(
      'revoked',
    );
    await expect(f.release.grant(request)).rejects.toMatchObject({
      code: 'SCENARIO_RELEASE_STALE',
    });
    await expect(
      db.query(
        "UPDATE aw_official_scenario_sources SET status='active' WHERE id=$1",
        [granted.sourceGrant!.id],
      ),
    ).rejects.toThrow();
  });
  it('checks private Auth/ownership and keeps paid, decision and grant actions out of HTTP', async () => {
    const f = await fixture(),
      other = await fixture();
    const path = `/api/v2/scenario-versions/${f.version.id}/release-review`;
    expect((await fetch(base + path)).status).toBe(401);
    expect(
      (
        await fetch(base + path, {
          headers: { Authorization: `Bearer ${other.owner}` },
        })
      ).status,
    ).toBe(404);
    const own = await fetch(base + path, {
      headers: { Authorization: `Bearer ${f.owner}` },
    });
    expect(own.status).toBe(200);
    expect(own.headers.get('cache-control')).toContain('no-store');
    const text = await own.text();
    expect(text).not.toContain(f.owner);
    expect(text).not.toContain('actor_label');
    for (const action of [
      'release-review',
      'release-review/decide',
      'official-source',
      'official-source/grant',
    ])
      expect(
        (
          await fetch(
            `${base}/api/v2/scenario-versions/${f.version.id}/${action}`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${f.owner}`,
                'Content-Type': 'application/json',
              },
              body: '{}',
            },
          )
        ).status,
      ).toBe(404);
  });
  it('includes export, cancels deletion work and never restores the source grant on account recovery', async () => {
    const { f, request } = await approved();
    await f.release.grant(request);
    const exported = await f.repo.exportAccount(f.owner);
    for (const name of [
      'aw_scenario_reviews',
      'aw_scenario_curations',
      'aw_official_scenario_sources',
    ])
      expect(exported[name]).toHaveLength(1);
    await f.repo.markDeleting(f.owner);
    await expect(f.release.get(f.owner, f.version.id)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETING',
    });
    await f.repo.restoreActive(f.owner);
    expect(
      (await f.release.get(f.owner, f.version.id)).sourceGrant?.status,
    ).toBe('revoked');
    expect((await f.release.grant(request)).sourceGrant?.status).toBe(
      'revoked',
    );
    const pending = await fixture();
    await pending.release.start(pending.owner, pending.request);
    await pending.repo.markDeleting(pending.owner);
    expect(
      (
        await db.query(
          'SELECT status FROM aw_scenario_reviews WHERE user_id=$1',
          [pending.owner],
        )
      )[0]!.status,
    ).toBe('cancelled');
    await pending.repo.restoreActive(pending.owner);
    await expect(
      pending.release.start(pending.owner, pending.request),
    ).rejects.toMatchObject({ code: 'SCENARIO_REVIEW_ALREADY_STARTED' });
    await f.repo.deleteAccountData(f.owner);
    for (const name of [
      'aw_scenario_reviews',
      'aw_scenario_curations',
      'aw_official_scenario_sources',
    ])
      expect(
        await db.query(`SELECT id FROM ${name} WHERE user_id=$1`, [f.owner]),
      ).toHaveLength(0);
  });
  it('enforces RLS/client revocation, immutable curation and source/scenario cascade', async () => {
    const { f, request, curated } = await approved();
    await f.release.grant(request);
    await expect(
      db.query(
        "UPDATE aw_scenario_curations SET status='rejected',reason_code='other' WHERE id=$1",
        [curated.curation!.id],
      ),
    ).rejects.toThrow();
    for (const table of [
      'aw_scenario_reviews',
      'aw_scenario_curations',
      'aw_official_scenario_sources',
    ]) {
      const [row] = await db.query(
        "SELECT c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'INSERT') AS client FROM pg_class c WHERE c.oid=$1::regclass",
        [table],
      );
      expect(row).toEqual({ rls: true, anon: false, client: false });
    }
    await db.query('DELETE FROM aw_scenarios WHERE id=$1', [
      f.version.scenarioId,
    ]);
    for (const table of [
      'aw_scenario_reviews',
      'aw_scenario_curations',
      'aw_official_scenario_sources',
    ])
      expect(
        await db.query(`SELECT id FROM ${table} WHERE user_id=$1`, [f.owner]),
      ).toHaveLength(0);
  });
});
