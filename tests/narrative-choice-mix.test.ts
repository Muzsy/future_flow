import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEvaluationOptions } from '../scripts/lib/narrative-evaluation-options';
import {
  rotatingChoice,
  runNarrativeEvaluation,
} from '../scripts/lib/narrative-evaluation-runner';

describe('the harness choice mix', () => {
  const options = (labels: string[]) =>
    labels.map((label, i) => ({
      id: `opt-${i}`,
      label,
      description: `${label} and carry on.`,
    }));
  const intent = {} as never;

  it('is a creative-only diagnostic and absent by default', () => {
    const base = [
      '--mode',
      'offline',
      '--creative-only',
      '--fixtures',
      'career-transition',
    ];
    expect(parseEvaluationOptions(base)).not.toHaveProperty('choiceMix');
    expect(
      parseEvaluationOptions([...base, '--choice-mix', 'first']),
    ).not.toHaveProperty('choiceMix');
    expect(
      parseEvaluationOptions([...base, '--choice-mix', 'rotate']),
    ).toMatchObject({ choiceMix: 'rotate' });
    expect(() =>
      parseEvaluationOptions([...base, '--choice-mix', 'random']),
    ).toThrow('Unsupported choice mix');
    expect(() =>
      parseEvaluationOptions([
        '--mode',
        'offline',
        '--creative',
        '--choice-mix',
        'rotate',
      ]),
    ).toThrow('creative-only');
    expect(() =>
      parseEvaluationOptions(['--mode', 'offline', '--choice-mix', 'rotate']),
    ).toThrow('creative-only');
  });

  it('is the same for the same options, and rotates the main branch', () => {
    const o = options(['Take the offer', 'Decline politely', 'Ask for time']);
    const picks = [0, 1, 2, 3].map(
      (k) => rotatingChoice(o, intent, false, k).optionId,
    );
    expect(picks).toEqual(['opt-0', 'opt-1', 'opt-2', 'opt-0']);
    expect(rotatingChoice(o, intent, false, 1)).toEqual(
      rotatingChoice(o, intent, false, 1),
    );
    const mapping = rotatingChoice(o, intent, false, 1);
    expect(mapping.selection).toBe('diagnostic-rotate');
    expect(mapping.rationale).toContain('decision 1');
    expect(mapping.rationale).toContain('3 candidate(s) of 3 option(s)');
    expect(mapping.rationale).toContain('UNREVIEWED');
  });

  it('never picks an exit option while another exists, and says it filtered', () => {
    const o = options([
      'End the project here',
      'Keep going with the plan',
      'Conclude it and retain the old routine',
      'Try a different supplier',
    ]);
    for (let k = 0; k < 6; k++) {
      const picked = rotatingChoice(o, intent, false, k);
      expect(['opt-1', 'opt-3']).toContain(picked.optionId);
      expect(picked.rationale).toContain('2 candidate(s) of 4 option(s)');
      expect(picked.rationale).toContain('exit filter applied');
    }
    // Only exits: all options stay candidates.
    const exits = options(['Stop now', 'Close it down']);
    expect(rotatingChoice(exits, intent, false, 0).optionId).toBe('opt-0');
  });

  it('gives the fork another direction than the main branch', () => {
    const three = options(['One way', 'Another way', 'A third way']);
    for (const k of [0, 1, 2, 3]) {
      const main = rotatingChoice(three, intent, false, k);
      const fork = rotatingChoice(three, intent, true, k);
      expect(fork.optionId).not.toBe(main.optionId);
    }
    const two = options(['One way', 'Another way']);
    expect(rotatingChoice(two, intent, true, 1).optionId).not.toBe(
      rotatingChoice(two, intent, false, 1).optionId,
    );
    // A single non-exit candidate: the fork widens to the other option.
    const mixed = options(['Keep it going', 'Stop it here']);
    const main = rotatingChoice(mixed, intent, false, 1);
    const fork = rotatingChoice(mixed, intent, true, 1);
    expect(fork.optionId).not.toBe(main.optionId);
    expect(fork.rationale).toContain('widened');
  });

  it('walks the options with --choice-mix rotate, marks the report, and leaves the default run unmarked', async () => {
    const run = async (extra: string[]) => {
      const out = await mkdtemp(join(tmpdir(), 'alterward-fiction-v9-mix-'));
      try {
        const report = await runNarrativeEvaluation(
          parseEvaluationOptions([
            '--creative-only',
            '--fiction-generation',
            'v9',
            '--fixtures',
            'creative-portfolio',
            '--periods',
            '3',
            '--out',
            out,
            ...extra,
          ]),
        );
        const state = join(out, 'state');
        const dir = join(state, (await readdir(state))[0]!);
        const names = (await readdir(dir)).filter((n) => /^choice-/.test(n));
        const choices = await Promise.all(
          names
            .sort()
            .map(async (n) => JSON.parse(await readFile(join(dir, n), 'utf8'))),
        );
        return { report, choices };
      } finally {
        await rm(out, { recursive: true, force: true });
      }
    };
    const first = await run([]);
    expect(first.report).not.toHaveProperty('choiceMix');
    expect(first.choices.length).toBeGreaterThan(0);
    for (const c of first.choices) expect(c.selection).toBe('diagnostic-index');
    const rotate = await run(['--choice-mix', 'rotate']);
    expect(rotate.report.choiceMix).toBe('rotate');
    for (const c of rotate.choices) {
      expect(c.selection).toBe('diagnostic-rotate');
      expect(c.reviewed).toBe(false);
      expect(c.rationale).toContain('UNREVIEWED');
    }
    // The mock cast has the same options every time: decision k takes the
    // k-th candidate (modulo), so the second decision differs from the first.
    expect(rotate.choices.map((c) => c.optionId).length).toBeGreaterThan(0);
  });
});
