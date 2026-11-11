import {
  billingConfigFromEnv,
  serviceAccessEnforcementFromEnv,
} from '@future-flow/core';
import { combineAiGuards, type AiRequestGuard } from '@future-flow/ai';
import {
  closedBetaConfigFromEnv,
  configureGenerationGate,
  legacyBetaChapterExemption,
  createGenerationGate,
  type LifeJob,
  type LifeJobRepository,
} from '@future-flow/database';

// Match the API's explicit, time-bounded closed-beta exemption. Admission,
// coupons and the USD budget's customer set must never become free-chapter
// authority.
export function configureWorkerChapterBilling(
  env: NodeJS.ProcessEnv = process.env,
) {
  const config = billingConfigFromEnv(env);
  const beta = closedBetaConfigFromEnv(env);
  if (serviceAccessEnforcementFromEnv(env) && !config.enforcement)
    throw Error('Service admission requires chapter billing enforcement');
  configureGenerationGate(
    config.enforcement
      ? createGenerationGate({
          ready: config.enabled,
          ...legacyBetaChapterExemption(beta),
          entitlement: config.entitlement,
        })
      : null,
  );
  return config;
}

export function personalRequestAdmission(
  jobs: Pick<
    LifeJobRepository,
    'admitNarrativeRequest' | 'verifyChapterReservation'
  >,
  job: LifeJob,
  narrative: boolean,
): () => Promise<void> {
  return () =>
    narrative
      ? jobs.admitNarrativeRequest(job)
      : jobs.verifyChapterReservation(job);
}

// USD allocation can wait on another transaction. Recheck the wallet/lease
// after it succeeds and immediately before returning control to the transport.
// On refusal the existing composition returns the known-unused USD allocation
// with zero usage. Chapter consumption remains a durable-save operation.
export function personalChapterGuard(
  guard: AiRequestGuard,
  jobs: Pick<LifeJobRepository, 'verifyChapterReservation'>,
  job: LifeJob,
): AiRequestGuard {
  return combineAiGuards(guard, {
    reserve: async () => {
      await jobs.verifyChapterReservation(job);
      return job.id;
    },
    settle: async () => {},
  });
}
