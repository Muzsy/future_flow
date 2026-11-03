import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DatabaseAiBudget,
  Repository,
  SERVICE_USD_ALERT_THRESHOLDS,
  applicationAiBudgetConfigFromEnv,
  serviceUsdBudgetStatus,
  type ApplicationAiBudgetConfig,
  type Database,
  type ServiceUsdAlert,
} from '@future-flow/database';
import {
  logServiceUsdAlert,
  withServiceUsdAlerts,
} from '../apps/worker/src/service-budget';
import { applyMigrations } from '../scripts/lib/migrations';

// The service profile's USD protection: project, per-user and period limits plus
// alert lines, independent of the closed-beta list, its 10/3.34 USD caps and its
// 30-day period. Zero limits spend nothing.
let engine: PGlite, db: Database, repo: Repository;
function adapter(
  client: Pick<PGlite, 'query' | 'transaction'>,
  nested = false,
): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await client.query<T>(sql, values)).rows,
    transaction: (run) =>
      nested
        ? run(adapter(client, true))
        : client.transaction((tx) =>
            run(adapter(tx as unknown as PGlite, true)),
          ),
  };
}
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await applyMigrations(engine);
  db = adapter(engine);
  repo = new Repository(db);
});
afterAll(async () => {
  await engine?.close();
});
async function user() {
  const id = randomUUID();
  await repo.ensureUser(id);
  return id;
}
let sequence = 0;
async function window(days = 7) {
  const [clock] = await db.query<{ budget_now: Date }>(
    'SELECT clock_timestamp() AS budget_now',
  );
  const now = new Date(clock!.budget_now).getTime();
  return {
    startsAt: new Date(now - 3600000 - ++sequence * 1000).toISOString(),
    endsAt: new Date(now + days * 86400000).toISOString(),
  };
}
const SERVICE = { SERVICE_ACCESS_ENFORCEMENT: 'true' };
const request = { model: 'gpt-6.1-sol', max_output_tokens: 500, input: [] };
const reserved = Math.ceil(
  (Buffer.byteLength(JSON.stringify(request)) + 4096) * 2.5 + 5000,
);
const usd = (micro: number) => micro / 1e6;
async function ledger() {
  return {
    accounts: await db.query('SELECT * FROM aw_budget_accounts ORDER BY id'),
    reservations: await db.query(
      'SELECT * FROM aw_budget_reservations ORDER BY id',
    ),
  };
}
function collect(config: ApplicationAiBudgetConfig) {
  const alerts: ServiceUsdAlert[] = [];
  return {
    alerts,
    config: { ...config, onAlert: (a: ServiceUsdAlert) => alerts.push(a) },
  };
}

