import { validateFictionCommit, type FictionCommit } from './fiction-memory';
import {
  narrativeV1PolicySchema,
  fictionPolicySchema,
} from '@future-flow/contracts';
import { randomUUID } from 'node:crypto';
import type {
  PeriodCandidateV2,
  PeriodChapterV2,
  NarrativePeriodInput,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  simulatePeriodV2,
  validatePeriodChapterV2,
  validatedNarrativeCheckpoint,
  validatedFictionCheckpoint,
} from '@future-flow/core';
import type { Database } from './index';
import { LifeRepository, lifeRow, type LifePeriodInput } from './lives';
import { personalPrivacyEventIds } from './shared-privacy';
import {
  lifeJobReadyToCommit,
  narrativeProcessingBlock,
} from './life-job-state';
import {
  validateNarrativeCommit,
  type NarrativeCommit,
} from './narrative-artifact';

export type LifeJob = Record<string, unknown> & {
  id: string;
  user_id: string;
  life_id: string;
  branch_id: string;
  base_revision: number;
  payload: NarrativePeriodInput;
  checkpoints: Record<string, unknown>;
  lease_token: string;
  attempt: number;
  shared_privacy_event_ids?: string[];
};
function lost(): never {
  throw new DomainError(
    'JOB_LEASE_LOST',
    'The job lease is no longer valid.',
    409,
  );
}
export class LifeJobRepository {
  constructor(
    public readonly db: Database,
    private readonly leaseSeconds = 180,
  ) {}
  async verifySharedPrivacy(job: LifeJob, tx: Database = this.db) {
    if (
      job.shared_privacy_event_ids === undefined &&
      !job.payload.memory.sharedEvents?.length
    )
      return;
    if (
      !(
        await tx.query(
          "SELECT id FROM aw_jobs WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>clock_timestamp()",
          [job.id, job.lease_token],
        )
      ).length
    )
      lost();
    const current = await personalPrivacyEventIds(
      tx,
      job.user_id,
      job.branch_id,
      job.payload.startDate,
    );
    if (
      hash(current) !== hash([...(job.shared_privacy_event_ids ?? [])].sort())
    )
      throw new DomainError(
        'SHARED_PRIVACY_CHANGED',
        'Shared privacy changed. Retry with refreshed history.',
        409,
      );
  }
  async claim(): Promise<LifeJob | null> {
    return this.db.transaction(async (tx) => {
      const job = (
        await tx.query<LifeJob>(
          `SELECT j.* FROM aw_jobs j JOIN ff_users u ON u.id=j.user_id WHERE u.status='active' AND (j.status='queued' OR (j.status='running' AND j.lease_until<clock_timestamp())) ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1`,
        )
      )[0];
      if (!job) return null;
      const savedRecoveries = job.checkpoints.leaseRecoveryCount ?? 0;
      const recoveries =
        typeof savedRecoveries === 'number' &&
        Number.isSafeInteger(savedRecoveries) &&
        savedRecoveries >= 0
          ? savedRecoveries + (job.status === 'running' ? 1 : 0)
          : 50;
      const ready = lifeJobReadyToCommit(job.checkpoints, job.payload);
      const narrativeBlock = narrativeProcessingBlock(
        job.checkpoints,
        job.payload,
      );
      if (
        narrativeBlock ||
        ((job.attempt >= 5 || recoveries >= 50) && !ready)
      ) {
        await tx.query(
          "UPDATE aw_jobs SET status='failed',error_code=$2,lease_token=NULL,lease_until=NULL WHERE id=$1",
          [
            job.id,
            narrativeBlock ??
              (job.attempt >= 5
                ? 'JOB_ATTEMPTS_EXHAUSTED'
                : 'JOB_RECOVERY_EXHAUSTED'),
          ],
        );
        await tx.query(
          "UPDATE aw_branches SET status='failed' WHERE id=$1 AND user_id=$2",
          [job.branch_id, job.user_id],
        );
        return null;
      }
      return lifeRow(
        await tx.query<LifeJob>(
          "UPDATE aw_jobs SET status='running',lease_token=$2,lease_until=clock_timestamp()+($3*interval '1 second'),checkpoints=checkpoints||jsonb_build_object('leaseRecoveryCount',$4::int) WHERE id=$1 RETURNING *",
          [job.id, randomUUID(), this.leaseSeconds, Math.min(recoveries, 50)],
        ),
      );
    });
  }
  async heartbeat(job: LifeJob) {
    if (
      !(
        await this.db.query(
          "UPDATE aw_jobs j SET lease_until=clock_timestamp()+($3*interval '1 second') WHERE j.id=$1 AND j.lease_token=$2 AND j.lease_until>clock_timestamp() AND j.status='running' AND EXISTS(SELECT 1 FROM ff_users u WHERE u.id=j.user_id AND u.status='active') RETURNING j.id",
          [job.id, job.lease_token, this.leaseSeconds],
        )
      ).length
    )
      lost();
  }
  async admitNarrativeRequest(job: LifeJob) {
    const count = await this.db.transaction(async (tx) => {
      if (
        !(
          await tx.query(
            "SELECT id FROM ff_users WHERE id=$1 AND status='active' FOR UPDATE",
            [job.user_id],
          )
        ).length
      )
        lost();
      const current = (
        await tx.query<LifeJob>(
          "SELECT * FROM aw_jobs WHERE id=$1 AND user_id=$2 AND lease_token=$3 AND status='running' AND lease_until>clock_timestamp() FOR UPDATE",
          [job.id, job.user_id, job.lease_token],
        )
      )[0];
      if (!current || hash(current.payload) !== hash(job.payload)) lost();
      if (
        current.checkpoints.catalogOperatorLease ||
        !['narrative-v1', 'narrative-fiction-v2'].includes(
          current.payload.narrativeContext?.policy.mode ?? '',
        )
      )
        throw new DomainError(
          'NARRATIVE_CONTEXT_INVALID',
          'Narrative admission needs an ordinary narrative job.',
        );
      await this.verifySharedPrivacy(job, tx);
      const branch = await new LifeRepository(tx).branch(
        job.user_id,
        job.branch_id,
        tx,
        true,
      );
      if (
        branch.revision !== job.base_revision ||
        branch.status !== 'generating' ||
        branch.pending_decision ||
        hash(branch.state) !== hash(current.payload.state)
      )
        throw new DomainError(
          'LIFE_REVISION_CONFLICT',
          'The life has changed.',
          409,
        );
      const policy = (
        current.payload.narrativeContext?.policy.mode === 'narrative-fiction-v2'
          ? fictionPolicySchema
          : narrativeV1PolicySchema
      ).safeParse(current.payload.narrativeContext?.policy);
      if (!policy.success)
        throw new DomainError(
          'NARRATIVE_CONTEXT_INVALID',
          'Narrative request policy is invalid.',
        );
      const limit = policy.data.maxPhysicalRequests;
      const used =
        current.checkpoints.providerRequestCount === undefined
          ? 0
          : current.checkpoints.providerRequestCount;
      if (
        typeof used !== 'number' ||
        !Number.isSafeInteger(used) ||
        used < 0 ||
        used > limit
      )
        throw new DomainError(
          'NARRATIVE_CONTEXT_INVALID',
          'Narrative request count is invalid.',
        );
      if (used >= limit)
        throw new DomainError(
          'NARRATIVE_REQUEST_LIMIT',
          'Narrative request limit reached.',
        );
      const row = (
        await tx.query<{ count: number }>(
          "UPDATE aw_jobs SET checkpoints=checkpoints||jsonb_build_object('providerRequestCount',COALESCE((checkpoints->>'providerRequestCount')::int,0)+1) WHERE id=$1 AND user_id=$2 AND lease_token=$3 AND status='running' AND lease_until>clock_timestamp() AND COALESCE((checkpoints->>'providerRequestCount')::int,0)<$4 RETURNING (checkpoints->>'providerRequestCount')::int AS count",
          [job.id, job.user_id, job.lease_token, limit],
        )
      )[0];
      if (!row) lost();
      return row.count;
    });
    job.checkpoints.providerRequestCount = count;
  }
  async checkpoint(
    job: LifeJob,
    stage: string,
    patch: Record<string, unknown>,
  ) {
    if (
      !(
        await this.db.query(
          "UPDATE aw_jobs j SET stage=$3,checkpoints=checkpoints||$4::jsonb WHERE j.id=$1 AND j.lease_token=$2 AND j.lease_until>clock_timestamp() AND j.status='running' AND EXISTS(SELECT 1 FROM ff_users u WHERE u.id=j.user_id AND u.status='active') RETURNING j.id",
          [job.id, job.lease_token, stage, JSON.stringify(patch)],
        )
      ).length
    )
      lost();
    Object.assign(job.checkpoints, patch);
  }
  async complete(
    job: LifeJob,
    candidate: PeriodCandidateV2,
    chapter: PeriodChapterV2,
    receipts: unknown[],
    narrative?: NarrativeCommit | FictionCommit,
  ) {
    return this.db.transaction(async (tx) => {
      const user = (
        await tx.query(
          "SELECT id FROM ff_users WHERE id=$1 AND status='active' FOR UPDATE",
          [job.user_id],
        )
      )[0];
      if (!user) lost();
      const current = (
        await tx.query<LifeJob>(
          "SELECT * FROM aw_jobs WHERE id=$1 AND lease_token=$2 AND lease_until>clock_timestamp() AND status='running' FOR UPDATE",
          [job.id, job.lease_token],
        )
      )[0];
      if (!current) lost();
      if (hash(current.payload) !== hash(job.payload)) lost();
      await this.verifySharedPrivacy(job, tx);
      const repo = new LifeRepository(tx),
        branch = await repo.branch(job.user_id, job.branch_id, tx, true);
      if (
        branch.revision !== job.base_revision ||
        branch.status !== 'generating' ||
        branch.pending_decision ||
        hash(branch.state) !== hash(job.payload.state)
      )
        throw new DomainError(
          'LIFE_REVISION_CONFLICT',
          'The life has changed.',
          409,
        );
      if (
        candidate.periodId !== job.payload.periodId ||
        candidate.durationMonths !== 6
      )
        throw new DomainError(
          'LIFE_PERIOD_INTERVAL',
          'Wrong requested period.',
        );
      const canon = simulatePeriodV2(
        candidate,
        branch.state,
        branch.input.constraints,
        {
          lifeId: branch.life_id,
          branchId: branch.id,
          revision: branch.revision,
          acceptedDecisionIds: branch.accepted_decision_ids,
        },
      );
      const narrativeArtifact =
        current.payload.narrativeContext?.policy.mode === 'narrative-fiction-v2'
          ? await validateFictionCommit(
              tx,
              job.user_id,
              branch.id,
              current.payload,
              chapter,
              candidate,
              receipts,
              current.checkpoints,
              narrative as FictionCommit,
            )
          : await validateNarrativeCommit(
              tx,
              job.user_id,
              branch.id,
              current.payload,
              canon,
              chapter,
              receipts,
              narrative as NarrativeCommit | undefined,
            );
      if (!narrativeArtifact) validatePeriodChapterV2(chapter, canon.events);
      else {
        const saved = (
          current.payload.narrativeContext?.policy.mode ===
            'narrative-fiction-v2'
            ? validatedFictionCheckpoint
            : validatedNarrativeCheckpoint
        )(current.checkpoints, current.payload);
        if (
          hash(saved.artifact) !== hash(narrativeArtifact) ||
          hash(saved.receipts) !== hash(receipts)
        )
          throw new DomainError(
            'NARRATIVE_CONTEXT_INVALID',
            'Narrative final checkpoint differs.',
          );
      }
      const history = await tx.query<
        Record<string, unknown> & { candidate: PeriodCandidateV2 }
      >(
        'SELECT p.candidate FROM aw_history h JOIN aw_periods p ON p.id=h.period_id WHERE h.branch_id=$1 AND h.user_id=$2',
        [branch.id, job.user_id],
      );
      const usedIds = new Set(
        history.flatMap((p) =>
          p.candidate.events.flatMap((e) => [
            e.id,
            ...(e.decision
              ? [e.decision.id, ...e.decision.options.map((o) => o.id)]
              : []),
          ]),
        ),
      );
      const newIds = candidate.events.flatMap((e) => [
        e.id,
        ...(e.decision
          ? [e.decision.id, ...e.decision.options.map((o) => o.id)]
          : []),
      ]);
      if (
        new Set(newIds).size !== newIds.length ||
        newIds.some((id) => usedIds.has(id))
      )
        throw new DomainError(
          'LIFE_DUPLICATE_ID',
          'Reused event or decision ID.',
        );
      const position = history.length + 1;
      await tx.query(
        'INSERT INTO aw_periods(id,user_id,life_id,branch_id,period_no,base_revision,candidate,events,start_state,end_state,accepted_before,chapter,canon_hash,narrative_artifact) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
        [
          candidate.periodId,
          job.user_id,
          branch.life_id,
          branch.id,
          position,
          branch.revision,
          JSON.stringify(candidate),
          JSON.stringify(canon.events),
          JSON.stringify(branch.state),
          JSON.stringify(canon.endState),
          JSON.stringify(branch.accepted_decision_ids),
          JSON.stringify(chapter),
          hash(canon),
          narrativeArtifact ? JSON.stringify(narrativeArtifact) : null,
        ],
      );
      await tx.query(
        'INSERT INTO aw_history(user_id,life_id,branch_id,period_id,position) VALUES($1,$2,$3,$4,$5)',
        [job.user_id, branch.life_id, branch.id, candidate.periodId, position],
      );
      await tx.query(
        "UPDATE aw_branches SET state=$3,pending_decision=$4,revision=revision+1,status='decision' WHERE id=$1 AND user_id=$2",
        [
          branch.id,
          job.user_id,
          JSON.stringify(canon.endState),
          JSON.stringify(candidate.events.at(-1)!.decision),
        ],
      );
      for (const receipt of receipts)
        await tx.query(
          'INSERT INTO aw_ai_runs(id,user_id,job_id,metadata) VALUES($1,$2,$3,$4)',
          [randomUUID(), job.user_id, job.id, JSON.stringify(receipt)],
        );
      await repo.metric(
        tx,
        branch,
        position === 1
          ? 'first_period_completed'
          : branch.parent_branch_id &&
              !history.some((p) => p.candidate.branchId === branch.id)
            ? 'fork_first_period_completed'
            : 'continuation_completed',
      );
      const completed = await tx.query(
        "UPDATE aw_jobs SET status='completed',stage='COMPLETED',checkpoints=$2,lease_token=NULL,lease_until=NULL,completed_at=now() WHERE id=$1 AND lease_token=$3 AND status='running' AND lease_until>clock_timestamp() RETURNING id",
        [
          job.id,
          JSON.stringify({
            repairUsed: Boolean(job.checkpoints.repairUsed),
            repairKind: job.checkpoints.repairKind ?? null,
            repairReasonCode: job.checkpoints.repairReasonCode ?? null,
            receiptOrder: receipts.map(hash),
            ...(narrativeArtifact
              ? {
                  narrativeGenerationBinding: {
                    pipelineVersion: narrativeArtifact.pipelineVersion,
                    sourceHash: hash(current.payload),
                    artifactHash: hash(narrativeArtifact),
                    ...narrativeArtifact.bindings,
                  },
                  providerRequestCount:
                    current.checkpoints.providerRequestCount,
                }
              : {}),
            ...(job.checkpoints.periodInputHash &&
            job.checkpoints.chapterInputHash &&
            job.checkpoints.fidelityInputHash
              ? {
                  generationBinding: {
                    sourceHash: hash(job.payload),
                    periodInputHash: job.checkpoints.periodInputHash,
                    chapterInputHash: job.checkpoints.chapterInputHash,
                    fidelityInputHash: job.checkpoints.fidelityInputHash,
                  },
                }
              : {}),
          }),
          job.lease_token,
        ],
      );
      if (!completed.length) lost();
    });
  }
  async fail(job: LifeJob, error: unknown) {
    await this.db.transaction(async (tx) => {
      const rows = await tx.query(
        "UPDATE aw_jobs SET status='failed',error_code=$3,lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>clock_timestamp() RETURNING id",
        [
          job.id,
          job.lease_token,
          error instanceof DomainError ? error.code : 'JOB_FAILED',
        ],
      );
      if (rows.length)
        await tx.query(
          "UPDATE aw_branches SET status='failed' WHERE id=$1 AND user_id=$2 AND status='generating'",
          [job.branch_id, job.user_id],
        );
    });
  }
}
