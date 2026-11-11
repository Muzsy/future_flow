import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { OpenAiProvider, type AiRequestGuard } from '@future-flow/ai';
import {
  Repository,
  LifeRepository,
  LifeJobRepository,
  DatabaseAiBudget,
  type Database,
} from '@future-flow/database';
import { localeSchema, type LifeSetupV2 } from '@future-flow/contracts';
import { DomainError } from '@future-flow/core';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { applyMigrations } from './lib/migrations';
import { acquirePaidSmokeLock } from './lib/paid-smoke-lock';
import {
  reserveSmokeCall,
  recordSmokeUsage,
  smokePrices,
  smokeModelPrices,
  type SmokeCall,
  type SmokeUsage,
} from './lib/ai-smoke-budget';

// Real AI, entirely synthetic data, isolated PostgreSQL. No Supabase accounts.
async function main() {
  const release = acquirePaidSmokeLock();
  const locale = localeSchema.parse(process.argv[2] ?? 'en');
  const periods = Number(process.argv[3] ?? 3);
  if (!Number.isInteger(periods) || periods < 1 || periods > 3)
    throw new DomainError(
      'SMOKE_CASE_UNKNOWN',
      'Between one and three periods.',
    );
  const eventModel =
    process.argv[4] ?? process.env.AI_EVENT_MODEL ?? 'gpt-6.1-sol';
  const directory = resolve('.local/ai-smoke/v2', `${locale}-${eventModel}`);
  await mkdir(directory, { recursive: true });
  const ledgerPath = resolve('.local/ai-smoke/usage.json');
  const calls: SmokeCall[] = existsSync(ledgerPath)
    ? JSON.parse(readFileSync(ledgerPath, 'utf8')).calls
    : [];
  for (const call of calls) if (call.usage) recordSmokeUsage(call, call.usage);
  const budgetUsd = Number(process.env.SMOKE_BUDGET_USD ?? 1);
  const ledger = () => ({
    budgetUsd,
    pricesPerMillionTokens: smokePrices,
    pricesByModel: smokeModelPrices,
    calls,
    estimatedUsd: calls.reduce((n, c) => n + (c.estimatedUsd ?? 0), 0),
    accountedUsd: calls.reduce((n, c) => n + c.accountedUsd, 0),
    unknownUsageCalls: calls.filter((c) => !c.usage).length,
  });
  const saveLedger = () =>
    writeFile(ledgerPath, JSON.stringify(ledger(), null, 2) + '\n');
  const initial = ledger().accountedUsd;
  const engine = new PGlite();
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
  const db = adapter(engine),
    repo = new Repository(db),
    lives = new LifeRepository(db),
    jobs = new LifeJobRepository(db, 600);
  try {
    await applyMigrations(engine);
    const owner = randomUUID();
    await repo.ensureUser(owner);
    await repo.acceptPrivacy(owner);
    const setup: LifeSetupV2 = {
      locale,
      identity: { mode: 'alternate', label: null, ageBand: '35_44' },
      location: { country: 'HU', region: 'Veszprém', housing: null },
      employment: {
        status: 'employed',
        employerLabel: locale === 'hu' ? 'Jelenlegi iroda' : 'Current office',
        workDomain: locale === 'hu' ? 'adminisztráció' : 'administration',
      },
      finance: { currency: 'HUF', monthlyIncome: 400000, liquidFunds: 1200000 },
      skills: locale === 'hu' ? ['tervezés', 'írás'] : ['planning', 'writing'],
      relationships: [],
      resources: { energy: 55, availableHoursPerWeek: 8 },
      goal: {
        category: 'career',
        description:
          locale === 'hu'
            ? 'Átállni önálló digitális tervezői munkára a lakóhelyem közelében'
            : 'Move into independent digital design work near my current home',
        horizonMonths: 36,
        motivation:
          locale === 'hu'
            ? 'Érdekesebb alkotói munka, megőrzött biztonsággal'
            : 'More creative work while preserving stability',
        acceptableTradeoffs:
          locale === 'hu' ? ['esti tanulás'] : ['evening study'],
        unacceptableTradeoffs:
          locale === 'hu' ? ['külföldre költözés'] : ['moving abroad'],
      },
      stayInCountry: true,
      context: null,
    };
    const created = await lives.create(owner, setup, randomUUID());
    async function generate() {
      const job = (await jobs.claim())!;
      const dbGuard = new DatabaseAiBudget(db, owner, job.id, {
        projectUsd: budgetUsd,
        userUsd: budgetUsd,
        initialProjectSpentUsd: initial,
      });
      const reservations = new Map<string, SmokeCall>();
      const guard: AiRequestGuard = {
        reserve: async (raw) => {
          const parameters = raw as {
            model: string;
            max_output_tokens: number;
            text?: { format?: { name?: string } };
          };
          const call = reserveSmokeCall(
            calls,
            budgetUsd,
            parameters.model,
            parameters.text?.format?.name ?? 'unknown',
            Buffer.byteLength(JSON.stringify(raw), 'utf8') + 4096,
            parameters.max_output_tokens,
          );
          call.caseName = `v2-${locale}-${eventModel}`;
          await saveLedger();
          try {
            const id = await dbGuard.reserve(raw);
            reservations.set(id, call);
            console.log(
              `AI ${call.task}: reserved $${call.reservedUsd.toFixed(4)}; total accounted $${ledger().accountedUsd.toFixed(4)}.`,
            );
            return id;
          } catch (error) {
            call.status = 'not_sent';
            recordSmokeUsage(call, { input_tokens: 0, output_tokens: 0 });
            await saveLedger();
            throw error;
          }
        },
        settle: async (id, usage) => {
          const call = reservations.get(id)!;
          if (call.status === 'completed') return;
          await dbGuard.settle(id, usage);
          call.status = usage ? 'completed' : 'response_unavailable';
          if (usage) recordSmokeUsage(call, usage as SmokeUsage);
          await saveLedger();
          console.log(
            `AI ${call.task}: ${call.status}; total token estimate $${ledger().estimatedUsd.toFixed(4)}.`,
          );
        },
      };
      const ai = new OpenAiProvider({
        apiKey: process.env.OPENAI_API_KEY ?? '',
        eventModel,
        storyModel: process.env.AI_STORY_MODEL ?? 'gpt-6.1-sol',
        checkModel: process.env.AI_CHECK_MODEL ?? 'gpt-6.1-sol',
        timeoutMs: 180000,
        maxOutputTokens: 6500,
        guard,
      });
      try {
        await processLifeJob(job, jobs, ai);
      } catch (error) {
        await jobs.fail(job, error);
        await writeFile(
          resolve(directory, 'failure.json'),
          JSON.stringify(
            {
              code: error instanceof DomainError ? error.code : 'SMOKE_FAILED',
              detail: await lives.detail(owner, created.branchId),
              ledger: ledger(),
            },
            null,
            2,
          ) + '\n',
        );
        throw error;
      }
    }
    for (let i = 0; i < periods; i++) {
      await generate();
      const detail = await lives.detail(owner, created.branchId);
      await writeFile(
        resolve(directory, `period-${i + 1}.json`),
        JSON.stringify(detail, null, 2) + '\n',
      );
      if (i < periods - 1) {
        const b = detail.branch,
          d = b.pending_decision!;
        await lives.choose(
          owner,
          b.id,
          b.revision,
          d.id,
          d.options[i % 2]!.id,
          randomUUID(),
        );
        await lives.continue(owner, b.id, b.revision + 1, randomUUID());
      }
    }
    await writeFile(
      resolve(directory, 'summary.json'),
      JSON.stringify(
        {
          testedAt: new Date().toISOString(),
          locale,
          eventModel,
          periods,
          technical: 'passed',
          humanReview: 'pending',
          additionalEstimatedUsd:
            ledger().estimatedUsd -
            calls
              .filter((c) => c.caseName !== `v2-${locale}-${eventModel}`)
              .reduce((n, c) => n + (c.estimatedUsd ?? 0), 0),
          ledger: ledger(),
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      `V2 ${locale} ${periods} periods: passed. Total token estimate $${ledger().estimatedUsd.toFixed(4)}; guard $${ledger().accountedUsd.toFixed(4)}.`,
    );
  } finally {
    await engine.close();
    release();
  }
}
main().catch((error) => {
  console.error(
    `V2 live smoke stopped: ${error instanceof DomainError ? error.code : 'SMOKE_FAILED'}. Credentials are not logged.`,
  );
  process.exitCode = 1;
});
