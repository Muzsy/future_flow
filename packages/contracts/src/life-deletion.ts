import { z } from 'zod';
export const lifeDeletionRequestSchema = z
  .object({
    branchId: z.uuid(),
    revision: z.number().int().nonnegative(),
    confirmation: z.literal('DELETE LIFE'),
  })
  .strict();
export const lifeDeletionReceiptSchema = z
  .object({
    schemaVersion: z.literal('life-deletion-1'),
    lifeId: z.uuid(),
    deleted: z.literal(true),
    deletedBranchCount: z.number().int().positive(),
  })
  .strict();
