import { readFileSync } from 'node:fs';
import {
  connectDatabase,
  PublicCollectionsRepository,
  publicationConfigFromEnv,
  officialPublicationConfigFromEnv,
} from '@future-flow/database';
import { publicCollectionRequestSchema } from '@future-flow/contracts';
import {
  privateReportDirectory,
  privateReportFile,
  privateRequestFile,
} from './lib/private-report';
async function main() {
  if (process.env.PUBLIC_COLLECTION_OPERATOR_ENABLED !== 'true')
    throw Error('Operator opt-in required');
  const args = process.argv.slice(2),
    dir = privateReportDirectory('public-collections'),
    db = connectDatabase(
      process.env.DATABASE_URL ?? '',
      process.env.DATABASE_SSL === 'true',
    );
  try {
    const collections = new PublicCollectionsRepository(
      db,
      undefined,
      undefined,
      publicationConfigFromEnv(),
      officialPublicationConfigFromEnv(),
    );
    if (args.length === 1 && args[0] === '--list') {
      const views = await collections.queue();
      privateReportFile(dir, 'collections.json', {
        generatedAt: new Date().toISOString(),
        collections: views,
      });
      console.log(
        JSON.stringify({
          privateReportFile: '.local/public-collections/collections.json',
          collections: views.length,
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
      throw Error('Exact private request required');
    const request = publicCollectionRequestSchema.parse(
      JSON.parse(readFileSync(privateRequestFile(dir, args[1]!), 'utf8')),
    );
    console.log(
      JSON.stringify({ ...(await collections.set(request)), paidAiCalls: 0 }),
    );
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    'Collection curation failed. Check operator opt-in, protected request, live copy and exact revisions. Content and credentials withheld.',
  );
  process.exitCode = 1;
});
