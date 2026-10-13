// Local, explicit, one-time encrypted operator migration. No network or server
// operation. Windows originals are read only; Linux import never overwrites.
import fs from 'node:fs';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  publicEncrypt,
  privateDecrypt,
  constants,
} from 'node:crypto';

const version = 'alterward-operator-transfer-1';
const limit = 32 * 1024 ** 2;
const groups = [
  'contabo-release',
  'contabo-daily',
  'personal-beta-operator',
  'reader-preparation-archive',
];
const secrets = [
  'contabo_known_hosts',
  'contabo_alterward_ed25519',
  'alterward_backup_identity.txt',
];
const sha = (data) => createHash('sha256').update(data).digest('hex');
const aad = Buffer.from(version);

function boundedFile(path, maximum = limit) {
  const info = fs.lstatSync(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1 ||
    info.size > maximum
  )
    throw Error('Bounded original regular migration input required');
  const data = fs.readFileSync(path);
  const after = fs.lstatSync(path);
  if (
    [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join('|') !==
      [after.dev, after.ino, after.size, after.mtimeMs, after.ctimeMs].join(
        '|',
      ) ||
    data.length !== info.size
  )
    throw Error('Migration input changed during read');
  return data;
}
function entryExists(path) {
  try {
    fs.lstatSync(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
function originalDirectory(path) {
  const info = fs.lstatSync(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    fs.realpathSync(path) !== resolve(path)
  )
    throw Error('Original migration directory required');
}
function validPath(path) {
  if (
    typeof path !== 'string' ||
    !/^[a-zA-Z0-9_.\/-]+$/.test(path) ||
    isAbsolute(path) ||
    path.includes('\\') ||
    path.split('/').some((x) => !x || x === '.' || x === '..')
  )
    return false;
  const parts = path.split('/');
  if (parts[0] === 'operator-secrets')
    return parts.length === 2 && secrets.includes(parts[1]);
  if (path === 'closed-site-operator/operator-config.json') return true;
  return (
    groups.includes(parts[0]) &&
    parts.length >= 2 &&
    parts.length <= 5 &&
    path.endsWith('.json') &&
    !parts.includes('archives')
  );
}
export function validateTransfer(payload) {
  if (
    payload?.schemaVersion !== version ||
    !Array.isArray(payload.files) ||
    payload.files.length > 512 ||
    !/^[a-f0-9]{40}$/.test(payload.sourceCommit)
  )
    throw Error('Bounded operator transfer required');
  const names = new Set();
  let total = 0;
  const files = payload.files.map((entry) => {
    if (
      !validPath(entry.path) ||
      names.has(entry.path) ||
      typeof entry.data !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        entry.data,
      )
    )
      throw Error('Migration entry path or encoding rejected');
    names.add(entry.path);
    const bytes = Buffer.from(entry.data, 'base64');
    total += bytes.length;
    if (
      bytes.length > 2 * 1024 ** 2 ||
      total > limit ||
      sha(bytes) !== entry.sha256
    )
      throw Error('Migration entry hash or size rejected');
    return { path: entry.path, bytes, sha256: entry.sha256 };
  });
  for (const required of [
    'closed-site-operator/operator-config.json',
    'contabo-release/owner-stage-proof.json',
    'contabo-release/owner-active-build-proof.json',
    'contabo-release/backup-tool-versions.json',
    ...secrets.map((name) => 'operator-secrets/' + name),
  ])
    if (!names.has(required))
      throw Error('Required original migration input missing');
  if (
    !names.has('contabo-daily/prepare-proof.json') &&
    !names.has('contabo-daily/update-proof.json')
  )
    throw Error('Original daily installation receipt missing');
  // Reject file/directory collisions before creating any output.
  for (const path of names) {
    let parent = dirname(path);
    while (parent !== '.') {
      if (names.has(parent)) throw Error('Migration path prefix collision');
      parent = dirname(parent);
    }
  }
  return files;
}
export function encryptTransfer(payload, publicKey) {
  validateTransfer(payload);
  const pub = createPublicKey(publicKey);
  if (
    pub.asymmetricKeyType !== 'rsa' ||
    pub.asymmetricKeyDetails.modulusLength < 3072
  )
    throw Error('RSA migration recipient of at least 3072 bits required');
  const key = randomBytes(32),
    iv = randomBytes(12);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload)),
      cipher.final(),
    ]);
    return {
      schemaVersion: version,
      recipientSha256: sha(pub.export({ type: 'spki', format: 'der' })),
      wrappedKey: publicEncrypt(
        {
          key: pub,
          oaepHash: 'sha256',
          padding: constants.RSA_PKCS1_OAEP_PADDING,
        },
        key,
      ).toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  } finally {
    key.fill(0);
  }
}
export function decryptTransfer(envelope, privateKey) {
  if (
    envelope?.schemaVersion !== version ||
    typeof envelope.ciphertext !== 'string' ||
    envelope.ciphertext.length > limit * 2
  )
    throw Error('Bounded encrypted migration envelope required');
  const pub = createPublicKey(privateKey);
  if (
    sha(pub.export({ type: 'spki', format: 'der' })) !==
    envelope.recipientSha256
  )
    throw Error('Migration recipient mismatch');
  const key = privateDecrypt(
    {
      key: privateKey,
      oaepHash: 'sha256',
      padding: constants.RSA_PKCS1_OAEP_PADDING,
    },
    Buffer.from(envelope.wrappedKey, 'base64'),
  );
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(envelope.iv, 'base64'),
    );
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]);
    try {
      const payload = JSON.parse(plaintext.toString());
      validateTransfer(payload);
      return payload;
    } finally {
      plaintext.fill(0);
    }
  } finally {
    key.fill(0);
  }
}
export function importTransfer(payload, workspace) {
  if (process.platform !== 'linux')
    throw Error('Migration import requires Linux');
  const files = validateTransfer(payload);
  originalDirectory(workspace);
  const destination = join(workspace, '.local');
  if (
    entryExists(destination) ||
    fs.lstatSync(workspace).uid !== process.getuid() ||
    (fs.lstatSync(workspace).mode & 0o7777) !== 0o700
  )
    throw Error('Empty private Linux operator workspace required');
  const staging = fs.mkdtempSync(join(workspace, '.operator-import-'));
  fs.chmodSync(staging, 0o700);
  try {
    for (const entry of files) {
      const path = join(staging, entry.path);
      fs.mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      fs.writeFileSync(path, entry.bytes, { mode: 0o600, flag: 'wx' });
      if (sha(boundedFile(path)) !== entry.sha256)
        throw Error('Migration write readback mismatch');
    }
    // Preserve every receipt's original bytes and timestamps inside the JSON.
    // Filesystem timestamps differ; this does not renew a preparation receipt.
    fs.writeFileSync(
      join(staging, 'operator-migration-manifest.json'),
      JSON.stringify(
        {
          schemaVersion: version,
          importedAt: new Date().toISOString(),
          sourceCommit: payload.sourceCommit,
          files: files.map(({ path, sha256 }) => ({ path, sha256 })),
          copiedBackupArchives: false,
          productionMutations: 0,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
    if (entryExists(destination)) throw Error('Migration destination appeared');
    fs.renameSync(staging, destination);
    return {
      imported: true,
      files: files.length,
      hashesVerified: true,
      productionMutations: 0,
    };
  } finally {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true });
  }
}
function exportState(publicPath, secretsPath, outputPath) {
  originalDirectory(resolve('.local'));
  const localLock = '.local/contabo-daily/job.lock';
  if (fs.existsSync(localLock)) {
    const lock = JSON.parse(boundedFile(localLock, 4096));
    if (!Number.isSafeInteger(lock.pid) || lock.pid <= 0)
      throw Error('Unknown migration source lock');
    try {
      process.kill(lock.pid, 0);
      throw Error('Source operator is still running');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  originalDirectory(resolve(secretsPath));
  const files = [];
  const originals = [];
  let totalBytes = 0;
  function add(path, name) {
    const bytes = boundedFile(path, 2 * 1024 ** 2);
    totalBytes += bytes.length;
    if (files.length >= 512 || totalBytes > limit)
      throw Error('Bounded migration export required');
    originals.push({ path, sha256: sha(bytes) });
    files.push({
      path: name,
      data: bytes.toString('base64'),
      sha256: sha(bytes),
    });
  }
  add(
    '.local/closed-site-operator/operator-config.json',
    'closed-site-operator/operator-config.json',
  );
  function scan(path, prefix, depth = 0) {
    if (depth > 3) throw Error('Bounded migration directory depth required');
    originalDirectory(resolve(path));
    for (const name of fs.readdirSync(path)) {
      const file = join(path, name);
      const info = fs.lstatSync(file);
      if (info.isSymbolicLink()) throw Error('Linked migration state rejected');
      if (name === 'archives' || name === 'job.lock') continue;
      if (info.isDirectory()) scan(file, prefix + '/' + name, depth + 1);
      else if (name.endsWith('.json')) add(file, prefix + '/' + name);
    }
  }
  for (const name of groups)
    if (fs.existsSync('.local/' + name)) scan('.local/' + name, name);
  for (const name of secrets)
    add(join(secretsPath, name), 'operator-secrets/' + name);
  const payload = {
    schemaVersion: version,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    files,
  };
  const encrypted = encryptTransfer(payload, boundedFile(publicPath, 16384));
  for (const original of originals)
    if (sha(boundedFile(original.path, 2 * 1024 ** 2)) !== original.sha256)
      throw Error('Migration state changed during export');
  fs.writeFileSync(outputPath, JSON.stringify(encrypted) + '\n', {
    mode: 0o600,
    flag: 'wx',
  });
  return {
    exported: true,
    files: files.length,
    recipientSha256: encrypted.recipientSha256,
    ciphertextSha256: sha(boundedFile(outputPath, limit * 2)),
    originalsUnchanged: true,
    productionMutations: 0,
  };
}
function main() {
  const [mode, first, second, third] = process.argv.slice(2);
  if (
    mode === '--create-recipient' &&
    first &&
    !second &&
    process.platform === 'linux'
  ) {
    const dir = resolve(first);
    fs.mkdirSync(dir, { mode: 0o700 });
    const pair = generateKeyPairSync('rsa', {
      modulusLength: 3072,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    fs.writeFileSync(join(dir, 'recipient-private.pem'), pair.privateKey, {
      mode: 0o600,
      flag: 'wx',
    });
    fs.writeFileSync(join(dir, 'recipient-public.pem'), pair.publicKey, {
      mode: 0o600,
      flag: 'wx',
    });
    console.log(
      JSON.stringify({
        created: true,
        recipientSha256: sha(
          createPublicKey(pair.publicKey).export({
            type: 'spki',
            format: 'der',
          }),
        ),
      }),
    );
  } else if (
    mode === '--export' &&
    first &&
    second &&
    third &&
    process.argv.length === 6
  ) {
    console.log(JSON.stringify(exportState(first, second, third)));
  } else if (
    mode === '--import' &&
    first &&
    second &&
    third &&
    process.argv.length === 6
  ) {
    const keyInfo = fs.lstatSync(second);
    if (
      process.platform !== 'linux' ||
      keyInfo.uid !== process.getuid() ||
      (keyInfo.mode & 0o7777) !== 0o600
    )
      throw Error('Private Linux recipient key required');
    const envelope = JSON.parse(boundedFile(first, limit * 2));
    console.log(
      JSON.stringify(
        importTransfer(
          decryptTransfer(envelope, boundedFile(second, 16384)),
          resolve(third),
        ),
      ),
    );
  } else throw Error('Explicit migration mode required');
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch {
    console.error(
      'Operator migration refused; original files and serving production are preserved.',
    );
    process.exitCode = 1;
  }
}
