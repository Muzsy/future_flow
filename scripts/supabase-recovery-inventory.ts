import { createClient } from '@supabase/supabase-js';
import { connectDatabase } from '@future-flow/database';
import { hash } from '@future-flow/core';
import {
  readRecoveryAuthInventory,
  assertRecoveryAuthMatchesDatabase,
  assertRecoveryAuthStable,
  recoveryAuthProjectionSql,
} from './lib/recovery-auth-inventory';
import {
  privateReportDirectory,
  privateReportFile,
} from './lib/private-report';

// Explicit read-only inventory. No dump, Auth mutation, email, provider call,
// authority capture or restore/promotion. IDs/emails remain in process memory.
async function main() {
  if (process.argv[2] !== '--read-only' || process.env.DATABASE_SSL !== 'true')
    throw Error('Explicit TLS read-only inventory required');
  const url = new URL(process.env.SUPABASE_URL ?? '');
  if (
    url.protocol !== 'https:' ||
    !/^[a-z]{20}\.supabase\.co$/.test(url.hostname)
  )
    throw Error('Expected hosted Supabase project');
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  const projectRef = url.hostname.split('.')[0]!;
  if (
    !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
    databaseUrl.search ||
    !(
      databaseUrl.hostname === `db.${projectRef}.supabase.co` ||
      (databaseUrl.hostname.endsWith('.pooler.supabase.com') &&
        decodeURIComponent(databaseUrl.username).endsWith('.' + projectRef))
    )
  )
    throw Error('Auth and database project bindings must match');
  const admin = createClient(
    url.href,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
      },
    },
  );
  const readAuth = () =>
    readRecoveryAuthInventory((page) =>
      admin.auth.admin.listUsers({ page, perPage: 1000 }),
    );
  const beforeAuth = await readAuth();
  const authIds = new Set(beforeAuth.users.map((user) => user.id));
  const bannedAuthUsers = beforeAuth.users.filter(
    (user) =>
      user.banned_until !== null &&
      BigInt(user.banned_until) >
        BigInt(Date.parse(beforeAuth.verifiedAt)) * 1000n,
  ).length;
  const db = connectDatabase(process.env.DATABASE_URL ?? '', true);
  try {
    const result = await db.transaction(async (tx) => {
      await tx.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      );
      await tx.query("SET LOCAL TIME ZONE 'UTC'");
      await tx.query("SET LOCAL statement_timeout='15s'");
      const databaseAuth = await tx.query<{ record: unknown }>(
        recoveryAuthProjectionSql,
      );
      assertRecoveryAuthMatchesDatabase(
        beforeAuth,
        databaseAuth.map((user) => user.record),
      );
      const tables = await tx.query<{
        name: string;
        rls: boolean;
        anon: boolean;
        authenticated: boolean;
      }>(
        "SELECT c.relname AS name,c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anon,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS authenticated FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND (left(c.relname,3)='aw_' OR left(c.relname,3)='ff_') ORDER BY c.relname",
      );
      const schemas = await tx.query(
        "SELECT nspname,pg_get_userbyid(nspowner) AS owner,nspacl::text AS acl FROM pg_namespace WHERE nspname IN('public','auth','storage') ORDER BY nspname",
      );
      const grants = await tx.query(
        "SELECT table_name,grantee,privilege_type,is_grantable FROM information_schema.table_privileges WHERE table_schema='public' AND (left(table_name,3)='aw_' OR left(table_name,3)='ff_') ORDER BY table_name,grantee,privilege_type",
      );
      const policies = await tx.query(
        "SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname",
      );
      const functions = await tx.query(
        "SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,p.prosecdef,pg_get_functiondef(p.oid) AS definition,p.proacl::text AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (left(p.proname,3)='aw_' OR left(p.proname,3)='ff_') ORDER BY p.proname,arguments",
      );
      const triggers = await tx.query(
        "SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND (left(c.relname,3)='aw_' OR left(c.relname,3)='ff_') ORDER BY c.relname,t.tgname",
      );
      const users = await tx.query<{ id: string; status: string }>(
        'SELECT id,status FROM ff_users ORDER BY id',
      );
      const [storage] = await tx.query(
        'SELECT (SELECT count(*)::int FROM storage.buckets) AS buckets,(SELECT count(*)::int FROM storage.objects) AS objects',
      );
      const [deletions] = await tx.query(
        'SELECT count(*)::int AS pending FROM aw_account_deletions',
      );
      const [shared] = await tx.query(
        "SELECT (SELECT count(*)::int FROM aw_shared_members WHERE user_id IS NOT NULL AND status IN('active','paused_entitlement')) AS activeMemberships,(SELECT count(*)::int FROM aw_shared_personal_memories) AS learnedPersonalMemories",
      );
      return {
        applicationTables: tables.length,
        rlsProtectedTables: tables.filter((t) => t.rls).length,
        browserRoleTablePrivileges: tables.filter(
          (t) => t.anon || t.authenticated,
        ).length,
        applicationUsers: users.length,
        activeApplicationUsers: users.filter((u) => u.status === 'active')
          .length,
        activeApplicationUsersMissingAuth: users.filter(
          (u) => u.status === 'active' && !authIds.has(u.id),
        ).length,
        storage,
        pendingDeletionMarkers: deletions?.pending,
        shared,
        securityMetadata: {
          schemas: schemas.length,
          grants: grants.length,
          policies: policies.length,
          functions: functions.length,
          triggers: triggers.length,
          digest: hash({
            schemas,
            grants,
            policies,
            functions,
            triggers,
            tables,
          }),
        },
      };
    });
    const afterAuth = await readAuth();
    assertRecoveryAuthStable(beforeAuth, afterAuth);
    const report = {
      capturedAt: new Date().toISOString(),
      projectBinding: hash(url.hostname),
      authInventory: {
        users: beforeAuth.users.length,
        bannedUsers: bannedAuthUsers,
        pages: beforeAuth.pages,
        paginationComplete: true,
        stateMatchedReadOnlyDatabase: true,
        unchangedAcrossObservation: true,
        emailAuthenticatedAndNotBannedOrDeleted:
          beforeAuth.eligibleUserIds.length,
        databaseIdentitySetMatched: true,
      },
      ...result,
      databaseTlsCertificateVerified: true,
      liveDatabaseWrites: false,
      authWrites: false,
      externalMessagesSent: false,
      paidAiCalls: 0,
      independentAuthBackupCreated: false,
      writerFenceEstablished: false,
      restoreOrActivationAllowed: false,
    };
    privateReportFile(
      privateReportDirectory('supabase-recovery'),
      'inventory-proof.json',
      report,
    );
    console.log(JSON.stringify(report));
    if (
      result.applicationTables !== result.rlsProtectedTables ||
      result.browserRoleTablePrivileges ||
      result.activeApplicationUsersMissingAuth
    )
      process.exitCode = 1;
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    'Read-only recovery inventory stopped; no credential or raw provider error emitted.',
  );
  process.exitCode = 1;
});
