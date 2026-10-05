import { randomUUID } from 'node:crypto';
import {
  sharedMemoryImpactSchema,
  type PersonalSharedMemory,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  projectPersonalSharedMemory,
  validatePersonalSharedMemories,
} from '@future-flow/core';
import type { Database } from './index';
import type { LifeBranch } from './lives';

async function present(tx: Database) {
  const [row] = await tx.query(
    "SELECT to_regclass('public.aw_shared_personal_memories') IS NOT NULL AS present",
  );
  return row?.present === true;
}

// Caller holds the active own user and branch locks, in that order. Shared writes
// acquire all affected user locks before any context lock, so no context lock is
// needed here and no other member's personal branch is touched.
export async function materializeSharedMemories(
  tx: Database,
  branch: LifeBranch,
) {
  if (!(await present(tx))) return;
  const impacts = await tx.query<{
    id: string;
    event_id: string;
    context_id: string;
    member_id: string;
    resolution_id: string | null;
    effective_at: string;
    payload: unknown;
    payload_hash: string;
    created_at: string | Date;
  }>(
    "SELECT i.*,i.effective_at::text FROM aw_shared_impacts i JOIN aw_shared_members m ON m.id=i.member_id WHERE i.target_branch_id=$1 AND m.user_id=$2 AND m.branch_id=$1 AND m.status IN ('active','paused_entitlement') AND i.status='pending' AND i.kind='memory_only' AND i.effective_at<=$3::date ORDER BY i.effective_at,i.created_at,i.id FOR UPDATE OF i",
    [branch.id, branch.user_id, branch.state.effectiveAt],
  );
  if (!impacts.length) return;
  const [history] = await tx.query(
    'SELECT coalesce(max(position),0)+1 AS next FROM aw_history WHERE branch_id=$1 AND user_id=$2',
    [branch.id, branch.user_id],
  );
  const revision = branch.revision + 1;
  for (const row of impacts) {
    const impact = sharedMemoryImpactSchema.parse(row.payload);
    if (
      hash(impact) !== row.payload_hash ||
      impact.eventId !== row.event_id ||
      impact.memberId !== row.member_id ||
      impact.resolutionId !== row.resolution_id ||
      impact.memory.contextId !== row.context_id ||
      impact.memory.effectiveAt !== row.effective_at
    )
      throw new DomainError(
        'SHARED_IMPACT_INVALID',
        'Shared memory does not match its canon.',
        409,
      );
    const memory = projectPersonalSharedMemory(
      impact,
      branch.state.effectiveAt,
    );
    await tx.query(
      'INSERT INTO aw_shared_personal_memories(id,user_id,branch_id,source_impact_id,event_id,known_at,first_history_position,payload,source_created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        randomUUID(),
        branch.user_id,
        branch.id,
        row.id,
        row.event_id,
        memory.knownAt,
        Number(history!.next),
        JSON.stringify(memory),
        row.created_at,
      ],
    );
    await tx.query(
      "UPDATE aw_shared_impacts SET status='applied',applied_revision=$2,applied_at=now() WHERE id=$1 AND status='pending'",
      [row.id, revision],
    );
  }
  await tx.query(
    'UPDATE aw_branches SET revision=$3 WHERE id=$1 AND user_id=$2',
    [branch.id, branch.user_id, revision],
  );
  branch.revision = revision;
}

export async function personalSharedMemories(
  tx: Database,
  userId: string,
  branchId: string,
  startDate: string,
) {
  if (!(await present(tx))) return [];
  const rows = await tx.query<{ payload: PersonalSharedMemory }>(
    "SELECT payload FROM aw_shared_personal_memories WHERE user_id=$1 AND branch_id=$2 AND known_at<=$3::date ORDER BY first_history_position DESC,known_at DESC,payload->>'effectiveAt' DESC,source_created_at DESC,source_impact_id DESC LIMIT 8",
    [userId, branchId, startDate],
  );
  return validatePersonalSharedMemories(
    rows.reverse().map((r) => r.payload),
    startDate,
  );
}

// Only memory already known at the chosen chapter is inherited. Pending impacts
// and live membership stay on the original branch, even for an immediate fork.
export async function inheritSharedMemories(
  tx: Database,
  userId: string,
  parentId: string,
  childId: string,
  position: number,
  endDate: string,
) {
  if (!(await present(tx))) return;
  await tx.query(
    'INSERT INTO aw_shared_personal_memories(id,user_id,branch_id,source_impact_id,event_id,known_at,first_history_position,payload,source_created_at) SELECT gen_random_uuid(),user_id,$3,source_impact_id,event_id,known_at,first_history_position,payload,source_created_at FROM aw_shared_personal_memories WHERE user_id=$1 AND branch_id=$2 AND first_history_position<=$4 AND known_at<=$5::date',
    [userId, parentId, childId, position, endDate],
  );
}

export async function exportPersonalSharedMemories(
  tx: Database,
  userId: string,
) {
  if (!(await present(tx))) return [];
  return tx.query(
    'SELECT branch_id,event_id,known_at::text,first_history_position,payload FROM aw_shared_personal_memories WHERE user_id=$1 ORDER BY branch_id,first_history_position,created_at,id',
    [userId],
  );
}
