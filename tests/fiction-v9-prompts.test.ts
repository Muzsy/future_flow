import { describe, expect, it } from 'vitest';
import { fictionPrompts } from '../packages/ai/src/fiction-prompts';
import { fictionV8Policy, fictionV9Policy } from '@future-flow/contracts';

describe('v9 prompts', () => {
  const v8 = fictionPrompts('en', fictionV8Policy().promptVersions);
  const v9 = fictionPrompts('en', fictionV9Policy().promptVersions);
  it('extend the frozen v8 text and leave the checks untouched', () => {
    expect(fictionPrompts('en')).toEqual(v8);
    expect(v9.planner.startsWith(v8.planner)).toBe(true);
    expect(v9.author.startsWith(v8.author)).toBe(true);
    expect(v9.review.startsWith(v8.review)).toBe(true);
    expect(v9.fidelity).toBe(v8.fidelity);
    expect(v9.editor).toBe(v8.editor);
  });
  it('add short, structured-input character rules (plan section 41)', () => {
    expect(v9.planner.slice(v8.planner.length)).toContain('characterIntent');
    expect(v9.author.slice(v8.author.length)).toContain('characterDelta');
    // No new rulebook: each addition stays well under 2.5 KiB.
    for (const stage of ['planner', 'author', 'review'] as const)
      expect(v9[stage].length - v8[stage].length).toBeLessThan(2560);
    expect(v9.author).toContain('never user_supplied');
    expect(v9.planner).toContain('Never invent a private aim');
  });
  it('keep both languages', () => {
    const hu = fictionPrompts('hu', fictionV9Policy().promptVersions);
    expect(hu.author).toContain('Hungarian');
    expect(hu.author.length).toBeGreaterThan(v8.author.length - 1);
  });
});
