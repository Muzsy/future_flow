import { z } from 'zod';
import {
  narrativeMemorySchema,
  NARRATIVE_MEMORY_BYTES,
  NARRATIVE_WITHHELD_SUMMARY,
  periodCandidateV2Schema,
  type NarrativeMemory,
  narrativeMemoryDeltaSchema,
  type NarrativeMemoryDelta,
} from '@future-flow/contracts';
import { DomainError } from '@future-flow/core';
import type { Database } from './index';
import { ownedNarrativeReferences } from './narrative-artifact';

export type NarrativeConfig = Readonly<{
  mode: 'legacy' | 'context' | 'narrative-v1';
  cohortUserIds: readonly string[];
}>;
export const legacyNarrativeConfig: NarrativeConfig = Object.freeze({
  mode: 'legacy',
  cohortUserIds: Object.freeze([]),
});
export function narrativeConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): NarrativeConfig {
  const mode = env.NARRATIVE_PIPELINE_MODE ?? 'legacy';
  if (mode !== 'legacy' && mode !== 'context')
    throw new DomainError(
      'NARRATIVE_CONFIG_INVALID',
      'Unsupported narrative pipeline mode.',
    );
  const ids = (env.NARRATIVE_COHORT_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (
    ids.length > 100 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !z.uuid().safeParse(id).success)
  )
    throw new DomainError(
      'NARRATIVE_CONFIG_INVALID',
      'Invalid narrative cohort.',
    );
  return Object.freeze({ mode, cohortUserIds: Object.freeze(ids) });
}

const optionSchema =
  periodCandidateV2Schema.shape.events.element.shape.decision.unwrap().shape
    .options.element;
type HistoryRow = {
  period_id: string;
  position: number;
  start_date: string;
  end_date: string;
  events: { id: string; title: string; summary: string }[];
  chapter: { body: string } | null;
};
type ChoiceRow = {
  decision_id: string;
  option_id: string;
  payload: unknown;
  created_at: Date | string;
};

export function boundNarrativeMemory(raw: NarrativeMemory): NarrativeMemory {
  const memory = narrativeMemorySchema.parse(raw);
  const size = () => Buffer.byteLength(JSON.stringify(memory), 'utf8');
  for (const period of memory.history) {
    if (size() <= NARRATIVE_MEMORY_BYTES) break;
    period.excerpt = null;
  }
  const threadOrigins = new Set(
    memory.openThreads.map((thread) => thread.originPeriodId),
  );
  const latestHistory = memory.history.at(-1)?.periodId;
  if (latestHistory) threadOrigins.add(latestHistory);
  while (
    size() > NARRATIVE_MEMORY_BYTES &&
    memory.history.some((period) => !threadOrigins.has(period.periodId))
  ) {
    const index = memory.history.findIndex(
      (period) => !threadOrigins.has(period.periodId),
    );
    memory.history.splice(index, 1);
  }
  while (
    size() > NARRATIVE_MEMORY_BYTES &&
    memory.recentDecisionPatterns.length
  )
    memory.recentDecisionPatterns.shift();
  // Keep the latest accepted choice; older choice records can be omitted as
  // whole units after prose. Nothing is truncated inside a JSON reference.
  while (size() > NARRATIVE_MEMORY_BYTES && memory.recentChoices.length > 1)
    memory.recentChoices.shift();
  while (size() > NARRATIVE_MEMORY_BYTES && memory.fictionalActors.length)
    memory.fictionalActors.shift();
  if (size() > NARRATIVE_MEMORY_BYTES)
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative memory exceeds its input limit.',
    );
  return narrativeMemorySchema.parse(memory);
}

