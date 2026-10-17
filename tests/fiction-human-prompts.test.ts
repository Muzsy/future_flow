import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';
import type OpenAIClient from 'openai';
import {
  fictionV1Policy,
  fictionV2Policy,
  fictionV3Policy,
  fictionPolicy,
} from '@future-flow/contracts';
import { fictionPrompts } from '../packages/ai/src/fiction-prompts';
import { OpenAiProvider } from '@future-flow/ai';
import { fictionFixture, fictionSignatureFixture } from './fiction-fixtures';

// The AI workspace builds as CommonJS; use the same SDK error constructors
// as the rest of the AI provider test suite.
const OpenAI = createRequire(import.meta.url)('openai')
  .default as typeof import('openai').default;

function hashesOf(versions: Parameters<typeof fictionPrompts>[1]) {
  const prompts = fictionPrompts('en', versions);
  return Object.fromEntries(
    Object.entries(prompts).map(([key, value]) => [
      key,
      createHash('sha256').update(value).digest('hex'),
    ]),
  );
}
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
// Builds a coherent v4-policy fixture the same way the core human-fiction
// suite does, without depending on that file's unexported helper.
function v4Fixture() {
  const old = fictionFixture();
  if (old.input.narrativeContext?.policy.mode !== 'narrative-fiction-v2')
    throw new Error('Expected a fiction-mode fixture.');
  old.input.narrativeContext.policy = fictionPolicy();
  const f = fictionFixture(old.input);
  return {
    ...f,
    editor: {
      ...f.editor,
      version: '1.2.0' as const,
      sequenceSignature: fictionSignatureFixture(f.input.periodId),
      sequenceReview: {
        ...f.editor.sequenceReview,
        distinctRhetoricalShape: true,
        systemMechanicsInvisible: true,
        behavioralVariety: true,
      },
    },
  };
}
describe('fiction-prompts v4 human-likeness hardening', () => {
  it('keeps the actually measured v1/v2/v3 prompt bytes frozen while v4 differs', () => {
    expect(hashesOf(fictionV1Policy().promptVersions)).toEqual({
      planner:
        '78e531080f03e3aa5d9a338e1519fc82f5b63d84063e4211e27f767106f6f2b7',
      author:
        '95935f278a21259f3abe024447dad8088c2fb77fbcf9a5535de6a651c117ea55',
      review:
        'edcdf6efe6f09b13d2e22911f24702218d4c1ca4ad804ac5020c80a56ae78db6',
      fidelity:
        '0af915d7eceacd19283e6b0300e85cf014861fc57028a6f7395b0f6f651ee25b',
      editor:
        '620604cf2ffa68b699ff4abe9cfa4a8444db13a9848c6a80525a9adef82e38cc',
    });
    expect(hashesOf(fictionV2Policy().promptVersions)).toEqual({
      planner:
        '8fb8c09a89095129d5dfd702443816ca43460011a3cfc3510154cd55b5261955',
      author:
        'c4ac54cd1a0fd9a8a0d8271d60b6bc3dea253f45f998d303a7c4ec1a29fedfb3',
      review:
        '0de08447948f808a7923ed135d3a74b9a5390e5ce0b259d7959a5dc6e3bae145',
      fidelity:
        '0af915d7eceacd19283e6b0300e85cf014861fc57028a6f7395b0f6f651ee25b',
      editor:
        '620604cf2ffa68b699ff4abe9cfa4a8444db13a9848c6a80525a9adef82e38cc',
    });
    expect(hashesOf(fictionV3Policy().promptVersions)).toEqual({
      planner:
        'e87edff8339027afae574e42128f4a4e92158cdadeea9a97791dad919c78d8af',
      author:
        'a1fae77c9dbf760cd5febdd42881ab2c711dfc37aa168090d2a5df356b9d46f2',
      review:
        'b2ac8c8bf3633c549317205afd09be8fda72b2f96054560261b541e355729bba',
      fidelity:
        '0af915d7eceacd19283e6b0300e85cf014861fc57028a6f7395b0f6f651ee25b',
      editor:
        '94a9fcf3af049f3fd0d981f7ad18b3f3ef2b7ab66894dc494e078321fe56118b',
    });
    expect(hashesOf(fictionPolicy().promptVersions)).toEqual({
      planner:
        '89fce11f1f6a3a4370439ebe184dd20afde2d1e2af27ebd95102c1debae84379',
      author:
        '073268949055bf57604e95b404760ab2a7863e65fbc2d45a433a4ccd5f9fde01',
      review:
        '99213d1dd1c936b94682a06b6e0ccc94840499b3317d7c4f6ea1d6dbed3335be',
      fidelity:
        '0af915d7eceacd19283e6b0300e85cf014861fc57028a6f7395b0f6f651ee25b',
      editor:
        'b855d95475b8d1b6fc5c366775567765cd459f048c1cba85a188e2ea49ddec62',
    });
  });
  it('defaults to the new v4 policy prompts when no explicit version is supplied', () => {
    expect(hashesOf(undefined)).toEqual(
      hashesOf(fictionPolicy().promptVersions),
    );
  });
  it('adds explicit prose/system-separation, behavioral and rhetorical guidance only from v4 onward', () => {
    const v3 = fictionPrompts('en', fictionV3Policy().promptVersions);
    const v4 = fictionPrompts('en', fictionPolicy().promptVersions);
    for (const needle of [
      'HUMAN-LIKENESS CRAFT',
      'period-boundary date in prose merely because an event falls on it',
      'overflow returns to a manager',
      'optimizing learner',
      'balanced antithesis',
      'ordinary surname',
      'puns on their role or craft',
    ]) {
      expect(v3.planner).not.toContain(needle);
      expect(v3.author).not.toContain(needle);
      expect(v4.planner).toContain(needle);
      expect(v4.author).toContain(needle);
    }
    expect(v3.review).not.toContain(
      'pre-scripts an immediate, tidy protagonist self-correction',
    );
    expect(v4.review).toContain(
      'pre-scripts an immediate, tidy protagonist self-correction',
    );
  });
  it('requires report 1.2.0 with the three new sequence flags and a current sequenceSignature only from editor v3', () => {
    const v3 = fictionPrompts('en', fictionV3Policy().promptVersions);
    const v4 = fictionPrompts('en', fictionPolicy().promptVersions);
    expect(v3.editor).toContain('report version 1.1.0');
    expect(v3.editor).not.toContain('distinctRhetoricalShape');
    expect(v4.editor).toContain('Use report version 1.2.0');
    for (const flag of [
      'distinctRhetoricalShape',
      'systemMechanicsInvisible',
      'behavioralVariety',
    ])
      expect(v4.editor).toContain(flag);
    expect(v4.editor).toContain('sequenceSignature');
    expect(v4.editor).toContain('canon-scoped issue');
    expect(v4.editor).toContain('no required quota of flaws');
    // The v3 sequence-craft and v4 structural-canon requirements both survive
    // in the v4 editor text; v4 does not silently drop v3's gate.
    expect(v4.editor).toContain('SEQUENCE CRAFT');
    expect(v4.editor).toContain('all eight scores >=4');
  });
});
describe('OpenAiProvider fiction editor schema routing', () => {
  it('routes a v4-policy chapter through the human editorial schema, not the older sequence schema', async () => {
    const f = v4Fixture();
    const { ai, parse } = provider({
      status: 'completed',
      output_parsed: f.editor,
      model: 'test-editor-model',
    });
    const result = await ai.editFiction(f.input, f.authored);
    expect(result.output.version).toBe('1.2.0');
    const request = parse.mock.calls[0]![0];
    const instructions = request.input[0].content as string;
    expect(instructions).toContain('Use report version 1.2.0');
    expect(instructions).toContain('systemMechanicsInvisible');
  });
  it('rejects a 1.2.0-shaped report when the frozen v3 editor policy expects 1.1.0', async () => {
    const legacy = fictionFixture();
    if (legacy.input.narrativeContext?.policy.mode !== 'narrative-fiction-v2')
      throw new Error('Expected a fiction-mode fixture.');
    legacy.input.narrativeContext.policy = fictionV3Policy();
    const f = fictionFixture(legacy.input);
    const drifted = v4Fixture().editor;
    const { ai } = provider({
      status: 'completed',
      output_parsed: drifted,
      model: 'test-editor-model',
    });
    await expect(ai.editFiction(f.input, f.authored)).rejects.toMatchObject({
      code: 'AI_INVALID_SCHEMA',
    });
  });
  it('still returns the frozen v2 sequence report for the unchanged v2 editor policy', async () => {
    const legacy = fictionFixture();
    if (legacy.input.narrativeContext?.policy.mode !== 'narrative-fiction-v2')
      throw new Error('Expected a fiction-mode fixture.');
    legacy.input.narrativeContext.policy = fictionV3Policy();
    const f = fictionFixture(legacy.input);
    const { ai, parse } = provider({
      status: 'completed',
      output_parsed: f.editor,
      model: 'test-editor-model',
    });
    const result = await ai.editFiction(f.input, f.authored);
    expect(result.output.version).toBe('1.1.0');
    const instructions = parse.mock.calls[0]![0].input[0].content as string;
    expect(instructions).not.toContain('distinctRhetoricalShape');
  });
  it('maps a persistent provider failure on a v4-policy edit to the existing provider-failure code', async () => {
    const f = v4Fixture();
    const { ai, parse } = provider(null);
    parse.mockRejectedValue(
      new OpenAI.InternalServerError(
        500,
        {},
        'Temporary failure',
        new Headers(),
      ),
    );
    await expect(ai.editFiction(f.input, f.authored)).rejects.toMatchObject({
      code: 'AI_PROVIDER_FAILED',
    });
  }, 10000);
});
