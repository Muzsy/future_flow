import { randomUUID } from 'node:crypto';
import {
  OFFICIAL_LIFE_SOURCE_VERSION,
  officialLifeStartRequestSchema,
  officialLifeGrantRequestSchema,
  officialLifeRevokeRequestSchema,
  officialLifeEvidenceSchema,
  officialLifeReceiptSchema,
  officialLifeSourceViewSchema,
  publicationBindingSchema,
  periodCandidateV2Schema,
  lifeStateV2Schema,
  type OfficialLifeEvidence,
  type OfficialLifeReceipt,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  officialLifeInvalid,
  validateOfficialLifePeriod,
  preparePublicContentScanInput,
  applyFactChangesV2,
} from '@future-flow/core';
import type { Database } from './index';
import { LifeRepository, lifeRow, type LifePeriodInput } from './lives';
import { ScenarioRepository } from './public-scenarios';
import { ScenarioReleaseRepository } from './scenario-release';
import { PublicContentRepository } from './public-content';
import { PublicContentCurationRepository } from './public-content-curation';

export function officialLifeOperatorEnabledFromEnv(
  env: NodeJS.ProcessEnv = process.env,
) {
  const flag = env.OFFICIAL_LIFE_OPERATOR_ENABLED ?? 'false';
  if (!['true', 'false'].includes(flag))
    throw Error('Invalid Official life operator flag');
  return flag === 'true';
}
type Start = Record<string, unknown> & {
  life_id: string;
  branch_id: string;
  scenario_version_id: string;
  scenario_grant_id: string;
  initial_job_id: string;
  template_hash: string;
  initial_input_hash: string;
};
type Grant = Record<string, unknown> & {
  id: string;
  user_id: string;
  bundle_id: string;
  content_hash: string;
  status: string;
  evidence: OfficialLifeEvidence;
  evidence_hash: string;
  request_hash: string;
  revoke_reason: string | null;
  revoke_actor: string | null;
};
type Period = Record<string, unknown> & {
  id: string;
  branch_id: string;
  life_id: string;
  base_revision: number;
  candidate: unknown;
  chapter: unknown;
  events: unknown;
  start_state: unknown;
  end_state: unknown;
  accepted_before: unknown;
  canon_hash: string;
  position: number;
};
type Job = Record<string, unknown> & {
  id: string;
  payload: LifePeriodInput;
  checkpoints: Record<string, unknown>;
  status: string;
  base_revision: number;
};
export class OfficialLifeRepository {
  constructor(
    private readonly db: Database,
    private readonly enabled = false,
    private readonly limits = { daily: 10, concurrent: 2 },
  ) {}
  private operator() {
    if (!this.enabled)
      throw new DomainError(
        'OFFICIAL_LIFE_DISABLED',
        'Trusted Official life operator opt-in required.',
        403,
      );
  }
  private async owner(tx: Database, userId: string) {
    const user = lifeRow(
      await tx.query('SELECT status FROM ff_users WHERE id=$1 FOR UPDATE', [
        userId,
      ]),
    );
    if (user.status !== 'active')
      throw new DomainError('ACCOUNT_DELETING', 'Account is deleting.', 403);
    if (
      !(
        await tx.query(
          "SELECT id FROM ff_consents WHERE user_id=$1 AND policy_version='alpha-privacy-v1' AND consent_type='adult_and_ai_acknowledgement'",
          [userId],
        )
      ).length
    )
      throw new DomainError(
        'PRIVACY_ACKNOWLEDGEMENT_REQUIRED',
        'Consent required.',
        403,
      );
  }
  // Must run before any life/job exists. A normal/private start is never retroactively upgraded.
  async start(userId: string, raw: unknown, key: string) {
    this.operator();
    const request = officialLifeStartRequestSchema.parse(raw);
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key))
      throw new DomainError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Request key required.',
        400,
      );
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      const source = await new ScenarioReleaseRepository(tx).get(
        userId,
        request.scenarioVersionId,
      );
      if (
        !source.sourceGrant?.usable ||
        source.sourceGrant.id !== request.scenarioGrantId ||
        source.templateHash !== request.templateHash
      )
        throw officialLifeInvalid();
      const [prior] = await tx.query<{
        input_hash: string;
        response: { lifeId: string; branchId: string; jobId: string };
      }>(
        'SELECT input_hash,response FROM ff_idempotency WHERE user_id=$1 AND scope=$2 AND key=$3',
        [userId, 'official-life:start', key],
      );
      if (prior) {
        if (prior.input_hash !== hash(request))
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'Request key conflict.',
            409,
          );
        return prior.response;
      }
      // Independent private scope prevents collision with a previously used normal scenario key.
      const created = await new ScenarioRepository(tx, true, this.limits).start(
        userId,
        request.scenarioVersionId,
        { templateHash: request.templateHash, acknowledged: true },
        randomUUID(),
      );
      const [life] = await tx.query<{ input: unknown; root_branch_id: string }>(
        'SELECT input,root_branch_id FROM aw_lives WHERE id=$1 AND user_id=$2',
        [created.lifeId, userId],
      );
      if (!life || life.root_branch_id !== created.branchId)
        throw officialLifeInvalid();
      await tx.query(
        'INSERT INTO aw_official_life_starts(life_id,user_id,branch_id,scenario_version_id,scenario_grant_id,initial_job_id,template_hash,initial_input_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          created.lifeId,
          userId,
          created.branchId,
          request.scenarioVersionId,
          request.scenarioGrantId,
          created.jobId,
          request.templateHash,
          hash(life.input),
        ],
      );
      await tx.query(
        'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5)',
        [userId, 'official-life:start', key, hash(request), created],
      );
      return created;
    });
  }
  private async accounted(
    tx: Database,
    userId: string,
    jobId: string,
    receipts: OfficialLifeReceipt[],
  ) {
    const rows = await tx.query<{
      task: string;
      model: string;
      status: string;
      input_tokens: number;
      output_tokens: number;
      accounted_micro: number;
    }>(
      'SELECT task,model,status,input_tokens,output_tokens,accounted_micro FROM aw_budget_reservations WHERE user_id=$1 AND job_id=$2',
      [userId, jobId],
    );
    if (
      rows.length !== receipts.length ||
      rows.some(
        (r) => r.status !== 'completed' || Number(r.accounted_micro) <= 0,
      )
    )
      throw officialLifeInvalid();
    const keys = rows
      .map((r) =>
        hash([
          r.task,
          r.model,
          Number(r.input_tokens),
          Number(r.output_tokens),
        ]),
      )
      .sort();
    if (
      hash(keys) !==
      hash(
        receipts
          .map((r) => hash([r.task, r.model, r.inputTokens, r.outputTokens]))
          .sort(),
      )
    )
      throw officialLifeInvalid();
  }
  private async evidence(tx: Database, userId: string, bundleId: string) {
    await this.owner(tx, userId);
    // Owner -> scenario -> source branch order is shared with prospective start.
    const [draft] = await tx.query<{ branch_id: string; life_id: string }>(
      'SELECT d.branch_id,d.life_id FROM aw_public_content_bundles c JOIN aw_publication_drafts d ON d.id=c.draft_id AND d.user_id=c.user_id WHERE c.id=$1 AND c.user_id=$2',
      [bundleId, userId],
    );
    if (!draft) throw new DomainError('NOT_FOUND', 'Not found.', 404);
    const [start] = await tx.query<Start>(
      'SELECT * FROM aw_official_life_starts WHERE life_id=$1 AND branch_id=$2 AND user_id=$3',
      [draft.life_id, draft.branch_id, userId],
    );
    if (!start) throw officialLifeInvalid();
    const source = await new ScenarioReleaseRepository(tx).get(
      userId,
      start.scenario_version_id,
    );
    if (
      !source.sourceGrant?.usable ||
      source.sourceGrant.id !== start.scenario_grant_id ||
      source.templateHash !== start.template_hash
    )
      throw officialLifeInvalid();
    const branch = await new LifeRepository(tx).branch(
      userId,
      draft.branch_id,
      tx,
      true,
    );
    if (
      branch.parent_branch_id ||
      branch.input.locale !== 'en' ||
      branch.input.identity.mode !== 'alternate' ||
      branch.input.identity.baseProfileVersionId !== null ||
      hash(branch.input) !== start.initial_input_hash
    )
      throw officialLifeInvalid();
    const [root] = await tx.query<{ root_branch_id: string }>(
      'SELECT root_branch_id FROM aw_lives WHERE id=$1 AND user_id=$2',
      [draft.life_id, userId],
    );
    if (root?.root_branch_id !== draft.branch_id) throw officialLifeInvalid();
    if (
      (
        await tx.query(
          'SELECT id FROM aw_shared_personal_memories WHERE user_id=$1 AND branch_id=$2 LIMIT 1',
          [userId, draft.branch_id],
        )
      ).length
    )
      throw officialLifeInvalid();
    const bundle = await new PublicContentRepository(tx).get(userId, bundleId);
    const curation = await new PublicContentCurationRepository(tx).get(
      userId,
      bundleId,
    );
    if (!curation.eligible || curation.curation?.status !== 'content_reviewed')
      throw officialLifeInvalid();
    const binding = publicationBindingSchema.parse({
      bundleId,
      contentHash: bundle.contentHash,
      sourceRevision: bundle.sourceRevision,
      reviewId: curation.reviewId,
      reviewHash: curation.reviewHash,
      policyVersion: curation.policyVersion,
      curationId: curation.curation.id,
      curationVersion: curation.curationVersion,
    });
    const history = await tx.query<Period>(
      'SELECT p.*,h.position FROM aw_history h JOIN aw_periods p ON p.id=h.period_id AND p.user_id=h.user_id WHERE h.branch_id=$1 AND h.user_id=$2 ORDER BY h.position',
      [draft.branch_id, userId],
    );
    if (
      history.length !== bundle.content.snapshot.periods.length ||
      history.length < 1 ||
      history.length > 20
    )
      throw officialLifeInvalid();
    const periods: OfficialLifeEvidence['periods'] = [];
    const requestIds = new Set<string>();
    const choices = await tx.query<{
      period_id: string;
      decision_id: string;
      option_id: string;
      payload: unknown;
      state_after: unknown;
    }>(
      'SELECT period_id,decision_id,option_id,payload,state_after FROM aw_choices WHERE branch_id=$1 AND user_id=$2 ORDER BY created_at,id',
      [draft.branch_id, userId],
    );
    let expectedState = branch.input.initialState;
    let expectedRevision = 0;
    const accepted: string[] = [];
    let appliedChoices = 0;
    for (const [index, p] of history.entries()) {
      if (p.branch_id !== draft.branch_id || p.position !== index + 1)
        throw officialLifeInvalid();
      if (
        p.base_revision !== expectedRevision ||
        hash(p.start_state) !== hash(expectedState) ||
        hash(p.accepted_before) !== hash(accepted)
      )
        throw officialLifeInvalid();
      const jobs = await tx.query<Job>(
        "SELECT * FROM aw_jobs WHERE user_id=$1 AND branch_id=$2 AND status='completed' AND payload->>'periodId'=$3",
        [userId, draft.branch_id, p.id],
      );
      if (jobs.length !== 1) throw officialLifeInvalid();
      const job = jobs[0]!;
      if (
        job.base_revision !== p.base_revision ||
        hash(job.payload.input) !== start.initial_input_hash ||
        (index === 0 &&
          (job.id !== start.initial_job_id ||
            p.base_revision !== 0 ||
            hash(p.start_state) !== hash(branch.input.initialState)))
      )
        throw officialLifeInvalid();
      const runs = await tx.query<{ metadata: unknown }>(
        'SELECT metadata FROM aw_ai_runs WHERE user_id=$1 AND job_id=$2 ORDER BY created_at,id',
        [userId, job.id],
      );
      // Receipts from one completion share a timestamp; preserve generation order by task and accepted hashes,
      // rather than random row UUIDs. Persisted receipt array order is added for all new completions below.
      const receiptOrder = job.checkpoints.receiptOrder;
      if (!Array.isArray(receiptOrder) || receiptOrder.length !== runs.length)
        throw officialLifeInvalid();
      const receipts = receiptOrder.map((digest) => {
        const matching = runs.filter((r) => hash(r.metadata) === digest);
        if (matching.length !== 1) throw officialLifeInvalid();
        return matching[0]!.metadata;
      });
      const checked = validateOfficialLifePeriod(
        job.payload,
        p,
        receipts,
        job.checkpoints.generationBinding,
      );
      const canon = periodCandidateV2Schema.parse(p.candidate);
      const decision = canon.events.at(-1)!.decision!;
      const matchingChoices = choices.filter((c) => c.period_id === p.id);
      if (matchingChoices.length > 1) throw officialLifeInvalid();
      // validateOfficialLifePeriod has already verified this stored end state against the domain canon.
      expectedState = lifeStateV2Schema.parse(p.end_state);
      expectedRevision++;
      if (matchingChoices.length) {
        const choice = matchingChoices[0]!;
        const option = decision.options.find((o) => o.id === choice.option_id);
        if (
          choice.decision_id !== decision.id ||
          !option ||
          hash(option) !== hash(choice.payload)
        )
          throw officialLifeInvalid();
        accepted.push(decision.id);
        expectedState = applyFactChangesV2(
          expectedState,
          option.changes,
          expectedState.effectiveAt,
          option.preconditions,
          branch.input.constraints,
          {
            lifeId: draft.life_id,
            branchId: draft.branch_id,
            acceptedDecisionIds: accepted,
          },
        ).state;
        if (hash(expectedState) !== hash(choice.state_after))
          throw officialLifeInvalid();
        expectedRevision++;
        appliedChoices++;
      } else if (index !== history.length - 1) throw officialLifeInvalid();
      for (const r of checked.receipts) {
        if (requestIds.has(r.requestId)) throw officialLifeInvalid();
        requestIds.add(r.requestId);
      }
      await this.accounted(tx, userId, job.id, checked.receipts);
      periods.push({
        periodId: p.id,
        jobId: job.id,
        position: p.position,
        ...checked,
      });
    }
    if (
      appliedChoices !== choices.length ||
      expectedRevision !== branch.revision ||
      hash(expectedState) !== hash(branch.state) ||
      hash(accepted) !== hash(branch.accepted_decision_ids)
    )
      throw officialLifeInvalid();
    const [review] = await tx.query<{ receipt: unknown }>(
      'SELECT receipt FROM aw_public_content_reviews WHERE id=$1 AND user_id=$2 AND status=$3',
      [binding.reviewId, userId, 'completed'],
    );
    const parsed = officialLifeReceiptSchema.safeParse(review?.receipt);
    if (!parsed.success) throw officialLifeInvalid();
    const receipt = parsed.data;
    if (
      receipt.task !== 'public_content_review' ||
      receipt.promptVersion !== 'public_content_review.v1.en' ||
      receipt.inputHash !==
        hash(preparePublicContentScanInput(bundle.content)) ||
      receipt.outputHash !== binding.reviewHash ||
      requestIds.has(receipt.requestId)
    )
      throw officialLifeInvalid();
    await this.accounted(tx, userId, binding.reviewId, [receipt]);
    const evidence = officialLifeEvidenceSchema.parse({
      sourceVersion: OFFICIAL_LIFE_SOURCE_VERSION,
      lifeId: draft.life_id,
      branchId: draft.branch_id,
      scenarioVersionId: start.scenario_version_id,
      scenarioGrantId: start.scenario_grant_id,
      templateHash: start.template_hash,
      initialInputHash: start.initial_input_hash,
      choicesHash: hash(choices),
      binding,
      periods,
      reviewReceipt: receipt,
    });
    return { evidence, evidenceHash: hash(evidence), bundle };
  }
  private view(
    bundleId: string,
    contentHash: string,
    g?: Grant,
    usable = false,
  ) {
    if (
      g &&
      (hash(officialLifeEvidenceSchema.parse(g.evidence)) !== g.evidence_hash ||
        g.bundle_id !== bundleId ||
        g.content_hash !== contentHash ||
        g.evidence.binding.contentHash !== contentHash)
    )
      throw officialLifeInvalid();
    return officialLifeSourceViewSchema.parse({
      sourceVersion: OFFICIAL_LIFE_SOURCE_VERSION,
      bundleId,
      contentHash,
      publicationApproved: false,
      grant: g
        ? {
            id: g.id,
            status: g.status,
            evidenceHash: g.evidence_hash,
            usable: usable && g.status === 'active',
          }
        : null,
    });
  }
  async inspect(userId: string, bundleId: string) {
    this.operator();
    return this.db.transaction(async (tx) => {
      const inspected = await this.evidence(tx, userId, bundleId);
      const [grant] = await tx.query<Grant>(
        'SELECT * FROM aw_official_life_sources WHERE bundle_id=$1 AND user_id=$2',
        [bundleId, userId],
      );
      if (grant && grant.evidence_hash !== inspected.evidenceHash)
        throw officialLifeInvalid();
      return {
        ...inspected,
        view: this.view(bundleId, inspected.bundle.contentHash, grant, true),
      };
    });
  }
  async grant(userId: string, raw: unknown) {
    this.operator();
    const request = officialLifeGrantRequestSchema.parse(raw);
    return this.db.transaction(async (tx) => {
      const inspected = await this.evidence(
        tx,
        userId,
        request.binding.bundleId,
      );
      if (
        hash(request.binding) !== hash(inspected.evidence.binding) ||
        request.evidenceHash !== inspected.evidenceHash
      )
        throw officialLifeInvalid();
      const [old] = await tx.query<Grant>(
        'SELECT * FROM aw_official_life_sources WHERE bundle_id=$1 AND user_id=$2',
        [request.binding.bundleId, userId],
      );
      if (old) {
        if (old.request_hash !== hash(request)) throw officialLifeInvalid();
        return this.view(old.bundle_id, old.content_hash, old, true); // Never resurrect a revoked grant.
      }
      const [created] = await tx.query<Grant>(
        'INSERT INTO aw_official_life_sources(id,user_id,life_id,branch_id,bundle_id,curation_id,source_version,content_hash,evidence,evidence_hash,request_hash,actor_label) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
        [
          randomUUID(),
          userId,
          inspected.evidence.lifeId,
          inspected.evidence.branchId,
          request.binding.bundleId,
          request.binding.curationId,
          OFFICIAL_LIFE_SOURCE_VERSION,
          request.binding.contentHash,
          inspected.evidence,
          inspected.evidenceHash,
          hash(request),
          request.actorLabel,
        ],
      );
      return this.view(
        request.binding.bundleId,
        request.binding.contentHash,
        created,
        true,
      );
    });
  }
  async revoke(userId: string, raw: unknown) {
    this.operator();
    const request = officialLifeRevokeRequestSchema.parse(raw);
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      const g = lifeRow(
        await tx.query<Grant>(
          'SELECT * FROM aw_official_life_sources WHERE id=$1 AND user_id=$2 FOR UPDATE',
          [request.grantId, userId],
        ),
      );
      if (g.content_hash !== request.contentHash) throw officialLifeInvalid();
      if (g.status === 'revoked') {
        if (
          g.revoke_reason !== request.reasonCode ||
          g.revoke_actor !== request.actorLabel
        )
          throw officialLifeInvalid();
        return this.view(g.bundle_id, g.content_hash, g);
      }
      const [revoked] = await tx.query<Grant>(
        "UPDATE aw_official_life_sources SET status='revoked',revoked_at=now(),revoke_reason=$1,revoke_actor=$2 WHERE id=$3 RETURNING *",
        [request.reasonCode, request.actorLabel, g.id],
      );
      return this.view(g.bundle_id, g.content_hash, revoked);
    });
  }
}
