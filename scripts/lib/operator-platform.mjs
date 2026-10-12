import fs from 'node:fs';
import { isAbsolute, resolve, dirname, join, relative } from 'node:path';

export function supportedOperatorPlatform(platform = process.platform) {
  return platform === 'win32' || platform === 'linux';
}

export function sameOperatorPath(left, right, platform = process.platform) {
  return platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

// Linux inputs must be owned by the executing operator, confined by real
// directories, and private before reading. Never repair an unsafe input here.
export function assertLinuxPrivatePath(path, directory = false) {
  if (process.platform !== 'linux') return;
  const absolute = resolve(path);
  const info = fs.lstatSync(absolute);
  if (
    info.isSymbolicLink() ||
    (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1) ||
    info.uid !== process.getuid() ||
    (info.mode & 0o7777) !== (directory ? 0o700 : 0o600)
  )
    throw Error('Owned Linux 0700 directory or 0600 regular file required');
  let current = dirname(absolute);
  while (true) {
    const parent = fs.lstatSync(current);
    // Root-owned sticky temporary roots are allowed; operator-owned children
    // must still be private. No alias or writable shared ancestor is trusted.
    const stickyRoot = parent.uid === 0 && (parent.mode & 0o1000) !== 0;
    if (
      !parent.isDirectory() ||
      parent.isSymbolicLink() ||
      ((parent.mode & 0o022) !== 0 && !stickyRoot) ||
      (parent.uid !== 0 && parent.uid !== process.getuid())
    )
      throw Error('Linux private input ancestor rejected');
    if (current === dirname(current)) break;
    current = dirname(current);
  }
}

export function assertOperatorLocalInput(path) {
  if (process.platform !== 'linux') return;
  const local = resolve('.local');
  const rel = relative(local, resolve(path));
  if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
    assertLinuxPrivatePath(local, true);
    assertLinuxPrivatePath(path);
  }
}

export function operatorSecretsDirectory(environment = process.env) {
  if (!supportedOperatorPlatform())
    throw Error('Unsupported operator platform');
  const configured = environment.ALTERWARD_SSH_SECRETS_DIR;
  const path =
    configured ??
    (process.platform === 'win32' && environment.LOCALAPPDATA
      ? join(environment.LOCALAPPDATA, 'FutureFlow', 'secrets')
      : undefined);
  if (!path || !isAbsolute(path))
    throw Error('Explicit absolute protected SSH secrets directory required');
  const info = fs.lstatSync(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    !sameOperatorPath(fs.realpathSync(path), resolve(path))
  )
    throw Error('Exact protected SSH secrets directory required');
  assertLinuxPrivatePath(path, true);
  for (const name of [
    'contabo_known_hosts',
    'contabo_alterward_ed25519',
    ...(fs.existsSync(join(path, 'alterward_backup_identity.txt'))
      ? ['alterward_backup_identity.txt']
      : []),
  ]) {
    const file = join(path, name);
    const value = fs.lstatSync(file);
    if (
      !value.isFile() ||
      value.isSymbolicLink() ||
      value.nlink !== 1 ||
      value.size > 16384
    )
      throw Error('Bounded original protected SSH input required');
    assertLinuxPrivatePath(file);
  }
  return path;
}
