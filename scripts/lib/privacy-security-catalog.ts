import { z } from 'zod';
import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';
import { assertReviewedPrivacyRecoverySchema } from './privacy-recovery-schema';

// Public application catalog only. The installed PostgreSQL/platform and the
// owner-held root access remain separate trust boundaries. Catalog definitions
// stay in memory; the authority retains only digests, never configuration values.
export const privacySecurityCatalogSql = Object.freeze({
  constraints:
    "SELECT c.relname::text AS table_name,k.conname::text AS name,k.contype::text,k.convalidated,k.condeferrable,k.condeferred,pg_get_constraintdef(k.oid) AS definition FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid=k.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname<>'ff_migrations' ORDER BY c.relname,k.conname",
  indexes:
    "SELECT c.relname::text AS table_name,i.relname::text AS name,x.indisunique,x.indisprimary,x.indisvalid,x.indisready,x.indislive,x.indisreplident,pg_get_indexdef(i.oid) AS definition FROM pg_catalog.pg_index x JOIN pg_catalog.pg_class c ON c.oid=x.indrelid JOIN pg_catalog.pg_class i ON i.oid=x.indexrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname<>'ff_migrations' ORDER BY c.relname,i.relname",
  defaults:
    "SELECT c.relname::text AS table_name,a.attname::text AS name,a.attidentity::text,a.attgenerated::text,pg_get_expr(d.adbin,d.adrelid) AS expression FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relname<>'ff_migrations' AND c.relkind IN('r','p') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum",
  functions:
    "SELECT p.proname::text AS name,pg_get_function_identity_arguments(p.oid) AS arguments,p.prokind::text AS kind,p.prosecdef,p.proleakproof,p.proisstrict,p.provolatile::text,p.proparallel::text,p.proconfig,CASE WHEN p.prokind<>'a' THEN pg_get_functiondef(p.oid) ELSE NULL END AS definition FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)",
  triggers:
    "SELECT c.relname::text AS table_name,t.tgname::text AS name,t.tgenabled::text AS enabled,pg_get_triggerdef(t.oid) AS definition FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname",
  policies:
    "SELECT c.relname::text AS table_name,p.polname::text AS name,p.polpermissive,p.polcmd::text,ARRAY(SELECT pg_catalog.pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY r) AS roles,pg_get_expr(p.polqual,p.polrelid) AS qualifier,pg_get_expr(p.polwithcheck,p.polrelid) AS check FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,p.polname",
  sequences:
    "SELECT c.relname::text AS name,pg_catalog.pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl,pg_catalog.format_type(s.seqtypid,NULL) AS type,s.seqstart::text,s.seqincrement::text,s.seqmax::text,s.seqmin::text,s.seqcache::text,s.seqcycle FROM pg_catalog.pg_class c JOIN pg_catalog.pg_sequence s ON s.seqrelid=c.oid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname",
  ownersAndGrants:
    "SELECT c.relname::text AS name,c.relkind::text AS kind,pg_catalog.pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text AS acl FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname",
  functionOwnersAndGrants:
    "SELECT p.proname::text AS name,pg_get_function_identity_arguments(p.oid) AS arguments,pg_catalog.pg_get_userbyid(p.proowner) AS owner,p.proacl::text AS acl FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)",
  columnGrants:
    "SELECT c.relname::text AS table_name,a.attname::text AS name,a.attacl::text AS acl FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL ORDER BY c.relname,a.attnum",
  defaultGrants:
    "SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS owner,COALESCE(n.nspname::text,'*') AS schema,d.defaclobjtype::text AS kind,d.defaclacl::text AS acl FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace WHERE d.defaclnamespace=0 OR n.nspname='public' ORDER BY owner,schema,kind",
  schemaGrants:
    "SELECT n.nspname::text AS name,pg_catalog.pg_get_userbyid(n.nspowner) AS owner,n.nspacl::text AS acl FROM pg_catalog.pg_namespace n WHERE n.nspname='public'",
  browserRoles:
    "SELECT r.rolname::text AS name,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolcanlogin,r.rolreplication,r.rolbypassrls,r.rolconfig,ARRAY(SELECT p.rolname::text FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles p ON p.oid=m.roleid WHERE m.member=r.oid ORDER BY p.rolname) AS memberships FROM pg_catalog.pg_roles r WHERE r.rolname IN('anon','authenticated') ORDER BY r.rolname",
  roles:
    'SELECT rolname::text AS name,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig FROM pg_catalog.pg_roles ORDER BY rolname',
  memberships:
    'SELECT p.rolname::text AS parent,m.rolname::text AS member,g.rolname::text AS grantor,a.admin_option FROM pg_catalog.pg_auth_members a JOIN pg_catalog.pg_roles p ON p.oid=a.roleid JOIN pg_catalog.pg_roles m ON m.oid=a.member JOIN pg_catalog.pg_roles g ON g.oid=a.grantor ORDER BY parent,member,grantor',
  rules:
    "SELECT c.relname::text AS table_name,r.rulename::text AS name,r.ev_enabled::text AS enabled,pg_get_ruledef(r.oid) AS definition FROM pg_catalog.pg_rewrite r JOIN pg_catalog.pg_class c ON c.oid=r.ev_class JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,r.rulename",
  customTypes:
    "SELECT t.typname::text AS name,t.typtype::text AS kind FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype IN('d','e','r','m') ORDER BY t.typname",
  rowSecurity:
    "SELECT c.relname::text AS name,c.relrowsecurity,c.relforcerowsecurity FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND c.relname<>'ff_migrations' ORDER BY c.relname",
  eventTriggers:
    'SELECT e.evtname::text AS name,e.evtevent::text AS event,e.evtenabled::text AS enabled,pg_catalog.pg_get_userbyid(e.evtowner) AS owner,e.evttags,n.nspname::text AS function_schema,p.proname::text AS function_name FROM pg_catalog.pg_event_trigger e JOIN pg_catalog.pg_proc p ON p.oid=e.evtfoid JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace ORDER BY e.evtname',
  databaseSettings:
    "SELECT CASE WHEN s.setdatabase=0 THEN '*' ELSE 'current' END AS database,CASE WHEN s.setrole=0 THEN '*' ELSE pg_catalog.pg_get_userbyid(s.setrole) END AS role,pg_catalog.md5(s.setconfig::text) AS settings_digest FROM pg_catalog.pg_db_role_setting s WHERE s.setdatabase=0 OR s.setdatabase=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()) ORDER BY database,role",
});

