import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import type OpenAI from 'openai';
import { OpenAiProvider } from '@future-flow/ai';
import {
  LifeRepository,
  LifeJobRepository,
  Repository,
  DatabaseAiBudget,
  personalFictionContext,
  personalNarrativeMemory,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import {
  DomainError,
  fictionAuthorRequest,
  validateFictionAuthor,
  hash,
  preparePublicEditorSource,
  seriesClosingSentence,
  type SnapshotSourcePeriod,
} from '@future-flow/core';
import {
  fictionContextSchema,
  fictionV3Policy,
  fictionV4Policy,
  fictionV5Policy,
  fictionV6Policy,
  fictionV6Quality25Policy,
  FICTION_MODE,
  type FictionAuthorResult,
} from '@future-flow/contracts';
import { applyMigrations } from '../scripts/lib/migrations';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { setupFixture } from './life-fixtures';
import { fictionFixture, bulkyFictionFixture } from './fiction-fixtures';

let engine: PGlite, db: Database, jobs: LifeJobRepository, repo: Repository;
function adapter(client: Pick<PGlite, 'query' | 'transaction'>): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await client.query<T>(sql, values)).rows,
    transaction: (run) =>
      client.transaction((tx) => run(adapter(tx as unknown as PGlite))),
  };
}
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await applyMigrations(engine);
  db = adapter(engine);
  jobs = new LifeJobRepository(db);
  repo = new Repository(db);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.query(
    "UPDATE aw_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE status IN ('running','queued')",
  );
});
afterAll(async () => {
  await engine?.close();
});
async function fixture() {
  const owner = randomUUID();
  await repo.ensureUser(owner);
  await repo.acceptPrivacy(owner);
  const lives = new LifeRepository(
    db,
    { daily: 100, concurrent: 10 },
    { mode: FICTION_MODE, cohortUserIds: [owner] },
  );
  const created = await lives.create(owner, setupFixture(), randomUUID());
  const job = (await jobs.claim())!;
  return { owner, lives, created, job, f: fictionFixture(job.payload) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function provider(
  f: Fixture,
  respond?: (task: string, ordinal: number, output: unknown) => unknown,
  budgetUsd = 10,
) {
  const parse = vi.fn(
    async (
      request: { model: string; text: { format: { name: string } } },
      _options?: { timeout?: number },
    ) => {
      const task = request.text.format.name,
        ordinal = parse.mock.calls.filter(
          (c) => c[0].text.format.name === task,
        ).length;
      const output =
        task === 'life_narrative_plan'
          ? f.f.draft
          : task === 'life_narrative_chapter'
            ? f.f.authored
            : task === 'life_narrative_plan_review'
              ? f.f.review
              : task === 'life_fidelity'
                ? f.f.fidelity
                : f.f.editor;
      return {
        status: 'completed',
        model: request.model,
        output_parsed: respond
          ? respond(task, ordinal, structuredClone(output))
          : output,
        usage: { input_tokens: 10, output_tokens: 20 },
      };
    },
  );
  const ai = new OpenAiProvider(
    {
      apiKey: 'offline-fiction-only',
      eventModel: 'gpt-6.1-sol',
      storyModel: 'gpt-6.1-sol',
      checkModel: 'gpt-6.1-sol',
      timeoutMs: 1000,
      maxOutputTokens: 12000,
      beforePhysicalRequest: () => jobs.admitNarrativeRequest(f.job),
      guard: new DatabaseAiBudget(
        db,
        f.owner,
        f.job.id,
        { projectUsd: budgetUsd, userUsd: budgetUsd },
        f.job.lease_token,
      ),
    },
    { responses: { parse } } as unknown as OpenAI,
  );
  return { ai, parse };
}
async function saved(job: LifeJob) {
  return (
    await db.query<LifeJob>('SELECT * FROM aw_jobs WHERE id=$1', [job.id])
  )[0]!;
}

describe('creative final author package through real guarded provider and database', () => {
  it.each([
    fictionV3Policy(),
    fictionV4Policy(),
    fictionV5Policy(),
    fictionV6Policy(),
    fictionV6Quality25Policy(),
  ])(
    'finishes an already queued $qualityPolicyVersion snapshot without upgrading its prompt/report policy',
    async (policy) => {
      const f = await fixture();
      if (
        f.job.payload.narrativeContext?.policy.mode !== 'narrative-fiction-v2'
      )
        throw Error();
      f.job.payload.narrativeContext.policy = policy;
      delete f.job.payload.narrativeContext.sequenceSignatureHistory;
      await db.query('UPDATE aw_jobs SET payload=$2 WHERE id=$1', [
        f.job.id,
        JSON.stringify(f.job.payload),
      ]);
      f.f = fictionFixture(f.job.payload);
      const p = provider(f);
      await processLifeJob(f.job, jobs, p.ai);
      const row = await saved(f.job);
      expect(row.status).toBe('completed');
      expect(p.parse).toHaveBeenCalledTimes(5);
      const [period] = await db.query<{
        narrative_artifact: {
          policy: unknown;
          editorialReport: { version: string };
        };
      }>('SELECT narrative_artifact FROM aw_periods WHERE id=$1', [
        f.job.payload.periodId,
      ]);
      expect(period!.narrative_artifact.policy).toEqual(policy);
      expect(period!.narrative_artifact.editorialReport.version).toBe(
        ['2.2.0', '2.3.0', '2.4.0', '2.5.0'].includes(
          policy.qualityPolicyVersion,
        )
          ? '1.2.0'
          : '1.1.0',
      );
    },
  );
  it('makes five calls, reviews AFTER authoring and atomically saves new fictional outcomes', async () => {
    const f = await fixture(),
      p = provider(f);
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse.mock.calls.map((c) => c[0].text.format.name)).toEqual([
      'life_narrative_plan',
      'life_narrative_chapter',
      'life_narrative_plan_review',
      'life_fidelity',
      'life_narrative_editor',
    ]);
    const [period] = await db.query(
      'SELECT candidate,narrative_artifact FROM aw_periods WHERE id=$1',
      [f.job.payload.periodId],
    );
    expect(period!.candidate).toEqual(f.f.authored.candidate);
    expect(period!.candidate).not.toEqual(f.f.draft.candidate);
    expect(
      (period!.narrative_artifact as { storyFacts: unknown }).storyFacts,
    ).toEqual(f.f.authored.storyFacts);
    expect((await saved(f.job)).checkpoints.providerRequestCount).toBe(5);
    const request = p.parse.mock.calls[1]![0] as unknown as {
      text: {
        format: {
          schema: {
            properties: {
              plan: { properties: { decisionPattern: { pattern: string } } };
            };
          };
        };
      };
    };
    expect(
      request.text.format.schema.properties.plan.properties.decisionPattern
        .pattern,
    ).toContain('[a-z]');
    expect(
      p.parse.mock.calls.every((call) => call[1]?.timeout === 180000),
    ).toBe(true);
  });
  it('repairs prose once in eight calls and reuses the exact reviewed final material', async () => {
    const f = await fixture(),
      p = provider(f, (task, n, output) => {
        if (task === 'life_narrative_editor' && n === 1)
          return { ...f.f.editor, scores: { ...f.f.editor.scores, prose: 3 } };
        return output;
      });
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse).toHaveBeenCalledTimes(8);
    expect(
      p.parse.mock.calls.filter(
        (c) => c[0].text.format.name === 'life_narrative_plan_review',
      ),
    ).toHaveLength(1);
    expect((await saved(f.job)).status).toBe('completed');
  });
  it('allows one late structural repair, reruns final review and stays within nine calls', async () => {
    const f = await fixture(),
      p = provider(f, (task, n, output) => {
        if (task === 'life_narrative_editor' && n === 1)
          return {
            ...f.f.editor,
            issues: [
              {
                dimension: 'novelty',
                severity: 'major',
                repairScope: 'canon',
                paragraphIndex: null,
                eventIds: [],
                explanation:
                  'The final dilemma repeats the earlier decision without a consequence.',
                suggestedFix:
                  'Create a distinct new consequence within the existing user boundaries.',
              },
            ],
            verdict: 'revise',
          };
        return output;
      });
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse).toHaveBeenCalledTimes(9);
    expect(
      p.parse.mock.calls.filter(
        (c) => c[0].text.format.name === 'life_narrative_plan_review',
      ),
    ).toHaveLength(2);
  });
  it('routes structural repetition to package repair even with a misleading perfect score and empty issues', async () => {
    const f = await fixture(),
      p = provider(f, (task, n, output) => {
        if (task === 'life_narrative_editor' && n === 1)
          return {
            ...f.f.editor,
            sequenceReview: {
              ...f.f.editor.sequenceReview,
              distinctDramaticStructure: false,
            },
          };
        return output;
      });
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse).toHaveBeenCalledTimes(9);
    expect(
      p.parse.mock.calls.filter(
        (c) => c[0].text.format.name === 'life_narrative_plan_review',
      ),
    ).toHaveLength(2);
    expect((await saved(f.job)).status).toBe('completed');
  });
  for (const flag of [
    'systemMechanicsInvisible',
    'distinctRhetoricalShape',
    'distinctEnding',
    'behavioralVariety',
  ] as const)
    it(`repairs default v8 ${flag} with the correct bounded stage sequence`, async () => {
      const f = await fixture();
      expect(f.job.payload.narrativeContext!.policy.promptVersions.writer).toBe(
        'life_fiction_author.v8',
      );
      const p = provider(f, (task, n, output) => {
        if (task === 'life_narrative_editor' && n === 1)
          return {
            ...f.f.editor,
            verdict: 'revise',
            sequenceReview: { ...f.f.editor.sequenceReview, [flag]: false },
            issues: [
              {
                dimension: 'novelty',
                severity: 'major',
                repairScope: flag === 'behavioralVariety' ? 'canon' : 'prose',
                paragraphIndex: null,
                eventIds: [],
                explanation:
                  'The current chapter repeats a prior sequence mechanism without a meaningful change.',
                suggestedFix:
                  'Change the repeated feature while retaining fixed boundaries and valid continuity.',
              },
            ],
          };
        return output;
      });
      await processLifeJob(f.job, jobs, p.ai);
      expect(p.parse).toHaveBeenCalledTimes(
        flag === 'behavioralVariety' ? 9 : 8,
      );
      expect(
        p.parse.mock.calls.filter(
          (c) => c[0].text.format.name === 'life_narrative_plan_review',
        ),
      ).toHaveLength(flag === 'behavioralVariety' ? 2 : 1);
      expect((await saved(f.job)).status).toBe('completed');
    });
  function repeatedEnding(f: Fixture) {
    return {
      ...f.f.editor,
      verdict: 'revise' as const,
      sequenceReview: {
        ...f.f.editor.sequenceReview,
        distinctEnding: false,
        distinctRhetoricalShape: false,
      },
      issues: [
        {
          dimension: 'prose',
          severity: 'minor',
          repairScope: 'prose',
          paragraphIndex: 1,
          eventIds: [],
          explanation:
            'The ending repeats a public-space interruption of an unresolved artistic thought.',
          suggestedFix:
            'END_DIFFERENTLY: retain the changed sightline rather than another visitor needing space.',
        },
      ],
    };
  }
  function repairMessage(p: ReturnType<typeof provider>) {
    const raw = p.parse.mock.calls.at(-1)![0] as unknown as {
      input: { role: string; content: string }[];
    };
    return JSON.parse(raw.input.find((i) => i.role === 'user')!.content)
      .authorRepair;
  }
  it('coordinates fidelity and repeated-ending feedback in one nine-call full-package repair', async () => {
    const f = await fixture(),
      actor = randomUUID();
    let fixedEnding = false;
    f.f.authored.chapter.body +=
      '\n\nThe attendant opens the door. Later the attendant returns. You clear the chair for another visitor.';
    const a = structuredClone(f.f.authored);
    a.candidate.events[0]!.changes.push({
      type: 'actor_add',
      value: {
        id: actor,
        label: 'Laundrette attendant',
        relationship: 'other',
      },
    });
    a.candidate.events[0]!.actorIds.push(actor);
    a.plan.scenes[0]!.actorIds.push(actor);
    a.chapter.body = a.chapter.body.replace(
      'You clear the chair for another visitor.',
      'The new sightline ends at your own shoulder.',
    );

    validateFictionAuthor(f.job.payload, a);
    const p = provider(f, (task, n, output) => {
      if (task === 'life_fidelity' && n === 1)
        return {
          valid: false,
          issues: [
            {
              chapterNo: 1,
              reason:
                'REGISTER_ATTENDANT: a recurring unnamed actor needs actor_add in the first event.',
            },
          ],
        };
      if (task === 'life_narrative_editor')
        return fixedEnding ? output : repeatedEnding(f);
      if (task === 'life_narrative_chapter' && n === 2) {
        const feedback = repairMessage(p);
        expect(feedback.mode).toBe('author_package');
        expect(feedback.message).toContain('REGISTER_ATTENDANT');
        expect(feedback.message).toContain('END_DIFFERENTLY');
        expect(feedback.message.length).toBeLessThanOrEqual(1800);
        fixedEnding = true;
        return a;
      }
      return output;
    });
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse.mock.calls.map((c) => c[0].text.format.name)).toEqual([
      'life_narrative_plan',
      'life_narrative_chapter',
      'life_narrative_plan_review',
      'life_fidelity',
      'life_narrative_editor',
      'life_narrative_chapter',
      'life_narrative_plan_review',
      'life_fidelity',
      'life_narrative_editor',
    ]);
    const done = await saved(f.job);
    expect(done.status).toBe('completed');
    expect(done.checkpoints.providerRequestCount).toBe(9);
    expect(done.checkpoints.repairUsed).toBe(true);
    const [period] = await db.query<{
      candidate: FictionAuthorResult['candidate'];
      chapter: FictionAuthorResult['chapter'];
    }>('SELECT candidate,chapter FROM aw_periods WHERE id=$1', [
      f.job.payload.periodId,
    ]);
    expect(period!.candidate.events[0]!.changes).toContainEqual({
      type: 'actor_add',
      value: {
        id: actor,
        label: 'Laundrette attendant',
        relationship: 'other',
      },
    });
    expect(period!.chapter.body).toContain('new sightline');
  });
  it('keeps the measured quality2.4 fidelity-first failure reproducible', async () => {
    const f = await fixture();
    f.job.payload.narrativeContext!.policy = fictionV6Policy();
    await db.query('UPDATE aw_jobs SET payload=$2 WHERE id=$1', [
      f.job.id,
      JSON.stringify(f.job.payload),
    ]);
    f.f = fictionFixture(f.job.payload);
    const p = provider(f, (task, n, output) => {
      if (task === 'life_fidelity' && n === 1)
        return {
          valid: false,
          issues: [
            { chapterNo: 1, reason: 'Register the recurring attendant.' },
          ],
        };
      if (task === 'life_narrative_editor') return repeatedEnding(f);
      return output;
    });
    await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_QUALITY_FAILED',
    });
    expect(p.parse).toHaveBeenCalledTimes(8);
    expect(
      p.parse.mock.calls.filter(
        (c) => c[0].text.format.name === 'life_narrative_editor',
      ),
    ).toHaveLength(1);
    expect(
      await db.query('SELECT id FROM aw_periods WHERE id=$1', [
        f.job.payload.periodId,
      ]),
    ).toHaveLength(0);
  });
  it.each([
    'FICTION_FIDELITY_RESULT',
    'FICTION_EDITOR_RESULT',
    'FICTION_REPAIR_STARTED',
  ] as const)(
    'resumes coordinated checks after %s without duplicated work or another repair',
    async (crashStage) => {
      const f = await fixture();
      const p = provider(f, (task, n, output) => {
        if (task === 'life_fidelity' && n === 1)
          return {
            valid: false,
            issues: [
              { chapterNo: 1, reason: 'Correct the recurring-actor state.' },
            ],
          };
        if (task === 'life_narrative_editor' && n === 1)
          return repeatedEnding(f);
        return output;
      });
      const original = jobs.checkpoint.bind(jobs);
      let crashed = false;
      const checkpoint = vi
        .spyOn(jobs, 'checkpoint')
        .mockImplementation(async (job, stage, patch) => {
          await original(job, stage, patch);
          if (!crashed && stage === crashStage) {
            crashed = true;
            throw new Error('Simulated combined-check crash');
          }
        });
      await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toThrow(
        'Simulated combined-check crash',
      );
      expect(p.parse).toHaveBeenCalledTimes(
        crashStage === 'FICTION_FIDELITY_RESULT' ? 4 : 5,
      );
      if (crashStage === 'FICTION_REPAIR_STARTED')
        expect((await saved(f.job)).checkpoints.repairUsed).toBe(true);
      else expect((await saved(f.job)).checkpoints.repairUsed).not.toBe(true);
      checkpoint.mockRestore();
      f.job = await saved(f.job);
      await processLifeJob(f.job, jobs, p.ai);
      expect(p.parse).toHaveBeenCalledTimes(9);
      expect(
        p.parse.mock.calls.filter(
          (c) => c[0].text.format.name === 'life_narrative_editor',
        ),
      ).toHaveLength(2);
      expect((await saved(f.job)).status).toBe('completed');
    },
  );
  it('preserves four repair slots instead of speculating after an earlier admission', async () => {
    const f = await fixture();
    await jobs.checkpoint(f.job, 'EARLIER_ADMISSION', {
      providerRequestCount: 1,
    });
    const p = provider(f, (task, n, output) =>
      task === 'life_fidelity' && n === 1
        ? {
            valid: false,
            issues: [{ chapterNo: 1, reason: 'Correct a calendar word.' }],
          }
        : output,
    );
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse).toHaveBeenCalledTimes(8);
    expect(
      p.parse.mock.calls.filter(
        (c) => c[0].text.format.name === 'life_narrative_editor',
      ),
    ).toHaveLength(1);
    expect((await saved(f.job)).checkpoints.providerRequestCount).toBe(9);
  });
  it('does not buy a partial package repair when fewer than four calls remain', async () => {
    const f = await fixture();
    await jobs.checkpoint(f.job, 'EARLIER_ADMISSIONS', {
      providerRequestCount: 2,
    });
    const p = provider(f, (task, n, output) =>
      task === 'life_fidelity' && n === 1
        ? {
            valid: false,
            issues: [{ chapterNo: 1, reason: 'Correct a calendar word.' }],
          }
        : output,
    );
    await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_REQUEST_LIMIT',
    });
    expect(p.parse).toHaveBeenCalledTimes(4);
    expect((await saved(f.job)).checkpoints.repairUsed).not.toBe(true);
    expect(
      await db.query('SELECT id FROM aw_periods WHERE id=$1', [
        f.job.payload.periodId,
      ]),
    ).toHaveLength(0);
  });
  it.each([
    'AI_PROVIDER_FAILED',
    'AI_AUTH_FAILED',
    'AI_BUDGET_EXCEEDED',
    'LIFE_REVISION_CONFLICT',
  ] as const)(
    'never hides %s from speculative editing as a content repair',
    async (errorCode) => {
      const f = await fixture();
      const p = provider(f, (task, n, output) => {
        if (task === 'life_fidelity' && n === 1)
          return {
            valid: false,
            issues: [{ chapterNo: 1, reason: 'Correct an actor.' }],
          };
        if (task === 'life_narrative_editor')
          throw new DomainError(errorCode, 'Synthetic boundary rejection');
        return output;
      });
      await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
        code: errorCode,
      });
      expect(p.parse).toHaveBeenCalledTimes(5);
      expect((await saved(f.job)).checkpoints.repairUsed).not.toBe(true);
      expect(
        await db.query('SELECT id FROM aw_periods WHERE id=$1', [
          f.job.payload.periodId,
        ]),
      ).toHaveLength(0);
    },
  );
  it('does not let a repeated final failure through after one coordinated repair', async () => {
    const f = await fixture();
    const p = provider(f, (task, n, output) => {
      if (task === 'life_fidelity' && n === 1)
        return {
          valid: false,
          issues: [{ chapterNo: 1, reason: 'Register a returning actor.' }],
        };
      return task === 'life_narrative_editor' ? repeatedEnding(f) : output;
    });
    await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_QUALITY_FAILED',
    });
    expect(p.parse).toHaveBeenCalledTimes(9);
    expect(
      await db.query('SELECT id FROM aw_periods WHERE id=$1', [
        f.job.payload.periodId,
      ]),
    ).toHaveLength(0);
  });
  it('keeps both checkers visible within the existing 1800-character feedback bound', async () => {
    const f = await fixture();
    let messageSeen = '';
    const p = provider(f, (task, n, output) => {
      if (task === 'life_fidelity' && n === 1)
        return {
          valid: false,
          issues: Array.from({ length: 4 }, () => ({
            chapterNo: 1,
            reason: 'REGISTER_ACTOR ' + 'x'.repeat(275),
          })),
        };
      if (task === 'life_narrative_editor' && n === 1) {
        const bad = repeatedEnding(f);
        return {
          ...bad,
          issues: Array.from({ length: 4 }, () => ({
            ...bad.issues[0],
            explanation: 'ENDING_REPEAT ' + 'y'.repeat(270),
          })),
        };
      }
      if (task === 'life_narrative_chapter' && n === 2)
        messageSeen = repairMessage(p).message;
      return output;
    });
    await processLifeJob(f.job, jobs, p.ai);
    expect(messageSeen.length).toBeLessThanOrEqual(1800);
    expect(messageSeen).toContain('Fidelity:');
    expect(messageSeen).toContain('REGISTER_ACTOR');
    expect(messageSeen).toContain('Editor:');
    expect(messageSeen).toContain('distinctEnding');
    expect(messageSeen).toContain('ENDING_REPEAT');
    expect(messageSeen).toContain('[clipped]');
    expect(p.parse).toHaveBeenCalledTimes(9);
  });
  it('stops after a second quality failure without a partial period', async () => {
    const f = await fixture(),
      p = provider(f, (task, _n, output) =>
        task === 'life_narrative_editor'
          ? { ...f.f.editor, scores: { ...f.f.editor.scores, sceneCraft: 3 } }
          : output,
      );
    await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_QUALITY_FAILED',
    });
    expect(p.parse).toHaveBeenCalledTimes(8);
    expect(
      await db.query('SELECT id FROM aw_periods WHERE id=$1', [
        f.job.payload.periodId,
      ]),
    ).toHaveLength(0);
  });
  it.each([
    'FICTION_DRAFT_RESULT',
    'FICTION_AUTHOR_RESULT',
    'FICTION_FINAL_REVIEW_RESULT',
    'FICTION_FIDELITY_RESULT',
    'FICTION_EDITOR_RESULT',
    'FICTION_READY_TO_COMMIT',
  ])(
    'resumes after %s without repeating saved provider work',
    async (stage) => {
      const f = await fixture(),
        p = provider(f),
        original = jobs.checkpoint.bind(jobs);
      let crashed = false;
      vi.spyOn(jobs, 'checkpoint').mockImplementation(async (job, s, patch) => {
        await original(job, s, patch);
        if (!crashed && s === stage) {
          crashed = true;
          throw new Error('Simulated crash');
        }
      });
      await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toThrow(
        'Simulated crash',
      );
      const callsBefore = p.parse.mock.calls.length;
      vi.restoreAllMocks();
      const recovered = await saved(f.job);
      f.job = recovered;
      await processLifeJob(recovered, jobs, p.ai);
      expect(callsBefore + p.parse.mock.calls.length).toBe(5);
      expect((await saved(recovered)).status).toBe('completed');
    },
  );
  it('blocks another physical call at the ceiling and monetary admission before transport', async () => {
    const f = await fixture(),
      p = provider(f);
    await jobs.checkpoint(f.job, 'TEST_CAP', { providerRequestCount: 9 });
    await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_REQUEST_LIMIT',
    });
    expect(p.parse).not.toHaveBeenCalled();
    const g = await fixture(),
      q = provider(g, undefined, 0);
    await expect(processLifeJob(g.job, jobs, q.ai)).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(q.parse).not.toHaveBeenCalled();
  });
  it('rejects a prose-only repair that changes a lasting fact', async () => {
    const f = await fixture(),
      p = provider(f, (task, n, output) => {
        if (task === 'life_narrative_editor' && n === 1)
          return { ...f.f.editor, scores: { ...f.f.editor.scores, prose: 3 } };
        if (task === 'life_narrative_chapter' && n === 2) {
          const a = output as FictionAuthorResult;
          a.storyFacts[0]!.assertion += ' Changed the actual drawing.';
          return a;
        }
        return output;
      });
    await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_QUALITY_FAILED',
    });
    expect(p.parse).toHaveBeenCalledTimes(6);
  });
  it('folds committed fiction into the next queued chapter and blocks incompatible fallback', async () => {
    const f = await fixture(),
      p = provider(f);
    await processLifeJob(f.job, jobs, p.ai);
    const detail = await f.lives.detail(f.owner, f.job.branch_id),
      decision = detail.branch.pending_decision!;
    await f.lives.choose(
      f.owner,
      detail.branch.id,
      detail.branch.revision,
      decision.id,
      decision.options[0]!.id,
      randomUUID(),
    );
    const ready = await f.lives.branch(f.owner, detail.branch.id);
    const legacy = new LifeRepository(db, { daily: 100, concurrent: 10 });
    await expect(
      legacy.continue(f.owner, ready.id, ready.revision, randomUUID()),
    ).rejects.toMatchObject({ code: 'NARRATIVE_CONTEXT_INVALID' });
    await f.lives.continue(f.owner, ready.id, ready.revision, randomUUID());
    const next = (await jobs.claim())!;
    expect(next.payload.narrativeContext?.policy.mode).toBe(FICTION_MODE);
    if (next.payload.narrativeContext?.policy.mode !== FICTION_MODE)
      throw Error();
    expect(
      fictionContextSchema.parse(next.payload.narrativeContext).sequenceHistory,
    ).toMatchObject([
      {
        periodId: f.job.payload.periodId,
        opening: f.f.authored.chapter.body.slice(0, 400),
        ending: f.f.authored.chapter.body.slice(-500),
      },
    ]);
    expect(
      fictionContextSchema.parse(next.payload.narrativeContext)
        .sequenceHistory?.[0]?.scenes[0],
    ).toContain(f.f.authored.plan.scenes[0]!.shift.slice(0, 90));
    expect(next.payload.narrativeContext.storyFacts).toEqual(
      f.f.authored.storyFacts,
    );
    // quality2.7: the committed chapter feeds the deterministic series ledger.
    const ledger = fictionContextSchema.parse(
      next.payload.narrativeContext,
    ).seriesLedger;
    expect(ledger).toMatchObject({ version: '1.0.0', ownedChapters: 1 });
    expect(ledger?.recentClosings).toEqual([
      {
        periodId: f.job.payload.periodId,
        sentence: seriesClosingSentence(f.f.authored.chapter.body),
      },
    ]);
    expect(ledger?.goalActivity.length).toBeGreaterThan(0);
    // The default chapter stores report 1.3.0; its 1.1.0 signature is the
    // next chapter's series-level pattern history.
    expect(
      fictionContextSchema.parse(next.payload.narrativeContext)
        .sequenceSignatureHistory,
    ).toEqual([
      { ...f.f.editor.sequenceSignature, periodId: f.job.payload.periodId },
    ]);
    expect(
      fictionContextSchema.parse(next.payload.narrativeContext)
        .sequenceSignatureHistory?.[0]?.version,
    ).toBe('1.1.0');
    expect(
      hash(
        fictionAuthorRequest(next.payload, fictionFixture(next.payload).draft),
      ),
    ).not.toBe(hash(fictionAuthorRequest(f.job.payload, f.f.draft)));
  });
  it('does not load fiction assertions in withheld context', async () => {
    const f = await fixture(),
      p = provider(f);
    await processLifeJob(f.job, jobs, p.ai);
    const memory = await personalNarrativeMemory(
      db,
      f.owner,
      f.job.branch_id,
      1,
      [],
      true,
      true,
    );
    const spy = vi.spyOn(db, 'query');
    const c = await personalFictionContext(
      db,
      f.owner,
      f.job.branch_id,
      memory,
    );
    expect(c.storyFacts).toEqual([]);
    expect(c.sequenceHistory ?? []).toEqual([]);
    expect(c.sequenceSignatureHistory ?? []).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
  it('inherits only the owned fork prefix and remembers the alternative accepted option', async () => {
    const f = await fixture();
    await processLifeJob(f.job, jobs, provider(f).ai);
    const first = await f.lives.detail(f.owner, f.job.branch_id),
      decision = first.branch.pending_decision!;
    await f.lives.choose(
      f.owner,
      first.branch.id,
      first.branch.revision,
      decision.id,
      decision.options[0]!.id,
      randomUUID(),
    );
    const b = await f.lives.branch(f.owner, first.branch.id);
    await f.lives.continue(f.owner, b.id, b.revision, randomUUID());
    const secondJob = (await jobs.claim())!;
    const second = {
      ...f,
      job: secondJob,
      f: fictionFixture(secondJob.payload),
    };
    second.f.authored.storyFacts[0]!.supersedesFactId =
      f.f.authored.storyFacts[0]!.id;
    await processLifeJob(secondJob, jobs, provider(second).ai);
    const parent = await f.lives.branch(f.owner, b.id);
    const fork = await f.lives.fork(
      f.owner,
      b.id,
      f.job.payload.periodId,
      parent.revision,
      decision.options[1]!.id,
      randomUUID(),
    );
    const child = (await jobs.claim())!;
    expect(child.branch_id).toBe(fork.branchId);
    if (child.payload.narrativeContext?.policy.mode !== FICTION_MODE)
      throw Error();
    expect(child.payload.narrativeContext.storyFacts.map((x) => x.id)).toEqual(
      f.f.authored.storyFacts.map((x) => x.id),
    );
    expect(
      child.payload.fictionReferences!.facts.map((x) => x.id),
    ).not.toContain(second.f.authored.storyFacts[0]!.id);
    const context = fictionContextSchema.parse(child.payload.narrativeContext);
    expect(context.sequenceHistory!.map((p) => p.periodId)).toEqual([
      f.job.payload.periodId,
    ]);
    expect(context.sequenceSignatureHistory!.map((p) => p.periodId)).toEqual([
      f.job.payload.periodId,
    ]);
    expect(
      context.sequenceSignatureHistory!.map((p) => p.periodId),
    ).not.toContain(secondJob.payload.periodId);
    expect(
      child.payload.narrativeContext.memory.recentChoices.at(-1)!.optionId,
    ).toBe(decision.options[1]!.id);
    const childFixture = { ...f, job: child, f: fictionFixture(child.payload) };
    await processLifeJob(child, jobs, provider(childFixture).ai);
    expect((await f.lives.detail(f.owner, b.id)).periods).toHaveLength(2);
  });
  it('preserves acceptance chronology and timestamps across a two-choice fork', async () => {
    const f = await fixture();
    await processLifeJob(f.job, jobs, provider(f).ai);
    const first = await f.lives.detail(f.owner, f.job.branch_id),
      d0 = first.branch.pending_decision!;
    await f.lives.choose(
      f.owner,
      first.branch.id,
      first.branch.revision,
      d0.id,
      d0.options[0]!.id,
      randomUUID(),
    );
    const parentReady = await f.lives.branch(f.owner, first.branch.id);
    await f.lives.continue(
      f.owner,
      parentReady.id,
      parentReady.revision,
      randomUUID(),
    );
    const secondJob = (await jobs.claim())!,
      second = { ...f, job: secondJob, f: fictionFixture(secondJob.payload) };
    await processLifeJob(secondJob, jobs, provider(second).ai);
    const parent = await f.lives.detail(f.owner, first.branch.id),
      d1 = parent.branch.pending_decision!;
    const fork = await f.lives.fork(
      f.owner,
      parent.branch.id,
      secondJob.payload.periodId,
      parent.branch.revision,
      d1.options[1]!.id,
      randomUUID(),
    );
    const child = (await jobs.claim())!;
    const [timestamps] = await db.query<{ original: Date; inherited: Date }>(
      'SELECT a.created_at AS original,b.created_at AS inherited FROM aw_choices a JOIN aw_choices b ON b.decision_id=a.decision_id WHERE a.branch_id=$1 AND b.branch_id=$2 AND a.decision_id=$3',
      [parent.branch.id, fork.branchId, d0.id],
    );
    expect(new Date(timestamps!.inherited).toISOString()).toBe(
      new Date(timestamps!.original).toISOString(),
    );
    expect(
      fictionContextSchema
        .parse(child.payload.narrativeContext)
        .memory.recentChoices.at(-1)?.decisionId,
    ).toBe(d1.id);
    expect(child.payload.memory.choices.at(-1)).toMatchObject({
      decision_id: d1.id,
    });
    const branch = await f.lives.branch(f.owner, fork.branchId);
    const memory = await personalNarrativeMemory(
      db,
      f.owner,
      fork.branchId,
      branch.revision,
      branch.accepted_decision_ids,
      false,
      true,
    );
    expect(memory.recentChoices.map((c) => c.decisionId)).toEqual([
      d0.id,
      d1.id,
    ]);
    expect(
      (await f.lives.detail(f.owner, fork.branchId)).choices.map(
        (c) => c.decision_id,
      ),
    ).toEqual([d0.id, d1.id]);
  });
  it('keeps fictional NPC provenance and voice across a subsequent queued period', async () => {
    const f = await fixture(),
      a = f.f.authored,
      id = randomUUID(),
      event = a.candidate.events[0]!;
    event.changes.push({
      type: 'actor_add',
      value: { id, label: 'Mara', relationship: 'other' },
    });
    event.actorIds.push(id);
    a.plan.scenes[0]!.actorIds.push(id);
    a.plan.memoryDelta.actorUpdates.push({
      actorId: id,
      introducedByEventId: event.id,
      role: 'A wholly fictional independent gallery organiser.',
      desire: 'Wants a clear small selection that visitors can read.',
      resistance: 'Dislikes having to explain every image to visitors.',
      voiceCue: 'Speaks in short concrete visual questions.',
      lastSeenPeriodId: a.candidate.periodId,
    });
    a.storyFacts[0]!.aboutActorIds = [id];
    await processLifeJob(f.job, jobs, provider(f).ai);
    const d = await f.lives.detail(f.owner, f.job.branch_id),
      decision = d.branch.pending_decision!;
    await f.lives.choose(
      f.owner,
      d.branch.id,
      d.branch.revision,
      decision.id,
      decision.options[0]!.id,
      randomUUID(),
    );
    const b = await f.lives.branch(f.owner, d.branch.id);
    await f.lives.continue(f.owner, b.id, b.revision, randomUUID());
    const job = (await jobs.claim())!;
    expect(
      job.payload.narrativeContext!.memory.fictionalActors[0]!.actorId,
    ).toBe(id);
    expect(
      job.payload.narrativeContext!.memory.fictionalActors[0]!.voiceCue,
    ).toContain('visual questions');
    expect(job.payload.input.initialState.actors.some((x) => x.id === id)).toBe(
      false,
    );
  });
  it('exports the correct artifact version only to its owner, excludes it from public preparation and deletes it', async () => {
    const f = await fixture();
    await processLifeJob(f.job, jobs, provider(f).ai);
    const own = await repo.exportAccount(f.owner);
    expect(own.narrativeArtifactVersion).toBe('2.0.0');
    expect(
      (own.aw_periods as { narrative_artifact: { storyFacts: unknown } }[])[0]!
        .narrative_artifact.storyFacts,
    ).toEqual(f.f.authored.storyFacts);
    const other = randomUUID();
    await repo.ensureUser(other);
    expect((await repo.exportAccount(other)).aw_periods).toEqual([]);
    const detail = await f.lives.detail(f.owner, f.job.branch_id);
    expect(detail.periods[0]).not.toHaveProperty('narrative_artifact');
    expect(detail.job).not.toHaveProperty('checkpoints');
    const publicSource = preparePublicEditorSource(
      detail.branch.input,
      detail.periods as unknown as SnapshotSourcePeriod[],
      detail.branch.revision,
    );
    expect(JSON.stringify(publicSource)).not.toContain(
      f.f.authored.storyFacts[0]!.id,
    );
    await repo.markDeleting(f.owner);
    await repo.deleteAccountData(f.owner);
    expect(
      await db.query('SELECT id FROM aw_periods WHERE user_id=$1', [f.owner]),
    ).toEqual([]);
  });
  it('rejects a creative checkpoint routed to the legacy path before transport', async () => {
    const f = await fixture(),
      p = provider(f);
    f.job.checkpoints.pipelineVersion = FICTION_MODE;
    delete f.job.payload.narrativeContext;
    await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_CONTEXT_INVALID',
    });
    expect(p.parse).not.toHaveBeenCalled();
  });
  it('compacts an oversized artifact with a package repair, not an impossible prose-only repair', async () => {
    const f = await fixture(),
      bulky = bulkyFictionFixture(f.f);
    const p = provider(f, (task, n, output) => {
      if (n !== 1) return output;
      if (task === 'life_narrative_chapter') return bulky.authored;
      if (task === 'life_narrative_plan_review') return bulky.review;
      if (task === 'life_narrative_editor') return bulky.editor;
      return output;
    });
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse).toHaveBeenCalledTimes(9);
    expect((await saved(f.job)).status).toBe('completed');
  });
});
