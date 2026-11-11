import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const compose = readFileSync('deploy/compose.yaml', 'utf8');
const example = readFileSync('deploy/server.env.example', 'utf8');
const service = (name: string) => {
  const start = compose.indexOf(`\n  ${name}:\n`);
  const end = compose.slice(start + 1).search(/\n  [a-z]+:\n/);
  return compose.slice(start, end < 0 ? undefined : start + 1 + end);
};

describe('narrative runtime configuration', () => {
  it('forwards a default-off narrative cohort to the API and worker only', () => {
    expect(compose).toContain(
      'NARRATIVE_PIPELINE_MODE: ${NARRATIVE_PIPELINE_MODE:-legacy}',
    );
    expect(compose).toContain(
      'NARRATIVE_COHORT_USER_IDS: ${NARRATIVE_COHORT_USER_IDS:-}',
    );
    expect(service('api')).toContain('*narrative');
    expect(service('worker')).toContain('*narrative');
    expect(service('web')).not.toContain('NARRATIVE');
  });

  it('keeps worker fiction deadline and envelope at the existing runtime defaults', () => {
    const worker = service('worker');
    expect(worker).toContain(
      'AI_FICTION_TIMEOUT_MS: ${AI_FICTION_TIMEOUT_MS:-180000}',
    );
    expect(worker).toContain(
      'AI_FICTION_MAX_REQUEST_BYTES: ${AI_FICTION_MAX_REQUEST_BYTES:-100000}',
    );
    expect(service('api')).not.toContain('AI_FICTION_');
    for (const line of [
      'NARRATIVE_PIPELINE_MODE=legacy',
      'NARRATIVE_COHORT_USER_IDS=',
      'AI_FICTION_TIMEOUT_MS=180000',
      'AI_FICTION_MAX_REQUEST_BYTES=100000',
    ])
      expect(example).toContain(`\n${line}\n`);
  });
});
