import { readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  connectDatabase,
  OfficialLifeRepository,
  officialLifeOperatorEnabledFromEnv,
} from '@future-flow/database';
import { DomainError } from '@future-flow/core';
import {
  privateReportDirectory,
  privateReportFile,
  privateRequestFile,
} from './lib/private-report';

async function main() {
  if (!officialLifeOperatorEnabledFromEnv())
    throw Error('Official life operator opt-in required');
  const args = process.argv.slice(2),
    directory = privateReportDirectory('official-life');
  const db = connectDatabase(
    process.env.DATABASE_URL ?? '',
    process.env.DATABASE_SSL === 'true',
  );
  try {
    const releases = new OfficialLifeRepository(db, true);
    if (args.length === 3 && args[0] === '--preflight') {
      const inspected = await releases.inspect(
        z.uuid().parse(args[1]),
        z.uuid().parse(args[2]),
      );
      privateReportFile(directory, 'source-preview.json', inspected);
      console.log(
        JSON.stringify({
          privateReportFile: '.local/official-life/source-preview.json',
          periods: inspected.evidence.periods.length,
          evidenceHash: inspected.evidenceHash,
          status: inspected.view.grant?.status ?? 'not_granted',
          publicationApproved: false,
          paidAiCalls: 0,
        }),
      );
      return;
    }
    if (
      args.length === 5 &&
      ['--start', '--grant', '--revoke'].includes(args[0]!) &&
      args[2] === '--request-file' &&
      args[4] === '--apply'
    ) {
      const userId = z.uuid().parse(args[1]),
        request = JSON.parse(
          readFileSync(privateRequestFile(directory, args[3]!), 'utf8'),
        );
      if (args[0] === '--start') {
        const envelope = z
          .object({
            request: z.unknown(),
            idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
          })
          .strict()
          .parse(request);
        const created = await releases.start(
          userId,
          envelope.request,
          envelope.idempotencyKey,
        );
        privateReportFile(directory, 'start-result.json', created);
        console.log(
          JSON.stringify({
            queued: true,
            publicationApproved: false,
            paidAiCalls: 0,
            warning:
              'A normal AI job is queued. A running enabled worker may spend its approved allowance.',
          }),
        );
      } else {
        const view = await (args[0] === '--grant'
          ? releases.grant(userId, request)
          : releases.revoke(userId, request));
        privateReportFile(directory, 'source-result.json', view);
        console.log(
          JSON.stringify({
            status: view.grant?.status,
            usable: view.grant?.usable,
            publicationApproved: false,
            paidAiCalls: 0,
          }),
        );
      }
      return;
    }
    throw Error(
      'Use --preflight owner bundle, or --start/--grant/--revoke owner --request-file protected-file --apply',
    );
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      officialLife: 'failed',
      code: error instanceof DomainError ? error.code : 'OFFICIAL_LIFE_FAILED',
      publicationApproved: false,
    }),
  );
  process.exitCode = 1;
});