describe('service-profile budget configuration', () => {
  it('is spend-incapable by default and marked as the service profile', () => {
    expect(applicationAiBudgetConfigFromEnv(SERVICE)).toEqual({
      projectUsd: 0,
      userUsd: 0,
      initialProjectSpentUsd: 0,
      serviceProfile: true,
    });
    expect(() =>
      applicationAiBudgetConfigFromEnv({ SERVICE_ACCESS_ENFORCEMENT: 'yes' }),
    ).toThrow();
  });
  it('requires an explicit fixed period as soon as any limit is positive', () => {
    for (const limits of [
      { AI_PROJECT_BUDGET_USD: '40', AI_USER_BUDGET_USD: '6' },
      { AI_PROJECT_BUDGET_USD: '40' },
      { AI_USER_BUDGET_USD: '6' },
    ])
      expect(() =>
        applicationAiBudgetConfigFromEnv({ ...SERVICE, ...limits }),
      ).toThrowError(expect.objectContaining({ code: 'AI_BUDGET_CONFIG' }));
    // The window flag stays irrelevant: the service profile always requires it.
    expect(() =>
      applicationAiBudgetConfigFromEnv({
        ...SERVICE,
        AI_BUDGET_WINDOW_REQUIRED: 'false',
        AI_PROJECT_BUDGET_USD: '40',
        AI_USER_BUDGET_USD: '6',
      }),
    ).toThrowError(expect.objectContaining({ code: 'AI_BUDGET_CONFIG' }));
    expect(() =>
      applicationAiBudgetConfigFromEnv({
        ...SERVICE,
        AI_PROJECT_BUDGET_USD: '40',
        AI_USER_BUDGET_USD: '6',
        AI_BUDGET_WINDOW_START: '2026-12-01T00:00:00Z',
      }),
    ).toThrowError(expect.objectContaining({ code: 'AI_BUDGET_CONFIG' }));
  });
  it('accepts any bounded period and amount and ignores the closed-beta list, caps and 30-day rule', () => {
    const config = applicationAiBudgetConfigFromEnv({
      ...SERVICE,
      // A leftover closed-beta list only feeds the chapter exemption.
      CLOSED_BETA_ENABLED: 'true',
      CLOSED_BETA_USER_IDS: randomUUID(),
      AI_PROJECT_BUDGET_USD: '40',
      AI_USER_BUDGET_USD: '6',
      AI_BUDGET_WINDOW_START: '2026-12-01T00:00:00Z',
      AI_BUDGET_WINDOW_END: '2027-01-15T00:00:00Z',
    });
    expect(config).toMatchObject({
      serviceProfile: true,
      projectUsd: 40,
      userUsd: 6,
      window: {
        startsAt: '2026-12-01T00:00:00.000Z',
        endsAt: '2027-01-15T00:00:00.000Z',
      },
    });
    expect(config.closedBetaUserIds).toBeUndefined();
    // The same values stay refused by the legacy closed-beta profile.
    expect(() =>
      applicationAiBudgetConfigFromEnv({
        CLOSED_BETA_ENABLED: 'true',
        CLOSED_BETA_USER_IDS: randomUUID(),
        AI_PROJECT_BUDGET_USD: '40',
        AI_USER_BUDGET_USD: '6',
        AI_BUDGET_WINDOW_START: '2026-12-01T00:00:00Z',
        AI_BUDGET_WINDOW_END: '2027-01-15T00:00:00Z',
      }),
    ).toThrowError(expect.objectContaining({ code: 'AI_BUDGET_CONFIG' }));
  });
  it('still rejects invalid amounts, dates and over-long periods', () => {
    for (const overrides of [
      { AI_PROJECT_BUDGET_USD: '-1' },
      { AI_USER_BUDGET_USD: 'NaN' },
      { AI_BUDGET_WINDOW_END: '2030-01-01T00:00:00Z' },
      { AI_BUDGET_WINDOW_END: '2026-11-30T00:00:00Z' },
    ])
      expect(() =>
        applicationAiBudgetConfigFromEnv({
          ...SERVICE,
          AI_PROJECT_BUDGET_USD: '40',
          AI_USER_BUDGET_USD: '6',
          AI_BUDGET_WINDOW_START: '2026-12-01T00:00:00Z',
          AI_BUDGET_WINDOW_END: '2026-12-31T00:00:00Z',
          ...overrides,
        }),
      ).toThrowError(expect.objectContaining({ code: 'AI_BUDGET_CONFIG' }));
  });
  it('validates the guard configuration itself, not only the environment path', async () => {
    const owner = await user(),
      period = await window();
    const make = (config: ApplicationAiBudgetConfig) =>
      new DatabaseAiBudget(db, owner, randomUUID(), config);
    for (const bad of [
      { projectUsd: 1, userUsd: 1, serviceProfile: true as const },
      {
        projectUsd: 1,
        userUsd: 1,
        window: period,
        serviceProfile: true as const,
        closedBetaUserIds: [owner],
      },
      {
        projectUsd: 1,
        userUsd: 1,
        window: period,
        serviceProfile: true as const,
        alertThresholds: [0],
      },
      {
        projectUsd: 1,
        userUsd: 1,
        window: period,
        serviceProfile: true as const,
        alertThresholds: [1],
      },
      {
        projectUsd: 1,
        userUsd: 1,
        window: period,
        serviceProfile: true as const,
        alertThresholds: [0.8, 0.5],
      },
      {
        projectUsd: 1,
        userUsd: 1,
        window: period,
        serviceProfile: true as const,
        alertThresholds: [0.1, 0.2, 0.3, 0.4, 0.5],
      },
      {
        projectUsd: 1,
        userUsd: 1,
        window: period,
        serviceProfile: true as const,
        alertThresholds: [Number.NaN],
      },
      // Alerts exist only in the service profile.
      { projectUsd: 1, userUsd: 1, window: period, alertThresholds: [0.5] },
      { projectUsd: 1, userUsd: 1, window: period, onAlert: () => {} },
      {
        projectUsd: 1,
        userUsd: 1,
        window: period,
        serviceProfile: false as never,
      },
    ])
      expect(() => make(bad)).toThrowError(
        expect.objectContaining({ code: 'AI_BUDGET_CONFIG' }),
      );
    expect(() =>
      make({ projectUsd: 0, userUsd: 0, serviceProfile: true }),
    ).not.toThrow();
  });
});

