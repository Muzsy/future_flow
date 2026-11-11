// Binary-restore comparison only, never production authority or promotion.
// Both databases must first pass the unchanged reviewed runtime/catalog guard.
import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';
import { privacySecurityCatalogSql } from '../lib/privacy-security-catalog';

// PostgreSQL stores a default ACL either as NULL or as explicit entries; dump/
// restore can change that representation. Compare every effective grant,
// grantor, recipient and grant option in deterministic order instead.
// https://www.postgresql.org/docs/16/functions-info.html
function acl(expression: string) {
  return `(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'grantor',pg_catalog.pg_get_userbyid(a.grantor),
    'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
    'privilege',a.privilege_type,'grantable',a.is_grantable)
    ORDER BY pg_catalog.pg_get_userbyid(a.grantor),
      CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
      a.privilege_type,a.is_grantable),'[]'::jsonb)
    FROM pg_catalog.aclexplode(${expression}) a)`;
}
const replacements: Record<string, readonly [string, string]> = {
  sequences: [
    'c.relacl::text AS acl',
    `${acl("COALESCE(c.relacl,pg_catalog.acldefault('s',c.relowner))")} AS acl`,
  ],
  ownersAndGrants: [
    'c.relacl::text AS acl',
    `${acl("COALESCE(c.relacl,pg_catalog.acldefault(CASE WHEN c.relkind='S' THEN 's'::\"char\" ELSE 'r'::\"char\" END,c.relowner))")} AS acl`,
  ],
  functionOwnersAndGrants: [
    'p.proacl::text AS acl',
    `${acl("COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))")} AS acl`,
  ],
  columnGrants: ['a.attacl::text AS acl', `${acl('a.attacl')} AS acl`],
  defaultGrants: ['d.defaclacl::text AS acl', `${acl('d.defaclacl')} AS acl`],
  schemaGrants: [
    'n.nspacl::text AS acl',
    `${acl("COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))")} AS acl`,
  ],
};

export async function fixtureRestoreCatalog(tx: Database) {
  const [isolation] = await tx.query('SHOW transaction_isolation');
  const [readonly] = await tx.query('SHOW transaction_read_only');
  if (
    isolation?.transaction_isolation !== 'repeatable read' ||
    readonly?.transaction_read_only !== 'on'
  )
    throw Error('Read-only consistent fixture catalog observation required');
  await tx.query("SET LOCAL timezone='UTC'");
  await tx.query('SET LOCAL search_path=pg_catalog,public');
  const summaries: Record<string, { count: number; digest: string }> = {};
  for (const [name, source] of Object.entries(privacySecurityCatalogSql)) {
    const replacement = replacements[name];
    if (replacement && !source.includes(replacement[0]))
      throw Error('Reviewed fixture catalog expression changed');
    const sql = replacement
      ? source.replace(replacement[0], replacement[1])
      : source;
    const rows = await tx.query(sql);
    if (rows.length > 10000) throw Error('Bounded fixture catalog required');
    summaries[name] = { count: rows.length, digest: hash(rows) };
  }
  return { version: 'alterward-fixture-restore-catalog-1', summaries };
}
