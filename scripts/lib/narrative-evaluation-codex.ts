import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { DomainError } from '@future-flow/core';
import {
  CODEX_QUOTA_THRESHOLDS,
  resetsAtFromUnix,
  type QuotaSnapshot,
  type QuotaSource,
  type QuotaWindow,
} from './narrative-evaluation-quota';
import type { OfflineMockResponder } from './narrative-evaluation-runner';

// Local development transport: answers each pipeline request through the
// owner's signed-in Codex CLI (ChatGPT plan), never through an API key, the
// paid evaluation ledger or the budget guard. Output is labelled offline and
// is NOT comparable with paid measurements: Codex adds its own agent
// instructions, and reasoning/sampling settings differ from the Responses API
// call the product makes. Use it for fast directional iteration only.
//
// Alignment with the product call (packages/ai): the user config and exec
// rules are ignored, reasoning is always medium, and the request's own
// per-call deadline and max_output_tokens are enforced. Codex has no output
// cap flag, so the cap is checked on the final message afterwards from its
// UTF-8 size (about four bytes per token); reasoning tokens that the API would
// count against the cap are not visible here, so this is a lower bound.
export type CodexLocalOptions = {
  bin: string;
  model: string;
};

export const CODEX_REASONING_EFFORT = 'medium';
export const CODEX_BYTES_PER_TOKEN_ESTIMATE = 4;

const secretEnv = /^(OPENAI_|CODEX_API_KEY$|NARRATIVE_EVAL_|AZURE_OPENAI)/;
export function codexChildEnv(env: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key, value]) => value !== undefined && !secretEnv.test(key),
    ),
  ) as Record<string, string>;
}

type Message = { role: string; content: string };
export function codexPrompt(input: unknown) {
  const messages = Array.isArray(input) ? (input as Message[]) : [];
  const system = messages.find((m) => m.role === 'system')?.content;
  const user = messages.find((m) => m.role === 'user')?.content;
  if (typeof system !== 'string' || typeof user !== 'string')
    throw new DomainError(
      'EVAL_CONFIG_INVALID',
      'A Codex request needs one system and one user message.',
    );
  return `Do not use tools, read files or run commands. Act only as the model described below and answer with the final JSON object.\n\n=== SYSTEM INSTRUCTIONS ===\n${system}\n\n=== REQUEST JSON ===\n${user}`;
}

export function codexExecArgs(
  model: string,
  schemaPath: string,
  outputPath: string,
) {
  return [
    'exec',
    '--ephemeral',
    '--skip-git-repo-check',
    // No ~/.codex/config.toml (plugins, effort) or execpolicy rules.
    '--ignore-user-config',
    '--ignore-rules',
    '--sandbox',
    'read-only',
    '--model',
    model,
    '--config',
    `model_reasoning_effort="${CODEX_REASONING_EFFORT}"`,
    '--output-schema',
    schemaPath,
    '--output-last-message',
    outputPath,
    '-',
  ];
}

export function codexOutputLimitExceeded(
  output: string,
  maxOutputTokens: number,
) {
  return (
    Math.ceil(
      Buffer.byteLength(output, 'utf8') / CODEX_BYTES_PER_TOKEN_ESTIMATE,
    ) > maxOutputTokens
  );
}

function run(
  options: CodexLocalOptions,
  args: string[],
  stdin: string,
  cwd: string,
  timeoutMs: number,
) {
  return new Promise<void>((resolveRun, reject) => {
    let timedOut = false;
    const child = spawn(options.bin, args, {
      cwd,
      env: codexChildEnv(process.env),
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && !timedOut) resolveRun();
      else
        reject(
          new DomainError(
            'AI_PROVIDER_FAILED',
            timedOut
              ? 'Codex exec exceeded the API-equivalent deadline.'
              : 'Codex exec did not finish.',
          ),
        );
    });
    child.stdin.end(stdin);
  });
}

