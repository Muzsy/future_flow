import { describe, expect, it } from 'vitest';
import {
  compareRuns,
  comparisonMarkdown,
  type ComparisonRun,
} from '../scripts/lib/narrative-run-comparison';

const t = (caseId: string, task: string, requestBytes: number) => ({
  caseId,
  task,
  requestBytes,
});
const run = (label: string, living: boolean): ComparisonRun => ({
  label,
  report: {
    samples: [
      {
        fixtureId: 'career',
        mode: 'narrative-v1',
        kind: 'full',
        periodIndex: 0,
        requestCount: 5,
        repairUsed: false,
        elapsedMs: 240000,
        ...(living
          ? {
              character: {
                projectionBytes: 1500,
                deltaBytes: 1800,
                omittedActors: 0,
                characterRepair: false,
                continuity: { required: ['a', 'b'], missing: ['b'] },
              },
            }
          : {}),
      },
      {
        fixtureId: 'career',
        mode: 'narrative-v1',
        kind: 'full',
        periodIndex: 1,
        requestCount: 9,
        repairUsed: true,
        elapsedMs: 408000,
      },
      {
        fixtureId: 'career',
        mode: 'narrative-v1',
        kind: 'fork',
        periodIndex: 2,
        requestCount: 9,
        repairUsed: true,
        errorCode: 'NARRATIVE_QUALITY_FAILED',
      },
    ],
    failures: [
      {
        caseId: 'fork:career:narrative-v1',
        code: 'NARRATIVE_QUALITY_FAILED',
        stage: 'FICTION_EDITOR_RESULT',
        diagnostic: { message: 'Rewrite the weak story.' },
      },
    ],
  },
  transports: [
    t('career:narrative-v1:0', 'life_narrative_plan', 54700),
    t('career:narrative-v1:0', 'life_narrative_chapter', 72100),
    t('career:narrative-v1:1', 'life_narrative_plan', 77700),
    t('career:narrative-v1:1', 'life_narrative_chapter', 95100),
    // A repair author request over the production guard once the buffer is added.
    t('career:narrative-v1:1', 'life_narrative_chapter', 115421),
    t('fork:career:narrative-v1:2', 'life_narrative_chapter', 112310),
  ],
});

describe('run comparison (generation facts)', () => {
  const [v8, v9] = compareRuns([run('v8', false), run('v9', true)]);
  it('lists calls, repair and time per sample and totals them', () => {
    expect(v8!.rows.map((r) => r.chapter)).toEqual(['ch0', 'ch1', 'fork']);
    expect(v8!.rows[1]).toMatchObject({
      requestCount: 9,
      repairUsed: true,
      elapsedSec: 408,
    });
    expect(v8!.totalRequests).toBe(23);
    expect(v8!.chaptersWithRepair).toBe(2);
    expect(v8!.chaptersAtCeiling).toBe(2);
  });
  it('takes the largest request per stage, flags those over the guard and shows the growth', () => {
    expect(v8!.rows[1]!.maxRequestBytes.author).toBe(115421);
    expect(v8!.rows[1]!.requestsOverGuard).toEqual(['author']);
    expect(v8!.rows[0]!.requestsOverGuard).toEqual([]);
    expect(v8!.rows[2]!.requestsOverGuard).toEqual(['author']);
    expect(v8!.growth.plan).toMatchObject({ first: 54700, last: 77700 });
    // The author growth compares the largest request of the first and the last chapter.
    expect(v8!.growth.author).toMatchObject({ first: 72100, last: 115421 });
  });
  it('keeps the living-world fields only where the run has them', () => {
    expect(v8!.rows[0]!.projectionBytes).toBeNull();
    expect(v9!.rows[0]).toMatchObject({
      projectionBytes: 1500,
      omittedActors: 0,
      characterRepair: false,
      continuityMissing: '1/2',
    });
  });
  it('carries a failure with its stage and message and renders a table', () => {
    expect(v8!.failures[0]).toMatchObject({
      stage: 'FICTION_EDITOR_RESULT',
      message: 'Rewrite the weak story.',
    });
    const md = comparisonMarkdown([v8!, v9!]);
    expect(md).toContain('## v8');
    expect(md).toContain('| ch1 | 9 | yes | 408 |');
    expect(md).toContain('Failure fork:career:narrative-v1');
  });
});
