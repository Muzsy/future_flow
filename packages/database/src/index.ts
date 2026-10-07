import { Pool, type PoolClient } from 'pg';
import { readFileSync } from 'node:fs';
export * from './repository';
export * from './jobs';
export * from './lives';
export * from './public-scenarios';
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
export * from './public-collections';
export * from './public-exposure';
export * from './publication-refresh';
export {
  publicMetricsConfigFromEnv,
  type PublicMetricsConfig,
} from './public-metric-recording';
export * from './life-jobs';
export * from './ai-budget';
export * from './metrics';
export * from './public-drafts';
export * from './public-reviews';
export * from './public-review-jobs';
export * from './public-curation';
export * from './beta';
export * from './shared-contexts';
export * from './shared-events';
export * from './shared-jobs';
export * from './shared-safety';

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
export function connectDatabase(
  connectionString: string,
  ssl: boolean,
): Database & { close(): Promise<void> } {
  if (!connectionString) throw new Error('DATABASE_URL is required');
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
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });
  return {
    query: async <T extends Record<string, unknown>>(
      text: string,
      values: unknown[] = [],
    ) => (await pool.query<T>(text, values)).rows,
    transaction: async (run) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await run(clientDatabase(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
