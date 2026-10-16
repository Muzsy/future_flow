import { readFileSync, readdirSync } from 'node:fs';
import { hash } from '@future-flow/core';
import {
  narrativeArtifactSchema,
  narrativeV1Policy,
  narrativeV1PolicySchema,
  reviewedNarrativePolicy,
  narrativePlanReviewSchema,
  contextNarrativePolicy,
} from '@future-flow/contracts';
import type { Database } from '@future-flow/database';
import {
  assertPrivacySecurityCatalog,
  assertFundedPre038SecurityCatalog,
} from './privacy-security-catalog';
import { reviewedPrivacyRecoveryTables } from './privacy-recovery-schema';
import {
  validateIdentityRecords,
  validateParticipants,
} from './personal-beta-admission-observation.mjs';

export const FUNDED_CAPABILITY = 'alterward-funded-runtime-1';
const jobTables = [
  'ff_jobs',
  'aw_jobs',
  'aw_shared_jobs',
  'aw_public_review_jobs',
  'aw_public_content_reviews',
  'aw_scenario_reviews',
] as const;
const migrationName = '038_narrative_artifacts.sql';

// Exercise the image's installed contracts, rather than accepting a capability
// label from an operator JSON file. No AI provider is loaded or constructed.
export function fundedRuntimeCapabilities() {
  const supported: string[] = [];
  for (const planner of [1, 2, 3])
    for (const writer of [1, 2, 3]) {
      const policy = narrativeV1Policy();
      narrativeV1PolicySchema.parse({
        ...policy,
        promptVersions: {
          ...policy.promptVersions,
          planner: `life_narrative_plan.v${planner}`,
          writer: `life_narrative_chapter.v${writer}`,
        },
      });
      supported.push(`planner${planner}/writer${writer}/max7`);
    }
  narrativeV1PolicySchema.parse(reviewedNarrativePolicy());
  if (
    narrativeV1PolicySchema.safeParse({
      ...reviewedNarrativePolicy(),
      maxPhysicalRequests: 7,
    }).success
  )
    throw Error('Review marker ceiling mismatch');
  narrativePlanReviewSchema.parse({
    version: '1.0.0',
    scores: { agency: 4, causality: 4, novelty: 4, choiceStakes: 4 },
    issues: [],
    verdict: 'pass',
  });
  return {
    version: FUNDED_CAPABILITY,
    schema: 38,
    legacy: true,
    context: contextNarrativePolicy().promptVersions,
    policies: supported,
    reviewedPolicy: reviewedNarrativePolicy(),
    artifactVersion: '1.0.0',
  };
}

