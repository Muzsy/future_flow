import { fictionPolicy } from '@future-flow/contracts';
import {
  buildFictionArtifact,
  narrativeReferenceSnapshot,
} from '@future-flow/core';
import {
  ownedNarrativeReferences,
  ownedFictionReferences,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import { fictionFixture, fictionProof } from './fiction-fixtures';

// Synthetic storage/restore proof only. No paid request or literary assertion.
export async function prepareFictionJobFixture(db: Database, job: LifeJob) {
  const baseline = fictionFixture(job.payload);
  const f = fictionFixture({
    ...baseline.input,
    narrativeContext: {
      policy: fictionPolicy(),
      memory: baseline.memory,
      storyFacts: [],
    },
  });
  job.payload.narrativeContext = {
    policy: fictionPolicy(),
    memory: f.memory,
    storyFacts: [],
  };
  job.payload.narrativeReferences = narrativeReferenceSnapshot(
    await ownedNarrativeReferences(db, job.user_id, job.branch_id),
  );
  job.payload.fictionReferences = await ownedFictionReferences(
    db,
    job.user_id,
    job.branch_id,
  );
  f.input = job.payload;
  const receipts = fictionProof(f),
    artifact = buildFictionArtifact(
      f.input,
      f.draft,
      f.authored,
      f.review,
      f.fidelity,
      f.editor,
      receipts,
    );
  Object.assign(job.checkpoints, {
    pipelineVersion: 'narrative-fiction-v2',
    policy: artifact.policy,
    fictionDraft: f.draft,
    fictionAuthor: f.authored,
    candidate: f.authored.candidate,
    chapter: f.authored.chapter,
    planningReview: f.review,
    fidelityResult: f.fidelity,
    editorialReport: f.editor,
    receipts,
    narrativeArtifact: artifact,
    providerRequestCount: 5,
  });
  await db.query('UPDATE aw_jobs SET payload=$2,checkpoints=$3 WHERE id=$1', [
    job.id,
    JSON.stringify(job.payload),
    JSON.stringify(job.checkpoints),
  ]);
  return {
    candidate: f.authored.candidate,
    chapter: f.authored.chapter,
    receipts,
    commit: { artifact, expectedBindings: artifact.bindings },
  };
}
