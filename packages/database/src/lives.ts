import { randomUUID } from 'node:crypto';
import { deletedLifeAdmissionSql } from './life-deletion';
import {
  LIFE_CONTRACT_VERSION,
  lifeSetupV2Schema,
  lifeDraftV2Schema,
  lifeInteractionV2Schema,
  lifeStateV2Schema,
  periodCandidateV2Schema,
  publicForkInitialChoiceSchema,
  supportedLocales,
  type LifeInputV2,
  type LifeSetupV2,
  type LifeStateV2,
  type PeriodCandidateV2,
  type LifePeriodInput,
  type Locale,
} from '@future-flow/contracts';
import {
  DomainError,
  addMonths,
  applyFactChangesV2,
  hash,
  validateLifeInputV2,
  type instantiateForkCheckpoint,
} from '@future-flow/core';
import type { Database } from './index';
import { activitySession } from './beta';
import {
  inheritSharedMemories,
  materializeSharedMemories,
  personalSharedMemories,
} from './shared-personal';
import {
  personalPrivacyEventIds,
  privacyJobMetadataPresent,
} from './shared-privacy';

type Row = Record<string, unknown>;
export type LifeBranch = Row & {
  id: string;
  user_id: string;
  life_id: string;
  revision: number;
  state: LifeStateV2;
  accepted_decision_ids: string[];
  pending_decision: PeriodCandidateV2['events'][number]['decision'];
  status: 'ready' | 'generating' | 'decision' | 'failed';
  input: LifeInputV2;
};
export type { LifePeriodInput } from '@future-flow/contracts';
export function lifeRow<T>(rows: T[]): T {
  if (!rows[0])
    throw new DomainError('RESOURCE_NOT_FOUND', 'Resource not found.', 404);
  return rows[0];
}
export function buildLifeInput(
  setup: LifeSetupV2,
  startDate: string,
): LifeInputV2 {
  const lifeId = randomUUID(),
    branchId = randomUUID(),
    goalId = randomUUID();
  return validateLifeInputV2({
    schemaVersion: LIFE_CONTRACT_VERSION,
    locale: setup.locale,
    lifeId,
    branchId,
    identity: { ...setup.identity, baseProfileVersionId: null },
    environment: {
      version: 'hu-neutral-v2',
      description:
        'Fictional neutral context; no economic forecast. Location is the supplied state. Optional user context: ' +
        (setup.context ?? ''),
    },
    goals: [{ ...setup.goal, id: goalId, priority: 'primary' }],
    initialState: {
      schemaVersion: LIFE_CONTRACT_VERSION,
      effectiveAt: startDate,
      employment: setup.employment,
      location: setup.location,
      finance: setup.finance,
      ownedAssets: [],
      actors: setup.relationships.map((actor) => ({
        ...actor,
        id: randomUUID(),
      })),
      skills: setup.skills,
      goals: [{ goalId, status: 'active', note: null }],
      opportunities: [],
      resources: setup.resources,
    },
    constraints: setup.stayInCountry
      ? [
          {
            id: randomUUID(),
            lifeId,
            branchId: null,
            description: 'Stay in the starting country.',
            strength: 'hard',
            validFrom: startDate,
            validUntil: null,
            endsOnDecisionId: null,
            predicate: { type: 'country_is', value: setup.location.country },
          },
        ]
      : [],
    visibility: 'private',
  });
}

