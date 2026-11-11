export async function claimFairQueue<T>(
  queues: Array<() => Promise<T | null>>,
  start: number,
) {
  for (let offset = 0; offset < queues.length; offset++) {
    const index = (start + offset) % queues.length,
      job = await queues[index]!();
    if (job) return { job, index, next: (index + 1) % queues.length };
  }
  return { job: null, index: -1, next: (start + 1) % queues.length };
}
