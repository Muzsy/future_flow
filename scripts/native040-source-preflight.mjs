import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// This checks source scope only. Deployment still requires the native-040
// image, service-profile, backup, restore and recovery proofs.
const serving = '1d312d29f203738c9f9d9a6e5338408c74b82f0b';
const candidate = '878ec93c3ee49a0af386b90736b4ab455ef4d984';
const allowed = 'packages/core/src/billing-stripe.ts';
const scope = [
  'apps',
  'packages',
  'database',
  'deploy',
  'Dockerfile',
  '.dockerignore',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
];

function git(args) {
  return execFileSync('git', args, { encoding: 'buffer' });
}

try {
  git(['merge-base', '--is-ancestor', serving, candidate]);
  git(['merge-base', '--is-ancestor', candidate, 'HEAD']);
  if (git(['status', '--porcelain', '--untracked-files=no']).length)
    throw Error('Tracked workspace changes prevent the source comparison');
  const paths = git([
    'diff',
    '--no-renames',
    '--name-only',
    '-z',
    serving,
    candidate,
    '--',
    ...scope,
  ])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  if (paths.length !== 1 || paths[0] !== allowed)
    throw Error('Candidate application scope differs from the reviewed fix');
  const sha256 = createHash('sha256')
    .update(git(['show', `${candidate}:${allowed}`]))
    .digest('hex');
  console.log(
    JSON.stringify({
      servingCommit: serving,
      candidateCommit: candidate,
      changedFile: allowed,
      changedFileSha256: sha256,
      sourceScopePassed: true,
      deploymentApproved: false,
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
