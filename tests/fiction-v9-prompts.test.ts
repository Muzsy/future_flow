import { describe, expect, it } from 'vitest';
import { fictionPrompts } from '../packages/ai/src/fiction-prompts';
import { fictionV8Policy, fictionV9Policy } from '@future-flow/contracts';

describe('v9 prompts', () => {
  const v8 = fictionPrompts('en', fictionV8Policy().promptVersions);
  const v9 = fictionPrompts('en', fictionV9Policy().promptVersions);
  it('extend the frozen v8 text and leave the checks untouched', () => {
    expect(fictionPrompts('en')).toEqual(v8);
    // The planner is the one deliberate exception (C3, owner decision
    // 2026-10-21 23:30 Hungarian time): see "the v9 planner" below.
    expect(v9.planner.startsWith(v8.planner)).toBe(false);
    // The author is the v8 text with two exact-once replacements (C4/D1, see
    // "the v9 author" below) plus the v9 additions.
    expect(v9.author.startsWith(v8.author)).toBe(false);
    expect(v9.review.startsWith(v8.review)).toBe(true);
    expect(v9.fidelity).toBe(v8.fidelity);
  });
  const OLD_ACCEPTANCE =
    'Acceptance requires causality/momentum/sceneCraft/choiceStakes/prose >=4, eight-score mean >=4, no major or canon issue.';
  const NEW_ACCEPTANCE =
    'Acceptance requires all eight scores >=4 and no major or canon issue.';
  it('give the v9 editor the gate-exact acceptance sentence and nothing else (the old choiceStakes strictness stays)', () => {
    expect(v8.editor.split(OLD_ACCEPTANCE)).toHaveLength(2);
    expect(v9.editor.includes(OLD_ACCEPTANCE)).toBe(false);
    expect(v9.editor.split(NEW_ACCEPTANCE)).toHaveLength(2);
    // The one replacement is the only difference from the v8 text: no
    // choiceStakes calibration, no softened rubric of any kind.
    expect(v9.editor).toBe(v8.editor.replace(OLD_ACCEPTANCE, NEW_ACCEPTANCE));
    expect(v9.editor.includes('CHOICE-STAKES')).toBe(false);
    expect(v9.editor.length).toBeLessThan(v8.editor.length);
    // The later sentence of the inherited series text stays, so the prompt carries
    // exactly the rule the gate applies.
    expect(v9.editor).toContain(
      'Acceptance still needs all eight scores >=4, verdict=pass, no major/canon issue, and now all seven sequence flags true.',
    );
  });
  it('ask the v9 author for a concrete pull of every option in the first draft, without explaining the weighing', () => {
    const rule = v9.author.slice(v9.author.indexOf('\nCHOICE-STAKES CRAFT:'));
    expect(rule.startsWith('\nCHOICE-STAKES CRAFT: let each option')).toBe(
      true,
    );
    expect(rule).toContain('an object, a sensation or an action');
    expect(rule).toContain('already in this first draft');
    expect(rule).toContain('Do not explain the weighing');
    expect(rule).toContain('You fear X... You also fear Y');
    expect(rule).toContain('storyFacts');
    expect(rule).toContain('a new person, object, cause or fact');
    expect(rule).toContain(
      'In a repair round only authorRepair.message and authorRepair.repairRule apply',
    );
    expect(rule.length).toBeLessThan(1100);
    // The rule is the last addition of the author text, only once, v9 only.
    expect(v9.author.split('CHOICE-STAKES CRAFT').length).toBe(2);
    expect(v8.author.includes('CHOICE-STAKES CRAFT')).toBe(false);
    expect(v9.author.endsWith(rule)).toBe(true);
    // A stored v9 snapshot (writer v9, v8 editor) gets the same author text.
    const stored = fictionPrompts('en', {
      ...fictionV9Policy().promptVersions,
      editor: 'life_fiction_editor.v8',
    });
    expect(stored.author).toBe(v9.author);
  });
  it('keep the v8 and v7 editor text byte for byte, and a stored v9 snapshot with the v8 editor on it', () => {
    expect(v8.editor.includes(OLD_ACCEPTANCE)).toBe(true);
    expect(v8.editor.includes('CHOICE-STAKES CALIBRATION')).toBe(false);
    const stored = fictionPrompts('en', {
      ...fictionV9Policy().promptVersions,
      editor: 'life_fiction_editor.v8',
    });
    expect(stored.editor).toBe(v8.editor);
    expect(stored.author).toBe(v9.author);
    const v7 = fictionPrompts('en', {
      ...fictionV8Policy().promptVersions,
    });
    expect(v7.editor).toBe(v8.editor);
  });
  it('add short, structured-input character rules (plan section 41)', () => {
    expect(v9.planner).toContain('CHARACTER-INTENT CRAFT');
    expect(v9.author).toContain('characterDelta');
    expect(v8.author).not.toContain('characterDelta');
    // No new rulebook: each addition stays under 3 KiB (the author addition
    // carries the delta rules, the continuity binding, the cast and repair
    // rules and the embodiment line, about 2.7 KiB measured).
    // The author addition also carries the choice-stakes craft rule (about
    // 0.8 KiB, 2026-10-21) and the three C4/D1 sentences (about 0.6 KiB,
    // 2026-10-22), so its bound is a conscious 4.25 KiB.
    // The planner is shorter than v8 after the C3 cleanup, so only review
    // keeps the addition bound.
    expect(v9.review.length - v8.review.length).toBeLessThan(3072);
    expect(v9.author.length - v8.author.length).toBeLessThan(4352);
    // New speaking people are registered, a repair adds nothing new, and the
    // final review asks for the same (the fidelity rule itself is unchanged).
    expect(v9.author).toContain('actor_add and a profile');
    // The repair rule itself travels in the repair request, by mode (see
    // fiction-v9-request-bytes); the prompt only points at it.
    expect(v9.author).toContain('follow authorRepair.repairRule');
    expect(v9.author).not.toContain('register or remove');
    expect(v9.review).toContain('new speaking person has no actor_add');
    // A continuity reason is a planning note: the planner names only what the
    // projection shows or the plan will show, the author never lifts it into
    // an event summary as something that happened (v9 phase-5 chapter 1).
    expect(v9.planner).toContain('a planning note, never a past event');
    expect(v9.author).toContain(
      'a planning note, not a fact: never write it into an event summary',
    );
    expect(v8.planner).not.toContain('planning note');
    expect(v8.author).not.toContain('planning note');
    // v8 is frozen: none of it leaks into the v8 prompts.
    expect(v8.author).not.toContain('speaking role');
    expect(v8.review).not.toContain('speaking person');
    expect(v9.author).toContain('never user_supplied');
    // Only the server may label a fact as supplied (review B2) and a person
    // who joins and leaves in one chapter is archived (review B3).
    expect(v9.author).toContain('only the server may label');
    // A supplied person: branch_fiction only for the relationship itself (N2).
    expect(v9.author).toContain(
      'branch_fiction only for how the relationship itself changed',
    );
    expect(v9.author).toContain('never a private real-world fact');
    expect(v9.author).toContain(
      'enters by actor_add and leaves by actor_remove',
    );
    expect(v9.planner).toContain('Never invent a private aim');
    // A person carried over from an earlier generation is shown through the
    // recorded legacy view and gets state, never an invented profile (F3).
    expect(v9.author).toContain('legacy view and no profile');
  });
  it('keep both languages', () => {
    const hu = fictionPrompts('hu', fictionV9Policy().promptVersions);
    expect(hu.author).toContain('Hungarian');
    expect(hu.author.length).toBeGreaterThan(v8.author.length - 1);
  });

  describe('the v9 author (C4/D1)', () => {
    const ORDER = 'storyFacts and chapter.';
    const ORDER_V9 = 'chapter, then storyFacts of what it contains.';
    const BACKGROUND = 'Do not duplicate every sentence.';
    it('lists the chapter before the story facts and registers past specifics, by two exact replacements of the v8 text', () => {
      for (const from of [ORDER, BACKGROUND])
        expect(v8.author.split(from)).toHaveLength(2);
      expect(v9.author).toContain(ORDER_V9);
      expect(v9.author.split(ORDER_V9)).toHaveLength(2);
      expect(v9.author.includes(ORDER)).toBe(false);
      expect(v9.author).toContain(
        'a past specific the prose states (how long, how many times, an earlier request) is a continuity storyFact on its first event, or is left out',
      );
      // Everything else of the v8 author text is where it was.
      const back = v9.author
        .replace(ORDER_V9, ORDER)
        .replace(/Do not duplicate every sentence, but [^.]*\./, BACKGROUND);
      expect(back.startsWith(v8.author)).toBe(true);
    });
    it('carries a general mechanics rule and saves no figure or story detail in any prompt', () => {
      const rule = v9.author.slice(
        v9.author.indexOf('\nMECHANICS-FIGURES CRAFT:'),
      );
      expect(rule).toContain('mechanicsFigures are exact numbers');
      expect(rule).toContain('Never restate one as a figure or count');
      expect(rule.length).toBeLessThan(300);
      // The prompt names no concrete number or story element: the figures come
      // with the request, from the life's own state.
      expect(rule).not.toMatch(/\d/);
      expect(v8.author).not.toContain('mechanicsFigures');
      expect(v9.planner).not.toContain('mechanicsFigures');
      expect(v9.review).not.toContain('mechanicsFigures');
    });
  });
});