describe('service-profile spending', () => {
  it('refuses to spend at zero limits and leaves the ledger untouched', async () => {
    const owner = await user(),
      period = await window(),
      before = await ledger();
    for (const [projectUsd, userUsd] of [
      [0, 0],
      [0, 1],
      [1, 0],
    ])
      await expect(
        new DatabaseAiBudget(db, owner, randomUUID(), {
          projectUsd,
          userUsd,
          window: period,
          serviceProfile: true,
        }).reserve(request),
      ).rejects.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
    expect(await ledger()).toEqual(before);
  });
  it('lets any admitted, unlisted user spend inside a non-30-day period and enforces project and user limits', async () => {
    const period = await window(7),
      a = await user(),
      b = await user(),
      config: ApplicationAiBudgetConfig = {
        projectUsd: usd(reserved * 3 + 1),
        userUsd: usd(reserved * 2 + 1),
        window: period,
        serviceProfile: true,
      };
    const guard = (u: string) =>
      new DatabaseAiBudget(db, u, randomUUID(), config);
    await expect(guard(a).reserve(request)).resolves.toBeTruthy();
    await expect(guard(a).reserve(request)).resolves.toBeTruthy();
    // The user limit stops the third request of the same account ...
    await expect(guard(a).reserve(request)).rejects.toMatchObject({
      code: 'AI_BUDGET_EXCEEDED',
    });
    // ... another account fits one more, then the shared project limit is spent.
    await expect(guard(b).reserve(request)).resolves.toBeTruthy();
    await expect(guard(b).reserve(request)).rejects.toMatchObject({
      code: 'AI_BUDGET_EXCEEDED',
    });
  });
  it('never spends outside its period and never rolls over', async () => {
    const owner = await user(),
      period = await window(),
      config: ApplicationAiBudgetConfig = {
        projectUsd: 1,
        userUsd: 1,
        window: period,
        serviceProfile: true,
      },
      before = await ledger();
    for (const instant of [
      new Date(Date.parse(period.startsAt) - 1).toISOString(),
      period.endsAt,
      new Date(Date.parse(period.endsAt) + 86400000 * 40).toISOString(),
    ]) {
      const clock = (target: Database): Database => ({
        query: async <T extends Record<string, unknown>>(
          sql: string,
          values: unknown[] = [],
        ) =>
          sql === 'SELECT clock_timestamp() AS budget_now'
            ? [{ budget_now: new Date(instant) } as unknown as T]
            : target.query<T>(sql, values),
        transaction: (run) => target.transaction((tx) => run(clock(tx))),
      });
      const clocked = clock(db);
      await expect(
        new DatabaseAiBudget(clocked, owner, randomUUID(), config).reserve(
          request,
        ),
      ).rejects.toMatchObject({ code: 'AI_BUDGET_WINDOW_CLOSED' });
    }
    expect(await ledger()).toEqual(before);
  });
});

