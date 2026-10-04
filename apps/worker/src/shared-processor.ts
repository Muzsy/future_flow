import { DomainError, validateSharedAiCandidate } from '@future-flow/core';
import { z } from 'zod';
import type { SharedJob, SharedJobRepository } from '@future-flow/database';
import type { SharedAiProvider } from '@future-flow/ai';

export async function processSharedJob(
  job: SharedJob,
  jobs: SharedJobRepository,
  ai: SharedAiProvider,
) {
  let candidate = job.checkpoints.candidate;
  let problem: string | undefined;
  if (candidate) {
    try {
      validateSharedAiCandidate(candidate, job.payload);
    } catch (e) {
      if (!(e instanceof DomainError) && !(e instanceof z.ZodError)) throw e;
      problem = e instanceof DomainError ? e.code : 'AI_INVALID_SCHEMA';
    }
  } else {
    // A crash after starting a paid request has uncertain provider outcome. Never repeat it silently.
    if (job.checkpoints.initialCallStarted)
      throw new DomainError(
        'SHARED_REQUEST_INTERRUPTED',
        'The previous AI request was interrupted.',
      );
    await jobs.verify(job);
    await jobs.checkpoint(job, 'REQUEST_STARTED', { initialCallStarted: true });
    try {
      const result = await ai.sharedEvent(job.payload);
      candidate = result.output;
      await jobs.checkpoint(
        job,
        'OUTPUT_RETURNED',
        { candidate },
        result.receipt,
      );
    } catch (e) {
      if (!(e instanceof DomainError) || e.code !== 'AI_INVALID_SCHEMA')
        throw e;
      problem = e.code;
    }
    if (candidate)
      try {
        validateSharedAiCandidate(candidate, job.payload);
      } catch (e) {
        if (!(e instanceof DomainError) && !(e instanceof z.ZodError)) throw e;
        problem = e instanceof DomainError ? e.code : 'AI_INVALID_SCHEMA';
      }
  }
  if (problem) {
    if (job.checkpoints.repairStarted)
      throw new DomainError(
        'SHARED_REPAIR_EXHAUSTED',
        'The shared proposal failed validation.',
      );
    await jobs.verify(job);
    await jobs.checkpoint(job, 'REPAIR_STARTED', {
      repairStarted: true,
      repairReasonCode: problem,
    });
    const result = await ai.sharedEvent(
      job.payload,
      `Rebuild the proposal from the same server request. Validation code: ${problem}. Preserve all server identifiers, policy, eligibility and deadline.`,
    );
    candidate = result.output;
    await jobs.checkpoint(
      job,
      'REPAIR_RETURNED',
      { candidate },
      result.receipt,
    );
  }
  validateSharedAiCandidate(candidate, job.payload);
  await jobs.checkpoint(job, 'CANON_READY', { candidate });
  await jobs.complete(job, candidate);
}
