import {
  connectDatabase,
  publicOriginMetricsSummary,
} from '@future-flow/database';
import {
  privateReportDirectory,
  privateReportFile,
} from './lib/private-report';

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && !/^[1-9][0-9]?$/.test(args[0]!)))
    throw Error('Expected an optional reporting window of 1 to 90 days.');
  const windowDays = args.length ? Number(args[0]) : 30;
  if (windowDays > 90) throw Error('Reporting window exceeds 90 days.');
  const directory = privateReportDirectory('public-origin-metrics');
  const db = connectDatabase(
    process.env.DATABASE_URL ?? '',
    process.env.DATABASE_SSL === 'true',
  );
  try {
    const report = await publicOriginMetricsSummary(db, { windowDays });
    privateReportFile(directory, 'summary.json', {
      generatedAt: new Date().toISOString(),
      ...report,
    });
    console.log(
      JSON.stringify({
        privateReportFile: '.local/public-origin-metrics/summary.json',
        cohortRows: report.cohorts.length,
        windowDays,
        paidAiCalls: 0,
        databaseWrites: 0,
      }),
    );
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    'Public-origin cohort report unavailable. Check the reporting window, database and migrations. Identifiers and credentials withheld.',
  );
  process.exitCode = 1;
});
