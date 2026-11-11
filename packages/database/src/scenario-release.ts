import { randomUUID } from 'node:crypto';
import {
  SCENARIO_REVIEW_VERSION,
  SCENARIO_CURATION_VERSION,
  OFFICIAL_SCENARIO_SOURCE_VERSION,
  scenarioReviewRequestSchema,
  scenarioReviewReceiptSchema,
  scenarioReleaseViewSchema,
  scenarioCurationDecisionSchema,
  officialScenarioSourceRequestSchema,
  officialScenarioSourceRevokeSchema,
  type ScenarioTemplate,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  prepareScenarioReviewInput,
  validateScenarioReviewReport,
} from '@future-flow/core';
import type { Database } from './index';
import { lifeRow } from './lives';
import { publicReviewLimits } from './public-review-limits';

export type ScenarioReleaseConfig = {
  operatorEnabled: boolean;
  daily: number;
  projectUsd: number;
  userUsd: number;
};
const disabled: ScenarioReleaseConfig = {
  operatorEnabled: false,
  daily: 5,
  projectUsd: 0,
  userUsd: 0,
};
export function scenarioReleaseConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ScenarioReleaseConfig {
  const flag = env.SCENARIO_RELEASE_OPERATOR_ENABLED ?? 'false';
  if (!['true', 'false'].includes(flag))
    throw Error('Invalid scenario operator flag');
  const result = {
    operatorEnabled: flag === 'true',
    daily: Number(env.PUBLIC_REVIEW_DAILY_LIMIT ?? 5),
    projectUsd: Number(env.AI_PROJECT_BUDGET_USD ?? 0),
    userUsd: Number(env.AI_USER_BUDGET_USD ?? 0),
  };
  validateConfig(result);
  return result;
}
function validateConfig(c: ScenarioReleaseConfig) {
  if (
    !Number.isInteger(c.daily) ||
    c.daily < 1 ||
    c.daily > 100 ||
    [c.projectUsd, c.userUsd].some(
      (v) => !Number.isFinite(v) || v < 0 || v > 100000,
    )
  )
    throw Error('Invalid scenario release configuration');
}
type Source = Record<string, unknown> & {
  id: string;
  user_id: string;
  scenario_id: string;
  version: number;
  current_version: number;
  template: ScenarioTemplate;
  template_hash: string;
};
type Review = Record<string, unknown> & {
  id: string;
  user_id: string;
  scenario_version_id: string;
  template_hash: string;
  input_hash: string;
  policy_version: string;
  status: string;
  lease_token: string | null;
  lease_until: Date | null;
  report: unknown;
  report_hash: string | null;
  receipt: unknown;
};
type Curation = Record<string, unknown> & {
  id: string;
  review_id: string;
  template_hash: string;
  report_hash: string;
  policy_version: string;
  curation_version: string;
  status: string;
  reason_code: string | null;
  decision_hash: string;
};
type Grant = Record<string, unknown> & {
  id: string;
  curation_id: string;
  template_hash: string;
  source_version: string;
  status: string;
  request_hash: string;
  revoke_reason: string | null;
  revoke_actor: string | null;
};
const invalid = () =>
  new DomainError(
    'SCENARIO_RELEASE_INVALID',
    'Scenario release binding is invalid.',
    409,
  );
