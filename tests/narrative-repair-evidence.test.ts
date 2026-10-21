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
      },
    ]);
    expect(evidence.ceiling).toEqual({ now: 0, ifAuthorPackage: 0, cases: 1 });
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
});
