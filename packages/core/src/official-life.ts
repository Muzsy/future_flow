import {
  officialLifeReceiptSchema,
  officialLifeGenerationBindingSchema,
  periodCandidateV2Schema,
  periodChapterV2Schema,
  type LifePeriodInput,
} from '@future-flow/contracts';
import { DomainError } from './errors';
import { hash } from './index';
import { simulatePeriodV2, validatePeriodChapterV2 } from './life-v2';

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
