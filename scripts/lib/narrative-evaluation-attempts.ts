import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { chmod, mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import {
  fidelitySchema,
  fictionAuthorResultSchema,
  fictionCompactAuthorSchema,
  fictionCompactDraftSchema,
  fictionEditorialReportSchema,
  narrativeEditorialReportSchema,
  narrativePlanReviewV1Schema,
  narrativePlanReviewV2Schema,
  narrativePlanningResultSchema,
  periodCandidateV2Schema,
  periodChapterV2Schema,
} from '@future-flow/contracts';
import { DomainError, hash } from '@future-flow/core';
import type { AiReceipt } from '@future-flow/ai';
import type { EvaluationOptions } from './narrative-evaluation-options';

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const safeCaseIdPattern = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;
const safeRequestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const safeErrorCodePattern = /^[A-Z0-9_]{2,64}$/;
const secretTokenPattern =
  /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{8,}\b|Bearer\s+[A-Za-z0-9._~+/=-]{6,}/i;
const forbiddenHeaderKeyPattern =
  /^(?:authorization|x-api-key|api-key|openai-api-key|proxy-authorization|cookie|set-cookie)$/i;

export const evaluationAttemptTaskSchema = z.enum([
  'life_narrative_plan',
  'life_narrative_chapter',
  'life_narrative_plan_review',
  'life_fidelity',
  'life_narrative_editor',
  'life_period',
  'life_chapter',
]);
export type EvaluationAttemptTask = z.infer<typeof evaluationAttemptTaskSchema>;

export const evaluationAttemptUsageSchema = z
  .object({
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    cachedInputTokens: z.number().int().min(0),
  })
  .strict();
export type EvaluationAttemptUsage = z.infer<
  typeof evaluationAttemptUsageSchema
>;

export const evaluationAttemptRepairFeedbackSchema = z
  .object({
    mode: z.enum(['prose_only', 'author_package']).optional(),
    message: z.string().min(1).max(8000),
  })
  .strict();
export type EvaluationAttemptRepairFeedback = z.infer<
  typeof evaluationAttemptRepairFeedbackSchema
>;

export const evaluationAttemptRecordSchema = z
  .object({
    caseId: z.string().min(1).max(128),
    ordinal: z.number().int().min(0).max(64),
    task: evaluationAttemptTaskSchema,
    model: z.string().min(1).max(200),
    requestHash: digestSchema,
    inputHash: digestSchema,
    outputHash: digestSchema.nullable(),
    output: z.unknown().nullable(),
    status: z.enum(['completed', 'incomplete', 'malformed', 'failed']),
    errorCode: z.string().min(2).max(64).nullable(),
    usage: evaluationAttemptUsageSchema.nullable(),
    requestId: z.string().min(1).max(128).nullable(),
    latencyMs: z.number().int().min(0),
    repairFeedback: evaluationAttemptRepairFeedbackSchema.nullable(),
  })
  .strict();
export type EvaluationAttemptRecord = z.infer<
  typeof evaluationAttemptRecordSchema
>;

export const evaluationAttemptTraceSchema = z
  .object({
    version: z.literal('1.0.0'),
    caseId: z.string().min(1).max(128),
    sourceCommit: z.string().min(7).max(64),
    sourceHash: digestSchema,
    manifestBinding: digestSchema,
    mock: z.boolean(),
    models: z
      .object({
        event: z.string().min(1).max(200),
        story: z.string().min(1).max(200),
        check: z.string().min(1).max(200),
      })
      .strict(),
    projectHash: digestSchema.nullable(),
    attempts: z.array(evaluationAttemptRecordSchema),
    traceHash: digestSchema,
  })
  .strict();
export type EvaluationAttemptTrace = z.infer<
  typeof evaluationAttemptTraceSchema
>;

export type AttemptTraceBinding = {
  caseId: string;
  sourceCommit: string;
  sourceHash: string;
  manifestBinding: string;
  mock: boolean;
  models: EvaluationOptions['models'];
  projectHash: string | null;
};

export type AttemptTransportSummary = {
  caseId: string;
  task: string;
  latencyMs: number;
};

export type AttemptSampleSummary = {
  kind: 'full' | 'fixed-canon' | 'fork';
  fixtureId: string;
  mode: string;
  periodIndex: number;
  receipts: AiReceipt[];
  transportCalls: number;
};

export function sampleCaseId(
  sample: Pick<
    AttemptSampleSummary,
    'kind' | 'fixtureId' | 'mode' | 'periodIndex'
  >,
): string {
  return sample.kind === 'full'
    ? `${sample.fixtureId}:${sample.mode}:${sample.periodIndex}`
    : sample.kind === 'fork'
      ? `fork:${sample.fixtureId}:${sample.mode}:${sample.periodIndex}`
      : `fixed:${sample.fixtureId}:${sample.mode}:${sample.periodIndex}`;
}

export function validateAttemptCaseId(caseId: string): string {
  if (
    typeof caseId !== 'string' ||
    !safeCaseIdPattern.test(caseId) ||
    caseId.includes('..')
  )
    throw new DomainError(
      'EVAL_OUTPUT_INVALID',
      'Invalid diagnostic attempt case identifier.',
    );
  return caseId;
}

export function safeAttemptCaseFileName(caseId: string): string {
  const valid = validateAttemptCaseId(caseId);
  return `${valid.replaceAll(':', '-')}.json`;
}

function assertSafeOutDir(outDir: string): string {
  if (typeof outDir !== 'string' || !outDir.trim())
    throw new DomainError(
      'EVAL_OUTPUT_INVALID',
      'Evaluation output directory is required.',
    );
  const resolvedOut = resolve(outDir);
  if (existsSync(resolvedOut)) {
    const st = lstatSync(resolvedOut);
    if (st.isSymbolicLink() || !st.isDirectory())
      throw new DomainError(
        'EVAL_OUTPUT_INVALID',
        'Evaluation output path must be a real directory.',
      );
  }
  return resolvedOut;
}

export function attemptTraceDir(outDir: string): string {
  const resolvedOut = assertSafeOutDir(outDir);
  const dir = join(resolvedOut, 'diagnostic-attempts');
  const rel = relative(resolvedOut, dir);
  if (!rel || rel.startsWith('..') || isAbsolute(rel))
    throw new DomainError(
      'EVAL_OUTPUT_INVALID',
      'Diagnostic attempts directory escaped evaluation root.',
    );
  if (existsSync(dir)) {
    const st = lstatSync(dir);
    if (st.isSymbolicLink() || !st.isDirectory())
      throw new DomainError(
        'EVAL_OUTPUT_INVALID',
        'Diagnostic attempts path must be a non-symlink directory.',
      );
  }
  return dir;
}

export function attemptTracePath(outDir: string, caseId: string): string {
  const dir = attemptTraceDir(outDir);
  const fileName = safeAttemptCaseFileName(caseId);
  const filePath = join(dir, fileName);
  const rel = relative(dir, filePath);
  if (
    !rel ||
    rel !== fileName ||
    rel.startsWith('..') ||
    isAbsolute(rel) ||
    dirname(filePath) !== dir
  )
    throw new DomainError(
      'EVAL_OUTPUT_INVALID',
      'Diagnostic attempt trace path escaped diagnostic-attempts directory.',
    );
  return filePath;
}

function assertSafeRegularTraceFile(filePath: string) {
  const st = lstatSync(filePath);
  if (st.isSymbolicLink() || !st.isFile() || st.nlink !== 1)
    throw new DomainError(
      'EVAL_OUTPUT_INVALID',
      'Diagnostic attempt trace must be a regular non-symlink file.',
    );
  if ((st.mode & 0o777) !== 0o600)
    throw new DomainError(
      'EVAL_OUTPUT_INVALID',
      'Diagnostic attempt trace must maintain 0600 permissions.',
    );
}

export function computeAttemptTraceHash(
  trace: Omit<EvaluationAttemptTrace, 'traceHash'>,
): string {
  return hash({
    version: trace.version,
    caseId: trace.caseId,
    sourceCommit: trace.sourceCommit,
    sourceHash: trace.sourceHash,
    manifestBinding: trace.manifestBinding,
    mock: trace.mock,
    models: trace.models,
    projectHash: trace.projectHash,
    attempts: trace.attempts,
  });
}

function collectSecretValues(
  env: Record<string, string | undefined> = {},
): string[] {
  return [
    env.NARRATIVE_EVAL_API_KEY,
    env.OPENAI_API_KEY,
    process.env.NARRATIVE_EVAL_API_KEY,
    process.env.OPENAI_API_KEY,
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim().length >= 4)
    .map((v) => v.trim());
}

function containsSecretMaterial(
  text: string,
  secrets: readonly string[],
): boolean {
  if (secretTokenPattern.test(text)) return true;
  for (const secret of secrets) {
    if (secret && text.includes(secret)) return true;
  }
  return false;
}

function assertNoSecretsInValue(
  value: unknown,
  secrets: readonly string[],
  seen = new Set<object>(),
) {
  if (typeof value === 'string') {
    if (containsSecretMaterial(value, secrets))
      throw new DomainError(
        'EVAL_OUTPUT_INVALID',
        'Forbidden secret or authorization token detected in diagnostic attempt trace.',
      );
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertNoSecretsInValue(item, secrets, seen);
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenHeaderKeyPattern.test(k) || containsSecretMaterial(k, secrets))
      throw new DomainError(
        'EVAL_OUTPUT_INVALID',
        'Forbidden authorization header or secret key detected in diagnostic attempt trace.',
      );
    assertNoSecretsInValue(v, secrets, seen);
  }
}