export async function personalNarrativeMemory(
  tx: Database,
  userId: string,
  branchId: string,
  revision: number,
  acceptedDecisionIds: string[],
  withheld: boolean,
  narrative = false,
): Promise<NarrativeMemory> {
  const history = await tx.query<Record<string, unknown> & HistoryRow>(
    `SELECT h.period_id,h.position,p.candidate->>'startDate' AS start_date,p.candidate->>'endDate' AS end_date,${withheld ? "'[]'::jsonb" : 'p.events'} AS events,${withheld ? 'NULL' : 'p.chapter'} AS chapter FROM aw_history h JOIN aw_periods p ON p.id=h.period_id AND p.user_id=h.user_id WHERE h.branch_id=$1 AND h.user_id=$2 ORDER BY h.position DESC LIMIT 8`,
    [branchId, userId],
  );
  let choices: ChoiceRow[] = [];
  if (!withheld && acceptedDecisionIds.length) {
    const [initial] = await tx.query(
      "SELECT to_regclass('public.aw_initial_choices') IS NOT NULL AS present",
    );
    choices = await tx.query<Record<string, unknown> & ChoiceRow>(
      `SELECT decision_id,option_id,payload,created_at FROM (SELECT decision_id,option_id,payload,created_at FROM aw_choices WHERE branch_id=$1 AND user_id=$2 ${initial?.present ? 'UNION ALL SELECT c.decision_id,c.option_id,c.payload,c.created_at FROM aw_initial_choices c JOIN aw_branches b ON b.life_id=c.life_id AND b.user_id=c.user_id WHERE b.id=$1 AND c.user_id=$2' : ''}) q WHERE decision_id=ANY($3::uuid[]) ORDER BY created_at DESC,decision_id DESC LIMIT 10`,
      [branchId, userId, acceptedDecisionIds],
    );
  }
  const chronological = history.reverse();
  const deltas = new Map<string, NarrativeMemoryDelta>();
  const threads = new Map<string, NarrativeMemory['openThreads'][number]>();
  const actors = new Map<string, NarrativeMemory['fictionalActors'][number]>();
  const patterns: string[] = [];
  if (narrative && !withheld) {
    const references = await ownedNarrativeReferences(tx, userId, branchId);
    const rows = await tx.query<{ period_id: string; delta: unknown }>(
      "SELECT h.period_id,p.narrative_artifact->'validatedMemoryDelta' AS delta FROM aw_history h JOIN aw_periods p ON p.id=h.period_id AND p.user_id=h.user_id WHERE h.branch_id=$1 AND h.user_id=$2 AND p.narrative_artifact IS NOT NULL ORDER BY h.position",
      [branchId, userId],
    );
    for (const row of rows) {
      const delta = narrativeMemoryDeltaSchema.parse(row.delta);
      deltas.set(row.period_id, delta);
      for (const thread of delta.threadUpdates) {
        if (thread.status === 'resolved' || thread.status === 'dropped')
          threads.delete(thread.id);
        else threads.set(thread.id, thread);
      }
      for (const actor of delta.actorUpdates) {
        if (
          references.forbiddenActorIds.has(actor.actorId) ||
          references.fictionalActorOrigins?.get(actor.actorId) !==
            actor.introducedByEventId
        )
          continue;
        // Delete/reinsert orders profiles by most recent verified appearance.
        actors.delete(actor.actorId);
        actors.set(actor.actorId, actor);
      }
      patterns.push(delta.decisionPattern);
    }
  }
  return boundNarrativeMemory({
    version: '1.0.0',
    branchId,
    baseRevision: revision,
    history: chronological.map((period, index) => {
      const delta = deltas.get(period.period_id);
      const summary = withheld
        ? NARRATIVE_WITHHELD_SUMMARY
        : (delta?.periodSummary ??
          `${period.events.map((event) => `${event.title}: ${event.summary}`).join(' ')} These events are recorded history; the period ends before its unresolved choice.`.slice(
            0,
            500,
          ));
      return {
        periodId: period.period_id,
        startDate: period.start_date,
        endDate: period.end_date,
        position: period.position,
        summary,
        salientEventIds: withheld
          ? []
          : (delta?.salientEventIds ??
            period.events.slice(0, 3).map((event) => event.id)),
        excerpt:
          !withheld && index >= chronological.length - 2 && period.chapter
            ? period.chapter.body.slice(0, 1200)
            : null,
      };
    }),
    recentChoices: choices.reverse().map((choice) => {
      const option = optionSchema.parse(choice.payload);
      if (option.id !== choice.option_id)
        throw new DomainError(
          'NARRATIVE_CONTEXT_INVALID',
          'Accepted choice binding differs.',
        );
      const changes = JSON.stringify(option.changes);
      return {
        decisionId: choice.decision_id,
        optionId: choice.option_id,
        acceptedAt: new Date(choice.created_at).toISOString(),
        label: option.label,
        changesSummary:
          changes.length <= 500
            ? changes
            : `Typed changes: ${option.changes.map((change) => change.type).join(', ')}. Current canonical state is authoritative.`,
      };
    }),
    openThreads: [...threads.values()],
    fictionalActors: [...actors.values()].slice(-12),
    recentDecisionPatterns: patterns.slice(-4),
    withheld,
  });
}
