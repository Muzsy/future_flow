import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { publicScenarioModerationSchema } from '@future-flow/contracts';
import {
  connectDatabase,
  PublicScenarioPublicationRepository,
  publicScenarioConfigFromEnv,
} from '@future-flow/database';
import {
  privateReportDirectory,
  privateReportFile,
  privateRequestFile,
} from './lib/private-report';
async function main() {
  const config = publicScenarioConfigFromEnv();
  if (!config.operatorEnabled) throw Error('Operator opt-in required');
  const args = process.argv.slice(2),
    dir = privateReportDirectory('public-scenario-moderation');
  if (
    args.length !== 3 ||
    args[0] !== '--request-file' ||
    args[2] !== '--apply'
  )
    throw Error('Exact protected moderation request required');
  const request = z
      .object({
        ownerId: z.uuid(),
        publicationId: z.uuid(),
        action: publicScenarioModerationSchema,
      })
      .strict()
      .parse(
        JSON.parse(readFileSync(privateRequestFile(dir, args[1]!), 'utf8')),
      ),
    db = connectDatabase(
      process.env.DATABASE_URL ?? '',
      process.env.DATABASE_SSL === 'true',
    );
  try {
    const result = await new PublicScenarioPublicationRepository(
      db,
      config,
    ).moderate(request.ownerId, request.publicationId, request.action);
    privateReportFile(dir, 'result.json', {
      completedAt: new Date().toISOString(),
      result,
      paidAiCalls: 0,
    });
    console.log(
      JSON.stringify({
        status: result.status,
        privateReportFile: '.local/public-scenario-moderation/result.json',
        paidAiCalls: 0,
      }),
    );
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    'Scenario moderation failed. Check operator opt-in, exact protected request and current snapshot. Content and credentials withheld.',
  );
  process.exitCode = 1;
});
