import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  privateReportDirectory,
  privateReportFile,
} from './lib/private-report.ts';

const actions = [
  'prepare',
  'update',
  'backup',
  'monitor',
  'status',
  'activate',
  'disable',
  'sync',
  'restore-latest',
  'expire-local',
];
const runPattern = /^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$/;
const names = ['config.tar.age', 'application.dump.age', 'manifest.json'];
const retention = 7 * 86400000;
const digest = (data) => createHash('sha256').update(data).digest('hex');
const execute = promisify(execFile);
let phase = 'local-validation';

function regular(path) {
  const value = fs.lstatSync(path);
  if (!value.isFile() || value.isSymbolicLink() || value.nlink !== 1)
    throw Error('Private regular file required');
  return fs.readFileSync(path);
}

function archiveDirectory(root, name) {
  if (!runPattern.test(name)) throw Error('Exact daily archive name required');
  const path = resolve(root, name);
  const value = fs.lstatSync(path);
  if (
    !value.isDirectory() ||
    value.isSymbolicLink() ||
    fs.realpathSync(path).toLowerCase() !== path.toLowerCase()
  )
    throw Error('Archive directory alias rejected');
  return path;
}

function localArchives(root) {
  return fs.readdirSync(root).map((name) => {
    const path = archiveDirectory(root, name);
    if (fs.readdirSync(path).sort().join('|') !== [...names].sort().join('|'))
      throw Error('Unexpected archive file set');
    const bytes = regular(join(path, 'manifest.json'));
    const manifest = JSON.parse(bytes);
    if (
      manifest.managedBy !== 'alterward-daily-1' ||
      manifest.schemaVersion !== 'contabo-backup-1' ||
      manifest.runId !== name ||
      Object.keys(manifest.encryptedFiles).sort().join('|') !==
        'application.dump.age|config.tar.age'
    )
      throw Error('Daily archive identity invalid');
    const timestamp = name.slice(0, 16);
    const namedTime = Date.parse(
      `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}Z`,
    );
    const created = Date.parse(manifest.capturedAt);
    if (
      !Number.isFinite(created) ||
      created - namedTime < 0 ||
      created - namedTime >= 1000 ||
      created > Date.now() + 300000
    )
      throw Error('Archive timestamp invalid');
    const hashes = { 'manifest.json': digest(bytes) };
    for (const [file, expected] of Object.entries(manifest.encryptedFiles)) {
      const data = regular(join(path, file));
      if (data.length !== expected.bytes || digest(data) !== expected.sha256)
        throw Error('Local ciphertext hash mismatch');
      hashes[file] = digest(data);
    }
    return { path, created, manifest, hashes };
  });
}

function cleanPending(root) {
  const pending = fs
    .readdirSync(root)
    .filter((name) => name.startsWith('.pending-'))
    .map((name) => {
      const run = name.slice('.pending-'.length);
      if (!runPattern.test(run)) throw Error('Unknown pending archive');
      const path = resolve(root, name);
      const info = fs.lstatSync(path);
      if (
        !info.isDirectory() ||
        info.isSymbolicLink() ||
        fs.realpathSync(path).toLowerCase() !== path.toLowerCase()
      )
        throw Error('Pending directory alias rejected');
      const files = fs.readdirSync(path);
      if (files.some((name) => !names.includes(name)))
        throw Error('Unmanaged pending entry');
      files.forEach((file) => regular(join(path, file)));
      return { path, files };
    });
  for (const { path, files } of pending) {
    files.forEach((file) => fs.unlinkSync(join(path, file)));
    fs.rmdirSync(path);
  }
}

function expireLocal(root) {
  cleanPending(root);
  const expired = localArchives(root).filter(
    (archive) => Date.now() - archive.created > retention,
  );
  for (const archive of expired) {
    for (const file of names)
      if (digest(regular(join(archive.path, file))) !== archive.hashes[file])
        throw Error('Archive changed before local expiry');
  }
  for (const archive of expired) {
    for (const file of names) fs.unlinkSync(join(archive.path, file));
    fs.rmdirSync(archive.path);
  }
  return expired.length;
}

