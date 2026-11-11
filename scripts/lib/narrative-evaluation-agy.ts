import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DomainError } from '@future-flow/core';
import {
  AGY_QUOTA_THRESHOLDS,
  type QuotaSnapshot,
  type QuotaSource,
  type QuotaWindow,
} from './narrative-evaluation-quota';
import type { OfflineMockResponder } from './narrative-evaluation-runner';

// Local development transport through the Antigravity CLI (`agy`), Gemini 3.8
// Flash. The model differs from the product's, so it may only answer steps
// where the model type does not matter (see AGY_MODEL_INDEPENDENT_TASKS); its
// output is never comparable with a paid measurement.
//
// Alignment with the product call: the API deadline and max_output_tokens of
// the request are enforced, the global user config (GEMINI.md rules, skills,
// memory, conversations) is left out by running with an isolated HOME that
// only links the sign-in files, and the working directory is empty.
//
// Known limit: `--json-schema` is not used. In a probe the agent looped on it
// (127k input tokens, 113 s, empty response). The schema is part of the prompt
// instead and the pipeline's own Zod parsing validates the answer, including
// the usual repair path. The prompt travels as one argument, which Linux caps
// at 128 KiB, so larger requests are refused up front.
export const AGY_MODEL = 'gemini-3.8-flash-medium';
export const AGY_MODEL_INDEPENDENT_TASKS: ReadonlySet<string> = new Set([
  'life_narrative_plan_review',
  'life_fidelity',
]);
export const AGY_MAX_PROMPT_BYTES = 120000;

const secretEnv =
  /^(OPENAI_|CODEX_API_KEY$|NARRATIVE_EVAL_|AZURE_OPENAI|ANTHROPIC_|GEMINI_API_KEY$|GOOGLE_API_KEY$|GOOGLE_APPLICATION_CREDENTIALS$|AGY_ADC_AUTH$|AGY_LLM_GATEWAY)/;
export function agyChildEnv(
  env: Record<string, string | undefined>,
  home: string,
) {
  return {
    ...(Object.fromEntries(
      Object.entries(env).filter(
        ([key, value]) => value !== undefined && !secretEnv.test(key),
      ),
    ) as Record<string, string>),
    HOME: home,
  };
}

// Only the sign-in material and static binaries of the real configuration are
// linked; GEMINI.md, skills, settings, history, conversations and the
// knowledge/brain stores stay out, and new state lands in the temporary HOME.
const linkedGemini = [
  'google_accounts.json',
  'jetski-standalone-oauth-token',
  'installation_id',
  'state.json',
  'trustedFolders.json',
];
const linkedCli = [
  'antigravity-oauth-token',
  'installation_id',
  'antigravity_state.pbtxt',
  'jetski_state.pbtxt',
  'bin',
  'builtin',
  'cache',
  'last_check.timestamp',
];
export function createAgyHome(realHome = homedir()) {
  const home = mkdtempSync(join(tmpdir(), 'alterward-agy-home-'));
  const link = (relative: string) => {
    const source = join(realHome, relative);
    if (!existsSync(source)) return;
    const target = join(home, relative);
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(source, target);
  };
  for (const name of linkedGemini) link(join('.gemini', name));
  for (const name of linkedCli) link(join('.gemini', 'antigravity-cli', name));
  return {
    home,
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}

type Message = { role: string; content: string };
export function agyPrompt(input: unknown, schema: unknown) {
  const messages = Array.isArray(input) ? (input as Message[]) : [];
  const system = messages.find((m) => m.role === 'system')?.content;
  const user = messages.find((m) => m.role === 'user')?.content;
  if (typeof system !== 'string' || typeof user !== 'string')
    throw new DomainError(
      'EVAL_CONFIG_INVALID',
      'An agy request needs one system and one user message.',
    );
  return `Do not use tools, read files or run commands. Act only as the model described below. Answer with exactly one JSON object that validates against the JSON SCHEMA, with no code fence and no other text.\n\n=== SYSTEM INSTRUCTIONS ===\n${system}\n\n=== JSON SCHEMA ===\n${JSON.stringify(schema)}\n\n=== REQUEST JSON ===\n${user}`;
}

export function agyJsonObject(response: string): unknown {
  const text = response.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

type AgyPrintResult = {
  status?: string;
  response?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    thinking_tokens?: number;
  };
  command?: {
    data?: {
      groups?: {
        name?: string;
        description?: string;
        buckets?: {
          id?: string;
          window?: string;
          remaining_fraction?: number;
          reset_time?: string;
        }[];
      }[];
    };
  };
};

function runAgy(
  bin: string,
  args: string[],
  home: string,
  cwd: string,
  timeoutMs: number,
) {
  return new Promise<{ result: AgyPrintResult; stderr: string }>(
    (resolveRun, reject) => {
      let timedOut = false;
      let stdout = '';
      let stderr = '';
      const child = spawn(bin, args, {
        cwd,
        env: agyChildEnv(process.env, home),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      // agy's own --print-timeout returns partial output with exit 0, so the
      // deadline is enforced here too, slightly after agy's own.
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeoutMs + 5000);
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0 || timedOut)
          return reject(
            new DomainError(
              'AI_PROVIDER_FAILED',
              timedOut
                ? 'agy exceeded the API-equivalent deadline.'
                : 'agy did not finish.',
            ),
          );
        try {
          resolveRun({ result: JSON.parse(stdout) as AgyPrintResult, stderr });
        } catch {
          reject(
            new DomainError(
              'AI_PROVIDER_FAILED',
              'agy printed no JSON result.',
            ),
          );
        }
      });
    },
  );
}

