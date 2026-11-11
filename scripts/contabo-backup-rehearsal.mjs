import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { connectDatabase } from '../packages/database/dist/index.js';
import {
  privateReportDirectory,
  privateReportFile,
} from './lib/private-report.ts';

// Explicit operator command. No cron, app start, live restore, or AI spending.
const sshExec = promisify(execFile);
const directory = privateReportDirectory('contabo-release');
const secrets = join(process.env.LOCALAPPDATA ?? '', 'FutureFlow', 'secrets');
const pin = join(secrets, 'contabo_known_hosts');
const key = join(secrets, 'contabo_alterward_ed25519');
const identityFile = join(secrets, 'alterward_backup_identity.txt');
let phase = 'local-validation';

async function main() {
  const restoreOnly = process.argv[2] === '--restore-existing';
  if (process.argv.length > 3 || (process.argv[2] && !restoreOnly))
    throw Error('Unknown operator argument');
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA)
    throw Error('This operator entry point requires the pinned Windows setup');
  for (const file of [key, pin]) {
    if (lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile())
      throw Error('Pinned SSH files must be regular files');
  }
  const host = readFileSync(pin, 'utf8').trim().split(/\s+/)[0];
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))
    throw Error('Unexpected pinned host');
  const sshOptions = [
    '-i',
    key,
    '-o',
    `UserKnownHostsFile="${pin.replaceAll('\\', '/')}"`,
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=10',
    `root@${host}`,
  ];
  const script = readFileSync('scripts/ops/contabo-backup.py');
  const remoteCommand = `python3 -c 'import base64; exec(base64.b64decode("${script.toString('base64')}"))'`;
  async function remote(request) {
    const promise = sshExec('ssh', [...sshOptions, remoteCommand], {
      encoding: 'utf8',
      timeout: 480000,
      maxBuffer: 16 * 1024 * 1024,
    });
    // Secrets stay on stdin, never in command arguments or tool output.
    promise.child.stdin.end(JSON.stringify(request));
    try {
      const { stdout } = await promise;
      const response = JSON.parse(stdout);
      if (!response.ok) throw Error('Remote operation failed');
      return response.result;
    } catch (error) {
      try {
        const failure = JSON.parse(error.stdout);
        if (/^[a-z-]{1,60}$/.test(failure.phase)) phase = failure.phase;
      } catch {
        // SSH/provider stderr is never forwarded or saved to public logs.
      }
      throw Error('Remote operation failed');
    }
  }
  phase = 'prepare-isolated-tools';
  console.log('Preparing private encryption tool and PostgreSQL 17 image.');
  const tools = restoreOnly
    ? JSON.parse(
        readFileSync(join(directory, 'backup-tool-versions.json'), 'utf8'),
      )
    : await remote({ action: 'prepare' });
  if (!restoreOnly)
    privateReportFile(directory, 'backup-tool-versions.json', tools);
  if (!existsSync(identityFile)) {
    if (restoreOnly) throw Error('The original backup identity is required');
    const generated = await remote({ action: 'keygen' });
    writeFileSync(identityFile, generated.identity, {
      mode: 0o600,
      flag: 'wx',
    });
  }
  if (
    lstatSync(identityFile).isSymbolicLink() ||
    lstatSync(identityFile).nlink !== 1
  )
    throw Error('Decryption identity cannot be linked');
  const sid = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], {
    encoding: 'utf8',
  }).match(/S-1-5-[0-9-]+/)?.[0];
  if (!sid) throw Error('Private key ACL unavailable');
  execFileSync('icacls', [identityFile, '/reset'], { stdio: 'ignore' });
  execFileSync(
    'icacls',
    [identityFile, '/inheritance:r', '/grant:r', `*${sid}:F`, '*S-1-5-18:F'],
    { stdio: 'ignore' },
  );
  const identity = readFileSync(identityFile, 'utf8');
  // An existing identity is never silently replaced. Derive its public recipient
  // through the already-verified server tool, without leaving the key on disk.
  const recipientCommand = '/root/alterward-ops/tools/usr/bin/age-keygen -y';
  const recipientPromise = sshExec('ssh', [...sshOptions, recipientCommand], {
    encoding: 'utf8',
    timeout: 30000,
  });
  recipientPromise.child.stdin.end(identity);
  const recipient = (await recipientPromise).stdout.trim();
  if (!/^age1[0-9a-z]{58}$/.test(recipient))
    throw Error('Invalid backup recipient');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('Invalid source commit');
  let runId =
    new Date()
      .toISOString()
      .replaceAll('-', '')
      .replaceAll(':', '')
      .slice(0, 15) +
    'Z-' +
    randomBytes(4).toString('hex');
  let manifest;
  if (restoreOnly) {
    manifest = JSON.parse(
      readFileSync(join(directory, 'backup-manifest.json'), 'utf8'),
    );
    runId = manifest.runId;
    if (!/^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$/.test(runId))
      throw Error('Invalid existing backup name');
  } else {
    const connection = new URL(process.env.DATABASE_URL ?? '');
    if (
      !['postgres:', 'postgresql:'].includes(connection.protocol) ||
      process.env.DATABASE_SSL !== 'true' ||
      !process.env.DATABASE_SSL_CA_FILE ||
      connection.search
    )
      throw Error('A verified database TLS configuration is required');
    const database = {
      host: connection.hostname,
      port: connection.port || '5432',
      name: decodeURIComponent(connection.pathname.slice(1)),
      user: decodeURIComponent(connection.username),
      password: decodeURIComponent(connection.password),
    };
    const ca = readFileSync(process.env.DATABASE_SSL_CA_FILE, 'utf8');
    const db = connectDatabase(process.env.DATABASE_URL, true);
    try {
      phase = 'consistent-source-snapshot';
      manifest = await db.transaction(async (tx) => {
        await tx.query(
          'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
        );
        await tx.query("SET LOCAL timezone='UTC'");
        const [version] = await tx.query('SHOW server_version_num');
        if (Math.floor(Number(version.server_version_num) / 10000) !== 17)
          throw Error('Unexpected source PostgreSQL major');
        const [snapshot] = await tx.query('SELECT pg_export_snapshot() AS id');
        const tables = await tx.query(
          "SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
        );
        const expected = [];
        for (const table of tables) {
          if (!/^(aw_|ff_)[a-z0-9_]+$/.test(table.name))
            throw Error('Public schema includes unexpected objects');
          const [content] = await tx.query(
            `SELECT count(*)::int AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS digest FROM public."${table.name}" t`,
          );
          expected.push({ name: table.name, ...content });
        }
        phase = 'encrypted-backup-capture';
        console.log(
          'Capturing the existing proxy config and a consistent application snapshot.',
        );
        return remote({
          action: 'capture',
          runId,
          commit,
          snapshot: snapshot.id,
          database,
          ca,
          recipient,
          image: tools.postgresImage,
          tables: expected,
        });
      });
    } finally {
      await db.close();
    }
    privateReportFile(directory, 'backup-manifest.json', manifest);
  }
  phase = 'offsite-copy';
  const files = {};
  for (const [name, expected] of Object.entries(manifest.encryptedFiles)) {
    if (!['config.tar.age', 'application.dump.age'].includes(name))
      throw Error('Unexpected backup filename');
    const local = resolve(directory, `${runId}-${name}`);
    const stdout = restoreOnly
      ? readFileSync(local)
      : (
          await sshExec(
            'ssh',
            [...sshOptions, `cat /root/alterward-ops/backups/${runId}/${name}`],
            {
              encoding: 'buffer',
              timeout: 60000,
              maxBuffer: 128 * 1024 * 1024,
            },
          )
        ).stdout;
    if (
      stdout.length !== expected.bytes ||
      createHash('sha256').update(stdout).digest('hex') !== expected.sha256
    )
      throw Error('Offsite encrypted copy mismatch');
    if (!restoreOnly) writeFileSync(local, stdout, { mode: 0o600, flag: 'wx' });
    files[name] = readFileSync(local).toString('base64');
  }
  phase = 'isolated-restore';
  console.log(
    'Restoring the downloaded encrypted copies in isolation; existing apps remain running.',
  );
  const proof = await remote({ action: 'rehearse', manifest, files, identity });
  privateReportFile(directory, 'backup-restore-proof.json', {
    ...proof,
    capturedAt: new Date().toISOString(),
    operatorScriptSha256: createHash('sha256').update(script).digest('hex'),
    sourceCommit: manifest.sourceCommit,
    automaticRetentionConfigured: false,
    deletedDataReplayVerified: false,
    fullSupabaseAuthRestoreVerified: false,
  });
  console.log(JSON.stringify(proof));
}

main().catch(() => {
  console.error(
    `Backup rehearsal stopped safely (${phase}); no live restore or app activation.`,
  );
  process.exitCode = 1;
});
