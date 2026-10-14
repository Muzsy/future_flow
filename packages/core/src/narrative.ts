import {
  narrativePlanningResultSchema,
  narrativeMemorySchema,
  narrativeMemoryDeltaSchema,
  narrativeEditorialReportSchema,
  narrativeArtifactSchema,
  narrativeDimensions,
  narrativeReferenceSnapshotSchema,
  type NarrativeReferenceSnapshot,
  NARRATIVE_ARTIFACT_BYTES,
  type NarrativeMemory,
  type NarrativeEditorialReport,
  type NarrativeArtifact,
  type NarrativeDimension,
  type PeriodChapterV2,
} from '@future-flow/contracts';
import { DomainError } from './errors';
import { hash } from './index';
import type { simulatePeriodV2 } from './life-v2';

type Canon = ReturnType<typeof simulatePeriodV2>;
export type NarrativeReferences = {
  // Constructed from owned history by the server, never AI-supplied authority.
  periodPositions: ReadonlyMap<string, number>;
  historyEventIds: ReadonlySet<string>;
  usedCanonicalIds?: ReadonlySet<string>;
  usedThreadIds: ReadonlySet<string>;
  forbiddenActorIds: ReadonlySet<string>;
  forbiddenActorLabels?: ReadonlySet<string>;
  fictionalActorOrigins?: ReadonlyMap<string, string>;
};
function invalid(message: string): never {
  throw new DomainError('NARRATIVE_PLAN_INVALID', message);
}
function unique(ids: readonly string[], name: string) {
  if (new Set(ids).size !== ids.length) invalid(`Duplicate ${name}.`);
}
function known(
  ids: readonly string[],
  allowed: ReadonlySet<string>,
  name: string,
) {
  unique(ids, name);
  if (ids.some((id) => !allowed.has(id))) invalid(`Unknown ${name}.`);
}
export function narrativeReferencesFromMemory(
  memory: NarrativeMemory,
): NarrativeReferences {
  return {
    periodPositions: new Map(
      memory.history.map((period) => [period.periodId, period.position]),
    ),
    historyEventIds: new Set(
      memory.history.flatMap((period) => period.salientEventIds),
    ),
    usedCanonicalIds: new Set([
      ...memory.history.flatMap((period) => period.salientEventIds),
      ...memory.recentChoices.flatMap((choice) => [
        choice.decisionId,
        choice.optionId,
      ]),
    ]),
    usedThreadIds: new Set(memory.openThreads.map((thread) => thread.id)),
    forbiddenActorIds: new Set(),
    fictionalActorOrigins: new Map(
      memory.fictionalActors.map((actor) => [
        actor.actorId,
        actor.introducedByEventId,
      ]),
    ),
  };
}
export function narrativeReferenceSnapshot(
  references: NarrativeReferences,
): NarrativeReferenceSnapshot {
  return narrativeReferenceSnapshotSchema.parse({
    periodPositions: [...references.periodPositions]
      .map(([periodId, position]) => ({ periodId, position }))
      .sort(
        (a, b) =>
          a.position - b.position || a.periodId.localeCompare(b.periodId),
      ),
    historyEventIds: [...references.historyEventIds].sort(),
    usedCanonicalIds: [
      ...(references.usedCanonicalIds ?? references.historyEventIds),
    ].sort(),
    usedThreadIds: [...references.usedThreadIds].sort(),
    forbiddenActorIds: [...references.forbiddenActorIds].sort(),
    forbiddenActorLabels: [...(references.forbiddenActorLabels ?? [])].sort(),
    fictionalActorOrigins: [
      ...(references.fictionalActorOrigins ?? new Map<string, string>()),
    ]
      .map(([actorId, introducedByEventId]) => ({
        actorId,
        introducedByEventId,
      }))
      .sort((a, b) => a.actorId.localeCompare(b.actorId)),
  });
}
export function narrativeReferencesFromSnapshot(
  raw: unknown,
): NarrativeReferences {
  const snapshot = narrativeReferenceSnapshotSchema.parse(raw);
  unique(
    snapshot.periodPositions.map((p) => p.periodId),
    'history period',
  );
  unique(
    snapshot.periodPositions.map((p) => String(p.position)),
    'history position',
  );
  unique(snapshot.historyEventIds, 'history event');
  unique(snapshot.usedThreadIds, 'used thread');
  unique(snapshot.forbiddenActorIds, 'forbidden actor');
  unique(snapshot.forbiddenActorLabels, 'forbidden actor label');
  unique(
    snapshot.fictionalActorOrigins.map((actor) => actor.actorId),
    'fictional actor origin',
  );
  unique(snapshot.usedCanonicalIds, 'used canonical id');
  if (
    snapshot.fictionalActorOrigins.some(
      (actor) => !snapshot.historyEventIds.includes(actor.introducedByEventId),
    )
  )
    invalid('Fictional actor origin lacks owned history evidence.');
  return {
    periodPositions: new Map(
      snapshot.periodPositions.map((p) => [p.periodId, p.position]),
    ),
    historyEventIds: new Set(snapshot.historyEventIds),
    usedThreadIds: new Set(snapshot.usedThreadIds),
    forbiddenActorIds: new Set(snapshot.forbiddenActorIds),
    forbiddenActorLabels: new Set(snapshot.forbiddenActorLabels),
    fictionalActorOrigins: new Map(
      snapshot.fictionalActorOrigins.map((actor) => [
        actor.actorId,
        actor.introducedByEventId,
      ]),
    ),
    usedCanonicalIds: new Set(snapshot.usedCanonicalIds),
  };
}

