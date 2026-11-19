import {
  fictionArtifactSchema,
  fictionContextSchema,
  OFFICIAL_LIFE_FICTION_TASKS,
  officialLifeFictionGenerationSchema,
  officialLifeReceiptSchema,
  officialLifeGenerationBindingSchema,
  periodCandidateV2Schema,
  periodChapterV2Schema,
  type LifePeriodInput,
} from '@future-flow/contracts';
import { DomainError } from './errors';
import { hash } from './index';
import { simulatePeriodV2, validatePeriodChapterV2 } from './life-v2';
import { matchesFictionPeriodTiming } from './fiction';

export function officialLifeInvalid() {
  return new DomainError(
    'OFFICIAL_LIFE_EVIDENCE_REQUIRED',
    'Exact accounted AI provenance is required.',
    409,
  );
}
// Called only on trusted server job/canon records, never on a client's claimed receipts.
export function validateOfficialLifePeriod(
  payload: LifePeriodInput,
  row: {
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
  },
  rawReceipts: unknown[],
  rawGeneration: unknown,
) {
  const fail = () => {
    throw officialLifeInvalid();
  };
  const parsed = officialLifeGenerationBindingSchema.safeParse(rawGeneration);
  if (!parsed.success) return fail();
  const generation = parsed.data;
  const candidate = periodCandidateV2Schema.parse(row.candidate);
  const chapter = periodChapterV2Schema.parse(row.chapter);
  if (
    payload.input.locale !== 'en' ||
    payload.input.identity.mode !== 'alternate' ||
    payload.input.identity.baseProfileVersionId !== null ||
    payload.memory.sharedEvents?.length ||
    payload.periodId !== row.id ||
    payload.input.lifeId !== row.life_id ||
    payload.input.branchId !== row.branch_id ||
    payload.revision !== row.base_revision ||
    candidate.periodId !== payload.periodId ||
    candidate.startDate !== payload.startDate ||
    candidate.endDate !== payload.endDate ||
    hash(payload.state) !== hash(row.start_state) ||
    hash(payload.acceptedDecisionIds) !== hash(row.accepted_before) ||
    hash(payload) !== generation.sourceHash
  )
    return fail();
  const canon = simulatePeriodV2(
    candidate,
    payload.state,
    payload.input.constraints,
    {
      lifeId: row.life_id,
      branchId: row.branch_id,
      revision: row.base_revision,
      acceptedDecisionIds: payload.acceptedDecisionIds,
    },
  );
  if (
    hash(canon) !== row.canon_hash ||
    hash(canon.events) !== hash(row.events) ||
    hash(canon.endState) !== hash(row.end_state)
  )
    return fail();
  validatePeriodChapterV2(chapter, canon.events);
  const story = {
    locale: payload.input.locale,
    identity: payload.input.identity,
    goals: payload.input.goals,
    events: canon.events,
  };
  if (hash({ ...story, chapter }) !== generation.fidelityInputHash)
    return fail();
  const receipts = rawReceipts.map((r) => {
    const result = officialLifeReceiptSchema.safeParse(r);
    if (!result.success) return fail();
    return result.data;
  });
  if (
    receipts.length < 3 ||
    receipts.length > 5 ||
    receipts.some((r) => r.task === 'public_content_review') ||
    new Set(receipts.map((r) => r.requestId)).size !== receipts.length
  )
    return fail();
  const expected = [
    {
      task: 'life_period',
      prompt: 'life_period.v4.en',
      input: generation.periodInputHash,
      output: hash(candidate),
    },
    {
      task: 'life_chapter',
      prompt: 'life_chapter.v4.en',
      input: generation.chapterInputHash,
      output: hash(chapter),
    },
    {
      task: 'life_fidelity',
      prompt: 'life_fidelity.v3.en',
      input: generation.fidelityInputHash,
      output: hash({ valid: true, issues: [] }),
    },
  ];
  for (const e of expected) {
    const receipt = receipts.filter((r) => r.task === e.task).at(-1);
    if (
      !receipt ||
      receipt.inputHash !== e.input ||
      receipt.outputHash !== e.output
    )
      return fail();
  }
  if (
    receipts.some(
      (r) =>
        r.promptVersion !== expected.find((e) => e.task === r.task)?.prompt,
    ) ||
    receipts[0]!.task !== 'life_period' ||
    receipts.at(-1)!.task !== 'life_fidelity'
  )
    return fail();
  return {
    generation,
    receipts,
    canonHash: row.canon_hash,
    chapterHash: hash(chapter),
  };
}