export class ScenarioReleaseRepository {
  constructor(
    private readonly db: Database,
    private readonly config: ScenarioReleaseConfig = disabled,
  ) {
    validateConfig(config);
  }
  private operator() {
    if (!this.config.operatorEnabled)
      throw new DomainError(
        'SCENARIO_RELEASE_DISABLED',
        'Trusted scenario operator opt-in required.',
        403,
      );
  }
  private async source(
    tx: Database,
    userId: string,
    versionId: string,
    current = false,
  ) {
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
    const row = lifeRow(
      await tx.query<Source>(
        'SELECT v.*,s.current_version FROM aw_scenario_versions v JOIN aw_scenarios s ON s.id=v.scenario_id AND s.user_id=v.user_id WHERE v.id=$1 AND v.user_id=$2 FOR UPDATE OF s',
        [versionId, userId],
      ),
    );
    const input = prepareScenarioReviewInput(row.template);
    if (row.template_hash !== hash(input.template)) throw invalid();
    if (current && row.version !== row.current_version)
      throw new DomainError(
        'SCENARIO_RELEASE_STALE',
        'Review requires the current template version.',
        409,
      );
    return { row, input };
  }
  private validateReview(
    r: Review,
    source: Awaited<ReturnType<ScenarioReleaseRepository['source']>>,
  ) {
    if (
      r.scenario_version_id !== source.row.id ||
      r.template_hash !== source.row.template_hash ||
      r.input_hash !== hash(source.input) ||
      r.policy_version !== SCENARIO_REVIEW_VERSION
    )
      throw invalid();
    if (r.status === 'completed') {
      const report = validateScenarioReviewReport(
          r.report,
          source.row.template,
        ),
        receipt = scenarioReviewReceiptSchema.parse(r.receipt);
      if (
        hash(report) !== r.report_hash ||
        receipt.inputHash !== r.input_hash ||
        receipt.outputHash !== r.report_hash
      )
        throw invalid();
    }
  }
  private async evidence(tx: Database, r: Review) {
    if (r.status !== 'completed') return false;
    const receipt = scenarioReviewReceiptSchema.parse(r.receipt);
    if (
      !receipt.requestId ||
      receipt.inputTokens < 1 ||
      receipt.outputTokens < 1
    )
      return false;
    const rows = await tx.query<{
      model: string;
      status: string;
      input_tokens: number;
      output_tokens: number;
    }>(
      "SELECT model,status,input_tokens,output_tokens FROM aw_budget_reservations WHERE user_id=$1 AND job_id=$2 AND task='scenario_review'",
      [r.user_id, r.id],
    );
    return (
      rows.length === 1 &&
      rows[0]!.status === 'completed' &&
      rows[0]!.model === receipt.model &&
      Number(rows[0]!.input_tokens) === receipt.inputTokens &&
      Number(rows[0]!.output_tokens) === receipt.outputTokens
    );
  }
  private async state(
    tx: Database,
    userId: string,
    versionId: string,
    current = false,
  ) {
    const source = await this.source(tx, userId, versionId, current);
    await publicReviewLimits(tx, userId);
    const [review] = await tx.query<Review>(
      'SELECT * FROM aw_scenario_reviews WHERE user_id=$1 AND scenario_version_id=$2 AND policy_version=$3',
      [userId, versionId, SCENARIO_REVIEW_VERSION],
    );
    if (review) this.validateReview(review, source);
    const [curation] = await tx.query<Curation>(
      'SELECT * FROM aw_scenario_curations WHERE user_id=$1 AND scenario_version_id=$2 AND curation_version=$3',
      [userId, versionId, SCENARIO_CURATION_VERSION],
    );
    if (
      curation &&
      (!review ||
        review.status !== 'completed' ||
        curation.review_id !== review.id ||
        curation.template_hash !== source.row.template_hash ||
        curation.report_hash !== review.report_hash ||
        curation.policy_version !== SCENARIO_REVIEW_VERSION)
    )
      throw invalid();
    const [grant] = await tx.query<Grant>(
      'SELECT * FROM aw_official_scenario_sources WHERE user_id=$1 AND scenario_version_id=$2 AND source_version=$3',
      [userId, versionId, OFFICIAL_SCENARIO_SOURCE_VERSION],
    );
    if (
      grant &&
      (!curation ||
        curation.status !== 'scenario_reviewed' ||
        grant.curation_id !== curation.id ||
        grant.template_hash !== source.row.template_hash)
    )
      throw invalid();
    const proved = review ? await this.evidence(tx, review) : false;
    const view = scenarioReleaseViewSchema.parse({
      scenarioVersionId: versionId,
      templateHash: source.row.template_hash,
      policyVersion: SCENARIO_REVIEW_VERSION,
      current: source.row.version === source.row.current_version,
      publicationApproved: false,
      officialLifeApproved: false,
      review: review
        ? {
            id: review.id,
            status: review.status,
            report: review.report,
            reportHash: review.report_hash,
            providerEvidence: proved,
          }
        : null,
      curation: curation
        ? {
            id: curation.id,
            status: curation.status,
            curationVersion: SCENARIO_CURATION_VERSION,
            reasonCode: curation.reason_code,
          }
        : null,
      sourceGrant: grant
        ? {
            id: grant.id,
            sourceVersion: OFFICIAL_SCENARIO_SOURCE_VERSION,
            status: grant.status,
            usable:
              grant.status === 'active' &&
              source.row.version === source.row.current_version &&
              proved,
          }
        : null,
    });
    return { source, review, curation, grant, proved, view };
  }
  async get(userId: string, versionId: string) {
    return this.db.transaction(
      async (tx) => (await this.state(tx, userId, versionId)).view,
    );
  }
  async inspect(userId: string, versionId: string) {
    this.operator();
    return this.db.transaction(async (tx) => {
      const s = await this.state(tx, userId, versionId);
      return {
        view: s.view,
        template: s.source.row.template,
        input: s.source.input,
      };
    });
  }
  async start(userId: string, raw: unknown) {
    this.operator();
    const request = scenarioReviewRequestSchema.parse(raw);
    return this.db.transaction(async (tx) => {
      const s = await this.state(tx, userId, request.scenarioVersionId, true);
      if (request.templateHash !== s.source.row.template_hash) throw invalid();
      if (s.review) {
        if (s.review.status === 'completed')
          return {
            reviewId: s.review.id,
            leaseToken: null,
            reused: true,
            input: s.source.input,
          };
        throw new DomainError(
          'SCENARIO_REVIEW_ALREADY_STARTED',
          'An interrupted or completed attempt is never retried. Create a new template version.',
          409,
        );
      }
      if (this.config.projectUsd === 0 || this.config.userUsd === 0)
        throw new DomainError(
          'AI_BUDGET_EXCEEDED',
          'Scenario review spending is disabled.',
          503,
        );
      const limits = await publicReviewLimits(tx, userId);
      if (
        Number(limits.daily) >= this.config.daily ||
        Number(limits.concurrent) >= 1
      )
        throw new DomainError(
          'PUBLIC_REVIEW_LIMIT',
          'Review limit reached.',
          429,
        );
      const reviewId = randomUUID(),
        leaseToken = randomUUID();
      await tx.query(
        "INSERT INTO aw_scenario_reviews(id,user_id,scenario_version_id,template_hash,input_hash,policy_version,status,lease_token,lease_until) VALUES($1,$2,$3,$4,$5,$6,'running',$7,now()+interval '180 seconds')",
        [
          reviewId,
          userId,
          request.scenarioVersionId,
          request.templateHash,
          hash(s.source.input),
          SCENARIO_REVIEW_VERSION,
          leaseToken,
        ],
      );
      return { reviewId, leaseToken, reused: false, input: s.source.input };
    });
  }
  async complete(
    userId: string,
    versionId: string,
    reviewId: string,
    leaseToken: string,
    rawReport: unknown,
    rawReceipt: unknown,
  ) {
    this.operator();
    return this.db.transaction(async (tx) => {
      const s = await this.state(tx, userId, versionId, true),
        r = s.review;
      if (!r || r.id !== reviewId) throw invalid();
      const report = validateScenarioReviewReport(
          rawReport,
          s.source.row.template,
        ),
        receipt = scenarioReviewReceiptSchema.parse(rawReceipt);
      if (
        receipt.inputHash !== r.input_hash ||
        receipt.outputHash !== hash(report)
      )
        throw invalid();
      if (r.status === 'completed') {
        if (r.report_hash !== hash(report) || hash(r.receipt) !== hash(receipt))
          throw invalid();
        return s.view;
      }
      if (r.status !== 'running' || r.lease_token !== leaseToken)
        throw new DomainError(
          'SCENARIO_REVIEW_INTERRUPTED',
          'This attempt cannot commit.',
          409,
        );
      await tx.query(
        "UPDATE aw_scenario_reviews SET status='completed',lease_token=NULL,lease_until=NULL,report=$1,report_hash=$2,receipt=$3,finished_at=now() WHERE id=$4",
        [report, hash(report), receipt, reviewId],
      );
      return (await this.state(tx, userId, versionId)).view;
    });
  }
  async fail(userId: string, reviewId: string, leaseToken: string) {
    this.operator();
    await this.db.transaction(async (tx) => {
      await tx.query('SELECT id FROM ff_users WHERE id=$1 FOR UPDATE', [
        userId,
      ]);
      await tx.query(
        "UPDATE aw_scenario_reviews SET status='failed',lease_token=NULL,lease_until=NULL,finished_at=now() WHERE user_id=$1 AND id=$2 AND lease_token=$3 AND status='running'",
        [userId, reviewId, leaseToken],
      );
    });
  }
  private decisionBound(
    s: Awaited<ReturnType<ScenarioReleaseRepository['state']>>,
    r: { templateHash: string; reviewId: string; reportHash: string },
  ) {
    if (
      !s.review ||
      s.review.status !== 'completed' ||
      s.view.review?.report?.verdict !== 'no_findings' ||
      r.templateHash !== s.source.row.template_hash ||
      r.reviewId !== s.review.id ||
      r.reportHash !== s.review.report_hash
    )
      throw invalid();
  }
  async decide(raw: unknown) {
    this.operator();
    const request = scenarioCurationDecisionSchema.parse(raw);
    const [owner] = await this.db.query<{ user_id: string }>(
      'SELECT user_id FROM aw_scenario_versions WHERE id=$1',
      [request.scenarioVersionId],
    );
    if (!owner) throw invalid();
    return this.db.transaction(async (tx) => {
      const s = await this.state(
        tx,
        owner.user_id,
        request.scenarioVersionId,
        true,
      );
      this.decisionBound(s, request);
      if (s.curation) {
        if (s.curation.decision_hash !== hash(request)) throw invalid();
        return s.view;
      }
      await tx.query(
        'INSERT INTO aw_scenario_curations(id,user_id,scenario_version_id,review_id,template_hash,report_hash,policy_version,curation_version,status,reason_code,actor_label,decision_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
        [
          randomUUID(),
          owner.user_id,
          request.scenarioVersionId,
          request.reviewId,
          request.templateHash,
          request.reportHash,
          request.policyVersion,
          request.curationVersion,
          request.status,
          request.reasonCode,
          request.actorLabel,
          hash(request),
        ],
      );
      return (await this.state(tx, owner.user_id, request.scenarioVersionId))
        .view;
    });
  }
  async grant(raw: unknown) {
    this.operator();
    const request = officialScenarioSourceRequestSchema.parse(raw);
    const [owner] = await this.db.query<{ user_id: string }>(
      'SELECT user_id FROM aw_scenario_versions WHERE id=$1',
      [request.scenarioVersionId],
    );
    if (!owner) throw invalid();
    return this.db.transaction(async (tx) => {
      const s = await this.state(
        tx,
        owner.user_id,
        request.scenarioVersionId,
        true,
      );
      this.decisionBound(s, request);
      if (
        !s.curation ||
        s.curation.id !== request.curationId ||
        s.curation.status !== 'scenario_reviewed' ||
        !s.proved
      )
        throw new DomainError(
          'OFFICIAL_SCENARIO_EVIDENCE_REQUIRED',
          'A separate complete curation and accounted provider evidence are required.',
          409,
        );
      if (s.grant) {
        if (s.grant.request_hash !== hash(request)) throw invalid();
        return s.view; // A replay never reactivates a revoked grant.
      }
      await tx.query(
        'INSERT INTO aw_official_scenario_sources(id,user_id,scenario_version_id,curation_id,source_version,template_hash,request_hash,actor_label) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          randomUUID(),
          owner.user_id,
          request.scenarioVersionId,
          request.curationId,
          request.sourceVersion,
          request.templateHash,
          hash(request),
          request.actorLabel,
        ],
      );
      return (await this.state(tx, owner.user_id, request.scenarioVersionId))
        .view;
    });
  }
  async revoke(raw: unknown) {
    this.operator();
    const request = officialScenarioSourceRevokeSchema.parse(raw);
    const [owner] = await this.db.query<{
      user_id: string;
      scenario_version_id: string;
    }>(
      'SELECT user_id,scenario_version_id FROM aw_official_scenario_sources WHERE id=$1',
      [request.grantId],
    );
    if (!owner) throw invalid();
    return this.db.transaction(async (tx) => {
      const s = await this.state(tx, owner.user_id, owner.scenario_version_id),
        g = s.grant;
      if (
        !g ||
        g.id !== request.grantId ||
        g.template_hash !== request.templateHash
      )
        throw invalid();
      if (g.status === 'revoked') {
        if (
          g.revoke_reason !== request.reasonCode ||
          g.revoke_actor !== request.actorLabel
        )
          throw invalid();
        return s.view;
      }
      await tx.query(
        "UPDATE aw_official_scenario_sources SET status='revoked',revoked_at=now(),revoke_reason=$1,revoke_actor=$2 WHERE id=$3",
        [request.reasonCode, request.actorLabel, g.id],
      );
      return (await this.state(tx, owner.user_id, owner.scenario_version_id))
        .view;
    });
  }
  async pending() {
    this.operator();
    const rows = await this.db.query<{
      user_id: string;
      scenario_version_id: string;
    }>(
      "SELECT r.user_id,r.scenario_version_id FROM aw_scenario_reviews r LEFT JOIN aw_scenario_curations c ON c.review_id=r.id WHERE r.status='completed' AND c.id IS NULL ORDER BY r.created_at LIMIT 100",
    );
    const result = [];
    for (const r of rows) {
      try {
        const s = await this.inspect(r.user_id, r.scenario_version_id);
        if (s.view.current && s.view.review?.report?.verdict === 'no_findings')
          result.push(s);
      } catch (e) {
        if (!(e instanceof DomainError)) throw e;
        result.push({ unavailable: true, code: e.code });
      }
    }
    return result;
  }
}
