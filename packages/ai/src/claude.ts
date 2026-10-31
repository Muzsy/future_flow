import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import { DomainError, hash } from '@future-flow/core';
import type { AiRequestGuard, AiResult } from './index';
import type { ExperimentTokenPrices } from './experiment-budget';

// Standard global Claude API prices verified 2026-10-31. No fast mode or 1h cache.
// Sonnet 5.5 cachedInput stays at the conservative 0.2 (the page lists 0.10 for cache reads).
export const claudeExperimentPrices: ExperimentTokenPrices = {
  'claude-haiku-4-5-20251001': {
    input: 1,
    cachedInput: 0.1,
    inputCeiling: 1.25,
    output: 5,
  },
  'claude-sonnet-5-5': {
    input: 2,
    cachedInput: 0.2,
    inputCeiling: 2.5,
    output: 10,
  },
  'claude-opus-5-5': {
    input: 4,
    cachedInput: 0.2,
    inputCeiling: 5,
    output: 20,
  },
  'claude-fable-5-1': {
    input: 10,
    cachedInput: 0.25,
    inputCeiling: 12.5,
    output: 50,
  },
};

const usageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cache_creation_input_tokens: z.number().int().nonnegative().default(0),
  cache_read_input_tokens: z.number().int().nonnegative().default(0),
  cache_creation: z
    .object({
      ephemeral_1h_input_tokens: z.number().int().nonnegative().default(0),
    })
    .optional(),
  output_tokens_details: z
    .object({ thinking_tokens: z.number().int().nonnegative() })
    .optional(),
});

// Claude's REST grammar accepts fewer constraints than the local Zod contract.
// Keep bounds as descriptions and enforce the original schema after accounting.
export function claudeJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = zodTextFormat(schema, 'structured_result').schema;
  const stripped = new Set([
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'format',
  ]);
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    const object = value as Record<string, unknown>;
    const constraints = Object.entries(object).filter(([key]) =>
      stripped.has(key),
    );
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(object)) {
      if (stripped.has(key)) continue;
      result[key] =
        (key === 'properties' || key === '$defs') &&
        child &&
        typeof child === 'object'
          ? Object.fromEntries(
              Object.entries(child).map(([name, definition]) => [
                name,
                visit(definition),
              ]),
            )
          : visit(child);
    }
    if (constraints.length)
      result.description = [
        object.description,
        `Local validation requires ${constraints.map(([k, v]) => `${k}=${v}`).join(', ')}.`,
      ]
        .filter(Boolean)
        .join(' ');
    return result;
  }
  return visit(raw) as Record<string, unknown>;
}

export type ClaudeTask<T> = {
  model: string;
  task: string;
  schema: z.ZodType<T>;
  instructions: string;
  input: unknown;
  maxOutputTokens: number;
  effort?: 'low' | 'medium';
  cacheInput?: boolean;
};

export const externalAuditSchema = z
  .object({
    languageCorrect: z.boolean(),
    canonFaithful: z.boolean(),
    scores: z
      .object({
        personal: z.number().int().min(1).max(5),
        coherent: z.number().int().min(1).max(5),
        language: z.number().int().min(1).max(5),
        decisionStakes: z.number().int().min(1).max(5),
        curiosity: z.number().int().min(1).max(5),
      })
      .strict(),
    issues: z
      .array(
        z
          .object({
            periodNo: z.number().int().min(1).max(3),
            category: z.enum(['canon', 'language', 'decision', 'style']),
            severity: z.enum(['minor', 'major']),
            excerpt: z.string().max(350),
            canonEvidence: z.string().max(500),
            reason: z.string().min(5).max(600),
          })
          .strict(),
      )
      .max(18),
    summary: z.string().min(10).max(1200),
  })
  .strict();
export type ExternalAudit = z.infer<typeof externalAuditSchema>;
export function validateExternalAudit(
  audit: ExternalAudit,
  chapters: readonly { periodNo: number; body: string; title: string }[],
) {
  const normalize = (text: string) => text.replace(/\s+/gu, ' ').trim();
  for (const issue of audit.issues) {
    const chapter = chapters.find((item) => item.periodNo === issue.periodNo);
    if (
      !chapter ||
      !issue.excerpt.trim() ||
      !normalize(chapter.body + ' ' + chapter.title).includes(
        normalize(issue.excerpt),
      )
    )
      throw new DomainError(
        'AUDIT_EVIDENCE_INVALID',
        'Auditor excerpt is absent from the cited chapter.',
      );
  }
  const canonFault = audit.issues.some(
    (issue) =>
      issue.category === 'canon' ||
      (issue.severity === 'major' && issue.category === 'decision'),
  );
  const languageFault = audit.issues.some(
    (issue) => issue.severity === 'major' && issue.category === 'language',
  );
  if (
    audit.canonFaithful === canonFault ||
    audit.languageCorrect === languageFault
  )
    throw new DomainError(
      'AUDIT_VERDICT_INCONSISTENT',
      'Auditor verdict disagrees with its issue categories.',
    );
}
export const eventTrialSchema = z
  .object({ candidateJson: z.string() })
  .strict();

export class ClaudeHttpError extends DomainError {
  constructor(
    status: number,
    readonly diagnostic: { type: string; terms: string[] },
  ) {
    super(
      `CLAUDE_HTTP_${status}`,
      'Claude request failed; provider body withheld.',
      503,
    );
  }
}

