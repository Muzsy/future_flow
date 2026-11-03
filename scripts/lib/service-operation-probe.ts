// Host-path transport for the privileged service operations (wave, pause and
// resume, revoke, restore reconcile). It runs inside the candidate image as a
// one-off process, like the funded probes, and only forwards a strictly
// validated request to the DB core in service-operations.ts.
//
// What this deliberately cannot do: it has no Auth provider and no Supabase
// service key, so it can never create or activate an account. The admission
// kind is accepted for revocation only, and bootstrap only without members.
// Authority (source, image, running profile, operator, parent operation) is the
// host helper's job; the probe just binds the digests it is given.
import { z } from 'zod';
import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';
import {
  applyServiceOperation,
  prepareServiceOperation,
  reconcileServiceOperation,
  serviceOperationContextSchema,
} from './service-operations';

export const SERVICE_PROBE_MODES = [
  'service-prepare',
  'service-apply',
  'service-reconcile',
] as const;
export type ServiceProbeMode = (typeof SERVICE_PROBE_MODES)[number];
export const SERVICE_PROBE_MAX_INPUT_BYTES = 256 * 1024;

const digest = z.string().regex(/^[a-f0-9]{64}$/);
// A raw JSON request is only the transport shape here; the DB core owns the
// exact request/intent schemas and re-validates everything.
const record = z.record(z.string(), z.unknown());
const prepareInput = z
  .object({
    mode: z.literal('service-prepare'),
    context: serviceOperationContextSchema,
    request: record,
  })
  .strict();
const followInput = z
  .object({
    mode: z.enum(['service-apply', 'service-reconcile']),
    context: serviceOperationContextSchema,
    intent: record,
    intentSha256: digest,
  })
  .strict();
export type ServiceProbeInput =
  z.infer<typeof prepareInput> | z.infer<typeof followInput>;

// Only auth-free, exposure-neutral or exposure-reducing kinds may use the host
// path. Everything else (granting an account) needs a provider verifier that
// the root process does not have.
export function assertHostServiceRequest(request: Record<string, unknown>) {
  const members = request.members;
  const ok =
    request.kind === 'policy' ||
    request.kind === 'wave' ||
    request.kind === 'restore-reconcile' ||
    (request.kind === 'admission' &&
      Array.isArray(members) &&
      members.length > 0 &&
      members.every(
        (member) =>
          !!member &&
          typeof member === 'object' &&
          (member as { state?: unknown }).state === 'revoked',
      )) ||
    (request.kind === 'bootstrap' &&
      Array.isArray(members) &&
      members.length === 0);
  if (!ok) throw Error('Host service operation kind not permitted');
}

export function parseServiceProbeInput(raw: string): ServiceProbeInput {
  if (Buffer.byteLength(raw) > SERVICE_PROBE_MAX_INPUT_BYTES)
    throw Error('Bounded service probe input required');
  const value: unknown = JSON.parse(raw);
  const mode =
    value && typeof value === 'object'
      ? (value as { mode?: unknown }).mode
      : undefined;
  if (!SERVICE_PROBE_MODES.includes(mode as ServiceProbeMode))
    throw Error('Exact service probe input required');
  const input =
    mode === 'service-prepare'
      ? prepareInput.parse(value)
      : followInput.parse(value);
  assertHostServiceRequest(
    'request' in input
      ? input.request
      : ((input.intent.request ?? {}) as Record<string, unknown>),
  );
  return input;
}

// The minimal client surface the probe needs (a single pg Client satisfies it).
export type ProbeSession = {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
};

function bound(session: ProbeSession): Database {
  const db: Database = {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await session.query(sql, values)).rows as T[],
    transaction: async <T>(run: (tx: Database) => Promise<T>) => {
      await session.query('BEGIN');
      try {
        const result = await run(db);
        await session.query('COMMIT');
        return result;
      } catch (error) {
        await session.query('ROLLBACK').catch(() => {});
        throw error;
      }
    },
  } as Database;
  return db;
}

// There is no Auth provider on the host path. Granting kinds never reach here
// (assertHostServiceRequest), but the DB core requires a verifier, so give it
// one that always refuses.
const noProvider = async () => {
  throw Error('Auth provider verification is not available on the host path');
};

export async function runServiceProbe(
  session: ProbeSession,
  input: ServiceProbeInput,
) {
  const db = bound(session);
  if (input.mode === 'service-apply') {
    const intent = await applyServiceOperation(
      db,
      (input as z.infer<typeof followInput>).intent,
      input.context,
      (input as z.infer<typeof followInput>).intentSha256,
      noProvider,
    );
    return intent;
  }
  await session.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const result =
      input.mode === 'service-prepare'
        ? await (async () => {
            const intent = await prepareServiceOperation(
              db,
              (input as z.infer<typeof prepareInput>).request,
              input.context,
            );
            return { intent, intentSha256: hash(intent) };
          })()
        : await reconcileServiceOperation(
            db,
            (input as z.infer<typeof followInput>).intent,
            input.context,
            (input as z.infer<typeof followInput>).intentSha256,
          );
    await session.query('COMMIT');
    return result;
  } catch (error) {
    await session.query('ROLLBACK').catch(() => {});
    throw error;
  }
}
