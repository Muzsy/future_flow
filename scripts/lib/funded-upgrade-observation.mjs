import { createHash } from 'node:crypto';

// Read-only evidence for the N09 funded-runtime upgrade (Issue #34). Nothing
// here writes, starts a provider or emits an email, UUID or credential: only
// counts, exact micro-USD totals and SHA-256 digests leave the database.

export const OBSERVATION_VERSION = 'alterward-funded-observation-1';
export const CAPABILITY_VERSION = 'alterward-runtime-capability-1';
export const MAX_POLICIES = 64;

const QUEUE_TABLES = [
  'ff_jobs',
  'aw_jobs',
  'aw_shared_jobs',
  'aw_public_review_jobs',
  'aw_public_content_reviews',
  'aw_scenario_reviews',
];

const fail = () => {
  throw Error('Funded upgrade observation refused');
};

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

export const digest = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');

// Same checksum as scripts/migrate.ts: core hash() of the LF-normalized text.
export const migrationChecksum = (text) =>
  createHash('sha256')
    .update(JSON.stringify(text.replace(/\r\n/g, '\n')))
    .digest('hex');

async function rows(client, text, values = []) {
  return (await client.query(text, values)).rows;
}

async function present(client, table, column) {
  const [row] = await rows(
    client,
    "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2) AS present",
    [table, column],
  );
  return row.present === true;
}

function addPolicy(found, policy, source) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) fail();
  const key = digest(policy);
  const entry = found.get(key) ?? {
    policySha256: key,
    policy: canonical(policy),
    sources: { jobPayloads: 0, jobCheckpoints: 0, storedArtifacts: 0 },
  };
  entry.sources[source] += 1;
  found.set(key, entry);
  if (found.size > MAX_POLICIES) fail();
}

/**
 * Caller owns a verified-TLS client inside
 * BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY, so every value below
 * comes from one consistent snapshot.
 */
