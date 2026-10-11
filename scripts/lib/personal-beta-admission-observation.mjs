import { createHash } from 'node:crypto';

// Deployment-specific fingerprints contain no emails, UUIDs or credentials.
export const SEED_EXCLUSION_SHA256 =
  '5b529b242060733ae652f6ebcfbf9ce42421e279974502fbf91634aa63bd23f2';
export const LEGACY_ACCOUNT_KEYS_SHA256 =
  'ca9862df30965912255a78c8b5d0266b56b3eb62f6e94d08ce78ee31d4c793e8';
export const DATABASE_IDENTITY_SHA256 =
  '754b4a0116dfb6a50ff2e28a0f5f850a99c6132ae79b89f9712c53fea8387a11';
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const email =
  /^[a-z0-9][a-z0-9._+\-]*@[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?)+$/;
const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = () => {
  throw Error('Personal admission observation refused');
};

export function validateParticipants(participants) {
  if (
    !Array.isArray(participants) ||
    participants.length < 1 ||
    participants.length > 10
  )
    fail();
  const emails = [],
    users = [];
  for (const pair of participants) {
    if (
      !pair ||
      Object.keys(pair).sort().join(',') !== 'email,userId' ||
      typeof pair.email !== 'string' ||
      pair.email.length > 254 ||
      !email.test(pair.email) ||
      pair.email.includes('..') ||
      pair.email.split('@')[0].length > 64 ||
      pair.email.split('@')[0].endsWith('.') ||
      typeof pair.userId !== 'string' ||
      !uuid.test(pair.userId) ||
      emails.includes(pair.email) ||
      users.includes(pair.userId)
    )
      fail();
    emails.push(pair.email);
    users.push(pair.userId);
  }
  return { emails, users };
}

export function validateObservationRequest(request) {
  if (
    !request ||
    Object.keys(request).sort().join(',') !==
      'participants,seedProjectKeys,seedUserKeys'
  )
    fail();
  const { participants, seedProjectKeys, seedUserKeys } = request;
  const { emails, users } = validateParticipants(participants);
  if (
    !Array.isArray(seedProjectKeys) ||
    seedProjectKeys.length !== 2 ||
    !Array.isArray(seedUserKeys) ||
    seedUserKeys.length !== 5 ||
    [...seedProjectKeys, ...seedUserKeys].some(
      (k) => typeof k !== 'string' || k.length > 256,
    ) ||
    new Set([...seedProjectKeys, ...seedUserKeys]).size !== 7 ||
    hash({
      projectKeys: [...seedProjectKeys].sort(),
      userKeys: [...seedUserKeys].sort(),
    }) !== SEED_EXCLUSION_SHA256 ||
    users.some((id) =>
      seedUserKeys.some((k) => k.startsWith('user:' + id + ':')),
    )
  )
    fail();
  return { emails, users };
}

export function validateIdentityRecords(participants, records, observedAt) {
  validateParticipants(participants);
  const now = new Date(observedAt).getTime();
  const fields =
    'aud,banned_until,deleted_at,deletion_pending,email,email_change,email_confirmed_at,has_shared_membership,has_shared_memory,id,is_anonymous,last_sign_in_at,role,status';
  if (
    !observedAt ||
    !Number.isFinite(now) ||
    !Array.isArray(records) ||
    records.length !== participants.length ||
    records.some(
      (row) =>
        !row ||
        Object.keys(row).sort().join(',') !== fields ||
        typeof row.email !== 'string',
    )
  )
    fail();
  for (const pair of participants) {
    const found = records.filter(
      (r) => r.id === pair.userId || r.email?.toLowerCase() === pair.email,
    );
    if (found.length !== 1) fail();
    const row = found[0];
    const confirmed = new Date(row.email_confirmed_at).getTime();
    const signedIn = new Date(row.last_sign_in_at).getTime();
    if (
      row.id !== pair.userId ||
      row.email?.toLowerCase() !== pair.email ||
      row.aud !== 'authenticated' ||
      row.role !== 'authenticated' ||
      row.is_anonymous !== false ||
      row.deleted_at !== null ||
      row.email_change !== '' ||
      row.status !== 'active' ||
      row.deletion_pending !== false ||
      row.has_shared_membership !== false ||
      row.has_shared_memory !== false ||
      !row.email_confirmed_at ||
      !Number.isFinite(confirmed) ||
      confirmed > now ||
      !row.last_sign_in_at ||
      !Number.isFinite(signedIn) ||
      signedIn > now ||
      (row.banned_until !== null &&
        (!Number.isFinite(new Date(row.banned_until).getTime()) ||
          new Date(row.banned_until).getTime() > now))
    )
      fail();
  }
  return hash(participants.map((p) => ({ email: p.email, userId: p.userId })));
}