export function assertNoSecretsInTrace(
  trace: EvaluationAttemptTrace,
  env: Record<string, string | undefined> = {},
) {
  const secrets = collectSecretValues(env);
  assertNoSecretsInValue(trace, secrets);
  const serialized = JSON.stringify(trace);
  if (containsSecretMaterial(serialized, secrets))
    throw new DomainError(
      'EVAL_OUTPUT_INVALID',
      'Forbidden secret or authorization material detected in serialized attempt trace.',
    );
}

function sanitizeDiagnosticText(
  text: string,
  env: Record<string, string | undefined> = {},
): string {
  const secrets = collectSecretValues(env);
  let cleaned = text.replace(
    /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{8,}\b/g,
    '[REDACTED]',
  );
  cleaned = cleaned.replace(
    /Bearer\s+[A-Za-z0-9._~+/=-]{6,}/gi,
    'Bearer [REDACTED]',
  );
  for (const secret of secrets) {
    if (secret) cleaned = cleaned.split(secret).join('[REDACTED]');
  }
  return cleaned.trim().slice(0, 8000);
}

export function extractAttemptRepairFeedback(
  parsedInput: unknown,
  env: Record<string, string | undefined> = {},
): EvaluationAttemptRepairFeedback | null {
  if (!parsedInput || typeof parsedInput !== 'object') return null;
  const record = parsedInput as Record<string, unknown>;
  const authorRepair = record.authorRepair;
  if (authorRepair && typeof authorRepair === 'object') {
    const ar = authorRepair as Record<string, unknown>;
    const mode =
      ar.mode === 'prose_only' || ar.mode === 'author_package'
        ? ar.mode
        : undefined;
    const rawMessage =
      typeof ar.message === 'string'
        ? sanitizeDiagnosticText(ar.message, env)
        : '';
    if (rawMessage)
      return {
        ...(mode ? { mode } : {}),
        message: rawMessage,
      };
  }
  const repair = record.repair;
  if (typeof repair === 'string') {
    const message = sanitizeDiagnosticText(repair, env);
    return message ? { message } : null;
  }
  if (repair && typeof repair === 'object') {
    const rep = repair as Record<string, unknown>;
    const mode =
      rep.mode === 'prose_only' || rep.mode === 'author_package'
        ? rep.mode
        : undefined;
    const directMessage =
      typeof rep.message === 'string'
        ? sanitizeDiagnosticText(rep.message, env)
        : '';
    const reasonsMessage = Array.isArray(rep.reasons)
      ? sanitizeDiagnosticText(
          rep.reasons
            .filter((r): r is string => typeof r === 'string')
            .join(' '),
          env,
        )
      : '';
    const message = directMessage || reasonsMessage;
    if (message)
      return {
        ...(mode ? { mode } : {}),
        message,
      };
  }
  return null;
}