export class LifeRepository {
  async interaction(userId: string, raw: unknown) {
    const input = lifeInteractionV2Schema.parse(raw);
    return this.db.transaction(async (tx) => {
      await this.lock(tx, userId);
      if (input.branchId) await this.branch(userId, input.branchId, tx);
      else if (input.kind !== 'onboarding_started')
        throw new DomainError('RESOURCE_NOT_FOUND', 'Branch required.', 404);
      if (
        input.periodId &&
        !(
          await tx.query(
            'SELECT period_id FROM aw_history WHERE branch_id=$1 AND user_id=$2 AND period_id=$3',
            [input.branchId, userId, input.periodId],
          )
        ).length
      )
        throw new DomainError(
          'RESOURCE_NOT_FOUND',
          'Chapter unavailable.',
          404,
        );
      const existing = (
        await tx.query(
          'SELECT user_id,branch_id,session_id,kind,period_id FROM aw_interactions WHERE id=$1',
          [input.eventId],
        )
      )[0];
      if (existing) {
        if (
          existing.user_id !== userId ||
          existing.branch_id !== input.branchId ||
          existing.session_id !== input.sessionId ||
          existing.kind !== input.kind ||
          existing.period_id !== (input.periodId ?? null)
        )
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'Interaction identifier reused.',
            409,
          );
        return { recorded: true };
      }
      const session = await activitySession(tx, userId, input.sessionId);
      await tx.query(
        'INSERT INTO aw_interactions(id,user_id,branch_id,session_id,kind,period_id,activity_session_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          input.eventId,
          userId,
          input.branchId,
          input.sessionId,
          input.kind,
          input.periodId ?? null,
          session,
        ],
      );
      return { recorded: true };
    });
  }
  constructor(
    public readonly db: Database,
    private readonly limits = { daily: 10, concurrent: 2 },
  ) {
    if (
      ![limits.daily, limits.concurrent].every(
        (n) => Number.isInteger(n) && n > 0,
      )
    )
      throw new DomainError(
        'GENERATION_LIMIT_CONFIG',
        'Invalid generation limits.',
      );
  }
  private async lock(tx: Database, userId: string) {
    const user = lifeRow(
      await tx.query('SELECT status FROM ff_users WHERE id=$1 FOR UPDATE', [
        userId,
      ]),
    );
    if (user.status !== 'active')
      throw new DomainError(
        'ACCOUNT_DELETING',
        'Account is being deleted.',
        403,
      );
    const consent = await tx.query(
      "SELECT id FROM ff_consents WHERE user_id=$1 AND policy_version='alpha-privacy-v1' AND consent_type='adult_and_ai_acknowledgement'",
      [userId],
    );
    if (!consent.length)
      throw new DomainError(
        'PRIVACY_ACKNOWLEDGEMENT_REQUIRED',
        'Consent required.',
        403,
      );
  }
  private async once<T>(
    userId: string,
    scope: string,
    key: string,
    input: unknown,
    run: (tx: Database) => Promise<T>,
  ): Promise<T> {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key))
      throw new DomainError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Request key required.',
        400,
      );
    return this.db.transaction(async (tx) => {
      await this.lock(tx, userId);
      const old = (
        await tx.query<Row & { input_hash: string; response: T }>(
          'SELECT input_hash,response FROM ff_idempotency WHERE user_id=$1 AND scope=$2 AND key=$3',
          [userId, scope, key],
        )
      )[0];
      if (old) {
        if (old.input_hash !== hash(input))
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'Request key conflict.',
            409,
          );
        return old.response;
      }
      const result = await run(tx);
      await tx.query(
        'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5)',
        [userId, scope, key, hash(input), JSON.stringify(result)],
      );
      return result;
    });
  }
  private revision(branch: LifeBranch, expected: number) {
    if (branch.revision !== expected)
      throw new DomainError(
        'LIFE_REVISION_CONFLICT',
        'Reload the current life.',
        409,
      );
  }
  async branch(
    userId: string,
    branchId: string,
    tx = this.db,
    lock = false,
  ): Promise<LifeBranch> {
    return lifeRow(
      await tx.query<LifeBranch>(
        `SELECT b.*,l.input,l.content_locale FROM aw_branches b JOIN aw_lives l ON l.id=b.life_id AND l.user_id=b.user_id WHERE b.id=$1 AND b.user_id=$2 ${lock ? 'FOR UPDATE OF b' : ''}`,
        [branchId, userId],
      ),
    );
  }
  async list(userId: string, locales: readonly Locale[] = supportedLocales) {
    return this.db.query(
      `SELECT l.id,l.title,l.content_locale,l.root_branch_id,l.created_at,b.revision,b.status FROM aw_lives l JOIN aw_branches b ON b.id=l.root_branch_id WHERE l.user_id=$1 AND l.content_locale=ANY($2::text[]) ORDER BY l.created_at DESC LIMIT 100`,
      [userId, [...locales]],
    );
  }
  async detail(userId: string, branchId: string) {
    const branch = await this.branch(userId, branchId);
    const periods = await this.db.query(
      `SELECT p.*,h.position,p.branch_id<>$1 AS inherited FROM aw_history h JOIN aw_periods p ON p.id=h.period_id AND p.user_id=h.user_id WHERE h.branch_id=$1 AND h.user_id=$2 ORDER BY h.position`,
      [branchId, userId],
    );
    return {
      branch,
      initialChoice: await this.initialChoice(userId, branch.life_id),
      periods,
      branches: await this.db.query(
        'SELECT id,name,parent_branch_id,status FROM aw_branches WHERE life_id=$1 AND user_id=$2 ORDER BY created_at',
        [branch.life_id, userId],
      ),
      choices: await this.db.query(
        'SELECT decision_id,option_id,payload,state_after FROM aw_choices WHERE branch_id=$1 AND user_id=$2 ORDER BY created_at',
        [branchId, userId],
      ),
      job:
        (
          await this.db.query(
            'SELECT id,status,stage,error_code,attempt,checkpoints FROM aw_jobs WHERE branch_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 1',
            [branchId, userId],
          )
        )[0] ?? null,
    };
  }
  async draft(userId: string) {
    return (
      (
        await this.db.query(
          'SELECT revision,payload FROM aw_drafts WHERE user_id=$1',
          [userId],
        )
      )[0] ?? { revision: 0, payload: null }
    );
  }
  async saveDraft(userId: string, revision: number, raw: unknown) {
    const payload = lifeDraftV2Schema.parse(raw);
    return this.db.transaction(async (tx) => {
      await this.lock(tx, userId);
      const current = (
        await tx.query('SELECT revision FROM aw_drafts WHERE user_id=$1', [
          userId,
        ])
      )[0];
      if (Number(current?.revision ?? 0) !== revision)
        throw new DomainError('LIFE_REVISION_CONFLICT', 'Draft changed.', 409);
      await tx.query(
        'INSERT INTO aw_drafts(user_id,revision,payload) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_at=now()',
        [userId, revision + 1, JSON.stringify(payload)],
      );
      return { revision: revision + 1 };
    });
  }
  async create(userId: string, raw: unknown, key: string) {
    const setup = lifeSetupV2Schema.parse(raw);
    return this.once(userId, 'v2:create', key, setup, async (tx) => {
      const input = buildLifeInput(
        setup,
        new Date().toISOString().slice(0, 10),
      );
      return this.persistPrepared(tx, userId, input);
    });
  }
  // Trusted server-side templates only; never exposed as an arbitrary input API.
  async createPrepared(userId: string, raw: unknown, key: string) {
    const input = validateLifeInputV2(raw);
    return this.once(userId, 'v2:prepared-create', key, input, (tx) =>
      this.persistPrepared(tx, userId, input),
    );
  }
  // Trusted materialized public checkpoint only. The browser never supplies this DTO.
  async createPreparedFork(
    userId: string,
    raw: ReturnType<typeof instantiateForkCheckpoint>,
    key: string,
  ) {
    const input = validateLifeInputV2(raw.input),
      stateBefore = lifeStateV2Schema.parse(raw.stateBefore),
      decision = periodCandidateV2Schema.shape.events.element.shape.decision
        .unwrap()
        .parse(raw.decision),
      option = decision.options.find((o) => o.id === raw.choice.optionId);
    if (
      input.locale !== 'en' ||
      !option ||
      decision.id !== raw.choice.decisionId ||
      stateBefore.effectiveAt !== input.initialState.effectiveAt
    )
      throw new DomainError(
        'PUBLIC_FORK_START_CONFLICT',
        'Invalid initial choice.',
        409,
      );
    const state = applyFactChangesV2(
      stateBefore,
      option.changes,
      stateBefore.effectiveAt,
      option.preconditions,
      input.constraints,
      {
        lifeId: input.lifeId,
        branchId: input.branchId,
        acceptedDecisionIds: [decision.id],
      },
    ).state;
    if (hash(state) !== hash(input.initialState))
      throw new DomainError(
        'PUBLIC_FORK_START_CONFLICT',
        'Initial choice was not applied exactly once.',
        409,
      );
    const initial = { stateBefore, decision, option };
    return this.once(
      userId,
      'v2:prepared-public-fork',
      key,
      { input, ...initial },
      (tx) => this.persistPrepared(tx, userId, input, initial),
    );
  }
  private async initialChoice(userId: string, lifeId: string) {
    const [storage] = await this.db.query(
      "SELECT to_regclass('public.aw_initial_choices') IS NOT NULL AS present",
    );
    if (!storage?.present) return null;
    const [choice] = await this.db.query<{
      decision_id: string;
      option_id: string;
      prompt: string;
      payload: { label: string; description: string };
      created_at: Date;
    }>(
      'SELECT decision_id,option_id,prompt,payload,created_at FROM aw_initial_choices WHERE life_id=$1 AND user_id=$2',
      [lifeId, userId],
    );
    return choice
      ? publicForkInitialChoiceSchema.parse({
          decisionId: choice.decision_id,
          optionId: choice.option_id,
          prompt: choice.prompt,
          label: choice.payload.label,
          description: choice.payload.description,
          chosenAt: new Date(choice.created_at).toISOString(),
        })
      : null;
  }
  private async persistPrepared(
    tx: Database,
    userId: string,
    input: LifeInputV2,
    initial?: {
      stateBefore: LifeStateV2;
      decision: NonNullable<LifeBranch['pending_decision']>;
      option: NonNullable<LifeBranch['pending_decision']>['options'][number];
    },
  ) {
    await tx.query(
      'INSERT INTO aw_lives(id,user_id,title,content_locale,input,root_branch_id) VALUES($1,$2,$3,$4,$5,$6)',
      [
        input.lifeId,
        userId,
        input.goals.find((goal) => goal.priority === 'primary')!.description,
        input.locale,
        JSON.stringify(input),
        input.branchId,
      ],
    );
    await tx.query(
      'INSERT INTO aw_branches(id,user_id,life_id,name,state,accepted_decision_ids) VALUES($1,$2,$3,$4,$5,$6)',
      [
        input.branchId,
        userId,
        input.lifeId,
        input.locale === 'hu' ? 'Az életem' : 'My life',
        JSON.stringify(input.initialState),
        JSON.stringify(initial ? [initial.decision.id] : []),
      ],
    );
    if (initial)
      await tx.query(
        'INSERT INTO aw_initial_choices(user_id,life_id,branch_id,decision_id,option_id,prompt,payload,state_before,state_after) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          userId,
          input.lifeId,
          input.branchId,
          initial.decision.id,
          initial.option.id,
          initial.decision.prompt,
          JSON.stringify(initial.option),
          JSON.stringify(initial.stateBefore),
          JSON.stringify(input.initialState),
        ],
      );
    return this.queue(
      tx,
      userId,
      await this.branch(userId, input.branchId, tx),
    );
  }
  private async queue(tx: Database, userId: string, branch: LifeBranch) {
    if (branch.pending_decision)
      throw new DomainError(
        'LIFE_PENDING_DECISION',
        'Choose before continuing.',
        409,
      );
    if (branch.status === 'generating')
      throw new DomainError(
        'LIFE_GENERATION_ACTIVE',
        'Generation already active.',
        409,
      );
    const counts = lifeRow(
      await tx.query(
        `SELECT count(*) FILTER(WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS daily,count(*) FILTER(WHERE status IN ('queued','running','validating'))::int AS concurrent FROM (SELECT status,created_at FROM ff_jobs WHERE user_id=$1 UNION ALL SELECT status,created_at FROM aw_jobs WHERE user_id=$1 ${await deletedLifeAdmissionSql(tx, 'generation')}) q`,
        [userId],
      ),
    );
    if (
      Number(counts.daily) >= this.limits.daily ||
      Number(counts.concurrent) >= this.limits.concurrent
    )
      throw new DomainError('GENERATION_LIMIT', 'Generation limit.', 429);
    const history = await tx.query<Row & { events: unknown[] }>(
      'SELECT p.events FROM aw_history h JOIN aw_periods p ON p.id=h.period_id WHERE h.branch_id=$1 AND h.user_id=$2 ORDER BY h.position DESC LIMIT 2',
      [branch.id, userId],
    );
    const [initialChoiceStorage] = await tx.query(
      "SELECT to_regclass('public.aw_initial_choices') IS NOT NULL AS present",
    );
    const choices = await tx.query(
      `SELECT decision_id,payload FROM (SELECT decision_id,payload,created_at FROM aw_choices WHERE branch_id=$1 AND user_id=$2 ${initialChoiceStorage?.present ? 'UNION ALL SELECT decision_id,payload,created_at FROM aw_initial_choices WHERE life_id=$3 AND user_id=$2' : ''}) q ORDER BY created_at DESC LIMIT 10`,
      initialChoiceStorage?.present
        ? [branch.id, userId, branch.life_id]
        : [branch.id, userId],
    );
    const state = lifeStateV2Schema.parse(branch.state);
    const sharedEvents = await personalSharedMemories(
      tx,
      userId,
      branch.id,
      state.effectiveAt,
    );
    const privacyIds = await personalPrivacyEventIds(
      tx,
      userId,
      branch.id,
      state.effectiveAt,
    );
    const payload: LifePeriodInput = {
      input: { ...branch.input, branchId: branch.id },
      state,
      revision: branch.revision,
      periodId: randomUUID(),
      startDate: state.effectiveAt,
      endDate: addMonths(state.effectiveAt, 6),
      durationMonths: 6,
      acceptedDecisionIds: branch.accepted_decision_ids,
      memory: {
        recentEvents: history
          .reverse()
          .flatMap((period) => period.events)
          .map((event) => {
            const e = event as {
              id: string;
              title: string;
              summary: string;
              effectiveAt: string;
            };
            return {
              id: e.id,
              title: privacyIds.length
                ? 'Personal event (details withheld)'
                : e.title,
              summary: privacyIds.length
                ? 'Recorded personal history. Some narrative details are withheld; the current personal state remains authoritative.'
                : e.summary,
              effectiveAt: e.effectiveAt,
            };
          }),
        choices: privacyIds.length ? [] : choices.reverse(),
        ...(sharedEvents.length ? { sharedEvents } : {}),
      },
    };
    const jobId = randomUUID();
    const metadata = await privacyJobMetadataPresent(tx);
    await tx.query(
      `INSERT INTO aw_jobs(id,user_id,life_id,branch_id,base_revision,payload${metadata ? ',shared_privacy_event_ids' : ''}) VALUES($1,$2,$3,$4,$5,$6${metadata ? ',$7' : ''})`,
      [
        jobId,
        userId,
        branch.life_id,
        branch.id,
        branch.revision,
        JSON.stringify(payload),
        ...(metadata ? [privacyIds] : []),
      ],
    );
    await tx.query(
      "UPDATE aw_branches SET status='generating' WHERE id=$1 AND user_id=$2",
      [branch.id, userId],
    );
    await this.metric(
      tx,
      branch,
      branch.revision === 0 ? 'life_created' : 'continuation_requested',
    );
    return {
      lifeId: branch.life_id,
      branchId: branch.id,
      jobId,
      status: 'queued',
    };
  }
  async continue(
    userId: string,
    branchId: string,
    revision: number,
    key: string,
    sessionId?: string,
  ) {
    return this.once(
      userId,
      `v2:continue:${branchId}`,
      key,
      { revision, ...(sessionId ? { sessionId } : {}) },
      async (tx) => {
        const branch = await this.branch(userId, branchId, tx, true);
        this.revision(branch, revision);
        if (branch.status !== 'ready')
          throw new DomainError(
            branch.pending_decision
              ? 'LIFE_PENDING_DECISION'
              : 'LIFE_GENERATION_ACTIVE',
            'Life is not ready.',
            409,
          );
        await materializeSharedMemories(tx, branch);
        const queued = await this.queue(tx, userId, branch);
        if (sessionId) {
          const session = await activitySession(tx, userId, sessionId);
          await tx.query(
            'UPDATE aw_jobs SET activity_session_id=$2 WHERE id=$1 AND user_id=$3',
            [queued.jobId, session, userId],
          );
        }
        return queued;
      },
    );
  }
  private async accept(
    tx: Database,
    branch: LifeBranch,
    periodId: string,
    decision: NonNullable<LifeBranch['pending_decision']>,
    optionId: string,
  ) {
    const option = lifeRow(
      decision.options.filter((option) => option.id === optionId),
    );
    const accepted = [...branch.accepted_decision_ids, decision.id];
    const result = applyFactChangesV2(
      branch.state,
      option.changes,
      branch.state.effectiveAt,
      option.preconditions,
      branch.input.constraints,
      {
        lifeId: branch.life_id,
        branchId: branch.id,
        acceptedDecisionIds: accepted,
      },
    );
    await tx.query(
      'INSERT INTO aw_choices(id,user_id,life_id,branch_id,period_id,decision_id,option_id,payload,state_after) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        randomUUID(),
        branch.user_id,
        branch.life_id,
        branch.id,
        periodId,
        decision.id,
        optionId,
        JSON.stringify(option),
        JSON.stringify(result.state),
      ],
    );
    await tx.query(
      "UPDATE aw_branches SET revision=revision+1,state=$3,accepted_decision_ids=$4,pending_decision=NULL,status='ready' WHERE id=$1 AND user_id=$2",
      [
        branch.id,
        branch.user_id,
        JSON.stringify(result.state),
        JSON.stringify(accepted),
      ],
    );
    await this.metric(tx, branch, 'choice_accepted');
  }
  async choose(
    userId: string,
    branchId: string,
    revision: number,
    decisionId: string,
    optionId: string,
    key: string,
  ) {
    return this.once(
      userId,
      `v2:choice:${branchId}`,
      key,
      { revision, decisionId, optionId },
      async (tx) => {
        const branch = await this.branch(userId, branchId, tx, true);
        this.revision(branch, revision);
        if (
          branch.status !== 'decision' ||
          branch.pending_decision?.id !== decisionId
        )
          throw new DomainError(
            'LIFE_PENDING_DECISION',
            'No matching pending decision.',
            409,
          );
        const period = lifeRow(
          await tx.query<Row & { period_id: string }>(
            'SELECT period_id FROM aw_history WHERE branch_id=$1 AND user_id=$2 ORDER BY position DESC LIMIT 1',
            [branchId, userId],
          ),
        );
        await materializeSharedMemories(tx, branch);
        await this.accept(
          tx,
          branch,
          period.period_id,
          branch.pending_decision,
          optionId,
        );
        return { branchId, revision: branch.revision + 1, status: 'ready' };
      },
    );
  }
  async fork(
    userId: string,
    branchId: string,
    periodId: string,
    revision: number,
    optionId: string,
    key: string,
  ) {
    return this.once(
      userId,
      `v2:fork:${branchId}:${periodId}`,
      key,
      { revision, optionId },
      async (tx) => {
        const parent = await this.branch(userId, branchId, tx, true);
        this.revision(parent, revision);
        const p = lifeRow(
          await tx.query<
            Row & {
              candidate: PeriodCandidateV2;
              end_state: LifeStateV2;
              accepted_before: string[];
              position: number;
            }
          >(
            'SELECT p.candidate,p.end_state,p.accepted_before,h.position FROM aw_history h JOIN aw_periods p ON p.id=h.period_id AND p.user_id=h.user_id WHERE h.branch_id=$1 AND h.period_id=$2 AND h.user_id=$3',
            [branchId, periodId, userId],
          ),
        );
        const decision = p.candidate.events.at(-1)!.decision!;
        const option = lifeRow(
          decision.options.filter((o) => o.id === optionId),
        );
        const newId = randomUUID();
        await tx.query(
          "INSERT INTO aw_branches(id,user_id,life_id,parent_branch_id,fork_period_id,name,state,accepted_decision_ids,pending_decision,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'decision')",
          [
            newId,
            userId,
            parent.life_id,
            branchId,
            periodId,
            option.label,
            JSON.stringify(p.end_state),
            JSON.stringify(p.accepted_before),
            JSON.stringify(decision),
          ],
        );
        await tx.query(
          'INSERT INTO aw_history(user_id,life_id,branch_id,period_id,position) SELECT user_id,life_id,$3,period_id,position FROM aw_history WHERE branch_id=$1 AND user_id=$2 AND position <= $4',
          [branchId, userId, newId, p.position],
        );
        await inheritSharedMemories(
          tx,
          userId,
          branchId,
          newId,
          p.position,
          p.end_state.effectiveAt,
        );
        await tx.query(
          'INSERT INTO aw_choices(id,user_id,life_id,branch_id,period_id,decision_id,option_id,payload,state_after) SELECT gen_random_uuid(),user_id,life_id,$3,period_id,decision_id,option_id,payload,state_after FROM aw_choices WHERE branch_id=$1 AND user_id=$2 AND decision_id IN (SELECT jsonb_array_elements_text($4::jsonb)::uuid)',
          [branchId, userId, newId, JSON.stringify(p.accepted_before)],
        );
        await this.accept(
          tx,
          await this.branch(userId, newId, tx),
          periodId,
          decision,
          optionId,
        );
        await this.metric(
          tx,
          await this.branch(userId, newId, tx),
          'historical_fork_created',
        );
        return this.queue(tx, userId, await this.branch(userId, newId, tx));
      },
    );
  }
  async retry(userId: string, jobId: string, revision: number, key: string) {
    return this.once(
      userId,
      `v2:retry:${jobId}`,
      key,
      { revision },
      async (tx) => {
        const job = lifeRow(
          await tx.query<
            Row & {
              branch_id: string;
              status: string;
              attempt: number;
              error_code: string | null;
            }
          >(
            'SELECT branch_id,status,attempt,error_code FROM aw_jobs WHERE id=$1 AND user_id=$2 FOR UPDATE',
            [jobId, userId],
          ),
        );
        const branch = await this.branch(userId, job.branch_id, tx, true);
        this.revision(branch, revision);
        if (
          branch.status === 'failed' &&
          ['failed', 'cancelled'].includes(job.status) &&
          job.error_code === 'SHARED_PRIVACY_CHANGED'
        ) {
          await materializeSharedMemories(tx, branch);
          return this.queue(tx, userId, branch);
        }
        if (
          job.status !== 'failed' ||
          branch.status !== 'failed' ||
          job.attempt >= 5
        )
          throw new DomainError(
            'LIFE_RETRY_UNAVAILABLE',
            'Retry not available.',
            409,
          );
        const [active] = await tx.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM (SELECT status FROM ff_jobs WHERE user_id=$1 UNION ALL SELECT status FROM aw_jobs WHERE user_id=$1) q WHERE status IN ('queued','running','validating')",
          [userId],
        );
        if (Number(active?.count) >= this.limits.concurrent)
          throw new DomainError(
            'GENERATION_LIMIT',
            'Concurrent generation limit reached.',
            429,
          );
        await tx.query(
          "UPDATE aw_jobs SET status='queued',lease_token=NULL,lease_until=NULL,error_code=NULL WHERE id=$1 AND user_id=$2",
          [jobId, userId],
        );
        await tx.query(
          "UPDATE aw_branches SET status='generating' WHERE id=$1 AND user_id=$2",
          [branch.id, userId],
        );
        return {
          lifeId: branch.life_id,
          branchId: branch.id,
          jobId,
          status: 'queued',
        };
      },
    );
  }
  async metric(
    tx: Database,
    branch: Pick<LifeBranch, 'user_id' | 'life_id' | 'id'>,
    kind: string,
  ) {
    await tx.query(
      'INSERT INTO aw_metrics(id,user_id,life_id,branch_id,kind) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(), branch.user_id, branch.life_id, branch.id, kind],
    );
  }
}