async function runOperator() {
  const action = process.argv[2]?.slice(2);
  if (
    process.platform !== 'win32' ||
    !process.env.LOCALAPPDATA ||
    process.argv.length !== 3 ||
    !actions.includes(action)
  )
    throw Error('Explicit pinned Windows operator action required');
  const directory = privateReportDirectory('contabo-daily');
  const archives = join(directory, 'archives');
  if (!fs.existsSync(archives)) fs.mkdirSync(archives, { mode: 0o700 });
  if (
    fs.lstatSync(archives).isSymbolicLink() ||
    fs.realpathSync(archives).toLowerCase() !== resolve(archives).toLowerCase()
  )
    throw Error('Private archive root alias rejected');
  const localExpired = expireLocal(archives);
  if (action === 'expire-local') {
    privateReportFile(directory, 'local-expiry-proof.json', {
      capturedAt: new Date().toISOString(),
      expired: localExpired,
      retentionDays: 7,
    });
    console.log(JSON.stringify({ localExpired, retentionDays: 7 }));
    return;
  }
  const secrets = join(process.env.LOCALAPPDATA, 'FutureFlow', 'secrets');
  const key = join(secrets, 'contabo_alterward_ed25519');
  const pin = join(secrets, 'contabo_known_hosts');
  regular(key);
  const host = regular(pin).toString().trim().split(/\s+/)[0];
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))
    throw Error('Pinned server required');
  const options = [
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
  const installer = regular('scripts/ops/contabo-daily-install.py');
  const loader = `python3 -c 'import base64;exec(compile(base64.b64decode("${installer.toString('base64')}"),"<daily-operator>","exec"),{"__name__":"__main__"})'`;
  async function remote(request) {
    const pending = execute('ssh', [...options, loader], {
      encoding: 'utf8',
      timeout: 480000,
      maxBuffer: 2 * 1024 * 1024,
    });
    pending.child.stdin.end(JSON.stringify(request));
    const { stdout } = await pending;
    const response = JSON.parse(stdout);
    if (!response.ok) throw Error('Private remote daily operation failed');
    return response.result;
  }
  phase = 'remote-' + action;
  let result;
  if (['prepare', 'update'].includes(action)) {
    if (
      execFileSync('git', ['status', '--porcelain'], {
        encoding: 'utf8',
      }).trim()
    )
      throw Error('Committed clean ops source required');
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const tools = JSON.parse(
      regular('.local/contabo-release/backup-tool-versions.json'),
    );
    const operator = JSON.parse(
      regular('.local/closed-site-operator/operator-config.json'),
    );
    const identity = regular(join(secrets, 'alterward_backup_identity.txt'));
    const pending = execute(
      'ssh',
      [...options, '/root/alterward-ops/tools/usr/bin/age-keygen -y'],
      { encoding: 'utf8', timeout: 30000 },
    );
    pending.child.stdin.end(identity);
    const recipient = (await pending).stdout.trim();
    const sources = {
      'backup_lib.py': regular('scripts/ops/contabo-backup.py'),
      'contabo-daily.py': regular('scripts/ops/contabo-daily.py'),
      'daily_entry.py': regular('scripts/ops/contabo-daily-entry.py'),
    };
    const config = {
      schemaVersion: 'alterward-daily-1',
      retentionSeconds: 7 * 86400,
      recipient,
      postgresImage: tools.postgresImage,
      teamDomain: operator.cloudflareAccess.teamDomain,
      sourceCommit: commit,
      scriptHashes: Object.fromEntries(
        Object.entries(sources).map(([name, data]) => [name, digest(data)]),
      ),
    };
    result = await remote({
      action,
      config,
      ...(action === 'update'
        ? {
            previousScriptHashes: JSON.parse(
              regular(
                join(
                  directory,
                  fs.existsSync(join(directory, 'update-proof.json'))
                    ? 'update-proof.json'
                    : 'prepare-proof.json',
                ),
              ),
            ).scriptHashes,
          }
        : {}),
      scripts: Object.fromEntries(
        Object.entries(sources).map(([name, data]) => [
          name,
          data.toString('base64'),
        ]),
      ),
    });
  } else if (action === 'sync') {
    const inventory = await remote({ action: 'inventory' });
    for (const manifest of inventory.manifests) {
      if (
        manifest.managedBy !== 'alterward-daily-1' ||
        !runPattern.test(manifest.runId) ||
        Object.keys(manifest.encryptedFiles).sort().join('|') !==
          'application.dump.age|config.tar.age'
      )
        throw Error('Managed daily inventory required');
      if (Date.now() - Date.parse(manifest.capturedAt) > retention) continue;
      const final = resolve(archives, manifest.runId);
      if (fs.existsSync(final)) {
        const current = localArchives(archives).find(
          (record) => record.manifest.runId === manifest.runId,
        );
        if (
          JSON.stringify(current.manifest.encryptedFiles) !==
          JSON.stringify(manifest.encryptedFiles)
        )
          throw Error('Existing daily archive differs');
        continue;
      }
      const stage = resolve(archives, '.pending-' + manifest.runId);
      fs.mkdirSync(stage, { mode: 0o700 });
      for (const [name, expected] of Object.entries(manifest.encryptedFiles)) {
        const { stdout } = await execute(
          'ssh',
          [
            ...options,
            `cat /root/alterward-ops/daily/backups/${manifest.runId}/${name}`,
          ],
          {
            encoding: 'buffer',
            timeout: 60000,
            maxBuffer: 128 * 1024 * 1024,
          },
        );
        if (
          stdout.length !== expected.bytes ||
          digest(stdout) !== expected.sha256
        )
          throw Error('Offsite ciphertext mismatch');
        fs.writeFileSync(join(stage, name), stdout, {
          flag: 'wx',
          mode: 0o600,
        });
      }
      fs.writeFileSync(join(stage, 'manifest.json'), JSON.stringify(manifest), {
        flag: 'wx',
        mode: 0o600,
      });
      fs.renameSync(stage, final);
    }
    const records = localArchives(archives);
    result = {
      offsiteCiphertextVerified: true,
      localArchives: records.length,
      latestRunId: records.sort((a, b) => b.created - a.created)[0]?.manifest
        .runId,
      localExpired,
      retentionDays: 7,
      localMachineIndependentRedundancy: false,
    };
  } else if (action === 'restore-latest') {
    const record = localArchives(archives).sort(
      (a, b) => b.created - a.created,
    )[0];
    if (!record) throw Error('Synced offsite archive required');
    const identity = regular(join(secrets, 'alterward_backup_identity.txt'));
    result = await remote({
      action: 'rehearse',
      manifest: record.manifest,
      identity: identity.toString(),
      files: Object.fromEntries(
        Object.keys(record.manifest.encryptedFiles).map((name) => [
          name,
          regular(join(record.path, name)).toString('base64'),
        ]),
      ),
    });
  } else if (action === 'activate') {
    const restoreProof = JSON.parse(
      regular(join(directory, 'restore-latest-proof.json')),
    );
    result = await remote({ action, restoreProof });
  } else result = await remote({ action });
  privateReportFile(directory, action + '-proof.json', {
    ...result,
    capturedAt: new Date().toISOString(),
    operatorSourceSha256: digest(installer),
  });
  console.log(
    JSON.stringify({
      action,
      ok: true,
      resultKeys: Object.keys(result),
      providerApiCalls: 0,
    }),
  );
}
async function main() {
  const directory = privateReportDirectory('contabo-daily');
  const lock = join(directory, 'job.lock');
  if (fs.existsSync(lock)) {
    const bytes = regular(lock);
    const old = JSON.parse(bytes);
    if (!Number.isInteger(old.pid) || old.pid <= 0)
      throw Error('Unrecognized local lock');
    try {
      process.kill(old.pid, 0);
      console.log(
        JSON.stringify({ deferred: true, localOperatorAlreadyRunning: true }),
      );
      return;
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    if (digest(regular(lock)) !== digest(bytes))
      throw Error('Local lock changed');
    fs.unlinkSync(lock);
  }
  const lockBytes = Buffer.from(
    JSON.stringify({ pid: process.pid, capturedAt: new Date().toISOString() }),
  );
  fs.writeFileSync(lock, lockBytes, { flag: 'wx', mode: 0o600 });
  try {
    await runOperator();
  } finally {
    if (digest(regular(lock)) !== digest(lockBytes))
      throw Error('Local lock ownership changed');
    fs.unlinkSync(lock);
  }
}

export { expireLocal, localArchives, cleanPending };

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch(() => {
    console.error(
      `Daily operator stopped during ${phase}; no credentials printed.`,
    );
    process.exitCode = 1;
  });
}
