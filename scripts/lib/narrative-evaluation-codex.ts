import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DomainError } from '@future-flow/core';
import type { OfflineMockResponder } from './narrative-evaluation-runner';

// Local development transport: answers each pipeline request through the
// owner's signed-in Codex CLI (ChatGPT plan), never through an API key, the
// paid evaluation ledger or the budget guard. Output is labelled offline and
// is NOT comparable with paid measurements: Codex adds its own agent
// instructions, and reasoning/sampling settings differ from the Responses API
// call the product makes. Use it for fast directional iteration only.
export type CodexLocalOptions = {
  bin: string;
  model: string;
  reasoningEffort: string;
  timeoutMs: number;
};

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

function run(
  options: CodexLocalOptions,
  args: string[],
  stdin: string,
  cwd: string,
) {
  return new Promise<void>((resolveRun, reject) => {
    const child = spawn(options.bin, args, {
      cwd,
      env: codexChildEnv(process.env),
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    const timer = setTimeout(() => child.kill('SIGTERM'), options.timeoutMs);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolveRun();
      else
        reject(
          new DomainError('AI_PROVIDER_FAILED', 'Codex exec did not finish.'),
        );
    });
    child.stdin.end(stdin);
  });
}

export function codexLocalResponder(
  options: CodexLocalOptions,
): OfflineMockResponder {
  return async ({ parameters }) => {
    const format = parameters.text.format as { schema?: unknown };
    if (!format.schema)
      throw new DomainError(
        'EVAL_CONFIG_INVALID',
        'A Codex request needs its strict output schema.',
      );
    // An empty directory: no AGENTS.md, repository or credentials in reach.
    const dir = await mkdtemp(join(tmpdir(), 'alterward-codex-'));
    try {
      await writeFile(join(dir, 'schema.json'), JSON.stringify(format.schema));
      await run(
        options,
        [
          'exec',
          '--ephemeral',
          '--skip-git-repo-check',
          '--sandbox',
          'read-only',
          '--model',
          options.model,
          '--config',
          `model_reasoning_effort="${options.reasoningEffort}"`,
          '--output-schema',
          join(dir, 'schema.json'),
          '--output-last-message',
          join(dir, 'out.json'),
          '-',
        ],
        codexPrompt(parameters.input),
        dir,
      );
      return JSON.parse(await readFile(join(dir, 'out.json'), 'utf8'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}
