import { DomainError } from '@future-flow/core';

// A failed job stores only its error code, and one code (for example
// NARRATIVE_CONTEXT_INVALID) is thrown from many places. The evaluation report
// therefore keeps the validator's own message and the throwing frames, so the
// cause of a failed sample is readable without replaying it. Evaluation only:
// the production job record and API are untouched.
export type FailureDiagnostic = {
  code: string;
  message: string;
  frames: string[];
};

const MESSAGE_LIMIT = 400;
const FRAME_LIMIT = 5;

export function failureDiagnostic(error: unknown): FailureDiagnostic {
  const message =
    error instanceof Error ? error.message : String(error ?? 'unknown');
  const frames = (error instanceof Error ? (error.stack ?? '') : '')
    .split('\n')
    .filter((line) => line.trim().startsWith('at '))
    // Keep the repository frames, not the runtime or dependencies.
    .filter((line) => !line.includes('node_modules') && !line.includes('node:'))
    .slice(0, FRAME_LIMIT)
    .map((line) =>
      line
        .trim()
        .replace(
          /\(?(?:file:\/\/)?\/[^()]*?\/(apps|packages|scripts)\//,
          '($1/',
        )
        .slice(0, 200),
    );
  return {
    code: error instanceof DomainError ? error.code : 'JOB_FAILED',
    message: message.slice(0, MESSAGE_LIMIT),
    frames,
  };
}
