import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { DomainError } from '@future-flow/core';

export function acquirePaidSmokeLock() {
  const path = resolve('.local/ai-smoke/paid-run.lock');
  mkdirSync(dirname(path), { recursive: true });
  let fd: number;
  try {
    fd = openSync(path, 'wx');
  } catch {
    throw new DomainError(
      'SMOKE_RUN_ACTIVE',
      'A paid smoke process is already active.',
    );
  }
  const owner = JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });
  writeFileSync(fd, owner);
  closeSync(fd);
  const release = () => {
    if (existsSync(path) && readFileSync(path, 'utf8') === owner)
      unlinkSync(path);
  };
  process.once('exit', release);
  return release;
}
