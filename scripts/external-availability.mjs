import { inspectExternalAvailability } from './lib/external-monitor.mjs';
if (process.argv[2] !== '--check')
  throw Error('Explicit availability check required');
const proof = await inspectExternalAvailability();
console.log(JSON.stringify({ capturedAt: new Date().toISOString(), ...proof }));
if (!proof.passed) process.exitCode = 1;
