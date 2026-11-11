import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  existsSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';

test('operator Python ignores planted workspace and PYTHONPATH modules and records runtime', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'alterward-local-runtime-'));
  const sourceRoot = process.cwd();
  const python = realpathSync(
    process.env.ALTERWARD_PYTHON ??
      execFileSync(
        process.platform === 'win32' ? 'python' : 'python3',
        ['-I', '-c', 'import sys; print(sys.executable)'],
        { encoding: 'utf8' },
      ).trim(),
  );
  try {
    for (const dir of [
      'scripts/ops',
      'scripts/lib',
      '.local',
      '.local/supabase-recovery',
    ]) {
      mkdirSync(join(workspace, dir), { recursive: true, mode: 0o700 });
    }
    for (const file of [
      'scripts/ops/contabo-managed-expiry.py',
      'scripts/ops/local-managed-recovery.py',
      'scripts/lib/local-managed-recovery.ts',
      'scripts/lib/private-report.ts',
      'pnpm-lock.yaml',
    ]) {
      copyFileSync(resolve(sourceRoot, file), join(workspace, file));
    }
    writeFileSync(
      join(workspace, 'json.py'),
      'from pathlib import Path\nPath("SHADOW_RAN").write_text("unexpected")\nraise RuntimeError("planted module")\n',
    );
    execFileSync('git', ['init', '-q'], { cwd: workspace });
    execFileSync('git', ['-c', 'core.autocrlf=false', 'add', '.'], {
      cwd: workspace,
    });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Synthetic fixture',
        '-c',
        'user.email=fixture@localhost',
        'commit',
        '-qm',
        'Synthetic source binding',
      ],
      { cwd: workspace },
    );
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: workspace,
      encoding: 'utf8',
    }).trim();
    const helper = pathToFileURL(
      resolve(sourceRoot, 'scripts/lib/local-managed-recovery.ts'),
    ).href;
    const loader = pathToFileURL(
      createRequire(import.meta.url).resolve('tsx'),
    ).href;
    const code = `import {localManagedRecovery} from ${JSON.stringify(helper)};
      const {result,runtimeSha256,pythonIsolated}=await localManagedRecovery({action:'check',projectBinding:'a'.repeat(64),serverObservedAt:new Date().toISOString()},${JSON.stringify(commit)});
      console.log(JSON.stringify({known:result.knownArchives,runtimeSha256,pythonIsolated}));`;
    const output = execFileSync(
      process.execPath,
      ['--import', loader, '--input-type=module', '-e', code],
      {
        cwd: workspace,
        encoding: 'utf8',
        timeout: 15000,
        env: {
          ...process.env,
          ALTERWARD_PYTHON: python,
          PYTHONPATH: workspace,
        },
      },
    );
    expect(JSON.parse(output)).toEqual({
      known: 0,
      pythonIsolated: true,
      runtimeSha256: createHash('sha256')
        .update(readFileSync(python))
        .digest('hex'),
    });
    expect(existsSync(join(workspace, 'SHADOW_RAN'))).toBe(false);
  } finally {
    // Fixed freshly-created disposable fixture only; no project/secret files.
    if (!workspace.startsWith(join(tmpdir(), 'alterward-local-runtime-')))
      throw Error('Bounded fixture required');
    rmSync(workspace, { recursive: true, force: true });
  }
});