function parseSyntheticRequestMessages(parameters: { model: string }) {
  const rawParams = parameters as {
    model: string;
    input?: unknown;
    text?: { format?: { name?: unknown } };
  };
  const taskRaw =
    typeof rawParams.text?.format?.name === 'string'
      ? rawParams.text.format.name
      : '';
  const task = evaluationAttemptTaskSchema.parse(taskRaw);
  const inputEntries = Array.isArray(rawParams.input) ? rawParams.input : [];
  let systemInstructions = '';
  let parsedUserInput: unknown = null;
  for (const entry of inputEntries) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as { role?: unknown; content?: unknown };
    if (item.role === 'system' && typeof item.content === 'string') {
      systemInstructions = item.content;
    } else if (item.role === 'user' && typeof item.content === 'string') {
      parsedUserInput = JSON.parse(item.content);
    }
  }
  const inputHash = hash(parsedUserInput);
  const requestHash = hash({
    model: parameters.model,
    task,
    instructions: systemInstructions,
    input: parsedUserInput,
  });
  return {
    task,
    parsedUserInput,
    inputHash,
    requestHash,
  };
}

function fallbackSchemasForTask(task: EvaluationAttemptTask): z.ZodTypeAny[] {
  switch (task) {
    case 'life_narrative_plan':
      return [fictionCompactDraftSchema, narrativePlanningResultSchema];
    case 'life_narrative_chapter':
      return [
        fictionCompactAuthorSchema,
        fictionAuthorResultSchema,
        periodChapterV2Schema,
      ];
    case 'life_narrative_plan_review':
      return [narrativePlanReviewV2Schema, narrativePlanReviewV1Schema];
    case 'life_fidelity':
      return [fidelitySchema];
    case 'life_narrative_editor':
      return [fictionEditorialReportSchema, narrativeEditorialReportSchema];
    case 'life_period':
      return [periodCandidateV2Schema];
    case 'life_chapter':
      return [periodChapterV2Schema];
  }
}

