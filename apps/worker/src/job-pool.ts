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

// One connection per running job plus headroom for claim, heartbeat and
// maintenance: serial stays at the historical five, six jobs use ten.
export function workerPoolDefault(concurrency: number): number {
  return Math.min(30, Math.max(5, concurrency + 4));
}

export type JobPoolOptions<J> = {
  concurrency: number;
  pollMs: number;
  stopping: () => boolean;
  // Returns one claimed job or null. Calls are never concurrent.
  claim: () => Promise<J | null>;
  // Must settle its own failure handling; a throw is contained and reported.
  run: (job: J) => Promise<void>;
  // Cheap, non-blocking hook invoked once per loop turn (maintenance).
  tick?: () => void;
  onClaimError?: (error: unknown) => void;
  onRunError?: (error: unknown) => void;
};

async function waitForSlotOrPoll(
  active: ReadonlySet<Promise<void>>,
  ms: number,
) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([timeout, ...active]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runJobPool<J>(options: JobPoolOptions<J>): Promise<void> {
  if (
    !Number.isInteger(options.concurrency) ||
    options.concurrency < 1 ||
    options.concurrency > MAX_WORKER_CONCURRENCY
  )
    throw new Error('Invalid worker concurrency');
  const active = new Set<Promise<void>>();
  let claimFailures = 0;
  const start = (job: J) => {
    const task: Promise<void> = (async () => options.run(job))()
      .catch((error) => options.onRunError?.(error))
      .finally(() => {
        active.delete(task);
      });
    active.add(task);
  };
  while (!options.stopping()) {
    options.tick?.();
    if (active.size < options.concurrency) {
      let job: J | null;
      try {
        job = await options.claim();
        claimFailures = 0;
      } catch (error) {
        // A database blip must not kill the jobs that are already running.
        claimFailures++;
        options.onClaimError?.(error);
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(10000, options.pollMs * 2 ** (claimFailures - 1)),
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
    await waitForSlotOrPoll(active, options.pollMs);
  }
  // Graceful stop: no new claims; running jobs finish or their leases expire.
  await Promise.allSettled([...active]);
}