// Evaluation-only server client. Production workers keep their existing DB guard.
// Each paid transport is reserved; no automatic retry or provider fallback.
export class ClaudeEvaluator {
  constructor(
    private readonly config: {
      apiKey: string;
      guard: AiRequestGuard;
      timeoutMs?: number;
    },
    private readonly transport: typeof fetch = fetch,
  ) {}
  private parameters<T>(task: ClaudeTask<T>) {
    if (
      !this.config.apiKey ||
      !claudeExperimentPrices[task.model] ||
      !Number.isInteger(task.maxOutputTokens) ||
      task.maxOutputTokens < 1 ||
      task.maxOutputTokens > 12000 ||
      (task.model.startsWith('claude-haiku') && task.effort)
    )
      throw new DomainError(
        'CLAUDE_CONFIG_INVALID',
        'Unsupported evaluation configuration.',
      );
    const block = {
      type: 'text',
      text: JSON.stringify(task.input),
      ...(task.cacheInput
        ? { cache_control: { type: 'ephemeral', ttl: '5m' } }
        : {}),
    };
    return {
      model: task.model,
      max_tokens: task.maxOutputTokens,
      system: task.instructions,
      messages: [{ role: 'user', content: [block] }],
      output_config: {
        format: { type: 'json_schema', schema: claudeJsonSchema(task.schema) },
        ...(task.effort ? { effort: task.effort } : {}),
      },
      service_tier: 'standard_only',
      // Haiku 4.5 predates the inference_geo request parameter.
      ...(task.model.includes('haiku') ? {} : { inference_geo: 'global' }),
    };
  }
  private async post(path: string, body: unknown) {
    try {
      const response = await this.transport(
        `https://api.anthropic.com/v1/messages${path}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'anthropic-version': '2023-06-01',
            'x-api-key': this.config.apiKey,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.config.timeoutMs ?? 120000),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: { type?: string; message?: string };
        };
        const allowedTypes = [
          'invalid_request_error',
          'authentication_error',
          'permission_error',
          'not_found_error',
          'rate_limit_error',
          'api_error',
          'overloaded_error',
        ];
        const terms = [
          'output_config',
          'schema',
          'service_tier',
          'inference_geo',
          'credit balance',
          'max_tokens',
          'minimum',
          'additionalProperties',
          'format',
          'effort',
          'does not support',
          'extra inputs',
          'insufficient',
          'billing',
          'structured',
          'pattern',
          'enum',
        ];
        throw new ClaudeHttpError(response.status, {
          type: allowedTypes.includes(body.error?.type ?? '')
            ? body.error!.type!
            : 'unknown',
          terms: terms.filter((term) =>
            (body.error?.message ?? '')
              .toLowerCase()
              .includes(term.toLowerCase()),
          ),
        });
      }
      return (await response.json()) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        'CLAUDE_TRANSPORT_FAILED',
        'Claude response unavailable.',
        503,
      );
    }
  }
  async countTokens<T>(task: ClaudeTask<T>): Promise<number> {
    const {
      max_tokens: _max,
      service_tier: _tier,
      inference_geo: _geo,
      ...body
    } = this.parameters(task);
    const response = await this.post('/count_tokens', body);
    return z.number().int().nonnegative().parse(response.input_tokens);
  }
  async generate<T>(task: ClaudeTask<T>): Promise<AiResult<T>> {
    const parameters = this.parameters(task);
    // Adapter preserves the entire serialized request in the conservative byte bound.
    const id = await this.config.guard.reserve({
      ...parameters,
      max_output_tokens: task.maxOutputTokens,
      text: { format: { name: task.task } },
    });
    const started = Date.now();
    let accounted = false;
    try {
      const response = await this.post('', parameters);
      const usage = usageSchema.parse(response.usage);
      if (
        (usage.cache_creation?.ephemeral_1h_input_tokens ?? 0) > 0 ||
        (usage.output_tokens_details?.thinking_tokens ?? 0) >
          usage.output_tokens
      )
        throw new DomainError(
          'CLAUDE_USAGE_INVALID',
          'Unsupported usage pricing.',
        );
      const totalInput =
        usage.input_tokens +
        usage.cache_creation_input_tokens +
        usage.cache_read_input_tokens;
      await this.config.guard.settle(id, {
        input_tokens: totalInput,
        output_tokens: usage.output_tokens,
        input_tokens_details: {
          cached_tokens: usage.cache_read_input_tokens,
          cache_write_tokens: usage.cache_creation_input_tokens,
        },
      } as Parameters<AiRequestGuard['settle']>[1]);
      accounted = true;
      if (response.stop_reason !== 'end_turn')
        throw new DomainError(
          'CLAUDE_INCOMPLETE_OR_REFUSED',
          'Claude did not complete an acceptable response.',
        );
      const content = z
        .array(z.object({ type: z.string(), text: z.string().optional() }))
        .parse(response.content);
      const text = content
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('');
      const output = task.schema.parse(JSON.parse(text));
      return {
        output,
        receipt: {
          task: task.task,
          promptVersion: `${task.task}.claude-eval.v1`,
          model: String(response.model ?? task.model),
          requestId: typeof response.id === 'string' ? response.id : null,
          inputHash: hash({
            instructions: task.instructions,
            input: task.input,
            schema: parameters.output_config.format.schema,
            effort: task.effort ?? null,
          }),
          outputHash: hash(output),
          inputTokens: totalInput,
          outputTokens: usage.output_tokens,
          cachedInputTokens: usage.cache_read_input_tokens,
          cacheWriteTokens: usage.cache_creation_input_tokens,
          reasoningTokens: usage.output_tokens_details?.thinking_tokens,
          latencyMs: Date.now() - started,
        },
      };
    } catch (error) {
      if (!accounted) await this.config.guard.settle(id, null);
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        'CLAUDE_INVALID_OUTPUT',
        'Claude output did not satisfy the local contract.',
      );
    }
  }
}
