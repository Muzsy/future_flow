import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validatePrivateHealth } from './lib/private-health.mjs';

let directory;
try {
  if (
    process.platform !== 'linux' ||
    process.argv.slice(2).join('|') !== '--check'
  )
    throw Error('Linux private monitor check required');
  const host = process.env.ALTERWARD_MONITOR_HOST ?? '';
  const pin = process.env.ALTERWARD_MONITOR_KNOWN_HOSTS ?? '';
  const key = process.env.ALTERWARD_MONITOR_SSH_KEY ?? '';
  const source = createHash('sha256')
    .update(
      fs.readFileSync(
        new URL('./ops/contabo-health-projection.py', import.meta.url),
      ),
    )
    .digest('hex');
  if (
    !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) ||
    !pin.startsWith(`${host} ssh-ed25519 `) ||
    pin.trim().split(/\r?\n/).length !== 1 ||
    !/^-----BEGIN OPENSSH PRIVATE KEY-----\n[A-Za-z0-9+/=\r\n]+-----END OPENSSH PRIVATE KEY-----\s*$/.test(
      key,
    )
  )
    throw Error('Dedicated restricted monitor key and exact host pin required');
  directory = fs.mkdtempSync(join(os.tmpdir(), 'alterward-health-'));
  fs.chmodSync(directory, 0o700);
  const identity = join(directory, 'identity'),
    known = join(directory, 'known_hosts');
  fs.writeFileSync(identity, key, { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(known, pin + '\n', { mode: 0o600, flag: 'wx' });
  delete process.env.ALTERWARD_MONITOR_SSH_KEY;
  const raw = execFileSync(
    'ssh',
    [
      '-F',
      '/dev/null',
      '-i',
      identity,
      '-o',
      `UserKnownHostsFile=${known}`,
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'BatchMode=yes',
      '-o',
      'IdentitiesOnly=yes',
      '-o',
      'ConnectTimeout=10',
      '-o',
      'ClearAllForwardings=yes',
      '-T',
      `root@${host}`,
      'alterward-health-v1',
    ],
    {
      encoding: 'utf8',
      timeout: 20000,
      maxBuffer: 16384,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  console.log(JSON.stringify(validatePrivateHealth(raw, source)));
} catch {
  console.error(
    'Alterward private health check failed. Inspect protected operator evidence.',
  );
  process.exitCode = 1;
} finally {
  if (directory) {
    // This directory was just created exclusively by this process, with exactly
    // these two files. No user-supplied path or recursive removal is used.
    for (const name of ['identity', 'known_hosts']) {
      const path = join(directory, name);
      if (fs.existsSync(path)) fs.unlinkSync(path);
    }
    fs.rmdirSync(directory);
  }
}