function migrationPlan() {
  const files = readdirSync('database/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (files.length !== 38 || files.at(-1) !== migrationName)
    throw Error('Exactly reviewed 001–038 source required');
  return files.map((name) => ({
    name,
    sql: readFileSync(`database/migrations/${name}`, 'utf8').replace(
      /\r\n/g,
      '\n',
    ),
  }));
}
async function migrationState(tx: Database) {
  const plan = migrationPlan();
  const applied = await tx.query<{ name: string; checksum: string }>(
    'SELECT name,checksum FROM public.ff_migrations ORDER BY name',
  );
  if (
    ![37, 38].includes(applied.length) ||
    applied.some(
      (row, i) =>
        row.name !== plan[i]?.name || row.checksum !== hash(plan[i]!.sql),
    )
  )
    throw Error('Exact 037/038 migration checksums required');
  return applied.length as 37 | 38;
}

export async function captureFundedRuntime(
  tx: Database,
  input: {
    participants: unknown;
    databaseIdentitySha256: string;
    connectionHostname: string;
  },
) {
  await tx.query("SET LOCAL timezone='UTC'");
  await tx.query("SET LOCAL statement_timeout='15s'");
  const schema = await migrationState(tx);
  const catalog =
    schema === 37
      ? await assertFundedPre038SecurityCatalog(tx)
      : await assertPrivacySecurityCatalog(tx);
  const [clock] = await tx.query<{ db: string; role: string; now: Date }>(
    'SELECT current_database() AS db,session_user AS role,clock_timestamp() AS now',
  );
  if (
    !clock ||
    hash([input.connectionHostname, clock.db, clock.role]) !==
      input.databaseIdentitySha256
  )
    throw Error('Funded database identity mismatch');
  const selection = validateParticipants(input.participants);
  const identities = await tx.query(
    `SELECT u.id,u.email,u.aud,u.role,u.is_anonymous,u.deleted_at,
    u.email_confirmed_at,u.last_sign_in_at,u.banned_until,coalesce(u.email_change,'') AS email_change,f.status,
    EXISTS(SELECT 1 FROM public.aw_account_deletions d WHERE d.user_id=u.id) AS deletion_pending,
    EXISTS(SELECT 1 FROM public.aw_shared_members m WHERE m.user_id=u.id) AS has_shared_membership,
    EXISTS(SELECT 1 FROM public.aw_shared_personal_memories m WHERE m.user_id=u.id) AS has_shared_memory
    FROM auth.users u LEFT JOIN public.ff_users f ON f.id=u.id
    WHERE u.id=ANY($1::uuid[]) OR lower(u.email)=ANY($2::text[]) LIMIT 21`,
    [selection.users, selection.emails],
  );
  const identityBindingSha256 = validateIdentityRecords(
    input.participants,
    identities,
    clock.now,
  );
  const queues = [];
  for (const table of jobTables) {
    const [row] = await tx.query<{ pending: number; leases: number }>(`SELECT
      count(*) FILTER(WHERE status IN('queued','running','validating'))::int AS pending,
      count(*) FILTER(WHERE lease_token IS NOT NULL OR lease_until IS NOT NULL)::int AS leases FROM public.${table}`);
    queues.push({ table, ...row });
  }
  const [other] = await tx.query<{
    drafts: number;
    branches: number;
    reservations: number;
    foreignSessions: number;
  }>(`SELECT
    (SELECT count(*)::int FROM public.aw_public_draft_reviews WHERE status='running') AS drafts,
    (SELECT count(*)::int FROM public.aw_branches WHERE status='generating') AS branches,
    (SELECT count(*)::int FROM public.aw_budget_reservations WHERE status IN('reserved','unknown') OR settled_at IS NULL) AS reservations,
    (SELECT count(*)::int FROM pg_catalog.pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()
      AND backend_type='client backend' AND state IS DISTINCT FROM 'idle') AS "foreignSessions"`);
  if (!other) throw Error('Incomplete funded queue observation');
  // No manual ready-commit/cancel is hidden in an upgrade. Operators finish or
  // reconcile such work through its existing reviewed path BEFORE preparing.
  if (
    queues.some((q) => q.pending !== 0 || q.leases !== 0) ||
    Object.values(other).some((v) => v !== 0)
  )
    throw Error('Funded runtime is not drained; no flags-only shortcut');
  const policies = await tx.query<{
    policy: unknown;
  }>(`SELECT payload->'narrativeContext'->'policy' AS policy FROM public.aw_jobs
    WHERE payload->'narrativeContext'->'policy' IS NOT NULL ORDER BY id LIMIT 1001`);
  if (policies.length > 1000)
    throw Error('Bounded stored policy inventory required');
  for (const { policy } of policies) {
    if (
      policy &&
      typeof policy === 'object' &&
      'mode' in policy &&
      policy.mode === 'context'
    ) {
      if (hash(policy) !== hash(contextNarrativePolicy()))
        throw Error('Unsupported stored context policy');
    } else narrativeV1PolicySchema.parse(policy);
  }
  if (schema === 38) {
    const artifacts = await tx.query<{ artifact: unknown }>(
      'SELECT narrative_artifact AS artifact FROM public.aw_periods WHERE narrative_artifact IS NOT NULL LIMIT 1001',
    );
    if (artifacts.length > 1000)
      throw Error('Bounded stored artifact inventory required');
    for (const { artifact } of artifacts)
      narrativeArtifactSchema.parse(artifact);
  }
  // Canonical data, accounting, job snapshots and privacy/control data are all
  // covered. Only the newly nullable column and the append-only migration row
  // may differ. SQL returns bounded hashes, never personal content or amounts.
  const data = await tx.query<{ table: string; count: string; digest: string }>(
    reviewedPrivacyRecoveryTables
      .map(
        (table) =>
          `SELECT '${table}' AS "table",count(*)::text AS count,md5(coalesce(string_agg(h,'' ORDER BY h),'')) AS digest FROM
      (SELECT md5((${table === 'aw_periods' ? "to_jsonb(t)-'narrative_artifact'" : 'to_jsonb(t)'})::text) AS h FROM public.${table} t) v`,
      )
      .join(' UNION ALL ') + ' ORDER BY \"table\"',
  );
  const artifacts =
    schema === 38
      ? await tx.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(h,'' ORDER BY h),'')) AS digest FROM
    (SELECT md5(narrative_artifact::text) AS h FROM public.aw_periods WHERE narrative_artifact IS NOT NULL) v`)
      : [{ count: '0', digest: 'd41d8cd98f00b204e9800998ecf8427e' }];
  return {
    version: FUNDED_CAPABILITY,
    schema,
    identityBindingSha256,
    dataSha256: hash(data),
    artifactSha256: hash(artifacts),
    catalogSha256: hash(catalog),
    policiesSha256: hash(policies),
    drained: true,
    providerApiCalls: 0,
  };
}

export async function migrateFundedRuntime(
  tx: Database,
  input: Parameters<typeof captureFundedRuntime>[1],
  expected: Awaited<ReturnType<typeof captureFundedRuntime>>,
) {
  await tx.query("SET LOCAL lock_timeout='5s'");
  await tx.query('SELECT pg_advisory_xact_lock(704203)');
  const before = await captureFundedRuntime(tx, input);
  if (hash(before) !== hash(expected))
    throw Error('Funded source drift before migration');
  if (before.schema === 37) {
    const step = migrationPlan().at(-1)!;
    await tx.query(step.sql);
    await tx.query(
      'INSERT INTO public.ff_migrations(name,checksum) VALUES($1,$2)',
      [step.name, hash(step.sql)],
    );
  }
  const after = await captureFundedRuntime(tx, input);
  if (
    after.schema !== 38 ||
    after.dataSha256 !== before.dataSha256 ||
    after.artifactSha256 !== before.artifactSha256 ||
    after.identityBindingSha256 !== before.identityBindingSha256 ||
    after.policiesSha256 !== before.policiesSha256
  )
    throw Error('Funded authority/data changed during append-only migration');
  return after;
}
