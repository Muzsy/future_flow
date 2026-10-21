import {
  fictionContextSchema,
  fictionReferencesSchema,
  fictionAuthorResultSchema,
  fictionCompactAuthorSchema,
  fictionCompactDraftSchema,
  fictionDraftSchemaFor,
  fictionAuthorSchemaFor,
  fictionCompactAuthorV9Schema,
  fictionCompactDraftV9Schema,
  fictionCharacterQualityVersions,
  fictionThreeActorQualityVersions,
  fictionCharacterEnvelopeSchema,
  fictionArtifactSchema,
  narrativePlanningResultSchema,
  narrativePlanReviewV2Schema,
  fictionEditorialReportSchema,
  fictionEditorialVersionFor,
  fictionHumanQualityVersions,
  fictionSeriesQualityVersions,
  fidelitySchema,
  FICTION_FACT_BYTES,
  NARRATIVE_MEMORY_BYTES,
  NARRATIVE_ARTIFACT_BYTES,
  type NarrativePeriodInput,
  type FictionContext,
  type FictionAuthorResult,
  type FictionPolicy,
  type FictionCharacterDelta,
  type FictionCharacterIntent,
  type FictionContinuityDecision,
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
import { fictionCastingProjection } from './fiction-casting';
import { seriesEchoFindings, seriesFrictionMarkers } from './fiction-series';
import {
  fictionCharacterActorsFromEnvelope,
  fictionCharacterProjectionFromEnvelope,
  validateFictionCharacterDelta,
} from './fiction-character';

const fail = (message: string): never => {
  throw new DomainError('NARRATIVE_PLAN_INVALID', message);
};
export function fictionScope(input: NarrativePeriodInput) {
  const context = fictionContextSchema.parse(input.narrativeContext);
  const quality = context.policy.qualityPolicyVersion;
  const references = {
    ...narrativeReferencesFromSnapshot(input.narrativeReferences),
    // Owner decision 2026-10-19: v7/v8 allow up to three new recurring
    // actors per period; v8 also lets invented actors leave the story.
    ...(fictionThreeActorQualityVersions.includes(quality)
      ? { maxIntroducedActors: 3 }
      : {}),
    ...(fictionSeriesQualityVersions.includes(quality)
      ? { allowFictionalActorRemoval: true }
      : {}),
  };
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
          (fictionHumanQualityVersions.includes(
            context.policy.qualityPolicyVersion,
          ) &&
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
  const characters = fictionCharacterScope(input, context, references);
  return { context, references, facts, characters };
}
// Living-world generation: the server's character envelope must exist, match
// the owned reference inventory and reproduce the projection in the request.
// Older generations never carry an envelope.
function fictionCharacterScope(
  input: NarrativePeriodInput,
  context: ReturnType<typeof fictionContextSchema.parse>,
  references: ReturnType<typeof narrativeReferencesFromSnapshot>,
) {
  const living = fictionCharacterQualityVersions.includes(
    context.policy.qualityPolicyVersion,
  );
  if (!living) {
    if (input.fictionCharacters !== undefined)
      throw new DomainError(
        'NARRATIVE_CONTEXT_INVALID',
        'Only the living-world policy carries a character envelope.',
      );
    return null;
  }
  const parsed = fictionCharacterEnvelopeSchema.safeParse(
    input.fictionCharacters,
  );
  const stale = () =>
    new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Character envelope differs from the owned inventory or the request projection.',
    );
  if (!parsed.success) throw stale();
  const envelope = parsed.data;
  const actors = fictionCharacterActorsFromEnvelope(envelope);
  const origins = references.fictionalActorOrigins ?? new Map();
  const stateActorIds = new Set(input.state.actors.map((a) => a.id));
  if (
    hash([...actors.fictionalOrigins].sort()) !== hash([...origins].sort()) ||
    [...actors.suppliedActorIds].some(
      (id) => actors.fictionalOrigins.has(id) || !stateActorIds.has(id),
    ) ||
    // Every classified entry and every present person is accounted for.
    envelope.state.actors.some(
      (a) =>
        a.kind !==
          (actors.fictionalOrigins.has(a.actorId) ? 'fictional' : 'supplied') ||
        (a.kind === 'supplied' && !actors.suppliedActorIds.has(a.actorId)),
    ) ||
    hash(context.characterProjection) !==
      hash(
        fictionCharacterProjectionFromEnvelope(
          envelope,
          context.memory.withheld,
        ),
      )
  )
    throw stale();
  return { envelope, actors };
}
// Requests and checkpoints keep parsing v1-v8 outputs with the schemas they
// always used; only the living-world generation reads the v9 shapes.
const requestDraftSchema = (policy: FictionPolicy) =>
  fictionCharacterQualityVersions.includes(policy.qualityPolicyVersion)
    ? fictionCompactDraftV9Schema
    : narrativePlanningResultSchema;
const requestAuthorSchema = (policy: FictionPolicy) =>
  fictionCharacterQualityVersions.includes(policy.qualityPolicyVersion)
    ? fictionCompactAuthorV9Schema
    : fictionAuthorResultSchema;
export type FictionRepair = {
  mode: 'author_package' | 'prose_only';
  message: string;
  previous: FictionAuthorResult | null;
};
function fictionReferenceProjection(input: NarrativePeriodInput) {
  const projection = {
    goalIds: input.state.goals.map((goal) => goal.goalId),
    existingActorIds: input.state.actors.map((actor) => actor.id),
    sceneActorRule:
      'Every scene actor must exist by stateAfter of its FIRST referenced event. A new recurring actor requires actor_add; copy that exact ID, and start its scene no earlier than its introducing event. goal_progress_set updates an existing goalId only; it cannot create a new goal, including in decision options.' +
      (fictionSeriesQualityVersions.includes(
        fictionScope(input).context.policy.qualityPolicyVersion,
      )
        ? ' An unnamed one-off participant mentioned only in passing is not a scene actor and needs no actor_add; at most three actor_add per period. An invented actor may leave through actor_remove; it may take part in that event but in no later event or scene.'
        : ''),
  };
  // Existing state admits at most five goals and thirty actors. Do not trim
  // IDs or expand memory limits to make an invalid projection fit.
  if (Buffer.byteLength(JSON.stringify(projection), 'utf8') > 2048)
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Fiction reference projection exceeds its request-local byte bound.',
    );
  return projection;
}
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
    // Advisory copy of already supplied, owned state IDs. It adds no new
    // reference authority; replay still validates every proposed transition.
    ...(['2.4.0', '2.5.0', '2.6.0', '2.7.0', '2.8.0'].includes(
      context.policy.qualityPolicyVersion,
    )
      ? { referenceProjection: fictionReferenceProjection(input) }
      : {}),
    // Seeded per life; withheld history does not affect it (labels are state).
    ...(fictionSeriesQualityVersions.includes(
      context.policy.qualityPolicyVersion,
    )
      ? {
          castingProjection: fictionCastingProjection({
            lifeId: input.input.lifeId,
            country: input.state.location.country,
            locale: input.input.locale,
            usedLabels: input.state.actors.map((a) => a.label),
          }),
        }
      : {}),
    repair: repair ?? null,
  };
}
// v9 repair rules, one per repair mode, sent inside the repair request so the
// author sees only the rule that can apply to it. A prose-only repair freezes
// the registered facts (it cannot register a new one), so telling it to
// "register or remove" a claim is impossible advice and it must stay on the
// facts that are already there (v9-6e chapter 1). An author-package repair
// rebuilds the package and registers what it adds. Surgical editing is the
// shape of the repairs that passed (v9-6c chapters 1 and 4) and rewriting the
// shape of those that failed (6b chapter 1, 6e chapter 1). v8 requests do not
// carry this key.
export const FICTION_REPAIR_RULES: Record<FictionRepair['mode'], string> = {
  author_package:
    'Surgical repair: copy previous.chapter.body and change only the sentences the feedback names; every other sentence stays word for word. Never raise the strength of a claim (offered to agreed, accepted to used). Register in storyFacts every lasting claim you add, and add no new person or speaking role.',
  prose_only:
    'Prose-only repair: no fact can be registered here. Work only from the facts and events already registered (previous.storyFacts, the candidate, accepted history); introduce no new cause, backstory, state or person, and no stronger claim than they record. Get concreteness by showing existing facts in the scene. Change only what the feedback names.',
};
export function fictionAuthorRequest(
  input: NarrativePeriodInput,
  draft: NarrativePlanningResult,
  repair?: FictionRepair,
) {
  return {
    ...fictionPlannerRequest(input),
    draft: requestDraftSchema(fictionScope(input).context.policy).parse(draft),
    authorRepair: repair
      ? {
          ...repair,
          ...(fictionScope(input).characters
            ? { repairRule: FICTION_REPAIR_RULES[repair.mode] }
            : {}),
        }
      : null,
  };
}
// The planner and the author use the character projection to write; the check
// stages judge the finished package, which already carries the intent and the
// delta, so they receive only the projection's hash. The request stays bound to
// the same state without paying for the projection in every stage (review F1).
function checkStageContext(context: FictionContext) {
  const { characterProjection, ...rest } = context;
  return characterProjection
    ? { ...rest, characterProjectionHash: hash(characterProjection) }
    : context;
}
export function fictionReviewRequest(
  input: NarrativePeriodInput,
  authored: FictionAuthorResult,
  draft?: unknown,
) {
  const { repair: _repair, ...base } = fictionPlannerRequest(input);
  const { chapter: _chapter, ...proposed } = requestAuthorSchema(
    fictionScope(input).context.policy,
  ).parse(authored);
  // Only the living-world review sees what the planner decided for the
  // recurring people, so it can ask whether the final package acted on it.
  const continuity = fictionScope(input).characters
    ? (() => {
        const d = draft as
          | {
              characterIntent?: FictionCharacterIntent[];
              continuityDecisions?: FictionContinuityDecision[];
            }
          | undefined;
        return d?.continuityDecisions?.length
          ? {
              continuity: {
                continuityDecisions: d.continuityDecisions,
                characterIntent: d.characterIntent ?? [],
              },
            }
          : {};
      })()
    : {};
  return {
    ...base,
    narrativeContext: checkStageContext(fictionScope(input).context),
    proposed,
    ...continuity,
  };
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
  const { context } = fictionScope(input);
  return {
    ...fictionFidelityRequest(input, authored),
    // Deterministic reuse of already-recurring wording; editor evidence only.
    ...(context.seriesLedger
      ? {
          seriesEchoFindings: seriesEchoFindings(
            authored.chapter.body,
            context.seriesLedger,
          ),
          frictionFinding: {
            markers: seriesFrictionMarkers(authored.chapter.body).slice(0, 12),
            priorRun: context.seriesLedger.frictionBeat.recentRun,
          },
        }
      : {}),
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
  const expectedVersion = fictionEditorialVersionFor(
    context.policy.qualityPolicyVersion,
  );
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
        ...(report.version !== '1.1.0'
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
    (report.version === '1.2.0' || report.version === '1.3.0') &&
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
        (report.version === '1.1.0' ||
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
  if (
    report.version === '1.0.0' ||
    report.version !== fictionEditorialVersionFor(qualityVersion)
  )
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
      (report.version === '1.1.0' ||
        (report.sequenceReview.distinctRhetoricalShape &&
          report.sequenceReview.systemMechanicsInvisible &&
          report.sequenceReview.behavioralVariety)) &&
      !report.issues.some(
        (i) => i.severity === 'major' || i.repairScope === 'canon',
      ),
  };
}
// `base` reads the draft part of a final package, which carries no intent.
export function fictionCanon(
  input: NarrativePeriodInput,
  raw: unknown,
  options: { base?: boolean } = {},
) {
  const scope = fictionScope(input),
    result = (
      scope.characters && !options.base
        ? fictionCompactDraftV9Schema
        : scope.context.policy.promptVersions.planner !== 'life_fiction_plan.v1'
          ? fictionCompactDraftSchema
          : narrativePlanningResultSchema
    ).parse(raw) as NarrativePlanningResult & {
      characterIntent?: FictionCharacterIntent[];
      continuityDecisions?: FictionContinuityDecision[];
    };
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
  // The shared plan validator reads the narrative result; the intent is
  // checked here against the character projection instead.
  const {
    characterIntent: _intent,
    continuityDecisions: _continuity,
    ...planResult
  } = result;
  validateNarrativePlan(
    planResult,
    canon,
    scope.context.memory,
    scope.references,
  );
  if (scope.characters && !options.base) {
    // An intent describes a person's own aim: wholly fictional people only,
    // never an invented private aim for a supplied person.
    const known = new Set([
      ...(scope.context.characterProjection?.actors ?? [])
        .filter((a) => a.kind === 'fictional')
        .map((a) => a.actorId),
      ...c.events.flatMap((e) =>
        e.changes.flatMap((change) =>
          change.type === 'actor_add' ? [change.value.id] : [],
        ),
      ),
    ]);
    if (result.characterIntent?.some((i) => !known.has(i.actorId)))
      fail(
        'A character intent names a person who is not a fictional recurring actor of this request.',
      );
    // A decision is about a person the projection shows; a missing decision is
    // diagnostics only (fictionContinuityCoverage), never a failure.
    const shown = new Set(
      (scope.context.characterProjection?.actors ?? []).map((a) => a.actorId),
    );
    if (result.continuityDecisions?.some((d) => !shown.has(d.actorId)))
      fail(
        'A continuity decision names a person who is not in the character projection.',
      );
  }
  return { ...scope, result, canon };
}
export function validateFictionAuthor(
  input: NarrativePeriodInput,
  raw: unknown,
) {
  const policy = fictionScope(input).context.policy;
  const authored = (
    fictionCharacterQualityVersions.includes(policy.qualityPolicyVersion)
      ? fictionCompactAuthorV9Schema
      : policy.promptVersions.writer !== 'life_fiction_author.v1'
        ? fictionCompactAuthorSchema
        : fictionAuthorResultSchema
  ).parse(raw) as FictionAuthorResult & {
    characterDelta?: FictionCharacterDelta;
  };
  const run = fictionCanon(
    input,
    {
      version: '1.0.0',
      candidate: authored.candidate,
      plan: authored.plan,
    },
    { base: true },
  );
  if (run.characters) {
    if (!authored.characterDelta)
      fail('The living-world package needs a character delta.');
    validateFictionCharacterDelta({
      periodId: input.periodId,
      envelope: run.characters.envelope,
      delta: authored.characterDelta!,
      events: authored.candidate.events,
    });
  }
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
    reviewInputHash: hash(fictionReviewRequest(input, authored, draft)),
    reviewOutputHash: hash(review),
    fidelityInputHash: hash(fictionFidelityRequest(input, authored)),
    fidelityOutputHash: hash(fidelitySchema.parse(fidelity)),
    editorialInputHash: hash(fictionEditorialRequest(input, authored)),
    editorialOutputHash: hash(editor),
    ...(run.characters
      ? {
          characterStateHash: hash(run.characters.envelope.state),
          characterProjectionHash: hash(run.context.characterProjection),
          characterDeltaHash: hash(authoredCharacterDelta(authored)),
        }
      : {}),
  };
}
function authoredCharacterDelta(authored: FictionAuthorResult) {
  return (authored as { characterDelta?: FictionCharacterDelta })
    .characterDelta;
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
      hash(fictionReviewRequest(input, repair.previous, draft)) ===
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
    hash(fictionReviewRequest(input, repair.previous, draft)) !==
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
    ...(run.characters
      ? { characterDelta: authoredCharacterDelta(authored) }
      : {}),
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
  const draft = requestDraftSchema(scope.context.policy).parse(cp.fictionDraft),
    authored = requestAuthorSchema(scope.context.policy).parse(
      cp.fictionAuthor,
    );
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
