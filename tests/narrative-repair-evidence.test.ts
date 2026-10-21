import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  pearson,
  repairEvidence,
  repairEvidenceMarkdown,
} from '../scripts/lib/narrative-repair-evidence';

// A stored run reduced to what the tool reads: transport records and one
// attempt trace with an editor-triggered (prose-only) repair whose result the
// fidelity check refuses.
function storedRun() {
  const root = mkdtempSync(join(tmpdir(), 'alterward-repair-evidence-'));
  const fact = (id: string, assertion: string) => ({ id, assertion });
  const author = (facts: unknown[], body: string) => ({
    storyFacts: facts,
    chapter: { body },
  });
  const attempt = (ordinal: number, task: string, extra: object) => ({
    ordinal,
    task,
    status: 'completed',
    latencyMs: 1000,
    output: null,
    repairFeedback: null,
    ...extra,
  });
  const a = fact('f1', 'The first delivery held only print-ready files.');
  mkdirSync(join(root, 'diagnostic-attempts'));
  writeFileSync(
    join(root, 'diagnostic-attempts', 'career-1.json'),
    JSON.stringify({
      caseId: 'career:1',
      attempts: [
        attempt(0, 'life_narrative_chapter', {
          output: author([a], 'one two three'),
        }),
        attempt(1, 'life_fidelity', { output: { valid: true, issues: [] } }),
        attempt(2, 'life_narrative_editor', {
          output: {
            verdict: 'revise',
            issues: [
              {
                dimension: 'choiceStakes',
                severity: 'major',
                repairScope: 'prose',
                suggestedFix: 'Make the decision concrete.',
              },
            ],
          },
        }),
        attempt(3, 'life_narrative_chapter', {
          latencyMs: 191000,
          repairFeedback: {
            mode: 'prose_only',
            message: 'Rewrite the weak story',
          },
          output: author([a], 'one two three four five'),
        }),
        attempt(4, 'life_fidelity', {
          output: {
            valid: false,
            issues: [{ reason: 'unregistered_material_fact: the originals' }],
          },
        }),
        attempt(5, 'life_narrative_editor', {
          output: {
            verdict: 'revise',
            scores: { novelty: 4, choiceStakes: 3 },
            issues: [
              {
                dimension: 'choiceStakes',
                severity: 'minor',
                repairScope: 'prose',
              },
            ],
          },
        }),
      ],
    }),
  );
  writeFileSync(
    join(root, 'transport-records.json'),
    JSON.stringify(
      [10, 20, 30, 40].map((i) => ({
        caseId: 'career:1',
        task: 'life_narrative_chapter',
        latencyMs: i * 5000,
        requestBytes: i * 1000,
        outputBytes: 500,
      })),
    ),
  );
  return root;
}

