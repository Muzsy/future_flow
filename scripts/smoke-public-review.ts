import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import {
  OpenAiProvider,
  ExperimentAiBudget,
  type AiRequestGuard,
} from '@future-flow/ai';
import {
  DomainError,
  hash,
  validatePublicReviewInput,
} from '@future-flow/core';

// Reuses an immutable, genuinely AI-generated synthetic English story; generates no new life.
// This is provider/PII evidence, separate from the isolated repository/HTTP tests.
async function main() {
  const path = '.local/ai-smoke/public-review/result.json';
  if (existsSync(path))
    throw new DomainError(
      'SMOKE_CASE_EXISTS',
      'The completed review sample is immutable.',
    );
  const source = readFileSync('docs/examples/AI_V2_ENGLISH_STORY.md', 'utf8');
  const chapters = [
    ...source.matchAll(/^## ([^\r\n]+)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm),
  ];
  assert.equal(chapters.length, 3);
  const input = validatePublicReviewInput({
    policyVersion: 'public-review-1',
    locale: 'en',
    fields: chapters.flatMap((c, i) => [
      {
        key: `field-${i * 2 + 1}`,
        path: `period-${i + 1}.chapter.title`,
        text: c[1]!.replace(/^\d+\. /, ''),
      },
      {
        key: `field-${i * 2 + 2}`,
        path: `period-${i + 1}.chapter.body`,
        text: c[2]!.trim(),
      },
    ]),
  });
  const ledger = '.local/ai-smoke/usage.json';
  if (!existsSync(ledger))
    throw new DomainError(
      'SMOKE_BUDGET_CONFIG',
      'Existing cumulative ledger required.',
    );
  const before = JSON.parse(readFileSync(ledger, 'utf8'));
  const budget = new ExperimentAiBudget(
    ledger,
    5,
    'public-review-english-negative-control',
  );
  let reserved = 0;
  const guard: AiRequestGuard = {
    reserve: async (raw) => {
      const p = raw as { model: string; max_output_tokens: number };
      assert.equal(p.model, 'gpt-6.1-sol');
      const bound =
        ((Buffer.byteLength(JSON.stringify(raw), 'utf8') + 4096) * 2.5 +
          p.max_output_tokens * 10) /
        1e6;
      if (reserved + bound > 0.25)
        throw new DomainError(
          'SMOKE_BUDGET_EXCEEDED',
          'This sample is limited to 0.25 USD reserved.',
        );
      reserved += bound;
      return budget.reserve(raw);
    },
    settle: (id, usage) => budget.settle(id, usage),
  };
  try {
    const ai = new OpenAiProvider({
      apiKey: process.env.OPENAI_API_KEY ?? '',
      eventModel: 'gpt-6.1-sol',
      storyModel: 'gpt-6.1-sol',
      checkModel: 'gpt-6.1-sol',
      timeoutMs: 90000,
      maxOutputTokens: 2200,
      guard,
    });
    const result = await ai.reviewPublicCopy(input);
    // The original story deliberately retains synthetic exact finances and a city.
    assert.notEqual(result.output.verdict, 'no_findings');
    assert(
      result.output.findings.some((f) =>
        [
          'private_financial',
          'precise_location',
          'identifying_combination',
        ].includes(f.category),
      ),
    );
    const after = JSON.parse(readFileSync(ledger, 'utf8')),
      calls = after.calls.slice(before.calls.length);
    const evidence = {
      sourceHash: hash(source),
      sourceSample: 'AI_V2_ENGLISH_STORY.md',
      result,
      fields: input.fields.map(({ key, path }) => ({ key, path })),
      paidCalls: calls.length,
      guardUsd: calls.reduce(
        (n: number, c: { accountedUsd: number }) => n + c.accountedUsd,
        0,
      ),
      estimatedUsd: calls.reduce(
        (n: number, c: { estimatedUsd?: number }) => n + (c.estimatedUsd ?? 0),
        0,
      ),
      remainingUsd: 5 - after.accountedUsd,
      publicationApproved: false,
    };
    mkdirSync('.local/ai-smoke/public-review', { recursive: true });
    writeFileSync(path, JSON.stringify(evidence, null, 2) + '\n');
    console.log(
      JSON.stringify({
        smoke: 'passed',
        verdict: result.output.verdict,
        findings: result.output.findings.length,
        paidCalls: evidence.paidCalls,
        guardUsd: evidence.guardUsd,
        remainingUsd: evidence.remainingUsd,
        publicationApproved: false,
      }),
    );
  } finally {
    budget.close();
  }
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      smoke: 'failed',
      code:
        error instanceof DomainError
          ? error.code
          : 'PUBLIC_REVIEW_SMOKE_FAILED',
    }),
  );
  process.exitCode = 1;
});
