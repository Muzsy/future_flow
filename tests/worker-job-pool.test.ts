import { describe, expect, it } from 'vitest';
import {
  MAX_WORKER_CONCURRENCY,
  SERVICE_WORKER_CONCURRENCY,
  runJobPool,
  workerConcurrencyFromEnv,
  workerPoolDefault,
} from '../apps/worker/src/job-pool';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(condition: () => boolean, label: string) {
  for (let i = 0; i < 400; i++) {
    if (condition()) return;
    await tick(5);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('worker concurrency configuration', () => {
  it('stays serial outside the service profile and uses six slots inside it', () => {
    expect(workerConcurrencyFromEnv({})).toBe(1);
    expect(
      workerConcurrencyFromEnv({ SERVICE_ACCESS_ENFORCEMENT: 'false' }),
    ).toBe(1);
    expect(
      workerConcurrencyFromEnv({ SERVICE_ACCESS_ENFORCEMENT: 'true' }),
    ).toBe(SERVICE_WORKER_CONCURRENCY);
    expect(
      workerConcurrencyFromEnv({
        SERVICE_ACCESS_ENFORCEMENT: 'true',
        WORKER_CONCURRENCY: '',
      }),
    ).toBe(SERVICE_WORKER_CONCURRENCY);
  });

  it('lets an explicit value override the default', () => {
    expect(
      workerConcurrencyFromEnv({
        SERVICE_ACCESS_ENFORCEMENT: 'true',
        WORKER_CONCURRENCY: '1',
      }),
    ).toBe(1);
    expect(workerConcurrencyFromEnv({ WORKER_CONCURRENCY: '12' })).toBe(12);
    expect(
      workerConcurrencyFromEnv({
        WORKER_CONCURRENCY: String(MAX_WORKER_CONCURRENCY),
      }),
    ).toBe(MAX_WORKER_CONCURRENCY);
  });

  it.each(['0', '-1', '21', '1.5', '6 ', ' 6', 'six', '06', '1e1', '99999'])(
    'refuses the malformed value %j instead of clamping it',
    (value) => {
      expect(() =>
        workerConcurrencyFromEnv({ WORKER_CONCURRENCY: value }),
      ).toThrow('WORKER_CONCURRENCY must be an integer from 1 to 20');
    },
  );

  it('keeps the historical five connections for a serial worker', () => {
    expect(workerPoolDefault(1)).toBe(5);
    expect(workerPoolDefault(6)).toBe(10);
    expect(workerPoolDefault(20)).toBe(24);
  });
});

describe('bounded job pool', () => {
  it('never runs more jobs than the bound and claims strictly one at a time', async () => {
    const jobs = Array.from({ length: 9 }, (_, i) => i);
    const gates = new Map(jobs.map((id) => [id, deferred()]));
    let running = 0,
      peak = 0,
      claiming = 0,
      overlappingClaims = 0,
      done = 0;
    let stop = false;
    const pool = runJobPool<number>({
      concurrency: 3,
      pollMs: 5,
      stopping: () => stop,
      claim: async () => {
        if (++claiming > 1) overlappingClaims++;
        await tick(1);
        claiming--;
        return jobs.shift() ?? null;
      },
      run: async (id) => {
        running++;
        peak = Math.max(peak, running);
        await gates.get(id)!.promise;
        running--;
        done++;
      },
    });
    await until(() => running === 3, 'three running jobs');
    expect(jobs.length).toBe(6);
    for (const id of [...gates.keys()]) {
      await until(() => running > 0 || done === 9, 'a running job');
      gates.get(id)?.resolve();
      await tick(2);
    }
    await until(() => done === 9, 'all jobs done');
    stop = true;
    await pool;
    expect(peak).toBe(3);
    expect(overlappingClaims).toBe(0);
  });

  it('starts the next job as soon as a slot frees, without waiting for the poll interval', async () => {
    const queue = [1, 2, 3];
    const gates = [deferred(), deferred(), deferred()];
    const started: number[] = [];
    let stop = false;
    const pool = runJobPool<number>({
      concurrency: 2,
      pollMs: 60_000,
      stopping: () => stop,
      claim: async () => queue.shift() ?? null,
      run: async (id) => {
        started.push(id);
        await gates[id - 1]!.promise;
      },
    });
    await until(() => started.length === 2, 'two started jobs');
    await tick(20);
    expect(started).toEqual([1, 2]);
    gates[0]!.resolve();
    await until(() => started.length === 3, 'third job after a slot freed');
    stop = true;
    gates[1]!.resolve();
    gates[2]!.resolve();
    await pool;
  });

  it('is serial with a bound of one', async () => {
    const queue = [1, 2, 3, 4];
    let running = 0,
      peak = 0,
      completed = 0,
      stop = false;
    const pool = runJobPool<number>({
      concurrency: 1,
      pollMs: 60_000,
      stopping: () => stop,
      claim: async () => queue.shift() ?? null,
      run: async () => {
        running++;
        peak = Math.max(peak, running);
        await tick(3);
        running--;
        if (++completed === 4) stop = true;
      },
    });
    await pool;
    expect(peak).toBe(1);
    expect(completed).toBe(4);
  });

  it('accounts for a re-claimed job id as a separate running task', async () => {
    const queue = ['a', 'a', 'b'];
    const gates = [deferred(), deferred(), deferred()];
    const order: string[] = [];
    let stop = false;
    const pool = runJobPool<string>({
      concurrency: 3,
      pollMs: 5,
      stopping: () => stop,
      claim: async () => queue.shift() ?? null,
      run: async (id) => {
        const index = order.push(id) - 1;
        await gates[index]!.promise;
      },
    });
    await until(() => order.length === 3, 'three started tasks');
    expect(order).toEqual(['a', 'a', 'b']);
    stop = true;
    gates.forEach((gate) => gate.resolve());
    await pool;
  });

  it('contains a failing job without disturbing the others', async () => {
    const queue = [1, 2, 3];
    const finished: number[] = [];
    const errors: unknown[] = [];
    let stop = false;
    const pool = runJobPool<number>({
      concurrency: 3,
      pollMs: 5,
      stopping: () => stop,
      claim: async () => queue.shift() ?? null,
      run: async (id) => {
        await tick(id * 5);
        if (id === 2) throw new Error('boom');
        finished.push(id);
        if (finished.length === 2) stop = true;
      },
      onRunError: (error) => errors.push(error),
    });
    await pool;
    expect(finished).toEqual([1, 3]);
    expect(errors).toHaveLength(1);
  });

  it('survives a claim error while jobs are running and retries the claim', async () => {
    const gate = deferred();
    let calls = 0,
      claimErrors = 0,
      started = 0,
      stop = false;
    const pool = runJobPool<number>({
      concurrency: 2,
      pollMs: 2,
      stopping: () => stop,
      claim: async () => {
        calls++;
        if (calls === 1) return 1;
        if (calls <= 3) throw new Error('database blip');
        return calls === 4 ? 2 : null;
      },
      run: async () => {
        started++;
        await gate.promise;
      },
      onClaimError: () => {
        claimErrors++;
      },
    });
    await until(() => started === 2, 'the job after the claim errors');
    expect(claimErrors).toBe(2);
    stop = true;
    gate.resolve();
    await pool;
  });

  it('stops claiming on shutdown and waits for the running jobs', async () => {
    const queue = [1, 2, 3, 4, 5];
    const gate = deferred();
    let claims = 0,
      finished = 0,
      stop = false,
      returned = false;
    const pool = runJobPool<number>({
      concurrency: 2,
      pollMs: 5,
      stopping: () => stop,
      claim: async () => {
        claims++;
        return queue.shift() ?? null;
      },
      run: async () => {
        await gate.promise;
        await tick(10);
        finished++;
      },
    }).then(() => {
      returned = true;
    });
    await until(() => claims === 2, 'two claims');
    stop = true;
    await tick(30);
    expect(returned).toBe(false);
    expect(claims).toBe(2);
    gate.resolve();
    await pool;
    expect(finished).toBe(2);
    expect(claims).toBe(2);
  });

  it('runs the tick hook without blocking and rejects an invalid bound', async () => {
    let ticks = 0,
      stop = false;
    await runJobPool<number>({
      concurrency: 1,
      pollMs: 2,
      stopping: () => stop,
      claim: async () => null,
      run: async () => {},
      tick: () => {
        if (++ticks === 3) stop = true;
      },
    });
    expect(ticks).toBe(3);
    await expect(
      runJobPool<number>({
        concurrency: 0,
        pollMs: 1,
        stopping: () => true,
        claim: async () => null,
        run: async () => {},
      }),
    ).rejects.toThrow('Invalid worker concurrency');
  });
});