describe('service-profile alert lines', () => {
  it('uses the 50 and 80 percent lines by default', () => {
    expect(SERVICE_USD_ALERT_THRESHOLDS).toEqual([0.5, 0.8]);
  });
  it('alerts once per crossed line at the project scope, with no repeat and none on refusal', async () => {
    const owner = await user(),
      limit = reserved * 4,
      { alerts, config } = collect({
        projectUsd: usd(limit),
        userUsd: 50,
        window: await window(),
        serviceProfile: true,
      });
    // The test relies on the exact micro-USD limit; keep it honest.
    expect(Math.floor(config.projectUsd * 1e6)).toBe(limit);
    const guard = () => new DatabaseAiBudget(db, owner, randomUUID(), config);
    await guard().reserve(request); // 25 %
    expect(alerts).toEqual([]);
    await guard().reserve(request); // 50 %: first line
    expect(alerts.map((a) => [a.scope, a.threshold])).toEqual([
      ['project', 0.5],
    ]);
    await guard().reserve(request); // 75 %
    expect(alerts).toHaveLength(1);
    await guard().reserve(request); // 100 %: second line
    expect(alerts.map((a) => [a.scope, a.threshold])).toEqual([
      ['project', 0.5],
      ['project', 0.8],
    ]);
    expect(alerts[1]).toMatchObject({
      limitMicro: limit,
      accountedMicro: limit,
    });
    await expect(guard().reserve(request)).rejects.toMatchObject({
      code: 'AI_BUDGET_EXCEEDED',
    });
    expect(alerts).toHaveLength(2);
  });
  it('alerts at the user scope and lists every line crossed by one reservation', async () => {
    const owner = await user(),
      { alerts, config } = collect({
        projectUsd: 50,
        userUsd: usd(reserved * 2),
        window: await window(),
        serviceProfile: true,
      });
    expect(Math.floor(config.userUsd * 1e6)).toBe(reserved * 2);
    const guard = () => new DatabaseAiBudget(db, owner, randomUUID(), config);
    await guard().reserve(request);
    expect(alerts.map((a) => [a.scope, a.threshold])).toEqual([['user', 0.5]]);
    await guard().reserve(request);
    expect(alerts.map((a) => [a.scope, a.threshold])).toEqual([
      ['user', 0.5],
      ['user', 0.8],
    ]);
  });
  it('raises no alert for a rolled-back reservation and survives a failing sink', async () => {
    const owner = await user(),
      raised: ServiceUsdAlert[] = [],
      config: ApplicationAiBudgetConfig = {
        projectUsd: usd(reserved * 2),
        userUsd: 50,
        window: await window(),
        serviceProfile: true,
        alertThresholds: [0.5],
        onAlert: (a) => {
          raised.push(a);
          throw Error('sink down');
        },
      };
    const guard = new DatabaseAiBudget(db, owner, randomUUID(), config);
    // The sink throws, yet the reservation is committed and returned.
    const id = await guard.reserve(request);
    expect(raised).toHaveLength(1);
    expect(
      (
        await db.query(
          'SELECT status FROM aw_budget_reservations WHERE id=$1',
          [id],
        )
      )[0],
    ).toMatchObject({ status: 'reserved' });
    // A refused reservation is never alerted.
    await guard.reserve(request);
    const before = await ledger();
    await expect(guard.reserve(request)).rejects.toMatchObject({
      code: 'AI_BUDGET_EXCEEDED',
    });
    expect(raised).toHaveLength(1);
    expect(await ledger()).toEqual(before);
  });
  it('alerts on each crossing, so a line crossed again after a settlement alerts again', async () => {
    const owner = await user(),
      { alerts, config } = collect({
        projectUsd: usd(reserved * 4),
        userUsd: 50,
        window: await window(),
        serviceProfile: true,
        alertThresholds: [0.5],
      });
    const guard = () => new DatabaseAiBudget(db, owner, randomUUID(), config);
    await guard().reserve(request);
    const crossing = guard();
    const id = await crossing.reserve(request); // reaches the 50 % line
    expect(alerts).toHaveLength(1);
    await crossing.settle(id, { input_tokens: 0, output_tokens: 0 }); // back below
    await guard().reserve(request); // crosses the same line again
    expect(alerts).toHaveLength(2);
  });
  it('supports custom lines and does not alert the legacy profile', async () => {
    const owner = await user(),
      { alerts, config } = collect({
        projectUsd: usd(reserved * 10),
        userUsd: 50,
        window: await window(),
        serviceProfile: true,
        alertThresholds: [0.1, 0.9],
      });
    await new DatabaseAiBudget(db, owner, randomUUID(), config).reserve(
      request,
    );
    expect(alerts.map((a) => a.threshold)).toEqual([0.1]);
    const legacy = new DatabaseAiBudget(db, owner, randomUUID(), {
      projectUsd: usd(reserved * 2),
      userUsd: 1,
      window: await window(),
    });
    await expect(legacy.reserve(request)).resolves.toBeTruthy();
  });
});

