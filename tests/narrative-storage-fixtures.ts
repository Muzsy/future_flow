import { narrativeV1Policy } from '@future-flow/contracts';
import {
  type Database,
  type LifeJob,
  ownedNarrativeReferences,
} from '@future-flow/database';
import { narrativeReferenceSnapshot } from '@future-flow/core';
import {
  narrativePlanFixture,
  narrativeArtifactFixture,
  longNarrativeChapterFixture,
} from './narrative-plan-fixtures';

// Synthetic storage/restore proof only: no model or budget request.
export async function prepareNarrativeJobFixture(
  db: Database,
  job: LifeJob,
  ready = true,
) {
  const plan = narrativePlanFixture(job.payload);
  job.payload.narrativeContext = {
    policy: narrativeV1Policy(),
    memory: plan.memory,
  };
  job.payload.narrativeReferences = narrativeReferenceSnapshot(
    await ownedNarrativeReferences(db, job.user_id, job.branch_id),
  );
  const artifact = narrativeArtifactFixture(plan),
    chapter = longNarrativeChapterFixture(plan);
  const receipts = artifact.provenance.receiptRefs.map((reference) => ({
    ...reference,
    promptVersion: `${artifact.policy.promptVersions[reference.task === 'life_narrative_plan' ? 'planner' : reference.task === 'life_narrative_chapter' ? 'writer' : reference.task === 'life_fidelity' ? 'fidelity' : 'editor']}.${job.payload.input.locale}`,
    locale: job.payload.input.locale,
    requestId: null,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
  }));
  if (ready)
    Object.assign(job.checkpoints, {
      policyHash: artifact.bindings.policyHash,
      policy: artifact.policy,
      pipelineVersion: 'narrative-v1',
      memoryHash: artifact.bindings.memoryHash,
      referenceHash: artifact.bindings.referenceHash,
      planningInputHash: receipts[0]!.inputHash,
      planningResult: plan.result,
      candidate: plan.candidate,
      candidateHash: artifact.bindings.candidateHash,
      canonHash: artifact.bindings.canonHash,
      planHash: artifact.bindings.planHash,
      chapter,
      storyInputHash: artifact.bindings.storyInputHash,
      fidelityResult: { valid: true, issues: [] },
      fidelityInputHash: artifact.bindings.fidelityInputHash,
      editorialReport: artifact.editorialReport,
      editorialInputHash: artifact.bindings.editorialInputHash,
      receipts,
      narrativeArtifact: artifact,
      fidelityPassed: true,
      editorialPassed: true,
      providerRequestCount: 4,
    });
  await db.query('UPDATE aw_jobs SET payload=$2,checkpoints=$3 WHERE id=$1', [
    job.id,
    JSON.stringify(job.payload),
    JSON.stringify(job.checkpoints),
  ]);
  return {
    plan,
    chapter,
    artifact,
    receipts,
    commit: { artifact, expectedBindings: artifact.bindings },
  };
}
