import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import type { Database } from '@future-flow/database';
import { setupFixture } from './life-fixtures';
import {
  parkStoryDrafts,
  parseStoryDraftArchive,
  planStoryDraftQuarantine,
  restoreStoryDrafts,
  type StoryDraftArchive,
} from '../scripts/lib/story-draft-quarantine';

it('parks only after archive persistence and restores without overwriting newer common fields', async () => {
  const pg = new PGlite();
  const adapter = (client: Pick<PGlite, 'query'>): Database => ({
    query: async (sql, params) =>
      (await client.query(sql, params)).rows as never,
    transaction: (run) => pg.transaction((tx) => run(adapter(tx))),
  });
  const db = adapter(pg);
  const owner = '11111111-1111-4111-8111-111111111111';
  const original = {
    ...setupFixture(),
    relationships: [
      {
        label: 'Ari',
        relationship: 'friend',
        address: { mode: 'engine_decides' },
      },
    ],
    story: {
      contractVersion: '1.0.0',
      catalogVersion: '1.0.0',
      direction: 'creative',
      subtype: 'personal',
      answers: { field: 'music' },
      startingSituation: {
        id: 'custom',
        note: 'A new studio opens its doors.',
      },
      boundaries: [],
      title: null,
      goalChoice: 'none',
    },
  };
  try {
    await pg.exec(`
      CREATE TABLE aw_drafts(user_id uuid PRIMARY KEY, revision int, payload jsonb, updated_at timestamptz);
      CREATE TABLE aw_jobs(status text, payload jsonb);
      INSERT INTO aw_jobs VALUES ('queued', '{"narrativeContext":{"policy":{"qualityPolicyVersion":"2.9.0"}}}');
    `);
    await db.query('INSERT INTO aw_drafts VALUES ($1, 1, $2::jsonb, now())', [
      owner,
      JSON.stringify(original),
    ]);
    expect(await planStoryDraftQuarantine(db)).toEqual({
      drafts: 1,
      pendingV10Jobs: 1,
    });
    await expect(
      parkStoryDrafts(db, async () => {
        throw new Error('unexpected archive');
      }),
    ).rejects.toThrow('v10 jobs');
    await db.query("UPDATE aw_jobs SET status='completed'");
    await expect(
      parkStoryDrafts(db, async () => {
        throw new Error('archive unavailable');
      }),
    ).rejects.toThrow('archive unavailable');
    expect((await db.query('SELECT revision FROM aw_drafts'))[0]).toEqual({
      revision: 1,
    });

    let archive!: StoryDraftArchive;
    expect(
      await parkStoryDrafts(db, async (value) => {
        archive = value;
      }),
    ).toEqual({ parked: 1 });
    expect(await planStoryDraftQuarantine(db)).toEqual({
      drafts: 0,
      pendingV10Jobs: 0,
    });
    const tampered = structuredClone(archive);
    tampered.records[0]!.story.title = 'Changed';
    expect(() => parseStoryDraftArchive(tampered)).toThrow('integrity');

    await db.query(
      "UPDATE aw_drafts SET revision=revision+1, payload=jsonb_set(payload, '{context}', to_jsonb('New common answer'::text))",
    );
    expect(await restoreStoryDrafts(db, archive)).toEqual({
      restored: 1,
      skipped: 0,
      skippedAddresses: 0,
    });
    expect(
      (await db.query('SELECT revision,payload FROM aw_drafts'))[0],
    ).toEqual({
      revision: 4,
      payload: { ...original, context: 'New common answer' },
    });
    expect(await restoreStoryDrafts(db, archive)).toEqual({
      restored: 0,
      skipped: 1,
      skippedAddresses: 0,
    });
  } finally {
    await pg.close();
  }
});
