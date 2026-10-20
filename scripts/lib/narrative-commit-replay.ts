import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  LifeJobRepository,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import { DomainError } from '@future-flow/core';
import { processLifeJob } from '../../apps/worker/src/life-processor';
import { adapter } from './narrative-evaluation-runner';
import {
  failureDiagnostic,
  type FailureDiagnostic,
} from './narrative-failure-diagnostic';

// Replays the processing of a failed creative job from its saved PGlite state
// with NO model call: every stage that already has a checkpoint is served from
// it, and a stage that would need a provider fails loudly instead. It answers
// "why did this job fail after its last checkpoint" with the validator's own
// message and the throwing frames, and says whether the job commits now.
//
// By default it works on a copy of the state directory; `inPlace` writes the
// committed result into the original (only after a successful dry replay).
export type CommitReplayResult = {
  jobId: string;
  stage: string | null;
  errorCode: string | null;
  providerRequestCount: number | null;
  outcome: 'committed' | 'failed' | 'needs_model_call';
  failure: FailureDiagnostic | null;
  wroteState: boolean;
};

const noModel = new Proxy(
  {},
  {
    get: (_target, key) => () => {
      throw new DomainError(
        'REPLAY_NEEDS_MODEL_CALL',
        `The replay would need a provider call (${String(key)}).`,
      );
    },
  },
);

export async function replayJobOn(
  db: Database,
  jobId?: string,
): Promise<CommitReplayResult> {
  {
    const rows = await db.query<LifeJob>(
      jobId
        ? 'SELECT * FROM aw_jobs WHERE id=$1'
        : "SELECT * FROM aw_jobs WHERE status='failed' ORDER BY created_at DESC LIMIT 1",
      jobId ? [jobId] : [],
    );
    const saved = rows[0];
    if (!saved)
      throw new Error(
        jobId
          ? `No job ${jobId} in this state.`
          : 'No failed job in this state.',
      );
    // Lease the saved job by hand: a normal claim refuses a job that already
    // used its physical requests, which is exactly the job to be replayed.
    const token = '00000000-0000-4000-8000-0000000000aa';
    await db.query(
      "UPDATE aw_jobs SET status='running',error_code=NULL,lease_token=$2,lease_until=now()+interval '1 hour' WHERE id=$1",
      [saved.id, token],
    );
    await db.query(
      "UPDATE aw_branches SET status='generating' WHERE id=$1 AND status='failed'",
      [saved.branch_id],
    );
    const [job] = await db.query<LifeJob>('SELECT * FROM aw_jobs WHERE id=$1', [
      saved.id,
    ]);
    const base = {
      jobId: saved.id,
      stage: saved.stage ? String(saved.stage) : null,
      errorCode: saved.error_code ? String(saved.error_code) : null,
      providerRequestCount:
        typeof saved.checkpoints.providerRequestCount === 'number'
          ? saved.checkpoints.providerRequestCount
          : null,
    };
    try {
      await processLifeJob(
        job!,
        new LifeJobRepository(db, 60),
        noModel as never,
      );
    } catch (error) {
      const failure = failureDiagnostic(error);
      return {
        ...base,
        outcome:
          // The processor checks the request ceiling right before a call.
          ['REPLAY_NEEDS_MODEL_CALL', 'NARRATIVE_REQUEST_LIMIT'].includes(
            failure.code,
          )
            ? 'needs_model_call'
            : 'failed',
        failure,
        wroteState: false,
      };
    }
    return { ...base, outcome: 'committed', failure: null, wroteState: false };
  }
}

async function replayOn(
  statePath: string,
  jobId: string | undefined,
): Promise<CommitReplayResult> {
  const engine = new PGlite(statePath);
  try {
    return await replayJobOn(adapter(engine), jobId);
  } finally {
    await engine.close();
  }
}

export async function replayFailedCommit(options: {
  stateDir: string;
  jobId?: string;
  inPlace?: boolean;
}): Promise<CommitReplayResult> {
  const source = resolve(options.stateDir);
  if (!existsSync(source))
    throw new Error(`State directory ${source} does not exist.`);
  const work = mkdtempSync(join(tmpdir(), 'alterward-commit-replay-'));
  try {
    const copy = join(work, 'state');
    cpSync(source, copy, { recursive: true });
    const result = await replayOn(copy, options.jobId);
    if (options.inPlace && result.outcome === 'committed') {
      rmSync(source, { recursive: true, force: true });
      cpSync(copy, source, { recursive: true });
      return { ...result, wroteState: true };
    }
    return result;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
