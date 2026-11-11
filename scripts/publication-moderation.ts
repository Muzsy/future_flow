import { readFileSync } from 'node:fs';
import { connectDatabase, PublicationRepository } from '@future-flow/database';
import { publicationModerationRequestSchema } from '@future-flow/contracts';
import {
  privateReportDirectory,
  privateReportFile,
  privateRequestFile,
} from './lib/private-report';
async function main() {
  if (process.env.PUBLICATION_OPERATOR_ENABLED !== 'true')
    throw Error('Publication operator opt-in required');
  const directory = privateReportDirectory('publication-moderation');
  const db = connectDatabase(
    process.env.DATABASE_URL ?? '',
    process.env.DATABASE_SSL === 'true',
  );
  try {
    const publications = new PublicationRepository(db),
      args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--list') {
      const copies = await publications.moderationQueue();
      privateReportFile(directory, 'copies.json', {
        generatedAt: new Date().toISOString(),
        copies,
      });
      console.log(
        JSON.stringify({
          privateReportFile: '.local/publication-moderation/copies.json',
          copies: copies.length,
          paidAiCalls: 0,
        }),
      );
      return;
    }
    if (
      args.length !== 3 ||
      args[0] !== '--request-file' ||
      args[2] !== '--apply'
    )
      throw Error('Provide a private request file and explicit --apply');
    const file = privateRequestFile(directory, args[1]!);
    const result = await publications.moderate(
      publicationModerationRequestSchema.parse(
        JSON.parse(readFileSync(file, 'utf8')),
      ),
    );
    console.log(JSON.stringify({ ...result, paidAiCalls: 0 }));
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    'Publication moderation failed. Check the operator flag, private request file, exact copy and revision. No content or credentials are logged.',
  );
  process.exitCode = 1;
});