const immutable = {
  constraints: [
    712,
    '3dade33d6532215bb2f8be3e5825db305898e77bf0904bb8a69f27bff36479bb',
  ],
  indexes: [
    251,
    '6b72fda111964ded453fac450b9f2c5a6ed5708ba2079a2b83c4bf5ccd4e2a3e',
  ],
  defaults: [
    855,
    '14d330c4c1bd7a2aacbfa26bc86ccbaeeabaa9000980089e27592cb07aaa9759',
  ],
  functions: [
    27,
    'e3c4155e034500a4bf92853073c4970a60d593619fdc1656cd8b63fb07df399c',
  ],
  triggers: [
    66,
    'aa34416f88056efc48a395a552b41a78f6f8b76bd643abd7c6b095c191d4a1c2',
  ],
  policies: [
    0,
    '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
  ],
  sequences: [
    0,
    '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
  ],
  rules: [
    0,
    '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
  ],
  customTypes: [
    0,
    '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
  ],
} as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const ledger = {
  constraints: [
    {
      table_name: 'ff_migrations',
      name: 'ff_migrations_pkey',
      contype: 'p',
      convalidated: true,
      condeferrable: false,
      condeferred: false,
      definition: 'PRIMARY KEY (name)',
    },
  ],
  indexes: [
    {
      table_name: 'ff_migrations',
      name: 'ff_migrations_pkey',
      indisunique: true,
      indisprimary: true,
      indisvalid: true,
      indisready: true,
      indislive: true,
      indisreplident: false,
      definition:
        'CREATE UNIQUE INDEX ff_migrations_pkey ON public.ff_migrations USING btree (name)',
    },
  ],
  defaults: [
    {
      table_name: 'ff_migrations',
      name: 'name',
      attidentity: '',
      attgenerated: '',
      expression: null,
    },
    {
      table_name: 'ff_migrations',
      name: 'checksum',
      attidentity: '',
      attgenerated: '',
      expression: null,
    },
    {
      table_name: 'ff_migrations',
      name: 'applied_at',
      attidentity: '',
      attgenerated: '',
      expression: 'now()',
    },
  ],
};
export const privacySecurityCatalogSchema = z
  .object({
    schemaVersion: z.literal('privacy-security-catalog-1'),
    immutableDigest: digest,
    sourcePrivilegesDigest: digest,
  })
  .strict();
export type PrivacySecurityCatalog = z.infer<
  typeof privacySecurityCatalogSchema
>;

async function zero(tx: Database, sql: string, values: unknown[] = []) {
  const [row] = await tx.query<{ violations: string }>(
    `SELECT count(*)::text AS violations FROM (${sql}) failures`,
    values,
  );
  if (row?.violations !== '0')
    throw Error('Unreviewed privacy recovery privileges');
}