export function validateNarrativeMemoryDelta(
  rawDelta: unknown,
  canon: Canon,
  rawMemory: NarrativeMemory,
  references: NarrativeReferences,
) {
  const delta = narrativeMemoryDeltaSchema.parse(rawDelta);
  const memory = narrativeMemorySchema.parse(rawMemory);
  const ids = new Set(canon.events.map((event) => event.id));
  known(delta.salientEventIds, ids, 'salient event');
  unique(
    delta.threadUpdates.map((thread) => thread.id),
    'thread update',
  );
  unique(
    delta.actorUpdates.map((actor) => actor.actorId),
    'actor update',
  );
  if (references.periodPositions.has(canon.period.periodId))
    invalid('Period already belongs to history.');
  const currentPosition =
    Math.max(0, ...references.periodPositions.values()) + 1;
  const availableEvents = new Set([...references.historyEventIds, ...ids]);
  const oldThreads = new Map(
    memory.openThreads.map((thread) => [thread.id, thread]),
  );
  const updatedThreads = new Map(
    delta.threadUpdates.map((thread) => [thread.id, thread]),
  );
  for (const thread of delta.threadUpdates) {
    if (thread.lastTouchedPeriodId !== canon.period.periodId)
      invalid('Thread update is not from this period.');
    known(thread.eventRefs, availableEvents, 'thread event');
    if (!thread.eventRefs.some((id) => ids.has(id)))
      invalid('Thread update has no current event.');
    const previous = oldThreads.get(thread.id);
    if (!previous) {
      if (references.usedThreadIds.has(thread.id))
        invalid('Closed or omitted thread ID reused.');
      if (
        thread.originPeriodId !== canon.period.periodId ||
        !ids.has(thread.originEventId)
      )
        invalid('New thread has a foreign origin.');
    } else {
      if (previous.status === 'resolved' || previous.status === 'dropped')
        invalid('Closed thread reopened.');
      if (
        thread.originPeriodId !== previous.originPeriodId ||
        thread.originEventId !== previous.originEventId ||
        thread.kind !== previous.kind ||
        thread.dueByPeriodOffset !== previous.dueByPeriodOffset
      )
        invalid('Thread origin or deadline changed.');
    }
  }
  for (const previous of memory.openThreads) {
    if (previous.status === 'resolved' || previous.status === 'dropped')
      continue;
    const origin = references.periodPositions.get(previous.originPeriodId);
    if (
      origin === undefined ||
      !references.historyEventIds.has(previous.originEventId)
    )
      invalid('Thread origin lacks owned history evidence.');
    const update = updatedThreads.get(previous.id);
    if (
      currentPosition - origin >= previous.dueByPeriodOffset &&
      (!update || (update.status !== 'resolved' && update.status !== 'dropped'))
    )
      invalid('Thread exceeded its fixed resolution deadline.');
  }
  const remaining = [
    ...memory.openThreads.filter((thread) => !updatedThreads.has(thread.id)),
    ...delta.threadUpdates,
  ].filter(
    (thread) => thread.status === 'open' || thread.status === 'progressed',
  );
  if (remaining.length > 6) invalid('Too many open threads.');

  const priorActors = new Map(
    memory.fictionalActors.map((actor) => [actor.actorId, actor]),
  );
  const introduced = new Map<string, string>();
  for (const event of canon.events)
    for (const change of event.changes)
      if (change.type === 'actor_add') {
        if (references.forbiddenActorIds.has(change.value.id))
          invalid('Shared identity cannot become a fictional actor.');
        const label = change.value.label.trim().toLocaleLowerCase('en');
        if (
          references.forbiddenActorLabels?.has(label) ||
          canon.events[0]!.stateBefore.actors.some(
            (actor) => actor.label.trim().toLocaleLowerCase('en') === label,
          )
        )
          invalid('New actor duplicates a supplied identity.');
        introduced.set(change.value.id, event.id);
      }
  if (introduced.size > 1)
    invalid('Only one new recurring actor may be introduced.');
  for (const actor of delta.actorUpdates) {
    if (
      actor.lastSeenPeriodId !== canon.period.periodId ||
      references.forbiddenActorIds.has(actor.actorId)
    )
      invalid('Actor update has a foreign scope.');
    const previous = priorActors.get(actor.actorId);
    if (
      previous
        ? actor.introducedByEventId !== previous.introducedByEventId
        : (introduced.get(actor.actorId) ??
            references.fictionalActorOrigins?.get(actor.actorId)) !==
          actor.introducedByEventId
    )
      invalid('Actor has no verified fictional provenance.');
    if (
      !canon.events.some((event) =>
        event.stateAfter.actors.some((present) => present.id === actor.actorId),
      )
    )
      invalid('Actor does not exist in the canon.');
  }
  return delta;
}

