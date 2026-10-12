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
const expiryJournal = '.expiry-journal';
const digest = (data) => createHash('sha256').update(data).digest('hex');
const execute = promisify(execFile);
let assertOperatorLocalInput = () => {};
let operatorSecretsDirectory;
function sameOperatorPath(left, right) {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}
let phase = 'local-validation';

function regular(path) {
  assertOperatorLocalInput(path);
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
    !sameOperatorPath(fs.realpathSync(path), path)
  )
    throw Error('Archive directory alias rejected');
  return path;
}

function directoryIdentity(path) {
  const value = fs.lstatSync(path, { bigint: true });
  if (
    !value.isDirectory() ||
    value.isSymbolicLink() ||
    !sameOperatorPath(fs.realpathSync(path), resolve(path))
  )
    throw Error('Original daily directory required');
  return [value.dev.toString(), value.ino.toString()];
}

function fileSnapshot(path) {
  const before = fs.lstatSync(path, { bigint: true });
  const identity = (value) =>
    [
      value.dev,
      value.ino,
      value.mode,
      value.nlink,
      value.size,
      value.mtimeNs,
      process.platform === 'win32' ? value.birthtimeNs : value.ctimeNs,
    ].map(String);
  if (before.size > BigInt(512 * 1024 ** 2))
    throw Error('Bounded daily file required');
  const bytes = regular(path);
  if (
    identity(before).join('|') !==
      identity(fs.lstatSync(path, { bigint: true })).join('|') ||
    BigInt(bytes.length) !== before.size
  )
    throw Error('Daily original changed during read');
  return {
    bytes,
    entry: {
      identity: identity(before),
      bytes: bytes.length,
      sha256: digest(bytes),
    },
  };
}

function manifestCreated(manifest, name, now) {
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
    created > now + 300000 ||
    !/(?:Z|\+00:00)$/.test(manifest.capturedAt)
  )
    throw Error('Archive timestamp invalid');
  for (const expected of Object.values(manifest.encryptedFiles)) {
    if (
      Object.keys(expected).sort().join('|') !== 'bytes|sha256' ||
      !Number.isSafeInteger(expected.bytes) ||
      expected.bytes <= 0 ||
      expected.bytes > 512 * 1024 ** 2 ||
      !/^[a-f0-9]{64}$/.test(expected.sha256)
    )
      throw Error('Exact bounded daily ciphertext binding required');
  }
  return created;
}

