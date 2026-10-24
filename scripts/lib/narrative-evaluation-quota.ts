import { readFile } from 'node:fs/promises';
import { DomainError } from '@future-flow/core';
import type { OfflineMockResponder } from './narrative-evaluation-runner';

// Subscription quota guard for the local development transports (Codex CLI,
// Antigravity). Quota is read without any model call: Codex through its app
// server `account/rateLimits/read`, Antigravity through the built-in `/usage`
// command. A snapshot is logged before every chapter and again after a failed
// call. When the quota is gone the run halts with an explicit error; it never
// switches silently to another model.
export type QuotaEngine = 'codex' | 'agy';
export type QuotaWindowName = 'five-hour' | 'weekly';
export type QuotaWindow = {
  name: QuotaWindowName;
  remainingPercent: number;
  resetsAt: string | null;
};
export type QuotaSnapshot = {
  engine: QuotaEngine;
  at: string;
  windows: QuotaWindow[];
  // Set when the provider itself reports that usage is blocked.
  blockedReason: string | null;
};
export type QuotaMode = 'start' | 'boundary' | 'hard';
export type QuotaThresholds = Record<
  QuotaMode,
  Record<QuotaWindowName, number>
>;

// Minimum remaining percent per window. `start` gates a new multi-chapter
// series, `boundary` is checked before each further chapter, `hard` before and
// after every call (a window at 0% is spent).
export const CODEX_QUOTA_THRESHOLDS: QuotaThresholds = {
  start: { 'five-hour': 30, weekly: 20 },
  boundary: { 'five-hour': 10, weekly: 5 },
  hard: { 'five-hour': 1, weekly: 1 },
};
// Antigravity: the Gemini group's weekly window keeps a 20% reserve.
export const AGY_QUOTA_THRESHOLDS: QuotaThresholds = {
  start: { 'five-hour': 5, weekly: 20 },
  boundary: { 'five-hour': 5, weekly: 20 },
  hard: { 'five-hour': 1, weekly: 1 },
};

export type QuotaLogEntry = {
  at: string;
  engine: QuotaEngine;
  phase: QuotaMode | 'after-run' | 'after-failure';
  caseId: string | null;
  windows: QuotaWindow[];
  ok: boolean;
  reason: string | null;
};

export class QuotaHalt extends DomainError {
  constructor(
    readonly engine: QuotaEngine,
    readonly reason: string,
    readonly resumeAfter: string | null,
  ) {
    super(
      'EVAL_QUOTA_HALT',
      `${engine} quota stop: ${reason}${resumeAfter ? `; resume after ${resumeAfter}` : ''}. The run did not switch to another model.`,
    );
  }
}

export function quotaBlock(
  snapshot: QuotaSnapshot,
  thresholds: Record<QuotaWindowName, number>,
): { reason: string; resumeAfter: string | null } | null {
  if (snapshot.blockedReason)
    return {
      reason: snapshot.blockedReason,
      resumeAfter: blockedResumeAfter(snapshot.windows),
    };
  for (const name of ['five-hour', 'weekly'] as const) {
    const window = snapshot.windows.find((w) => w.name === name);
    // Fail closed when a window is missing or unreadable.
    if (!window || !Number.isFinite(window.remainingPercent))
      return { reason: `${name} quota window unavailable`, resumeAfter: null };
    if (window.remainingPercent < thresholds[name])
      return {
        reason: `${name} window has ${window.remainingPercent}% left (minimum ${thresholds[name]}%)`,
        resumeAfter: window.resetsAt,
      };
  }
  return null;
}

// When the provider blocks usage, the run can continue once every spent
// window has reset: the latest reset among the windows at 0%. A window that
// still has quota does not hold the run back, so the weekly reset is not
// reported while only the 5 hour window is spent. If no window is at 0%, the
// soonest reset is the first moment the state can change.
function blockedResumeAfter(windows: QuotaWindow[]) {
  const spent = windows.filter((w) => w.remainingPercent <= 0 && w.resetsAt);
  if (spent.length) return latest(spent.map((w) => w.resetsAt));
  const times = windows
    .map((w) => w.resetsAt)
    .filter((v): v is string => !!v)
    .sort();
  return times[0] ?? null;
}

function latest(values: (string | null)[]) {
  const times = values.filter((v): v is string => !!v).sort();
  return times.at(-1) ?? null;
}

export type QuotaSource = {
  engine: QuotaEngine;
  read: () => Promise<QuotaSnapshot>;
  thresholds: QuotaThresholds;
};

