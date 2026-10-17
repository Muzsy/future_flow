import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { hash } from '@future-flow/core';
import { narrativeDimensions } from '@future-flow/contracts';
import {
  parseEvaluationOptions,
  verifyEvaluationAuthorization,
} from '../scripts/lib/narrative-evaluation-options';
import {
  choiceOverrideSchema,
  assessHumanRatings,
  creativeSequenceHumanRatingSchema,
  buildCreativeSequenceBundles,
  assessCreativeSequenceRatings,
  type BlindPair,
  type HumanRating,
  type CreativeSequenceHumanRating,
  type CreativeSequenceSampleInput,
} from '../scripts/lib/narrative-evaluation-contract';
import { runNarrativeEvaluation } from '../scripts/lib/narrative-evaluation-runner';
import {
  writeEvaluationArtifacts,
  assessEvaluationArtifacts,
} from '../scripts/lib/narrative-evaluation-artifacts';

function syntheticSample(
  fixtureId: string,
  periodIndex: number,
  kind: 'full' | 'fork' = 'full',
  prefix: { title: string; body: string }[] = [],
): CreativeSequenceSampleInput {
  return {
    id: `${kind}:${fixtureId}:narrative-v1:${periodIndex}`,
    fixtureId,
    mode: 'narrative-v1',
    kind,
    periodIndex,
    chapter: {
      title: `Chapter ${fixtureId} ${kind} ${periodIndex + 1}`,
      body: `First paragraph of ${fixtureId} ${kind} period ${periodIndex + 1}.\n\nSecond paragraph with concrete action and consequence.`,
    },
    prefix,
    choiceMappings:
      periodIndex > 0
        ? [
            {
              label:
                kind === 'fork'
                  ? 'Try the alternative studio arrangement'
                  : 'Continue the current workshop schedule',
              description:
                kind === 'fork'
                  ? 'Shift to the shared bench and test outside feedback.'
                  : 'Keep the morning slot and refine the current sequence.',
              reviewed: false,
              selection: 'diagnostic-index',
            },
          ]
        : [],
    errorCode: null,
  };
}

function buildHorizonCorpus(periods: 3 | 6) {
  const fixtures = ['bounded-career', 'creative-portfolio'] as const;
  const samples: CreativeSequenceSampleInput[] = [];
  for (const fixtureId of fixtures) {
    const full: CreativeSequenceSampleInput[] = [];
    for (let i = 0; i < periods; i++) {
      const prefix = full.map((s) => s.chapter);
      const sample = syntheticSample(fixtureId, i, 'full', prefix);
      full.push(sample);
      samples.push(sample);
    }
    if (fixtureId === 'bounded-career') {
      samples.push(
        syntheticSample(
          fixtureId,
          2,
          'fork',
          full.slice(0, 2).map((s) => s.chapter),
        ),
      );
    }
  }
  return buildCreativeSequenceBundles(
    samples,
    hash(`source-${periods}`),
    'seed-v4',
  );
}

function baseScores(
  overrides: Partial<CreativeSequenceHumanRating['scores']> = {},
) {
  return {
    humanProse: 4,
    immersion: 4,
    continuationDesire: 4,
    npcAutonomy: 4,
    protagonistHumanity: 4,
    structuralVariety: 4,
    emotionalRange: 4,
    systemInvisibility: 4,
    continuity: 4,
    ...overrides,
  };
}

