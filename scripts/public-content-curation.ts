import { readFileSync } from 'node:fs';
import {
  connectDatabase,
  PublicContentCurationRepository,
} from '@future-flow/database';
import { publicContentCurationDecisionSchema } from '@future-flow/contracts';
import {
  privateReportDirectory,
  privateReportFile,
  privateRequestFile,
} from './lib/private-report';

async function main() {
  if (process.env.PUBLIC_CONTENT_CURATION_OPERATOR_ENABLED !== 'true')
    throw Error('Trusted full curation operator opt-in required');
  const directory = privateReportDirectory('public-content-curation');
  const db = connectDatabase(
    process.env.DATABASE_URL ?? '',
    process.env.DATABASE_SSL === 'true',
  );
  try {
    const curations = new PublicContentCurationRepository(db),
      args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--list') {
      const copies = await curations.pending();
      privateReportFile(directory, 'pending-copies.json', {
        generatedAt: new Date().toISOString(),
        scope: 'story_and_selected_checkpoints',
        publicationApproved: false,
        copies,
      });
      console.log(
        JSON.stringify({
          privateReportFile:
            '.local/public-content-curation/pending-copies.json',
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
    const request = publicContentCurationDecisionSchema.parse(
      JSON.parse(readFileSync(file, 'utf8')),
    );
    const result = await curations.decide(request);
    console.log(
      JSON.stringify({
        curationId: result.curation!.id,
        status: result.curation!.status,
        scope: result.scope,
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
    'Full content curation failed. Check the operator flag, private decision file, complete AI review, current bundle and migrations. No copy text is logged.',
  );
  process.exitCode = 1;
});