describe('service-profile status for the operator monitor', () => {
  it('reports period usage, crossed lines and per-user counts without changing the ledger', async () => {
    const a = await user(),
      b = await user(),
      period = await window(),
      config: ApplicationAiBudgetConfig = {
        projectUsd: usd(reserved * 4),
        userUsd: usd(reserved * 2),
        window: period,
        serviceProfile: true,
      };
    expect(await serviceUsdBudgetStatus(db, config)).toMatchObject({
      spendCapable: true,
      project: { accountedMicro: 0, crossed: [] },
      users: { accounts: 0 },
    });
    await new DatabaseAiBudget(db, a, randomUUID(), config).reserve(request);
    await new DatabaseAiBudget(db, a, randomUUID(), config).reserve(request);
    await new DatabaseAiBudget(db, b, randomUUID(), config).reserve(request);
    const before = await ledger();
    const status = await serviceUsdBudgetStatus(db, config);
    expect(await ledger()).toEqual(before);
    expect(status.project).toMatchObject({
      limitMicro: reserved * 4,
      accountedMicro: reserved * 3,
      crossed: [0.5],
    });
    expect(status.users.accounts).toBe(2);
    expect(status.users.atOrAbove).toEqual([
      { threshold: 0.5, count: 2 },
      { threshold: 0.8, count: 1 },
    ]);
  });
  it('reports a zero-limit profile as not spend-capable and refuses a non-service config', async () => {
    const period = await window();
    expect(
      await serviceUsdBudgetStatus(db, {
        projectUsd: 0,
        userUsd: 0,
        window: period,
        serviceProfile: true,
      }),
    ).toMatchObject({ spendCapable: false, project: { fraction: 1 } });
    await expect(
      serviceUsdBudgetStatus(db, { projectUsd: 1, userUsd: 1, window: period }),
    ).rejects.toMatchObject({ code: 'AI_BUDGET_CONFIG' });
    await expect(
      serviceUsdBudgetStatus(db, {
        projectUsd: 1,
        userUsd: 1,
        serviceProfile: true,
      }),
    ).rejects.toMatchObject({ code: 'AI_BUDGET_CONFIG' });
  });
});

describe('worker alert sink', () => {
  it('writes one structured line without user identity and only for the service profile', () => {
    const lines: string[] = [],
      period = {
        startsAt: '2026-12-01T00:00:00.000Z',
        endsAt: '2026-12-31T00:00:00.000Z',
      };
    const configured = withServiceUsdAlerts(
      { projectUsd: 1, userUsd: 1, window: period, serviceProfile: true },
      (line) => lines.push(line),
    );
    configured.onAlert!({
      scope: 'user',
      threshold: 0.8,
      limitMicro: 1000000,
      accountedMicro: 850000,
      window: period,
    });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({
      event: 'service_usd_alert',
      scope: 'user',
      threshold: 0.8,
      limitMicroUsd: 1000000,
      accountedMicroUsd: 850000,
      window: period,
    });
    const legacy = { projectUsd: 1, userUsd: 1, window: period };
    expect(withServiceUsdAlerts(legacy)).toBe(legacy);
    expect(() =>
      logServiceUsdAlert(
        {
          scope: 'project',
          threshold: 0.5,
          limitMicro: 2,
          accountedMicro: 1,
          window: period,
        },
        () => {},
      ),
    ).not.toThrow();
  });
});