describe('creative fiction long-horizon and human sequence evaluation (HQ7/HQ8)', () => {
  it('allows up to six periods only in creative-only mode and keeps all legacy/paired contracts at most three', () => {
    expect(() => parseEvaluationOptions(['--periods', '4'])).toThrow(
      'one to three periods',
    );
    expect(() => parseEvaluationOptions(['--periods', '6'])).toThrow(
      'one to three periods',
    );
    expect(() =>
      parseEvaluationOptions(['--creative', '--periods', '4']),
    ).toThrow('one to three periods');
    expect(() =>
      parseEvaluationOptions(['--creative', '--periods', '6']),
    ).toThrow('one to three periods');
    expect(() =>
      parseEvaluationOptions(['--creative-only', '--periods', '0']),
    ).toThrow('one to six periods');
    expect(() =>
      parseEvaluationOptions(['--creative-only', '--periods', '7']),
    ).toThrow('one to six periods');

    const creativeSix = parseEvaluationOptions([
      '--creative-only',
      '--fixtures',
      'bounded-career',
      '--periods',
      '6',
    ]);
    expect(creativeSix.creative).toBe(true);
    expect(creativeSix.creativeOnly).toBe(true);
    expect(creativeSix.periods).toBe(6);
    expect(() => verifyEvaluationAuthorization(creativeSix, {})).not.toThrow();
    expect(() =>
      verifyEvaluationAuthorization(
        { ...creativeSix, creativeOnly: undefined },
        {},
      ),
    ).toThrow('one to three periods');

    const assessSeq = parseEvaluationOptions([
      '--mode',
      'assess',
      '--sequence-ratings',
      'seq-ratings.json',
    ]);
    expect(assessSeq.sequenceRatingsFile).toBe('seq-ratings.json');
    expect(() => verifyEvaluationAuthorization(assessSeq, {})).not.toThrow();

    expect(() =>
      choiceOverrideSchema.parse({
        fixtureId: 'bounded-career',
        mode: 'narrative-v1',
        periodIndex: 3,
        branchKind: 'main',
        optionId: '00000000-0000-4000-8000-000000000001',
        decisionHash: hash('decision'),
        intent: 'bounded-follow-up',
        rationale:
          'Legacy and paired choice overrides remain strictly limited to periods 0..2.',
        reviewed: true,
      }),
    ).toThrow();
  });

  it('validates creativeSequenceHumanRatingSchema, sequenceHash, sample ownership, paragraph bounds and duplicate reviewers', () => {
    const bundles = buildHorizonCorpus(3);
    expect(bundles).toHaveLength(3);
    const mainBundle = bundles.find(
      (b) => b.fixtureId === 'bounded-career' && b.kind === 'main',
    )!;
    const branchBundle = bundles.find(
      (b) => b.fixtureId === 'bounded-career' && b.kind === 'branch',
    )!;
    const otherBundle = bundles.find(
      (b) => b.fixtureId === 'creative-portfolio' && b.kind === 'main',
    )!;

    const validMain: CreativeSequenceHumanRating =
      creativeSequenceHumanRatingSchema.parse({
        sequenceId: mainBundle.sequenceId,
        sequenceHash: mainBundle.sequenceHash,
        reviewerId: 'reader-1',
        reviewerKind: 'human',
        scores: baseScores(),
        aiSuspicion: 'unlikely',
        flags: [],
        evidence: [
          {
            sampleId: mainBundle.chapters[0]!.sampleId,
            paragraphIndex: 2,
            reason:
              'The opening workshop misunderstanding creates a natural next step.',
          },
        ],
        overall: 'beta',
      });
    expect(validMain.reviewerKind).toBe('human');

    // Unknown sequenceId
    expect(() =>
      assessCreativeSequenceRatings(bundles, [
        { ...validMain, sequenceId: 'sequence:unknown:main:3' },
      ]),
    ).toThrow('Unknown');

    // Hash mismatch
    expect(() =>
      assessCreativeSequenceRatings(bundles, [
        { ...validMain, sequenceHash: hash('tampered-sequence') },
      ]),
    ).toThrow('hash-mismatched');

    // Duplicate reviewer + sequence
    expect(() =>
      assessCreativeSequenceRatings(bundles, [validMain, validMain]),
    ).toThrow('duplicate');

    // Same reviewer mixing human and diagnostic-ai
    expect(() =>
      assessCreativeSequenceRatings(bundles, [
        validMain,
        {
          ...validMain,
          sequenceId: otherBundle.sequenceId,
          sequenceHash: otherBundle.sequenceHash,
          reviewerKind: 'diagnostic-ai',
          evidence: [
            {
              sampleId: otherBundle.chapters[0]!.sampleId,
              paragraphIndex: 1,
              reason:
                'Diagnostic AI pass over the second sequence with valid paragraph.',
            },
          ],
        },
      ]),
    ).toThrow('mix human and diagnostic-ai');

    // Sample ownership violation (citing a sample from creative-portfolio or fork on bounded-career main)
    expect(() =>
      assessCreativeSequenceRatings(bundles, [
        {
          ...validMain,
          evidence: [
            {
              sampleId: otherBundle.chapters[0]!.sampleId,
              paragraphIndex: 1,
              reason:
                'Foreign sample ID from another fixture must be rejected.',
            },
          ],
        },
      ]),
    ).toThrow('belong to the reviewed sequence');
    expect(() =>
      assessCreativeSequenceRatings(bundles, [
        {
          ...validMain,
          evidence: [
            {
              sampleId: 'fork:bounded-career:narrative-v1:2',
              paragraphIndex: 1,
              reason:
                'Fork sample does not belong to the main sequence bundle.',
            },
          ],
        },
      ]),
    ).toThrow('belong to the reviewed sequence');

    // Paragraph out-of-bounds
    expect(() =>
      assessCreativeSequenceRatings(bundles, [
        {
          ...validMain,
          evidence: [
            {
              sampleId: mainBundle.chapters[0]!.sampleId,
              paragraphIndex: 3,
              reason:
                'Paragraph 3 does not exist in the two-paragraph synthetic chapter.',
            },
          ],
        },
      ]),
    ).toThrow('beyond the saved chapter');

    // Branch bundle requires branchingValue
    expect(() =>
      assessCreativeSequenceRatings(bundles, [
        {
          ...validMain,
          sequenceId: branchBundle.sequenceId,
          sequenceHash: branchBundle.sequenceHash,
          evidence: [
            {
              sampleId: branchBundle.chapters[2]!.blindedSampleId,
              paragraphIndex: 1,
              reason:
                'Branch bundle rating without branchingValue score must fail.',
            },
          ],
        },
      ]),
    ).toThrow('branchingValue');
  });

  it('separates human vs diagnostic-ai, labels H1 three-chapter and H2 six-chapter evidence separately, and treats AI suspicion as secondary', () => {
    const h1Bundles = buildHorizonCorpus(3);
    const aiOnlyRatings: CreativeSequenceHumanRating[] = h1Bundles.map((b) => ({
      sequenceId: b.sequenceId,
      sequenceHash: b.sequenceHash,
      reviewerId: 'ai-auditor-1',
      reviewerKind: 'diagnostic-ai',
      scores: baseScores(b.kind === 'branch' ? { branchingValue: 5 } : {}),
      aiSuspicion: 'unlikely',
      flags: ['repeated_tableau_ending'],
      evidence: [
        {
          sampleId: b.chapters[0]!.sampleId,
          paragraphIndex: 1,
          reason:
            'Automated diagnostic review notes concrete opening detail and ending pattern.',
        },
      ],
      overall: 'strong_beta',
      ...(b.kind === 'branch' ? { preferredBranch: 'A' as const } : {}),
    }));

    const aiAssessment = assessCreativeSequenceRatings(
      h1Bundles,
      aiOnlyRatings,
    );
    expect(aiAssessment.humanRatings).toBe(0);
    expect(aiAssessment.diagnosticAiRatings).toBe(3);
    expect(aiAssessment.evidenceStage).toBe('diagnostic-ai-only');
    expect(aiAssessment.diagnosticAiCountsAsHumanEvidence).toBe(false);
    expect(aiAssessment.horizons.H1.minimumCoverageMet).toBe(false);
    expect(aiAssessment.horizons.H2.minimumCoverageMet).toBe(false);
    expect(aiAssessment.human.immersionMean).toBeNull();
    expect(aiAssessment.diagnosticAi.immersionMean).toBe(4);
    expect(aiAssessment.qualityRelease).toBe(false);
    expect(aiAssessment.passed).toBe(false);

    // Human H1 ratings: high prose & systemInvisibility & unlikely AI suspicion CANNOT mask weak continuationDesire
    const weakContinuationHuman: CreativeSequenceHumanRating[] = h1Bundles.map(
      (b) => ({
        sequenceId: b.sequenceId,
        sequenceHash: b.sequenceHash,
        reviewerId: 'human-reader-1',
        reviewerKind: 'human',
        scores: baseScores({
          humanProse: 5,
          systemInvisibility: 5,
          continuationDesire: 2,
          ...(b.kind === 'branch' ? { branchingValue: 4 } : {}),
        }),
        aiSuspicion: 'unlikely',
        flags: ['repeated_chapter_template'],
        evidence: [
          {
            sampleId: b.chapters[0]!.sampleId,
            paragraphIndex: 2,
            reason:
              'Sentences read cleanly, but the predictable structure lowers desire to continue.',
          },
        ],
        overall: 'not_ready',
        ...(b.kind === 'branch' ? { preferredBranch: 'B' as const } : {}),
      }),
    );
    const weakPrimary = assessCreativeSequenceRatings(
      h1Bundles,
      weakContinuationHuman,
    );
    expect(weakPrimary.evidenceStage).toBe('H1');
    expect(weakPrimary.horizons.H1.minimumCoverageMet).toBe(true);
    expect(weakPrimary.horizons.H2.minimumCoverageMet).toBe(false);
    expect(
      weakPrimary.chapterVsSequenceDivergence
        .sequencesWithContinuationOrImmersionBelowProse,
    ).toBe(3);
    expect(
      weakPrimary.chapterVsSequenceDivergence.sequencesWithRepetitionFlags,
    ).toBe(3);

    // Strong primary product goals pass primary check even if secondary aiSuspicion is 'likely'; H1 still never satisfies H2
    const strongH1Human: CreativeSequenceHumanRating[] = h1Bundles.map((b) => ({
      sequenceId: b.sequenceId,
      sequenceHash: b.sequenceHash,
      reviewerId: 'human-reader-1',
      reviewerKind: 'human',
      scores: baseScores(b.kind === 'branch' ? { branchingValue: 5 } : {}),
      aiSuspicion: 'likely',
      flags: [],
      evidence: [
        {
          sampleId: b.chapters[0]!.sampleId,
          paragraphIndex: 1,
          reason:
            'Engaging characters and genuine continuation desire across all three chapters.',
        },
      ],
      overall: 'beta',
      ...(b.kind === 'branch' ? { preferredBranch: 'A' as const } : {}),
    }));
    const h1Assessed = assessCreativeSequenceRatings(h1Bundles, [
      ...strongH1Human,
      ...aiOnlyRatings,
    ]);
    expect(h1Assessed.evidenceStage).toBe('H1');
    expect(h1Assessed.aiSuspicionIsPassCriterion).toBe(false);
    expect(h1Assessed.secondaryDiagnostics.usedAsPassCriterion).toBe(false);
    expect(h1Assessed.horizons.H2.minimumCoverageMet).toBe(false);
    expect(h1Assessed.qualityRelease).toBe(false);

    // H2 six-chapter corpus labelled separately with chapters 4-6 evidence
    const h2Bundles = buildHorizonCorpus(6);
    expect(
      h2Bundles
        .filter((b) => b.kind === 'main')
        .every((b) => b.horizon === 'H2'),
    ).toBe(true);
    const h2HumanRatings: CreativeSequenceHumanRating[] = h2Bundles.map(
      (b) => ({
        sequenceId: b.sequenceId,
        sequenceHash: b.sequenceHash,
        reviewerId: 'human-reader-h2',
        reviewerKind: 'human',
        scores: baseScores(b.kind === 'branch' ? { branchingValue: 4 } : {}),
        aiSuspicion: 'possible',
        flags: [],
        evidence: [
          {
            sampleId:
              b.kind === 'main'
                ? b.chapters[4]!.sampleId
                : b.chapters[2]!.blindedSampleId,
            paragraphIndex: 2,
            reason:
              'Chapter 5 shifts the social dynamic without repeating the earlier resolution template.',
          },
        ],
        overall: 'strong_beta',
        ...(b.kind === 'branch' ? { preferredBranch: 'A' as const } : {}),
        ...(b.horizon === 'H2'
          ? {
              lateHorizonNote:
                'Chapters 4 to 6 maintain curiosity and avoid mentor self-correction loops.',
            }
          : {}),
      }),
    );
    const h2Assessed = assessCreativeSequenceRatings(h2Bundles, h2HumanRatings);
    expect(h2Assessed.evidenceStage).toBe('H2');
    expect(h2Assessed.horizons.H2.minimumCoverageMet).toBe(true);
    expect(h2Assessed.horizons.H2.lateChapterEvidenceCount).toBe(2);
    expect(h2Assessed.horizons.H2.mainSequencesWithLateChapterEvidence).toBe(2);
    expect(h2Assessed.horizons.H1.minimumCoverageMet).toBe(false);
    expect(h2Assessed.qualityRelease).toBe(false);
    expect(h2Assessed.passed).toBe(false);
    expect(h2Assessed.humanReleaseThreshold).toBeNull();
    expect(h2Assessed.ownerThresholdDecisionRequired).toBe(true);
    const noLate = structuredClone(h2HumanRatings);
    for (const r of noLate) {
      const b = h2Bundles.find((b) => b.sequenceId === r.sequenceId)!;
      r.evidence[0]!.sampleId = b.chapters[0]!.blindedSampleId;
    }
    expect(
      assessCreativeSequenceRatings(h2Bundles, noLate).horizons.H2
        .minimumCoverageMet,
    ).toBe(false);
  });

  it('keeps the existing 34-pair human benchmark and release gate semantics unchanged (T14)', () => {
    const scores = Object.fromEntries(
      narrativeDimensions.map((d) => [d, 4]),
    ) as HumanRating['scoresA'];
    const pairs: BlindPair[] = Array.from({ length: 24 }, (_, i) => ({
      pairId: `full:fixture:${i}`,
      pairHash: hash(`pair-${i}`),
      kind: 'full',
      fixtureId: 'bounded-career',
      periodIndex: i % 3,
      modeA: 'narrative-v1',
      modeB: 'legacy',
      paragraphsA: 2,
      paragraphsB: 2,
    }));
    const rows: HumanRating[] = pairs.map((p) => ({
      pairId: p.pairId,
      pairHash: p.pairHash,
      reviewerId: 'canonical-reviewer',
      preferred: 'A',
      scoresA: { ...scores },
      scoresB: { ...scores },
      reasons: [
        {
          side: 'A',
          paragraphIndex: 1,
          reason:
            'The concrete consequence creates a clearer scene and a credible next decision.',
        },
      ],
    }));
    const operations = {
      meanCostUsd: 0.08,
      p95Ms: 15000,
      maxMeanCostUsd: 0.1,
      maxP95Ms: 30000,
      hardFailures: 0,
      allChoiceMappingsReviewed: true,
    };
    const passed = assessHumanRatings(pairs, rows, true, operations);
    expect(passed.passed).toBe(true);
    expect(passed.preference).toBe(1);
    expect(assessHumanRatings(pairs, rows, false, operations).passed).toBe(
      false,
    );
  });

  it('runs a 6-period creative-only corpus with fork, writes blinded bundle artifacts, and exposes bundle files and assessment across resumed runs', async () => {
    const out = await mkdtemp(join(tmpdir(), 'alterward-fiction-6p-'));
    try {
      const options = parseEvaluationOptions([
        '--creative-only',
        '--mode',
        'offline',
        '--fixtures',
        'bounded-career',
        '--periods',
        '6',
        '--out',
        out,
      ]);
      const run = await runNarrativeEvaluation(options);
      expect(run.diagnosticOnly).toBe(true);
      expect(run.variant).toBe('narrative-fiction-v2');
      expect(run.complete).toBe(false);
      expect(run.failures).toEqual([]);

      const fullSamples = run.samples.filter((s) => s.kind === 'full');
      const forkSamples = run.samples.filter((s) => s.kind === 'fork');
      expect(fullSamples).toHaveLength(6);
      expect(forkSamples).toHaveLength(1);
      expect(forkSamples[0]!.prefix).toHaveLength(2);
      expect(forkSamples[0]!.prefix).toEqual(
        fullSamples.slice(0, 2).map((s) => s.chapter),
      );
      expect(run.samples.every((s) => s.requestCount === 5)).toBe(true);
      expect(
        run.samples.every((s) =>
          s.choiceMappings.every(
            (m) =>
              (m as { reviewed?: boolean; selection?: string }).reviewed ===
                false &&
              (m as { selection?: string }).selection === 'diagnostic-index',
          ),
        ),
      ).toBe(true);

      // Bundle metadata and files exposed on initial run
      expect(run.sequenceBundles).toHaveLength(2);
      const mainBundle = run.sequenceBundles!.find((b) => b.kind === 'main')!;
      const branchBundle = run.sequenceBundles!.find(
        (b) => b.kind === 'branch',
      )!;
      expect(mainBundle.horizon).toBe('H2');
      expect(mainBundle.chapterCount).toBe(6);
      expect(branchBundle.horizon).toBe('H2');
      expect(branchBundle.chapterCount).toBe(4);
      expect(run.sequenceBundleFiles).toBeTruthy();

      // Verify blinded handout HTML and JSON have no editor scores, prompt versions, policy labels or model names
      for (const pagePath of run.sequenceBundleFiles!.pages) {
        const html = await readFile(pagePath, 'utf8');
        expect(html).not.toContain('narrative-fiction-v2');
        expect(html).not.toContain('narrative-v1');
        expect(html).not.toContain('life_fiction_');
        expect(html).not.toContain('gpt-6.1-sol');
        expect(html).not.toContain('qualityPolicyVersion');
        expect(html).not.toContain('sequenceSignature');
        expect(html).not.toContain('editorialReport');
      }
      const blindedJsonText = await readFile(
        run.sequenceBundleFiles!.bundlesJson,
        'utf8',
      );
      expect(blindedJsonText).not.toContain('narrative-v1');
      expect(blindedJsonText).not.toContain('branchOrder');

      // Provide sequence ratings and resume without additional transport calls
      const ratingsPath = join(out, 'seq-ratings.json');
      const ratingPayload: CreativeSequenceHumanRating[] = [
        {
          sequenceId: mainBundle.sequenceId,
          sequenceHash: mainBundle.sequenceHash,
          reviewerId: 'reader-six-period',
          reviewerKind: 'human',
          scores: baseScores({ immersion: 5, continuationDesire: 5 }),
          aiSuspicion: 'unlikely',
          flags: [],
          evidence: [
            {
              sampleId: mainBundle.chapters[5]!.sampleId,
              paragraphIndex: 1,
              reason:
                'Sixth chapter continues the consequence chain cleanly from earlier periods.',
            },
          ],
          overall: 'strong_beta',
          lateHorizonNote:
            'Chapters 4 to 6 remain coherent and preserve reader curiosity.',
        },
        {
          sequenceId: branchBundle.sequenceId,
          sequenceHash: branchBundle.sequenceHash,
          reviewerId: 'reader-six-period',
          reviewerKind: 'human',
          scores: baseScores({ branchingValue: 5 }),
          aiSuspicion: 'possible',
          flags: [],
          evidence: [
            {
              sampleId: branchBundle.chapters[2]!.blindedSampleId,
              paragraphIndex: 1,
              reason:
                'The alternative branch diverges meaningfully from the shared two-chapter prefix.',
            },
          ],
          overall: 'beta',
          preferredBranch: 'A',
        },
      ];
      await writeFile(ratingsPath, JSON.stringify(ratingPayload, null, 2));

      const resumedWithRatings = await runNarrativeEvaluation({
        ...options,
        sequenceRatingsFile: ratingsPath,
      });
      const transports = JSON.parse(
        await readFile(join(out, 'transport-records.json'), 'utf8'),
      ) as unknown[];
      expect(transports).toHaveLength(35);
      expect(resumedWithRatings.complete).toBe(false);
      expect(resumedWithRatings.sequenceBundles).toHaveLength(2);
      expect(
        resumedWithRatings.sequenceBundleFiles?.assessmentJson,
      ).toBeTruthy();
      expect(resumedWithRatings.sequenceAssessment?.humanRatings).toBe(2);
      expect(
        resumedWithRatings.sequenceAssessment?.horizons.H2
          .lateChapterEvidenceCount,
      ).toBe(1);
      expect(resumedWithRatings.sequenceAssessment?.qualityRelease).toBe(false);

      // Resuming again without sequenceRatingsFile still preserves the saved assessment and bundle files
      const resumedAgain = await runNarrativeEvaluation(options);
      expect(resumedAgain.sequenceBundles).toHaveLength(2);
      expect(resumedAgain.sequenceBundleFiles).toBeTruthy();
      expect(resumedAgain.sequenceAssessment?.humanRatings).toBe(2);

      const summary = await writeEvaluationArtifacts(resumedAgain, options);
      expect(summary.qualityRelease).toBe(false);
      expect(summary.complete).toBe(false);
      expect(summary.sequenceBundles).toBe(2);
      expect(summary.sequenceHorizon).toBe('H2');
      expect(summary.sequenceAssessment?.humanRatings).toBe(2);

      const assessed = await assessEvaluationArtifacts({
        ...options,
        kind: 'assess',
        sequenceRatingsFile: ratingsPath,
      });
      expect(assessed.qualityRelease).toBe(false);
      expect(assessed.passed).toBe(false);
      const cachedPath = join(out, 'sequence-human-assessment.json');
      const cached = JSON.parse(await readFile(cachedPath, 'utf8'));
      await writeFile(
        cachedPath,
        JSON.stringify({ ...cached, bundleSetHash: '0'.repeat(64) }),
      );
      const stale = await runNarrativeEvaluation(options);
      expect(stale.sequenceAssessment).toBeNull();
      expect(stale.sequenceBundleFiles?.assessmentJson).toBeNull();
      const afterStale = JSON.parse(
        await readFile(join(out, 'transport-records.json'), 'utf8'),
      );
      expect(afterStale).toHaveLength(35);
      cached.ratingInputs[0].sequenceHash = '0'.repeat(64);
      await writeFile(cachedPath, JSON.stringify(cached));
      await expect(runNarrativeEvaluation(options)).rejects.toMatchObject({
        code: 'EVAL_RATING_INVALID',
      });
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 120000);
});