// Plan 051: an Official period written on the story (v10) fiction path. The job
// already validated the fiction pipeline when it saved the period; this checks,
// on trusted server records only, that the saved artifact, canon, chapter and
// every accounted provider receipt are exactly the ones that completion bound.
export function validateOfficialFictionPeriod(
  payload: LifePeriodInput,
  row: {
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
    narrative_artifact: unknown;
  },
  rawReceipts: unknown[],
  rawBinding: unknown,
) {
  const fail = () => {
    throw officialLifeInvalid();
  };
  const context = fictionContextSchema.safeParse(
    (payload as { narrativeContext?: unknown }).narrativeContext,
  );
  const artifact = fictionArtifactSchema.safeParse(row.narrative_artifact);
  const binding =
    rawBinding && typeof rawBinding === 'object'
      ? officialLifeFictionGenerationSchema.safeParse({
          pipelineVersion: (rawBinding as Record<string, unknown>)
            .pipelineVersion,
          sourceHash: (rawBinding as Record<string, unknown>).sourceHash,
          artifactHash: (rawBinding as Record<string, unknown>).artifactHash,
        })
      : null;
  if (!context.success || !artifact.success || !binding?.success) return fail();
  const generation = binding.data;
  const candidate = periodCandidateV2Schema.parse(row.candidate);
  if (
    payload.input.locale !== 'en' ||
    payload.input.identity.mode !== 'alternate' ||
    payload.input.identity.baseProfileVersionId !== null ||
    // Only the story-form path (v10, or v11 of plan 052): what a reader gets.
    !payload.input.story ||
    !['.v10', '.v11', '.v12'].some((v) =>
      context.data.policy.promptVersions.writer.endsWith(v),
    ) ||
    hash(artifact.data.policy) !== hash(context.data.policy) ||
    payload.memory.sharedEvents?.length ||
    payload.periodId !== row.id ||
    payload.input.lifeId !== row.life_id ||
    payload.input.branchId !== row.branch_id ||
    payload.revision !== row.base_revision ||
    candidate.periodId !== payload.periodId ||
    candidate.startDate !== payload.startDate ||
    // The story path lets the planner end the period on its decision date
    // (storyTiming); the engine's own timing rule decides, not the default.
    !matchesFictionPeriodTiming(payload, candidate) ||
    hash(payload.state) !== hash(row.start_state) ||
    hash(payload.acceptedDecisionIds) !== hash(row.accepted_before) ||
    hash(payload) !== generation.sourceHash ||
    hash(artifact.data) !== generation.artifactHash
  )
    return fail();
  const canon = simulatePeriodV2(
    candidate,
    payload.state,
    payload.input.constraints,
    {
      lifeId: row.life_id,
      branchId: row.branch_id,
      revision: row.base_revision,
      acceptedDecisionIds: payload.acceptedDecisionIds,
    },
  );
  if (
    hash(canon) !== row.canon_hash ||
    hash(canon.events) !== hash(row.events) ||
    hash(canon.endState) !== hash(row.end_state)
  )
    return fail();
  const receipts = rawReceipts.map((r) => {
    const result = officialLifeReceiptSchema.safeParse(r);
    if (!result.success) return fail();
    return result.data;
  });
  // Generation order is the artifact's ordinal, not the stored array order.
  const refs = [...artifact.data.provenance.receiptRefs].sort(
    (a, b) => a.ordinal - b.ordinal,
  );
  if (new Set(refs.map((ref) => ref.ordinal)).size !== refs.length)
    return fail();
  if (
    receipts.length < 5 ||
    receipts.length > context.data.policy.maxPhysicalRequests ||
    receipts.length !== refs.length ||
    new Set(receipts.map((r) => r.requestId)).size !== receipts.length ||
    receipts.some(
      (r, index) =>
        !(OFFICIAL_LIFE_FICTION_TASKS as readonly string[]).includes(r.task) ||
        r.task !== refs[index]!.task ||
        r.model !== refs[index]!.model ||
        r.inputHash !== refs[index]!.inputHash ||
        r.outputHash !== refs[index]!.outputHash,
    )
  )
    return fail();
  return {
    narrativeGeneration: generation,
    receipts,
    canonHash: row.canon_hash,
    chapterHash: hash(row.chapter),
  };
}
