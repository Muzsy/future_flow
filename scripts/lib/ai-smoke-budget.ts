import { DomainError } from '@future-flow/core';

// Standard GPT-6.1 Sol prices, checked on 2026-10-02. Reserve the more
// expensive cache-write input rate and all allowed output tokens before a call.
export const smokePrices = {
  input: 2,
  cachedInput: 0.1,
  inputCeiling: 2.5,
  output: 10,
};
export type SmokeUsage = {
  input_tokens: number;
  output_tokens: number;
  input_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  };
  output_tokens_details?: { reasoning_tokens?: number };
};
export type SmokeCall = {
  caseName?: string;
  startedAt: string;
  model: string;
  task: string;
  reservedUsd: number;
  accountedUsd: number;
  status: string;
  usage?: SmokeUsage;
  estimatedUsd?: number;
};
export function reserveSmokeCall(
  calls: SmokeCall[],
  budgetUsd: number,
  model: string,
  task: string,
  inputTokens: number,
  maxOutputTokens: number,
): SmokeCall {
  if (
    model !== 'gpt-6.1-sol' ||
    calls.some(
      (call) => !Number.isFinite(call.accountedUsd) || call.accountedUsd < 0,
    ) ||
    !Number.isFinite(budgetUsd) ||
    budgetUsd <= 0 ||
    budgetUsd > 5 ||
    !Number.isInteger(inputTokens) ||
    inputTokens < 0 ||
    inputTokens > 272000 ||
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens <= 0
  )
    throw new DomainError(
      'SMOKE_BUDGET_CONFIG',
      'Invalid smoke budget or unpriced model.',
    );
  const reservedUsd =
    (inputTokens * smokePrices.inputCeiling +
      maxOutputTokens * smokePrices.output) /
    1_000_000;
  if (
    calls.reduce((sum, call) => sum + call.accountedUsd, 0) + reservedUsd >
    budgetUsd
  )
    throw new DomainError(
      'SMOKE_BUDGET_EXCEEDED',
      'The next request would exceed the smoke budget.',
    );
  const call: SmokeCall = {
    startedAt: new Date().toISOString(),
    model,
    task,
    reservedUsd,
    accountedUsd: reservedUsd,
    status: 'reserved',
  };
  calls.push(call);
  return call;
}
export function recordSmokeUsage(call: SmokeCall, usage: SmokeUsage) {
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const writes = usage.input_tokens_details?.cache_write_tokens ?? 0;
  if (
    !Number.isInteger(usage.input_tokens) ||
    usage.input_tokens < 0 ||
    !Number.isInteger(usage.output_tokens) ||
    usage.output_tokens < 0 ||
    !Number.isInteger(cached) ||
    cached < 0 ||
    !Number.isInteger(writes) ||
    writes < 0 ||
    cached + writes > usage.input_tokens
  )
    throw new DomainError(
      'SMOKE_USAGE_INVALID',
      'Invalid provider token usage.',
    );
  call.usage = usage;
  call.estimatedUsd =
    ((usage.input_tokens - cached - writes) * smokePrices.input +
      cached * smokePrices.cachedInput +
      writes * smokePrices.inputCeiling +
      usage.output_tokens * smokePrices.output) /
    1_000_000;
  call.accountedUsd =
    (usage.input_tokens * smokePrices.inputCeiling +
      usage.output_tokens * smokePrices.output) /
    1_000_000;
}