export class LocalQuotaGuard {
  readonly log: QuotaLogEntry[] = [];
  halted: QuotaHalt | null = null;
  private lastCase: string | null = null;
  private cached: { at: number; snapshot: QuotaSnapshot } | null = null;

  constructor(
    private readonly source: QuotaSource,
    private readonly options: {
      // A sticky guard stops the whole run once; a non-sticky one only reports.
      sticky: boolean;
      cacheMs?: number;
      now?: () => number;
    },
  ) {}

  private now() {
    return (this.options.now ?? Date.now)();
  }

  private async snapshot(fresh: boolean) {
    const cacheMs = this.options.cacheMs ?? 60000;
    if (!fresh && this.cached && this.now() - this.cached.at < cacheMs)
      return this.cached.snapshot;
    const snapshot = await this.source.read();
    this.cached = { at: this.now(), snapshot };
    return snapshot;
  }

  private record(
    phase: QuotaLogEntry['phase'],
    caseId: string | null,
    snapshot: QuotaSnapshot,
    block: ReturnType<typeof quotaBlock>,
  ) {
    this.log.push({
      at: snapshot.at,
      engine: this.source.engine,
      phase,
      caseId,
      windows: snapshot.windows,
      ok: !block,
      reason: block?.reason ?? null,
    });
  }

  // Run-level gate before any work: the quota reserve for a new series.
  async preflight() {
    const snapshot = await this.snapshot(true);
    const block = quotaBlock(snapshot, this.source.thresholds.start);
    this.record('start', null, snapshot, block);
    if (block) throw this.halt(block);
  }

  // Gate before a request. The first request of a new chapter (case) is a
  // chapter boundary and reads fresh; within a chapter only the hard limit
  // applies, so a chapter is never cut off by the soft reserve.
  async check(caseId: string): Promise<QuotaHalt | null> {
    if (this.halted && this.options.sticky) return this.halted;
    const boundary = caseId !== this.lastCase;
    const snapshot = await this.snapshot(boundary);
    const mode: QuotaMode = boundary ? 'boundary' : 'hard';
    const block = quotaBlock(snapshot, this.source.thresholds[mode]);
    if (boundary) this.record('boundary', caseId, snapshot, block);
    if (block) return this.halt(block);
    this.lastCase = caseId;
    return null;
  }

  async beforeCall(caseId: string) {
    const halt = await this.check(caseId);
    if (halt) throw halt;
  }

  // After a failed call, learn whether the quota ran out. Returns the halt (if
  // any) so the caller can raise it instead of the generic provider failure.
  async afterFailure(caseId: string): Promise<QuotaHalt | null> {
    const snapshot = await this.snapshot(true);
    const block = quotaBlock(snapshot, this.source.thresholds.hard);
    this.record('after-failure', caseId, snapshot, block);
    return block ? this.halt(block) : null;
  }

  async finish() {
    const snapshot = await this.snapshot(true).catch(() => null);
    if (!snapshot) return;
    const block = quotaBlock(snapshot, this.source.thresholds.hard);
    this.record('after-run', null, snapshot, block);
  }

  private halt(block: NonNullable<ReturnType<typeof quotaBlock>>) {
    const halt = new QuotaHalt(
      this.source.engine,
      block.reason,
      block.resumeAfter,
    );
    if (this.options.sticky) this.halted = halt;
    return halt;
  }
}

export function resetsAtFromUnix(seconds: number | null | undefined) {
  return typeof seconds === 'number' && Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString()
    : null;
}

// Wraps a responder with the quota gates. A failed call that coincides with a
// spent quota is reported as the quota stop, not as a provider failure.
export function quotaGuarded(
  guard: LocalQuotaGuard,
  inner: OfflineMockResponder,
): OfflineMockResponder {
  return async (context) => {
    await guard.beforeCall(context.caseId);
    try {
      return await inner(context);
    } catch (error) {
      const halt = await guard.afterFailure(context.caseId).catch(() => null);
      throw halt ?? error;
    }
  };
}

// A resumed run rewrites the marker file; the quota history of the earlier
// attempts stays in it.
export async function priorQuotaHistory(markerPath: string, key?: string) {
  try {
    const old = JSON.parse(await readFile(markerPath, 'utf8')) as {
      quota?: Record<string, unknown>;
    };
    const quota = key
      ? (old.quota?.[key] as Record<string, unknown>)
      : old.quota;
    if (!quota) return [];
    const { history, ...latest } = quota as { history?: unknown[] };
    return [...(history ?? []), latest];
  } catch {
    return [];
  }
}