export function validateBudgetInventory(
  request,
  accounts,
  unsettledReservations,
) {
  validateObservationRequest(request);
  if (
    !Array.isArray(accounts) ||
    accounts.length > 10000 ||
    unsettledReservations !== 0 ||
    accounts.some((a) => typeof a.id !== 'string' || a.id.length > 512) ||
    new Set(accounts.map((a) => a.id)).size !== accounts.length
  )
    fail();
  const excluded = new Set([
    ...request.seedProjectKeys,
    ...request.seedUserKeys,
  ]);
  if (
    accounts.filter((a) => excluded.has(a.id)).length !== 7 ||
    accounts.some((a) => a.id.includes(':window:') && !excluded.has(a.id))
  )
    fail();
  const legacy = accounts
    .filter((a) => !a.id.includes(':window:'))
    .map((a) => a.id)
    .sort();
  if (legacy.length !== 2 || hash(legacy) !== LEGACY_ACCOUNT_KEYS_SHA256)
    fail();
  return {
    seedAccounts: 7,
    legacyAccounts: 2,
    priorWindowAccounts: 0,
    unsettledReservations: 0,
  };
}

// A trusted target adapter must verify TLS/hostname, hold the writer fence,
// inspect the durable journal and pass the actual connected hostname. None of
// these authorities is accepted from the operator's selection JSON.
export async function observePersonalBetaAdmission(
  client,
  request,
  { activationJournalPresent, connectionHostname },
) {
  const selection = validateObservationRequest(request);
  if (
    activationJournalPresent !== false ||
    typeof connectionHostname !== 'string' ||
    connectionHostname.length > 253 ||
    !/^[a-z0-9.-]+$/.test(connectionHostname)
  )
    fail();
  let started = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    started = true;
    await client.query("SET LOCAL statement_timeout='10s'");
    await client.query("SET LOCAL timezone='UTC'");
    if (
      (await client.query('SHOW transaction_read_only')).rows[0]
        ?.transaction_read_only !== 'on'
    )
      fail();
    const clock = (
      await client.query(
        'SELECT clock_timestamp() AS observed_at,current_database() AS db,session_user AS role',
      )
    ).rows[0];
    const observedAt = clock.observed_at;
    const databaseIdentitySha256 = hash([
      connectionHostname,
      clock.db,
      clock.role,
    ]);
    if (databaseIdentitySha256 !== DATABASE_IDENTITY_SHA256) fail();
    const identities = (
      await client.query(
        `SELECT u.id,u.email,u.aud,u.role,u.is_anonymous,u.deleted_at,
      u.email_confirmed_at,u.last_sign_in_at,u.banned_until,coalesce(u.email_change,'') AS email_change,f.status,
      EXISTS(SELECT 1 FROM public.aw_account_deletions d WHERE d.user_id=u.id) AS deletion_pending,
      EXISTS(SELECT 1 FROM public.aw_shared_members m WHERE m.user_id=u.id) AS has_shared_membership,
      EXISTS(SELECT 1 FROM public.aw_shared_personal_memories m WHERE m.user_id=u.id) AS has_shared_memory
      FROM auth.users u LEFT JOIN public.ff_users f ON f.id=u.id
      WHERE u.id=ANY($1::uuid[]) OR lower(u.email)=ANY($2::text[]) LIMIT 21`,
        [selection.users, selection.emails],
      )
    ).rows;
    const identityBindingSha256 = validateIdentityRecords(
      request.participants,
      identities,
      observedAt,
    );
    const accounts = (
      await client.query(
        'SELECT id FROM public.aw_budget_accounts ORDER BY id LIMIT 10001',
      )
    ).rows;
    const unsettled = (
      await client.query(
        "SELECT count(*)::int AS count FROM public.aw_budget_reservations WHERE status<>'completed'",
      )
    ).rows[0].count;
    const budget = validateBudgetInventory(request, accounts, unsettled);
    await client.query('COMMIT');
    started = false;
    return {
      observedAt: new Date(observedAt).toISOString(),
      participantCount: selection.users.length,
      identityBindingSha256,
      databaseIdentitySha256,
      ...budget,
      activationJournalAbsent: true,
      databaseWrites: 0,
      providerApiCalls: 0,
    };
  } catch {
    fail();
  } finally {
    if (started) await client.query('ROLLBACK').catch(() => {});
  }
}
