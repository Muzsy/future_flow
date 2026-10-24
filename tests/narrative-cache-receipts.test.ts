import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CACHE_RATES,
  cacheReceipts,
  cacheReceiptsMarkdown,
} from '../scripts/lib/narrative-cache-receipts';
import { runNarrativeCacheReceipts } from '../scripts/narrative-cache-receipts';

const receipt = (
  task: string,
  inputTokens: number,
  cachedInputTokens: number,
  cacheWriteTokens: number,
) => ({
  task,
  inputTokens,
  outputTokens: 100,
  cachedInputTokens,
  cacheWriteTokens,
});

const report = (rows: ReturnType<typeof receipt>[][]) => ({
  mock: false,
  samples: rows.map((receipts, periodIndex) => ({
    kind: 'full',
    periodIndex,
    receipts,
  })),
});

describe('cache accounting from stored receipts', () => {
  it('totals reads and writes per stage and per chapter and prices them against no cache', () => {
    const [run] = cacheReceipts([
      {
        label: 'paid',
        report: report([
          [
            receipt('life_narrative_plan', 1000, 0, 1000),
            receipt('life_fidelity', 500, 0, 500),
          ],
          [receipt('life_narrative_plan', 1000, 400, 600)],
        ]),
      },
    ]);
    expect(run!.total).toMatchObject({
      calls: 3,
      inputTokens: 2500,
      cachedInputTokens: 400,
      cacheWriteTokens: 2100,
    });
    expect(run!.stages.map((s) => [s.key, s.calls])).toEqual([
      ['life_narrative_plan', 2],
      ['life_fidelity', 1],
    ]);
    expect(run!.chapters.map((c) => [c.key, c.inputTokens])).toEqual([
      ['ch0', 1500],
      ['ch1', 1000],
    ]);
    // 2500 input: 0 uncached, 400 read, 2100 written.
    expect(run!.total.billedUsd).toBeCloseTo(
      (400 * CACHE_RATES.read + 2100 * CACHE_RATES.write) / 1e6,
      10,
    );
    expect(run!.total.noCacheUsd).toBeCloseTo(
      (2500 * CACHE_RATES.input) / 1e6,
      10,
    );
    expect(run!.total.readShare).toBeCloseTo(0.16, 10);
  });

  it('says in words when the implicit mode only adds the write surcharge, and when there is nothing to read', () => {
    const [writes, none, hits] = cacheReceipts([
      {
        label: 'a',
        report: report([[receipt('life_fidelity', 1000, 0, 900)]]),
      },
      {
        label: 'b',
        report: {
          mock: true,
          samples: [
            {
              kind: 'full',
              periodIndex: 0,
              receipts: [receipt('life_fidelity', 0, 0, 0)],
            },
          ],
        },
      },
      {
        label: 'c',
        report: report([[receipt('life_fidelity', 1000, 600, 100)]]),
      },
    ]);
    expect(writes!.reading).toContain('write surcharge');
    expect(none!.reading).toContain('nothing to read');
    expect(hits!.reading).toContain('substantial share');
    expect(cacheReceiptsMarkdown([writes!])).toContain(
      '| fidelity | 1 | 1000 | 0 |',
    );
  });

  it('only reads the run directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'alterward-cache-'));
    try {
      const file = join(dir, 'report.json');
      await writeFile(
        file,
        JSON.stringify(
          report([[receipt('life_narrative_chapter', 800, 0, 800)]]),
        ),
      );
      const before = await readFile(file, 'utf8');
      const markdown = await runNarrativeCacheReceipts([dir]);
      expect(markdown).toContain('chapter');
      expect(await readFile(file, 'utf8')).toBe(before);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
