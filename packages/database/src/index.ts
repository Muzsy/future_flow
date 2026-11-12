import { Pool, type PoolClient } from 'pg';
import { readFileSync } from 'node:fs';
export * from './repository';
export * from './jobs';
export * from './lives';
export * from './public-scenarios';
export * from './public-scenario-publications';
export * from './personal-scenario-starts';
export * from './scenario-release';
export * from './official-life';
export * from './public-fork';
export * from './public-content';
export * from './public-content-review-jobs';
export * from './public-content-curation';
export * from './publications';
export * from './official-publications';
export * from './discovery';
export * from './saved-lives';
export * from './public-safety';
export * from './public-metrics';
export * from './public-metrics-maintenance';
export * from './public-origin-metrics';
export * from './public-collections';
export * from './public-exposure';
export * from './publication-refresh';
export {
  publicMetricsConfigFromEnv,
  type PublicMetricsConfig,
} from './public-metric-recording';
export * from './life-jobs';
export * from './life-deletion';
export * from './public-fork-permissions';
export * from './public-fork-starts';
export * from './ai-budget';
export * from './metrics';
export * from './billing';
export * from './service-access';
export * from './referral';
export * from './public-drafts';
export * from './public-reviews';
export * from './public-review-jobs';
export * from './public-curation';
export * from './beta';
export * from './shared-contexts';
export * from './shared-events';
export * from './shared-jobs';
export * from './shared-safety';
export * from './narrative-memory';
export * from './narrative-artifact';

export interface Database {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<T[]>;
  transaction<T>(run: (database: Database) => Promise<T>): Promise<T>;
}
function clientDatabase(client: PoolClient): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      text: string,
      values: unknown[] = [],
    ) => (await client.query<T>(text, values)).rows,
    transaction: (run) => run(clientDatabase(client)),
  };
}
// An idle pooled connection can be reset or time out (e.g. `read ETIMEDOUT`
// to the Supabase pooler). `pg` re-emits that on the pool/client, and an
// unhandled 'error' event would kill the whole process. Log a generic,
// credential-free line (error code only); `pg` discards the broken client.
function logConnectionError(scope: 'idle' | 'transaction', error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  console.error(
    `Database ${scope} connection error${
      typeof code === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(code)
        ? ` (${code})`
        : ''
    }; connection discarded.`,
  );
}
const DEFAULT_POOL_MAX = 5;
const DEFAULT_CONNECTION_TIMEOUT_MS = 10000;
// Operator overrides are strict integers: a typo must stop the process at
// startup instead of silently running with another connection budget.
function boundedIntegerFromEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  minimum: number,
  maximum: number,
): number | undefined {
  const raw = env[name];
  if (raw === undefined || raw === '') return undefined;
  const value = /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  return value;
}
// `DATABASE_POOL_MAX` (1..30) and `DATABASE_CONNECTION_TIMEOUT_MS`
// (1000..60000) override the caller's default; without either the pool stays at
// five connections and a ten second checkout timeout, as before.
export function databasePoolConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  defaults: { max?: number } = {},
) {
  return {
    max:
      boundedIntegerFromEnv(env, 'DATABASE_POOL_MAX', 1, 30) ??
      defaults.max ??
      DEFAULT_POOL_MAX,
    connectionTimeoutMillis:
      boundedIntegerFromEnv(
        env,
        'DATABASE_CONNECTION_TIMEOUT_MS',
        1000,
        60000,
      ) ?? DEFAULT_CONNECTION_TIMEOUT_MS,
  };
}
export function connectDatabase(
  connectionString: string,
  ssl: boolean,
  options: { defaultPoolMax?: number } = {},
): Database & { close(): Promise<void> } {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const poolConfig = databasePoolConfigFromEnv(process.env, {
    max: options.defaultPoolMax,
  });
  const certificatePath = process.env.DATABASE_SSL_CA_FILE;
  const pool = new Pool({
    connectionString,
    ssl: ssl
      ? {
          rejectUnauthorized: true,
          ...(certificatePath
            ? { ca: readFileSync(certificatePath, 'utf8') }
            : {}),
        }
      : false,
    max: poolConfig.max,
    connectionTimeoutMillis: poolConfig.connectionTimeoutMillis,
    idleTimeoutMillis: 30000,
  });
  pool.on('error', (error) => logConnectionError('idle', error));
  return {
    query: async <T extends Record<string, unknown>>(
      text: string,
      values: unknown[] = [],
    ) => (await pool.query<T>(text, values)).rows,
    transaction: async (run) => {
      const client = await pool.connect();
      // A checked-out client is no longer covered by the pool-level handler.
      const onClientError = (error: Error) =>
        logConnectionError('transaction', error);
      client.on('error', onClientError);
      try {
        await client.query('BEGIN');
        const result = await run(clientDatabase(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.off('error', onClientError);
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
export * from './closed-beta';

export * from './life-job-state';

export * from './fiction-memory';
export * from './fiction-character';
