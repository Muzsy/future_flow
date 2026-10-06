import { readFileSync } from 'node:fs';
import {
  connectDatabase,
  OfficialPublicationRepository,
} from '@future-flow/database';
import { officialPublicationModerationRequestSchema } from '@future-flow/contracts';
import {
  privateReportDirectory,
  privateReportFile,
  privateRequestFile,
} from './lib/private-report';
async function main() {
  if (process.env.OFFICIAL_LIFE_OPERATOR_ENABLED !== 'true')
    throw Error('Publication operator opt-in required');
  const directory = privateReportDirectory('official-publication-moderation');
  const db = connectDatabase(
    process.env.DATABASE_URL ?? '',
    process.env.DATABASE_SSL === 'true',
  );
  try {
    const publications = new OfficialPublicationRepository(db),
      args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--list') {
      const copies = await publications.moderationQueue();
      privateReportFile(directory, 'copies.json', {
        generatedAt: new Date().toISOString(),
        copies,
      });
      console.log(
        JSON.stringify({
          privateReportFile:
            '.local/official-publication-moderation/copies.json',
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
      officialPublicationModerationRequestSchema.parse(
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