function normalizeParsedProviderOutput(
  task: EvaluationAttemptTask,
  rawOutput: unknown,
  format?: { $parseRaw?: (raw: string) => unknown },
): { output: unknown; outputHash: string; malformed: boolean } {
  const cloned = JSON.parse(JSON.stringify(rawOutput));
  if (typeof format?.$parseRaw === 'function') {
    try {
      const normalized = format.$parseRaw(JSON.stringify(cloned));
      return {
        output: normalized,
        outputHash: hash(normalized),
        malformed: false,
      };
    } catch {
      return {
        output: cloned,
        outputHash: hash(cloned),
        malformed: true,
      };
    }
  }
  for (const schema of fallbackSchemasForTask(task)) {
    const parsed = schema.safeParse(cloned);
    if (parsed.success) {
      return {
        output: parsed.data,
        outputHash: hash(parsed.data),
        malformed: false,
      };
    }
  }
  return {
    output: cloned,
    outputHash: hash(cloned),
    malformed: true,
  };
}

function normalizeUsage(rawUsage: unknown): EvaluationAttemptUsage | null {
  if (!rawUsage || typeof rawUsage !== 'object') return null;
  const u = rawUsage as {
    input_tokens?: unknown;
    output_tokens?: unknown;
    input_tokens_details?: { cached_tokens?: unknown } | null;
  };
  const inputTokens =
    typeof u.input_tokens === 'number' &&
    Number.isSafeInteger(u.input_tokens) &&
    u.input_tokens >= 0
      ? u.input_tokens
      : 0;
  const outputTokens =
    typeof u.output_tokens === 'number' &&
    Number.isSafeInteger(u.output_tokens) &&
    u.output_tokens >= 0
      ? u.output_tokens
      : 0;
  const cachedRaw = u.input_tokens_details?.cached_tokens;
  const cachedInputTokens =
    typeof cachedRaw === 'number' &&
    Number.isSafeInteger(cachedRaw) &&
    cachedRaw >= 0
      ? cachedRaw
      : 0;
  return { inputTokens, outputTokens, cachedInputTokens };
}

