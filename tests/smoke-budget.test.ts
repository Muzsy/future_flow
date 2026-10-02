import { describe, expect, it } from 'vitest';
import {
  reserveSmokeCall,
  recordSmokeUsage,
  type SmokeCall,
} from '../scripts/lib/ai-smoke-budget';

describe('live smoke spending guard', () => {
  it('fails closed when the existing ledger is invalid', () => {
    for (const accountedUsd of [NaN, -1, Infinity]) {
      const calls = [{ accountedUsd }] as SmokeCall[];
      expect(() =>
        reserveSmokeCall(calls, 5, 'gpt-6.1-sol', 'events', 100, 12000),
      ).toThrow();
    }
  });
  it('refuses the next call before it can exceed the authorized budget', () => {
    const calls: SmokeCall[] = [];
    reserveSmokeCall(calls, 0.15, 'gpt-6.1-sol', 'events', 10000, 12000);
    expect(() =>
      reserveSmokeCall(calls, 0.15, 'gpt-6.1-sol', 'chapters', 10000, 12000),
    ).toThrow();
    expect(calls).toHaveLength(1);
  });
  it('counts cached input correctly without charging reasoning twice', () => {
    const call = reserveSmokeCall([], 5, 'gpt-6.1-sol', 'events', 10000, 12000);
    recordSmokeUsage(call, {
      input_tokens: 10000,
      output_tokens: 1000,
      input_tokens_details: { cached_tokens: 2000 },
      output_tokens_details: { reasoning_tokens: 700 },
    });
    expect(call.estimatedUsd).toBeCloseTo(0.0262);
    expect(call.accountedUsd).toBeCloseTo(0.035);
  });
  it('keeps the full reservation for a lost response with unknown usage', () => {
    const calls: SmokeCall[] = [];
    const call = reserveSmokeCall(
      calls,
      0.15,
      'gpt-6.1-sol',
      'events',
      10000,
      12000,
    );
    call.status = 'network_failure';
    expect(call.accountedUsd).toBeCloseTo(0.145);
    expect(() =>
      reserveSmokeCall(calls, 0.15, 'gpt-6.1-sol', 'events', 10000, 12000),
    ).toThrow();
  });
  it('accounts for cache writes reported by the provider', () => {
    const call = reserveSmokeCall([], 5, 'gpt-6.1-sol', 'events', 10000, 12000);
    recordSmokeUsage(call, {
      input_tokens: 10000,
      output_tokens: 1000,
      input_tokens_details: { cached_tokens: 2000, cache_write_tokens: 5000 },
    });
    expect(call.estimatedUsd).toBeCloseTo(0.0287);
    expect(() =>
      recordSmokeUsage(call, {
        input_tokens: 10000,
        output_tokens: 1000,
        input_tokens_details: { cached_tokens: 2000, cache_write_tokens: 9000 },
      }),
    ).toThrow();
  });
  it('rejects unpriced models, long-context rates and a budget above five dollars', () => {
    expect(() =>
      reserveSmokeCall([], 5, 'other-model', 'events', 100, 12000),
    ).toThrow();
    expect(() =>
      reserveSmokeCall([], 5, 'gpt-6.1-sol', 'events', 272001, 12000),
    ).toThrow();
    expect(() =>
      reserveSmokeCall([], 6, 'gpt-6.1-sol', 'events', 100, 12000),
    ).toThrow();
  });
});
