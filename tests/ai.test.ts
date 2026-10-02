import { describe, it, expect, vi } from 'vitest';
import type OpenAI from 'openai';
import { OpenAiProvider } from '@future-flow/ai';
import { initialState, worldState } from '@future-flow/core';
import { profile, simulation } from './fixtures';

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
    { responses: { parse } } as unknown as OpenAI,
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
      usage: { input_tokens: 50, output_tokens: 100 },
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
});
