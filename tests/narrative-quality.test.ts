import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  evaluateNarrativeEditorialGate,
  validateNarrativeEditorialReport,
  validateNarrativeArtifact,
  hash,
} from '@future-flow/core';
import {
  narrativeArtifactFixture,
  narrativeEditorialFixture,
  narrativePlanFixture,
  longNarrativeChapterFixture,
} from './narrative-plan-fixtures';

describe('deterministic narrative quality approval', () => {
  it('refuses a self-consistent receipt when the actual editorial result fails', () => {
    const artifact = narrativeArtifactFixture();
    artifact.editorialReport.scores.sceneCraft = 2;
    artifact.editorialReport.verdict = 'pass';
    artifact.provenance.receiptRefs[3]!.outputHash = hash(
      artifact.editorialReport,
    );
    expect(() =>
      validateNarrativeArtifact(artifact, artifact.bindings),
    ).toThrow('editorial gate');
  });
  it('computes approval from scores rather than trusting the model verdict', () => {
    const report = narrativeEditorialFixture();
    expect(evaluateNarrativeEditorialGate(report).passed).toBe(true);
    report.scores.momentum = 3;
    report.verdict = 'pass';
    expect(evaluateNarrativeEditorialGate(report).passed).toBe(false);
    report.scores.momentum = 4;
    report.scores.character = 3;
    report.scores.personalization = 5;
    expect(evaluateNarrativeEditorialGate(report).passed).toBe(true);
  });
  it('rejects a major issue even with high scores and valid body references', () => {
    const f = narrativePlanFixture(),
      report = narrativeEditorialFixture();
    report.issues = [
      {
        dimension: 'momentum',
        severity: 'major',
        repairScope: 'prose',
        paragraphIndex: 1,
        eventIds: [f.canon.events[0]!.id],
        explanation:
          'The attempt repeats an earlier plan without a visible development.',
        suggestedFix:
          'Use the canonical observation as the turning point of the scene.',
      },
    ];
    expect(
      validateNarrativeEditorialReport(
        report,
        longNarrativeChapterFixture(f),
        f.canon,
      ),
    ).toEqual(report);
    expect(evaluateNarrativeEditorialGate(report).passed).toBe(false);
    report.issues[0]!.severity = 'minor';
    report.issues[0]!.repairScope = 'canon';
    expect(evaluateNarrativeEditorialGate(report).passed).toBe(false);
    report.issues[0]!.repairScope = 'prose';
    expect(evaluateNarrativeEditorialGate(report).passed).toBe(true);
    report.issues[0]!.paragraphIndex = 2;
    expect(() =>
      validateNarrativeEditorialReport(
        report,
        longNarrativeChapterFixture(f),
        f.canon,
      ),
    ).toThrow('beyond the chapter');
    report.issues[0]!.paragraphIndex = 1;
    report.issues[0]!.eventIds = [randomUUID()];
    expect(() =>
      validateNarrativeEditorialReport(
        report,
        longNarrativeChapterFixture(f),
        f.canon,
      ),
    ).toThrow('editorial event');
  });
  it('accepts only the bound artifact and receipts of the final validated result', () => {
    const artifact = narrativeArtifactFixture();
    expect(validateNarrativeArtifact(artifact, artifact.bindings)).toEqual(
      artifact,
    );
    const changed = structuredClone(artifact);
    changed.provenance.receiptRefs[3]!.outputHash = '0'.repeat(64);
    expect(() => validateNarrativeArtifact(changed, artifact.bindings)).toThrow(
      'final validated result',
    );
    const policy = structuredClone(artifact);
    policy.bindings.memoryHash = '0'.repeat(64);
    expect(() => validateNarrativeArtifact(policy, artifact.bindings)).toThrow(
      'binding differs',
    );
  });
  it('does not accept a duplicated delta, missing receipt or fake editor pass', () => {
    const original = narrativeArtifactFixture(),
      delta = structuredClone(original);
    delta.validatedMemoryDelta.periodSummary =
      'A different summary falsely substituted for the independently checked plan and its recorded consequences.';
    expect(() => validateNarrativeArtifact(delta, original.bindings)).toThrow(
      'inconsistent data',
    );
    const missing = structuredClone(original);
    missing.provenance.receiptRefs[3]!.task = 'life_fidelity';
    expect(() => validateNarrativeArtifact(missing, original.bindings)).toThrow(
      'required receipt',
    );
  });
});