export function codexLocalResponder(
  options: CodexLocalOptions,
): OfflineMockResponder {
  return async ({ parameters, timeoutMs }) => {
    const format = parameters.text.format as { schema?: unknown };
    if (!format.schema)
      throw new DomainError(
        'EVAL_CONFIG_INVALID',
        'A Codex request needs its strict output schema.',
      );
    const maxOutputTokens = parameters.max_output_tokens;
    if (
      !Number.isSafeInteger(maxOutputTokens) ||
      maxOutputTokens! <= 0 ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs! <= 0
    )
      throw new DomainError(
        'EVAL_CONFIG_INVALID',
        'A Codex request needs the API output cap and deadline.',
      );
    // An empty directory: no AGENTS.md, repository or credentials in reach.
    const dir = await mkdtemp(join(tmpdir(), 'alterward-codex-'));
    try {
      await writeFile(join(dir, 'schema.json'), JSON.stringify(format.schema));
      await run(
        options,
        codexExecArgs(
          options.model,
          join(dir, 'schema.json'),
          join(dir, 'out.json'),
        ),
        codexPrompt(parameters.input),
        dir,
        timeoutMs!,
      );
      const output = await readFile(join(dir, 'out.json'), 'utf8');
      // The API reports a response past max_output_tokens as incomplete, which
      // the product turns into AI_INCOMPLETE_OR_REFUSED.
      if (codexOutputLimitExceeded(output, maxOutputTokens!))
        return {
          __rawResponse: {
            status: 'incomplete',
            output_parsed: null,
            usage: {
              input_tokens: 0,
              output_tokens: Math.ceil(
                Buffer.byteLength(output, 'utf8') /
                  CODEX_BYTES_PER_TOKEN_ESTIMATE,
              ),
            },
          },
        };
      return JSON.parse(output);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}

type RateLimitWindow = {
  usedPercent?: number;
  windowDurationMins?: number | null;
  resetsAt?: number | null;
};
type RateLimitsResult = {
  ordinaryUsageAllowed?: boolean | null;
  rateLimits?: {
    primary?: RateLimitWindow | null;
    secondary?: RateLimitWindow | null;
    rateLimitReachedType?: string | null;
    spendControlReached?: boolean | null;
  };
};

export function codexQuotaFrom(
  result: RateLimitsResult,
  at = new Date().toISOString(),
): QuotaSnapshot {
  const limits = result.rateLimits ?? {};
  const windows: QuotaWindow[] = [];
  for (const window of [limits.primary, limits.secondary]) {
    if (!window || typeof window.usedPercent !== 'number') continue;
    // The ChatGPT plan reports a 5 hour and a weekly window; anything else is
    // not mapped and leaves the guard failing closed.
    const name =
      window.windowDurationMins === 300
        ? 'five-hour'
        : window.windowDurationMins === 10080
          ? 'weekly'
          : null;
    if (name)
      windows.push({
        name,
        remainingPercent: Math.max(0, 100 - window.usedPercent),
        resetsAt: resetsAtFromUnix(window.resetsAt),
      });
  }
  const blockedReason =
    result.ordinaryUsageAllowed === false
      ? 'ordinary Codex usage is not allowed'
      : limits.rateLimitReachedType
        ? `rate limit reached (${limits.rateLimitReachedType})`
        : limits.spendControlReached
          ? 'spend control limit reached'
          : null;
  return { engine: 'codex', at, windows, blockedReason };
}

// Codex' own app server reports the plan windows. It uses the CLI's stored
// sign-in itself; this process never reads the credential files. Only the
// read-only `account/rateLimits/read` request is sent.
export function readCodexQuota(
  bin: string,
  timeoutMs = 20000,
): Promise<QuotaSnapshot> {
  return new Promise((resolveQuota, reject) => {
    const child = spawn(bin, ['app-server'], {
      env: codexChildEnv(process.env),
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let settled = false;
    const finish = (error: Error | null, value?: QuotaSnapshot) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      if (error) reject(error);
      else resolveQuota(value!);
    };
    const fail = () =>
      finish(
        new DomainError(
          'EVAL_QUOTA_UNAVAILABLE',
          'The Codex quota could not be read.',
        ),
      );
    const timer = setTimeout(fail, timeoutMs);
    child.on('error', fail);
    child.on('close', fail);
    const send = (message: unknown) =>
      child.stdin.write(`${JSON.stringify(message)}\n`);
    createInterface({ input: child.stdout }).on('line', (line) => {
      let message: { id?: number; result?: RateLimitsResult; error?: unknown };
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.id === 1) {
        if (message.error) return fail();
        send({ method: 'initialized' });
        send({
          id: 2,
          method: 'account/rateLimits/read',
          params: { excludeResetCreditDetails: true },
        });
      } else if (message.id === 2) {
        if (message.error || !message.result) return fail();
        finish(null, codexQuotaFrom(message.result));
      }
    });
    send({
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'alterward-quota', version: '1' } },
    });
  });
}

export function codexQuotaSource(bin: string): QuotaSource {
  return {
    engine: 'codex',
    read: () => readCodexQuota(bin),
    thresholds: CODEX_QUOTA_THRESHOLDS,
  };
}
