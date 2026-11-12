import { hash } from '@future-flow/core';
import { z } from 'zod';
import {
  lifeDraftV2Schema,
  lifeStoryDraftRequestV2Schema,
  storyDraftV1Schema,
  storyAddressSchema,
} from '@future-flow/contracts';
import type { Database } from '@future-flow/database';

const affected = `jsonb_typeof(payload) = 'object' AND (
  payload ? 'story' OR jsonb_path_exists(payload, '$.relationships[*].address')
)`;
const pending = `status IN ('queued', 'running')
  AND payload #>> '{narrativeContext,policy,qualityPolicyVersion}' = '2.9.0'`;

type DraftRow = {
  user_id: string;
  revision: number;
  payload: unknown;
};

export async function planStoryDraftQuarantine(db: Database) {
  const [counts] = await db.query<{ drafts: number; pendingV10Jobs: number }>(
    `SELECT (SELECT count(*)::int FROM aw_drafts WHERE ${affected}) AS drafts,
       (SELECT count(*)::int FROM aw_jobs WHERE ${pending}) AS "pendingV10Jobs"`,
  );
  if (!counts) throw new Error('Missing quarantine inventory');
  return counts;
}

function splitDraft(row: DraftRow) {
  const original = lifeStoryDraftRequestV2Schema.parse(row.payload);
  const { story, relationships, ...common } = original;
  const parked = lifeDraftV2Schema.parse({
    ...common,
    relationships: relationships.map(({ label, relationship }) => ({
      label,
      relationship,
    })),
  });
  return {
    userId: row.user_id,
    revision: row.revision,
    story,
    addresses: relationships.flatMap(
      ({ address, label, relationship }, index) =>
        address ? [{ index, label, relationship, address }] : [],
    ),
    payloadSha256: hash(row.payload),
    parked,
  };
}

const archiveSchema = z.strictObject({
  version: z.literal(1),
  records: z.array(
    z.strictObject({
      userId: z.uuid(),
      revision: z.number().int().positive(),
      story: storyDraftV1Schema,
      addresses: z
        .array(
          z.strictObject({
            index: z.number().int().min(0).max(9),
            label: z.string(),
            relationship:
              lifeDraftV2Schema.shape.relationships.element.shape.relationship,
            address: storyAddressSchema,
          }),
        )
        .max(10),
      payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
      parked: lifeDraftV2Schema,
    }),
  ),
});

export type StoryDraftArchive = z.infer<typeof archiveSchema>;

function mergeArchivedDraft(
  record: StoryDraftArchive['records'][number],
  common: z.infer<typeof lifeDraftV2Schema>,
) {
  return lifeStoryDraftRequestV2Schema.parse({
    ...common,
    story: record.story,
    relationships: common.relationships.map((actor, index) => {
      const archived = record.addresses.find((item) => item.index === index);
      return archived?.label === actor.label &&
        archived.relationship === actor.relationship
        ? { ...actor, address: archived.address }
        : actor;
    }),
  });
}

export function parseStoryDraftArchive(raw: unknown): StoryDraftArchive {
  const archive = archiveSchema.parse(raw);
  const users = new Set<string>();
  for (const record of archive.records) {
    if (
      users.has(record.userId) ||
      hash(mergeArchivedDraft(record, record.parked)) !== record.payloadSha256
    )
      throw new Error('Archive integrity check failed');
    users.add(record.userId);
  }
  return archive;
}

export async function parkStoryDrafts(
  db: Database,
  persistArchive: (archive: StoryDraftArchive) => Promise<void>,
) {
  return db.transaction(async (tx) => {
    await tx.query("SET LOCAL lock_timeout = '5s'");
    // Keep the inventory, archive and updates in a single database transaction.
    await tx.query('LOCK TABLE aw_jobs, aw_drafts IN SHARE ROW EXCLUSIVE MODE');
    const counts = await planStoryDraftQuarantine(tx);
    if (counts.pendingV10Jobs !== 0)
      throw new Error('Queued or running v10 jobs must finish before parking');
    if (counts.drafts === 0) return { parked: 0 };
    const rows = await tx.query<DraftRow>(
      `SELECT user_id, revision, payload
       FROM aw_drafts WHERE ${affected} ORDER BY user_id FOR UPDATE`,
    );
    const records = rows.map(splitDraft);
    await persistArchive(parseStoryDraftArchive({ version: 1, records }));
    for (const record of records) {
      const updated = await tx.query(
        `UPDATE aw_drafts SET payload=$1::jsonb, revision=revision+1, updated_at=now()
         WHERE user_id=$2 AND revision=$3 RETURNING revision`,
        [JSON.stringify(record.parked), record.userId, record.revision],
      );
      if (updated.length !== 1)
        throw new Error('Draft revision changed while parking');
    }
    return { parked: records.length };
  });
}

export async function restoreStoryDrafts(
  db: Database,
  archive: StoryDraftArchive,
) {
  return db.transaction(async (tx) => {
    await tx.query("SET LOCAL lock_timeout = '5s'");
    const result = { restored: 0, skipped: 0, skippedAddresses: 0 };
    for (const record of archive.records) {
      const [row] = await tx.query<DraftRow>(
        'SELECT user_id, revision, payload FROM aw_drafts WHERE user_id=$1 FOR UPDATE',
        [record.userId],
      );
      const common = lifeDraftV2Schema.safeParse(row?.payload);
      if (
        !row ||
        row.revision <= record.revision ||
        !common.success ||
        (row.revision === record.revision + 1 &&
          hash(row.payload) !== hash(record.parked))
      ) {
        result.skipped++;
        continue;
      }
      const restored = mergeArchivedDraft(record, common.data);
      result.skippedAddresses += record.addresses.filter(
        ({ index }) => !restored.relationships[index]?.address,
      ).length;
      const updated = await tx.query(
        `UPDATE aw_drafts SET payload=$1::jsonb, revision=revision+1, updated_at=now()
         WHERE user_id=$2 AND revision=$3 RETURNING revision`,
        [JSON.stringify(restored), record.userId, row.revision],
      );
      if (updated.length !== 1)
        throw new Error('Draft revision changed while restoring');
      result.restored++;
    }
    return result;
  });
}
