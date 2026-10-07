import { SetMetadata } from '@nestjs/common';
export const CLOSED_BETA_GENERATION = 'alterward:closed-beta-generation';
// Admission is enforced by the verified Auth guard before the queue mutation;
// the provider budget independently rechecks it before any paid request.
export const ClosedBetaGeneration = () =>
  SetMetadata(CLOSED_BETA_GENERATION, true);
