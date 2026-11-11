// Internal DB transport for the beta-successor controller being developed.
// Direct invocation is not a supported operator workflow: root authority,
// writer hold, durable journal and backup gates must surround this transport.
// Input/output stay on private stdin/stdout; no provider SDK.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TLSSocket } from 'node:tls';
import { X509Certificate } from 'node:crypto';
import type { Database } from '@future-flow/database';
import { successorDatabaseRequest } from '../lib/beta-successor-operation';
import { DATABASE_IDENTITY_SHA256 } from '../lib/personal-beta-admission-observation.mjs';

async function main() {
  const raw = readFileSync(0, 'utf8');
  if (Buffer.byteLength(raw) > 2 * 1024 * 1024)
    throw Error('Bounded input required');
  const input = JSON.parse(raw);
  if (
    Object.keys(input).sort().join(',') !==
      'expected,mode,previous,selection' ||
    !['capture', 'apply', 'reconcile'].includes(input.mode)
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
      input.mode !== 'apply'
        ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
        : 'BEGIN ISOLATION LEVEL SERIALIZABLE',
    );
    const tx = {
      query: async (sql: string, values: unknown[] = []) =>
        (await client.query(sql, values)).rows,
    } as Database;
    const result = await successorDatabaseRequest(tx, input, {
      databaseIdentitySha256: DATABASE_IDENTITY_SHA256,
      connectionHostname: host,
    });
    await client.query('COMMIT');
    console.log(JSON.stringify(result));
  } catch {
    await client.query('ROLLBACK').catch(() => {});
    throw Error('Beta successor database probe refused');
  } finally {
    clearTimeout(watchdog);
    await client.end();
  }
}
main().catch(() => {
  console.error('Beta successor database probe refused');
  process.exitCode = 1;
});
