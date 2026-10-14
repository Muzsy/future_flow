import { narrativeV1Policy } from '@future-flow/contracts';
import { type Database, type LifeJob } from '@future-flow/database';
import {
  narrativePlanFixture,
  narrativeArtifactFixture,
  longNarrativeChapterFixture,
} from './narrative-plan-fixtures';

// Synthetic storage/restore proof only: no model or budget request.
export async function prepareNarrativeJobFixture(db: Database, job: LifeJob) {
  const plan = narrativePlanFixture(job.payload);
  job.payload.narrativeContext = {
    policy: narrativeV1Policy(),
    memory: plan.memory,
  };
  await db.query('UPDATE aw_jobs SET payload=$2 WHERE id=$1', [
    job.id,
    JSON.stringify(job.payload),
  ]);
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
  return {
    plan,
    chapter,
    artifact,
    receipts,
    commit: { artifact, expectedBindings: artifact.bindings },
  };
}
