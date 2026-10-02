import { describe, it, expect, vi } from 'vitest';
import type OpenAIClient from 'openai';
import { createRequire } from 'node:module';
import { OpenAiProvider } from '@future-flow/ai';
import { initialState, worldState } from '@future-flow/core';
import { profile, simulation } from './fixtures';

// The AI workspace builds as CommonJS; use the same SDK error constructors.
const OpenAI = createRequire(import.meta.url)('openai')
  .default as typeof import('openai').default;

function provider(response: unknown) {
  const parse = vi.fn().mockResolvedValue(response);
  const ai = new OpenAiProvider(
    {
      apiKey: 'test-only-key',
      eventModel: 'test-model-events',
      storyModel: 'test-model-story',
      timeoutMs: 1000,
      maxOutputTokens: 12000,
    },
    { responses: { parse } } as unknown as OpenAIClient,
  );
  return { ai, parse };
}
const input = () => {
  const p = profile();
  return {
    profile: p,
    state: initialState(p, '2026-10-02'),
    world: worldState(p),
    horizonMonths: 120,
    seed: 1,
    decision: null,
  };
};
describe('OpenAI boundary', () => {
  it('requires actual provider configuration', () =>
    expect(
      () =>
        new OpenAiProvider({
          apiKey: '',
          eventModel: '',
          storyModel: '',
          timeoutMs: 1000,
          maxOutputTokens: 12000,
        }),
    ).toThrow('AI-kulcs'));
  it('sends structured output, store=false, and keeps usage audit without raw prompts', async () => {
    const { ai, parse } = provider({
      status: 'completed',
      output_parsed: simulation(),
      model: 'test-model-events',
      usage: {
        input_tokens: 50,
        output_tokens: 100,
        input_tokens_details: { cached_tokens: 20, cache_write_tokens: 25 },
        output_tokens_details: { reasoning_tokens: 45 },
      },
      _request_id: 'test-request',
    });
    const result = await ai.events(input());
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        store: false,
        model: 'test-model-events',
        text: expect.objectContaining({
          format: expect.objectContaining({
            type: 'json_schema',
            strict: true,
          }),
        }),
      }),
    );
    expect(result.receipt.inputTokens).toBe(50);
    expect(result.receipt.outputTokens).toBe(100);
    expect(result.receipt.cachedInputTokens).toBe(20);
    expect(result.receipt.cacheWriteTokens).toBe(25);
    expect(result.receipt.reasoningTokens).toBe(45);
    expect(result.receipt).not.toHaveProperty('prompt');
  });
  it('rejects incomplete/refused outputs instead of inventing replacement content', async () => {
    const { ai } = provider({ status: 'incomplete', output_parsed: null });
    await expect(ai.events(input())).rejects.toMatchObject({
      code: 'AI_INCOMPLETE_OR_REFUSED',
    });
  });
  it('validates output again at the AI boundary', async () => {
    const { ai } = provider({
      status: 'completed',
      output_parsed: { events: [] },
      model: 'test',
    });
    await expect(ai.events(input())).rejects.toMatchObject({
      code: 'AI_INVALID_SCHEMA',
    });
  });
  it.each([
    ['credit_balance_exhausted', 'insufficient_quota'],
    ['insufficient_quota', 'insufficient_quota'],
    ['project_spend_limit_exceeded', 'insufficient_quota'],
    ['organization_usage_limit_exceeded', 'insufficient_quota'],
    ['unrecognized_billing_code', 'insufficient_quota'],
  ])(
    'reports billing failure %s without repeating the request',
    async (code, type) => {
      const { ai, parse } = provider(null);
      parse.mockRejectedValue(
        new OpenAI.RateLimitError(
          429,
          { code, type },
          'Provider billing detail',
          new Headers(),
        ),
      );
      await expect(ai.events(input())).rejects.toMatchObject({
        code: 'AI_QUOTA_EXHAUSTED',
        status: 503,
      });
      expect(parse).toHaveBeenCalledTimes(1);
    },
  );
  it('retries a temporary rate limit and accepts the successful response', async () => {
    const { ai, parse } = provider({
      status: 'completed',
      output_parsed: simulation(),
      model: 'test-model-events',
    });
    parse.mockRejectedValueOnce(
      new OpenAI.RateLimitError(
        429,
        { code: 'rate_limit_exceeded', type: 'rate_limit_error' },
        'Temporary limit',
        new Headers({ 'retry-after': '0' }),
      ),
    );
    expect((await ai.events(input())).output.events).toHaveLength(5);
    expect(parse).toHaveBeenCalledTimes(2);
  });
  it('bounds transient server retries to three attempts', async () => {
    const { ai, parse } = provider(null);
    parse.mockRejectedValue(
      new OpenAI.InternalServerError(
        503,
        { code: 'server_is_overloaded' },
        'Temporary error',
        new Headers({ 'retry-after': '0' }),
      ),
    );
    await expect(ai.events(input())).rejects.toMatchObject({
      code: 'AI_PROVIDER_FAILED',
    });
    expect(parse).toHaveBeenCalledTimes(3);
  });
  it('does not retry earlier than a long provider Retry-After delay', async () => {
    const { ai, parse } = provider(null);
    parse.mockRejectedValue(
      new OpenAI.RateLimitError(
        429,
        { code: 'rate_limit_exceeded' },
        'Temporary limit',
        new Headers({ 'retry-after': '60' }),
      ),
    );
    await expect(ai.events(input())).rejects.toMatchObject({
      code: 'AI_RATE_LIMIT',
    });
    expect(parse).toHaveBeenCalledTimes(1);
  });
  it('keeps authentication errors private and does not retry them', async () => {
    const { ai, parse } = provider(null);
    parse.mockRejectedValue(
      new OpenAI.AuthenticationError(
        401,
        { code: 'invalid_api_key' },
        'Private provider detail',
        new Headers(),
      ),
    );
    await expect(ai.events(input())).rejects.toMatchObject({
      code: 'AI_AUTH_FAILED',
      message: 'Az AI-szolgáltató nem tudta teljesíteni a kérést.',
    });
    expect(parse).toHaveBeenCalledTimes(1);
  });
});
