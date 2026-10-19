// Called only by the git-bound funded-upgrade controller through an API-shaped
// one-off container. Input/output stay on private stdin/stdout; no provider SDK.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TLSSocket } from 'node:tls';
import { X509Certificate } from 'node:crypto';
import type { Database } from '@future-flow/database';
import {
  captureFundedRuntime,
  migrateFundedRuntime,
  fundedRuntimeCapabilities,
} from '../lib/funded-runtime';
import { DATABASE_IDENTITY_SHA256 } from '../lib/personal-beta-admission-observation.mjs';

async function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (
    Object.keys(input).sort().join(',') !== 'expected,mode,participants' ||
    !['capture', 'migrate'].includes(input.mode)
  )
    throw Error('Exact probe input required');
  if (!process.env.DATABASE_SSL_CA_FILE || !process.env.DATABASE_URL)
    throw Error('Pinned TLS database required');
  const { Client } = createRequire(resolve('packages/database/package.json'))(
    'pg',
  );
  const ca = readFileSync(process.env.DATABASE_SSL_CA_FILE, 'utf8');
  const host = new URL(process.env.DATABASE_URL).hostname;
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true, ca },
    connectionTimeoutMillis: 10000,
  });
  const watchdog = setTimeout(() => process.exit(1), 180000);
  watchdog.unref();
  try {
    await client.connect();
    const socket = client.connection.stream;
    if (
      !(socket instanceof TLSSocket) ||
      !socket.encrypted ||
      socket.authorized !== true ||
      client.ssl.ca !== ca ||
      client.ssl.rejectUnauthorized !== true ||
      !new X509Certificate(socket.getPeerCertificate().raw).checkHost(host)
    )
      throw Error('TLS identity mismatch');
    await client.query(
      input.mode === 'capture'
        ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
        : 'BEGIN ISOLATION LEVEL SERIALIZABLE',
    );
    const tx = {
      query: async (sql: string, values: unknown[] = []) =>
        (await client.query(sql, values)).rows,
    } as Database;
    const selected = {
      participants: input.participants,
      databaseIdentitySha256: DATABASE_IDENTITY_SHA256,
      connectionHostname: host,
    };
    fundedRuntimeCapabilities();
    const result =
      input.mode === 'capture'
        ? await captureFundedRuntime(tx, selected)
        : await migrateFundedRuntime(tx, selected, input.expected);
    await client.query('COMMIT');
    console.log(JSON.stringify(result));
  } catch {
    await client.query('ROLLBACK').catch(() => {});
    throw Error('Funded database probe refused');
  } finally {
    clearTimeout(watchdog);
    await client.end();
  }
}
main().catch(() => {
  console.error('Funded database probe refused');
  process.exitCode = 1;
});
