import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  validateParticipants,
  validateIdentityRecords,
  validateObservationRequest,
  validateBudgetInventory,
  observePersonalBetaAdmission,
  createAdmissionObserver,
} from '../../scripts/lib/personal-beta-admission-observation.mjs';

const pair = {
  email: 'tester@example.invalid',
  userId: '11111111-1111-4111-8111-111111111111',
};
const now = '2026-10-11T17:00:00Z';
const record = {
  id: pair.userId,
  email: pair.email,
  aud: 'authenticated',
  role: 'authenticated',
  is_anonymous: false,
  deleted_at: null,
  email_confirmed_at: '2026-10-10T10:00:00Z',
  last_sign_in_at: '2026-10-11T16:00:00Z',
  banned_until: null,
  email_change: '',
  status: 'active',
  deletion_pending: false,
  has_shared_membership: false,
  has_shared_memory: false,
};
test('only unique bounded canonical pairs can enter an observation', () => {
  assert.deepEqual(validateParticipants([pair]), {
    emails: [pair.email],
    users: [pair.userId],
  });
  for (const participants of [
    [],
    Array(11).fill(pair),
    [pair, pair],
    [{ ...pair, email: 'UPPER@example.invalid' }],
    [{ ...pair, email: 'end.@example.invalid' }],
    [{ ...pair, email: 'a..b@example.invalid' }],
    [{ ...pair, userId: '--help' }],
    [{ ...pair, grant: true }],
    null,
  ])
    assert.throws(
      () => validateParticipants(participants),
      /observation refused/,
    );
});
test('confirmed signed-in active Auth and application rows bind the exact pair without returning it', () => {
  const proof = validateIdentityRecords([pair], [record], now);
  assert.match(proof, /^[a-f0-9]{64}$/);
  assert.equal(
    validateIdentityRecords(
      [pair],
      [{ ...record, email: pair.email.toUpperCase() }],
      now,
    ),
    proof,
  );
  assert.equal(
    validateIdentityRecords(
      [pair],
      [{ ...record, banned_until: '2026-10-10T12:00:00Z' }],
      now,
    ),
    proof,
  );
});
test('every revoked, ambiguous, missing, anonymous, pending-change or Shared identity is refused', () => {
  for (const patch of [
    { id: '22222222-2222-4222-8222-222222222222' },
    { email: 'other@example.invalid' },
    { aud: 'anon' },
    { role: 'service_role' },
    { is_anonymous: true },
    { is_anonymous: null },
    { deleted_at: now },
    { status: 'deleting' },
    { status: null },
    { email_confirmed_at: null },
    { email_confirmed_at: '2026-10-12T00:00:00Z' },
    { last_sign_in_at: null },
    { last_sign_in_at: 'invalid' },
    { banned_until: '2026-10-12T00:00:00Z' },
    { banned_until: 'invalid' },
    { email_change: 'new@example.invalid' },
    { deletion_pending: true },
    { has_shared_membership: true },
    { has_shared_memory: true },
    { encrypted_password: 'synthetic-forbidden-extra' },
  ])
    assert.throws(() =>
      validateIdentityRecords([pair], [{ ...record, ...patch }], now),
    );
  for (const rows of [[], [record, record], [{ ...record, email: 1 }], null])
    assert.throws(() => validateIdentityRecords([pair], rows, now));
  assert.throws(() => validateIdentityRecords([pair], [record], null));
});
test('seed exclusions and extra authority fields cannot be supplied with an invented fingerprint', () => {
  const request = {
    participants: [pair],
    seedProjectKeys: [
      'project:window:synthetic',
      'project:anthropic:window:synthetic',
    ],
    seedUserKeys: [
      'user:one',
      'user:two',
      'user:three',
      'user:four',
      'user:five',
    ],
  };
  assert.throws(() => validateObservationRequest(request));
  for (const patch of [
    { priorWindowCount: 0 },
    { writerFenceHeld: true },
    { seedExclusionSha256: 'a'.repeat(64) },
    { providerKey: 'synthetic-no-network' },
    { databaseIdentitySha256: 'b'.repeat(64) },
  ])
    assert.throws(() => validateObservationRequest({ ...request, ...patch }));
  assert.throws(() => validateBudgetInventory(request, [], 0));
});
test('untrusted request rejection happens before any database operation', async () => {
  let calls = 0;
  const client = {
    query: async () => {
      calls++;
      throw Error('private synthetic connection details');
    },
  };
  await assert.rejects(
    observePersonalBetaAdmission(
      client,
      {},
      {
        activationJournalPresent: false,
        connectionHostname: 'example.invalid',
      },
    ),
    /observation refused/,
  );
  assert.equal(calls, 0);
});