function normalizeRequestId(
  rawId: unknown,
  env: Record<string, string | undefined> = {},
): string | null {
  if (typeof rawId !== 'string') return null;
  const trimmed = rawId.trim();
  if (!trimmed || !safeRequestIdPattern.test(trimmed)) return null;
  if (containsSecretMaterial(trimmed, collectSecretValues(env))) return null;
  return trimmed;
}

function classifyFailedAttemptError(error: unknown): string {
  if (error instanceof DomainError && safeErrorCodePattern.test(error.code)) {
    return error.code;
  }
  if (error && typeof error === 'object') {
    const status = (error as { status?: unknown }).status;
    if (status === 401) return 'AI_AUTH_FAILED';
    if (status === 429) return 'AI_RATE_LIMIT';
    if (
      typeof status === 'number' &&
      Number.isInteger(status) &&
      status >= 400 &&
      status <= 599
    )
      return `AI_HTTP_${status}`;
  }
  return 'AI_UPSTREAM_ERROR';
}

export function verifyAttemptTrace(
  raw: unknown,
  expected: AttemptTraceBinding,
  env: Record<string, string | undefined> = {},
): EvaluationAttemptTrace {
  validateAttemptCaseId(expected.caseId);
  const parsed = evaluationAttemptTraceSchema.safeParse(raw);
  if (!parsed.success)
    throw new DomainError(
      'EVAL_STATE_INVALID',
      'Saved diagnostic attempt trace is malformed.',
    );
  const trace = parsed.data;
  if (
    trace.caseId !== expected.caseId ||
    trace.sourceCommit !== expected.sourceCommit ||
    trace.sourceHash !== expected.sourceHash ||
    trace.manifestBinding !== expected.manifestBinding ||
    trace.mock !== expected.mock ||
    hash(trace.models) !== hash(expected.models) ||
    trace.projectHash !== expected.projectHash
  )
    throw new DomainError(
      'EVAL_STATE_INVALID',
      'Saved diagnostic attempt trace binding differs from current evaluation run.',
    );
  const expectedTraceHash = computeAttemptTraceHash(trace);
  if (trace.traceHash !== expectedTraceHash)
    throw new DomainError(
      'EVAL_STATE_INVALID',
      'Saved diagnostic attempt trace hash mismatch.',
    );
  const allowedModels = new Set([
    trace.models.event,
    trace.models.story,
    trace.models.check,
  ]);
  for (let i = 0; i < trace.attempts.length; i++) {
    const attempt = trace.attempts[i]!;
    if (attempt.ordinal !== i)
      throw new DomainError(
        'EVAL_STATE_INVALID',
        'Diagnostic attempt trace ordinals must be contiguous from zero without duplicates.',
      );
    if (attempt.caseId !== trace.caseId)
      throw new DomainError(
        'EVAL_STATE_INVALID',
        'Diagnostic attempt record caseId does not match trace caseId.',
      );
    if (!allowedModels.has(attempt.model))
      throw new DomainError(
        'EVAL_STATE_INVALID',
        'Diagnostic attempt record model does not match bound evaluation models.',
      );
    if (attempt.output === null) {
      if (attempt.outputHash !== null || attempt.status === 'completed')
        throw new DomainError(
          'EVAL_STATE_INVALID',
          'Null attempt output cannot have an outputHash or completed status.',
        );
    } else {
      if (attempt.outputHash !== hash(attempt.output))
        throw new DomainError(
          'EVAL_STATE_INVALID',
          'Diagnostic attempt record outputHash does not match its parsed output.',
        );
    }
    if (attempt.status === 'completed') {
      if (attempt.errorCode !== null || attempt.usage === null)
        throw new DomainError(
          'EVAL_STATE_INVALID',
          'Completed diagnostic attempt must have usage and no errorCode.',
        );
    } else if (attempt.errorCode === null) {
      throw new DomainError(
        'EVAL_STATE_INVALID',
        'Non-completed diagnostic attempt must record an errorCode.',
      );
    }
  }
  assertNoSecretsInTrace(trace, env);
  return trace;
}