async function assertQuarantineGlobalControls(tx: Database) {
  await zero(tx, 'SELECT 1 FROM pg_catalog.pg_event_trigger');
  await zero(
    tx,
    'SELECT 1 FROM pg_catalog.pg_db_role_setting WHERE setdatabase=0 OR setdatabase=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database())',
  );
}

// This is deliberately stricter for a non-serving quarantine. Source platform
// default grants are recorded for drift detection; they are never imported as
// authority to open the restored application or grant its browser roles access.
export async function assertPrivacySecurityCatalog(
  tx: Database,
  mode: 'source' | 'quarantine' = 'source',
  expected?: PrivacySecurityCatalog,
) {
  z.enum(['source', 'quarantine']).parse(mode);
  const schema = await assertReviewedPrivacyRecoverySchema(tx);
  for (const name of ['constraints', 'indexes', 'defaults'] as const) {
    const sql = privacySecurityCatalogSql[name].replace(
      "c.relname<>'ff_migrations'",
      "c.relname='ff_migrations'",
    );
    const observed = await tx.query(sql);
    if (
      hash(observed) !== hash(schema.migrationLedgerPresent ? ledger[name] : [])
    )
      throw Error('Unreviewed privacy recovery metadata ledger');
  }
  const summaries: Record<string, { count: number; digest: string }> = {};
  for (const [name, sql] of Object.entries(privacySecurityCatalogSql)) {
    const rows = await tx.query(sql);
    if (rows.length > 10000)
      throw Error('Bounded privacy security catalog required');
    summaries[name] = { count: rows.length, digest: hash(rows) };
    if (name in immutable) {
      const baseline = immutable[name as keyof typeof immutable];
      if (rows.length !== baseline[0] || hash(rows) !== baseline[1])
        throw Error('Unreviewed privacy recovery executable catalog');
    }
  }
  await zero(
    tx,
    "SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_catalog.pg_get_userbyid(c.relowner)<>'postgres'",
  );
  await zero(
    tx,
    "SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND pg_catalog.pg_get_userbyid(p.proowner)<>'postgres'",
  );
  await zero(
    tx,
    "SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname='public' AND pg_catalog.pg_get_userbyid(n.nspowner) NOT IN('postgres','pg_database_owner')",
  );
  await zero(
    tx,
    "SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname IN('anon','authenticated') AND (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolcanlogin OR r.rolreplication OR r.rolbypassrls OR EXISTS(SELECT 1 FROM unnest(r.rolconfig) v WHERE NOT($1::boolean AND v ~ '^statement_timeout=([1-9][0-9]{0,4}ms|[1-9][0-9]?s)$')) OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid))",
    [mode === 'source'],
  );
  if (summaries.browserRoles?.count !== 2)
    throw Error('Both restricted browser roles required');
  await zero(
    tx,
    "SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND c.relname<>'ff_migrations' AND (NOT c.relrowsecurity OR has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))",
  );
  // MAINTAIN is available in PostgreSQL 17, including the pinned target image.
  const [version] = await tx.query<{ version: number }>(
    "SELECT current_setting('server_version_num')::int AS version",
  );
  if (!version || version.version < 170000)
    throw Error('Reviewed PostgreSQL 17 security semantics required');
  await zero(
    tx,
    "SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND c.relname<>'ff_migrations' AND (has_table_privilege('anon',c.oid,'MAINTAIN') OR has_table_privilege('authenticated',c.oid,'MAINTAIN'))",
  );
  await zero(
    tx,
    "SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname='public' AND (has_schema_privilege('anon',n.oid,'CREATE') OR has_schema_privilege('authenticated',n.oid,'CREATE'))",
  );
  // Even explicit column grants to an unexpected role are unreviewed.
  const allowed =
    mode === 'source'
      ? ['postgres', 'anon', 'authenticated', 'service_role', 'PUBLIC']
      : ['postgres'];
  await zero(
    tx,
    "SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault(CASE WHEN c.relkind='S' THEN 'S'::\"char\" ELSE 'r'::\"char\" END,c.relowner))) a WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f','S') AND NOT(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END=ANY($1::text[]))",
    [allowed],
  );
  await zero(
    tx,
    "SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE n.nspname='public' AND NOT(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END=ANY($1::text[]))",
    [allowed],
  );
  await zero(
    tx,
    "SELECT 1 FROM pg_catalog.pg_attribute c JOIN pg_catalog.pg_class t ON t.oid=c.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(c.attacl) a WHERE n.nspname='public' AND c.attnum>0 AND NOT c.attisdropped AND NOT(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END=ANY($1::text[]))",
    [allowed],
  );
  if (mode === 'source') {
    await zero(
      tx,
      "SELECT 1 FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a WHERE (d.defaclnamespace=0 OR n.nspname='public') AND NOT(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END=ANY($1::text[]))",
      [allowed],
    );
    await zero(
      tx,
      "SELECT 1 FROM pg_catalog.pg_namespace n CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a WHERE n.nspname='public' AND NOT(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END=ANY($1::text[])) AND pg_catalog.pg_get_userbyid(a.grantee)<>'pg_database_owner'",
      [allowed],
    );
  }
  if (mode === 'quarantine') {
    await assertQuarantineGlobalControls(tx);
    // Restoring PostgreSQL's default PUBLIC function execution removes the
    // explicit default-ACL row. Absence is therefore unsafe, not an empty ACL.
    await zero(
      tx,
      "SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl d WHERE d.defaclnamespace=0 AND d.defaclobjtype='f' AND pg_catalog.pg_get_userbyid(d.defaclrole)='postgres')",
    );
    await zero(
      tx,
      "SELECT 1 FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a WHERE (d.defaclnamespace=0 OR n.nspname='public') AND (pg_catalog.pg_get_userbyid(d.defaclrole)<>'postgres' OR a.grantee=0 OR pg_catalog.pg_get_userbyid(a.grantee)<>'postgres')",
    );
    await zero(
      tx,
      "SELECT 1 FROM pg_catalog.pg_namespace n CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a WHERE n.nspname='public' AND NOT((a.grantee=0 AND a.privilege_type='USAGE' AND NOT a.is_grantable) OR pg_catalog.pg_get_userbyid(a.grantee) IN('postgres','pg_database_owner'))",
    );
    await zero(
      tx,
      "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname NOT IN('postgres','anon','authenticated','service_role') AND rolname NOT LIKE 'pg\\_%' ESCAPE '\\'",
    );
    await zero(
      tx,
      "SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname IN('anon','authenticated','service_role') AND (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolcanlogin OR r.rolreplication OR r.rolbypassrls OR r.rolconfig IS NOT NULL OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid))",
    );
    const checked = privacySecurityCatalogSchema.parse(expected);
    if (
      checked.immutableDigest !==
      hash(
        Object.fromEntries(
          Object.keys(immutable).map((name) => [name, summaries[name]]),
        ),
      )
    )
      throw Error('Fresh source executable catalog mismatch');
  }
  return privacySecurityCatalogSchema.parse({
    schemaVersion: 'privacy-security-catalog-1',
    immutableDigest: hash(
      Object.fromEntries(
        Object.keys(immutable).map((name) => [name, summaries[name]]),
      ),
    ),
    sourcePrivilegesDigest: hash(
      Object.fromEntries(
        Object.entries(summaries).filter(([name]) => !(name in immutable)),
      ),
    ),
  });
}

