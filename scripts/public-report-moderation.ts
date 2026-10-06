import { readFileSync } from 'node:fs';
import { connectDatabase, PublicSafetyRepository } from '@future-flow/database';
import {
  publicReportModerationSchema,
  publicRestrictionRequestSchema,
} from '@future-flow/contracts';
import {
  privateReportDirectory,
  privateReportFile,
  privateRequestFile,
} from './lib/private-report';
async function main() {
  if (process.env.PUBLIC_REPORT_OPERATOR_ENABLED !== 'true')
    throw Error('Operator opt-in required');
  const directory = privateReportDirectory('public-report-moderation'),
    args = process.argv.slice(2),
    db = connectDatabase(
      process.env.DATABASE_URL ?? '',
      process.env.DATABASE_SSL === 'true',
    );
  try {
    const safety = new PublicSafetyRepository(db);
    if (args.length === 1 && args[0] === '--list') {
      const reports = await safety.queue();
      privateReportFile(directory, 'queue.json', {
        generatedAt: new Date().toISOString(),
        reports,
      });
      console.log(
        JSON.stringify({
          privateReportFile: '.local/public-report-moderation/queue.json',
          reports: reports.length,
          paidAiCalls: 0,
        }),
      );
      return;
    }
    if (
      args.length !== 3 ||
      !['--request-file', '--restriction-file'].includes(args[0]!) ||
      args[2] !== '--apply'
    )
      throw Error('Private request and explicit apply required');
    const raw = JSON.parse(
      readFileSync(privateRequestFile(directory, args[1]!), 'utf8'),
    );
    const result =
      args[0] === '--restriction-file'
        ? await safety.setRestriction(publicRestrictionRequestSchema.parse(raw))
        : await safety.resolve(publicReportModerationSchema.parse(raw));
    console.log(JSON.stringify({ ...result, paidAiCalls: 0 }));
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    'Public report moderation failed. Check operator opt-in, protected request, exact copy and revisions. Content and credentials withheld.',
  );
  process.exitCode = 1;
});