export function verifyTraceMatchesReceipts(
  trace: EvaluationAttemptTrace,
  receipts: readonly AiReceipt[],
  options: { requireExactCompletedCount?: boolean } = {},
) {
  const completed = trace.attempts.filter((a) => a.status === 'completed');
  if (
    options.requireExactCompletedCount !== false
      ? completed.length !== receipts.length
      : completed.length < receipts.length
  )
    throw new DomainError(
      'EVAL_STATE_INVALID',
      'Diagnostic attempt trace count does not match recorded receipts.',
    );
  let cursor = 0;
  for (const receipt of receipts) {
    let matched = false;
    while (cursor < completed.length) {
      const candidate = completed[cursor]!;
      cursor++;
      if (
        candidate.task === receipt.task &&
        candidate.model === receipt.model &&
        candidate.inputHash === receipt.inputHash &&
        candidate.outputHash === receipt.outputHash &&
        candidate.requestId === (receipt.requestId ?? null) &&
        candidate.usage?.inputTokens === receipt.inputTokens &&
        candidate.usage?.outputTokens === receipt.outputTokens &&
        candidate.usage?.cachedInputTokens === (receipt.cachedInputTokens ?? 0)
      ) {
        matched = true;
        break;
      }
    }
    if (!matched)
      throw new DomainError(
        'EVAL_STATE_INVALID',
        'Diagnostic attempt trace does not match recorded provider receipt.',
      );
  }
}

export function readAttemptTrace(
  outDir: string,
  expected: AttemptTraceBinding,
  env: Record<string, string | undefined> = {},
): EvaluationAttemptTrace | null {
  const filePath = attemptTracePath(outDir, expected.caseId);
  if (!existsSync(filePath)) return null;
  assertSafeRegularTraceFile(filePath);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    throw new DomainError(
      'EVAL_STATE_INVALID',
      'Saved diagnostic attempt trace contains invalid JSON.',
    );
  }
  return verifyAttemptTrace(raw, expected, env);
}

export async function writeAttemptTraceAtomically(
  outDir: string,
  trace: Omit<EvaluationAttemptTrace, 'traceHash'>,
  expected: AttemptTraceBinding,
  env: Record<string, string | undefined> = {},
): Promise<EvaluationAttemptTrace> {
  const dir = attemptTraceDir(outDir);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const dirStat = lstatSync(dir);
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory())
    throw new DomainError(
      'EVAL_OUTPUT_INVALID',
      'Diagnostic attempts path must be a non-symlink directory.',
    );
  await chmod(dir, 0o700);
  const filePath = attemptTracePath(outDir, expected.caseId);
  if (existsSync(filePath)) assertSafeRegularTraceFile(filePath);

  const complete: EvaluationAttemptTrace = {
    ...trace,
    traceHash: computeAttemptTraceHash(trace),
  };
  const verified = verifyAttemptTrace(complete, expected, env);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const relTmp = relative(dir, tmpPath);
  if (!relTmp || relTmp.startsWith('..') || isAbsolute(relTmp))
    throw new DomainError(
      'EVAL_OUTPUT_INVALID',
      'Temporary diagnostic trace path escaped directory.',
    );
  if (existsSync(tmpPath))
    throw new DomainError(
      'EVAL_OUTPUT_INVALID',
      'Temporary diagnostic trace file already exists.',
    );

  const handle = await open(tmpPath, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(verified, null, 2) + '\n', 'utf8');
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(tmpPath).catch(() => {});
    throw error;
  }
  await handle.close();
  await chmod(tmpPath, 0o600);
  await rename(tmpPath, filePath);
  await chmod(filePath, 0o600);
  assertSafeRegularTraceFile(filePath);
  return verified;
}

export async function appendEvaluationAttempt(
  outDir: string,
  binding: AttemptTraceBinding,
  attemptInput: Omit<EvaluationAttemptRecord, 'caseId' | 'ordinal'>,
  env: Record<string, string | undefined> = {},
): Promise<EvaluationAttemptTrace> {
  const existing = readAttemptTrace(outDir, binding, env);
  const ordinal = existing ? existing.attempts.length : 0;
  const record: EvaluationAttemptRecord = {
    caseId: binding.caseId,
    ordinal,
    ...attemptInput,
  };
  const nextTrace: Omit<EvaluationAttemptTrace, 'traceHash'> = {
    version: '1.0.0',
    caseId: binding.caseId,
    sourceCommit: binding.sourceCommit,
    sourceHash: binding.sourceHash,
    manifestBinding: binding.manifestBinding,
    mock: binding.mock,
    models: binding.models,
    projectHash: binding.projectHash,
    attempts: [...(existing?.attempts ?? []), record],
  };
  return writeAttemptTraceAtomically(outDir, nextTrace, binding, env);
}

