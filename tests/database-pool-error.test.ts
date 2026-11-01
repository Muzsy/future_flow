import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  pools: [] as import('node:events').EventEmitter[],
  clients: [] as (import('node:events').EventEmitter & {
    query: ReturnType<typeof import('vitest').vi.fn>;
    release: ReturnType<typeof import('vitest').vi.fn>;
  })[],
}));
const { pools, clients } = mocked;

vi.mock('../packages/database/node_modules/pg', async () => {
  const { EventEmitter } = await import('node:events');
  const { vi } = await import('vitest');
  class Pool extends EventEmitter {
    constructor() {
      super();
      mocked.pools.push(this);
    }
    async connect() {
      const client = Object.assign(new EventEmitter(), {
        query: vi.fn(async () => ({ rows: [] })),
        release: vi.fn(),
      });
      mocked.clients.push(client);
      return client;
    }
    async end() {}
  }
  return { Pool };
});

import { connectDatabase } from '../packages/database/src';

afterEach(() => {
  pools.length = 0;
  clients.length = 0;
  vi.restoreAllMocks();
});

describe('database connection errors', () => {
  it('logs an idle pool error instead of crashing the process', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    connectDatabase('postgres://user:secret@db.example:5432/app', false);
    const error = Object.assign(new Error('read ETIMEDOUT secret-host'), {
      code: 'ETIMEDOUT',
    });
    // An EventEmitter without an 'error' listener throws on emit.
    expect(() => pools[0].emit('error', error)).not.toThrow();
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][0]);
    expect(line).toContain('ETIMEDOUT');
    expect(line).not.toContain('secret');
  });

  it('survives a client error during a transaction and cleans up', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const database = connectDatabase('postgres://db.example/app', false);
    await database.transaction(async () => {
      expect(() =>
        clients[0].emit('error', new Error('read ETIMEDOUT')),
      ).not.toThrow();
    });
    expect(clients[0].listenerCount('error')).toBe(0);
    expect(clients[0].release).toHaveBeenCalledTimes(1);
  });
});
