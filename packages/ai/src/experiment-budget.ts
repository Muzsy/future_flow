import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DomainError } from '@future-flow/core';
import type { AiRequestGuard } from './index';
type Usage = {
  input_tokens: number;
  output_tokens: number;
  input_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  };
};
type Call = {
  id?: string;
  caseName?: string;
  model: string;
  task: string;
  startedAt: string;
  reservedUsd: number;
  accountedUsd: number;
  estimatedUsd?: number;
  status: string;
  usage?: Usage;
};
export type ExperimentTokenPrices = Record<
  string,
  { input: number; cachedInput: number; inputCeiling: number; output: number }
>;
const prices: ExperimentTokenPrices = {
  'gpt-6.1-sol': { input: 2, cachedInput: 0.1, inputCeiling: 2.5, output: 10 },
  'gpt-6-luna': {
    input: 0.1,
    cachedInput: 0.01,
    inputCeiling: 0.125,
    output: 0.5,
  },
};
// Optional local guard shares the experimental allowance with smoke runs.
// Production uses the transactional database budget without a local ledger.
export class ExperimentAiBudget implements AiRequestGuard {
  private readonly onExit = () => this.close();
  private readonly path: string;
  private readonly lockPath: string;
  private readonly owner: string;
  private readonly calls: Call[];
  constructor(
    path: string,
    private readonly budgetUsd: number,
    private readonly caseName: string,
    private readonly modelPrices: ExperimentTokenPrices = prices,
    approvedMaximumUsd = 5,
  ) {
    if (
      !Number.isFinite(approvedMaximumUsd) ||
      approvedMaximumUsd <= 0 ||
      approvedMaximumUsd > 10 ||
      !Number.isFinite(budgetUsd) ||
      budgetUsd <= 0 ||
      budgetUsd > approvedMaximumUsd
    )
      throw new DomainError(
        'SMOKE_BUDGET_CONFIG',
        'Invalid experimental budget.',
      );
    this.path = resolve(path);
    this.lockPath = resolve(dirname(this.path), 'paid-run.lock');
    mkdirSync(dirname(this.path), { recursive: true });
    let fd: number;
    try {
      fd = openSync(this.lockPath, 'wx');
    } catch {
      throw new DomainError(
        'SMOKE_RUN_ACTIVE',
        'Another paid experiment is active.',
      );
    }
    this.owner = JSON.stringify({ pid: process.pid, token: randomUUID() });
    writeFileSync(fd, this.owner);
    closeSync(fd);
    try {
      this.calls = existsSync(this.path)
        ? JSON.parse(readFileSync(this.path, 'utf8')).calls
        : [];
      if (
        !Array.isArray(this.calls) ||
        this.calls.some(
          (c) => !Number.isFinite(c.accountedUsd) || c.accountedUsd < 0,
        )
      )
        throw new Error('Invalid ledger');
    } catch {
      this.close();
      throw new DomainError(
        'SMOKE_BUDGET_CONFIG',
        'Experimental ledger cannot be validated.',
      );
    }
    process.once('exit', this.onExit);
  }
  private save() {
    writeFileSync(
      this.path,
      JSON.stringify(
        {
          budgetUsd: this.budgetUsd,
          pricesPerMillionTokens: this.modelPrices['gpt-6.1-sol'],
          pricesByModel: this.modelPrices,
          calls: this.calls,
          estimatedUsd: this.calls.reduce(
            (n, c) => n + (c.estimatedUsd ?? 0),
            0,
          ),
          accountedUsd: this.calls.reduce((n, c) => n + c.accountedUsd, 0),
          unknownUsageCalls: this.calls.filter((c) => !c.usage).length,
        },
        null,
        2,
      ) + '\n',
    );
  }
  async reserve(raw: unknown) {
    const p = raw as {
        model: string;
        max_output_tokens: number;
        text?: { format?: { name?: string } };
      },
      rate = this.modelPrices[p.model];
    const bytes = Buffer.byteLength(JSON.stringify(raw), 'utf8') + 4096;
    if (
      !rate ||
      !Object.values(rate).every((n) => Number.isFinite(n) && n >= 0) ||
      rate.inputCeiling < rate.input ||
      bytes > 100000 ||
      !Number.isInteger(p.max_output_tokens) ||
      p.max_output_tokens < 1 ||
      p.max_output_tokens > 12000
    )
      throw new DomainError(
        'SMOKE_BUDGET_CONFIG',
        'Request outside experimental bounds.',
      );
    const cost =
      (bytes * rate.inputCeiling + p.max_output_tokens * rate.output) / 1e6;
    if (
      this.calls.reduce((n, c) => n + c.accountedUsd, 0) + cost >
      this.budgetUsd
    )
      throw new DomainError(
        'SMOKE_BUDGET_EXCEEDED',
        'Experimental budget exhausted.',
      );
    const id = randomUUID();
    this.calls.push({
      id,
      caseName: this.caseName,
      model: p.model,
      task: p.text?.format?.name ?? 'unknown',
      startedAt: new Date().toISOString(),
      reservedUsd: cost,
      accountedUsd: cost,
      status: 'reserved',
    });
    this.save();
    return id;
  }
  async settle(id: string, usage: Usage | null) {
    const call = this.calls.find((c) => c.id === id);
    if (!call || call.status === 'completed') return;
    if (!usage) {
      call.status = 'response_unavailable';
      this.save();
      return;
    }
    const cached = usage.input_tokens_details?.cached_tokens ?? 0,
      writes = usage.input_tokens_details?.cache_write_tokens ?? 0;
    if (
      ![usage.input_tokens, usage.output_tokens, cached, writes].every(
        (n) => Number.isInteger(n) && n >= 0,
      ) ||
      cached + writes > usage.input_tokens
    )
      throw new DomainError('SMOKE_USAGE_INVALID', 'Invalid usage.');
    const rate = this.modelPrices[call.model];
    if (!rate)
      throw new DomainError('SMOKE_USAGE_INVALID', 'Unknown model price.');
    call.usage = usage;
    call.status = 'completed';
    call.estimatedUsd =
      ((usage.input_tokens - cached - writes) * rate.input +
        cached * rate.cachedInput +
        writes * rate.inputCeiling +
        usage.output_tokens * rate.output) /
      1e6;
    call.accountedUsd =
      (usage.input_tokens * rate.inputCeiling +
        usage.output_tokens * rate.output) /
      1e6;
    this.save();
  }
  close() {
    process.removeListener('exit', this.onExit);
    if (
      existsSync(this.lockPath) &&
      readFileSync(this.lockPath, 'utf8') === this.owner
    )
      unlinkSync(this.lockPath);
  }
}
export function combineAiGuards(
  first: AiRequestGuard,
  second: AiRequestGuard,
): AiRequestGuard {
  const pairs = new Map<string, string>();
  return {
    reserve: async (p) => {
      const a = await first.reserve(p);
      try {
        const b = await second.reserve(p);
        pairs.set(a, b);
        return a;
      } catch (error) {
        await first.settle(a, { input_tokens: 0, output_tokens: 0 });
        throw error;
      }
    },
    settle: async (id, usage) => {
      const secondId = pairs.get(id);
      await first.settle(id, usage);
      if (secondId) await second.settle(secondId, usage);
    },
  };
}