// Called only after the real quarantine-name, immutable schema/executable and
// owner checks. It revokes access; it never imports source grants or opens Auth.
export async function hardenPrivacyQuarantine(
  tx: Database,
  quarantineDatabase: string,
) {
  const [target] = await tx.query<{ name: string }>(
    'SELECT current_database() AS name',
  );
  if (
    !/^aw_restore_[a-f0-9]{24}$/.test(quarantineDatabase) ||
    target?.name !== quarantineDatabase
  )
    throw Error(
      'Actual dedicated quarantine required before revoking privileges',
    );
  const [isolation] = await tx.query('SHOW transaction_isolation');
  const [readOnly] = await tx.query('SHOW transaction_read_only');
  if (
    isolation?.transaction_isolation !== 'serializable' ||
    readOnly?.transaction_read_only !== 'off'
  )
    throw Error('Atomic serializable quarantine transaction required');
  // Event triggers could react to the following REVOKE DDL. Reject them and
  // global/current-DB settings before any privilege change is attempted.
  await assertQuarantineGlobalControls(tx);
  await assertPrivacySecurityCatalog(tx);
  await tx.query(
    'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated',
  );
  await tx.query(
    'REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated',
  );
  await tx.query(
    'REVOKE ALL PRIVILEGES ON SCHEMA public FROM anon,authenticated',
  );
  await tx.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await tx.query(
    'ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
  );
  await tx.query(
    "DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM service_role; REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM service_role; REVOKE ALL PRIVILEGES ON SCHEMA public FROM service_role; END IF; END $$",
  );
}
