import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { evaluateNarrativeWithAgy } from '../scripts/evaluate-narrative-agy';
import { evaluateNarrativeWithCodex } from '../scripts/evaluate-narrative-codex';
import {
  AGY_MODEL,
  agyJsonObject,
  agyLocalResponder,
  agyPrompt,
  agyQuotaFrom,
  createAgyHome,
} from '../scripts/lib/narrative-evaluation-agy';
import {
  codexLocalResponder,
  codexOutputLimitExceeded,
  codexQuotaFrom,
  readCodexQuota,
} from '../scripts/lib/narrative-evaluation-codex';
import {
  AGY_QUOTA_THRESHOLDS,
  CODEX_QUOTA_THRESHOLDS,
  LocalQuotaGuard,
  QuotaHalt,
  quotaBlock,
  type QuotaSnapshot,
  type QuotaSource,
} from '../scripts/lib/narrative-evaluation-quota';
import type { OfflineMockResponder } from '../scripts/lib/narrative-evaluation-runner';

const dirs: string[] = [];
function temp(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function script(name: string, body: string) {
  const dir = temp('fake-bin-');
  const bin = join(dir, name);
  writeFileSync(bin, `#!/usr/bin/env node\n${body}`);
  chmodSync(bin, 0o755);
  return bin;
}

const snapshot = (
  engine: 'codex' | 'agy',
  fiveHour: number,
  weekly: number,
  blockedReason: string | null = null,
): QuotaSnapshot => ({
  engine,
  at: '2026-10-20T17:00:00.000Z',
  windows: [
    {
      name: 'five-hour',
      remainingPercent: fiveHour,
      resetsAt: '2026-10-20T20:00:00.000Z',
    },
    {
      name: 'weekly',
      remainingPercent: weekly,
      resetsAt: '2026-10-24T17:00:00.000Z',
    },
  ],
  blockedReason,
});

function quotaSource(
  engine: 'codex' | 'agy',
  values: () => [number, number, string | null?],
): QuotaSource {
  return {
    engine,
    thresholds:
      engine === 'codex' ? CODEX_QUOTA_THRESHOLDS : AGY_QUOTA_THRESHOLDS,
    read: async () => {
      const [fiveHour, weekly, blocked] = values();
      return snapshot(engine, fiveHour, weekly, blocked ?? null);
    },
  };
}

const requestContext = (over: Record<string, unknown> = {}) =>
  ({
    caseId: 'case-1',
    task: 'life_fidelity',
    model: 'gpt-6.1-sol',
    ordinal: 0,
    timeoutMs: 5000,
    parameters: {
      model: 'gpt-6.1-sol',
      max_output_tokens: 6500,
      input: [
        { role: 'system', content: 'SYSTEM TEXT' },
        { role: 'user', content: '{"a":1}' },
      ],
      text: { format: { name: 'x', schema: { type: 'object' } } as never },
    },
    job: {} as never,
    defaultOutput: () => null,
    ...over,
  }) as Parameters<OfflineMockResponder>[0];

describe('Codex runner aligned with the API call', () => {
  const echoOutput = (json: string, delayMs = 0) =>
    script(
      'codex',
      `const fs = require('node:fs');
const args = process.argv.slice(2);
const out = args[args.indexOf('--output-last-message') + 1];
fs.readFileSync(0, 'utf8');
setTimeout(() => { fs.writeFileSync(out, ${JSON.stringify(json)}); }, ${delayMs});`,
    );

  it('refuses a request that carries no API output cap or deadline', async () => {
    const respond = codexLocalResponder({
      bin: echoOutput('{}'),
      model: 'gpt-6.1-sol',
    });
    const noCap = requestContext();
    delete (noCap.parameters as { max_output_tokens?: number })
      .max_output_tokens;
    await expect(respond(noCap)).rejects.toMatchObject({
      code: 'EVAL_CONFIG_INVALID',
    });
    await expect(
      respond(requestContext({ timeoutMs: undefined })),
    ).rejects.toMatchObject({ code: 'EVAL_CONFIG_INVALID' });
  });

  it('turns an answer past max_output_tokens into an incomplete response', async () => {
    const big = JSON.stringify({ text: 'x'.repeat(4400) });
    const respond = codexLocalResponder({
      bin: echoOutput(big),
      model: 'gpt-6.1-sol',
    });
    const context = requestContext();
    (context.parameters as { max_output_tokens: number }).max_output_tokens =
      1000;
    expect(await respond(context)).toMatchObject({
      __rawResponse: { status: 'incomplete', output_parsed: null },
    });
    (context.parameters as { max_output_tokens: number }).max_output_tokens =
      1200;
    expect(await respond(context)).toEqual({ text: 'x'.repeat(4400) });
    expect(codexOutputLimitExceeded('x'.repeat(4000), 1000)).toBe(false);
    expect(codexOutputLimitExceeded('x'.repeat(4001), 1000)).toBe(true);
  });

  it('kills the call at the per-request deadline', async () => {
    const respond = codexLocalResponder({
      bin: echoOutput('{}', 5000),
      model: 'gpt-6.1-sol',
    });
    await expect(
      respond(requestContext({ timeoutMs: 300 })),
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_FAILED',
      message: expect.stringContaining('deadline'),
    });
  });
});