export async function observeFundedState(client) {
  const migrations = (
    await rows(
      client,
      'SELECT name,checksum FROM public.ff_migrations ORDER BY name COLLATE "C"',
    )
  ).map(({ name, checksum }) => ({ name, checksum }));
  const accounts = await rows(
    client,
    'SELECT id,limit_micro::text AS "limit",accounted_micro::text AS accounted FROM public.aw_budget_accounts ORDER BY id COLLATE "C"',
  );
  const reservations = await rows(
    client,
    "SELECT id::text AS id,status,reserved_micro::text AS reserved,accounted_micro::text AS accounted,COALESCE(to_char(settled_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),'') AS settled FROM public.aw_budget_reservations ORDER BY id",
  );
  const byStatus = {};
  for (const status of ['reserved', 'completed', 'unknown'])
    byStatus[status] = { count: 0, reservedMicro: 0n, accountedMicro: 0n };
  for (const row of reservations) {
    const bucket = byStatus[row.status];
    if (!bucket) fail();
    bucket.count += 1;
    bucket.reservedMicro += BigInt(row.reserved);
    bucket.accountedMicro += BigInt(row.accounted);
  }
  let pendingJobs = 0,
    liveLeases = 0;
  for (const table of QUEUE_TABLES) {
    const [row] = await rows(
      client,
      `SELECT count(*) FILTER(WHERE status IN('queued','running','validating'))::int AS pending,count(*) FILTER(WHERE lease_token IS NOT NULL OR lease_until IS NOT NULL)::int AS leases FROM public.${table}`,
    );
    pendingJobs += row.pending;
    liveLeases += row.leases;
  }
  const [drafts] = await rows(
    client,
    "SELECT count(*)::int AS n FROM public.aw_public_draft_reviews WHERE status='running'",
  );
  const [branches] = await rows(
    client,
    "SELECT count(*)::int AS n FROM public.aw_branches WHERE status='generating'",
  );
  const frozen = await rows(
    client,
    "SELECT status,count(*)::int AS n FROM public.aw_jobs WHERE payload ? 'narrativeContext' GROUP BY status ORDER BY status",
  );
  const found = new Map();
  for (const row of await rows(
    client,
    "SELECT payload->'narrativeContext'->'policy' AS policy FROM public.aw_jobs WHERE payload->'narrativeContext' ? 'policy'",
  ))
    addPolicy(found, row.policy, 'jobPayloads');
  for (const row of await rows(
    client,
    "SELECT checkpoints->'policy' AS policy FROM public.aw_jobs WHERE checkpoints ? 'policy'",
  ))
    addPolicy(found, row.policy, 'jobCheckpoints');
  const artifactColumn = await present(
    client,
    'aw_periods',
    'narrative_artifact',
  );
  let artifacts = { stored: 0, legacyNull: 0, storedSha256: digest([]) };
  if (artifactColumn) {
    const [counts] = await rows(
      client,
      'SELECT count(*) FILTER(WHERE narrative_artifact IS NOT NULL)::int AS stored,count(*) FILTER(WHERE narrative_artifact IS NULL)::int AS legacy FROM public.aw_periods',
    );
    const stored = await rows(
      client,
      'SELECT id::text AS id,md5(narrative_artifact::text) AS m FROM public.aw_periods WHERE narrative_artifact IS NOT NULL ORDER BY id',
    );
    artifacts = {
      stored: counts.stored,
      legacyNull: counts.legacy,
      storedSha256: digest(stored),
    };
    for (const row of await rows(
      client,
      "SELECT narrative_artifact->'policy' AS policy FROM public.aw_periods WHERE narrative_artifact ? 'policy'",
    ))
      addPolicy(found, row.policy, 'storedArtifacts');
  }
  const [periods] = await rows(
    client,
    'SELECT count(*)::int AS n FROM public.aw_periods',
  );
  const users = await rows(
    client,
    'SELECT id::text AS id FROM public.ff_users ORDER BY id',
  );
  const total = (key) =>
    accounts.reduce((sum, row) => sum + BigInt(row[key]), 0n).toString();
  return {
    version: OBSERVATION_VERSION,
    schema: {
      migrations,
      migrationsSha256: digest(migrations),
      narrativeArtifactColumn: artifactColumn,
    },
    ledger: {
      accountCount: accounts.length,
      accountsSha256: digest(accounts),
      limitMicroTotal: total('limit'),
      accountedMicroTotal: total('accounted'),
      reservationCount: reservations.length,
      reservationsSha256: digest(reservations),
      reservations: Object.fromEntries(
        Object.entries(byStatus).map(([status, bucket]) => [
          status,
          {
            count: bucket.count,
            reservedMicro: bucket.reservedMicro.toString(),
            accountedMicro: bucket.accountedMicro.toString(),
          },
        ]),
      ),
    },
    queue: {
      pendingJobs: pendingJobs + drafts.n,
      liveLeases,
      generatingBranches: branches.n,
      frozenNarrativeJobs: Object.fromEntries(
        frozen.map(({ status, n }) => [status, n]),
      ),
    },
    policies: [...found.values()].sort((a, b) =>
      a.policySha256.localeCompare(b.policySha256),
    ),
    artifacts: { ...artifacts, periods: periods.n },
    accounts: { userCount: users.length, usersSha256: digest(users) },
  };
}

function contextPolicyAccepted(contracts, policy) {
  return (
    typeof contracts.contextNarrativePolicy === 'function' &&
    digest(contracts.contextNarrativePolicy()) === digest(policy)
  );
}

/**
 * Does THIS image's contracts package interpret every stored/frozen policy?
 * Unknown modes and schemas missing from an older image are rejections, never
 * passes: an image that only knows v1 is not a compatible recovery target.
 */
export function policyCapability(contracts, policies) {
  if (!Array.isArray(policies) || policies.length > MAX_POLICIES) fail();
  const accepted = [],
    rejected = [];
  for (const policy of policies) {
    const key = digest(policy);
    let ok = false;
    try {
      if (policy?.mode === 'context')
        ok = contextPolicyAccepted(contracts, policy);
      else if (policy?.mode === 'narrative-v1')
        ok = contracts.narrativeV1PolicySchema?.safeParse(policy).success;
      else if (policy?.mode === 'narrative-fiction-v2')
        ok = contracts.fictionPolicySchema?.safeParse(policy).success;
    } catch {
      ok = false;
    }
    (ok === true ? accepted : rejected).push(key);
  }
  return { accepted: accepted.sort(), rejected: rejected.sort() };
}

export function runtimeCapability(contracts, policies, migrationFiles) {
  const migrations = migrationFiles
    .filter(({ name }) => /^[0-9]{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(({ name, text }) => ({ name, checksum: migrationChecksum(text) }));
  return {
    version: CAPABILITY_VERSION,
    migrations,
    migrationsSha256: digest(migrations),
    ...policyCapability(contracts, policies),
    fictionPipeline: typeof contracts.fictionPolicySchema === 'object',
    narrativeV1Pipeline: typeof contracts.narrativeV1PolicySchema === 'object',
  };
}
