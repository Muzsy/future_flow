import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { hash } from '@future-flow/core';
import { narrativeDimensions } from '@future-flow/contracts';
import {
  blindOrder,
  assessHumanRatings,
  percentile95,
  type BlindPair,
} from './narrative-evaluation-contract';
import type {
  EvaluationRun,
  EvaluationSample,
} from './narrative-evaluation-runner';
import { narrativeProfiles } from '../../tests/narrative-fixtures';
import {
  evaluationCostReport,
  evaluationNarrativeYield,
  type ExperimentalCall,
  type EvaluationBudgetBinding,
} from './narrative-evaluation-costs';
import type { EvaluationOptions } from './narrative-evaluation-options';
const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const paragraphs = (body: string) =>
  body.split(/\n\s*\n/).filter((p) => p.trim());
export function evaluationPairs(run: EvaluationRun, seed: string) {
  const pairs: {
    key: BlindPair;
    sampleA: EvaluationSample;
    sampleB: EvaluationSample;
  }[] = [];
  for (const legacy of run.samples.filter((s) => s.mode === 'legacy')) {
    const narrative = run.samples.find(
      (s) =>
        s.mode === 'narrative-v1' &&
        s.fixtureId === legacy.fixtureId &&
        s.periodIndex === legacy.periodIndex &&
        s.kind === legacy.kind,
    );
    if (!narrative) continue;
    const pairId = `${legacy.kind}:${legacy.fixtureId}:${legacy.periodIndex}`,
      [modeA, modeB] = blindOrder(seed, pairId);
    const sampleA = modeA === 'legacy' ? legacy : narrative,
      sampleB = modeB === 'legacy' ? legacy : narrative;
    const pairHash = hash({
      pairId,
      sourceHash: run.sourceHash,
      chapterA: sampleA.chapter,
      prefixA: sampleA.prefix,
      chapterB: sampleB.chapter,
      prefixB: sampleB.prefix,
    });
    pairs.push({
      key: {
        pairId,
        pairHash,
        kind: legacy.kind,
        fixtureId: legacy.fixtureId,
        periodIndex: legacy.periodIndex,
        modeA,
        modeB,
        paragraphsA: paragraphs(sampleA.chapter.body).length,
        paragraphsB: paragraphs(sampleB.chapter.body).length,
      },
      sampleA,
      sampleB,
    });
  }
  return pairs;
}
function manuscript(side: 'A' | 'B', sample: EvaluationSample) {
  const prefix = sample.prefix
    .map(
      (p) =>
        `<h4>${escape(p.title)}</h4>${paragraphs(p.body)
          .map((t) => `<p>${escape(t)}</p>`)
          .join('')}`,
    )
    .join('');
  const choice = sample.choiceMappings.at(-1) as
    { label?: string; description?: string } | undefined;
  return `<section><h2>Story ${side}</h2>${choice?.label ? `<p><strong>Previously accepted choice:</strong> ${escape(choice.label)}. ${escape(choice.description ?? '')}</p>` : ''}${prefix ? `<details><summary>Earlier chapters for this story</summary>${prefix}</details>` : ''}<h3>${escape(sample.chapter.title)}</h3>${paragraphs(
    sample.chapter.body,
  )
    .map((p, i) => `<p><span class="number">${i + 1}</span>${escape(p)}</p>`)
    .join('')}</section>`;
}
export async function writeEvaluationArtifacts(
  run: EvaluationRun,
  options: EvaluationOptions,
) {
  const pairs = evaluationPairs(run, options.seed),
    directory = join(options.out, 'human-review');
  await mkdir(directory, { recursive: true });
  const links: string[] = [];
  for (const pair of pairs) {
    const filename = hash(pair.key.pairId).slice(0, 20) + '.html';
    links.push(`<li><a href="${filename}">${escape(pair.key.pairId)}</a></li>`);
    const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blind story comparison</title><style>body{max-width:900px;margin:30px auto;padding:0 22px;color:#203328;background:#fafaf6;font:18px/1.7 Georgia,serif}section{margin:40px 0;border-top:1px solid #bcc9bf}p{margin:1em 0}.number{color:#63756b;font:12px sans-serif;margin-right:14px}details{font-size:16px}code{overflow-wrap:anywhere}</style><h1>Which story would you keep reading?</h1><p>${run.mock ? 'Technical mock manuscripts: these cannot prove literary quality.' : 'Independent human evaluation: modes, models and editorial grades are hidden.'}</p><p>Score causality, momentum, scene craft, character, personalization, choice stakes, novelty and prose from 1 to 5. Do not reward padding. Select A, B or a tie, and cite a numbered paragraph with a specific reason.</p><p>Fictional goal: ${escape(narrativeProfiles.find((p) => p.id === pair.key.fixtureId)!.goal)}. Initial weekly time boundary: ${narrativeProfiles.find((p) => p.id === pair.key.fixtureId)!.hours} hours. Financial figures remain unknown.</p><p>Pair: ${escape(pair.key.pairId)} · Snapshot: <code>${pair.key.pairHash}</code></p>${manuscript('A', pair.sampleA)}${manuscript('B', pair.sampleB)}</html>`;
    await writeFile(join(directory, filename), page);
  }
  await writeFile(
    join(directory, 'index.html'),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Alterward independent story review</title><h1>Story review corpus</h1><p>${run.mock ? 'Offline structural samples, not literary evidence.' : 'Read both versions and their earlier chapters before grading.'}</p><ul>${links.join('')}</ul>`,
  );
  const template = pairs.map(({ key }) => ({
    pairId: key.pairId,
    pairHash: key.pairHash,
    reviewerId: '',
    preferred: null,
    scoresA: Object.fromEntries(narrativeDimensions.map((d) => [d, null])),
    scoresB: Object.fromEntries(narrativeDimensions.map((d) => [d, null])),
    reasons: [{ side: null, paragraphIndex: null, reason: '' }],
  }));
  await writeFile(
    join(directory, 'ratings-template.json'),
    JSON.stringify(template, null, 2) + '\n',
  );
  // Keep this outside the blinded handout; no model/mode key reaches reviewers.
  await writeFile(
    join(options.out, 'blind-key.json'),
    JSON.stringify(
      pairs.map((p) => p.key),
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  await writeFile(
    join(options.out, 'choice-review-requests.json'),
    JSON.stringify(run.choiceReviewRequests, null, 2) + '\n',
  );
  const actualTransports = JSON.parse(
    await readFile(join(options.out, 'transport-records.json'), 'utf8'),
  ) as unknown[];
  const summary = {
    version: run.version,
    mock: run.mock,
    sourceCommit: run.sourceCommit,
    complete: run.complete,
    samples: run.samples.length,
    fullPairs: pairs.filter((p) => p.key.kind === 'full').length,
    fixedCanonPairs: pairs.filter((p) => p.key.kind === 'fixed-canon').length,
    forkPairs: pairs.filter((p) => p.key.kind === 'fork').length,
    failures: run.failures.map((f) => ({ caseId: f.caseId, code: f.code })),
    choiceReviewsRequired: run.choiceReviewRequests.length,
    completedSampleAdmittedRequests: run.samples.reduce(
      (n, s) => n + s.requestCount,
      0,
    ),
    completedSampleTransportCalls: run.samples.reduce(
      (n, s) => n + s.transportCalls,
      0,
    ),
    // Include failed/unknown transports too; successful manuscripts alone undercount.
    transportCalls: actualTransports.length,
    repairRate: run.samples.length
      ? run.samples.filter((s) => s.repairUsed).length / run.samples.length
      : null,
    p95GenerationMs: run.mock
      ? null
      : percentile95(
          run.samples.filter((s) => s.kind === 'full').map((s) => s.elapsedMs),
        ),
    accounting: run.accounting,
    narrativeYield: run.mock
      ? null
      : evaluationNarrativeYield(run.accounting, run.samples),
    ...(run.variant ? { variant: run.variant } : {}),
    ...(run.diagnosticOnly ? { diagnosticOnly: true } : {}),
    qualityRelease: false,
    reason:
      'Independent human grades, semantic choice review, complete paid samples and owner-set cost/time limits are required.',
  };
  await writeFile(
    join(options.out, 'summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
  );
  return summary;
}
export async function assessEvaluationArtifacts(options: EvaluationOptions) {
  const run = JSON.parse(
    await readFile(join(options.out, 'report.json'), 'utf8'),
  ) as EvaluationRun;
  const pairs = JSON.parse(
    await readFile(join(options.out, 'blind-key.json'), 'utf8'),
  ) as BlindPair[];
  const expected = evaluationPairs(run, options.seed).map((p) => p.key);
  if (hash(expected) !== hash(pairs))
    throw new Error(
      'The blind corpus no longer matches its saved manuscript snapshots.',
    );
  const raw = JSON.parse(await readFile(resolve(options.ratingsFile!), 'utf8'));
  const narrativeSamples = run.samples.filter(
    (s) => s.mode === 'narrative-v1' && s.kind === 'full',
  );
  // Read the durable global ledger again; a copied report is not financial authority.
  if (!run.mock) {
    const ledger = JSON.parse(
      await readFile(
        resolve('.local/narrative-evaluation/paid-usage.json'),
        'utf8',
      ),
    ) as { calls: ExperimentalCall[] };
    const bindings = JSON.parse(
      await readFile(
        resolve('.local/narrative-evaluation/budget-bindings.json'),
        'utf8',
      ),
    ) as Record<string, EvaluationBudgetBinding>;
    run.accounting = evaluationCostReport(
      ledger.calls,
      bindings,
      run.sourceHash,
    );
  }
  const yieldReport = evaluationNarrativeYield(run.accounting, run.samples);
  const meanCostUsd = yieldReport?.accountedUsdPerGateAcceptedChapter ?? NaN;
  const p95Ms = percentile95(narrativeSamples.map((s) => s.elapsedMs)) ?? NaN;
  const allChoiceMappingsReviewed = run.samples.every((s) =>
    s.choiceMappings.every(
      (raw) => !!(raw as { reviewed?: boolean })?.reviewed,
    ),
  );
  const operations =
    options.maxMeanCostUsd !== null && options.maxP95Ms !== null
      ? {
          meanCostUsd,
          p95Ms,
          maxMeanCostUsd: options.maxMeanCostUsd,
          maxP95Ms: options.maxP95Ms,
          allChoiceMappingsReviewed,
          hardFailures:
            run.failures.length +
            (run.accounting?.unassignedReservations ?? 1) +
            (run.accounting?.currentSourceUnknownUsageCalls ?? 1) +
            (run.safetyProbe.passed ? 0 : 1),
        }
      : undefined;
  const assessment = assessHumanRatings(
    pairs,
    raw,
    !run.mock && run.complete && !run.diagnosticOnly,
    operations,
  );
  await writeFile(
    join(options.out, 'human-assessment.json'),
    JSON.stringify(assessment, null, 2) + '\n',
  );
  return assessment;
}
