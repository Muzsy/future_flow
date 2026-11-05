// Allowlisted failure localisation of the explicit successor CLI.
//
// The CLI answers every refusal with one generic line, which cannot tell a refusal in the
// operator's own request building from one on the host. This builds a report from FIXED
// vocabularies only: a phase label, exception TYPE names, repository source locations of the
// reviewed helpers and numeric codes. It never copies a message, an argument, a value, a path
// outside the repository or any environment/secret content; every field read from the host's
// output is re-validated here and dropped when it does not match.

export const clientPhases = [
  'start',
  'git-bundle',
  'ci-readback',
  'receipts',
  'release-evidence',
  'access-readback',
  'ssh',
  'report',
];
export const serverPhases = [
  'start',
  'system',
  'candidate',
  'cleanup-probe',
  'archive-support',
  'freshness',
  'baseline',
  'window',
  'parent',
  'access',
  'foreign-proxy',
  'capabilities',
  'accounts',
  'restore',
  'transition',
  'prepare-checks',
  'prepare-baseline',
  'prepare-files',
  'prepare-images',
  'prepare-engine-freeze',
  'prepare-database',
  'prepare-build',
  'prepare-final',
  'unknown',
];
const modes = new Set([
  'inspect',
  'prepare',
  'apply',
  'recover',
  'archive-expired',
  'cleanup-probe',
]);
const errorTypes = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'AbortError',
  'TimeoutError',
]);
const programs = new Set([
  'docker',
  'git',
  'node',
  'openssl',
  'python3',
  'other',
]);
const version = 'alterward-successor-failure-1';

function clientFrames(error) {
  const frames = [];
  if (typeof error?.stack !== 'string') return frames;
  const stack = error.stack.slice(0, 16384);
  for (const match of stack.matchAll(
    /\/(scripts\/(?:lib\/)?[a-z0-9-]+\.(?:mjs|ts|mts)):(\d{1,5}):(\d{1,5})(?=[)\s]|$)/g,
  )) {
    const frame = {
      source: match[1],
      line: Number(match[2]),
      column: Number(match[3]),
    };
    if (
      frame.line > 0 &&
      frame.column > 0 &&
      !frames.some(
        (v) =>
          v.source === frame.source &&
          v.line === frame.line &&
          v.column === frame.column,
      )
    )
      frames.push(frame);
    if (frames.length === 8) break;
  }
  return frames;
}

// The host prints one JSON object whose `failure` member this validates field by field.
export function serverFailure(stdout, modules) {
  try {
    const sources = new Map(
      modules.map(([name, file]) => [name, 'scripts/ops/' + file]),
    );
    const raw = JSON.parse(String(stdout)).failure;
    if (!raw || raw.version !== version || !Array.isArray(raw.exceptions))
      return null;
    const exceptions = [];
    for (const item of raw.exceptions.slice(0, 8)) {
      if (!item || typeof item !== 'object') continue;
      const frames = [];
      for (const frame of Array.isArray(item.frames)
        ? item.frames.slice(-32)
        : []) {
        if (
          sources.has(frame?.module) &&
          Number.isInteger(frame.line) &&
          frame.line > 0 &&
          frame.line < 200000
        )
          frames.push({ source: sources.get(frame.module), line: frame.line });
      }
      const entry = {
        type:
          typeof item.type === 'string' &&
          /^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(item.type)
            ? item.type
            : 'Exception',
        frames,
      };
      if (programs.has(item.program)) entry.program = item.program;
      if (
        Number.isInteger(item.exitCode) &&
        item.exitCode >= -255 &&
        item.exitCode <= 255
      )
        entry.exitCode = item.exitCode;
      exceptions.push(entry);
    }
    return {
      phase: serverPhases.includes(raw.phase) ? raw.phase : 'unknown',
      exceptions,
    };
  } catch {
    return null;
  }
}

export function successorFailureReport({ mode, phase, error, server }) {
  const report = {
    version: 'alterward-successor-failure-report-1',
    mode: modes.has(mode) ? mode : null,
    phase: clientPhases.includes(phase) ? phase : 'start',
    errorType: errorTypes.has(error?.name) ? error.name : 'Error',
    frames: [],
    ssh: null,
    server: server ?? null,
  };
  try {
    report.frames = clientFrames(error);
    if (report.phase === 'ssh' || report.phase === 'report')
      report.ssh = {
        exitCode: Number.isInteger(error?.code) ? error.code : null,
        signal:
          typeof error?.signal === 'string' &&
          /^SIG[A-Z0-9]{2,10}$/.test(error.signal)
            ? error.signal
            : null,
        systemCode:
          typeof error?.code === 'string' &&
          /^[A-Z][A-Z0-9_]{2,40}$/.test(error.code)
            ? error.code
            : null,
        killed: error?.killed === true,
      };
  } catch {
    // The diagnostic must never replace the actual refusal.
  }
  return report;
}
