import { randomUUID } from 'node:crypto';
import { DomainError, hash, type CanonEvent } from '@future-flow/core';
import type { ChapterOutput } from '@future-flow/contracts';
import type { Database } from './index';
import type { Job } from './repository';

export class JobRepository {
  constructor(
    private readonly db: Database,
    private readonly leaseSeconds = 180,
  ) {}
  async claim(): Promise<Job | null> {
    return this.db.transaction(async (tx) => {
      const rows =
        await tx.query<Job>(`SELECT j.* FROM ff_jobs j JOIN ff_users u ON u.id=j.user_id
        WHERE u.status='active' AND (j.status='queued' OR (j.status IN ('running','validating') AND j.lease_until < now()))
        ORDER BY j.created_at LIMIT 1 FOR UPDATE OF j SKIP LOCKED`);
      const job = rows[0];
      if (!job) return null;
      if (job.attempt >= 3) {
        await tx.query(
          "UPDATE ff_jobs SET status='failed',error_code='JOB_ATTEMPTS_EXHAUSTED',error_message_safe='A háttérfeladat többször megszakadt.',completed_at=now() WHERE id=$1",
          [job.id],
        );
        await tx.query("UPDATE ff_branches SET status='failed' WHERE id=$1", [
          job.branch_id,
        ]);
        return null;
      }
      const leaseToken = randomUUID();
      const claimed = await tx.query<Job>(
        `UPDATE ff_jobs SET status='running',attempt=attempt+1,lease_token=$2,lease_until=now()+($3 * interval '1 second'),error_code=NULL,error_message_safe=NULL WHERE id=$1 RETURNING *`,
        [job.id, leaseToken, this.leaseSeconds],
      );
      return claimed[0] ?? null;
    });
  }
  async heartbeat(job: Job) {
    const rows = await this.db.query(
      "UPDATE ff_jobs SET lease_until=now()+($3 * interval '1 second') WHERE id=$1 AND lease_token=$2 AND status IN ('running','validating') RETURNING id",
      [job.id, job.lease_token, this.leaseSeconds],
    );
    if (!rows.length)
      throw new DomainError(
        'JOB_LEASE_LOST',
        'A feladat már nem ehhez a workerhez tartozik.',
        409,
      );
  }
  async checkpoint(
    job: Job,
    stage: string,
    checkpoint: Record<string, unknown>,
  ) {
    const rows = await this.db.query(
      `UPDATE ff_jobs SET checkpoints=checkpoints || $3::jsonb,stage=$4,lease_until=now()+($5 * interval '1 second')
      WHERE id=$1 AND lease_token=$2 AND status IN ('running','validating') RETURNING checkpoints`,
      [
        job.id,
        job.lease_token,
        JSON.stringify(checkpoint),
        stage,
        this.leaseSeconds,
      ],
    );
    if (!rows.length)
      throw new DomainError(
        'JOB_LEASE_LOST',
        'A feladat már nem ehhez a workerhez tartozik.',
        409,
      );
    job.checkpoints = rows[0]!.checkpoints as Record<string, unknown>;
  }
  async complete(
    job: Job,
    title: string,
    events: CanonEvent[],
    chapters: ChapterOutput,
    receipts: unknown[],
  ) {
    await this.db.transaction(async (tx) => {
      const owned = await tx.query(
        `SELECT j.id FROM ff_jobs j JOIN ff_users u ON u.id=j.user_id
        WHERE j.id=$1 AND j.lease_token=$2 AND j.lease_until>now() AND j.status IN ('running','validating') AND u.status='active'
        FOR UPDATE OF j`,
        [job.id, job.lease_token],
      );
      if (!owned.length)
        throw new DomainError(
          'JOB_LEASE_LOST',
          'A feladat már nem ehhez a workerhez tartozik.',
          409,
        );
      let stateId = randomUUID();
      await tx.query(
        'INSERT INTO ff_life_states(id,user_id,branch_id,sequence_no,effective_at,state,state_hash) VALUES($1,$2,$3,0,$4,$5,$6)',
        [
          stateId,
          job.user_id,
          job.branch_id,
          job.payload.state.effectiveAt,
          JSON.stringify(job.payload.state),
          hash(job.payload.state),
        ],
      );
      const eventIds = new Map<string, string>();
      for (const [index, event] of events.entries()) {
        const nextStateId = randomUUID(),
          eventId = randomUUID();
        eventIds.set(event.key, eventId);
        await tx.query(
          'INSERT INTO ff_life_states(id,user_id,branch_id,sequence_no,effective_at,state,state_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [
            nextStateId,
            job.user_id,
            job.branch_id,
            index + 1,
            event.effectiveAt,
            JSON.stringify(event.stateAfter),
            hash(event.stateAfter),
          ],
        );
        await tx.query(
          'INSERT INTO ff_events(id,user_id,branch_id,sequence_no,event_key,effective_at,canon,state_before_id,state_after_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            eventId,
            job.user_id,
            job.branch_id,
            index + 1,
            event.key,
            event.effectiveAt,
            JSON.stringify(event),
            stateId,
            nextStateId,
          ],
        );
        stateId = nextStateId;
        if (event.decision) {
          const decisionId = randomUUID();
          await tx.query(
            'INSERT INTO ff_decisions(id,user_id,branch_id,event_id,prompt) VALUES($1,$2,$3,$4,$5)',
            [
              decisionId,
              job.user_id,
              job.branch_id,
              eventId,
              event.decision.prompt,
            ],
          );
          for (const option of event.decision.options)
            await tx.query(
              'INSERT INTO ff_decision_options(id,user_id,decision_id,option_key,payload) VALUES($1,$2,$3,$4,$5)',
              [
                randomUUID(),
                job.user_id,
                decisionId,
                option.key,
                JSON.stringify(option),
              ],
            );
        }
      }
      for (const chapter of chapters.chapters) {
        const chapterId = randomUUID();
        await tx.query(
          'INSERT INTO ff_chapters(id,user_id,branch_id,chapter_no,payload) VALUES($1,$2,$3,$4,$5)',
          [
            chapterId,
            job.user_id,
            job.branch_id,
            chapter.chapterNo,
            JSON.stringify(chapter),
          ],
        );
        for (const key of new Set(chapter.eventKeys))
          await tx.query(
            'INSERT INTO ff_chapter_events(chapter_id,event_id) VALUES($1,$2)',
            [chapterId, eventIds.get(key)],
          );
      }
      for (const receipt of receipts)
        await tx.query(
          'INSERT INTO ff_ai_runs(id,user_id,job_id,metadata) VALUES($1,$2,$3,$4)',
          [randomUUID(), job.user_id, job.id, JSON.stringify(receipt)],
        );
      await tx.query("UPDATE ff_branches SET status='completed' WHERE id=$1", [
        job.branch_id,
      ]);
      if (job.job_type === 'future')
        await tx.query(
          "UPDATE ff_futures SET status='completed',title=$2 WHERE root_branch_id=$1",
          [job.branch_id, title],
        );
      await tx.query(
        "UPDATE ff_jobs SET status='completed',stage='COMPLETED',checkpoints='{}',lease_token=NULL,lease_until=NULL,completed_at=now() WHERE id=$1",
        [job.id],
      );
    });
  }
  async fail(job: Job, error: unknown) {
    const code = error instanceof DomainError ? error.code : 'JOB_FAILED';
    const message =
      error instanceof DomainError
        ? error.message
        : 'A generálás megszakadt. Próbálj új jövőt létrehozni.';
    const failed = await this.db.query(
      "UPDATE ff_jobs SET status='failed',error_code=$3,error_message_safe=$4,lease_token=NULL,lease_until=NULL,completed_at=now() WHERE id=$1 AND lease_token=$2 RETURNING id",
      [job.id, job.lease_token, code, message],
    );
    if (failed.length) {
      await this.db.query(
        "UPDATE ff_branches SET status='failed' WHERE id=$1",
        [job.branch_id],
      );
      if (job.job_type === 'future')
        await this.db.query(
          "UPDATE ff_futures SET status='failed' WHERE root_branch_id=$1",
          [job.branch_id],
        );
    }
  }
}
