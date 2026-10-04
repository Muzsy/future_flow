import { connectDatabase, feedbackSummary } from '@future-flow/database';
async function main() {
  const db = connectDatabase(
    process.env.DATABASE_URL ?? '',
    process.env.DATABASE_SSL === 'true',
  );
  try {
    console.log(JSON.stringify(await feedbackSummary(db), null, 2));
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    'Feedback report unavailable. Check the database and migrations.',
  );
  process.exitCode = 1;
});
