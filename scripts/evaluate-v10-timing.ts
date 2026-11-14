import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import OpenAI from 'openai';
import { ExperimentAiBudget, OpenAiProvider } from '@future-flow/ai';
import {
  lifeStoryDraftRequestV2Schema,
  storySetupFromDraft,
} from '@future-flow/contracts';
import {
  DomainError,
  fictionCanon,
  fictionPlannerRequest,
} from '@future-flow/core';
import {
  LifeJobRepository,
  LifeRepository,
  Repository,
} from '@future-flow/database';
import { storyProfiles } from '../tests/story-fixtures';
import { narrativeFixtureId } from '../tests/narrative-fixtures';
import { adapter } from './lib/narrative-evaluation-runner';
import { evaluationPrices } from './lib/narrative-evaluation-options';
import { verifyApprovalLedger } from './lib/narrative-evaluation-approval';
import type { LedgerCall } from './lib/paid-ledger-summary';
import { applyMigrations } from './lib/migrations';

const approval = 'narrative-evaluation:v10-planner-timing-20261113';
const model = 'gpt-6.1-sol';
const cap = 1.2;
const { PL2: _policyProbe, ...baseProfiles } = storyProfiles;
const profiles = Object.entries({
  ...baseProfiles,
  P12: storyProfiles.P4,
});
const situations: Record<string, string> = {
  P3: 'The protagonist and their sibling disagree about keeping a family gathering alive. Both are waiting for relatives scattered across the country to return for the next annual gathering, before anyone will commit to hosting it.',
  P5: 'The protagonist tests a weekend repair service while employed. A cooperative might offer bench space after its next membership renewal, once the trial has produced repeat customers. Before then, the protagonist can work from home.',
  P8: 'The protagonist has a gallery commission that must be finished before a group exhibition. A possible second commission depends on how visitors respond when the exhibition finally opens. Their own work is waiting in the meantime.',
  P10: 'The protagonist arrives at an unfamiliar coastal station. The first ferry back is cancelled, and two fellow passengers offer different ways to continue the journey.',
  P12: 'The two founders have finished a pilot refurbishing musical instruments for schools. The schools will only judge whether to renew after the instruments have been used in rehearsals and then in the end-of-year performances. Until then the founders must decide how much spare stock to keep.',
};
type Sample = {
  id: string;
  direction: string | null;
  subtype: string | null;
  note: string | null;
  durationMonths?: number;
  startDate?: string;
  endDate?: string;
  events?: { date: string; title: string; summary: string }[];
  valid?: boolean;
  error?: string;
};

