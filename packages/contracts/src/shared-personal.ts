import { z } from 'zod';
import {
  SHARED_CONTEXT_CONTRACT_VERSION,
  sharedMemoryEventSchema,
} from './shared-context';

// A personal projection of immutable canon, never another member's private state.
// effectiveAt is the common event date; knownAt is when this branch learns it.
export const personalSharedMemorySchema = sharedMemoryEventSchema
  .extend({
    schemaVersion: z.literal(SHARED_CONTEXT_CONTRACT_VERSION),
    eventId: z.uuid(),
    resolutionId: z.uuid().nullable(),
    ownOptionId: z.uuid().nullable(),
    knownAt: z.iso.date(),
  })
  .strict();
export type PersonalSharedMemory = z.infer<typeof personalSharedMemorySchema>;
export const personalSharedMemoriesSchema = z
  .array(personalSharedMemorySchema)
  .max(8);
