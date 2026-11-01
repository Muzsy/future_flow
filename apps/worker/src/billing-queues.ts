export type GenerationQueueKind =
  'personal' | 'shared' | 'legacy' | 'public-review' | 'content-review';

// The personal queues use the chapter ledger. Other work stays queued while
// chapter enforcement is active: never silently consume it without billing,
// delete it or turn it into an ordinary personal chapter.
export function generationQueueClaim<T>(
  enforcement: boolean,
  kind: GenerationQueueKind,
  claim: () => Promise<T | null>,
): () => Promise<T | null> {
  return () =>
    enforcement && kind !== 'personal' ? Promise.resolve(null) : claim();
}
