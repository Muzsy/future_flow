import { fictionPolicy, fictionV9Policy } from '@future-flow/contracts';
import {
  buildFictionArtifact,
  narrativeReferenceSnapshot,
  fictionCharacterProjectionFromEnvelope,
} from '@future-flow/core';
import {
  ownedNarrativeReferences,
  ownedFictionReferences,
  ownedFictionCharacterFold,
  fictionCharacterEnvelopeFrom,
  fictionCharacterSignals,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import { fictionFixture, fictionProof } from './fiction-fixtures';

// Synthetic storage/restore proof only. No paid request or literary assertion.
export async function prepareFictionJobFixture(
  db: Database,
  job: LifeJob,
  generation: 'v1' | 'v9' = 'v1',
) {
  const baseline = fictionFixture(job.payload);
  const fold =
    generation === 'v9'
      ? await ownedFictionCharacterFold(
          db,
          job.user_id,
          job.branch_id,
          baseline.memory.fictionalActors,
          baseline.input.state.actors.map((a) => a.id),
        )
      : undefined;
  const characters = fold
    ? fictionCharacterEnvelopeFrom(
        fold,
        fictionCharacterSignals(baseline.memory, undefined, fold),
      )
    : undefined;
  const policy = generation === 'v9' ? fictionV9Policy() : fictionPolicy();
  const f = fictionFixture({
    ...baseline.input,
    ...(characters ? { fictionCharacters: characters } : {}),
    narrativeContext: {
      policy,
      memory: baseline.memory,
      storyFacts: [],
      ...(characters
        ? {
            characterProjection: fictionCharacterProjectionFromEnvelope(
              characters,
              false,
            ),
          }
        : {}),
    },
  });
  job.payload.narrativeContext = f.input.narrativeContext;
  if (characters) job.payload.fictionCharacters = characters;
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
