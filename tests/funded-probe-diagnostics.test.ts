import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { privateProbeFailure } from '../scripts/lib/funded-probe-diagnostics';

describe('private funded-probe failure evidence', () => {
  it('retains the original cause location and approved SQLSTATE without private data', () => {
    const secret = 'postgres://person@example.invalid:secret-token@private/db';
    const cause = Object.assign(new Error(secret), { code: '40001' });
    cause.stack = `Error: ${secret}\n    at query (${secret}:9:9)\n    at run (/app/scripts/lib/beta-successor.ts:350:11)\n    at query (/app/scripts/ops/funded-runtime-probe.ts:65:8)`;
    const result = privateProbeFailure(
      new Error('Public wrapper', { cause }),
      'successor-apply',
    );
    expect(result).toMatchObject({
      phase: 'successor-apply',
      errorType: 'Error',
      sqlState: '40001',
      frames: [
        { source: 'scripts/lib/beta-successor.ts', line: 350, column: 11 },
        { source: 'scripts/ops/funded-runtime-probe.ts', line: 65, column: 8 },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/person|secret|private\/db/);
  });

  it('rejects arbitrary phase, error type, code and source names', () => {
    const result = privateProbeFailure(
      {
        name: 'private-name',
        code: 'SECRT',
        message: 'private-message',
        stack:
          'Error: /app/scripts/lib/beta-successor.ts:1:1\n    at run (/app/scripts/lib/private-person.ts:2:2)',
      },
      'private-phase',
    );
    expect(result).toMatchObject({
      phase: 'unknown',
      errorType: 'UnknownError',
      sqlState: null,
      frames: [],
    });
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('bounds stack evidence and survives hostile accessors or cyclic causes', () => {
    const error = new Error('Never copy me');
    error.stack =
      'Error\n' +
      Array.from(
        { length: 100 },
        (_, i) => `    at run (/app/scripts/lib/funded-runtime.ts:${i + 1}:1)`,
      ).join('\n');
    Object.assign(error, { cause: error });
    expect(privateProbeFailure(error, 'capture').frames).toHaveLength(6);
    const hostile = Object.defineProperty({}, 'cause', {
      get() {
        throw Error('private getter');
      },
    });
    expect(() => privateProbeFailure(hostile, 'connect')).not.toThrow();
    expect(privateProbeFailure(hostile, 'connect')).toMatchObject({
      phase: 'connect',
      errorType: 'UnknownError',
    });
  });

  it('keeps an actual rejected transport nonzero and stdout empty, without opening a DB', () => {
    const child = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/ops/funded-runtime-probe.ts'],
      {
        input: JSON.stringify({
          mode: 'person@example.invalid-secret',
          participants: [],
          expected: null,
        }),
        encoding: 'utf8',
        env: { PATH: process.env.PATH, NODE_ENV: 'test' },
        timeout: 15000,
      },
    );
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stdout).toBe('');
    expect(child.stderr).toContain('Funded database probe refused');
    expect(child.stderr).not.toMatch(/person@example|invalid-secret/);
    const line = child.stderr
      .split('\n')
      .find((v) => v.startsWith('ALTERWARD_PROBE_FAILURE '));
    expect(line).toBeDefined();
    expect(
      JSON.parse(line!.slice('ALTERWARD_PROBE_FAILURE '.length)),
    ).toMatchObject({
      version: 'alterward-funded-probe-failure-1',
      phase: 'input',
      errorType: 'Error',
    });
  });
});
