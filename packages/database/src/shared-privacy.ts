import type { Database } from './index';
import type {
  PersonalSharedMemory,
  SharedMemoryEvent,
  SharedMemoryImpact,
  SharedState,
} from '@future-flow/contracts';
import {
  sharedMemoryImpactSchema,
  sharedStateSchema,
} from '@future-flow/contracts';

export const hiddenSharedTitle = 'Shared opportunity (details hidden)';
export const hiddenSharedSummary =
  'Some details are withheld after a participant became unavailable. The recorded date and decision outcome remain unchanged. Interest does not establish attendance.';
export type SharedPrivacy = {
  unavailableMemberIds: string[];
  participatingCount: number;
  participatingOptionIds: string[];
};

async function storagePresent(tx: Database) {
  return (
    (
      await tx.query(
        "SELECT to_regclass('public.aw_shared_events') IS NOT NULL AS present",
      )
    )[0]?.present === true
  );
}
export async function sharedPrivacyForEvents(tx: Database, ids: string[]) {
  const result = new Map<string, SharedPrivacy>();
  if (!ids.length || !(await storagePresent(tx))) return result;
  const rows = await tx.query<{
    id: string;
    unavailable_member_ids: string[];
    decision: unknown;
    result: unknown;
  }>(
    "SELECT e.id,e.decision,r.result,array_agg(m.id ORDER BY m.id) FILTER(WHERE m.status='deleted' OR m.user_id IS NULL OR u.status<>'active') AS unavailable_member_ids FROM aw_shared_events e JOIN aw_shared_event_participants p ON p.event_id=e.id JOIN aw_shared_members m ON m.id=p.member_id LEFT JOIN ff_users u ON u.id=m.user_id LEFT JOIN aw_shared_resolutions r ON r.event_id=e.id WHERE e.id=ANY($1::uuid[]) GROUP BY e.id,r.result HAVING count(*) FILTER(WHERE m.status='deleted' OR m.user_id IS NULL OR u.status<>'active')>0",
    [[...new Set(ids)]],
  );
  for (const row of rows) {
    const decision = row.decision as {
      rules?: { participatingOptionIds?: string[] };
    } | null;
    const resolution = row.result as {
      participatingMemberIds?: string[];
    } | null;
    result.set(row.id, {
      unavailableMemberIds: row.unavailable_member_ids,
      participatingCount: resolution?.participatingMemberIds?.length ?? 0,
      participatingOptionIds: decision?.rules?.participatingOptionIds ?? [],
    });
  }
  return result;
}
export async function sharedContextPrivacy(tx: Database, contextId: string) {
  if (!(await storagePresent(tx))) return false;
  const [row] = await tx.query(
    "SELECT EXISTS(SELECT 1 FROM aw_shared_event_participants p JOIN aw_shared_members m ON m.id=p.member_id LEFT JOIN ff_users u ON u.id=m.user_id WHERE p.context_id=$1 AND (m.status='deleted' OR m.user_id IS NULL OR u.status<>'active')) AS hidden",
    [contextId],
  );
  return row?.hidden === true;
}
export async function contextPrivacyEventIds(tx: Database, contextId: string) {
  const rows = await tx.query<{ id: string }>(
    'SELECT id FROM aw_shared_events WHERE context_id=$1',
    [contextId],
  );
  return [
    ...(
      await sharedPrivacyForEvents(
        tx,
        rows.map((r) => r.id),
      )
    ).keys(),
  ].sort();
}
export function projectSharedState(state: SharedState): SharedState {
  const parsed = sharedStateSchema.parse(state);
  switch (parsed.type) {
    case 'friend_group':
      return { ...parsed, summary: null, currentFocus: null };
    case 'romantic_relationship':
      return { ...parsed, summary: null };
    case 'work_project':
      return {
        ...parsed,
        summary: null,
        projectKind: 'Shared project',
        goal: 'Details hidden',
      };
    case 'hobby_group':
      return {
        ...parsed,
        summary: null,
        activity: 'Shared activity',
        currentFocus: null,
      };
    case 'sports_team':
      return { ...parsed, summary: null, sport: 'Team sport', teamGoal: null };
  }
}
export function projectSharedMemory<T extends SharedMemoryEvent>(
  memory: T,
  privacy: SharedPrivacy | undefined,
  ownOptionId: string | null,
): T {
  if (!privacy) return memory;
  return {
    ...memory,
    title: hiddenSharedTitle,
    summary:
      ownOptionId && privacy.participatingOptionIds.includes(ownOptionId)
        ? 'You expressed interest in a shared opportunity. Some details are withheld after a participant became unavailable. This records interest, not attendance.'
        : hiddenSharedSummary,
    role: null,
  };
}
export function projectPersonalMemory(
  memory: PersonalSharedMemory,
  privacy: SharedPrivacy | undefined,
) {
  return projectSharedMemory(memory, privacy, memory.ownOptionId);
}
export function projectMemoryImpact(
  raw: unknown,
  privacy: SharedPrivacy | undefined,
): SharedMemoryImpact {
  const impact = sharedMemoryImpactSchema.parse(raw);
  return privacy
    ? {
        ...impact,
        memory: projectSharedMemory(impact.memory, privacy, impact.ownOptionId),
      }
    : impact;
}
export async function personalPrivacyEventIds(
  tx: Database,
  userId: string,
  branchId: string,
  startDate: string,
) {
  const [present] = await tx.query(
    "SELECT to_regclass('public.aw_shared_personal_memories') IS NOT NULL AS present",
  );
  if (present?.present !== true) return [];
  const rows = await tx.query<{ event_id: string }>(
    'SELECT DISTINCT event_id FROM aw_shared_personal_memories WHERE user_id=$1 AND branch_id=$2 AND known_at<=$3::date',
    [userId, branchId, startDate],
  );
  return [
    ...(
      await sharedPrivacyForEvents(
        tx,
        rows.map((r) => r.event_id),
      )
    ).keys(),
  ].sort();
}
export async function privacyJobMetadataPresent(tx: Database) {
  return (
    (
      await tx.query(
        "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='aw_jobs' AND column_name='shared_privacy_event_ids') AS present",
      )
    )[0]?.present === true
  );
}
