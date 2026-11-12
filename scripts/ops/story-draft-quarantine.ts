import { execFileSync } from 'node:child_process';
import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { connectDatabase } from '@future-flow/database';
import {
  parkStoryDrafts,
  parseStoryDraftArchive,
  planStoryDraftQuarantine,
  restoreStoryDrafts,
} from '../lib/story-draft-quarantine';

function privateFile(path: string) {
  const info = lstatSync(path);
  if (
    !info.isFile() ||
    info.nlink !== 1 ||
    (info.mode & 0o077) !== 0 ||
    info.uid !== process.getuid?.()
  )
    throw new Error('Expected an owner-only regular file');
}

function durableCreate(path: string, bytes: Buffer | string) {
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  const directory = openSync(dirname(path), 'r');
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
}

function digest(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function main() {
  const [mode, archivePath, key, ...extra] = process.argv.slice(2);
  if (
    extra.length ||
    !(
      (mode === 'plan' && !archivePath && !key) ||
      ((mode === 'park' || mode === 'restore') && archivePath && key)
    )
  )
    throw new Error(
      'Expected plan, park ARCHIVE RECIPIENT or restore ARCHIVE IDENTITY',
    );
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  if (
    !process.env.DATABASE_SSL_CA_FILE ||
    !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
    databaseUrl.search ||
    databaseUrl.hash
  )
    throw new Error('Expected database URL and pinned TLS CA');
  const db = connectDatabase(databaseUrl.href, true, { defaultPoolMax: 1 });
  try {
    if (mode === 'plan')
      return await db.transaction(async (tx) => {
        await tx.query('SET TRANSACTION READ ONLY');
        return planStoryDraftQuarantine(tx);
      });
    const path = resolve(archivePath!);
    const directory = dirname(path);
    const directoryInfo = lstatSync(directory);
    if (
      realpathSync(directory) !== directory ||
      !directoryInfo.isDirectory() ||
      directoryInfo.uid !== process.getuid?.() ||
      (directoryInfo.mode & 0o077) !== 0 ||
      !path.endsWith('.age')
    )
      throw new Error(
        'Expected a private archive directory and an .age filename',
      );
    const receipt = path + '.committed';
    // Bind restoration to the same database endpoint without persisting credentials.
    const databaseBinding = digest(
      Buffer.from(
        JSON.stringify([
          databaseUrl.username,
          databaseUrl.hostname,
          databaseUrl.port || '5432',
          databaseUrl.pathname,
        ]),
      ),
    );
    const receiptBytes = (archiveDigest: string) =>
      JSON.stringify({ version: 1, archiveDigest, databaseBinding }) + '\n';
    if (mode === 'park') {
      if (!/^age1[0-9a-z]{58}$/.test(key!))
        throw new Error('Invalid age recipient');
      let archiveDigest: string | undefined;
      const result = await parkStoryDrafts(db, async (archive) => {
        const ciphertext = execFileSync('age', ['-r', key!], {
          input: JSON.stringify(archive),
          maxBuffer: 16 * 1024 * 1024,
          timeout: 15000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        durableCreate(path, ciphertext);
        archiveDigest = digest(ciphertext);
      });
      if (archiveDigest) durableCreate(receipt, receiptBytes(archiveDigest));
      return result;
    }
    privateFile(path);
    privateFile(receipt);
    privateFile(resolve(key!));
    const ciphertext = readFileSync(path);
    if (readFileSync(receipt, 'utf8') !== receiptBytes(digest(ciphertext)))
      throw new Error('Archive does not match committed receipt');
    const plaintext = execFileSync('age', ['-d', '-i', resolve(key!)], {
      input: ciphertext,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    try {
      return await restoreStoryDrafts(
        db,
        parseStoryDraftArchive(JSON.parse(plaintext.toString('utf8'))),
      );
    } finally {
      plaintext.fill(0);
    }
  } finally {
    await db.close();
  }
}

void main()
  .then((result) => console.log(JSON.stringify(result)))
  .catch(() => {
    console.error(
      'Story draft quarantine refused. Check private configuration and archive state before retrying.',
    );
    process.exitCode = 1;
  });
