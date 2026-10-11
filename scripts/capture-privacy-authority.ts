import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { TLSSocket } from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';
import { captureVerifiedPrivacyRestoreAuthority } from './lib/verified-privacy-authority';
import {
  createPrivacyFenceEnvelope,
  type PrivacyFenceBinding,
} from './lib/privacy-fence-envelope';

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

// Root transport only: stdout is sensitive plaintext and MUST be piped directly
// to encryption in memory with Docker logging disabled. No file/report is made.
async function main() {
  if (
    !['--observe', '--capture'].includes(process.argv[2] ?? '') ||
    process.env.ALTERWARD_FENCE_OPERATOR !== 'true' ||
    process.env.DATABASE_SSL !== 'true' ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.AI_PROJECT_BUDGET_USD !== '0' ||
    process.env.AI_USER_BUDGET_USD !== '0'
  )
    throw Error('Root read-only capture transport required');
  const url = new URL(process.env.SUPABASE_URL ?? ''),
    dbUrl = new URL(process.env.DATABASE_URL ?? '');
  const ref = url.hostname.split('.')[0]!;
  if (
    url.protocol !== 'https:' ||
    !/^[a-z]{20}\.supabase\.co$/.test(url.hostname) ||
    url.search ||
    url.hash ||
    !['postgres:', 'postgresql:'].includes(dbUrl.protocol) ||
    dbUrl.search ||
    dbUrl.hash ||
    !(
      dbUrl.hostname === `db.${ref}.supabase.co` ||
      (dbUrl.hostname.endsWith('.pooler.supabase.com') &&
        decodeURIComponent(dbUrl.username).endsWith('.' + ref))
    )
  )
    throw Error('Matching hosted project required');
  const client = new Client({
    connectionString: dbUrl.href,
    ssl: {
      rejectUnauthorized: true,
      ca: readFileSync(process.env.DATABASE_SSL_CA_FILE ?? '', 'utf8'),
    },
    connectionTimeoutMillis: 10000,
  });
  const watchdog = setTimeout(() => process.exit(1), 120000);
  try {
    await client.connect();
    const socket = client.connection.stream;
    if (
      !(socket instanceof TLSSocket) ||
      !socket.encrypted ||
      socket.authorized !== true ||
      !new X509Certificate(socket.getPeerCertificate().raw).checkHost(
        dbUrl.hostname,
      )
    )
      throw Error('Verified database TLS required');
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
    if (process.argv[2] === '--observe') {
      const proof = await db.transaction(async (tx) => {
        await tx.query(
          'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
        );
        await tx.query('SET LOCAL search_path=pg_catalog,public');
        await tx.query("SET LOCAL statement_timeout='10s'");
        let pendingJobs = 0,
          liveLeases = 0;
        for (const table of [
          'ff_jobs',
          'aw_jobs',
          'aw_shared_jobs',
          'aw_public_review_jobs',
          'aw_public_content_reviews',
          'aw_scenario_reviews',
        ]) {
          const [row] = await tx.query<{ pending: number; leases: number }>(
            `SELECT count(*) FILTER(WHERE status IN('queued','running','validating'))::int AS pending,count(*) FILTER(WHERE lease_token IS NOT NULL OR lease_until IS NOT NULL)::int AS leases FROM public.${table}`,
          );
          if (!row) throw Error('Queue observation required');
          pendingJobs += row.pending;
          liveLeases += row.leases;
        }
        const [reviews] = await tx.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM public.aw_public_draft_reviews WHERE status='running'",
        );
        const [branches] = await tx.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM public.aw_branches WHERE status='generating'",
        );
        const [sessions] = await tx.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM pg_catalog.pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend' AND state IS DISTINCT FROM 'idle'",
        );
        if (!reviews || !branches || !sessions)
          throw Error('Complete observation required');
        return {
          pendingJobs: pendingJobs + reviews.n + branches.n,
          liveLeases,
          foreignActiveSessions: sessions.n,
          databaseTlsVerified: true,
        };
      });
      console.log(JSON.stringify(proof));
    } else {
      let input = '';
      for await (const chunk of process.stdin) {
        input += chunk;
        if (Buffer.byteLength(input) > 16384)
          throw Error('Bounded root binding required');
      }
      const request = JSON.parse(input) as {
        binding: PrivacyFenceBinding;
        projectBinding: string;
      };
      if (
        Object.keys(request).sort().join(',') !== 'binding,projectBinding' ||
        request.projectBinding !== hash(url.hostname) ||
        request.binding.projectBinding !== request.projectBinding
      )
        throw Error('Exact current project binding required');
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
      const result = await captureVerifiedPrivacyRestoreAuthority(
        db,
        (page) => admin.auth.admin.listUsers({ page, perPage: 1000 }),
        {
          projectBinding: request.projectBinding,
          writerFenceDigest: request.binding.writerFenceDigest,
        },
      );
      const output = JSON.stringify(
        createPrivacyFenceEnvelope(
          result.authority,
          result.authStateDigest,
          request.binding,
        ),
      );
      if (Buffer.byteLength(output) > 24 * 1024 ** 2)
        throw Error('Bounded encrypted transport payload required');
      console.log(output);
    }
  } finally {
    try {
      await client.end();
    } finally {
      clearTimeout(watchdog);
    }
  }
}
main().catch(() => {
  console.error('Root authority observation failed');
  process.exitCode = 1;
});
