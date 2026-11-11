// Isolated technical evidence only. No real provider call, Official life or seed publication.
import { randomUUID } from 'node:crypto';
import {
  SCENARIO_REVIEW_VERSION,
  SCENARIO_CURATION_VERSION,
  OFFICIAL_SCENARIO_SOURCE_VERSION,
} from '@future-flow/contracts';
import { hash } from '@future-flow/core';
import {
  Repository,
  ScenarioRepository,
  ScenarioReleaseRepository,
  DatabaseAiBudget,
  type Database,
} from '@future-flow/database';
import { scenarioFixture } from './scenario-fixtures';
export const scenarioReleaseTestConfig = {
  operatorEnabled: true,
  daily: 5,
  projectUsd: 5,
  userUsd: 1,
};
export async function scenarioReleaseFixture(
  db: Database,
  owner: string = randomUUID(),
) {
  const repo = new Repository(db);
  await repo.ensureUser(owner);
  await repo.acceptPrivacy(owner);
  const scenarios = new ScenarioRepository(db, true),
    release = new ScenarioReleaseRepository(db, scenarioReleaseTestConfig);
  const version = await scenarios.create(
    owner,
    { template: scenarioFixture() },
    randomUUID(),
  );
  const request = {
    scenarioVersionId: version.id,
    templateHash: version.templateHash,
    policyVersion: SCENARIO_REVIEW_VERSION,
    acknowledged: true,
  };
  return { owner, repo, scenarios, release, version, request };
}
export async function completeScenarioFixture(
  db: Database,
  f: Awaited<ReturnType<typeof scenarioReleaseFixture>>,
  accounted = false,
  verdict: 'no_findings' | 'unable_to_assess' = 'no_findings',
) {
  const started = await f.release.start(f.owner, f.request);
  const report = {
    policyVersion: SCENARIO_REVIEW_VERSION,
    scope: 'complete_scenario_template',
    templateHash: f.version.templateHash,
    publicationApproved: false,
    verdict,
    findings: [],
  };
  const receipt = {
    task: 'scenario_review',
    promptVersion: 'scenario_review.v1.en',
    locale: 'en',
    model: accounted ? 'gpt-6.1-sol' : 'isolated-no-provider',
    requestId: accounted ? 'isolated-technical-receipt' : null,
    inputHash: hash(started.input),
    outputHash: hash(report),
    inputTokens: accounted ? 32 : 0,
    outputTokens: accounted ? 12 : 0,
    latencyMs: 0,
  };
  if (accounted) {
    const budget = new DatabaseAiBudget(
      db,
      f.owner,
      started.reviewId,
      scenarioReleaseTestConfig,
    );
    const reservation = await budget.reserve({
      model: 'gpt-6.1-sol',
      max_output_tokens: 2200,
      text: { format: { name: 'scenario_review' } },
    });
    await budget.settle(reservation, { input_tokens: 32, output_tokens: 12 });
  }
  const view = await f.release.complete(
    f.owner,
    f.version.id,
    started.reviewId,
    started.leaseToken!,
    report,
    receipt,
  );
  return { started, report, receipt, view };
}
export function scenarioDecision(
  f: Awaited<ReturnType<typeof scenarioReleaseFixture>>,
  view: Awaited<ReturnType<ScenarioReleaseRepository['get']>>,
) {
  return {
    scenarioVersionId: f.version.id,
    templateHash: f.version.templateHash,
    policyVersion: SCENARIO_REVIEW_VERSION,
    reviewId: view.review!.id,
    reportHash: view.review!.reportHash!,
    curationVersion: SCENARIO_CURATION_VERSION,
    status: 'scenario_reviewed',
    reasonCode: null,
    actorLabel: 'Technical curator fixture',
    privacyChecked: true,
    contentChecked: true,
    meaningChecked: true,
    qualityChecked: true,
  };
}
export function scenarioGrant(
  f: Awaited<ReturnType<typeof scenarioReleaseFixture>>,
  view: Awaited<ReturnType<ScenarioReleaseRepository['get']>>,
) {
  const {
    status: _status,
    reasonCode: _reason,
    privacyChecked: _privacy,
    contentChecked: _content,
    meaningChecked: _meaning,
    qualityChecked: _quality,
    ...binding
  } = scenarioDecision(f, view);
  return {
    ...binding,
    curationId: view.curation!.id,
    sourceVersion: OFFICIAL_SCENARIO_SOURCE_VERSION,
    fictionalSourceChecked: true,
    rightsChecked: true,
    acknowledged: true,
  };
}