describe('repair evidence (stored files only)', () => {
  it('shows mode, findings, frozen facts and the fidelity result of a repair', () => {
    const root = storedRun();
    const evidence = repairEvidence(root);
    expect(evidence.repairs).toHaveLength(1);
    const r = evidence.repairs[0]!;
    expect(r.mode).toBe('prose_only');
    expect(r.editorBefore?.issues[0]).toMatchObject({
      dimension: 'choiceStakes',
      repairScope: 'prose',
    });
    expect(r.fidelityBefore?.valid).toBe(true);
    // A prose-only repair cannot register facts: the story facts are frozen.
    expect(r.storyFacts).toMatchObject({ before: 1, after: 1, frozen: true });
    expect(r.bodyWords).toEqual({ before: 3, after: 5 });
    // The editor that ran after the repair: a new dimension, minor.
    expect(r.editorAfter).toEqual({
      verdict: 'revise',
      scores: { novelty: 4, choiceStakes: 3 },
      issues: ['choiceStakes/minor/prose'],
    });
    expect(r.fidelityAfter?.valid).toBe(false);
    expect(r.fidelityAfter?.reasons[0]).toContain('unregistered_material_fact');
    const markdown = repairEvidenceMarkdown([evidence]);
    expect(markdown).toContain('mode prose_only, 191 s');
    expect(markdown).toContain('frozen');
  });

  it('projects the 9-call ceiling of an author-package repair for material editor findings', () => {
    const evidence = repairEvidence(storedRun());
    // 6 stored attempts (author, fidelity, editor, repair author, fidelity, editor)
    // here; the editor's choiceStakes finding is a material dimension.
    expect(evidence.chapters).toEqual([
      {
        caseId: 'career:1',
        calls: 6,
        repairMode: 'prose_only',
        materialEditorRepair: true,
        callsIfAuthorPackage: 7,
        repairTrigger: 'editor',
        preRepairEditorCalls: 0,
        callsIfEditorSkipped: 6,
      },
    ]);
    expect(evidence.ceiling).toEqual({
      now: 0,
      ifAuthorPackage: 0,
      ifEditorSkipped: 0,
      editorSkipped: 0,
      cases: 1,
    });
    expect(repairEvidenceMarkdown([evidence])).toContain(
      'material editor dimension -> 7 calls as author_package',
    );
  });

  it('tells a size-driven slow call from one that is not', () => {
    const evidence = repairEvidence(storedRun());
    const author = evidence.latency.find(
      (l) => l.task === 'life_narrative_chapter',
    )!;
    expect(author.calls).toBe(4);
    expect(author.meanMs).toBe(125000);
    expect(author.meanOutputBytes).toBe(500);
    expect(evidence.calls).toHaveLength(4);
    expect(author.over150s).toBe(1);
    expect(author.over180s).toBe(1);
    // Latency here grows with the request bytes and not with the (constant)
    // output bytes.
    expect(author.rRequestBytes).toBe(1);
    expect(author.rOutputBytes).toBeNull();
    expect(pearson([1, 2], [1, 2])).toBeNull();
  });

  it('reports an empty run without failing', () => {
    const root = mkdtempSync(join(tmpdir(), 'alterward-repair-empty-'));
    expect(repairEvidence(root)).toMatchObject({
      latency: [],
      slowCalls: [],
      repairs: [],
    });
  });

  // Stored shapes of the measured fidelity-triggered chapters (6b ch1, 6c ch1,
  // 6c ch4, 6g ch2 style: nine calls, the editor read before the repair), an
  // editor-triggered nine-call chapter, a review-triggered one and a clean one.
  function ceilingRun() {
    const root = mkdtempSync(join(tmpdir(), 'alterward-repair-ceiling-'));
    mkdirSync(join(root, 'diagnostic-attempts'));
    const call = (ordinal: number, task: string, extra: object = {}) => ({
      ordinal,
      task,
      status: 'completed',
      latencyMs: 1000,
      output: null,
      repairFeedback: null,
      ...extra,
    });
    const bad = {
      valid: false,
      issues: [{ reason: 'unregistered_material_fact' }],
    };
    const good = { valid: true, issues: [] };
    const revise = {
      verdict: 'revise',
      issues: [
        {
          dimension: 'prose',
          severity: 'minor',
          repairScope: 'prose',
          suggestedFix: 'Change the ending.',
        },
      ],
    };
    const pass = { verdict: 'pass', issues: [] };
    const nine = (message: string, fidelity: object, editor: object) => [
      call(0, 'life_narrative_plan'),
      call(1, 'life_narrative_chapter'),
      call(2, 'life_narrative_plan_review'),
      call(3, 'life_fidelity', { output: fidelity }),
      call(4, 'life_narrative_editor', { output: editor }),
      call(5, 'life_narrative_chapter', {
        repairFeedback: { mode: 'author_package', message },
      }),
      call(6, 'life_narrative_plan_review'),
      call(7, 'life_fidelity', { output: good }),
      call(8, 'life_narrative_editor', { output: pass }),
    ];
    const traces: Record<string, object[]> = {
      // Fidelity failed, the editor passed before the repair (combined or not).
      'fidelity-ch1': nine(
        'Correct the final package/prose discrepancy: x',
        bad,
        pass,
      ),
      'fidelity-ch2': nine(
        'Fix BOTH final checks in one full-package repair.\nFidelity: x\nEditor: y',
        bad,
        revise,
      ),
      // Editor failed on a package that passed fidelity: its read is the trigger.
      'editor-ch3': nine(
        "Correct the final package's literary issues:\nx",
        good,
        revise,
      ),
      // The plan review failed first: no fidelity, no editor before the repair.
      'review-ch4': [
        call(0, 'life_narrative_plan'),
        call(1, 'life_narrative_chapter'),
        call(2, 'life_narrative_plan_review'),
        call(3, 'life_narrative_chapter', {
          repairFeedback: {
            mode: 'author_package',
            message: 'Improve the final authored story: {}',
          },
        }),
        call(4, 'life_narrative_plan_review'),
        call(5, 'life_fidelity', { output: good }),
        call(6, 'life_narrative_editor', { output: pass }),
      ],
      // Fidelity failed with no editor read (already a v9-style trace): nothing to skip.
      'fidelity-ch5': nine(
        'Correct the final package/prose discrepancy: x',
        bad,
        pass,
      )
        .filter((a) => a.ordinal !== 4)
        .map((a, i) => ({ ...a, ordinal: i })),
      'clean-ch6': [
        call(0, 'life_narrative_plan'),
        call(1, 'life_narrative_chapter'),
        call(2, 'life_narrative_plan_review'),
        call(3, 'life_fidelity', { output: good }),
        call(4, 'life_narrative_editor', { output: pass }),
      ],
    };
    for (const [name, attempts] of Object.entries(traces))
      writeFileSync(
        join(root, 'diagnostic-attempts', `${name}.json`),
        JSON.stringify({ caseId: name, attempts }),
      );
    return root;
  }

  it('projects the pre-repair editor call a fidelity-first repair would not make (9 -> 8)', () => {
    const evidence = repairEvidence(ceilingRun());
    const byCase = Object.fromEntries(
      evidence.chapters.map((c) => [c.caseId, c]),
    );
    expect(byCase['fidelity-ch1']).toMatchObject({
      calls: 9,
      repairTrigger: 'fidelity',
      preRepairEditorCalls: 1,
      callsIfEditorSkipped: 8,
    });
    expect(byCase['fidelity-ch2']).toMatchObject({
      repairTrigger: 'fidelity',
      callsIfEditorSkipped: 8,
    });
    // The editor trigger (its own finding, fidelity passed) is never skipped.
    expect(byCase['editor-ch3']).toMatchObject({
      calls: 9,
      repairTrigger: 'editor',
      preRepairEditorCalls: 0,
      callsIfEditorSkipped: 9,
    });
    expect(byCase['review-ch4']).toMatchObject({
      calls: 7,
      repairTrigger: 'plan_review',
      callsIfEditorSkipped: 7,
    });
    // Already without a pre-repair editor: nothing more to remove.
    expect(byCase['fidelity-ch5']).toMatchObject({
      repairTrigger: 'fidelity',
      preRepairEditorCalls: 0,
    });
    expect(byCase['clean-ch6']).toMatchObject({
      repairTrigger: null,
      calls: 5,
    });
    expect(evidence.ceiling).toEqual({
      now: 3,
      ifAuthorPackage: 3,
      ifEditorSkipped: 1,
      editorSkipped: 2,
      cases: 6,
    });
    const markdown = repairEvidenceMarkdown([evidence]);
    expect(markdown).toContain(
      'Pre-repair editor skipped (v9 fidelity-first repair): 2 fidelity-triggered repairs go 9 -> 8 calls; cases at 9 calls then: 1/6 (now 3/6)',
    );
    expect(markdown).toContain(
      'fidelity-ch1: 9 calls, repair author_package (trigger fidelity), pre-repair editor skipped -> 8 calls',
    );
  });
});