const fingerprint = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const syntheticRequest = {
  participants: [pair],
  seedProjectKeys: [
    'project:window:synthetic',
    'project:anthropic:window:synthetic',
  ],
  seedUserKeys: ['one', 'two', 'three', 'four', 'five'].map(
    (x) => 'user:' + x + ':window:synthetic',
  ),
};
const syntheticLegacy = ['project:old', 'user:old'];
const synthetic = createAdmissionObserver({
  seedSha256: fingerprint({
    projectKeys: [...syntheticRequest.seedProjectKeys].sort(),
    userKeys: [...syntheticRequest.seedUserKeys].sort(),
  }),
  legacySha256: fingerprint(syntheticLegacy),
  databaseSha256: fingerprint([
    'db.example.invalid',
    'synthetic_db',
    'synthetic_role',
  ]),
});
const syntheticAccounts = [
  ...syntheticRequest.seedProjectKeys,
  ...syntheticRequest.seedUserKeys,
  ...syntheticLegacy,
].map((id) => ({ id }));
const syntheticMetadata = {
  activationJournalPresent: false,
  connectionHostname: 'db.example.invalid',
};
function fakeClient(patch = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (patch.fail === sql) throw Error('private details must not escape');
      if (
        sql.startsWith('BEGIN') ||
        sql.startsWith('SET LOCAL') ||
        sql === 'COMMIT' ||
        sql === 'ROLLBACK'
      )
        return { rows: [] };
      if (sql === 'SHOW transaction_read_only')
        return { rows: [{ transaction_read_only: patch.readOnly ?? 'on' }] };
      if (sql.includes('clock_timestamp()'))
        return {
          rows: [
            {
              observed_at: now,
              db: patch.db ?? 'synthetic_db',
              role: 'synthetic_role',
            },
          ],
        };
      if (sql.includes('FROM auth.users'))
        return { rows: patch.records ?? [record] };
      if (sql.includes('FROM public.aw_budget_accounts'))
        return { rows: patch.accounts ?? syntheticAccounts };
      if (sql.includes('FROM public.aw_budget_reservations'))
        return { rows: [{ count: patch.unsettled ?? 0 }] };
      throw Error('unexpected SQL');
    },
  };
}
test('public synthetic transaction commits only a bound read-only Auth and complete budget inventory', async () => {
  const client = fakeClient();
  const proof = await synthetic.observePersonalBetaAdmission(
    client,
    syntheticRequest,
    syntheticMetadata,
  );
  assert.equal(proof.identityBindingSha256, fingerprint([pair]));
  assert.equal(proof.databaseWrites, 0);
  assert.equal(proof.priorWindowAccounts, 0);
  assert.equal(proof.providerApiCalls, 0);
  assert.equal(proof.seedAccounts, 7);
  assert.deepEqual(
    client.calls.slice(0, 4).map((x) => x.sql),
    [
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
      "SET LOCAL statement_timeout='10s'",
      "SET LOCAL timezone='UTC'",
      'SHOW transaction_read_only',
    ],
  );
  assert.deepEqual(
    client.calls.find((x) => x.sql.includes('FROM auth.users')).params,
    [[pair.userId], [pair.email]],
  );
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
  assert.throws(() => validateObservationRequest(syntheticRequest)); // factory cannot replace production pins
});
test('all transaction failures roll back with a generic error, including a failed commit', async () => {
  for (const patch of [
    { readOnly: 'off' },
    { db: 'other' },
    { records: [] },
    { unsettled: 1 },
    { accounts: syntheticAccounts.slice(1) },
    { accounts: [...syntheticAccounts, { id: 'project:window:new' }] },
    { accounts: [...syntheticAccounts, { id: 'project:unexpected' }] },
    { fail: 'COMMIT' },
    { fail: "SET LOCAL timezone='UTC'" },
  ]) {
    const client = fakeClient(patch);
    await assert.rejects(
      synthetic.observePersonalBetaAdmission(
        client,
        syntheticRequest,
        syntheticMetadata,
      ),
      /^Error: Personal admission observation refused$/,
    );
    assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
  }
});
test('window intent, authority injection and invented seed exclusions fail before BEGIN', async () => {
  for (const [request, metadata] of [
    [
      syntheticRequest,
      { ...syntheticMetadata, activationJournalPresent: true },
    ],
    [{ ...syntheticRequest, priorWindowCount: 0 }, syntheticMetadata],
    [
      { ...syntheticRequest, seedProjectKeys: ['invented', 'exclusion'] },
      syntheticMetadata,
    ],
  ]) {
    const client = fakeClient();
    await assert.rejects(
      synthetic.observePersonalBetaAdmission(client, request, metadata),
    );
    assert.equal(client.calls.length, 0);
  }
});
