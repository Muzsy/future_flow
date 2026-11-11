import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  realpathSync,
  existsSync,
  chmodSync,
} from 'node:fs';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { connectDatabase, SharedSafetyRepository } from '@future-flow/database';
const requestSchema = z
  .object({
    contextId: z.uuid(),
    actionId: z.uuid(),
    contextRevision: z.number().int().nonnegative(),
    action: z.enum(['hold', 'release', 'dismiss']),
    actorLabel: z.string().trim().min(1).max(80),
    reason: z.string().trim().min(1).max(2000),
    reportId: z.uuid().optional(),
  })
  .strict();
async function main() {
  if (process.env.SHARED_MODERATION_ADMIN_ENABLED !== 'true')
    throw Error('Trusted operator opt-in required');
  const dir = resolve('.local/shared-moderation');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const reportFile = resolve(dir, 'reports.json');
  if (process.platform === 'win32') {
    // Restrict new reports before writing any content. Never echo the private report.
    const sid = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], {
      encoding: 'utf8',
    }).match(/S-1-5-[0-9-]+/)?.[0];
    if (!sid) throw Error('Private file ACL unavailable');
    execFileSync('icacls', [dir, '/reset'], { stdio: 'ignore' });
    execFileSync(
      'icacls',
      [
        dir,
        '/inheritance:r',
        '/grant:r',
        `*${sid}:(OI)(CI)F`,
        '*S-1-5-18:(OI)(CI)F',
      ],
      { stdio: 'ignore' },
    );
    if (existsSync(reportFile))
      execFileSync('icacls', [reportFile, '/reset'], { stdio: 'ignore' });
  } else {
    chmodSync(dir, 0o700);
    if (existsSync(reportFile)) chmodSync(reportFile, 0o600);
  }
  const db = connectDatabase(
    process.env.DATABASE_URL ?? '',
    process.env.DATABASE_SSL === 'true',
  );
  try {
    if (process.argv.includes('--list')) {
      const reports = await db.query(
        'SELECT id,context_id,target_type,target_id,reason,details,status,created_at FROM aw_shared_reports WHERE status=$1 ORDER BY created_at,id LIMIT 50',
        ['pending'],
      );
      writeFileSync(
        reportFile,
        JSON.stringify(
          { generatedAt: new Date().toISOString(), reports },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      console.log(
        JSON.stringify({
          privateReportFile: '.local/shared-moderation/reports.json',
          pendingReports: reports.length,
          publicOutputContainsReportText: false,
        }),
      );
      return;
    }
    const i = process.argv.indexOf('--request-file');
    if (i < 0 || !process.argv[i + 1] || !process.argv.includes('--apply'))
      throw Error('Provide a reviewed private request file and --apply');
    const file = realpathSync(resolve(process.argv[i + 1]!)),
      rel = relative(realpathSync(dir), file);
    if (!rel || rel.startsWith('..') || rel.includes(':'))
      throw Error('Request must stay in the protected moderation directory');
    const { contextId, ...input } = requestSchema.parse(
      JSON.parse(readFileSync(file, 'utf8')),
    );
    const result = await new SharedSafetyRepository(db).moderate(
      contextId,
      input,
    );
    console.log(
      JSON.stringify({
        moderationApplied: true,
        revision: result.revision,
        paidAiCalls: 0,
      }),
    );
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    'Moderation command failed. Check the trusted operator flag, private request, revision and migrations; no report text is logged.',
  );
  process.exitCode = 1;
});
