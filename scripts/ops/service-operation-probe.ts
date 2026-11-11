// Internal transport for the root service operator through an API-shaped
// one-off container. Input/output stay on private stdin/stdout; no provider SDK,
// no Auth provider, no paid call. See scripts/lib/service-operation-probe.ts.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TLSSocket } from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { privateProbeFailure } from '../lib/funded-probe-diagnostics';
import {
  parseServiceProbeInput,
  runServiceProbe,
} from '../lib/service-operation-probe';

let phase = 'input';

async function main() {
  const input = parseServiceProbeInput(readFileSync(0, 'utf8'));
  phase = 'database-config';
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
    phase = 'connect';
    await client.connect();
    phase = 'tls';
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
    phase = input.mode;
    const result = await runServiceProbe(client, input);
    console.log(JSON.stringify(result));
  } catch (error) {
    throw Error('Service operation probe refused', { cause: error });
  } finally {
    clearTimeout(watchdog);
    await client.end();
  }
}
main().catch((error: unknown) => {
  console.error(
    'ALTERWARD_PROBE_FAILURE ' +
      JSON.stringify(privateProbeFailure(error, phase)),
  );
  console.error('Service operation probe refused');
  process.exitCode = 1;
});