export function validateNarrativePlan(
  raw: unknown,
  canon: Canon,
  rawMemory: NarrativeMemory,
  references?: NarrativeReferences,
) {
  const result = narrativePlanningResultSchema.parse(raw);
  const memory = narrativeMemorySchema.parse(rawMemory);
  if (
    !references &&
    (memory.history.length ||
      memory.openThreads.length ||
      memory.fictionalActors.length)
  )
    invalid('Continuation needs an explicit owned history reference snapshot.');
  const ownedReferences = references ?? narrativeReferencesFromMemory(memory);
  const canonicalIds = result.candidate.events.flatMap((event) => [
    event.id,
    ...(event.decision
      ? [
          event.decision.id,
          ...event.decision.options.map((option) => option.id),
        ]
      : []),
  ]);
  unique(canonicalIds, 'canonical id');
  if (
    canonicalIds.some((id) =>
      (ownedReferences.usedCanonicalIds ?? ownedReferences.historyEventIds).has(
        id,
      ),
    )
  )
    invalid('Canonical event or decision ID reused.');
  if (canon.period.durationMonths !== 6)
    invalid('Narrative plans require a six-month personal period.');
  if (hash(result.candidate) !== hash(canon.period))
    invalid('Plan candidate differs from validated canon.');
  if (
    memory.branchId !== canon.period.branchId ||
    memory.baseRevision !== canon.period.baseRevision
  )
    invalid('Memory belongs to another branch revision.');
  const plan = result.plan,
    ids = new Set(canon.events.map((event) => event.id));
  const indices = new Map(
    canon.events.map((event, index) => [event.id, index]),
  );
  unique(
    plan.scenes.map((scene) => scene.sceneId),
    'scene',
  );
  unique(
    plan.scenes.flatMap((scene) => scene.eventIds),
    'scene event',
  );
  let lastIndex = -1;
  for (const scene of plan.scenes) {
    known(scene.eventIds, ids, 'scene event');
    const positions = scene.eventIds.map((id) => indices.get(id)!);
    if (
      positions[0]! <= lastIndex ||
      positions.some((index, n) => n > 0 && index <= positions[n - 1]!)
    )
      invalid('Scene chronology overlaps or moves backwards.');
    lastIndex = positions.at(-1)!;
    const actors = new Set(
      canon.events[positions[0]!]!.stateAfter.actors.map((actor) => actor.id),
    );
    known(scene.actorIds, actors, 'scene actor');
    const participants = new Set(
      scene.eventIds.flatMap(
        (eventId) => canon.events[indices.get(eventId)!]!.actorIds,
      ),
    );
    known(scene.actorIds, participants, 'scene participant');
  }
  if (
    !ids.has(plan.turningPointEventId) ||
    !plan.scenes.some(
      (scene) =>
        (scene.purpose === 'payoff' || scene.purpose === 'turning_point') &&
        scene.eventIds.includes(plan.turningPointEventId),
    )
  )
    invalid('Turning point is missing from a concrete scene.');
  const decision = canon.events.at(-1)!.decision!;
  const options = new Set(decision.options.map((option) => option.id));
  known(
    plan.decisionStakes.map((stake) => stake.optionId),
    options,
    'decision stake',
  );
  if (plan.decisionStakes.length !== options.size)
    invalid('A final option has no stakes.');
  for (const stake of plan.decisionStakes)
    known(stake.eventIds, ids, 'stake event');
  const choices = new Map(
    memory.recentChoices.map((choice) => [choice.decisionId, choice.optionId]),
  );
  unique(
    plan.choiceConsequences.map((consequence) => consequence.decisionId),
    'choice consequence',
  );
  for (const consequence of plan.choiceConsequences) {
    if (choices.get(consequence.decisionId) !== consequence.optionId)
      invalid('Consequence is not an accepted branch choice.');
    known(consequence.eventIds, ids, 'consequence event');
    if (consequence.disposition === 'delayed') {
      const thread =
        plan.memoryDelta.threadUpdates.find(
          (thread) => thread.id === consequence.threadId,
        ) ??
        memory.openThreads.find((thread) => thread.id === consequence.threadId);
      if (
        !thread ||
        (thread.status !== 'open' && thread.status !== 'progressed')
      )
        invalid('Delayed consequence needs an open, bounded thread.');
    }
  }
  const latest = memory.recentChoices.at(-1);
  if (
    !memory.withheld &&
    latest &&
    !plan.choiceConsequences.some(
      (consequence) => consequence.decisionId === latest.decisionId,
    )
  )
    invalid('The latest accepted choice has no consequence.');
  if (plan.decisionPattern !== plan.memoryDelta.decisionPattern)
    invalid('Decision pattern differs across the memory delta.');
  validateNarrativeMemoryDelta(
    plan.memoryDelta,
    canon,
    memory,
    ownedReferences,
  );
  return result;
}

