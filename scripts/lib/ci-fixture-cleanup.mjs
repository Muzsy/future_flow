import { rmSync } from 'node:fs';

// The caller has already checked the disposable CI directory's real path.
// A killed root fixture can leave a 0700 child. Do not escalate permissions or
// replace the primary timeout with a secondary, unhandled cleanup exception.
export function cleanupCiFixture(
  directory,
  { remove = rmSync, report = console.error } = {},
) {
  try {
    remove(directory, { recursive: true, force: true });
    return true;
  } catch (error) {
    const code =
      typeof error?.code === 'string' && /^[A-Z_]{1,32}$/.test(error.code)
        ? error.code
        : 'UNKNOWN';
    report(JSON.stringify({ ciFixtureCleanup: 'failed', code }));
    return false;
  }
}