async function main() {
  const dry = process.argv[2] === '--dry-run';
  const out = process.argv[3];
  if (!out || (!dry && process.argv[2] !== '--paid'))
    throw new Error('Specify --dry-run or --paid and a new output directory.');
  const apiKey = process.env.NARRATIVE_EVAL_API_KEY;
  const project = process.env.NARRATIVE_EVAL_PROJECT_ID;
  if (!dry && (!apiKey || !project))
    throw new Error('Missing evaluation credentials.');
  await mkdir(out, { mode: 0o700 });
  const ledgerPath = '.local/narrative-evaluation/paid-usage.json';
  const guard = dry
    ? undefined
    : await (async () => {
        const { calls } = JSON.parse(await readFile(ledgerPath, 'utf8')) as {
          calls: LedgerCall[];
        };
        verifyApprovalLedger(calls, ledgerPath);
        if (calls.some((call) => call.caseName === approval))
          throw new Error('This approval already has recorded requests.');
        const ceiling =
          calls.reduce((sum, call) => sum + call.accountedUsd, 0) + cap;
        return new ExperimentAiBudget(
          ledgerPath,
          ceiling,
          approval,
          evaluationPrices,
          ceiling,
          150000,
        );
      })();
  const engine = new PGlite();
  const rows: Sample[] = [];
  try {
    await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    await applyMigrations(engine);
    const db = adapter(engine);
    const repository = new Repository(db);
    const jobs = new LifeJobRepository(db, 60);
    const inputs = [];
    for (const [id, base] of profiles) {
      const draft = lifeStoryDraftRequestV2Schema.parse(
        situations[id]
          ? {
              ...base,
              story: {
                ...base.story,
                startingSituation: { id: 'custom', note: situations[id] },
              },
            }
          : base,
      );
      const setup = storySetupFromDraft(draft);
      if (!setup || !draft.story) throw new Error('Invalid fixture ' + id);
      const owner = narrativeFixtureId('v10-timing-planner:' + id);
      const lives = new LifeRepository(
        db,
        { daily: 100, concurrent: 10 },
        {
          mode: 'narrative-fiction-v2',
          cohortUserIds: [owner],
          fictionGeneration: 'v9',
          storyDirections: {
            enabled: false,
            politicsEnabled: true,
            cohortUserIds: [owner],
          },
        },
      );
      await repository.ensureUser(owner);
      await repository.acceptPrivacy(owner);
      const created = await lives.create(
        owner,
        setup,
        narrativeFixtureId('v10-timing-start:' + id),
      );
      const job = await jobs.claim();
      if (!job || job.branch_id !== created.branchId)
        throw new Error('Unexpected fixture job');
      const request = fictionPlannerRequest(job.payload);
      if (
        !('storyTiming' in request) ||
        'endDate' in request ||
        'durationMonths' in request
      )
        throw new Error('Unexpected fixed timing');
      inputs.push({ id, job, request, story: draft.story });
    }
    await writeFile(
      join(out, 'inputs.json'),
      JSON.stringify(
        inputs.map(({ id, request }) => ({ id, request })),
        null,
        2,
      ),
      { mode: 0o600 },
    );
    if (dry) return;
    const client = new OpenAI({
      apiKey: apiKey!,
      project,
      baseURL: 'https://api.openai.com/v1',
      organization: null,
      maxRetries: 0,
      logLevel: 'off',
    });
    for (const { id, job, story } of inputs) {
      let admitted = false;
      const ai = new OpenAiProvider(
        {
          apiKey: apiKey!,
          eventModel: model,
          storyModel: model,
          checkModel: model,
          maxOutputTokens: 12000,
          fictionTimeoutMs: 180000,
          timeoutMs: 180000,
          guard,
          beforePhysicalRequest: async () => {
            if (admitted)
              throw new DomainError(
                'EVAL_FIRST_ATTEMPT_ONLY',
                'One request per fixture.',
              );
            admitted = true;
          },
        },
        client,
      );
      const row: Sample = {
        id,
        direction: story.direction,
        subtype: story.subtype,
        note: story.startingSituation.note,
      };
      try {
        const { output, receipt } = await ai.planFiction(job.payload);
        const { candidate } = output;
        Object.assign(row, {
          durationMonths: candidate.durationMonths,
          startDate: candidate.startDate,
          endDate: candidate.endDate,
          events: candidate.events.map((e) => ({
            date: e.effectiveAt,
            title: e.title,
            summary: e.summary,
          })),
        });
        await writeFile(
          join(out, id + '.json'),
          JSON.stringify({ output, receipt }, null, 2),
          { mode: 0o600 },
        );
        fictionCanon(job.payload, output);
        row.valid = true;
      } catch (error) {
        row.valid = false;
        row.error =
          error instanceof DomainError ? error.code : 'EVAL_REQUEST_FAILED';
      }
      rows.push(row);
      await writeFile(join(out, 'report.json'), JSON.stringify(rows, null, 2), {
        mode: 0o600,
      });
      console.log(id, row.durationMonths ?? row.error, row.valid);
      if (row.error === 'SMOKE_BUDGET_EXCEEDED') break;
    }
  } finally {
    await engine.close();
  }
}

void main().catch((error) => {
  console.error(
    error instanceof DomainError
      ? error.code
      : error instanceof Error
        ? error.message
        : 'EVAL_FAILED',
  );
  process.exitCode = 1;
});