export type AgyStats = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
};

export function agyLocalResponder(
  options: { bin: string; home: string },
  stats: AgyStats = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
  },
): OfflineMockResponder {
  return async ({ task, parameters, timeoutMs }) => {
    if (!AGY_MODEL_INDEPENDENT_TASKS.has(task))
      throw new DomainError(
        'EVAL_CONFIG_INVALID',
        `The agy transport may not answer ${task}: its model type matters there.`,
      );
    const format = parameters.text.format as { schema?: unknown };
    const maxOutputTokens = parameters.max_output_tokens;
    if (!format.schema)
      throw new DomainError(
        'EVAL_CONFIG_INVALID',
        'An agy request needs its strict output schema.',
      );
    if (
      !Number.isSafeInteger(maxOutputTokens) ||
      maxOutputTokens! <= 0 ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs! <= 0
    )
      throw new DomainError(
        'EVAL_CONFIG_INVALID',
        'An agy request needs the API output cap and deadline.',
      );
    const prompt = agyPrompt(parameters.input, format.schema);
    if (Buffer.byteLength(prompt, 'utf8') > AGY_MAX_PROMPT_BYTES)
      throw new DomainError(
        'EVAL_CONFIG_INVALID',
        'The request is too large for a single agy prompt argument.',
      );
    const dir = await mkdtemp(join(tmpdir(), 'alterward-agy-'));
    try {
      const { result, stderr } = await runAgy(
        options.bin,
        [
          '-p',
          prompt,
          '--model',
          AGY_MODEL,
          '--output-format',
          'json',
          '--print-timeout',
          `${Math.max(1, Math.ceil(timeoutMs! / 1000))}s`,
          '--disable-slash-commands',
        ],
        options.home,
        dir,
        timeoutMs!,
      );
      stats.calls += 1;
      stats.inputTokens += result.usage?.input_tokens ?? 0;
      stats.outputTokens += result.usage?.output_tokens ?? 0;
      stats.thinkingTokens += result.usage?.thinking_tokens ?? 0;
      if (
        result.status !== 'SUCCESS' ||
        /print timeout/i.test(stderr) ||
        !result.response?.trim()
      )
        throw new DomainError(
          'AI_PROVIDER_FAILED',
          'agy returned no complete answer.',
        );
      // Thinking tokens are part of output_tokens, as reasoning is in the API.
      const outputTokens = result.usage?.output_tokens ?? 0;
      const parsed = agyJsonObject(result.response);
      if (outputTokens > maxOutputTokens! || parsed === null)
        return {
          __rawResponse: {
            status: 'incomplete',
            output_parsed: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        };
      return parsed;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}

export function agyQuotaFrom(
  result: AgyPrintResult,
  at = new Date().toISOString(),
): QuotaSnapshot {
  // Flash and Pro share one group; the Claude/GPT group and the separate
  // Gemini 4 Argon bucket are not used by this transport.
  const group = result.command?.data?.groups?.find((g) =>
    /gemini flash/i.test(g.description ?? ''),
  );
  const windows: QuotaWindow[] = [];
  for (const bucket of group?.buckets ?? []) {
    const key = `${bucket.window ?? ''} ${bucket.id ?? ''}`;
    const name = /weekly/i.test(key)
      ? 'weekly'
      : /5h|five|hour/i.test(key)
        ? 'five-hour'
        : null;
    if (name && typeof bucket.remaining_fraction === 'number')
      windows.push({
        name,
        remainingPercent: Math.floor(bucket.remaining_fraction * 100),
        resetsAt: bucket.reset_time ?? null,
      });
  }
  return { engine: 'agy', at, windows, blockedReason: null };
}

// `/usage` is a built-in command: no model call and no tokens.
export async function readAgyQuota(
  bin: string,
  home: string,
  timeoutMs = 30000,
): Promise<QuotaSnapshot> {
  const dir = await mkdtemp(join(tmpdir(), 'alterward-agy-'));
  try {
    const { result } = await runAgy(
      bin,
      ['-p', '/usage', '--output-format', 'json'],
      home,
      dir,
      timeoutMs,
    );
    return agyQuotaFrom(result);
  } catch {
    throw new DomainError(
      'EVAL_QUOTA_UNAVAILABLE',
      'The agy quota could not be read.',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function agyQuotaSource(bin: string, home: string): QuotaSource {
  return {
    engine: 'agy',
    read: () => readAgyQuota(bin, home),
    thresholds: AGY_QUOTA_THRESHOLDS,
  };
}
