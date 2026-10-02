import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { OpenAiProvider } from '@future-flow/ai';
import {
  questionnaire,
  traitKeys,
  type ChapterOutput,
} from '@future-flow/contracts';
import { DomainError, hash } from '@future-flow/core';
import {
  Repository,
  JobRepository,
  type Database,
} from '@future-flow/database';
import { processJob } from '../apps/worker/src/processor';

// Real OpenAI requests, synthetic profile, isolated PostgreSQL engine.
// Never creates Supabase Auth accounts or writes personal data to Supabase.
const outputDirectory = resolve('.local/ai-smoke');
function adapter(client: Pick<PGlite, 'query' | 'transaction'>): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      text: string,
      values: unknown[] = [],
    ) => (await client.query<T>(text, values)).rows,
    transaction: (run) =>
      client.transaction((tx) => run(adapter(tx as unknown as PGlite))),
  };
}
async function main() {
  const ai = new OpenAiProvider({
    apiKey: process.env.OPENAI_API_KEY ?? '',
    eventModel: process.env.AI_EVENT_MODEL ?? '',
    storyModel: process.env.AI_STORY_MODEL ?? '',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 90000),
    maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 12000),
  });
  const engine = new PGlite(),
    db = adapter(engine),
    repo = new Repository(db),
    jobs = new JobRepository(db);
  let lastJobId: string | null = null;
  await mkdir(outputDirectory, { recursive: true });
  try {
    await engine.exec(
      readFileSync('database/migrations/001_foundation.sql', 'utf8'),
    );
    await db.query(
      'INSERT INTO ff_questionnaires(version,definition,definition_hash) VALUES($1,$2,$3)',
      [
        questionnaire.version,
        JSON.stringify(questionnaire),
        hash(questionnaire),
      ],
    );
    const userId = randomUUID();
    await repo.ensureUser(userId);
    await repo.acceptPrivacy(userId);
    const answers = {
      ageBand: '35_44',
      region: 'Pest',
      regionType: 'small_town',
      relationshipStatus: 'partnered',
      children: 1,
      employmentStatus: 'employed',
      workDomain: 'Műszaki terület',
      workSatisfaction: 38,
      financialStability: 67,
      housingStability: 81,
      relocationWillingness: 28,
      careerChangeWillingness: 61,
      ...Object.fromEntries(traitKeys.map((key) => [key, 50])),
      changeSeeking: 68,
      securityNeed: 79,
      values: ['family', 'security', 'autonomy'],
      goalCategory: 'career',
      goalTitle: 'Érdekesebb munka',
      noCloseRelationships: false,
    };
    const relationships = [
      {
        id: randomUUID(),
        label: 'Párom',
        type: 'partner' as const,
        closeness: 80,
        support: 78,
        conflict: 15,
      },
      {
        id: randomUUID(),
        label: 'Barát A',
        type: 'friend' as const,
        closeness: 65,
        support: 70,
        conflict: 5,
      },
    ];
    const saved = await repo.saveDraft(userId, 0, answers, relationships);
    const profile = await repo.commitProfile(userId, saved.revision);
    const created = await repo.createFuture(
      userId,
      profile.profileVersionId,
      randomUUID(),
    );
    async function runJob(expectedId: string) {
      lastJobId = expectedId;
      const job = await jobs.claim();
      if (!job || job.id !== expectedId)
        throw new DomainError(
          'SMOKE_JOB_MISMATCH',
          'Unexpected smoke test job.',
        );
      const heartbeat = setInterval(() => {
        void jobs.heartbeat(job).catch(() => {});
      }, 60000);
      try {
        await processJob(job, jobs, ai);
      } finally {
        clearInterval(heartbeat);
      }
      const status = await repo.job(userId, expectedId);
      if (status.status !== 'completed')
        throw new DomainError(
          'SMOKE_JOB_NOT_COMPLETED',
          'Smoke test job did not complete.',
        );
    }
    console.log(
      'Live AI: generating baseline events, chapters and fidelity check.',
    );
    await runJob(created.jobId);
    const baseline = await repo.branch(userId, created.branchId);
    const decision = baseline.decisions[0],
      option = decision?.options[0];
    if (!decision || !option)
      throw new DomainError(
        'SMOKE_DECISION_MISSING',
        'No decision was generated.',
      );
    console.log('Live AI: baseline persisted; generating a decision branch.');
    const fork = await repo.resolveDecision(
      userId,
      String(decision.id),
      String(option.id),
      randomUUID(),
    );
    await runJob(fork.jobId);
    const alternative = await repo.branch(userId, fork.newBranchId);
    const receipts = await db.query(
      'SELECT metadata FROM ff_ai_runs WHERE user_id=$1 ORDER BY created_at',
      [userId],
    );
    const report = {
      testedAt: new Date().toISOString(),
      syntheticProfile: true,
      usesRealOpenAI: true,
      database: 'isolated PostgreSQL (PGlite)',
      authTested: false,
      baseline,
      alternative,
      receipts,
    };
    await writeFile(
      resolve(outputDirectory, 'report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    const render = (branch: typeof baseline) =>
      branch.chapters
        .map((row) => {
          const chapter = row.payload as ChapterOutput['chapters'][number];
          return `### ${chapter.chapterNo}. ${chapter.title}\n\n${chapter.lead}\n\n${chapter.body}`;
        })
        .join('\n\n');
    const markdown = `# Valódi AI-generálási próba\n\nKitalált tesztprofil, valódi OpenAI-válaszok. Nem személyes előrejelzés.\n\n## Alapforgatókönyv\n\n${render(baseline)}\n\n## Új életág: ${alternative.name}\n\n${render(alternative)}\n`;
    await writeFile(resolve(outputDirectory, 'story.md'), markdown);
    console.log(
      JSON.stringify({
        status: 'passed',
        baselineEvents: baseline.events.length,
        baselineChapters: baseline.chapters.length,
        branchEvents: alternative.events.length,
        branchChapters: alternative.chapters.length,
        aiCalls: receipts.length,
        report: '.local/ai-smoke/story.md',
      }),
    );
  } catch (error) {
    const code = error instanceof DomainError ? error.code : 'SMOKE_FAILED';
    const checkpoint = lastJobId
      ? (
          await db.query('SELECT stage,checkpoints FROM ff_jobs WHERE id=$1', [
            lastJobId,
          ])
        )[0]
      : null;
    await writeFile(
      resolve(outputDirectory, 'failure.json'),
      JSON.stringify(
        { testedAt: new Date().toISOString(), code, checkpoint },
        null,
        2,
      ) + '\n',
    );
    console.error(
      `Live AI smoke failed (${code}). No credentials or raw provider errors were logged.`,
    );
    process.exitCode = 1;
  } finally {
    await engine.close();
  }
}
main().catch(() => {
  console.error(
    'Live AI smoke could not start. Check the protected server environment.',
  );
  process.exitCode = 1;
});
