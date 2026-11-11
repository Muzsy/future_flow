import {
  personalSharedMemoriesSchema,
  personalSharedMemorySchema,
  sharedMemoryImpactSchema,
} from '@future-flow/contracts';
import { DomainError } from './index';

export function projectPersonalSharedMemory(raw: unknown, knownAt: string) {
  const impact = sharedMemoryImpactSchema.parse(raw);
  const memory = personalSharedMemorySchema.parse({
    ...impact.memory,
    schemaVersion: impact.schemaVersion,
    eventId: impact.eventId,
    resolutionId: impact.resolutionId,
    ownOptionId: impact.ownOptionId,
    knownAt,
  });
  if (memory.contextType !== 'friend_group' || memory.effectiveAt > knownAt)
    throw new DomainError(
      'SHARED_TIME_MISMATCH',
      'Shared memory is not yet available.',
      409,
    );
  return memory;
}

export function validatePersonalSharedMemories(
  raw: unknown,
  startDate: string,
) {
  const memories = personalSharedMemoriesSchema.parse(raw ?? []);
  if (
    new Set(memories.map((m) => m.eventId)).size !== memories.length ||
    memories.some(
      (m) =>
        m.contextType !== 'friend_group' ||
        m.effectiveAt > m.knownAt ||
        m.knownAt > startDate,
    )
  )
    throw new DomainError(
      'SHARED_IMPACT_INVALID',
      'Invalid personal shared memory.',
      409,
    );
  return memories;
}
