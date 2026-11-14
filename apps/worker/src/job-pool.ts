import { serviceAccessEnforcementFromEnv } from '@future-flow/core';

// Bounded parallel job execution for the worker. Every job still goes through
// the unchanged claim -> heartbeat -> process -> fail sequence; this module only
// decides how many of them may run at the same time.

export const MAX_WORKER_CONCURRENCY = 20;
// Service profile default (owner-approved first step). `WORKER_CONCURRENCY`
// overrides it; outside the service profile the worker stays serial.
export const SERVICE_WORKER_CONCURRENCY = 6;

// A malformed value stops the worker at startup: it must never fall back to a
// different number of simultaneous paid generations unnoticed.
export function workerConcurrencyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.WORKER_CONCURRENCY;
  if (raw === undefined || raw === '')
    return serviceAccessEnforcementFromEnv(env)
      ? SERVICE_WORKER_CONCURRENCY
      : 1;
  const value = /^[1-9][0-9]?$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value > MAX_WORKER_CONCURRENCY)
    throw new Error(
      `WORKER_CONCURRENCY must be an integer from 1 to ${MAX_WORKER_CONCURRENCY}`,
    );
  return value;
}

// A non-numeric poll interval used to become a one millisecond hot loop.
export function workerPollMsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.WORKER_POLL_MS;
  if (raw === undefined || raw === '') return 2000;
  const value = /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value < 100 || value > 60000)
    throw new Error('WORKER_POLL_MS must be an integer from 100 to 60000');
  return value;
}

// One connection per running job plus headroom for claim, heartbeat and
// maintenance: serial stays at the historical five, six jobs use ten.
export function workerPoolDefault(concurrency: number): number {
  return Math.min(30, Math.max(5, concurrency + 4));
}

// Error text can carry hostnames or SQL; only a stable code or class name is
// ever written to the log.
export function logJobFailure(jobId: string) {
  console.error(JSON.stringify({ jobId, status: 'failed' }));
}

export function describeError(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(code))
    return code;
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(name)
    ? name
    : 'UnknownError';
}

export function isLeaseLost(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'JOB_LEASE_LOST';
}

// Tracks, per running job, when its lease was last extended. While any local
// job's lease is within one heartbeat of its expiry (or is known lost) the
// worker claims nothing: `claim()` also returns a `running` job whose lease
// expired, and it would hand this very process a second copy of a job it is
// still running (a second paid call; the old task is only fenced at its next
// request). Stopping new claims for that short window removes the overlap
// without changing the claim query; the job is picked up again once its old
// task has ended.
export type LeaseTicket = {
  ok(): void;
  lost(): void;
  end(): void;
  readonly leaseLost: boolean;
};
export function createLeaseGuard(
  leaseMs: number,
  now: () => number = Date.now,
) {
  const tickets = new Set<{ lastOk: number; lost: boolean }>();
  return {
    begin(): LeaseTicket {
      const state = { lastOk: now(), lost: false };
      tickets.add(state);
      return {
        ok: () => {
          state.lastOk = now();
        },
        lost: () => {
          state.lost = true;
        },
        end: () => {
          tickets.delete(state);
        },
        get leaseLost() {
          return state.lost;
        },
      };
    },
    // At risk after two missed heartbeats of three per lease.
    claimAllowed(): boolean {
      for (const state of tickets)
        if (state.lost || now() - state.lastOk > (leaseMs * 2) / 3)
          return false;
      return true;
    },
    atRisk(): number {
      let count = 0;
      for (const state of tickets)
        if (state.lost || now() - state.lastOk > (leaseMs * 2) / 3) count++;
      return count;
    },
  };
}

// Extends the lease every third of its length. Only a real `JOB_LEASE_LOST`
// marks the job lost; a transient database error is logged and the next beat
// retries (the guard above blocks new claims meanwhile).
export function startHeartbeat(
  ticket: LeaseTicket,
  beat: () => Promise<void>,
  leaseMs: number,
  onTransientError: (error: unknown) => void = () => {},
): () => void {
  const timer = setInterval(
    () => {
      void beat().then(
        () => ticket.ok(),
        (error) => {
          if (isLeaseLost(error)) ticket.lost();
          else onTransientError(error);
        },
      );
    },
    Math.floor(leaseMs / 3),
  );
  return () => clearInterval(timer);
}

export type JobPoolOptions<J> = {
  concurrency: number;
  pollMs: number;
  stopping: () => boolean;
  // Returns one claimed job or null. Calls are never concurrent.
  claim: () => Promise<J | null>;
  // Must settle its own failure handling; a throw is contained and reported.
  run: (job: J) => Promise<void>;
  // False pauses claiming (see createLeaseGuard); running jobs continue.
  claimAllowed?: () => boolean;
  // Cheap, non-blocking hook invoked once per loop turn (maintenance).
  tick?: () => void;
  onClaimError?: (error: unknown, consecutiveFailures: number) => void;
  onRunError?: (error: unknown) => void;
};

export async function runJobPool<J>(options: JobPoolOptions<J>): Promise<void> {
  if (
    !Number.isInteger(options.concurrency) ||
    options.concurrency < 1 ||
    options.concurrency > MAX_WORKER_CONCURRENCY
  )
    throw new Error('Invalid worker concurrency');
  const active = new Set<Promise<void>>();
  let claimFailures = 0;
  // One wake-up signal instead of a race over every running task per turn.
  let wake: (() => void) | undefined;
  let finishedSinceWait = false;
  const start = (job: J) => {
    const task: Promise<void> = (async () => options.run(job))()
      .catch((error) => options.onRunError?.(error))
      .finally(() => {
        active.delete(task);
        finishedSinceWait = true;
        wake?.();
      });
    active.add(task);
  };
  const waitForSlotOrPoll = async (ms: number) => {
    // A job that ended while the loop was busy claiming still counts.
    if (finishedSinceWait) {
      finishedSinceWait = false;
      return;
    }
    let timer: NodeJS.Timeout | undefined;
    await new Promise<void>((resolve) => {
      wake = resolve;
      timer = setTimeout(resolve, ms);
    });
    clearTimeout(timer);
    wake = undefined;
    finishedSinceWait = false;
  };
  while (!options.stopping()) {
    options.tick?.();
    if (
      active.size < options.concurrency &&
      (options.claimAllowed?.() ?? true)
    ) {
      let job: J | null;
      try {
        job = await options.claim();
        claimFailures = 0;
      } catch (error) {
        // A database blip must not kill the jobs that are already running.
        claimFailures++;
        options.onClaimError?.(error, claimFailures);
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(
              10000,
              options.pollMs * 2 ** Math.min(claimFailures - 1, 10),
            ),
          ),
        );
        continue;
      }
      if (job !== null) {
        start(job);
        // Free slot left: try the next waiting job without delay.
        if (active.size < options.concurrency) continue;
      }
    }
    await waitForSlotOrPoll(options.pollMs);
  }
  // Graceful stop: no new claims; running jobs finish or their leases expire.
  await Promise.allSettled([...active]);
}
