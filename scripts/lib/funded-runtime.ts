import { reviewedMigrationManifest } from './reviewed-migration-manifest';
import { z } from 'zod';
import {
  applyServiceRegistrySchemaMigration,
  captureMigrationPrefixSha256,
} from './service-registry-schema-migration';
import { hash, emptyFictionCharacterState } from '@future-flow/core';
import {
  fictionArtifactSchema,
  fictionPolicySchema,
  fictionV1Policy,
  fictionV2Policy,
  fictionV3Policy,
  fictionV4Policy,
  fictionV5Policy,
  fictionV6Policy,
  fictionV6Quality25Policy,
  fictionV7Policy,
  fictionV8Policy,
  fictionV9Policy,
  FICTION_CHARACTER_VERSION,
  fictionCharacterStateSchema,
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
  assertFundedPre040SecurityCatalog,
  assertFundedPre039SecurityCatalog,
  assertFundedPre038SecurityCatalog,
  assertFundedPre037SecurityCatalog,
} from './privacy-security-catalog';
import {
  reviewedPre039PrivacyRecoveryTables,
  reviewedPre040PrivacyRecoveryTables,
} from './privacy-recovery-schema';
import {
  validateIdentityRecords,
  validateParticipants,
} from './personal-beta-admission-observation.mjs';

export const FUNDED_CAPABILITY = 'alterward-funded-runtime-1';
export const SERVICE_REGISTRY_CAPABILITY = 'alterward-funded-runtime-2';
export const SERVICE_REGISTRY_PROFILE = 'service-registry-040';
const jobTables = [
  'ff_jobs',
  'aw_jobs',
  'aw_shared_jobs',
  'aw_public_review_jobs',
  'aw_public_content_reviews',
  'aw_scenario_reviews',
] as const;
export type FundedSchema = 36 | 37 | 38 | 39;
type RuntimeProfile = 'legacy039' | 'registry040';
type RuntimeIdentity = {
  participants: unknown;
  databaseIdentitySha256: string;
  connectionHostname: string;
};

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
  // Every fiction generation that can sit in a frozen job, checkpoint or stored
  // artifact must be interpreted by the image, not only the narrative-v1 ones.
  for (const [name, make] of [
    ['v1', fictionV1Policy],
    ['v2', fictionV2Policy],
    ['v3', fictionV3Policy],
    ['v4', fictionV4Policy],
    ['v5', fictionV5Policy],
    ['v6', fictionV6Policy],
    ['v6q25', fictionV6Quality25Policy],
    ['v7', fictionV7Policy],
    ['v8', fictionV8Policy],
    ['v9', fictionV9Policy],
  ] as const) {
    fictionPolicySchema.parse(make());
    supported.push(`fiction-${name}`);
  }
  fictionCharacterStateSchema.parse(emptyFictionCharacterState());
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
    schema: 39,
    legacy: true,
    context: contextNarrativePolicy().promptVersions,
    policies: supported,
    reviewedPolicy: reviewedNarrativePolicy(),
    artifactVersion: '1.0.0',
    fictionArtifactVersion: '2.0.0',
    characterStateVersion: FICTION_CHARACTER_VERSION,
    fictionV9Policy: fictionV9Policy(),
  };
}

function assertStoredPolicy(policy: unknown) {
  const mode =
    policy && typeof policy === 'object' && 'mode' in policy
      ? policy.mode
      : undefined;
  if (mode === 'context') {
    if (hash(policy) !== hash(contextNarrativePolicy()))
      throw Error('Unsupported stored context policy');
  } else if (mode === 'narrative-fiction-v2') fictionPolicySchema.parse(policy);
  else narrativeV1PolicySchema.parse(policy);
}

