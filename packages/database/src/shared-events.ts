import { randomUUID } from 'node:crypto';
import {
  sharedIntentRequestSchema,
  sharedDecisionEnvelopeSchema,
  sharedEventCandidateSchema,
  sharedPolicySchema,
  type SharedDecisionRules,
  type SharedIntent,
  type SharedState,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  validateSharedEventCandidate,
  applySharedChanges,
  openSharedDecision,
  resolveSharedDecision,
  sharedMemoryImpact,
  sharedTimeAnchor,
} from '@future-flow/core';
import type { Database } from './index';
import {
  SharedContextRepository,
  type SharedContextRow,
  type SharedMemberRow,
} from './shared-contexts';
import { projectSharedEvent, type SharedCanonRow } from './shared-canon';
import { projectMemoryImpact, sharedPrivacyForEvents } from './shared-privacy';

function fail(code: string, status = 409): never {
  throw new DomainError(code, code, status);
}
export class SharedEventRepository extends SharedContextRepository {
  constructor(
    db: Database,
    inviteSecret?: string,
    protected readonly clock: () => Date = () => new Date(),
  ) {
    super(db, inviteSecret);
  }
  protected async members(tx: Database, contextId: string) {
    return tx.query<SharedMemberRow>(
      'SELECT * FROM aw_shared_members WHERE context_id=$1 ORDER BY id',
      [contextId],
    );
  }
  protected async engineMutation<T>(
    userId: string,
    contextId: string,
    scope: string,
    key: string,
    input: unknown,
    run: (
      tx: Database,
      c: SharedContextRow,
      m: SharedMemberRow,
      all: SharedMemberRow[],
    ) => Promise<T>,
  ) {
    await this.member(this.db, userId, contextId, true);
    const userIds = await this.users(contextId);
    return this.once(userId, userIds, scope, key, input, async (tx) => {
      const c = await this.context(tx, contextId, true),
        m = await this.member(tx, userId, contextId, true),
        all = await this.members(tx, contextId);
      if (c.moderation_hold) fail('SHARED_MODERATION_HOLD', 403);
      // A join after the preliminary snapshot requires a retry, never user locks after context.
      if (
        all.some(
          (x) =>
            ['active', 'paused_entitlement'].includes(x.status) &&
            x.user_id &&
            !userIds.includes(x.user_id),
        )
      )
        fail('SHARED_REVISION_CONFLICT');
      if (c.type !== 'friend_group')
        fail('SHARED_CONTEXT_TYPE_NOT_ALLOWED', 403);
      await this.entitlement(tx, userId, c.type, false, m.entitlement_mode);
      return run(tx, c, m, all);
    });
  }
  protected async eligible(
    tx: Database,
    c: SharedContextRow,
    all: SharedMemberRow[],
    ids: string[],
    resolvedEventAt?: string,
    advanceAnchor = false,
  ) {
    const dates: string[] = [];
    for (const member of all.filter((m) => ids.includes(m.id))) {
      if (member.status !== 'active' || !member.user_id || !member.branch_id)
        fail('SHARED_MEMBER_INACTIVE', 403);
      await this.entitlement(
        tx,
        member.user_id,
        c.type,
        false,
        member.entitlement_mode,
      );
      const [b] = await tx.query(
        "SELECT b.status,b.state->>'effectiveAt' AS effective_at,l.content_locale FROM aw_branches b JOIN aw_lives l ON l.id=b.life_id WHERE b.id=$1 AND b.user_id=$2 AND b.life_id=$3",
        [member.branch_id, member.user_id, member.life_id],
      );
      if (
        !b ||
        b.content_locale !== 'en' ||
        !(
          resolvedEventAt
            ? ['ready', 'decision', 'generating', 'failed']
            : ['ready', 'decision']
        ).includes(String(b.status))
      )
        fail('SHARED_MEMBER_INACTIVE', 403);
      if (resolvedEventAt) {
        // A wall-clock response can arrive after a personal six-month chapter.
        // The immutable event remains at its original date; learning is deferred.
        if (
          String(b.effective_at) < resolvedEventAt &&
          String(b.effective_at).slice(0, 7) !== resolvedEventAt.slice(0, 7)
        )
          fail('SHARED_TIME_MISMATCH');
      } else dates.push(String(b.effective_at));
    }
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = all.find((m) => m.id === ids[i]),
          b = all.find((m) => m.id === ids[j]);
        if (a?.user_id && b?.user_id)
          await this.blocked(tx, a.user_id, b.user_id);
      }
    if (resolvedEventAt) return c.simulation_at;
    const anchor = sharedTimeAnchor(c.simulation_at, dates);
    if (!advanceAnchor && anchor !== c.simulation_at)
      fail('SHARED_TIME_MISMATCH');
    return anchor;
  }
  private async event(
    tx: Database,
    contextId: string,
    eventId: string,
  ): Promise<SharedCanonRow> {
    const [row] = await tx.query<SharedCanonRow>(
      'SELECT e.*,e.effective_at::text FROM aw_shared_events e WHERE context_id=$1 AND id=$2 FOR UPDATE',
      [contextId, eventId],
    );
    if (!row) fail('SHARED_CONTEXT_NOT_FOUND', 404);
    return row!;
  }
  // Internal server boundary only. There is deliberately no HTTP fixture/candidate endpoint.
  // S2 will call the transaction-level commit only after verified job lease and revision.
  async commitCandidate(
    userId: string,
    contextId: string,
    raw: unknown,
    key: string,
    rules?: SharedDecisionRules,
  ) {
    const candidate = sharedEventCandidateSchema.parse(raw);
    return this.engineMutation(
      userId,
      contextId,
      'shared:event:' + contextId,
      key,
      { candidate, rules },
      async (tx, c, _m, all) => {
        return this.commitCandidateTx(tx, c, all, candidate, rules);
      },
    );
  }
  protected async commitCandidateTx(
    tx: Database,
    c: SharedContextRow,
    all: SharedMemberRow[],
    candidate: SharedCanonRow['candidate'],
    rules?: SharedDecisionRules,
    jobId: string | null = null,
  ) {
    this.revision(c, candidate.baseRevision);
    this.writable(c);
    if (c.status !== 'active') fail('SHARED_MEMBER_INACTIVE', 403);
    if (
      (
        await tx.query(
          "SELECT id FROM aw_shared_jobs WHERE context_id=$1 AND status IN ('queued','running') AND ($2::uuid IS NULL OR id<>$2)",
          [c.id, jobId],
        )
      ).length
    )
      fail('SHARED_GENERATION_ACTIVE');
    const valid = validateSharedEventCandidate(
      candidate,
      {
        id: c.id,
        revision: c.revision,
        simulationAt: c.simulation_at,
        state: c.state,
        governance: sharedPolicySchema.parse(c.governance),
      },
      all,
      rules,
    );
    await this.eligible(tx, c, all, valid.participantMemberIds);
    if (
      (
        await tx.query('SELECT id FROM aw_shared_events WHERE id=$1', [
          valid.eventId,
        ])
      ).length
    )
      fail('SHARED_CANDIDATE_INVALID', 422);
    const [sequence] = await tx.query(
      'SELECT coalesce(max(sequence),0)+1 AS next FROM aw_shared_events WHERE context_id=$1',
      [c.id],
    );
    const state = applySharedChanges(c.state, valid.sharedChanges),
      decision = valid.decision
        ? openSharedDecision(valid, rules!, this.clock())
        : null;
    const canonHash = hash({
      candidate: valid,
      stateBefore: c.state,
      stateAfter: state,
      decision,
    });
    await tx.query(
      'INSERT INTO aw_shared_events(id,context_id,sequence,base_revision,effective_at,candidate,state_before,state_after_event,decision,canon_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [
        valid.eventId,
        c.id,
        Number(sequence!.next),
        c.revision,
        valid.effectiveAt,
        JSON.stringify(valid),
        JSON.stringify(c.state),
        JSON.stringify(state),
        decision ? JSON.stringify(decision) : null,
        canonHash,
      ],
    );
    for (const id of valid.participantMemberIds) {
      const member = all.find((m) => m.id === id)!;
      await tx.query(
        'INSERT INTO aw_shared_event_participants(event_id,member_id,context_id,participation_role) VALUES($1,$2,$3,$4)',
        [valid.eventId, id, c.id, member.world_role],
      );
      if (!decision) await this.memory(tx, valid, member, null, null);
    }
    await tx.query(
      'UPDATE aw_shared_contexts SET state=$2,pending_event_id=$3,revision=revision+1,updated_at=now() WHERE id=$1',
      [c.id, JSON.stringify(state), decision ? valid.eventId : null],
    );
    return {
      contextId: c.id,
      eventId: valid.eventId,
      revision: c.revision + 1,
      canonHash,
      pendingDecision: !!decision,
    };
  }
  private async memory(
    tx: Database,
    candidate: SharedCanonRow['candidate'],
    member: SharedMemberRow,
    resolutionId: string | null,
    optionId: string | null,
  ) {
    const payload = sharedMemoryImpact(
        candidate,
        member.id,
        resolutionId,
        optionId,
        member.world_role,
      ),
      digest = hash(payload);
    await tx.query(
      "INSERT INTO aw_shared_impacts(id,context_id,event_id,resolution_id,member_id,target_branch_id,effective_at,kind,payload,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,'memory_only',$8,$9) ON CONFLICT(event_id,member_id,kind,payload_hash) DO NOTHING",
      [
        randomUUID(),
        candidate.contextId,
        candidate.eventId,
        resolutionId,
        member.id,
        member.branch_id,
        candidate.effectiveAt,
        JSON.stringify(payload),
        digest,
      ],
    );
  }
  private async resolve(
    tx: Database,
    c: SharedContextRow,
    event: SharedCanonRow,
    all: SharedMemberRow[],
    now: Date,
  ) {
    const [old] = await tx.query(
      'SELECT id FROM aw_shared_resolutions WHERE event_id=$1',
      [event.id],
    );
    if (old)
      return {
        resolutionId: String(old.id),
        revision: c.revision,
        status: 'closed',
      };
    if (c.pending_event_id !== event.id || event.decision === null)
      fail('SHARED_DECISION_CLOSED');
    const envelope = sharedDecisionEnvelopeSchema.parse(event.decision);
    const intents: SharedIntent[] = (
      await tx.query(
        'SELECT member_id,option_id,payload FROM aw_shared_intents WHERE event_id=$1 ORDER BY member_id',
        [event.id],
      )
    ).map((i) => ({
      memberId: String(i.member_id),
      optionId: String(i.option_id),
      submittedAt: String((i.payload as { submittedAt: string }).submittedAt),
    }));
    const result = resolveSharedDecision(envelope, intents, all, now);
    if (result.status === 'waiting' || result.status === 'unresolved')
      return {
        resolutionId: null,
        revision: c.revision,
        status: result.status,
      };
    // Recheck all affected accounts/tier/date/block before deriving personal impacts.
    if (result.status === 'resolved')
      await this.eligible(
        tx,
        c,
        all,
        result.participatingMemberIds,
        event.effective_at,
      );
    const next: SharedState = c.state; // Opt-in does not merge competing option sharedChanges.
    const resolutionId = randomUUID();
    await tx.query(
      'INSERT INTO aw_shared_resolutions(id,event_id,context_id,policy,result,state_before,state_after,canon_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        resolutionId,
        event.id,
        c.id,
        JSON.stringify(envelope.decision.policy),
        JSON.stringify(result),
        JSON.stringify(c.state),
        JSON.stringify(next),
        hash({
          eventId: event.id,
          result,
          stateBefore: c.state,
          stateAfter: next,
        }),
      ],
    );
    for (const id of result.participatingMemberIds) {
      const member = all.find((m) => m.id === id)!,
        intent = result.responses.find((i) => i.memberId === id)!;
      await this.memory(
        tx,
        event.candidate,
        member,
        resolutionId,
        intent.optionId,
      );
    }
    await tx.query(
      'UPDATE aw_shared_contexts SET state=$2,pending_event_id=NULL,revision=revision+1,updated_at=now() WHERE id=$1',
      [c.id, JSON.stringify(next)],
    );
    return { resolutionId, revision: c.revision + 1, status: result.status };
  }
  async submitIntent(
    userId: string,
    contextId: string,
    eventId: string,
    raw: unknown,
    key: string,
  ) {
    const input = sharedIntentRequestSchema.parse(raw);
    return this.engineMutation(
      userId,
      contextId,
      'shared:intent:' + contextId + ':' + eventId,
      key,
      input,
      async (tx, c, m, all) => {
        this.revision(c, input.contextRevision);
        const event = await this.event(tx, c.id, eventId);
        if (c.pending_event_id !== event.id || event.decision === null)
          fail('SHARED_DECISION_CLOSED');
        const envelope = sharedDecisionEnvelopeSchema.parse(event.decision),
          now = this.clock();
        if (
          envelope.closesAt !== null &&
          now.getTime() >= Date.parse(envelope.closesAt)
        )
          fail('SHARED_DECISION_CLOSED');
        if (
          !envelope.decision.eligibleMemberIds.includes(m.id) ||
          !envelope.decision.options.some((o) => o.id === input.optionId)
        )
          fail('SHARED_INTENT_NOT_ELIGIBLE', 403);
        if (
          (
            await tx.query(
              'SELECT id FROM aw_shared_intents WHERE event_id=$1 AND member_id=$2',
              [event.id, m.id],
            )
          ).length
        )
          fail('SHARED_INTENT_ALREADY_SUBMITTED');
        await this.eligible(tx, c, all, [m.id], event.effective_at);
        const intent = {
          memberId: m.id,
          optionId: input.optionId,
          submittedAt: now.toISOString(),
        };
        await tx.query(
          'INSERT INTO aw_shared_intents(id,event_id,member_id,option_id,payload) VALUES($1,$2,$3,$4,$5)',
          [
            randomUUID(),
            event.id,
            m.id,
            input.optionId,
            JSON.stringify(intent),
          ],
        );
        await tx.query(
          'UPDATE aw_shared_contexts SET revision=revision+1,updated_at=now() WHERE id=$1',
          [c.id],
        );
        c.revision++;
        const resolved = await this.resolve(tx, c, event, all, now);
        return {
          contextId: c.id,
          eventId: event.id,
          optionId: input.optionId,
          ...resolved,
        };
      },
    );
  }
  async resolvePending(
    userId: string,
    contextId: string,
    eventId: string,
    expected: number,
    key: string,
  ) {
    return this.engineMutation(
      userId,
      contextId,
      'shared:resolve:' + contextId + ':' + eventId,
      key,
      { contextRevision: expected },
      async (tx, c, _m, all) => {
        this.revision(c, expected);
        return {
          contextId: c.id,
          eventId,
          ...(await this.resolve(
            tx,
            c,
            await this.event(tx, c.id, eventId),
            all,
            this.clock(),
          )),
        };
      },
    );
  }
  async events(userId: string, contextId: string) {
    return this.db.transaction(async (tx) => {
      await this.active(tx, [userId]);
      await this.context(tx, contextId, true);
      const own = await this.member(tx, userId, contextId);
      const rows = await tx.query<SharedCanonRow>(
        'SELECT e.*,e.effective_at::text FROM aw_shared_events e WHERE context_id=$1 ORDER BY sequence DESC LIMIT 100',
        [contextId],
      );
      const events = [];
      for (const row of rows)
        events.push(await projectSharedEvent(tx, row, own.id));
      return events;
    });
  }
  async pendingImpacts(userId: string, branchId: string) {
    return this.db.transaction(async (tx) => {
      await this.active(tx, [userId]);
      if (
        !(
          await tx.query(
            'SELECT id FROM aw_branches WHERE id=$1 AND user_id=$2',
            [branchId, userId],
          )
        ).length
      )
        fail('RESOURCE_NOT_FOUND', 404);
      const rows = await tx.query(
        "SELECT i.id,i.event_id,i.resolution_id,i.context_id,i.effective_at::text,i.kind,i.payload,i.status FROM aw_shared_impacts i JOIN aw_shared_members m ON m.id=i.member_id WHERE i.target_branch_id=$1 AND m.user_id=$2 AND i.status='pending' ORDER BY i.effective_at,i.created_at,i.id",
        [branchId, userId],
      );
      const privacy = await sharedPrivacyForEvents(
        tx,
        rows.map((r) => String(r.event_id)),
      );
      return rows.map((r) =>
        privacy.has(String(r.event_id))
          ? {
              ...r,
              payload: projectMemoryImpact(
                r.payload,
                privacy.get(String(r.event_id)),
              ),
              privacyRedacted: true,
            }
          : r,
      );
    });
  }
}