describe('quota mapping and gates', () => {
  it('maps the Codex plan windows and blocked states', () => {
    const open = codexQuotaFrom({
      ordinaryUsageAllowed: true,
      rateLimits: {
        primary: {
          usedPercent: 2,
          windowDurationMins: 300,
          resetsAt: 1792528072,
        },
        secondary: {
          usedPercent: 0,
          windowDurationMins: 10080,
          resetsAt: 1793114872,
        },
      },
    });
    expect(open.windows).toEqual([
      {
        name: 'five-hour',
        remainingPercent: 98,
        resetsAt: new Date(1792528072 * 1000).toISOString(),
      },
      {
        name: 'weekly',
        remainingPercent: 100,
        resetsAt: new Date(1793114872 * 1000).toISOString(),
      },
    ]);
    expect(open.blockedReason).toBeNull();
    expect(JSON.stringify(open)).not.toContain('accountId');
    expect(
      codexQuotaFrom({ ordinaryUsageAllowed: false, rateLimits: {} })
        .blockedReason,
    ).toContain('not allowed');
    expect(
      codexQuotaFrom({
        rateLimits: { rateLimitReachedType: 'rate_limit_reached' },
      }).blockedReason,
    ).toContain('rate_limit_reached');
    // An unknown window length is not mapped, so the guard fails closed.
    const odd = codexQuotaFrom({
      rateLimits: { primary: { usedPercent: 1, windowDurationMins: 60 } },
    });
    expect(quotaBlock(odd, CODEX_QUOTA_THRESHOLDS.start)?.reason).toContain(
      'unavailable',
    );
  });

  it('applies the Codex reserve: start 30/20, boundary 10/5, hard 1/1', () => {
    const t = CODEX_QUOTA_THRESHOLDS;
    expect(quotaBlock(snapshot('codex', 30, 20), t.start)).toBeNull();
    expect(quotaBlock(snapshot('codex', 29, 90), t.start)?.reason).toContain(
      'five-hour',
    );
    expect(quotaBlock(snapshot('codex', 90, 19), t.start)?.reason).toContain(
      'weekly',
    );
    expect(quotaBlock(snapshot('codex', 10, 5), t.boundary)).toBeNull();
    expect(quotaBlock(snapshot('codex', 9, 50), t.boundary)).not.toBeNull();
    expect(quotaBlock(snapshot('codex', 1, 1), t.hard)).toBeNull();
    const spent = quotaBlock(snapshot('codex', 0, 80), t.hard);
    expect(spent?.resumeAfter).toBe('2026-10-20T20:00:00.000Z');
    expect(
      quotaBlock(snapshot('codex', 80, 80, 'plan blocked'), t.hard)?.reason,
    ).toBe('plan blocked');
  });

  it('reads the Codex quota from the app server without touching a model', async () => {
    const bin = script(
      'codex',
      `const readline = require('node:readline');
const methods = [];
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method) methods.push(m.method);
  if (m.id === 1) process.stdout.write(JSON.stringify({ id: 1, result: {} }) + '\\n');
  if (m.id === 2)
    process.stdout.write(JSON.stringify({ id: 2, result: {
      ordinaryUsageAllowed: true,
      accountId: 'must-not-appear',
      rateLimits: {
        primary: { usedPercent: 40, windowDurationMins: 300, resetsAt: 1792528072 },
        secondary: { usedPercent: 10, windowDurationMins: 10080, resetsAt: 1793114872 },
      } } }) + '\\n');
});`,
    );
    const read = await readCodexQuota(bin, 5000);
    expect(read.windows.map((w) => w.remainingPercent)).toEqual([60, 90]);
    expect(JSON.stringify(read)).not.toContain('must-not-appear');
  });

  it('fails closed when the Codex quota cannot be read', async () => {
    const bin = script('codex', `process.exit(1);`);
    await expect(readCodexQuota(bin, 2000)).rejects.toMatchObject({
      code: 'EVAL_QUOTA_UNAVAILABLE',
    });
  });

  it('maps the agy /usage Gemini group', () => {
    const usage = {
      command: {
        data: {
          groups: [
            {
              name: 'Gemini Models',
              description: 'Models within this group: Gemini Flash, Gemini Pro',
              buckets: [
                {
                  id: 'gemini-weekly',
                  window: 'weekly',
                  remaining_fraction: 0.6015,
                  reset_time: '2026-10-24T17:25:22Z',
                },
                {
                  id: 'gemini-5h',
                  window: 'five_hour',
                  remaining_fraction: 0.94,
                  reset_time: '2026-10-20T20:00:01Z',
                },
              ],
            },
            {
              name: 'Claude and GPT models',
              description: 'Models within this group: Claude, GPT',
              buckets: [
                { id: 'cg-weekly', window: 'weekly', remaining_fraction: 0 },
              ],
            },
          ],
        },
      },
    };
    const mapped = agyQuotaFrom(usage);
    expect(mapped.windows.map((w) => [w.name, w.remainingPercent])).toEqual([
      ['weekly', 60],
      ['five-hour', 94],
    ]);
    expect(quotaBlock(mapped, AGY_QUOTA_THRESHOLDS.start)).toBeNull();
    usage.command.data.groups[0]!.buckets[0]!.remaining_fraction = 0.19;
    expect(
      quotaBlock(agyQuotaFrom(usage), AGY_QUOTA_THRESHOLDS.start)?.reason,
    ).toContain('weekly');
    expect(
      quotaBlock(agyQuotaFrom({}), AGY_QUOTA_THRESHOLDS.start)?.reason,
    ).toContain('unavailable');
  });

  it('halts at a chapter boundary, never inside a chapter, and stays halted', async () => {
    let fiveHour = 50;
    const guard = new LocalQuotaGuard(
      quotaSource('codex', () => [fiveHour, 80]),
      { sticky: true, cacheMs: 0 },
    );
    await guard.preflight();
    await guard.beforeCall('chapter-1');
    // The reserve drops below the boundary level mid-chapter: still allowed.
    fiveHour = 8;
    await guard.beforeCall('chapter-1');
    // Next chapter: boundary gate stops.
    await expect(guard.beforeCall('chapter-2')).rejects.toBeInstanceOf(
      QuotaHalt,
    );
    await expect(guard.beforeCall('chapter-2')).rejects.toMatchObject({
      code: 'EVAL_QUOTA_HALT',
      resumeAfter: '2026-10-20T20:00:00.000Z',
    });
    expect(guard.halted?.engine).toBe('codex');
    expect(guard.log.some((e) => e.phase === 'boundary' && !e.ok)).toBe(true);
  });

  it('stops a run before the first call when the start reserve is missing', async () => {
    const guard = new LocalQuotaGuard(
      quotaSource('codex', () => [29, 80]),
      { sticky: true },
    );
    await expect(guard.preflight()).rejects.toBeInstanceOf(QuotaHalt);
  });

  it('reports a failed call that coincides with a spent quota as the quota stop', async () => {
    let fiveHour = 60;
    const guard = new LocalQuotaGuard(
      quotaSource('codex', () => [fiveHour, 80]),
      { sticky: true, cacheMs: 0 },
    );
    await guard.preflight();
    fiveHour = 0;
    expect(await guard.afterFailure('chapter-1')).toBeInstanceOf(QuotaHalt);
    expect(guard.halted).not.toBeNull();
  });
});

