import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = {
  ...process.env,
  PUBLIC_HOST: 'beta.example.com',
  ALTERWARD_TAG: 'preflight',
  ALTERWARD_PROXY_NETWORK: 'alterward_proxy',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_preflight_unused',
  SUPABASE_SERVICE_ROLE_KEY: 'preflight_admin_unused',
  OPENAI_API_KEY: 'preflight_openai_unused',
  DATABASE_URL: 'postgresql://preflight:unused@example.invalid:5432/postgres',
  DATABASE_SSL_CA_HOST_FILE: '/etc/alterward/supabase-ca.crt',
  AI_PROJECT_BUDGET_USD: '0',
  AI_USER_BUDGET_USD: '0',
};

try {
  const config = JSON.parse(
    execFileSync(
      'docker',
      [
        'compose',
        '-f',
        resolve(root, 'deploy/compose.contabo.yaml'),
        'config',
        '--format',
        'json',
      ],
      { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  );
  assert.deepEqual(Object.keys(config.services).sort(), [
    'api',
    'web',
    'worker',
  ]);
  let totalMemory = 0;
  for (const service of Object.values(config.services)) {
    assert.equal(service.ports?.length ?? 0, 0, 'Application port is public');
    assert.equal(service.privileged ?? false, false);
    assert.notEqual(service.network_mode, 'host');
    assert(service.cap_drop.includes('ALL'));
    assert(service.security_opt.includes('no-new-privileges:true'));
    assert(service.init);
    assert(service.pids_limit > 0 && service.pids_limit <= 256);
    assert(service.cpus > 0 && service.cpus <= 1);
    const memoryLimit = Number(service.mem_limit);
    assert(Number.isFinite(memoryLimit) && memoryLimit > 0);
    totalMemory += memoryLimit;
    assert.equal(service.logging.options['max-size'], '10m');
    assert.equal(service.logging.options['max-file'], '3');
  }
  assert(
    totalMemory <= 3 * 1024 ** 3,
    'Initial runtime memory allowance exceeded',
  );
  assert.equal(config.networks.proxy.external, true);
  assert.equal(config.networks.proxy.name, 'alterward_proxy');
  assert.deepEqual(Object.keys(config.services.worker.networks), ['worker']);
  assert.deepEqual(Object.keys(config.services.api.networks), ['proxy']);
  assert.deepEqual(Object.keys(config.services.web.networks), ['proxy']);
  assert(config.services.web.networks.proxy.aliases.includes('alterward-web'));
  assert(config.services.api.networks.proxy.aliases.includes('alterward-api'));
  for (const secret of [
    'OPENAI_API_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
  ]) {
    assert.equal(config.services.web.environment[secret], undefined);
    assert.equal(config.services.web.build.args[secret], undefined);
  }
  assert.equal(config.services.api.environment.OPENAI_API_KEY, undefined);
  assert.equal(
    config.services.worker.environment.SUPABASE_SERVICE_ROLE_KEY,
    undefined,
  );
  assert.equal(config.services.api.environment.API_TRUST_PROXY, '1');
  for (const name of ['api', 'worker']) {
    assert.equal(config.services[name].environment.DATABASE_SSL, 'true');
    assert(
      config.services[name].volumes.some(
        (volume) =>
          volume.target === '/run/secrets/supabase-ca.crt' && volume.read_only,
      ),
    );
  }
  assert.equal(config.services.worker.environment.AI_PROJECT_BUDGET_USD, '0');
  assert.equal(config.services.worker.environment.AI_USER_BUDGET_USD, '0');
  assert.deepEqual(config.services.worker.command, [
    'node',
    'apps/worker/dist/main.js',
  ]);
  console.log(
    JSON.stringify({
      deploymentPreflight: 'passed',
      services: 3,
      publishedApplicationPorts: 0,
      totalMemoryLimitMiB: totalMemory / 1024 ** 2,
      actualCredentialsUsed: false,
      containersStarted: false,
    }),
  );
} catch (error) {
  console.error(
    'Deployment preflight failed; configuration details are withheld.',
  );
  const location = error.stack?.match(/verify-deployment\.mjs:(\d+):(\d+)/);
  if (location) console.error(`Check location: ${location[1]}:${location[2]}`);
  process.exitCode = 1;
}
