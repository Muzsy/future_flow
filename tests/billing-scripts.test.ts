import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Operator scripts (for example `pnpm privacy:recover`) run under plain tsx,
// which does not enable parameter decorators. They must therefore import only
// decorator-free modules. This broke once when the runtime lived next to the
// HTTP controller; guard the import graph the scripts use.
describe('operator script imports', () => {
  it('loads the billing runtime and the account-deletion guard without decorator support', () => {
    const output = execFileSync(
      'pnpm',
      [
        'exec',
        'tsx',
        '-e',
        "(async () => { const b = await import('./apps/api/src/billing-runtime.ts'); const a = await import('./apps/api/src/account-deletion.ts'); const t = (m, k) => typeof (m[k] ?? (m.default && m.default[k])); console.log(t(b, 'createBillingRuntime'), t(b, 'accountDeletionBilling'), t(a, 'recoverAccountDeletion')); })()",
      ],
      { encoding: 'utf8', timeout: 90_000 },
    );
    expect(output.trim().split('\n').at(-1)).toBe('function function function');
  });
});