export function verifyTraceCoversCheckpointReceipts(
  outDir: string,
  binding: AttemptTraceBinding,
  checkpointReceipts: unknown,
  env: Record<string, string | undefined> = {},
) {
  const receipts = Array.isArray(checkpointReceipts)
    ? (checkpointReceipts as AiReceipt[])
    : [];
  const trace = readAttemptTrace(outDir, binding, env);
  if (!trace) {
    if (receipts.length > 0)
      throw new DomainError(
        'EVAL_STATE_INVALID',
        'Missing diagnostic attempt trace for checkpointed provider receipts.',
      );
    return;
  }
  if (receipts.length > 0) {
    verifyTraceMatchesReceipts(trace, receipts, {
      requireExactCompletedCount: false,
    });
  }
}

export function verifyExistingEvaluationAttempts(
  outDir: string,
  baseBinding: Omit<AttemptTraceBinding, 'caseId'>,
  transports: readonly AttemptTransportSummary[],
  samples: readonly AttemptSampleSummary[],
  env: Record<string, string | undefined> = {},
): Map<string, EvaluationAttemptTrace> {
  const dir = attemptTraceDir(outDir);
  const traces = new Map<string, EvaluationAttemptTrace>();
  if (existsSync(dir)) {
    const entries = readdirSync(dir);
    for (const name of entries) {
      if (!name.endsWith('.json'))
        throw new DomainError(
          'EVAL_OUTPUT_INVALID',
          'Unexpected non-JSON file in diagnostic-attempts directory.',
        );
      const filePath = join(dir, name);
      assertSafeRegularTraceFile(filePath);
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(filePath, 'utf8'));
      } catch {
        throw new DomainError(
          'EVAL_STATE_INVALID',
          'Saved diagnostic attempt trace contains invalid JSON.',
        );
      }
      const caseId =
        raw &&
        typeof raw === 'object' &&
        typeof (raw as { caseId?: unknown }).caseId === 'string'
          ? (raw as { caseId: string }).caseId
          : '';
      if (!caseId || safeAttemptCaseFileName(caseId) !== name)
        throw new DomainError(
          'EVAL_STATE_INVALID',
          'Diagnostic attempt trace filename does not match its bound caseId.',
        );
      const verified = verifyAttemptTrace(raw, { ...baseBinding, caseId }, env);
      if (traces.has(caseId))
        throw new DomainError(
          'EVAL_STATE_INVALID',
          'Duplicate diagnostic attempt trace for caseId.',
        );
      traces.set(caseId, verified);
    }
  }

  const transportsByCase = new Map<string, AttemptTransportSummary[]>();
  for (const t of transports) {
    const list = transportsByCase.get(t.caseId) ?? [];
    list.push(t);
    transportsByCase.set(t.caseId, list);
  }

  for (const [caseId, caseTransports] of transportsByCase.entries()) {
    const trace = traces.get(caseId);
    if (!trace)
      throw new DomainError(
        'EVAL_STATE_INVALID',
        `Missing diagnostic attempt trace for recorded transport calls (${caseId}).`,
      );
    if (trace.attempts.length !== caseTransports.length)
      throw new DomainError(
        'EVAL_STATE_INVALID',
        `Diagnostic attempt trace length differs from transport records (${caseId}).`,
      );
    for (let i = 0; i < caseTransports.length; i++) {
      if (trace.attempts[i]!.task !== caseTransports[i]!.task)
        throw new DomainError(
          'EVAL_STATE_INVALID',
          `Diagnostic attempt task order differs from transport records (${caseId}).`,
        );
    }
  }

  for (const [caseId, trace] of traces.entries()) {
    const caseTransports = transportsByCase.get(caseId) ?? [];
    if (trace.attempts.length !== caseTransports.length)
      throw new DomainError(
        'EVAL_STATE_INVALID',
        `Diagnostic attempt trace has unrecorded transport attempts (${caseId}).`,
      );
  }

  for (const sample of samples) {
    const caseId = sampleCaseId(sample);
    const trace = traces.get(caseId);
    if (!trace)
      throw new DomainError(
        'EVAL_STATE_INVALID',
        `Completed sample is missing its diagnostic attempt trace (${caseId}).`,
      );
    if (trace.attempts.length !== sample.transportCalls)
      throw new DomainError(
        'EVAL_STATE_INVALID',
        `Completed sample transport call count differs from attempt trace (${caseId}).`,
      );
    verifyTraceMatchesReceipts(trace, sample.receipts, {
      requireExactCompletedCount: false,
    });
  }

  return traces;
}

