import { describe, expect, it } from 'vitest';
import {
  generationQueueClaim,
  type GenerationQueueKind,
} from '../apps/worker/src/billing-queues';
import { claimFairQueue } from '../apps/worker/src/fair-queue';

const kinds: GenerationQueueKind[] = [
  'personal',
  'shared',
  'legacy',
  'public-review',
  'content-review',
];
function queues(enforcement: boolean) {
  const pending = kinds.map((kind) => [kind]);
  const calls = kinds.map(() => 0);
  const claimers = kinds.map((kind, index) =>
    generationQueueClaim(enforcement, kind, async () => {
      calls[index]!++;
      return pending[index]!.shift() ?? null;
    }),
  );
  return { pending, calls, claimers };
}

describe('chapter enforcement over the actual fair queue selector', () => {
  it.each([0, 1, 2, 3, 4])(
    'retains all unsupported jobs, including when round-robin starts at %i',
    async (start) => {
      const q = queues(true);
      const result = await claimFairQueue(q.claimers, start);
      expect(result.job).toBe('personal');
      expect(result.index).toBe(0);
      expect(q.calls).toEqual([1, 0, 0, 0, 0]);
      expect(q.pending).toEqual([
        [],
        ['shared'],
        ['legacy'],
        ['public-review'],
        ['content-review'],
      ]);
      const next = await claimFairQueue(q.claimers, result.next);
      expect(next.job).toBeNull();
      expect(q.pending.slice(1)).toEqual([
        ['shared'],
        ['legacy'],
        ['public-review'],
        ['content-review'],
      ]);
      expect(q.calls.slice(1)).toEqual([0, 0, 0, 0]);
    },
  );
  it('preserves ordinary round-robin processing with enforcement off', async () => {
    const q = queues(false);
    const seen: string[] = [];
    let start = 2;
    for (let i = 0; i < 5; i++) {
      const result = await claimFairQueue(q.claimers, start);
      seen.push(result.job!);
      start = result.next;
    }
    expect(seen).toEqual([
      'legacy',
      'public-review',
      'content-review',
      'personal',
      'shared',
    ]);
    expect(q.pending).toEqual([[], [], [], [], []]);
  });
});
