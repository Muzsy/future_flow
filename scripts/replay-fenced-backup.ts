import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { TLSSocket } from 'node:tls';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { Database } from '@future-flow/database';
import { hash } from '@future-flow/core';
import { applyMigrations } from './lib/migrations';
import {
  quarantineReplayRequest,
  runQuarantinedReplay,
} from './lib/quarantined-replay';

type PgClient = {
  connection: { stream: unknown };
  connect(): Promise<void>;
  query<T extends Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
  end(): Promise<void>;
};
const { Client } = createRequire(resolve('packages/database/package.json'))(
  'pg',
) as {
  Client: new (config: Record<string, unknown>) => PgClient;
};

async function main() {
  assert.equal(process.platform, 'linux');
  assert.equal(process.argv.length, 3);
  const mode = process.argv[2]!;
  const registryMigration = [
    '--registry-prepare',
    '--registry-apply',
    '--registry-verify',
  ].includes(mode);
  assert(registryMigration || ['--prepare', '--replay'].includes(mode));
  assert.equal(process.env.ALTERWARD_QUARANTINE_REHEARSAL, 'true');
  assert.equal(process.env.AI_PROJECT_BUDGET_USD, '0');
  assert.equal(process.env.AI_USER_BUDGET_USD, '0');
  for (const [key, value] of Object.entries(process.env))
    if (/^(?:OPENAI_|ANTHROPIC_|SUPABASE_|SMTP)/.test(key)) assert(!value);
  const parts: Buffer[] = [];
  let bytes = 0;
  for await (const value of process.stdin) {
    const part = Buffer.from(value);
    bytes += part.length;
    assert(bytes <= 4 * 1024 ** 2);
    parts.push(part);
  }
  const raw = JSON.parse(Buffer.concat(parts).toString('utf8'));
  if (registryMigration) {
    assert.deepEqual(
      Object.keys(raw).sort(),
      (mode === '--registry-prepare'
        ? ['context', 'request']
        : ['context', 'intent', 'persistedIntentSha256', 'request']
      ).sort(),
    );
    assert.equal(raw.request.recoveryProfile, 'historical039');
    assert.equal(raw.request.action, 'replay');
    if (mode !== '--registry-prepare')
      assert.equal(hash(raw.intent), raw.persistedIntentSha256);
  }
  const { request } = quarantineReplayRequest(
    registryMigration ? raw.request : raw,
  );
  if (!registryMigration) assert.equal('--' + request.action, mode);
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, 'postgres');
  assert.equal(url.port, '5432');
  assert.equal(url.username, 'postgres');
  assert.equal(url.password, 'rehearsal_unused');
  assert.equal(url.pathname, '/' + request.quarantineDatabase);
  assert(!url.search && !url.hash);
  const client = new Client({
    connectionString: url.href,
    ssl: {
      rejectUnauthorized: true,
      ca: readFileSync(process.env.DATABASE_SSL_CA_FILE ?? '', 'utf8'),
    },
    connectionTimeoutMillis: 10000,
  });
  const watchdog = setTimeout(() => process.exit(1), 150000);
  try {
    await client.connect();
    const socket = client.connection.stream;
    assert(
      socket instanceof TLSSocket &&
        socket.encrypted &&
        socket.authorized &&
        new X509Certificate(socket.getPeerCertificate().raw).checkHost(
          url.hostname,
        ),
    );
    const query: Database['query'] = async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await client.query<T>(sql, values)).rows;
    const db: Database = {
      query,
      transaction: async (run) => {
        await client.query('BEGIN');
        try {
          const result = await run(db);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      },
    };
    await query('SET search_path=pg_catalog,public');
    await query("SET statement_timeout='15s'");
    if (registryMigration) {
      const bridge = await import('./lib/registry-migration-restore');
      const result =
        mode === '--registry-prepare'
          ? {
              intent: await bridge.prepareRegistryMigrationRestore(
                db,
                raw.request,
                raw.context,
              ),
            }
          : mode === '--registry-apply'
            ? {
                proof: await bridge.applyRegistryMigrationRestore(
                  db,
                  raw.request,
                  raw.intent,
                  raw.context,
                ),
              }
            : {
                proof: await bridge.verifyRegistryMigrationRestore(
                  db,
                  raw.request,
                  raw.intent,
                  raw.context,
                ),
              };
      console.log(
        JSON.stringify({
          ...result,
          action: mode.slice(2),
          databaseTlsVerified: true,
          liveDatabaseWrites: false,
          serviceActivationAllowed: false,
        }),
      );
      return;
    }
    if (request.action === 'prepare') {
      const [row] = await query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'",
      );
      assert.equal(row?.count, '0');
      // SQL is from the original pinned, reviewed application image, never the
      // old archive. Public executable catalog must pass BEFORE loading data.
      await query('SET search_path=public,pg_catalog');
      if (request.recoveryProfile) {
        const { reviewedMigrationManifest } =
          await import('./lib/reviewed-migration-manifest');
        for (const step of reviewedMigrationManifest().slice(
          0,
          request.recoveryProfile === 'registry040' ? 40 : 39,
        ))
          await query(step.sql);
      } else await applyMigrations({ exec: (sql) => query(sql) });
      await query('SET search_path=pg_catalog,public');
      await query(
        'CREATE TABLE public.ff_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
      );
    }
    const result = await runQuarantinedReplay(db, raw);
    console.log(
      JSON.stringify({
        ...result,
        databaseTlsVerified: true,
        liveDatabaseWrites: false,
      }),
    );
  } finally {
    clearTimeout(watchdog);
    await client.end();
  }
}
main().catch(() => {
  console.log(JSON.stringify({ ok: false, phase: 'quarantine-replay' }));
  process.exitCode = 1;
});