function archiveInventory(root, now) {
  const rootIdentity = directoryIdentity(root),
    metadata = join(root, expiryJournal),
    intents = new Map();
  let metadataBytes = 0,
    cipherBytes = 0;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let metadataPresent = false;
  try {
    fs.lstatSync(metadata);
    metadataPresent = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (metadataPresent) {
    directoryIdentity(metadata);
    for (const name of fs.readdirSync(metadata).sort()) {
      const run = name.replace(/\.json$/, '');
      if (!runPattern.test(run) || name !== run + '.json')
        throw Error('Unknown or interrupted daily deletion metadata');
      const path = join(metadata, name);
      if (fs.lstatSync(path).size > 1024 ** 2)
        throw Error('Bounded daily intent required');
      const raw = fileSnapshot(path).bytes;
      metadataBytes += raw.length;
      const record = JSON.parse(raw);
      if (
        Object.keys(record).sort().join('|') !==
          'directoryIdentity|files|manifest|rootIdentity|runId|schemaVersion' ||
        record.schemaVersion !== 'alterward-local-daily-expiry-1' ||
        record.runId !== run ||
        !same(record.rootIdentity, rootIdentity) ||
        !Array.isArray(record.directoryIdentity) ||
        record.directoryIdentity.length !== 2 ||
        record.directoryIdentity.some((v) => !/^\d+$/.test(v)) ||
        Object.keys(record.files).sort().join('|') !==
          [...names].sort().join('|') ||
        now - manifestCreated(record.manifest, run, now) <= retention
      )
        throw Error('Original expired daily intent required');
      for (const [file, entry] of Object.entries(record.files)) {
        if (
          Object.keys(entry).sort().join('|') !== 'bytes|identity|sha256' ||
          !Array.isArray(entry.identity) ||
          entry.identity.length !== 7 ||
          entry.identity.some(
            (v) => typeof v !== 'string' || !/^\d+$/.test(v),
          ) ||
          !Number.isSafeInteger(entry.bytes) ||
          entry.bytes <= 0 ||
          entry.bytes > 512 * 1024 ** 2 ||
          !/^[a-f0-9]{64}$/.test(entry.sha256) ||
          (file !== 'manifest.json' &&
            (entry.bytes !== record.manifest.encryptedFiles[file].bytes ||
              entry.sha256 !== record.manifest.encryptedFiles[file].sha256))
        )
          throw Error('Original daily file identity required');
      }
      intents.set(run, record);
      if (intents.size > 10000 || metadataBytes > 32 * 1024 ** 2)
        throw Error('Daily metadata capacity reached');
    }
  } else if (fs.lstatSync(root).isSymbolicLink())
    throw Error('Original archive root required');
  const paths = fs.readdirSync(root).filter((name) => name !== expiryJournal);
  if (paths.length > 100 || paths.some((name) => !runPattern.test(name)))
    throw Error('Bounded exact daily archive set required');
  const records = [];
  for (const run of [...new Set([...paths, ...intents.keys()])].sort()) {
    const path = join(root, run),
      intent = intents.get(run),
      present = paths.includes(run),
      files = {};
    let dirIdentity, manifest;
    if (present) {
      dirIdentity = directoryIdentity(archiveDirectory(root, run));
      const actual = fs.readdirSync(path);
      if (
        actual.some((name) => !names.includes(name)) ||
        (!intent && actual.length !== names.length) ||
        (intent && !same(dirIdentity, intent.directoryIdentity))
      )
        throw Error('Original daily directory incomplete or replaced');
      for (const name of actual.sort()) {
        const { bytes, entry } = fileSnapshot(join(path, name));
        files[name] = entry;
        if (intent && !same(entry, intent.files[name]))
          throw Error('Daily original changed after intent');
        if (name !== 'manifest.json') cipherBytes += bytes.length;
      }
      manifest = intent
        ? intent.manifest
        : JSON.parse(regular(join(path, 'manifest.json')));
      if (
        files['manifest.json'] &&
        digest(regular(join(path, 'manifest.json'))) !==
          files['manifest.json'].sha256
      )
        throw Error('Manifest changed during read');
      for (const name of names.filter((n) => n !== 'manifest.json'))
        if (
          files[name] &&
          (files[name].bytes !== manifest.encryptedFiles[name].bytes ||
            files[name].sha256 !== manifest.encryptedFiles[name].sha256)
        )
          throw Error('Daily ciphertext differs from manifest');
    } else if (intent) {
      dirIdentity = intent.directoryIdentity;
      manifest = intent.manifest;
    } else throw Error('Missing unjournaled daily archive');
    const created = manifestCreated(manifest, run, now),
      original = intent ?? {
        schemaVersion: 'alterward-local-daily-expiry-1',
        runId: run,
        rootIdentity,
        directoryIdentity: dirIdentity,
        manifest,
        files,
      };
    records.push({
      path,
      created,
      manifest,
      hashes: Object.fromEntries(
        Object.entries(files).map(([name, value]) => [name, value.sha256]),
      ),
      files,
      original,
      pending: !!intent,
      present,
    });
  }
  if (cipherBytes > 512 * 1024 ** 2)
    throw Error('Daily ciphertext byte capacity reached');
  return records;
}

function localArchives(root) {
  const records = archiveInventory(root, Date.now());
  if (
    records.some(
      (r) => r.present && Object.keys(r.files).length !== names.length,
    )
  )
    throw Error('Daily expiry needs guarded resumption before inventory');
  return records.filter((r) => r.present && !r.pending);
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
        !sameOperatorPath(fs.realpathSync(path), path)
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
  const now = Date.now(),
    records = archiveInventory(root, now),
    expired = records.filter((r) => now - r.created > retention);
  if (JSON.stringify(archiveInventory(root, now)) !== JSON.stringify(records))
    throw Error('Daily batch changed before intent');
  if (!expired.length) return 0;
  const metadata = join(root, expiryJournal);
  if (!fs.existsSync(metadata)) {
    fs.mkdirSync(metadata, { mode: 0o700 });
    syncDirectory(root);
  }
  directoryIdentity(metadata);
  const additions = expired.filter((record) => !record.pending),
    serialized = additions.map((record) =>
      Buffer.from(JSON.stringify(record.original)),
    );
  if (
    records.filter((record) => record.pending).length + additions.length >
      10000 ||
    serialized.some((raw) => raw.length > 1024 ** 2) ||
    fs
      .readdirSync(metadata)
      .reduce((sum, name) => sum + fs.lstatSync(join(metadata, name)).size, 0) +
      serialized.reduce((sum, raw) => sum + raw.length, 0) >
      32 * 1024 ** 2
  )
    throw Error('Daily intent capacity would be exceeded');
  for (const record of expired)
    if (!record.pending) {
      const path = join(metadata, pathBasename(record.path) + '.json'),
        temporary = join(
          metadata,
          '.pending-' + pathBasename(record.path) + '.json',
        ),
        raw = Buffer.from(JSON.stringify(record.original));
      if (fs.existsSync(path))
        throw Error('Daily original intent already exists');
      const fd = fs.openSync(temporary, 'wx', 0o600);
      try {
        fs.writeFileSync(fd, raw);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      if (fs.existsSync(path)) throw Error('Daily original intent changed');
      fs.renameSync(temporary, path);
      syncDirectory(metadata);
    }
  const checked = archiveInventory(root, now);
  if (
    checked.length !== records.length ||
    checked.some(
      (r, i) =>
        JSON.stringify(r.original) !== JSON.stringify(records[i].original) ||
        JSON.stringify(r.files) !== JSON.stringify(records[i].files) ||
        r.present !== records[i].present,
    )
  )
    throw Error('Daily batch changed after durable intents');
  let removed = 0;
  for (const record of checked.filter(
    (r) => now - r.created > retention && r.present,
  )) {
    for (const name of Object.keys(record.files).sort(
      (a, b) =>
        (a === 'manifest.json') - (b === 'manifest.json') || a.localeCompare(b),
    )) {
      if (
        JSON.stringify(directoryIdentity(root)) !==
          JSON.stringify(record.original.rootIdentity) ||
        JSON.stringify(directoryIdentity(record.path)) !==
          JSON.stringify(record.original.directoryIdentity) ||
        JSON.stringify(fileSnapshot(join(record.path, name)).entry) !==
          JSON.stringify(record.original.files[name])
      )
        throw Error('Daily original changed immediately before unlink');
      fs.unlinkSync(join(record.path, name));
      syncDirectory(record.path);
    }
    if (
      JSON.stringify(directoryIdentity(record.path)) !==
        JSON.stringify(record.original.directoryIdentity) ||
      fs.readdirSync(record.path).length
    )
      throw Error('Only original empty daily directory may be removed');
    fs.rmdirSync(record.path);
    syncDirectory(root);
    removed++;
  }
  archiveInventory(root, now);
  return removed;
}

function pathBasename(path) {
  return path.split(/[\\/]/).at(-1);
}
function syncDirectory(path) {
  if (process.platform !== 'win32') {
    const fd = fs.openSync(path, 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
}

async function runOperator() {
  const action = process.argv[2]?.slice(2);
  if (
    !['win32', 'linux'].includes(process.platform) ||
    process.argv.length !== 3 ||
    !actions.includes(action)
  )
    throw Error('Explicit pinned operator action required');
  const directory = privateReportDirectory('contabo-daily');
  const archives = join(directory, 'archives');
  if (!fs.existsSync(archives)) fs.mkdirSync(archives, { mode: 0o700 });
  if (
    fs.lstatSync(archives).isSymbolicLink() ||
    !sameOperatorPath(fs.realpathSync(archives), resolve(archives))
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
  const secrets = operatorSecretsDirectory();
  if (
    !fs.lstatSync(secrets).isDirectory() ||
    fs.lstatSync(secrets).isSymbolicLink() ||
    !sameOperatorPath(fs.realpathSync(secrets), resolve(secrets))
  )
    throw Error('Exact protected SSH secrets directory required');
  const key = join(secrets, 'contabo_alterward_ed25519');
  const pin = join(secrets, 'contabo_known_hosts');
  regular(key);
  const host = regular(pin).toString().trim().split(/\s+/)[0];
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))
    throw Error('Pinned server required');
  const options = [
    ...(process.platform === 'linux'
      ? [
          '-F',
          'none',
          '-o',
          'GlobalKnownHostsFile=none',
          '-o',
          'IdentitiesOnly=yes',
          '-o',
          'ClearAllForwardings=yes',
        ]
      : []),
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
  {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    for (const file of [
      'scripts/contabo-daily.mjs',
      'scripts/lib/private-report.ts',
      'scripts/lib/operator-platform.mjs',
    ])
      if (
        digest(regular(file)) !==
        digest(execFileSync('git', ['show', `${commit}:${file}`]))
      )
        throw Error('Exact committed operator dependencies required');
  }
  ({ assertOperatorLocalInput, operatorSecretsDirectory } =
    await import('./lib/operator-platform.mjs'));
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
