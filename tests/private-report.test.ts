import {
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  privateReportDirectory,
  privateReportFile,
} from '../scripts/lib/private-report.js';

const fixtures: ReturnType<typeof fixture>[] = [];

function fixture() {
  const suffix = [...randomBytes(12)]
    .map((value) => String.fromCharCode(97 + (value % 26)))
    .join('');
  const directory = privateReportDirectory(`report-test-${suffix}`);
  const targetDirectory = mkdtempSync(resolve('.local/report-target-'));
  const result = {
    directory,
    targetDirectory,
    file: resolve(directory, 'report.json'),
    target: resolve(targetDirectory, 'target.json'),
  };
  fixtures.push(result);
  return result;
}

afterEach(() => {
  for (const entry of fixtures.splice(0)) {
    for (const file of [entry.file, entry.target]) {
      try {
        lstatSync(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      unlinkSync(file);
    }
    rmdirSync(entry.directory);
    rmdirSync(entry.targetDirectory);
  }
});

function symbolicLink(target: string, file: string) {
  try {
    symlinkSync(target, file, 'file');
    return true;
  } catch (error) {
    if (
      process.platform === 'win32' &&
      ['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')
    )
      return false;
    throw error;
  }
}

describe('private report files', () => {
  it('creates and replaces an ordinary report in the protected directory', () => {
    const entry = fixture();
    privateReportFile(entry.directory, 'report.json', { count: 1 });
    expect(JSON.parse(readFileSync(entry.file, 'utf8'))).toEqual({ count: 1 });
    privateReportFile(entry.directory, 'report.json', { count: 2 });
    expect(readFileSync(entry.file, 'utf8')).toBe('{\n  "count": 2\n}\n');
  });

  it('rejects an existing symbolic link without changing its target', (context) => {
    const entry = fixture();
    writeFileSync(entry.target, 'unchanged');
    if (!symbolicLink(entry.target, entry.file))
      context.skip('Windows does not permit creating file symbolic links');
    expect(() =>
      privateReportFile(entry.directory, 'report.json', { count: 1 }),
    ).toThrow('Private report cannot replace a linked file');
    expect(readFileSync(entry.target, 'utf8')).toBe('unchanged');
  });

  it('rejects a dangling symbolic link without creating its outside target', (context) => {
    const entry = fixture();
    if (!symbolicLink(entry.target, entry.file))
      context.skip('Windows does not permit creating file symbolic links');
    expect(existsSync(entry.file)).toBe(false);
    expect(lstatSync(entry.file).isSymbolicLink()).toBe(true);
    expect(() =>
      privateReportFile(entry.directory, 'report.json', { count: 1 }),
    ).toThrow('Private report cannot replace a linked file');
    expect(existsSync(entry.target)).toBe(false);
  });

  it('rejects a hard link without changing its target', () => {
    const entry = fixture();
    writeFileSync(entry.target, 'unchanged');
    linkSync(entry.target, entry.file);
    expect(() =>
      privateReportFile(entry.directory, 'report.json', { count: 1 }),
    ).toThrow('Private report cannot replace a linked file');
    expect(readFileSync(entry.target, 'utf8')).toBe('unchanged');
  });

  it('rejects a path in the report name before writing', () => {
    const entry = fixture();
    expect(() =>
      privateReportFile(entry.directory, '../target.json', { count: 1 }),
    ).toThrow('Invalid report file');
    expect(existsSync(entry.file)).toBe(false);
    expect(existsSync(entry.target)).toBe(false);
  });
});
