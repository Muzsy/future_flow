import { afterEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({ configs: [] as Record<string, unknown>[] }));
vi.mock('../packages/database/node_modules/pg', async () => {
  const { EventEmitter } = await import('node:events');
  class Pool extends EventEmitter {
    constructor(config: Record<string, unknown>) {
      super();
      mocked.configs.push(config);
    }
    async end() {}
  }
  return { Pool };
});

import {
  connectDatabase,
  databasePoolConfigFromEnv,
} from '../packages/database/src';

afterEach(() => {
  mocked.configs.length = 0;
  vi.unstubAllEnvs();
});

describe('database pool configuration', () => {
  it('keeps five connections and a ten second timeout by default', () => {
    expect(databasePoolConfigFromEnv({})).toEqual({
      max: 5,
      connectionTimeoutMillis: 10000,
    });
    connectDatabase('postgres://user:secret@db.example:5432/app', false);
    expect(mocked.configs[0]).toMatchObject({
      max: 5,
      connectionTimeoutMillis: 10000,
    });
  });

  it('uses the caller default and lets the environment override it', () => {
    connectDatabase('postgres://user:secret@db.example:5432/app', false, {
      defaultPoolMax: 10,
    });
    expect(mocked.configs[0]).toMatchObject({ max: 10 });
    vi.stubEnv('DATABASE_POOL_MAX', '7');
    vi.stubEnv('DATABASE_CONNECTION_TIMEOUT_MS', '20000');
    connectDatabase('postgres://user:secret@db.example:5432/app', false, {
      defaultPoolMax: 10,
    });
    expect(mocked.configs[1]).toMatchObject({
      max: 7,
      connectionTimeoutMillis: 20000,
    });
  });

  it.each([
    ['DATABASE_POOL_MAX', '0'],
    ['DATABASE_POOL_MAX', '31'],
    ['DATABASE_POOL_MAX', '5.5'],
    ['DATABASE_POOL_MAX', 'ten'],
    ['DATABASE_POOL_MAX', '-5'],
    ['DATABASE_CONNECTION_TIMEOUT_MS', '999'],
    ['DATABASE_CONNECTION_TIMEOUT_MS', '60001'],
    ['DATABASE_CONNECTION_TIMEOUT_MS', '1e4'],
  ])('refuses %s=%s at startup', (name, value) => {
    expect(() => databasePoolConfigFromEnv({ [name]: value })).toThrow(name);
    vi.stubEnv(name, value);
    expect(() =>
      connectDatabase('postgres://user:secret@db.example:5432/app', false),
    ).toThrow(name);
    expect(mocked.configs).toHaveLength(0);
  });
});
