import {
  mkdirSync,
  realpathSync,
  existsSync,
  chmodSync,
  lstatSync,
  writeFileSync,
} from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';

export function privateReportDirectory(name: string) {
  if (!/^[a-z][a-z-]{2,60}$/.test(name))
    throw Error('Invalid private report name');
  const workspace = realpathSync(process.cwd());
  const parent = resolve('.local');
  if (!existsSync(parent)) mkdirSync(parent, { mode: 0o700 });
  const parentRel = relative(workspace, realpathSync(parent));
  if (parentRel.startsWith('..') || isAbsolute(parentRel))
    throw Error('Private reports must stay in the workspace');
  const directory = resolve(parent, name);
  if (existsSync(directory) && lstatSync(directory).isSymbolicLink())
    throw Error('Private report directory cannot be a symlink');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const rel = relative(workspace, realpathSync(directory));
  if (rel.startsWith('..') || isAbsolute(rel))
    throw Error('Private reports must stay in the workspace');
  if (process.platform === 'win32') {
    const sid = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], {
      encoding: 'utf8',
    }).match(/S-1-5-[0-9-]+/)?.[0];
    if (!sid) throw Error('Private report ACL unavailable');
    execFileSync('icacls', [directory, '/reset'], { stdio: 'ignore' });
    execFileSync(
      'icacls',
      [
        directory,
        '/inheritance:r',
        '/grant:r',
        `*${sid}:(OI)(CI)F`,
        '*S-1-5-18:(OI)(CI)F',
      ],
      { stdio: 'ignore' },
    );
  } else chmodSync(directory, 0o700);
  return directory;
}
export function privateReportFile(
  directory: string,
  name: string,
  data: unknown,
) {
  if (!/^[a-z][a-z-]{1,60}\.json$/.test(name))
    throw Error('Invalid report file');
  const file = resolve(directory, name);
  let info;
  try {
    info = lstatSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (info) {
    if (info.isSymbolicLink() || info.nlink !== 1)
      throw Error('Private report cannot replace a linked file');
    if (process.platform === 'win32')
      execFileSync('icacls', [file, '/reset'], { stdio: 'ignore' });
    else chmodSync(file, 0o600);
  }
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}
export function privateRequestFile(directory: string, path: string) {
  const file = realpathSync(resolve(path)),
    rel = relative(realpathSync(directory), file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel))
    throw Error('Request must stay in the protected report directory');
  const info = lstatSync(file);
  if (!info.isFile() || info.nlink !== 1)
    throw Error('Request must be a private regular file');
  return file;
}
