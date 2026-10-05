import { readFileSync } from 'node:fs';
import {
  connectDatabase,
  PublicCurationRepository,
} from '@future-flow/database';
import { publicCurationDecisionSchema } from '@future-flow/contracts';
import {
  privateReportDirectory,
  privateReportFile,
  privateRequestFile,
} from './lib/private-report';

async function main() {
  if (process.env.PUBLIC_CURATION_OPERATOR_ENABLED !== 'true')
    throw Error('Trusted curation operator opt-in required');
  const directory = privateReportDirectory('public-curation');
  const db = connectDatabase(
    process.env.DATABASE_URL ?? '',
    process.env.DATABASE_SSL === 'true',
  );
  try {
    const curations = new PublicCurationRepository(db);
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--list') {
      const copies = await curations.pending();
      privateReportFile(directory, 'pending-copies.json', {
        generatedAt: new Date().toISOString(),
        scope: 'text_only',
        publicationApproved: false,
        copies,
      });
      console.log(
        JSON.stringify({
          privateReportFile: '.local/public-curation/pending-copies.json',
          pendingCopies: copies.length,
          paidAiCalls: 0,
          publicationApproved: false,
        }),
      );
      return;
    }
    if (
      args.length !== 3 ||
      args[0] !== '--request-file' ||
      args[2] !== '--apply'
    )
      throw Error(
        'Provide a reviewed private decision file and explicit --apply',
      );
    const file = privateRequestFile(directory, args[1]!);
    const request = publicCurationDecisionSchema.parse(
      JSON.parse(readFileSync(file, 'utf8')),
    );
    const result = await curations.decide(request);
    console.log(
      JSON.stringify({
        curationId: result.curation!.id,
        status: result.curation!.status,
        scope: 'text_only',
        paidAiCalls: 0,
        publicationApproved: false,
      }),
    );
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    'Text curation command failed. Check the trusted operator flag, private decision file, AI result, current copy and migrations. No copy text is logged.',
  );
  process.exitCode = 1;
});
