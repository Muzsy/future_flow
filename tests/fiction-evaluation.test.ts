import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseEvaluationOptions } from '../scripts/lib/narrative-evaluation-options';
import { runNarrativeEvaluation } from '../scripts/lib/narrative-evaluation-runner';

describe('creative corpus uses the same model and durable existing evaluation controls', () => {
  it('rejects a creative model experiment and leaves default historical options unchanged', () => {
    expect(() =>
      parseEvaluationOptions(['--creative', '--story-model', 'gpt-6-luna']),
    ).toThrow();
    expect(parseEvaluationOptions([])).not.toHaveProperty('creative');
    expect(parseEvaluationOptions(['--creative']).creative).toBe(true);
  });
  it('runs and resumes a two-period creative/legacy corpus without repeating transport work', async () => {
    const out = await mkdtemp(join(tmpdir(), 'alterward-fiction-'));
    try {
      const options = parseEvaluationOptions([
        '--creative',
        '--mode',
        'offline',
        '--fixtures',
        'creative-portfolio',
        '--periods',
        '2',
        '--out',
        out,
      ]);
      const report = await runNarrativeEvaluation(options);
      expect(report.variant).toBe('narrative-fiction-v2');
      expect(report.failures).toEqual([]);
      expect(report.samples.filter((s) => s.kind === 'full')).toHaveLength(4);
      const n = report.samples.filter(
        (s) => s.mode === 'narrative-v1' && s.kind === 'full',
      );
      expect(
        n.every((s) =>
          s.receipts.some((r) =>
            r.promptVersion.startsWith('life_fiction_author.'),
          ),
        ),
      ).toBe(true);
      expect(n[1]!.prefix).toHaveLength(1);
      const resumed = await runNarrativeEvaluation(options);
      expect(resumed.samples.map((s) => s.receipts)).toEqual(
        report.samples.map((s) => s.receipts),
      );
      expect(resumed.mock).toBe(true);
      expect(resumed.complete).toBe(false);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 60000);
});
