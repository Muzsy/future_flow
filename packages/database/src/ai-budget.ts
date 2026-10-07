import { randomUUID } from 'node:crypto';
import { DomainError } from '@future-flow/core';
import type { Database } from './index';
import { lifeRow } from './lives';
import {
  closedBetaConfigFromEnv,
  validateClosedBetaConfig,
  assertClosedBetaAdmission,
} from './closed-beta';

// Standard short-context ceilings, including cache writes. Checked 2026-10-07:
// https://developers.openai.com/api/docs/pricing
export const applicationModelPrices: Record<
  string,
  { inputCeiling: number; output: number }
> = {
  'gpt-6.1-sol': { inputCeiling: 2.5, output: 10 },
  'gpt-6-luna': { inputCeiling: 0.125, output: 0.5 },
  // Standard global, up to 5m cache writes; the Claude transport rejects 1h usage.
  // https://platform.claude.com/docs/en/models/sonnet-5-5/overview
  'claude-sonnet-5-5': { inputCeiling: 2.5, output: 10 },
};
type Usage = { input_tokens: number; output_tokens: number };
export type ApplicationAiBudgetConfig = {
  provider?: 'openai' | 'anthropic';
  projectUsd: number;
  userUsd: number;
  initialProjectSpentUsd?: number;
  // A fixed, explicitly approved period. It never rolls over automatically.
  window?: { startsAt: string; endsAt: string };
  closedBetaUserIds?: string[];
};
function invalidBudgetConfig(): never {
  throw new DomainError(
    'AI_BUDGET_CONFIG',
    'Invalid budget configuration.',
    503,
  );
}
function budgetWindow(window: ApplicationAiBudgetConfig['window']) {
  if (!window) return undefined;
  const timestamps = [window.startsAt, window.endsAt].map((value) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))
      invalidBudgetConfig();
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return invalidBudgetConfig();
    const canonical = date.toISOString();
    if (canonical !== value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z'))
      invalidBudgetConfig();
    return canonical;
  });
  const startsAt = timestamps[0]!,
    endsAt = timestamps[1]!;
  const duration = Date.parse(endsAt) - Date.parse(startsAt);
  if (duration <= 0 || duration > 366 * 24 * 60 * 60 * 1000)
    return invalidBudgetConfig();
  return { startsAt, endsAt };
}
export function applicationAiBudgetConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  provider: 'openai' | 'anthropic' = 'openai',
): ApplicationAiBudgetConfig {
  const required = env.AI_BUDGET_WINDOW_REQUIRED ?? 'false';
  if (!['true', 'false'].includes(required)) return invalidBudgetConfig();
  const startsAt = env.AI_BUDGET_WINDOW_START?.trim() ?? '',
    endsAt = env.AI_BUDGET_WINDOW_END?.trim() ?? '';
  if (Boolean(startsAt) !== Boolean(endsAt)) return invalidBudgetConfig();
  const config: ApplicationAiBudgetConfig = {
    ...(provider === 'anthropic' ? { provider } : {}),
    projectUsd: Number(
      provider === 'anthropic'
        ? (env.CLAUDE_PRODUCTION_BUDGET_USD ?? 0)
        : (env.AI_PROJECT_BUDGET_USD ?? 0),
    ),
    userUsd: Number(env.AI_USER_BUDGET_USD ?? 0),
    initialProjectSpentUsd:
      provider === 'anthropic'
        ? 0
        : Number(env.AI_PROJECT_INITIAL_SPENT_USD ?? 0),
    ...(startsAt ? { window: budgetWindow({ startsAt, endsAt }) } : {}),
  };
  if (
    (required === 'true' || provider === 'anthropic') &&
    config.projectUsd > 0 &&
    config.userUsd > 0 &&
    !config.window
  )
    return invalidBudgetConfig();
  for (const value of [
    config.projectUsd,
    config.userUsd,
    config.initialProjectSpentUsd ?? 0,
  ])
    if (!Number.isFinite(value) || value < 0 || value > 100000)
      return invalidBudgetConfig();
  const beta = closedBetaConfigFromEnv(env);
  if (beta.enabled) {
    config.closedBetaUserIds = beta.userIds;
    if (
      config.projectUsd > (provider === 'anthropic' ? 1 : 2) ||
      config.userUsd > 0.5
    )
      return invalidBudgetConfig();
    if (
      !config.window ||
      Date.parse(config.window.endsAt) - Date.parse(config.window.startsAt) !==
        30 * 86400000
    )
      return invalidBudgetConfig();
  }
  return config;
}
export class DatabaseAiBudget {
  private readonly projectKey: string;
  private readonly userKey: string;
  private readonly config: ApplicationAiBudgetConfig;
  constructor(
    private readonly db: Database,
    private readonly userId: string,
    private readonly jobId: string,
    config: ApplicationAiBudgetConfig,
  ) {
    this.config = { ...config, window: budgetWindow(config.window) };
    if (config.closedBetaUserIds !== undefined) {
      this.config.closedBetaUserIds = validateClosedBetaConfig({
        enabled: true,
        userIds: config.closedBetaUserIds,
      }).userIds;
      if (
        config.projectUsd >
          ((config.provider ?? 'openai') === 'anthropic' ? 1 : 2) ||
        config.userUsd > 0.5 ||
        !this.config.window ||
        Date.parse(this.config.window.endsAt) -
          Date.parse(this.config.window.startsAt) !==
          30 * 86400000
      )
        invalidBudgetConfig();
    }
    if (
      config.provider !== undefined &&
      !['openai', 'anthropic'].includes(config.provider)
    )
      invalidBudgetConfig();
    if (config.provider === 'anthropic' && !this.config.window)
      invalidBudgetConfig();
    const window = this.config.window;
    this.projectKey = window
      ? `project:${config.provider === 'anthropic' ? 'anthropic:' : ''}window:${window.startsAt}:${window.endsAt}`
      : 'project';
    this.userKey = window
      ? `user:${userId}:window:${window.startsAt}:${window.endsAt}`
      : `user:${userId}`;
    for (const value of [
      config.projectUsd,
      config.userUsd,
      config.initialProjectSpentUsd ?? 0,
    ])
      if (!Number.isFinite(value) || value < 0 || value > 100000)
        throw new DomainError(
          'AI_BUDGET_CONFIG',
          'Invalid budget configuration.',
          503,
        );
  }
  async reserve(raw: unknown): Promise<string> {
    if (this.config.closedBetaUserIds !== undefined)
      assertClosedBetaAdmission(
        { enabled: true, userIds: this.config.closedBetaUserIds },
        this.userId,
      );
    // Zero disables spending even when the database retains a previously approved limit.
    if (this.config.projectUsd === 0 || this.config.userUsd === 0)
      throw new DomainError(
        'AI_BUDGET_EXCEEDED',
        'AI generation is disabled.',
        503,
      );
    const p = raw as {
      model: string;
      max_output_tokens: number;
      text?: { format?: { name?: string } };
    };
    const rates = Object.hasOwn(applicationModelPrices, p.model)
      ? applicationModelPrices[p.model]
      : undefined;
    // Byte count is a conservative bound for this JSON text request, including
    // schemas and an additional protocol margin. Long-context pricing is rejected.
    const inputBound = Buffer.byteLength(JSON.stringify(raw), 'utf8') + 4096;
    if (
      !rates ||
      (p.model.startsWith('claude-') ? 'anthropic' : 'openai') !==
        (this.config.provider ?? 'openai') ||
      inputBound > 100000 ||
      !Number.isInteger(p.max_output_tokens) ||
      p.max_output_tokens < 1 ||
      p.max_output_tokens > 12000
    )
      throw new DomainError(
        'AI_BUDGET_CONFIG',
        'Unpriced model or request outside budget bounds.',
        503,
      );
    const reserved = Math.ceil(
      inputBound * rates.inputCeiling + p.max_output_tokens * rates.output,
    );
    return this.db.transaction(async (tx) => {
      const user = lifeRow(
        await tx.query('SELECT status FROM ff_users WHERE id=$1 FOR UPDATE', [
          this.userId,
        ]),
      );
      if (user.status !== 'active')
        throw new DomainError(
          'ACCOUNT_DELETING',
          'Account is being deleted.',
          403,
        );
      await tx.query(
        'INSERT INTO aw_budget_accounts(id,limit_micro,accounted_micro) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [
          this.projectKey,
          Math.floor(this.config.projectUsd * 1e6),
          Math.ceil((this.config.initialProjectSpentUsd ?? 0) * 1e6),
        ],
      );
      await tx.query(
        'INSERT INTO aw_budget_accounts(id,user_id,limit_micro,accounted_micro) VALUES($1,$2,$3,0) ON CONFLICT DO NOTHING',
        [this.userKey, this.userId, Math.floor(this.config.userUsd * 1e6)],
      );
      const project = lifeRow(
        await tx.query(
          'SELECT limit_micro,accounted_micro FROM aw_budget_accounts WHERE id=$1 FOR UPDATE',
          [this.projectKey],
        ),
      );
      const personal = lifeRow(
        await tx.query(
          'SELECT limit_micro,accounted_micro FROM aw_budget_accounts WHERE id=$1 FOR UPDATE',
          [this.userKey],
        ),
      );
      // Use the database wall clock after the account locks: a request that waited
      // for another worker cannot spend after the approved period has expired.
      if (this.config.window) {
        const [clock] = await tx.query<{ budget_now: Date }>(
          'SELECT clock_timestamp() AS budget_now',
        );
        const now = new Date(clock!.budget_now).getTime();
        if (
          !Number.isFinite(now) ||
          now < Date.parse(this.config.window.startsAt) ||
          now >= Date.parse(this.config.window.endsAt)
        )
          throw new DomainError(
            'AI_BUDGET_WINDOW_CLOSED',
            'The approved AI spending period is not active.',
            503,
          );
      }
      for (const [account, configured] of [
        [project, this.config.projectUsd],
        [personal, this.config.userUsd],
      ] as const)
        if (
          Number(account.accounted_micro) + reserved >
          Math.min(Number(account.limit_micro), Math.floor(configured * 1e6))
        )
          throw new DomainError(
            'AI_BUDGET_EXCEEDED',
            'AI budget exhausted.',
            503,
          );
      await tx.query(
        'UPDATE aw_budget_accounts SET accounted_micro=accounted_micro+$2 WHERE id IN ($1,$3)',
        [this.projectKey, reserved, this.userKey],
      );
      const id = randomUUID();
      await tx.query(
        "INSERT INTO aw_budget_reservations(id,user_id,project_key,user_key,job_id,model,task,reserved_micro,accounted_micro,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,'reserved')",
        [
          id,
          this.userId,
          this.projectKey,
          this.userKey,
          this.jobId,
          p.model,
          p.text?.format?.name ?? 'unknown',
          reserved,
        ],
      );
      return id;
    });
  }
  async settle(id: string, usage: Usage | null): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Consistent project -> user -> reservation lock order prevents settlement
      // racing with reservations from other workers.
      const preview = (
        await tx.query(
          'SELECT project_key,user_key FROM aw_budget_reservations WHERE id=$1',
          [id],
        )
      )[0];
      if (!preview) return;
      await tx.query(
        'SELECT id FROM aw_budget_accounts WHERE id=$1 FOR UPDATE',
        [preview.project_key],
      );
      if (preview.user_key)
        await tx.query(
          'SELECT id FROM aw_budget_accounts WHERE id=$1 FOR UPDATE',
          [preview.user_key],
        );
      const row = lifeRow(
        await tx.query(
          'SELECT * FROM aw_budget_reservations WHERE id=$1 FOR UPDATE',
          [id],
        ),
      );
      if (row.status === 'completed') return;
      if (
        !usage ||
        ![usage.input_tokens, usage.output_tokens].every(
          (n) => Number.isInteger(n) && n >= 0,
        )
      ) {
        await tx.query(
          "UPDATE aw_budget_reservations SET status='unknown',settled_at=now() WHERE id=$1",
          [id],
        );
        return;
      }
      const rates = applicationModelPrices[String(row.model)]!;
      const accounted = Math.ceil(
        usage.input_tokens * rates.inputCeiling +
          usage.output_tokens * rates.output,
      );
      await tx.query(
        'UPDATE aw_budget_accounts SET accounted_micro=accounted_micro+$2 WHERE id IN ($1,$3)',
        [
          row.project_key,
          accounted - Number(row.accounted_micro),
          row.user_key,
        ],
      );
      await tx.query(
        "UPDATE aw_budget_reservations SET status='completed',accounted_micro=$2,input_tokens=$3,output_tokens=$4,settled_at=now() WHERE id=$1",
        [id, accounted, usage.input_tokens, usage.output_tokens],
      );
    });
  }
}
