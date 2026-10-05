import { randomUUID } from 'node:crypto';
import {
  interactionProfileSchema,
  sharedPolicySchema,
  type SharedAiInput,
  type SharedEventCandidate,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  validateSharedAiInput,
  validateSharedAiCandidate,
} from '@future-flow/core';
import type { Database } from './index';
import { SharedEventRepository } from './shared-events';
import type { SharedContextRow, SharedMemberRow } from './shared-contexts';

export type SharedJob = Record<string, unknown> & {
  id: string;
  context_id: string;
  requested_by_user_id: string;
  base_revision: number;
  payload: SharedAiInput;
  checkpoints: Record<string, unknown>;
  lease_token: string;
  attempt: number;
};
function lost(): never {
  throw new DomainError(
    'JOB_LEASE_LOST',
    'The job lease is no longer valid.',
    409,
  );
}
export class SharedJobRepository extends SharedEventRepository {
  constructor(
    db: Database,
    inviteSecret?: string,
    private readonly leaseSeconds = 180,
    private readonly deadlineSeconds: number | null = null,
    private readonly limits = { daily: 3, concurrent: 1 },
  ) {
    super(db, inviteSecret);
    if (!Number.isFinite(leaseSeconds) || leaseSeconds < 60)
      throw new Error('Invalid Shared lease duration');
    if (
      !Number.isInteger(limits.daily) ||
      limits.daily < 1 ||
      !Number.isInteger(limits.concurrent) ||
      limits.concurrent < 1
    )
      throw new Error('Invalid Shared generation limits');
  }
  async enqueue(
    userId: string,
    contextId: string,
    expected: number,
    key: string,
  ) {
    return this.engineMutation(
      userId,
      contextId,
      'shared:generate:' + contextId,
      key,
      { contextRevision: expected },
      async (tx, c, _m, all) => {
        this.revision(c, expected);
        this.writable(c);
        if (c.status !== 'active')
          throw new DomainError(
            'SHARED_MEMBER_INACTIVE',
            'This group is not active.',
            403,
          );
        const [usage] = await tx.query(
          "SELECT count(*) FILTER(WHERE created_at>now()-interval '24 hours')::int AS daily,count(*) FILTER(WHERE status IN ('queued','running'))::int AS concurrent FROM aw_shared_jobs WHERE requested_by_user_id=$1",
          [userId],
        );
        if (
          Number(usage!.daily) >= this.limits.daily ||
          Number(usage!.concurrent) >= this.limits.concurrent
        )
          throw new DomainError(
            'GENERATION_LIMIT',
            'Your shared generation limit has been reached.',
            429,
          );
        if (
          (
            await tx.query(
              "SELECT id FROM aw_shared_jobs WHERE context_id=$1 AND status IN ('queued','running')",
              [c.id],
            )
          ).length
        )
          throw new DomainError(
            'SHARED_GENERATION_ACTIVE',
            'A shared event is already being generated.',
            409,
          );
        const members = all.filter((m) => m.status === 'active');
        c.simulation_at = await this.eligible(
          tx,
          c,
          all,
          members.map((m) => m.id),
          undefined,
          true,
        );
        for (const m of members) await this.privacy(tx, m.user_id!);
        const history = await tx.query(
          'SELECT e.id,e.effective_at::text,e.candidate,r.result FROM aw_shared_events e LEFT JOIN aw_shared_resolutions r ON r.event_id=e.id WHERE e.context_id=$1 ORDER BY e.sequence DESC LIMIT 8',
          [c.id],
        );
        const yes = randomUUID(),
          no = randomUUID();
        const input = validateSharedAiInput({
          schemaVersion: '1.0.0',
          locale: 'en',
          context: {
            id: c.id,
            title: c.title,
            revision: c.revision + 1,
            simulationAt: c.simulation_at,
            state: c.state,
            governance: sharedPolicySchema.parse(c.governance),
          },
          eventId: randomUUID(),
          members: members.map((m) => ({
            memberId: m.id,
            interactionProfile: interactionProfileSchema.parse(
              m.interaction_profile,
            ),
          })),
          decision: {
            id: randomUUID(),
            participationOptionId: yes,
            optOutOptionId: no,
            rules: {
              deadlineSeconds: this.deadlineSeconds,
              participatingOptionIds: [yes],
              quorum: null,
            },
          },
          history: history.reverse().map((e) => {
            const candidate = e.candidate as SharedEventCandidate,
              result = e.result as {
                status: 'resolved' | 'cancelled';
                participatingMemberIds: string[];
              } | null;
            return {
              eventId: String(e.id),
              effectiveAt: String(e.effective_at),
              title: candidate.title,
              summary: candidate.summary,
              resolutionStatus: result?.status ?? null,
              participatingMemberIds: result?.participatingMemberIds ?? [],
            };
          }),
        });
        const jobId = randomUUID();
        await tx.query(
          'INSERT INTO aw_shared_jobs(id,context_id,requested_by_user_id,base_revision,payload) VALUES($1,$2,$3,$4,$5)',
          [jobId, c.id, userId, input.context.revision, JSON.stringify(input)],
        );
        await tx.query(
          'UPDATE aw_shared_contexts SET revision=revision+1,simulation_at=$2,updated_at=now() WHERE id=$1',
          [c.id, c.simulation_at],
        );
        return { jobId, contextId: c.id, revision: input.context.revision };
      },
    );
  }
  private async verifyContext(
    tx: Database,
    c: SharedContextRow,
    all: SharedMemberRow[],
    job: SharedJob,
  ) {
    const input = validateSharedAiInput(job.payload),
      members = all.filter((m) => m.status === 'active');
    this.revision(c, job.base_revision);
    this.writable(c);
    if (
      c.status !== 'active' ||
      c.type !== 'friend_group' ||
      job.context_id !== input.context.id ||
      job.base_revision !== input.context.revision ||
      hash({
        id: c.id,
        title: c.title,
        revision: c.revision,
        simulationAt: c.simulation_at,
        state: c.state,
        governance: c.governance,
      }) !== hash(input.context) ||
      hash(
        members
          .map((m) => ({
            memberId: m.id,
            interactionProfile: m.interaction_profile,
          }))
          .sort((a, b) => a.memberId.localeCompare(b.memberId)),
      ) !==
        hash(
          [...input.members].sort((a, b) =>
            a.memberId.localeCompare(b.memberId),
          ),
        ) ||
      !members.some((m) => m.user_id === job.requested_by_user_id)
    )
      throw new DomainError(
        'SHARED_REVISION_CONFLICT',
        'The shared group changed.',
        409,
      );
    await this.eligible(
      tx,
      c,
      all,
      input.members.map((m) => m.memberId),
    );
    for (const m of members) await this.privacy(tx, m.user_id!);
  }
  private async locked<T>(
    job: SharedJob,
    run: (
      tx: Database,
      c: SharedContextRow,
      all: SharedMemberRow[],
      current: SharedJob,
    ) => Promise<T>,
  ) {
    const userIds = await this.users(job.context_id);
    return this.db.transaction(async (tx) => {
      await this.active(tx, [...userIds, job.requested_by_user_id]);
      const c = await this.context(tx, job.context_id, true),
        all = await this.members(tx, c.id);
      if (
        all.some(
          (m) =>
            ['active', 'paused_entitlement'].includes(m.status) &&
            m.user_id &&
            !userIds.includes(m.user_id),
        )
      )
        throw new DomainError(
          'SHARED_REVISION_CONFLICT',
          'The group changed.',
          409,
        );
      const [current] = await tx.query<SharedJob>(
        "SELECT * FROM aw_shared_jobs WHERE id=$1 AND lease_token=$2 AND lease_until>clock_timestamp() AND status='running' FOR UPDATE",
        [job.id, job.lease_token],
      );
      if (!current) lost();
      await this.verifyContext(tx, c, all, current);
      return run(tx, c, all, current);
    });
  }
  async claim(): Promise<SharedJob | null> {
    const hints = await this.db.query<SharedJob>(
      "SELECT * FROM aw_shared_jobs WHERE status='queued' OR (status='running' AND lease_until<clock_timestamp()) ORDER BY created_at,id LIMIT 16",
    );
    for (const hint of hints) {
      const users = await this.users(hint.context_id);
      const claimed = await this.db.transaction(async (tx) => {
        // Deletion and all mutations share user -> context -> job order.
        const ids = [
          ...new Set([...users, hint.requested_by_user_id].filter(Boolean)),
        ].sort();
        const accounts = await tx.query(
          'SELECT id,status FROM ff_users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
          [ids],
        );
        const c = await this.context(tx, hint.context_id, true),
          all = await this.members(tx, c.id);
        const [job] = await tx.query<SharedJob>(
          "SELECT * FROM aw_shared_jobs WHERE id=$1 AND (status='queued' OR (status='running' AND lease_until<clock_timestamp())) FOR UPDATE SKIP LOCKED",
          [hint.id],
        );
        if (!job) return null;
        let error: string | null = null;
        if (job.attempt >= 5) error = 'JOB_ATTEMPTS_EXHAUSTED';
        else if (
          !job.requested_by_user_id ||
          accounts.length !== ids.length ||
          accounts.some((u) => u.status !== 'active')
        )
          error = 'ACCOUNT_DELETING';
        else if (
          all.some(
            (m) =>
              ['active', 'paused_entitlement'].includes(m.status) &&
              m.user_id &&
              !users.includes(m.user_id),
          )
        )
          error = 'SHARED_REVISION_CONFLICT';
        else
          try {
            await this.verifyContext(tx, c, all, job);
          } catch (e) {
            error =
              e instanceof DomainError ? e.code : 'SHARED_CANDIDATE_INVALID';
          }
        if (error) {
          await tx.query(
            "UPDATE aw_shared_jobs SET status='failed',error_code=$2,lease_token=NULL,lease_until=NULL,completed_at=now() WHERE id=$1",
            [job.id, error],
          );
          return null;
        }
        return (
          await tx.query<SharedJob>(
            "UPDATE aw_shared_jobs SET status='running',attempt=attempt+1,lease_token=$2,lease_until=clock_timestamp()+($3*interval '1 second') WHERE id=$1 RETURNING *",
            [job.id, randomUUID(), this.leaseSeconds],
          )
        )[0]!;
      });
      if (claimed) return claimed;
    }
    return null;
  }
  async verify(job: SharedJob) {
    await this.locked(job, async () => {});
  }
  async heartbeat(job: SharedJob) {
    if (
      !(
        await this.db.query(
          "UPDATE aw_shared_jobs j SET lease_until=clock_timestamp()+($3*interval '1 second') WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>clock_timestamp() AND EXISTS(SELECT 1 FROM ff_users u WHERE u.id=j.requested_by_user_id AND u.status='active') RETURNING id",
          [job.id, job.lease_token, this.leaseSeconds],
        )
      ).length
    )
      lost();
  }
  async checkpoint(
    job: SharedJob,
    stage: string,
    patch: Record<string, unknown>,
    receipt?: unknown,
  ) {
    await this.db.transaction(async (tx) => {
      // Receipt's charged-user FK must never acquire a user lock behind a job lock.
      await this.active(tx, [job.requested_by_user_id]);
      if (
        !(
          await tx.query(
            "UPDATE aw_shared_jobs j SET stage=$3,checkpoints=checkpoints||$4::jsonb WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>clock_timestamp() AND EXISTS(SELECT 1 FROM ff_users u WHERE u.id=j.requested_by_user_id AND u.status='active') RETURNING id",
            [job.id, job.lease_token, stage, JSON.stringify(patch)],
          )
        ).length
      )
        lost();
      if (receipt)
        await tx.query(
          'INSERT INTO aw_shared_ai_runs(id,shared_job_id,charged_user_id,metadata) VALUES($1,$2,$3,$4)',
          [
            randomUUID(),
            job.id,
            job.requested_by_user_id,
            JSON.stringify(receipt),
          ],
        );
    });
    Object.assign(job.checkpoints, patch);
  }
  async complete(job: SharedJob, raw: unknown) {
    return this.locked(job, async (tx, c, all, current) => {
      const candidate = validateSharedAiCandidate(raw, current.payload);
      const result = await this.commitCandidateTx(
        tx,
        c,
        all,
        candidate,
        current.payload.decision.rules,
        current.id,
      );
      if (
        !(
          await tx.query(
            "UPDATE aw_shared_jobs SET status='completed',stage='COMPLETED',payload='{}',checkpoints=$3,lease_token=NULL,lease_until=NULL,completed_at=now() WHERE id=$1 AND lease_token=$2 AND lease_until>clock_timestamp() AND status='running' RETURNING id",
            [
              job.id,
              job.lease_token,
              JSON.stringify({
                eventId: result.eventId,
                canonHash: result.canonHash,
                repairStarted: Boolean(current.checkpoints.repairStarted),
              }),
            ],
          )
        ).length
      )
        lost();
      return result;
    });
  }
  async fail(job: SharedJob, error: unknown) {
    await this.db.query(
      "UPDATE aw_shared_jobs SET status='failed',error_code=$3,lease_token=NULL,lease_until=NULL,completed_at=now() WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>clock_timestamp()",
      [
        job.id,
        job.lease_token,
        error instanceof DomainError ? error.code : 'JOB_FAILED',
      ],
    );
  }
  async job(userId: string, jobId: string) {
    return this.db.transaction(async (tx) => {
      await this.active(tx, [userId]);
      const [job] = await tx.query<SharedJob>(
        'SELECT * FROM aw_shared_jobs WHERE id=$1',
        [jobId],
      );
      if (!job)
        throw new DomainError(
          'RESOURCE_NOT_FOUND',
          'This job is unavailable.',
          404,
        );
      await this.context(tx, job.context_id, true);
      await this.member(tx, userId, job.context_id);
      return {
        id: job.id,
        contextId: job.context_id,
        status: job.status,
        stage: job.stage,
        errorCode: job.error_code ?? null,
        eventId: job.checkpoints.eventId ?? null,
      };
    });
  }
}
