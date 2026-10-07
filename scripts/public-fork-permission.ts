import { readFileSync } from 'node:fs';
import {
  connectDatabase,
  PublicForkPermissionRepository,
  publicForkPermissionConfigFromEnv,
  publicationConfigFromEnv,
  officialPublicationConfigFromEnv,
} from '@future-flow/database';
import { officialForkPermissionRequestSchema } from '@future-flow/contracts';
import {
  privateReportDirectory,
  privateReportFile,
  privateRequestFile,
} from './lib/private-report';
async function main() {
  if (process.env.PUBLIC_FORK_OPERATOR_ENABLED !== 'true')
    throw Error('Operator opt-in required');
  const args = process.argv.slice(2),
    dir = privateReportDirectory('public-fork-permission'),
    db = connectDatabase(
      process.env.DATABASE_URL ?? '',
      process.env.DATABASE_SSL === 'true',
    );
  try {
    const repo = new PublicForkPermissionRepository(
      db,
      publicForkPermissionConfigFromEnv(),
      publicationConfigFromEnv(),
      officialPublicationConfigFromEnv(),
    );
    if (args.length === 1 && args[0] === '--list') {
      const items = await repo.officialQueue();
      privateReportFile(dir, 'official-permissions.json', {
        generatedAt: new Date().toISOString(),
        items,
      });
      console.log(
        JSON.stringify({
          privateReportFile:
            '.local/public-fork-permission/official-permissions.json',
          items: items.length,
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
    const input = officialForkPermissionRequestSchema.parse(
        JSON.parse(readFileSync(privateRequestFile(dir, args[1]!), 'utf8')),
      ),
      result = await repo.setOfficial(input);
    console.log(
      JSON.stringify({
        permissionRevision: result.permissionRevision,
        allowed: result.allowed,
        effectiveAllowed: result.effectiveAllowed,
        startsEnabled: result.startsEnabled,
        paidAiCalls: 0,
      }),
    );
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    'Fork permission change failed. Check operator opt-in, exact revisions, protected request and reviewed public checkpoints. Content and credentials withheld.',
  );
  process.exitCode = 1;
});
