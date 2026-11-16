import {
  POLITICAL_CATALOG_VERSION,
  storyCatalogs,
  type NarrativePeriodInput,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  normalizePoliticalPremise,
} from '@future-flow/core';
import type { Database } from './index';

export async function assertNoActiveGeneratedPoliticalStart(
  tx: Database,
  userId: string,
  subtype: string,
) {
  const [active] = await tx.query(
    "SELECT 1 FROM aw_jobs WHERE user_id=$1 AND status IN ('queued','running') AND payload ? 'generatedPoliticalStart' AND payload #>> '{input,story,emphases,0,subtype}'=$2 LIMIT 1",
    [userId, subtype],
  );
  if (active)
    throw new DomainError(
      'STORY_START_GENERATION_PENDING',
      'An opening issue is already being generated for this subtype.',
      409,
    );
}

export async function prepareGeneratedPoliticalStart(
  tx: Database,
  userId: string,
  subtype: string,
): Promise<NonNullable<NarrativePeriodInput['generatedPoliticalStart']>> {
  const issues = Object.values(
    storyCatalogs[POLITICAL_CATALOG_VERSION].directions.politics.situations,
  ).filter(
    (issue) =>
      issue.selectable &&
      (issue.subtypes as readonly string[]).includes(subtype),
  );
  const history = await tx.query<{
    issue_key: string;
    generated_subtype: string | null;
    generated_premise: string | null;
  }>(
    'SELECT issue_key,generated_subtype,generated_premise FROM aw_political_start_history WHERE user_id=$1 ORDER BY issue_key',
    [userId],
  );
  const used = new Set(history.map(({ issue_key }) => issue_key));
  if (!issues.length || issues.some(({ issueKey }) => !used.has(issueKey)))
    throw new DomainError(
      'STORY_START_CATALOG_AVAILABLE',
      'An unused starting issue is still available.',
      409,
    );
  return {
    catalogue: issues.map(({ engine }) => engine.brief),
    previous: history.flatMap((row) =>
      row.generated_subtype === subtype && row.generated_premise
        ? [row.generated_premise]
        : [],
    ),
  };
}

export async function reserveGeneratedPoliticalStart(
  tx: Database,
  userId: string,
  subtype: string,
  premise: string,
  snapshot: NonNullable<NarrativePeriodInput['generatedPoliticalStart']>,
) {
  if (
    hash(snapshot) !==
    hash(await prepareGeneratedPoliticalStart(tx, userId, subtype))
  )
    throw new DomainError(
      'STORY_START_HISTORY_CHANGED',
      'Starting issue history has changed.',
      409,
    );
  const normalized = normalizePoliticalPremise(premise);
  const rows = await tx.query(
    'INSERT INTO aw_political_start_history(user_id,issue_key,generated_subtype,generated_premise) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING issue_key',
    [userId, 'generated:' + hash(normalized), subtype, premise],
  );
  if (!rows.length)
    throw new DomainError(
      'STORY_START_ALREADY_USED',
      'This starting issue was already used.',
      409,
    );
}
