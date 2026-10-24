import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  fictionContextSchema,
  fictionPolicy,
  fictionSeriesLedgerSchema,
  fictionV7Policy,
  fictionV8Policy,
  type NarrativePeriodInput,
} from '@future-flow/contracts';
import {
  fictionAuthorRequest,
  fictionEditorialRequest,
  fictionFidelityRequest,
  fictionPlannerRequest,
  fictionReviewRequest,
  fictionSeriesLedgerFrom,
} from '@future-flow/core';
import { boundFictionContext } from '@future-flow/database';
import { fictionPrompts } from '../packages/ai/src/fiction-prompts';
import { fictionFixture } from './fiction-fixtures';

// Golden hashes of everything a v8 (quality 2.7.0) request carries, taken on
// 3bf4a69 BEFORE the planner-repetition change (C3). The change is v9-only: if
// one of these moves, a v8 byte moved. Random UUIDs of the fixtures are
// normalised by first occurrence, everything else is hashed as is.
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const normalised = (value: unknown) => {
  const seen = new Map<string, string>();
  return JSON.stringify(value).replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    (u) => {
      if (!seen.has(u)) seen.set(u, `u${seen.size}`);
      return seen.get(u)!;
    },
  );
};
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const body = (n: number) =>
  [
    `Chapter ${n}: the office smelled of toner when Niamh Byrne slid the sheet across to you.`,
    `Neither of you said the obvious thing. She suggested a different column order.`,
    `Neither of you mentioned the deadline. You let the silence settle.`,
    `She turned back to her screen, and you looked at the sheet for a long moment.`,
  ].join('\n\n');
const periods = [1, 2, 3, 4].map((n) => ({
  periodId: id(100 + n),
  body: body(n),
  events: [
    {
      actorIds: n % 2 ? [id(9)] : [],
      changes:
        n === 2
          ? [
              {
                type: 'goal_progress_set',
                value: { goalId: id(7), status: 'active', note: null },
              },
            ]
          : [],
    },
  ],
}));
const state = {
  actors: [
    { id: id(9), relationship: 'friend' },
    { id: id(10), relationship: 'colleague' },
  ],
  goals: [{ goalId: id(7) }],
};
const ledger = () =>
  fictionSeriesLedgerSchema.parse(fictionSeriesLedgerFrom(periods, state));

function v8Input(): ReturnType<typeof fictionFixture> {
  const base = fictionFixture().input;
  (base.narrativeContext as Record<string, unknown>).policy = fictionV8Policy();
  (base.narrativeContext as Record<string, unknown>).seriesLedger = ledger();
  return fictionFixture(base);
}

const GOLDEN = {
  prompts: {
    v7: '4d19dfb725080b81e270ae07c3630297c2a5726f0a8e749873e66c9b12131f0c',
    v8: '73559934eef6c530043e96f212f2988f65f051b785360f603b16664cf3c4efab',
  },
  ledger: '62343872e8e9c1c3cc1ce50fe73ff9ec6720a9639e89acafbf90d39b098b03b8',
  requests: {
    planner: '42f7a1427836bb24653c6b534f4bd25ee6bb3b9025056ded5a5a8aaeae92e315',
    author: 'd5daf07075ff191bf83a004dfc79a250abea15e0641cc2669d697cfa424cf077',
    review: 'bdbe4f0db2ed14a890ea22ca32a0741f7fa9ac305f7abbf8d3f6ec8b3c03033c',
    fidelity:
      'b662381a6707aeab1c0a10e39cd4b05edd377e36802c117e0b0304d648415117',
    editor: '2e2cf369cca4d8fe7d7523d5b59a818e5c0a6fa04ab31b49d76711a7a099a366',
  },
  boundContext:
    '88ffdc628c54ce70d5451639ebc1ecbf5f3874e523705f28604571f5e81dd9cb',
};

function measured() {
  const f = v8Input();
  const stages = (
    versions: ReturnType<typeof fictionV8Policy>['promptVersions'],
  ) =>
    ['en', 'hu'].flatMap((locale) => {
      const p = fictionPrompts(locale as 'en' | 'hu', versions);
      return [p.planner, p.author, p.review, p.fidelity, p.editor];
    });
  const base = (
    f.input.narrativeContext as unknown as {
      memory: Parameters<typeof boundFictionContext>[0];
    }
  ).memory;
  // A memory large enough to force the eviction order: six summaries with
  // excerpts, three full sequence entries and the ledger.
  const memory = structuredClone(base);
  memory.history = [1, 2, 3, 4, 5, 6].map((n) => ({
    periodId: id(200 + n),
    startDate: `2025-0${n}-01`,
    endDate: `2025-0${n}-28`,
    position: n,
    summary: `Summary ${n}: `.padEnd(480, 'x'),
    salientEventIds: [],
    excerpt: 'e'.repeat(1100),
  }));
  const sequence = periods.slice(-3).map((p) => ({
    periodId: p.periodId,
    scenes: [`${'a'.repeat(80)} | ${'b'.repeat(80)} | ${'c'.repeat(80)}`],
    opening: ('o' + p.body).padEnd(400, 'o').slice(0, 400),
    ending: ('e' + p.body).padEnd(500, 'e').slice(-500),
  }));
  const bound = boundFictionContext(memory, [], sequence, [], ledger());
  return {
    prompts: {
      v7: sha(JSON.stringify(stages(fictionV7Policy().promptVersions))),
      v8: sha(JSON.stringify(stages(fictionV8Policy().promptVersions))),
    },
    ledger: sha(JSON.stringify(ledger())),
    requests: {
      planner: sha(normalised(fictionPlannerRequest(f.input))),
      author: sha(normalised(fictionAuthorRequest(f.input, f.draft))),
      review: sha(
        normalised(fictionReviewRequest(f.input, f.authored, f.draft)),
      ),
      fidelity: sha(normalised(fictionFidelityRequest(f.input, f.authored))),
      editor: sha(normalised(fictionEditorialRequest(f.input, f.authored))),
    },
    boundContext: sha(normalised(bound)),
  };
}

describe('v8 golden hashes (taken before the planner-repetition change)', () => {
  it('keeps every v8 prompt, ledger and request byte for byte', () => {
    expect(fictionPolicy()).toEqual(fictionV8Policy());
    expect(measured()).toEqual(GOLDEN);
  });
  it('builds the v8 context without a v9 projection exactly as before', () => {
    const f = v8Input();
    const parsed = fictionContextSchema.parse(f.input.narrativeContext);
    expect(parsed.characterProjection).toBeUndefined();
    expect(parsed.seriesLedger?.version).toBe('1.0.0');
    void ({} as NarrativePeriodInput);
  });
});
