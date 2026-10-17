import {
  fictionContextSchema,
  fictionReferencesSchema,
  fictionAuthorResultSchema,
  fictionCompactAuthorSchema,
  fictionCompactDraftSchema,
  fictionArtifactSchema,
  narrativePlanningResultSchema,
  narrativePlanReviewV2Schema,
  fictionEditorialReportSchema,
  fidelitySchema,
  FICTION_FACT_BYTES,
  NARRATIVE_MEMORY_BYTES,
  NARRATIVE_ARTIFACT_BYTES,
  type NarrativePeriodInput,
  type FictionAuthorResult,
  type FictionArtifact,
  type NarrativePlanningResult,
  type NarrativePlanReview,
  type FictionEditorialReport,
} from '@future-flow/contracts';
import { hash } from './index';
import { DomainError } from './errors';
import { simulatePeriodV2, validateNarrativeChapterV1 } from './life-v2';
import {
  narrativeReferencesFromSnapshot,
  validateNarrativePlan,
  validateNarrativeEditorialReport,
  validateNarrativePlanReview,
  evaluateNarrativePlanReview,
  evaluateNarrativeEditorialGate,
} from './narrative';
import { validatePersonalSharedMemories } from './shared-personal';

const fail = (message: string): never => {
  throw new DomainError('NARRATIVE_PLAN_INVALID', message);
};
export function fictionScope(input: NarrativePeriodInput) {
  const context = fictionContextSchema.parse(input.narrativeContext);
  const references = narrativeReferencesFromSnapshot(input.narrativeReferences);
  const facts = fictionReferencesSchema.parse(input.fictionReferences);
  const memory = context.memory;
  if (
    memory.branchId !== input.input.branchId ||
    memory.baseRevision !== input.revision ||
    memory.history.some((p) => p.endDate > input.startDate) ||
    memory.recentChoices.some(
      (c) => !input.acceptedDecisionIds.includes(c.decisionId),
    ) ||
    Buffer.byteLength(
      JSON.stringify({
        memory,
        storyFacts: context.storyFacts,
        ...(context.sequenceHistory
          ? { sequenceHistory: context.sequenceHistory }
          : {}),
        ...(context.sequenceSignatureHistory
          ? { sequenceSignatureHistory: context.sequenceSignatureHistory }
          : {}),
      }),
      'utf8',
    ) > NARRATIVE_MEMORY_BYTES
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Fiction memory differs from the owned period or exceeds its byte bound.',
    );
  for (const layer of [
    context.sequenceHistory ?? [],
    context.sequenceSignatureHistory ?? [],
  ]) {
    const sequenceIds = layer.map((p) => p.periodId);
    const positions = sequenceIds.map((id) =>
      references.periodPositions.get(id),
    );
    if (
      new Set(sequenceIds).size !== sequenceIds.length ||
      positions.some(
        (position, index) =>
          position === undefined ||
          (context.policy.qualityPolicyVersion === '2.2.0' &&
            index > 0 &&
            position <= positions[index - 1]!),
      )
    )
      fail(
        'Sequence context contains non-owned, unordered or duplicate periods.',
      );
  }
  const ids = facts.facts.map((f) => f.id);
  if (
    new Set(ids).size !== ids.length ||
    facts.facts.some((f) => !references.historyEventIds.has(f.eventId))
  )
    fail('Fiction reference inventory lacks owned event provenance.');
  for (const fact of context.storyFacts)
    if (
      !facts.facts.some(
        (f) => f.id === fact.id && f.eventId === fact.introducedByEventId,
      )
    )
      fail('A remembered story fact has no owned provenance.');
  validatePersonalSharedMemories(input.memory.sharedEvents, input.startDate);
  return { context, references, facts };
}
export type FictionRepair = {
  mode: 'author_package' | 'prose_only';
  message: string;
  previous: FictionAuthorResult | null;
};
export function fictionPlannerRequest(
  input: NarrativePeriodInput,
  repair?: string,
) {
  const { context } = fictionScope(input);
  // Never spread the server envelope: full reference inventories stay server-only.
  return {
    input: input.input,
    state: input.state,
    revision: input.revision,
    periodId: input.periodId,
    startDate: input.startDate,
    endDate: input.endDate,
    durationMonths: input.durationMonths,
    acceptedDecisionIds: input.acceptedDecisionIds,
    memory: {
      recentEvents: context.memory.withheld ? [] : input.memory.recentEvents,
      choices: context.memory.withheld ? [] : input.memory.choices,
      ...(input.memory.sharedEvents
        ? { sharedEvents: input.memory.sharedEvents }
        : {}),
    },
    narrativeContext: context,
    repair: repair ?? null,
  };
}
export function fictionAuthorRequest(
  input: NarrativePeriodInput,
  draft: NarrativePlanningResult,
  repair?: FictionRepair,
) {
  return {
    ...fictionPlannerRequest(input),
    draft: narrativePlanningResultSchema.parse(draft),
    authorRepair: repair ?? null,
  };
}
export function fictionReviewRequest(
  input: NarrativePeriodInput,
  authored: FictionAuthorResult,
) {
  const { repair: _repair, ...base } = fictionPlannerRequest(input);
  const { chapter: _chapter, ...proposed } =
    fictionAuthorResultSchema.parse(authored);
  return { ...base, proposed };
}
export function fictionFidelityRequest(
  input: NarrativePeriodInput,
  authored: FictionAuthorResult,
) {
  return {
    ...fictionReviewRequest(input, authored),
    chapter: authored.chapter,
  };
}
export function fictionEditorialRequest(
  input: NarrativePeriodInput,
  authored: FictionAuthorResult,
) {
  return {
    ...fictionFidelityRequest(input, authored),
    paragraphs: authored.chapter.body
      .split(/\n\s*\n/)
      .filter((p) => p.trim())
      .map((text, index) => ({ index: index + 1, text })),
  };
}
export function validateFictionEditorialReport(
  input: NarrativePeriodInput,
  authored: FictionAuthorResult,
  raw: unknown,
) {
  const { context } = fictionScope(input);
  const report = fictionEditorialReportSchema.parse(raw);
  const expectedVersion =
    context.policy.qualityPolicyVersion === '2.2.0'
      ? '1.2.0'
      : context.policy.qualityPolicyVersion === '2.1.0'
        ? '1.1.0'
        : '1.0.0';
  if (report.version !== expectedVersion)
    fail('Fiction editorial report differs from the frozen quality policy.');
  const { version: _version, ...fields } = report;
  const {
    sequenceReview: _sequence,
    sequenceSignature: _signature,
    ...legacy
  } = fields as typeof fields & {
    sequenceReview?: unknown;
    sequenceSignature?: unknown;
  };
  validateNarrativeEditorialReport(
    { ...legacy, version: '1.0.0' },
    authored.chapter,
    validateFictionAuthor(input, authored).canon,
  );
  if (report.version !== '1.0.0') {
    const expected = [
      ...new Set([
        ...(context.sequenceHistory ?? []).map((p) => p.periodId),
        ...(report.version === '1.2.0'
          ? (context.sequenceSignatureHistory ?? []).map((p) => p.periodId)
          : []),
      ]),
    ].sort();
    if (
      hash([...report.sequenceReview.comparedPeriodIds].sort()) !==
      hash(expected)
    )
      fail(
        'Sequence review must cover exactly the supplied owned history, without duplicates.',
      );
  }
  if (
    report.version === '1.2.0' &&
    report.sequenceSignature.periodId !== input.periodId
  )
    fail('Current sequence signature differs from the server-owned period.');
  return report;
}
export function fictionProseRepairAllowed(report: FictionEditorialReport) {
  return (
    !report.issues.some((i) => i.repairScope === 'canon') &&
    (report.version === '1.0.0' ||
      (report.sequenceReview.distinctDramaticStructure &&
        report.sequenceReview.independentProgression &&
        report.sequenceReview.characterAgency &&
        (report.version !== '1.2.0' ||
          report.sequenceReview.behavioralVariety)))
  );
}
export function evaluateFictionEditorialGate(
  input: NarrativePeriodInput,
  raw: unknown,
) {
  const report = fictionEditorialReportSchema.parse(raw);
  const qualityVersion =
    fictionScope(input).context.policy.qualityPolicyVersion;
  if (qualityVersion === '2.0.0')
    return {
      passed:
        report.version === '1.0.0' &&
        evaluateNarrativeEditorialGate(report).passed,
    };
  if (report.version !== (qualityVersion === '2.2.0' ? '1.2.0' : '1.1.0'))
    return { passed: false };
  const r = report.sequenceReview;
  return {
    passed:
      report.verdict === 'pass' &&
      Object.values(report.scores).every((s) => s >= 4) &&
      r.distinctDramaticStructure &&
      r.distinctEnding &&
      r.independentProgression &&
      r.characterAgency &&
      (report.version !== '1.2.0' ||
        (report.sequenceReview.distinctRhetoricalShape &&
          report.sequenceReview.systemMechanicsInvisible &&
          report.sequenceReview.behavioralVariety)) &&
      !report.issues.some(
        (i) => i.severity === 'major' || i.repairScope === 'canon',
      ),
  };
}
export function fictionCanon(input: NarrativePeriodInput, raw: unknown) {
  const scope = fictionScope(input),
    result = (
      scope.context.policy.promptVersions.planner !== 'life_fiction_plan.v1'
        ? fictionCompactDraftSchema
        : narrativePlanningResultSchema
    ).parse(raw);
  const c = result.candidate;
  if (
    c.periodId !== input.periodId ||
    c.branchId !== input.input.branchId ||
    c.baseRevision !== input.revision ||
    c.startDate !== input.startDate ||
    c.endDate !== input.endDate ||
    c.durationMonths !== input.durationMonths
  )
    fail('Fiction candidate changed its server-owned scope.');
  const canon = simulatePeriodV2(c, input.state, input.input.constraints, {
    lifeId: input.input.lifeId,
    branchId: input.input.branchId,
    revision: input.revision,
    acceptedDecisionIds: input.acceptedDecisionIds,
  });
  validateNarrativePlan(result, canon, scope.context.memory, scope.references);
  return { ...scope, result, canon };
}
export function validateFictionAuthor(
  input: NarrativePeriodInput,
  raw: unknown,
) {
  const authored = (
    fictionScope(input).context.policy.promptVersions.writer !==
    'life_fiction_author.v1'
      ? fictionCompactAuthorSchema
      : fictionAuthorResultSchema
  ).parse(raw);
  const run = fictionCanon(input, {
    version: '1.0.0',
    candidate: authored.candidate,
    plan: authored.plan,
  });
  validateNarrativeChapterV1(authored.chapter, run.canon.events);
  if (
    Buffer.byteLength(JSON.stringify(authored.storyFacts), 'utf8') >
    FICTION_FACT_BYTES
  )
    fail('Story facts exceed their byte limit.');
  const prior = new Set(run.facts.facts.map((f) => f.id));
  const current = new Set<string>();
  const reserved = new Set([
    ...(run.references.usedCanonicalIds ?? []),
    ...run.references.usedThreadIds,
    ...input.state.actors.map((a) => a.id),
    ...input.state.ownedAssets.map((a) => a.id),
    ...input.state.opportunities.map((a) => a.id),
    ...(run.references.fictionalActorOrigins?.keys() ?? []),
    ...authored.candidate.events.flatMap((e) => [
      e.id,
      ...(e.decision
        ? [e.decision.id, ...e.decision.options.map((o) => o.id)]
        : []),
    ]),
    ...authored.plan.scenes.map((s) => s.sceneId),
    ...authored.plan.memoryDelta.threadUpdates.map((t) => t.id),
    ...authored.candidate.events.flatMap((e) =>
      e.changes.flatMap((c) =>
        'value' in c &&
        typeof c.value === 'object' &&
        c.value !== null &&
        'id' in c.value
          ? [String(c.value.id)]
          : [],
      ),
    ),
  ]);
  const superseded = new Set<string>();
  for (const fact of authored.storyFacts) {
    const event = run.canon.events.find(
      (e) => e.id === fact.introducedByEventId,
    );
    if (
      !event ||
      prior.has(fact.id) ||
      current.has(fact.id) ||
      reserved.has(fact.id)
    )
      fail('Story fact identity or event origin is invalid.');
    current.add(fact.id);
    if (
      new Set(fact.aboutActorIds).size !== fact.aboutActorIds.length ||
      fact.aboutActorIds.some(
        (id) => !event!.stateAfter.actors.some((a) => a.id === id),
      )
    )
      fail('Story fact actor does not exist at its event.');
    if (fact.supersedesFactId) {
      if (
        run.context.memory.withheld ||
        !prior.has(fact.supersedesFactId) ||
        !run.context.storyFacts.some((f) => f.id === fact.supersedesFactId) ||
        superseded.has(fact.supersedesFactId)
      )
        fail('Story fact supersession has no unique owned historical target.');
      superseded.add(fact.supersedesFactId);
    }
  }
  return { ...run, authored };
}
export type FictionReceipt = {
  task: string;
  promptVersion: string;
  model: string;
  inputHash: string;
  outputHash: string;
};
export function fictionReceipts(raw: unknown): FictionReceipt[] {
  if (
    !Array.isArray(raw) ||
    raw.length > 9 ||
    raw.some(
      (r) =>
        !r ||
        typeof r !== 'object' ||
        ['task', 'promptVersion', 'model', 'inputHash', 'outputHash'].some(
          (k) => typeof r[k] !== 'string',
        ) ||
        !/^[a-f0-9]{64}$/.test(r.inputHash) ||
        !/^[a-f0-9]{64}$/.test(r.outputHash) ||
        ![
          'life_narrative_plan',
          'life_narrative_chapter',
          'life_narrative_plan_review',
          'life_fidelity',
          'life_narrative_editor',
        ].includes(r.task),
    )
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Fiction receipts are invalid.',
    );
  return raw;
}
export function fictionBindings(
  input: NarrativePeriodInput,
  draft: NarrativePlanningResult,
  authored: FictionAuthorResult,
  review: NarrativePlanReview,
  fidelity: unknown,
  editor: FictionEditorialReport,
  planningRepair?: string,
  repair?: FictionRepair,
): FictionArtifact['bindings'] {
  const run = validateFictionAuthor(input, authored);
  return {
    policyHash: hash(run.context.policy),
    memoryHash: hash(run.context),
    referenceHash: hash(input.narrativeReferences),
    fictionReferenceHash: hash(input.fictionReferences),
    draftInputHash: hash(fictionPlannerRequest(input, planningRepair)),
    draftOutputHash: hash(draft),
    authorInputHash: hash(fictionAuthorRequest(input, draft, repair)),
    authorOutputHash: hash(authored),
    candidateHash: hash(authored.candidate),
    canonHash: hash(run.canon.events),
    planHash: hash(authored.plan),
    storyFactsHash: hash(authored.storyFacts),
    chapterHash: hash(authored.chapter),
    reviewInputHash: hash(fictionReviewRequest(input, authored)),
    reviewOutputHash: hash(review),
    fidelityInputHash: hash(fictionFidelityRequest(input, authored)),
    fidelityOutputHash: hash(fidelitySchema.parse(fidelity)),
    editorialInputHash: hash(fictionEditorialRequest(input, authored)),
    editorialOutputHash: hash(editor),
  };
}
export function buildFictionArtifact(
  input: NarrativePeriodInput,
  draft: NarrativePlanningResult,
  authored: FictionAuthorResult,
  review: NarrativePlanReview,
  fidelity: unknown,
  editor: FictionEditorialReport,
  rawReceipts: unknown,
  planningRepair?: string,
  repair?: FictionRepair,
): FictionArtifact {
  fictionCanon(input, draft);
  const run = validateFictionAuthor(input, authored);
  const r = narrativePlanReviewV2Schema.parse(review);
  validateNarrativePlanReview(r, run.result, 'life_narrative_plan_review.v2');
  validateFictionEditorialReport(input, authored, editor);
  const f = fidelitySchema.parse(fidelity);
  if (
    !evaluateNarrativePlanReview(r).passed ||
    !evaluateFictionEditorialGate(input, editor).passed ||
    !f.valid ||
    f.issues.length
  )
    throw new DomainError(
      'NARRATIVE_QUALITY_FAILED',
      'Fiction has not passed all final gates.',
    );
  const receipts = fictionReceipts(rawReceipts);
  const bindings = fictionBindings(
    input,
    draft,
    authored,
    r,
    f,
    editor,
    planningRepair,
    repair,
  );
  const checks = [
    [
      'life_narrative_plan',
      'planner',
      bindings.draftInputHash,
      bindings.draftOutputHash,
    ],
    [
      'life_narrative_chapter',
      'writer',
      bindings.authorInputHash,
      bindings.authorOutputHash,
    ],
    [
      'life_narrative_plan_review',
      'planReviewer',
      bindings.reviewInputHash,
      bindings.reviewOutputHash,
    ],
    [
      'life_fidelity',
      'fidelity',
      bindings.fidelityInputHash,
      bindings.fidelityOutputHash,
    ],
    [
      'life_narrative_editor',
      'editor',
      bindings.editorialInputHash,
      bindings.editorialOutputHash,
    ],
  ] as const;
  let ordinal = -1;
  for (const [task, key, i, o] of checks) {
    const last = receipts.map((receipt) => receipt.task).lastIndexOf(task);
    // A prose-only author repair can reuse a plan review BEFORE the final writer,
    // but only if the exact final material is unchanged from that reviewed draft.
    const reused =
      task === 'life_narrative_plan_review' &&
      repair?.mode === 'prose_only' &&
      repair.previous &&
      hash(fictionReviewRequest(input, repair.previous)) ===
        bindings.reviewInputHash;
    if (
      last < 0 ||
      (!reused && last <= ordinal) ||
      receipts[last]!.inputHash !== i ||
      receipts[last]!.outputHash !== o
    )
      throw new DomainError(
        'NARRATIVE_CONTEXT_INVALID',
        'Fiction receipt binding or final-stage order differs.',
      );
    if (!reused) ordinal = last;
    if (
      receipts
        .filter((receipt) => receipt.task === task)
        .some(
          (receipt) =>
            receipt.promptVersion !==
            `${run.context.policy.promptVersions[key]}.${input.input.locale}`,
        )
    )
      throw new DomainError(
        'NARRATIVE_CONTEXT_INVALID',
        'Fiction receipt prompt policy differs.',
      );
  }
  if (
    repair?.mode === 'prose_only' &&
    repair.previous &&
    hash(fictionReviewRequest(input, repair.previous)) !==
      bindings.reviewInputHash
  )
    fail('A prose-only repair changed its reviewed canon.');
  const artifact = fictionArtifactSchema.parse({
    version: '2.0.0',
    pipelineVersion: 'narrative-fiction-v2',
    policy: run.context.policy,
    validatedPlan: authored.plan,
    validatedMemoryDelta: authored.plan.memoryDelta,
    storyFacts: authored.storyFacts,
    planningReview: r,
    editorialReport: fictionEditorialReportSchema.parse(editor),
    bindings,
    provenance: {
      receiptRefs: receipts.map((receipt, ordinal) => ({
        task: receipt.task,
        ordinal,
        model: receipt.model,
        inputHash: receipt.inputHash,
        outputHash: receipt.outputHash,
      })),
    },
  });
  if (
    Buffer.byteLength(JSON.stringify(artifact), 'utf8') >
    NARRATIVE_ARTIFACT_BYTES
  )
    fail('Fiction artifact exceeds its storage bound.');
  return artifact;
}
export function validatedFictionCheckpoint(
  cp: Record<string, unknown>,
  input: NarrativePeriodInput,
) {
  const scope = fictionScope(input);
  if (
    cp.catalogOperatorLease ||
    cp.pipelineVersion !== scope.context.policy.mode ||
    hash(cp.policy) !== hash(scope.context.policy)
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Fiction checkpoint policy differs.',
    );
  const draft = narrativePlanningResultSchema.parse(cp.fictionDraft),
    authored = fictionAuthorResultSchema.parse(cp.fictionAuthor);
  const artifact = buildFictionArtifact(
    input,
    draft,
    authored,
    cp.planningReview as NarrativePlanReview,
    cp.fidelityResult,
    cp.editorialReport as FictionEditorialReport,
    cp.receipts,
    typeof cp.planningRepair === 'string' ? cp.planningRepair : undefined,
    cp.fictionRepair as FictionRepair | undefined,
  );
  const count = cp.providerRequestCount;
  if (
    hash(artifact) !== hash(cp.narrativeArtifact) ||
    hash(cp.candidate) !== hash(authored.candidate) ||
    hash(cp.chapter) !== hash(authored.chapter) ||
    typeof count !== 'number' ||
    !Number.isSafeInteger(count) ||
    count < artifact.provenance.receiptRefs.length ||
    count > scope.context.policy.maxPhysicalRequests
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Fiction checkpoint content or request count differs.',
    );
  return {
    artifact,
    expectedBindings: artifact.bindings,
    candidate: authored.candidate,
    chapter: authored.chapter,
    receipts: cp.receipts as unknown[],
  };
}
