import {
  connectDatabase,
  publicMetricsSummary,
  cleanupExpiredPublicReadings,
} from '@future-flow/database';
import {
  privateReportDirectory,
  privateReportFile,
} from './lib/private-report';
async function main() {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 1 && args[0] === '--cleanup-expired'))
    throw Error('Unsupported metrics argument');
  const directory = privateReportDirectory('public-metrics'),
    db = connectDatabase(
      process.env.DATABASE_URL ?? '',
      process.env.DATABASE_SSL === 'true',
    );
  try {
    const cleanup = args.length
      ? await cleanupExpiredPublicReadings(db)
      : undefined;
    const summary = await publicMetricsSummary(db);
    privateReportFile(directory, 'summary.json', {
      generatedAt: new Date().toISOString(),
      ...summary,
    });
    console.log(
      JSON.stringify({
        privateReportFile: '.local/public-metrics/summary.json',
        aggregateRows: summary.daily.length,
        cleanup,
        paidAiCalls: 0,
      }),
    );
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    'Public metrics report unavailable. Check the database and migrations. Identifiers and credentials withheld.',
  );
  process.exitCode = 1;
});