const critical: readonly NarrativeDimension[] = [
  'causality',
  'momentum',
  'sceneCraft',
  'choiceStakes',
  'prose',
];
export function evaluateNarrativeEditorialGate(raw: unknown) {
  const report = narrativeEditorialReportSchema.parse(raw);
  const overall =
    Math.round(
      (narrativeDimensions.reduce(
        (sum, dimension) => sum + report.scores[dimension],
        0,
      ) /
        narrativeDimensions.length) *
        100,
    ) / 100;
  const failedDimensions = critical.filter(
    (dimension) => report.scores[dimension] < 4,
  );
  return {
    report,
    overall,
    failedDimensions,
    passed:
      failedDimensions.length === 0 &&
      overall >= 4 &&
      !report.issues.some((issue) => issue.severity === 'major'),
  };
}
export function validateNarrativeEditorialReport(
  raw: unknown,
  chapter: PeriodChapterV2,
  canon: Canon,
): NarrativeEditorialReport {
  const report = narrativeEditorialReportSchema.parse(raw);
  const paragraphs = chapter.body
    .split(/\n\s*\n/)
    .filter((part) => part.trim()).length;
  const ids = new Set(canon.events.map((event) => event.id));
  for (const issue of report.issues) {
    if (issue.paragraphIndex !== null && issue.paragraphIndex > paragraphs)
      invalid('Editorial issue points beyond the chapter.');
    known(issue.eventIds, ids, 'editorial event');
  }
  return report;
}
export function validateNarrativeArtifact(
  raw: unknown,
  expectedBindings: NarrativeArtifact['bindings'],
): NarrativeArtifact {
  const artifact = narrativeArtifactSchema.parse(raw);
  if (
    Buffer.byteLength(JSON.stringify(artifact), 'utf8') >
    NARRATIVE_ARTIFACT_BYTES
  )
    invalid('Narrative artifact exceeds its storage limit.');
  if (
    hash(artifact.bindings) !== hash(expectedBindings) ||
    artifact.bindings.policyHash !== hash(artifact.policy) ||
    artifact.bindings.planHash !== hash(artifact.validatedPlan)
  )
    invalid('Narrative artifact binding differs.');
  if (
    hash(artifact.validatedPlan.memoryDelta) !==
      hash(artifact.validatedMemoryDelta) ||
    hash(artifact.policy.promptVersions) !==
      hash(artifact.provenance.promptVersions)
  )
    invalid('Narrative artifact repeats inconsistent data.');
  unique(
    artifact.provenance.receiptRefs.map((receipt) => String(receipt.ordinal)),
    'receipt ordinal',
  );
  if (
    artifact.provenance.receiptRefs.some(
      (receipt, index) => receipt.ordinal !== index,
    )
  )
    invalid('Receipt references are not in their recorded order.');
  const required = [
    'life_narrative_plan',
    'life_narrative_chapter',
    'life_fidelity',
    'life_narrative_editor',
  ];
  if (
    required.some(
      (task) =>
        !artifact.provenance.receiptRefs.some(
          (receipt) => receipt.task === task,
        ),
    )
  )
    invalid('Narrative artifact lacks a required receipt.');
  const last = (
    task: NarrativeArtifact['provenance']['receiptRefs'][number]['task'],
  ) =>
    artifact.provenance.receiptRefs
      .filter((receipt) => receipt.task === task)
      .at(-1)!;
  const planner = last('life_narrative_plan'),
    writer = last('life_narrative_chapter'),
    fidelity = last('life_fidelity'),
    editor = last('life_narrative_editor');
  if (
    planner.outputHash !== expectedBindings.planningOutputHash ||
    writer.inputHash !== expectedBindings.storyInputHash ||
    writer.outputHash !== expectedBindings.chapterHash ||
    fidelity.inputHash !== expectedBindings.fidelityInputHash ||
    fidelity.outputHash !== expectedBindings.fidelityOutputHash ||
    editor.inputHash !== expectedBindings.editorialInputHash ||
    editor.outputHash !== hash(artifact.editorialReport)
  )
    invalid('Receipt does not bind the final validated result.');
  if (!evaluateNarrativeEditorialGate(artifact.editorialReport).passed)
    throw new DomainError(
      'NARRATIVE_QUALITY_FAILED',
      'Narrative artifact did not pass its editorial gate.',
    );
  return artifact;
}