export async function assertFundedStoredNarrativeState(
  tx: Database,
  schema: FundedSchema | 40 = 39,
) {
  // Frozen job payloads, checkpoints and (after 038) stored artifacts all carry
  // policy snapshots; every one must be interpretable by this image.
  const inventory = [
    await tx.query<{
      policy: unknown;
    }>(`SELECT payload->'narrativeContext'->'policy' AS policy FROM public.aw_jobs
    WHERE payload->'narrativeContext'->'policy' IS NOT NULL ORDER BY id LIMIT 1001`),
    await tx.query<{
      policy: unknown;
    }>(`SELECT checkpoints->'policy' AS policy FROM public.aw_jobs
    WHERE checkpoints->'policy' IS NOT NULL ORDER BY id LIMIT 1001`),
    schema >= 38
      ? await tx.query<{
          policy: unknown;
        }>(`SELECT narrative_artifact->'policy' AS policy FROM public.aw_periods
    WHERE narrative_artifact->'policy' IS NOT NULL ORDER BY id LIMIT 1001`)
      : [],
  ];
  // Each source is bounded on its own: a truncated list must never pass.
  if (inventory.some((rows) => rows.length > 1000))
    throw Error('Bounded stored policy inventory required');
  const policies = inventory.flat();
  for (const { policy } of policies) assertStoredPolicy(policy);
  if (schema >= 38) {
    const artifacts = await tx.query<{ artifact: unknown }>(
      'SELECT narrative_artifact AS artifact FROM public.aw_periods WHERE narrative_artifact IS NOT NULL LIMIT 1001',
    );
    if (artifacts.length > 1000)
      throw Error('Bounded stored artifact inventory required');
    for (const { artifact } of artifacts)
      (artifact &&
      typeof artifact === 'object' &&
      (artifact as { version?: string }).version === '2.0.0'
        ? fictionArtifactSchema
        : narrativeArtifactSchema
      ).parse(artifact);
  }
  return policies;
}

function migrationPlan(profile: RuntimeProfile = 'legacy039') {
  const full = reviewedMigrationManifest();
  return profile === 'legacy039' ? full.slice(0, 39) : full;
}
async function migrationState(tx: Database, profile: RuntimeProfile) {
  const plan = migrationPlan(profile);
  const applied = await tx.query<{ name: string; checksum: string }>(
    'SELECT name,checksum FROM public.ff_migrations ORDER BY name',
  );
  if (
    !(profile === 'legacy039' ? [36, 37, 38, 39] : [39, 40]).includes(
      applied.length,
    ) ||
    applied.some(
      (row, i) =>
        row.name !== plan[i]?.name || row.checksum !== hash(plan[i]!.sql),
    )
  )
    throw Error('Exact 036/037/038/039 migration checksums required');
  return applied.length as FundedSchema | 40;
}

export async function captureFundedRuntime(
  tx: Database,
  input: RuntimeIdentity,
) {
  const result = await captureRuntime(tx, input, 'legacy039');
  if (result.schema === 40)
    throw Error('Legacy runtime cannot observe schema040');
  return { ...result, schema: result.schema as FundedSchema };
}

