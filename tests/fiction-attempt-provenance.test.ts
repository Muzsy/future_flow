import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const OpenAI = createRequire(import.meta.url)('openai')
  .default as typeof import('openai').default;
import { DomainError, hash } from '@future-flow/core';
import { narrativeDimensions } from '@future-flow/contracts';
import { parseEvaluationOptions } from '../scripts/lib/narrative-evaluation-options';
import { runNarrativeEvaluation } from '../scripts/lib/narrative-evaluation-runner';
import {
  assertNoSecretsInTrace,
  attemptTraceDir,
  attemptTracePath,
  computeAttemptTraceHash,
  readAttemptTrace,
  safeAttemptCaseFileName,
  sampleCaseId,
  verifyAttemptTrace,
  type EvaluationAttemptTrace,
} from '../scripts/lib/narrative-evaluation-attempts';

function tempOutDir(prefix: string): string {
  return join(mkdtempSync(join(tmpdir(), prefix)), 'out');
}

function makeScores(overrides: Partial<Record<string, number>> = {}) {
  return Object.fromEntries(
    narrativeDimensions.map((dim) => [dim, overrides[dim] ?? 4]),
  );
}

describe('synthetic local evaluation attempt provenance (P09-P14, P16-P17)', () => {
  it('P09: captures 8-call editor -> prose_only repair provenance with initial and repaired outputs', async () => {
    const out = tempOutDir('alterward-p09-');
    try {
      const initialMarker =
        'Initial unpolished sentence that will be replaced during prose-only repair.';
      const repairedMarker =
        'Repaired tactile sentence that replaces the initial draft while keeping canon unchanged.';

      const options = parseEvaluationOptions([
        '--mode',
        'offline',
        '--creative-only',
        '--fixtures',
        'creative-portfolio',
        '--periods',
        '1',
        '--out',
        out,
      ]);

      let initialAuthoredPackage: Record<string, unknown> | null = null;
      const run = await runNarrativeEvaluation(
        options,
        {},
        ({ task, ordinal, defaultOutput }) => {
          const base = JSON.parse(JSON.stringify(defaultOutput()));
          if (task === 'life_narrative_chapter' && ordinal === 1) {
            initialAuthoredPackage = JSON.parse(JSON.stringify(base));
            base.chapter.body = `${base.chapter.body} ${initialMarker}`;
            return base;
          }
          if (task === 'life_narrative_editor' && ordinal === 4) {
            return {
              ...base,
              scores: makeScores({ prose: 3 }),
              verdict: 'revise',
              issues: [
                {
                  dimension: 'prose',
                  severity: 'major',
                  repairScope: 'prose',
                  paragraphIndex: 1,
                  eventIds: [],
                  explanation:
                    'The closing paragraph leans on a tidy summary sentence instead of a physical action.',
                  suggestedFix:
                    'Replace the abstract closing reflection with a concrete physical gesture in the room.',
                },
              ],
            };
          }
          if (task === 'life_narrative_chapter' && ordinal === 5) {
            const repaired = JSON.parse(
              JSON.stringify(initialAuthoredPackage ?? base),
            );
            repaired.chapter.body = `${repaired.chapter.body} ${repairedMarker}`;
            return repaired;
          }
          return base;
        },
      );

      expect(run.failures).toEqual([]);
      expect(run.samples).toHaveLength(1);
      const sample = run.samples[0]!;
      expect(sample.repairUsed).toBe(true);
      expect(sample.requestCount).toBe(8);
      expect(sample.transportCalls).toBe(8);
      expect(sample.receipts).toHaveLength(8);
      expect(sample.chapter.body).toContain(repairedMarker);
      expect(sample.chapter.body).not.toContain(initialMarker);

      const traceFile = attemptTracePath(
        out,
        'creative-portfolio:narrative-v1:0',
      );
      const trace = JSON.parse(
        readFileSync(traceFile, 'utf8'),
      ) as EvaluationAttemptTrace;

      expect(trace.caseId).toBe('creative-portfolio:narrative-v1:0');
      expect(trace.sourceHash).toBe(run.sourceHash);
      expect(trace.sourceCommit).toBe(run.sourceCommit);
      expect(trace.attempts).toHaveLength(8);
      expect(trace.attempts.map((a) => a.ordinal)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7,
      ]);
      expect(trace.attempts.map((a) => a.task)).toEqual([
        'life_narrative_plan',
        'life_narrative_chapter',
        'life_narrative_plan_review',
        'life_fidelity',
        'life_narrative_editor',
        'life_narrative_chapter',
        'life_fidelity',
        'life_narrative_editor',
      ]);

      const initialAuthor = trace.attempts[1]!;
      expect(initialAuthor.repairFeedback).toBeNull();
      expect(
        (initialAuthor.output as { chapter: { body: string } }).chapter.body,
      ).toContain(initialMarker);

      const initialEditor = trace.attempts[4]!;
      expect(initialEditor.repairFeedback).toBeNull();
      const initialEditorOutput = initialEditor.output as {
        scores: Record<string, number>;
        issues: { repairScope: string; dimension: string }[];
        sequenceReview: Record<string, unknown>;
        sequenceSignature: Record<string, unknown>;
      };
      expect(initialEditorOutput.scores.prose).toBe(3);
      expect(initialEditorOutput.issues[0]?.repairScope).toBe('prose');
      expect(initialEditorOutput.sequenceReview).toBeDefined();
      expect(initialEditorOutput.sequenceSignature).toBeDefined();

      const repairedAuthor = trace.attempts[5]!;
      expect(repairedAuthor.repairFeedback).toEqual({
        mode: 'prose_only',
        message: expect.stringContaining('Rewrite the weak story'),
      });
      expect(
        (repairedAuthor.output as { chapter: { body: string } }).chapter.body,
      ).toContain(repairedMarker);

      const finalEditor = trace.attempts[7]!;
      expect((finalEditor.output as { issues: unknown[] }).issues).toHaveLength(
        0,
      );

      for (let i = 0; i < 8; i++) {
        const attempt = trace.attempts[i]!;
        const receipt = sample.receipts[i]!;
        expect(attempt.outputHash).toBe(hash(attempt.output));
        expect(attempt.outputHash).toBe(receipt.outputHash);
        expect(attempt.inputHash).toBe(receipt.inputHash);
        expect(attempt.model).toBe(receipt.model);
        expect(attempt.usage).toEqual({
          inputTokens: receipt.inputTokens,
          outputTokens: receipt.outputTokens,
          cachedInputTokens: receipt.cachedInputTokens ?? 0,
        });
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it('P10: captures 8-call fidelity -> author_package repair provenance with initial fidelity issues', async () => {
    const out = tempOutDir('alterward-p10-');
    try {
      const options = parseEvaluationOptions([
        '--mode',
        'offline',
        '--creative-only',
        '--fixtures',
        'creative-portfolio',
        '--periods',
        '1',
        '--out',
        out,
      ]);

      const run = await runNarrativeEvaluation(
        options,
        {},
        ({ task, ordinal, defaultOutput }) => {
          const base = JSON.parse(JSON.stringify(defaultOutput()));
          if (task === 'life_fidelity' && ordinal === 3) {
            return {
              valid: false,
              issues: [
                {
                  chapterNo: 1,
                  reason:
                    'Scene two states an unrecorded salaried position absent from canonical events.',
                },
              ],
            };
          }
          return base;
        },
      );

      expect(run.failures).toEqual([]);
      expect(run.samples).toHaveLength(1);
      const sample = run.samples[0]!;
      expect(sample.repairUsed).toBe(true);
      expect(sample.requestCount).toBe(8);
      expect(sample.transportCalls).toBe(8);

      const trace = JSON.parse(
        readFileSync(
          attemptTracePath(out, 'creative-portfolio:narrative-v1:0'),
          'utf8',
        ),
      ) as EvaluationAttemptTrace;

      expect(trace.attempts).toHaveLength(8);
      expect(trace.attempts.map((a) => a.task)).toEqual([
        'life_narrative_plan',
        'life_narrative_chapter',
        'life_narrative_plan_review',
        'life_fidelity',
        'life_narrative_chapter',
        'life_narrative_plan_review',
        'life_fidelity',
        'life_narrative_editor',
      ]);

      const failedFidelity = trace.attempts[3]!;
      expect(failedFidelity.output).toEqual({
        valid: false,
        issues: [
          {
            chapterNo: 1,
            reason:
              'Scene two states an unrecorded salaried position absent from canonical events.',
          },
        ],
      });

      const repairedAuthor = trace.attempts[4]!;
      expect(repairedAuthor.repairFeedback).toEqual({
        mode: 'author_package',
        message: expect.stringContaining(
          'Scene two states an unrecorded salaried position absent from canonical events.',
        ),
      });

      const secondFidelity = trace.attempts[6]!;
      expect(secondFidelity.output).toEqual({ valid: true, issues: [] });
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it('P11: captures max-9 structural repair path and blocks a 10th request with NARRATIVE_REQUEST_LIMIT', async () => {
    const out9 = tempOutDir('alterward-p11-max9-');
    const out10 = tempOutDir('alterward-p11-limit10-');
    try {
      const options9 = parseEvaluationOptions([
        '--mode',
        'offline',
        '--creative-only',
        '--fixtures',
        'creative-portfolio',
        '--periods',
        '1',
        '--out',
        out9,
      ]);

      const run9 = await runNarrativeEvaluation(
        options9,
        {},
        ({ task, ordinal, defaultOutput }) => {
          const base = JSON.parse(JSON.stringify(defaultOutput()));
          if (task === 'life_narrative_editor' && ordinal === 4) {
            return {
              ...base,
              scores: makeScores({ momentum: 3 }),
              verdict: 'revise',
              sequenceReview: {
                ...base.sequenceReview,
                independentProgression: false,
              },
              issues: [
                {
                  dimension: 'momentum',
                  severity: 'major',
                  repairScope: 'canon',
                  paragraphIndex: 1,
                  eventIds: [],
                  explanation:
                    'Progression relies on another unsolicited external invitation instead of protagonist action.',
                  suggestedFix:
                    'Drive the turning point from a protagonist experiment or material complication rather than an invitation.',
                },
              ],
            };
          }
          return base;
        },
      );

      expect(run9.failures).toEqual([]);
      expect(run9.samples).toHaveLength(1);
      expect(run9.samples[0]!.requestCount).toBe(9);
      expect(run9.samples[0]!.transportCalls).toBe(9);

      const trace9 = JSON.parse(
        readFileSync(
          attemptTracePath(out9, 'creative-portfolio:narrative-v1:0'),
          'utf8',
        ),
      ) as EvaluationAttemptTrace;
      expect(trace9.attempts).toHaveLength(9);
      expect(trace9.attempts.map((a) => a.ordinal)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8,
      ]);
      expect(trace9.attempts.map((a) => a.task)).toEqual([
        'life_narrative_plan',
        'life_narrative_chapter',
        'life_narrative_plan_review',
        'life_fidelity',
        'life_narrative_editor',
        'life_narrative_chapter',
        'life_narrative_plan_review',
        'life_fidelity',
        'life_narrative_editor',
      ]);
      expect(trace9.attempts[5]!.repairFeedback).toEqual({
        mode: 'author_package',
        message: expect.stringContaining('Rewrite the weak story'),
      });

      const options10 = parseEvaluationOptions([
        '--mode',
        'offline',
        '--creative-only',
        '--fixtures',
        'creative-portfolio',
        '--periods',
        '1',
        '--out',
        out10,
      ]);
      const run10 = await runNarrativeEvaluation(
        options10,
        {},
        ({ task, ordinal, defaultOutput }) => {
          const base = JSON.parse(JSON.stringify(defaultOutput()));
          if (task === 'life_narrative_plan' && ordinal === 0) {
            throw new OpenAI.APIConnectionError({
              message: 'Simulated transient connection reset',
            });
          }
          if (task === 'life_narrative_editor' && ordinal === 5) {
            return {
              ...base,
              scores: makeScores({ momentum: 3 }),
              verdict: 'revise',
              sequenceReview: {
                ...base.sequenceReview,
                independentProgression: false,
              },
              issues: [
                {
                  dimension: 'momentum',
                  severity: 'major',
                  repairScope: 'canon',
                  paragraphIndex: 1,
                  eventIds: [],
                  explanation:
                    'Progression repeats an external invitation across consecutive periods.',
                  suggestedFix:
                    'Replace the external invitation with a direct consequence of an earlier protagonist choice.',
                },
              ],
            };
          }
          return base;
        },
      );
      expect(run10.samples).toHaveLength(0);
      expect(run10.failures).toHaveLength(1);
      expect(run10.failures[0]!.code).toBe('NARRATIVE_REQUEST_LIMIT');

      const trace10 = JSON.parse(
        readFileSync(
          attemptTracePath(out10, 'creative-portfolio:narrative-v1:0'),
          'utf8',
        ),
      ) as EvaluationAttemptTrace;
      expect(trace10.attempts).toHaveLength(9);
      expect(trace10.attempts.map((a) => a.ordinal)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8,
      ]);
      expect(trace10.attempts[0]!.status).toBe('failed');
    } finally {
      rmSync(out9, { recursive: true, force: true });
      rmSync(out10, { recursive: true, force: true });
    }
  });

  it('P12: resumes without duplicate ordinals and fails closed on modified, truncated, or mismatched trace', async () => {
    const out = tempOutDir('alterward-p12-');
    try {
      const options = parseEvaluationOptions([
        '--mode',
        'offline',
        '--creative-only',
        '--fixtures',
        'creative-portfolio',
        '--periods',
        '2',
        '--out',
        out,
      ]);

      // Run 1: period 0 completes (5 calls), period 1 fails at call 2 (life_narrative_plan_review)
      let failPeriod1Once = true;
      const run1 = await runNarrativeEvaluation(
        options,
        {},
        ({ caseId, task }) => {
          if (
            failPeriod1Once &&
            caseId === 'creative-portfolio:narrative-v1:1' &&
            task === 'life_narrative_plan_review'
          ) {
            failPeriod1Once = false;
            throw new DomainError(
              'AI_PROVIDER_FAILED',
              'Simulated transient upstream failure on period 1 review.',
              503,
            );
          }
          return undefined;
        },
      );

      expect(run1.samples).toHaveLength(1);
      expect(run1.failures).toHaveLength(1);
      expect(run1.failures[0]!.caseId).toBe(
        'creative-portfolio:narrative-v1:1',
      );

      const trace0AfterRun1 = JSON.parse(
        readFileSync(
          attemptTracePath(out, 'creative-portfolio:narrative-v1:0'),
          'utf8',
        ),
      ) as EvaluationAttemptTrace;
      expect(trace0AfterRun1.attempts.map((a) => a.ordinal)).toEqual([
        0, 1, 2, 3, 4,
      ]);

      const trace1AfterRun1 = JSON.parse(
        readFileSync(
          attemptTracePath(out, 'creative-portfolio:narrative-v1:1'),
          'utf8',
        ),
      ) as EvaluationAttemptTrace;
      expect(trace1AfterRun1.attempts.map((a) => a.ordinal)).toEqual([0, 1, 2]);
      expect(trace1AfterRun1.attempts[2]!.status).toBe('failed');
      expect(trace1AfterRun1.attempts[2]!.errorCode).toBe('AI_PROVIDER_FAILED');

      // Resume Run 2: period 0 is untouched (ordinals 0..4), period 1 resumes from checkpoint (ordinals 0..5, no duplicates!)
      const resumeOptions = parseEvaluationOptions([
        '--mode',
        'offline',
        '--creative-only',
        '--fixtures',
        'creative-portfolio',
        '--periods',
        '2',
        '--out',
        out,
      ]);
      const run2 = await runNarrativeEvaluation(resumeOptions, {});
      expect(run2.failures).toEqual([]);
      expect(run2.samples).toHaveLength(2);

      const trace0AfterRun2 = JSON.parse(
        readFileSync(
          attemptTracePath(out, 'creative-portfolio:narrative-v1:0'),
          'utf8',
        ),
      ) as EvaluationAttemptTrace;
      expect(trace0AfterRun2.attempts.map((a) => a.ordinal)).toEqual([
        0, 1, 2, 3, 4,
      ]);

      const trace1AfterRun2 = JSON.parse(
        readFileSync(
          attemptTracePath(out, 'creative-portfolio:narrative-v1:1'),
          'utf8',
        ),
      ) as EvaluationAttemptTrace;
      expect(trace1AfterRun2.attempts.map((a) => a.ordinal)).toEqual([
        0, 1, 2, 3, 4, 5,
      ]);
      expect(new Set(trace1AfterRun2.attempts.map((a) => a.ordinal)).size).toBe(
        trace1AfterRun2.attempts.length,
      );

      const trace0Path = attemptTracePath(
        out,
        'creative-portfolio:narrative-v1:0',
      );
      const originalBytes = readFileSync(trace0Path, 'utf8');

      // 1. Tamper with sourceHash
      const tamperedSource = JSON.parse(
        originalBytes,
      ) as EvaluationAttemptTrace;
      tamperedSource.sourceHash = '0'.repeat(64);
      tamperedSource.traceHash = computeAttemptTraceHash(tamperedSource);
      writeFileSync(trace0Path, JSON.stringify(tamperedSource, null, 2), {
        mode: 0o600,
      });
      await expect(runNarrativeEvaluation(resumeOptions, {})).rejects.toThrow(
        /binding differs/i,
      );

      // 2. Tamper with attempt output without updating outputHash
      const tamperedOutput = JSON.parse(
        originalBytes,
      ) as EvaluationAttemptTrace;
      (
        tamperedOutput.attempts[1]!.output as { chapter: { title: string } }
      ).chapter.title = 'Tampered Title';
      tamperedOutput.traceHash = computeAttemptTraceHash(tamperedOutput);
      writeFileSync(trace0Path, JSON.stringify(tamperedOutput, null, 2), {
        mode: 0o600,
      });
      await expect(runNarrativeEvaluation(resumeOptions, {})).rejects.toThrow(
        /outputHash does not match/i,
      );

      // 3. Truncate an attempt and recompute traceHash
      const truncated = JSON.parse(originalBytes) as EvaluationAttemptTrace;
      truncated.attempts = truncated.attempts.slice(0, 4);
      truncated.traceHash = computeAttemptTraceHash(truncated);
      writeFileSync(trace0Path, JSON.stringify(truncated, null, 2), {
        mode: 0o600,
      });
      await expect(runNarrativeEvaluation(resumeOptions, {})).rejects.toThrow(
        /differs from transport records|does not match recorded receipts/i,
      );

      // 4. Delete trace file while transport/sample evidence exists
      unlinkSync(trace0Path);
      await expect(runNarrativeEvaluation(resumeOptions, {})).rejects.toThrow(
        /Missing diagnostic attempt trace/i,
      );

      // Restore valid trace and confirm resume succeeds again
      writeFileSync(trace0Path, originalBytes, { mode: 0o600 });
      chmodSync(trace0Path, 0o600);
      const run3 = await runNarrativeEvaluation(resumeOptions, {});
      expect(run3.samples).toHaveLength(2);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it('P13: enforces 0600 permissions, rejects symlinks and path escapes, and excludes API keys/auth headers', async () => {
    const out = tempOutDir('alterward-p13-');
    try {
      // Path escape rejection
      expect(() => safeAttemptCaseFileName('../escape')).toThrow(DomainError);
      expect(() => safeAttemptCaseFileName('nested/escape')).toThrow(
        DomainError,
      );
      expect(() => safeAttemptCaseFileName('bad\\escape')).toThrow(DomainError);
      expect(() => attemptTracePath(out, '../escape')).toThrow(DomainError);

      const secretApiKey = 'sk-proj-SecretTestKey9876543210abcdef';
      const options = parseEvaluationOptions([
        '--mode',
        'offline',
        '--creative-only',
        '--fixtures',
        'creative-portfolio',
        '--periods',
        '1',
        '--out',
        out,
      ]);

      // Simulate a failed call whose error object carries raw headers and API key
      let threwOnce = false;
      const run = await runNarrativeEvaluation(
        options,
        {
          NARRATIVE_EVAL_API_KEY: secretApiKey,
          OPENAI_API_KEY: secretApiKey,
        },
        ({ task }) => {
          if (!threwOnce && task === 'life_narrative_editor') {
            threwOnce = true;
            const sdkError = Object.assign(
              new Error(
                `Upstream failure with Authorization: Bearer ${secretApiKey}`,
              ),
              {
                status: 503,
                request_id: 'req_test_safe_123',
                headers: {
                  authorization: `Bearer ${secretApiKey}`,
                  'x-api-key': secretApiKey,
                },
              },
            );
            throw sdkError;
          }
          return undefined;
        },
      );

      expect(run.failures).toHaveLength(1);
      const tracePath = attemptTracePath(
        out,
        'creative-portfolio:narrative-v1:0',
      );
      const stat = lstatSync(tracePath);
      expect(stat.isSymbolicLink()).toBe(false);
      expect(stat.mode & 0o777).toBe(0o600);
      expect(lstatSync(attemptTraceDir(out)).mode & 0o777).toBe(0o700);

      const rawTraceText = readFileSync(tracePath, 'utf8');
      expect(rawTraceText).not.toContain(secretApiKey);
      expect(rawTraceText).not.toMatch(/sk-proj-/i);
      expect(rawTraceText).not.toMatch(/Bearer\s+sk-/i);
      expect(rawTraceText).not.toMatch(/authorization/i);

      const parsedTrace = JSON.parse(rawTraceText) as EvaluationAttemptTrace;
      const failedAttempt = parsedTrace.attempts.at(-1)!;
      expect(failedAttempt.status).toBe('failed');
      expect(failedAttempt.errorCode).toBe('AI_HTTP_503');
      expect(failedAttempt.output).toBeNull();
      expect(failedAttempt.outputHash).toBeNull();
      expect(failedAttempt.requestId).toBe('req_test_safe_123');

      // Secret guard blocks traces containing secret material
      const poisoned = JSON.parse(rawTraceText) as EvaluationAttemptTrace;
      poisoned.attempts[0]!.repairFeedback = {
        message: `Leaked key ${secretApiKey}`,
      };
      expect(() =>
        assertNoSecretsInTrace(poisoned, {
          NARRATIVE_EVAL_API_KEY: secretApiKey,
        }),
      ).toThrow(/Forbidden secret/i);

      // Permission loosening (0644) fails closed
      chmodSync(tracePath, 0o644);
      const resumeOptions = parseEvaluationOptions([
        '--mode',
        'offline',
        '--creative-only',
        '--fixtures',
        'creative-portfolio',
        '--periods',
        '1',
        '--out',
        out,
      ]);
      await expect(runNarrativeEvaluation(resumeOptions, {})).rejects.toThrow(
        /0600 permissions/i,
      );
      chmodSync(tracePath, 0o600);

      // Symlinked trace file fails closed
      const backupPath = join(out, 'backup-trace.json');
      writeFileSync(backupPath, rawTraceText, { mode: 0o600 });
      unlinkSync(tracePath);
      symlinkSync(backupPath, tracePath);
      await expect(runNarrativeEvaluation(resumeOptions, {})).rejects.toThrow(
        /non-symlink/i,
      );
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it('P14: keeps human-review bundles strictly accepted-only and excludes rejected attempts and repair feedback', async () => {
    const out = tempOutDir('alterward-p14-');
    try {
      const rejectedProseMarker = 'REJECTED_FIRST_ATTEMPT_PROSE_MARKER_991';
      const repairDiagnosticMarker = 'INTERNAL_EDITORIAL_REPAIR_EVIDENCE_882';
      const acceptedProseMarker = 'ACCEPTED_FINAL_PROSE_MARKER_773';

      const options = parseEvaluationOptions([
        '--mode',
        'offline',
        '--creative-only',
        '--fixtures',
        'creative-portfolio',
        '--periods',
        '6',
        '--out',
        out,
      ]);

      let initialAuthoredPackage: Record<string, any> | undefined;
      const run = await runNarrativeEvaluation(
        options,
        {},
        ({ caseId, task, ordinal, defaultOutput }) => {
          const base = JSON.parse(JSON.stringify(defaultOutput()));
          if (caseId === 'creative-portfolio:narrative-v1:0') {
            if (task === 'life_narrative_chapter' && ordinal === 1) {
              initialAuthoredPackage = JSON.parse(JSON.stringify(base));
              base.chapter.body = `${base.chapter.body} ${rejectedProseMarker}`;
              return base;
            }
            if (task === 'life_narrative_editor' && ordinal === 4) {
              return {
                ...base,
                scores: makeScores({ prose: 3 }),
                verdict: 'revise',
                issues: [
                  {
                    dimension: 'prose',
                    severity: 'major',
                    repairScope: 'prose',
                    paragraphIndex: 1,
                    eventIds: [],
                    explanation: `Replace the opening summary sentence (${repairDiagnosticMarker}).`,
                    suggestedFix:
                      'Start with the physical workspace detail rather than summarizing the theme.',
                  },
                ],
              };
            }
            if (task === 'life_narrative_chapter' && ordinal === 5) {
              const repaired = JSON.parse(
                JSON.stringify(initialAuthoredPackage ?? base),
              );
              repaired.chapter.body = `${repaired.chapter.body} ${acceptedProseMarker}`;
              return repaired;
            }
          }
          return base;
        },
      );

      expect(run.sequenceBundleFiles).toBeTruthy();
      const traceText = readFileSync(
        attemptTracePath(out, 'creative-portfolio:narrative-v1:0'),
        'utf8',
      );
      expect(traceText).toContain(rejectedProseMarker);
      expect(traceText).toContain(repairDiagnosticMarker);
      expect(traceText).toContain(acceptedProseMarker);

      const files = run.sequenceBundleFiles!;
      const humanFiles = [
        files.bundlesJson,
        files.ratingsTemplateJson,
        files.indexHtml,
        ...files.pages,
      ];
      const combinedHumanText = humanFiles
        .map((file) => readFileSync(file, 'utf8'))
        .join('\n');

      expect(combinedHumanText).toContain(acceptedProseMarker);
      expect(combinedHumanText).not.toContain(rejectedProseMarker);
      expect(combinedHumanText).not.toContain(repairDiagnosticMarker);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it('P16 & P17: generates 14 offline samples (2x6 main + 2 forks) for creative-portfolio,career-transition with complete attempt traces', async () => {
    const out = tempOutDir('alterward-p16-p17-');
    try {
      const options = parseEvaluationOptions([
        '--mode',
        'offline',
        '--creative-only',
        '--fixtures',
        'creative-portfolio,career-transition',
        '--periods',
        '6',
        '--out',
        out,
      ]);

      const run = await runNarrativeEvaluation(options, {});
      expect(run.failures).toEqual([]);
      expect(run.samples).toHaveLength(14);

      const fullSamples = run.samples.filter((s) => s.kind === 'full');
      const forkSamples = run.samples.filter((s) => s.kind === 'fork');
      expect(fullSamples).toHaveLength(12);
      expect(forkSamples).toHaveLength(2);
      expect(forkSamples.map((s) => s.fixtureId)).toEqual([
        'creative-portfolio',
        'career-transition',
      ]);
      for (const forkSample of forkSamples) {
        expect(forkSample.periodIndex).toBe(2);
        expect(forkSample.prefix).toHaveLength(2);
      }

      expect(run.sequenceBundles).toHaveLength(4);
      expect(
        run.sequenceBundles?.filter((b) => b.kind === 'main'),
      ).toHaveLength(2);
      expect(
        run.sequenceBundles?.filter((b) => b.kind === 'branch'),
      ).toHaveLength(2);

      const traceFiles = readdirSync(attemptTraceDir(out)).sort();
      expect(traceFiles).toHaveLength(14);

      for (const sample of run.samples) {
        const caseId = sampleCaseId(sample);
        const trace = readAttemptTrace(out, {
          caseId,
          sourceCommit: run.sourceCommit,
          sourceHash: run.sourceHash,
          manifestBinding: JSON.parse(
            readFileSync(join(out, 'manifest.json'), 'utf8'),
          ).binding,
          mock: true,
          models: run.models,
          projectHash: null,
        });
        expect(trace).not.toBeNull();
        expect(trace!.attempts).toHaveLength(5);
        expect(trace!.attempts.map((a) => a.ordinal)).toEqual([0, 1, 2, 3, 4]);
        expect(
          verifyAttemptTrace(trace, {
            caseId,
            sourceCommit: run.sourceCommit,
            sourceHash: run.sourceHash,
            manifestBinding: JSON.parse(
              readFileSync(join(out, 'manifest.json'), 'utf8'),
            ).binding,
            mock: true,
            models: run.models,
            projectHash: null,
          }),
        ).toEqual(trace);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
