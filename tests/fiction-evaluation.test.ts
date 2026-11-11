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
  it('supports a labelled creative-only diagnosis without repeating historical writers or claiming release completeness', async () => {
    const out = await mkdtemp(join(tmpdir(), 'alterward-fiction-only-'));
    try {
      const o = parseEvaluationOptions([
        '--creative-only',
        '--fixtures',
        'creative-portfolio',
        '--periods',
        '2',
        '--out',
        out,
      ]);
      expect(o.creative).toBe(true);
      const run = await runNarrativeEvaluation(o);
      expect(run.diagnosticOnly).toBe(true);
      expect(run.samples).toHaveLength(2);
      expect(run.samples[0]!.mode).toBe('narrative-v1');
      expect(run.samples[0]!.requestCount).toBe(5);
      expect(run.samples[1]!.choiceMappings[0]).toMatchObject({
        reviewed: false,
        selection: 'diagnostic-index',
      });
      expect(run.complete).toBe(false);
      expect(run.failures).toEqual([]);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 60000);
});