async function captureRuntime(
  tx: Database,
  input: RuntimeIdentity,
  profile: RuntimeProfile,
) {
  await tx.query("SET LOCAL timezone='UTC'");
  await tx.query("SET LOCAL statement_timeout='15s'");
  const schema = await migrationState(tx, profile);
  const catalog =
    schema === 36
      ? await assertFundedPre037SecurityCatalog(tx)
      : schema === 37
        ? await assertFundedPre038SecurityCatalog(tx)
        : schema === 38
          ? await assertFundedPre039SecurityCatalog(tx)
          : schema === 39
            ? await assertFundedPre040SecurityCatalog(tx)
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
  const policies = await assertFundedStoredNarrativeState(tx, schema);
  // Canonical data, accounting, job snapshots and privacy/control data are all
  // covered. The 036 projection adds exactly the future subscriber default;
  // existing 037/038 entitlement values remain fully protected. The nullable
  // artifact column is separately hashed. No application row may be rewritten.
  const digestOf = (tables: readonly string[]) =>
    tx.query<{ table: string; count: string; digest: string }>(
      tables
        .map(
          (table) =>
            `SELECT '${table}' AS "table",count(*)::text AS count,md5(coalesce(string_agg(h,'' ORDER BY h),'')) AS digest FROM
      (SELECT md5((${table === 'aw_periods' ? "to_jsonb(t)-'narrative_artifact'" : table === 'aw_shared_members' && schema === 36 ? "to_jsonb(t)||jsonb_build_object('entitlement_mode','subscriber')" : 'to_jsonb(t)'})::text) AS h FROM public.${table} t) v`,
        )
        .join(' UNION ALL ') + ' ORDER BY "table"',
    );
  // The 96 pre-039 tables are hashed the same way at every schema, so the
  // 038→039 step can prove they were not touched and the observation keeps its
  // exact, already-recorded shape. The billing tables are not part of this
  // observation: they are empty right after the upgrade (checked in
  // migrateFundedRuntime) and change with live webhooks afterwards.
  const data = await digestOf(reviewedPre039PrivacyRecoveryTables);
  const artifacts =
    schema >= 38
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
  // The capture pins search_path to pg_catalog first, which would make an
  // unqualified CREATE TABLE target the system catalog. Migration files create
  // objects in public only; the pin is restored by the next capture.
  await tx.query("SET LOCAL search_path='public'");
  for (const step of migrationPlan().slice(before.schema)) {
    await tx.query(step.sql);
    await tx.query(
      'INSERT INTO public.ff_migrations(name,checksum) VALUES($1,$2)',
      [step.name, hash(step.sql)],
    );
  }
  const after = await captureFundedRuntime(tx, input);
  if (
    after.schema !== 39 ||
    after.dataSha256 !== before.dataSha256 ||
    after.artifactSha256 !== before.artifactSha256 ||
    after.identityBindingSha256 !== before.identityBindingSha256 ||
    after.policiesSha256 !== before.policiesSha256
  )
    throw Error('Funded authority/data changed during append-only migration');
  // A fresh billing foundation starts empty.
  if (before.schema < 39)
    for (const table of reviewedPre040PrivacyRecoveryTables.filter((t) =>
      t.startsWith('aw_billing_'),
    ))
      if (
        (
          await tx.query<{ populated: boolean }>(
            `SELECT EXISTS(SELECT 1 FROM public.${table}) AS populated`,
          )
        )[0]?.populated !== false
      )
        throw Error('Billing foundation must start empty');
  return after;
}

// Separate protocol: v1 keeps exactly its historical shape and96-table digest.
// New transports must select this profile explicitly; there is no fallback.
export function serviceRegistryRuntimeCapabilities() {
  reviewedMigrationManifest();
  return {
    ...fundedRuntimeCapabilities(),
    version: SERVICE_REGISTRY_CAPABILITY,
    profile: SERVICE_REGISTRY_PROFILE,
    schema: 40,
    fromSchema: 39,
  };
}
const billingRuntimeTables = [
  'aw_billing_events',
  'aw_billing_grants',
  'aw_billing_reservations',
  'aw_billing_subscriptions',
] as const;
const registryRuntimeTables = [
  'aw_service_policy',
  'aw_service_admissions',
] as const;
async function completeTableDigests(tx: Database, tables: readonly string[]) {
  return tx.query<{ table: string; count: string; digest: string }>(
    tables
      .map(
        (table) => `SELECT '${table}' AS "table",count(*)::text AS count,
      md5(coalesce(string_agg(h,'' ORDER BY h),'')) AS digest FROM
      (SELECT md5(to_jsonb(t)::text) AS h FROM public.${table} t) v`,
      )
      .join(' UNION ALL ') + ' ORDER BY "table"',
  );
}
export async function captureServiceRegistryRuntime(
  tx: Database,
  input: RuntimeIdentity,
) {
  const base = await captureRuntime(tx, input, 'registry040');
  if (base.schema !== 39 && base.schema !== 40)
    throw Error('Service registry runtime requires exact039 or040');
  const billing = await completeTableDigests(tx, billingRuntimeTables);
  const registry =
    base.schema === 40
      ? await completeTableDigests(tx, registryRuntimeTables)
      : null;
  return {
    ...base,
    version: SERVICE_REGISTRY_CAPABILITY,
    profile: SERVICE_REGISTRY_PROFILE,
    schema: base.schema as 39 | 40,
    billingDataSha256: hash(billing),
    migrationPrefixSha256: await captureMigrationPrefixSha256(tx),
    registryDataSha256: registry ? hash(registry) : null,
    registryRows: registry
      ? {
          policy: Number(
            registry.find((r) => r.table === 'aw_service_policy')!.count,
          ),
          admissions: Number(
            registry.find((r) => r.table === 'aw_service_admissions')!.count,
          ),
        }
      : null,
  };
}
export type ServiceRegistryRuntimeObservation = Awaited<
  ReturnType<typeof captureServiceRegistryRuntime>
