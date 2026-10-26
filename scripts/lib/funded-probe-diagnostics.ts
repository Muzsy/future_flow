const phases = new Set([
  'input',
  'database-config',
  'connect',
  'tls',
  'begin',
  'capabilities',
  'dispatch',
  'capture',
  'migrate',
  'successor-capture',
  'successor-apply',
  'successor-reconcile',
  'commit',
]);
const sources = new Set([
  'scripts/ops/funded-runtime-probe.ts',
  'scripts/lib/funded-runtime.ts',
  'scripts/lib/beta-successor.ts',
  'scripts/lib/beta-successor-operation.ts',
  'scripts/lib/personal-beta-admission-observation.mjs',
  'scripts/lib/privacy-security-catalog.ts',
  'scripts/lib/privacy-recovery-schema.ts',
]);
const sqlStates = new Set([
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08P01',
  '22P02',
  '23502',
  '23503',
  '23505',
  '23514',
  '25006',
  '25P02',
  '28000',
  '28P01',
  '40001',
  '40P01',
  '42501',
  '42601',
  '42703',
  '42P01',
  '53300',
  '53400',
  '54000',
  '55000',
  '55P03',
  '57014',
  '57P01',
  '57P02',
  '57P03',
  '58000',
  'XX000',
]);

// stderr is retained by the root operator in its private command-failure file.
// Never copy messages, SQL, parameters, connection options or a raw stack into it.
export function privateProbeFailure(error: unknown, phase: string) {
  const result = {
    version: 'alterward-funded-probe-failure-1',
    phase: phases.has(phase) ? phase : 'unknown',
    errorType: 'UnknownError',
    sqlState: null as string | null,
    frames: [] as { source: string; line: number; column: number }[],
  };
  try {
    let original = error;
    for (let i = 0; i < 3; i++) {
      if (!original || typeof original !== 'object') break;
      const cause = (original as { cause?: unknown }).cause;
      if (!cause || typeof cause !== 'object' || cause === original) break;
      original = cause;
    }
    if (!original || typeof original !== 'object') return result;
    const value = original as {
      name?: unknown;
      code?: unknown;
      stack?: unknown;
    };
    if (typeof value.code === 'string' && sqlStates.has(value.code))
      result.sqlState = value.code;
    if (
      typeof value.name === 'string' &&
      ['Error', 'TypeError', 'SyntaxError', 'RangeError', 'ZodError'].includes(
        value.name,
      )
    )
      result.errorType = value.name;
    else if (result.sqlState) result.errorType = 'DatabaseError';
    if (typeof value.stack !== 'string') return result;
    const frames = value.stack
      .slice(0, 16384)
      .split('\n')
      .filter((line) => /^\s+at\s/.test(line))
      .join('\n');
    for (const match of frames.matchAll(
      /\/app\/(scripts\/(?:ops|lib)\/[a-z0-9-]+\.(?:ts|mts|mjs)):(\d{1,5}):(\d{1,5})(?=[)\s]|$)/g,
    )) {
      if (!sources.has(match[1]!)) continue;
      const frame = {
        source: match[1]!,
        line: Number(match[2]),
        column: Number(match[3]),
      };
      if (
        frame.line > 0 &&
        frame.column > 0 &&
        !result.frames.some(
          (v) =>
            v.source === frame.source &&
            v.line === frame.line &&
            v.column === frame.column,
        )
      )
        result.frames.push(frame);
      if (result.frames.length === 6) break;
    }
  } catch {
    // Diagnostic accessors must not replace the actual failure.
  }
  return result;
}