export function wrapEvaluationParse<
  TParams extends { model: string },
  TResponse extends {
    status?: string;
    model?: string;
    output_parsed?: unknown;
    usage?: unknown;
    _request_id?: string | null;
  },
>(config: {
  outDir: string;
  binding: AttemptTraceBinding;
  env: Record<string, string | undefined>;
  transports: AttemptTransportSummary[];
  saveTransports: () => Promise<void>;
  execute: (parameters: TParams, ordinal: number) => Promise<TResponse>;
}) {
  return async (parameters: TParams): Promise<TResponse> => {
    const existing = readAttemptTrace(
      config.outDir,
      config.binding,
      config.env,
    );
    const ordinal = existing ? existing.attempts.length : 0;
    const { task, parsedUserInput, inputHash, requestHash } =
      parseSyntheticRequestMessages(parameters);
    const repairFeedback = extractAttemptRepairFeedback(
      parsedUserInput,
      config.env,
    );
    const started = Date.now();
    try {
      const response = await config.execute(parameters, ordinal);
      const latencyMs = Math.max(0, Date.now() - started);
      const responseModel =
        typeof response.model === 'string' && response.model.trim()
          ? response.model
          : parameters.model;
      const usage = normalizeUsage(response.usage) ?? {
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
      };
      const requestId = normalizeRequestId(response._request_id, config.env);

      let status: EvaluationAttemptRecord['status'] = 'completed';
      let errorCode: string | null = null;
      let output: unknown = null;
      let outputHash: string | null = null;

      if (
        response.status !== 'completed' ||
        response.output_parsed === undefined ||
        response.output_parsed === null
      ) {
        status = 'incomplete';
        errorCode = 'AI_INCOMPLETE_OR_REFUSED';
      } else {
        const rawFormat = (
          parameters as {
            text?: { format?: { $parseRaw?: (raw: string) => unknown } };
          }
        ).text?.format;
        const normalized = normalizeParsedProviderOutput(
          task,
          response.output_parsed,
          rawFormat,
        );
        output = normalized.output;
        outputHash = normalized.outputHash;
        if (normalized.malformed) {
          status = 'malformed';
          errorCode = 'AI_INVALID_SCHEMA';
        }
      }

      config.transports.push({
        caseId: config.binding.caseId,
        task,
        latencyMs,
      });
      await config.saveTransports();
      await appendEvaluationAttempt(
        config.outDir,
        config.binding,
        {
          task,
          model: responseModel,
          requestHash,
          inputHash,
          outputHash,
          output,
          status,
          errorCode,
          usage,
          requestId,
          latencyMs,
          repairFeedback,
        },
        config.env,
      );
      return response;
    } catch (error) {
      const latencyMs = Math.max(0, Date.now() - started);
      const rawReqId =
        error && typeof error === 'object'
          ? ((error as { request_id?: unknown; requestId?: unknown })
              .request_id ?? (error as { requestId?: unknown }).requestId)
          : null;
      config.transports.push({
        caseId: config.binding.caseId,
        task,
        latencyMs,
      });
      await config.saveTransports();
      await appendEvaluationAttempt(
        config.outDir,
        config.binding,
        {
          task,
          model: parameters.model,
          requestHash,
          inputHash,
          outputHash: null,
          output: null,
          status: 'failed',
          errorCode: classifyFailedAttemptError(error),
          usage: null,
          requestId: normalizeRequestId(rawReqId, config.env),
          latencyMs,
          repairFeedback,
        },
        config.env,
      );
      throw error;
    }
  };
}