>;

const runtimeDigest = z.string().regex(/^[a-f0-9]{64}$/);
const serviceRegistryObservationSchema = z
  .object({
    version: z.literal(SERVICE_REGISTRY_CAPABILITY),
    profile: z.literal(SERVICE_REGISTRY_PROFILE),
    schema: z.union([z.literal(39), z.literal(40)]),
    identityBindingSha256: runtimeDigest,
    dataSha256: runtimeDigest,
    artifactSha256: runtimeDigest,
    catalogSha256: runtimeDigest,
    policiesSha256: runtimeDigest,
    drained: z.literal(true),
    providerApiCalls: z.literal(0),
    billingDataSha256: runtimeDigest,
    migrationPrefixSha256: runtimeDigest,
    registryDataSha256: runtimeDigest.nullable(),
    registryRows: z
      .object({
        policy: z.number().int().min(0).max(1),
        admissions: z.number().int().min(0).max(100000),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.schema === 39
        ? value.registryDataSha256 === null && value.registryRows === null
        : value.registryDataSha256 !== null && value.registryRows !== null,
    { message: 'Exact schema-specific registry observation required' },
  );

export function parseServiceRegistryRuntime(value: unknown) {
  return serviceRegistryObservationSchema.parse(value);
}

export function assertServiceRegistryMigration(
  before: ServiceRegistryRuntimeObservation,
  after: ServiceRegistryRuntimeObservation,
) {
  before = parseServiceRegistryRuntime(before);
  after = parseServiceRegistryRuntime(after);
  const protectedFields = [
    'identityBindingSha256',
    'dataSha256',
    'artifactSha256',
    'policiesSha256',
    'billingDataSha256',
    'migrationPrefixSha256',
  ] as const;
  if (
    before.version !== SERVICE_REGISTRY_CAPABILITY ||
    after.version !== SERVICE_REGISTRY_CAPABILITY ||
    before.profile !== SERVICE_REGISTRY_PROFILE ||
    after.profile !== SERVICE_REGISTRY_PROFILE ||
    before.schema !== 39 ||
    after.schema !== 40 ||
    before.registryDataSha256 !== null ||
    before.registryRows !== null ||
    after.registryRows?.policy !== 0 ||
    after.registryRows?.admissions !== 0 ||
    typeof after.registryDataSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(after.registryDataSha256) ||
    before.drained !== true ||
    after.drained !== true ||
    before.providerApiCalls !== 0 ||
    after.providerApiCalls !== 0 ||
    protectedFields.some(
      (k) =>
        typeof before[k] !== 'string' ||
        !/^[a-f0-9]{64}$/.test(before[k]) ||
        before[k] !== after[k],
    )
  )
    throw Error(
      'Service registry migration changed protected data or authority',
    );
}
export async function migrateServiceRegistryRuntime(
  tx: Database,
  input: RuntimeIdentity,
  expected: ServiceRegistryRuntimeObservation,
) {
  if (
    !expected ||
    expected.version !== SERVICE_REGISTRY_CAPABILITY ||
    expected.profile !== SERVICE_REGISTRY_PROFILE ||
    expected.schema !== 39
  )
    throw Error('Exact039 service registry baseline required');
  await tx.query("SET LOCAL lock_timeout='5s'");
  await tx.query('SELECT pg_advisory_xact_lock(704203)');
  const before = await captureServiceRegistryRuntime(tx, input);
  if (hash(before) !== hash(expected))
    throw Error('Service registry source drift before migration');
  await applyServiceRegistrySchemaMigration(tx);
  const after = await captureServiceRegistryRuntime(tx, input);
  assertServiceRegistryMigration(before, after);
  return after;
}