describe('agy runner', () => {
  const agyBin = (answer: object) =>
    script(
      'agy',
      `const args = process.argv.slice(2);
require('node:fs').writeFileSync(process.env.AGY_TEST_LOG, JSON.stringify({
  args, home: process.env.HOME, cwd: process.cwd(),
  leaked: process.env.GEMINI_API_KEY ?? null,
}));
process.stdout.write(JSON.stringify(${JSON.stringify(answer)}));`,
    );

  it('parses JSON from plain, fenced and chatty answers', () => {
    expect(agyJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(agyJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(agyJsonObject('Here you go: {"a":{"b":2}} done')).toEqual({
      a: { b: 2 },
    });
    expect(agyJsonObject('nothing')).toBeNull();
    expect(agyJsonObject('[1,2]')).toBeNull();
    expect(agyJsonObject('{broken')).toBeNull();
  });

  it('links only the sign-in files into the isolated HOME', () => {
    const real = temp('real-home-');
    mkdirSync(join(real, '.gemini', 'antigravity-cli', 'brain'), {
      recursive: true,
    });
    for (const name of ['GEMINI.md', 'google_accounts.json', 'settings.json'])
      writeFileSync(join(real, '.gemini', name), 'x');
    mkdirSync(join(real, '.gemini', 'skills'));
    writeFileSync(
      join(real, '.gemini', 'antigravity-cli', 'antigravity-oauth-token'),
      'x',
    );
    const isolated = createAgyHome(real);
    try {
      expect(isolated.home).not.toBe(real);
      const gemini = readdirSync(join(isolated.home, '.gemini')).sort();
      expect(gemini).toEqual(['antigravity-cli', 'google_accounts.json']);
      expect(
        readdirSync(join(isolated.home, '.gemini', 'antigravity-cli')),
      ).toEqual(['antigravity-oauth-token']);
      expect(
        lstatSync(
          join(isolated.home, '.gemini', 'google_accounts.json'),
        ).isSymbolicLink(),
      ).toBe(true);
      expect(existsSync(join(isolated.home, '.gemini', 'GEMINI.md'))).toBe(
        false,
      );
    } finally {
      isolated.cleanup();
    }
    expect(existsSync(isolated.home)).toBe(false);
  });

  it('runs agy with the API deadline, an isolated HOME and the schema in the prompt', async () => {
    const log = join(temp('agy-log-'), 'log.json');
    const previous = process.env.GEMINI_API_KEY;
    process.env.AGY_TEST_LOG = log;
    process.env.GEMINI_API_KEY = 'must-not-leak';
    try {
      const bin = agyBin({
        status: 'SUCCESS',
        response: '{"valid":true,"issues":[]}',
        usage: { input_tokens: 10, output_tokens: 5, thinking_tokens: 2 },
      });
      const stats = {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
      };
      const respond = agyLocalResponder({ bin, home: '/iso/home' }, stats);
      const output = await respond(requestContext({ timeoutMs: 180000 }));
      expect(output).toEqual({ valid: true, issues: [] });
      const seen = JSON.parse(readFileSync(log, 'utf8')) as {
        args: string[];
        home: string;
        cwd: string;
        leaked: string | null;
      };
      expect(seen.home).toBe('/iso/home');
      expect(seen.leaked).toBeNull();
      expect(seen.cwd).toContain('alterward-agy-');
      expect(seen.args).toEqual(
        expect.arrayContaining([
          '--model',
          AGY_MODEL,
          '--output-format',
          'json',
          '--print-timeout',
          '180s',
          '--disable-slash-commands',
        ]),
      );
      expect(seen.args).not.toContain('--json-schema');
      const prompt = seen.args[seen.args.indexOf('-p') + 1]!;
      expect(prompt).toContain('SYSTEM TEXT');
      expect(prompt).toContain('{"type":"object"}');
      expect(prompt).toContain('{"a":1}');
      expect(stats).toMatchObject({
        calls: 1,
        inputTokens: 10,
        outputTokens: 5,
      });
    } finally {
      delete process.env.AGY_TEST_LOG;
      if (previous === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previous;
    }
  });

  it('enforces the output cap, rejects empty answers and steps where the model matters', async () => {
    process.env.AGY_TEST_LOG = join(temp('agy-log-'), 'log.json');
    try {
      const over = agyLocalResponder({
        bin: agyBin({
          status: 'SUCCESS',
          response: '{"a":1}',
          usage: { output_tokens: 6501 },
        }),
        home: '/iso',
      });
      expect(await over(requestContext())).toMatchObject({
        __rawResponse: { status: 'incomplete' },
      });
      const empty = agyLocalResponder({
        bin: agyBin({ status: 'SUCCESS', response: '', usage: {} }),
        home: '/iso',
      });
      await expect(empty(requestContext())).rejects.toMatchObject({
        code: 'AI_PROVIDER_FAILED',
      });
      const notJson = agyLocalResponder({
        bin: agyBin({ status: 'SUCCESS', response: 'sorry', usage: {} }),
        home: '/iso',
      });
      expect(await notJson(requestContext())).toMatchObject({
        __rawResponse: { status: 'incomplete' },
      });
      for (const task of [
        'life_narrative_plan',
        'life_narrative_chapter',
        'life_narrative_editor',
      ])
        await expect(over(requestContext({ task }))).rejects.toMatchObject({
          code: 'EVAL_CONFIG_INVALID',
        });
    } finally {
      delete process.env.AGY_TEST_LOG;
    }
  });

  it('refuses a prompt over the single-argument limit and a request without cap or deadline', async () => {
    const respond = agyLocalResponder({
      bin: agyBin({ status: 'SUCCESS', response: '{}', usage: {} }),
      home: '/iso',
    });
    const big = requestContext();
    (big.parameters as { input: unknown }).input = [
      { role: 'system', content: 'x'.repeat(130000) },
      { role: 'user', content: '{}' },
    ];
    await expect(respond(big)).rejects.toMatchObject({
      code: 'EVAL_CONFIG_INVALID',
    });
    await expect(
      respond(requestContext({ timeoutMs: undefined })),
    ).rejects.toMatchObject({ code: 'EVAL_CONFIG_INVALID' });
    expect(
      agyPrompt(
        [
          { role: 'system', content: 's' },
          { role: 'user', content: 'u' },
        ],
        {},
      ),
    ).toContain('=== JSON SCHEMA ===');
  });
});

describe('local runners end to end', () => {
  const base = (out: string, label = 'plumbing') => [
    '--run-label',
    label,
    '--creative-only',
    '--fixtures',
    'career-transition',
    '--periods',
    '1',
    '--out',
    out,
  ];
  const fresh = () => {
    const out = join(temp('local-run-'), 'out');
    return out;
  };
  const fixture: OfflineMockResponder = ({ defaultOutput }) => defaultOutput();

  it('routes only the model-independent steps to agy and records every decision', async () => {
    const out = fresh();
    const seen: Record<'agy' | 'codex', string[]> = { agy: [], codex: [] };
    const track =
      (engine: 'agy' | 'codex'): OfflineMockResponder =>
      (context) => {
        seen[engine].push(context.task);
        return context.defaultOutput();
      };
    const result = await evaluateNarrativeWithAgy(
      base(out),
      {},
      {
        agy: {
          responder: track('agy'),
          quota: quotaSource('agy', () => [90, 60]),
        },
        codex: {
          responder: track('codex'),
          quota: quotaSource('codex', () => [90, 90]),
        },
      },
    );
    expect(result.quotaHalt).toBeNull();
    expect(seen.agy.length).toBeGreaterThan(0);
    for (const task of seen.agy)
      expect(['life_narrative_plan_review', 'life_fidelity']).toContain(task);
    expect(seen.codex).toEqual(
      expect.arrayContaining(['life_narrative_plan', 'life_narrative_chapter']),
    );
    expect(seen.codex).not.toContain('life_fidelity');
    const marker = JSON.parse(
      readFileSync(join(out, 'agy-local.json'), 'utf8'),
    );
    expect(marker).toMatchObject({
      qualityEvidence: false,
      comparableWithPaid: false,
      routing: { fallbacks: [] },
    });
    expect(marker.routing.agy).toBe(seen.agy.length);
    expect(marker.quota.agy.log.length).toBeGreaterThan(0);
  }, 90000);

  it('moves agy steps to Codex, visibly, when the Gemini reserve is gone', async () => {
    const out = fresh();
    const seen: string[] = [];
    const result = await evaluateNarrativeWithAgy(
      base(out),
      {},
      {
        agy: {
          responder: () => {
            throw new Error('agy must not be used');
          },
          quota: quotaSource('agy', () => [90, 19]),
        },
        codex: {
          responder: (context) => {
            seen.push(context.task);
            return context.defaultOutput();
          },
          quota: quotaSource('codex', () => [90, 90]),
        },
      },
    );
    expect(result.quotaHalt).toBeNull();
    expect(seen).toEqual(expect.arrayContaining(['life_fidelity']));
    const marker = JSON.parse(
      readFileSync(join(out, 'agy-local.json'), 'utf8'),
    );
    expect(marker.routing.agy).toBe(0);
    expect(marker.routing.fallbacks.length).toBeGreaterThan(0);
    expect(marker.routing.fallbacks[0].reason).toContain('weekly');
  }, 90000);

  it('keeps every step on Codex in a quality run and requires a valid label', async () => {
    const out = fresh();
    const seen: Record<'agy' | 'codex', string[]> = { agy: [], codex: [] };
    const track =
      (engine: 'agy' | 'codex'): OfflineMockResponder =>
      (context) => {
        seen[engine].push(context.task);
        return context.defaultOutput();
      };
    await evaluateNarrativeWithAgy(
      base(out, 'quality'),
      {},
      {
        agy: {
          responder: track('agy'),
          quota: quotaSource('agy', () => [90, 60]),
        },
        codex: {
          responder: track('codex'),
          quota: quotaSource('codex', () => [90, 90]),
        },
      },
    );
    expect(seen.agy).toEqual([]);
    expect(seen.codex).toEqual(
      expect.arrayContaining(['life_fidelity', 'life_narrative_plan_review']),
    );
    const marker = JSON.parse(
      readFileSync(join(out, 'agy-local.json'), 'utf8'),
    );
    expect(marker).toMatchObject({
      runLabel: 'quality',
      purpose: 'quality diagnostic',
      agy: { used: false },
    });
    for (const argv of [base(fresh()).slice(2), base(fresh(), 'production')])
      await expect(
        evaluateNarrativeWithAgy(argv, {}, {}),
      ).rejects.toMatchObject({ code: 'EVAL_CONFIG_INVALID' });
  }, 90000);

  it('stops the run when Codex has no reserve instead of switching models', async () => {
    const out = fresh();
    await expect(
      evaluateNarrativeWithAgy(
        base(out),
        {},
        {
          agy: {
            responder: fixture,
            quota: quotaSource('agy', () => [90, 60]),
          },
          codex: {
            responder: fixture,
            quota: quotaSource('codex', () => [20, 90]),
          },
        },
      ),
    ).rejects.toBeInstanceOf(QuotaHalt);
    expect(existsSync(out)).toBe(false);
  });

  it('stops the Codex run before it starts without the start reserve', async () => {
    const out = fresh();
    await expect(
      evaluateNarrativeWithCodex(
        base(out).slice(2),
        {},
        fixture,
        quotaSource('codex', () => [90, 10]),
      ),
    ).rejects.toMatchObject({ code: 'EVAL_QUOTA_HALT' });
    expect(existsSync(out)).toBe(false);
  });

  it('stops at a chapter boundary, keeps the finished chapter and resumes in the same directory', async () => {
    const out = fresh();
    const args = [
      '--creative-only',
      '--fixtures',
      'career-transition',
      '--periods',
      '2',
      '--out',
      out,
    ];
    let reads = 0;
    const spent = quotaSource('codex', () => {
      reads += 1;
      // start and chapter 1 pass; chapter 2 meets a reserve below the boundary
      return [reads <= 2 ? 90 : 5, 90];
    });
    let firstCalls = 0;
    const halted = await evaluateNarrativeWithCodex(
      args,
      {},
      (context) => {
        firstCalls += 1;
        return context.defaultOutput();
      },
      spent,
    );
    expect(halted.quotaHalt).toContain('five-hour');
    expect(halted.failures).toEqual([
      { caseId: 'career-transition:narrative-v1:1', code: 'EVAL_QUOTA_HALT' },
    ]);
    expect(halted.samples).toBe(1);
    // Chapter 1 ran to its end (five stages); chapter 2 never started.
    expect(firstCalls).toBe(5);

    let resumedCalls = 0;
    const resumed = await evaluateNarrativeWithCodex(
      args,
      {},
      (context) => {
        resumedCalls += 1;
        return context.defaultOutput();
      },
      quotaSource('codex', () => [95, 95]),
    );
    expect(resumed.quotaHalt).toBeNull();
    expect(resumed.failures).toEqual([]);
    expect(resumed.samples).toBe(2);
    // Only the missing chapter was generated again.
    expect(resumedCalls).toBe(5);
    const marker = JSON.parse(
      readFileSync(join(out, 'codex-local.json'), 'utf8'),
    );
    expect(marker.quota.history).toHaveLength(1);
    expect(marker.quota.history[0].halted).toContain('five-hour');
  }, 120000);

  it('logs the quota of a Codex run in its marker', async () => {
    const out = fresh();
    const result = await evaluateNarrativeWithCodex(
      base(out).slice(2),
      {},
      fixture,
      quotaSource('codex', () => [90, 90]),
    );
    expect(result.quotaHalt).toBeNull();
    const marker = JSON.parse(
      readFileSync(join(out, 'codex-local.json'), 'utf8'),
    );
    expect(marker.quota.halted).toBeNull();
    expect(marker.quota.log.map((e: { phase: string }) => e.phase)).toEqual(
      expect.arrayContaining(['start', 'boundary', 'after-run']),
    );
  }, 90000);
});
