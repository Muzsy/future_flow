import { z } from 'zod';
import {
  scenarioTemplateSchema,
  publicPreviewCopySchema,
  forkCheckpointSchema,
  type ForkCheckpoint,
  type ScenarioTemplate,
} from '@future-flow/contracts';
import { hash } from '@future-flow/core';
import type { Database, LifeJob } from '@future-flow/database';

// A model is evidence, not the final editor. An exception needs a protected,
// individually reasoned disposition covering every exact finding and source.
export const catalogAuditDispositionSchema = z
  .object({
    at: z.iso.datetime(),
    actor: z.string().trim().min(3).max(200),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    auditHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourcePeriodsHash: z.string().regex(/^[a-f0-9]{64}$/),
    completeCopyAndCanonRead: z.literal(true),
    noUnresolvedFactOrLanguageFault: z.literal(true),
    findings: z
      .array(
        z
          .object({
            issueHash: z.string().regex(/^[a-f0-9]{64}$/),
            disposition: z.enum([
              'false_positive',
              'accepted_style_limitation',
            ]),
            evidence: z.string().trim().min(80).max(3000),
          })
          .strict(),
      )
      .min(1)
      .max(18),
  })
  .strict();
export function validateCatalogAuditDisposition(
  raw: unknown,
  source: {
    contentHash: string;
    audit: { issues: unknown[] };
    periods: unknown;
  },
) {
  const record = catalogAuditDispositionSchema.parse(raw);
  const expected = source.audit.issues.map((i) => hash(i)).sort();
  const actual = record.findings.map((i) => i.issueHash).sort();
  if (
    record.contentHash !== source.contentHash ||
    record.auditHash !== hash(source.audit) ||
    record.sourcePeriodsHash !==
      hash(JSON.parse(JSON.stringify(source.periods))) ||
    new Set(actual).size !== actual.length ||
    hash(expected) !== hash(actual)
  )
    throw Error(
      'Editorial disposition must cover every exact audit finding, complete copy and original canon',
    );
  return record;
}

export const catalogCopyCorrectionSchema = z
  .object({
    branchId: z.uuid(),
    sourceRevision: z.number().int().nonnegative(),
    originalCopyHash: z.string().regex(/^[a-f0-9]{64}$/),
    copy: publicPreviewCopySchema,
    sourceCanonUnchanged: z.literal(true),
    note: z.string().trim().min(30).max(3000),
  })
  .strict();
export function catalogCorrectedCopy(
  raw: unknown,
  source: { branchId: string; sourceRevision: number; copy: unknown },
) {
  const record = catalogCopyCorrectionSchema.parse(raw);
  if (
    record.branchId !== source.branchId ||
    record.sourceRevision !== source.sourceRevision ||
    record.originalCopyHash !== hash(source.copy)
  )
    throw Error(
      'Editorial correction must match the unchanged exact source copy',
    );
  return record.copy;
}

// A failed deterministic preflight has not created a preview or paid review.
// Its original attempt stays intact. The explicit corrected stage is limited
// to removing source labels from an otherwise separately reviewed copy.
export function assertCatalogPrivacyCorrection(raw: unknown) {
  const input = z
    .object({
      expectedOriginalCopyHash: z.string().regex(/^[a-f0-9]{64}$/),
      originalCopyHash: z.string().regex(/^[a-f0-9]{64}$/),
      correctedCopyHash: z.string().regex(/^[a-f0-9]{64}$/),
      sourceRevision: z.number().int().nonnegative(),
      currentRevision: z.number().int().nonnegative(),
      priorDrafts: z.literal(0),
      originalIssueCodes: z.array(z.literal('private_label')).min(1),
      correctedIssueCount: z.literal(0),
    })
    .strict()
    .parse(raw);
  if (
    input.expectedOriginalCopyHash !== input.originalCopyHash ||
    input.correctedCopyHash === input.originalCopyHash ||
    input.sourceRevision !== input.currentRevision
  )
    throw Error(
      'Privacy correction requires the exact unchanged failed source and a cleared edited copy',
    );
  return input;
}

// Expiry requires a new immutable preview and full review, never extending the
// stored deadline or reusing a paid request. Evidence remains bound to the copy.
export function assertCatalogPreviewRenewal(raw: unknown) {
  const input = z
    .object({
      expectedContentHash: z.string().regex(/^[a-f0-9]{64}$/),
      contentHash: z.string().regex(/^[a-f0-9]{64}$/),
      sourceRevision: z.number().int().nonnegative(),
      currentRevision: z.number().int().nonnegative(),
      expired: z.literal(true),
      published: z.literal(false),
      reviewVerdict: z.literal('no_findings'),
      renewals: z.number().int().min(0).max(1),
    })
    .strict()
    .parse(raw);
  if (
    input.expectedContentHash !== input.contentHash ||
    input.sourceRevision !== input.currentRevision
  )
    throw Error(
      'Expired preview renewal requires the exact unchanged reviewed source',
    );
  return input;
}

// Only a dated, non-executable goal note may be clarified. The repository still
// independently compares the complete checkpoint with its unchanged canon.
export const catalogCheckpointNotesSchema = z
  .object({
    branchId: z.uuid(),
    sourceRevision: z.number().int().nonnegative(),
    sourceCanonUnchanged: z.literal(true),
    note: z.string().trim().min(30).max(3000),
    corrections: z
      .array(
        z
          .object({
            decisionKey: z.string().regex(/^decision-[1-9][0-9]{0,2}$/),
            originalCheckpointHash: z.string().regex(/^[a-f0-9]{64}$/),
            goalKey: z.string().regex(/^goal-[1-9][0-9]{0,2}$/),
            originalNote: scenarioTemplateSchema.shape.goals.element.shape.note,
            replacementNote:
              scenarioTemplateSchema.shape.goals.element.shape.note,
          })
          .strict(),
      )
      .min(1)
      .max(15),
  })
  .strict();
export function catalogCorrectedCheckpoint(
  raw: unknown,
  source: { branchId: string; sourceRevision: number },
  checkpoint: ForkCheckpoint,
) {
  const record = catalogCheckpointNotesSchema.parse(raw);
  if (
    record.branchId !== source.branchId ||
    record.sourceRevision !== source.sourceRevision
  )
    throw Error(
      'Checkpoint clarification must match its unchanged exact source',
    );
  const original = forkCheckpointSchema.parse(checkpoint);
  const corrected = structuredClone(original);
  const seen = new Set<string>();
  for (const change of record.corrections) {
    const key = change.decisionKey + ':' + change.goalKey;
    if (seen.has(key)) throw Error('Duplicate checkpoint clarification');
    seen.add(key);
    if (change.decisionKey !== original.decision.key) continue;
    const goal = corrected.goals.find((g) => g.key === change.goalKey);
    if (
      change.originalCheckpointHash !== hash(original) ||
      !goal ||
      goal.note !== change.originalNote
    )
      throw Error('Stale or foreign checkpoint clarification');
    goal.note = change.replacementNote;
  }
  return forkCheckpointSchema.parse(corrected);
}

export const catalogCheckpointLabelsSchema = z
  .object({
    branchId: z.uuid(),
    sourceRevision: z.number().int().nonnegative(),
    note: z.string().trim().min(30).max(3000),
    corrections: z
      .array(
        z
          .object({
            decisionKey: z.string().regex(/^decision-[1-9][0-9]{0,2}$/),
            originalCheckpointHash: z.string().regex(/^[a-f0-9]{64}$/),
            checkpoint: forkCheckpointSchema,
          })
          .strict(),
      )
      .min(1)
      .max(15),
  })
  .strict();
export function catalogCorrectedCheckpointLabels(
  raw: unknown,
  source: { branchId: string; sourceRevision: number },
  checkpoint: ForkCheckpoint,
) {
  const record = catalogCheckpointLabelsSchema.parse(raw),
    original = forkCheckpointSchema.parse(checkpoint);
  if (
    record.branchId !== source.branchId ||
    record.sourceRevision !== source.sourceRevision
  )
    throw Error(
      'Checkpoint labels require the exact unchanged branch revision',
    );
  if (
    new Set(record.corrections.map((c) => c.decisionKey)).size !==
    record.corrections.length
  )
    throw Error('Duplicate checkpoint label edit');
  const change = record.corrections.find(
    (c) => c.decisionKey === original.decision.key,
  );
  if (!change) return original;
  if (
    change.originalCheckpointHash !== hash(original) ||
    change.checkpoint.decision.key !== original.decision.key
  )
    throw Error('Stale or foreign checkpoint label edit');
  function withoutLabels(value: ForkCheckpoint) {
    const copy = structuredClone(value);
    for (const asset of copy.startingState.ownedAssets) asset.label = 'Asset';
    for (const opportunity of copy.startingState.opportunities)
      opportunity.title = 'Opportunity';
    for (const option of copy.decision.options)
      for (const effect of option.changes) {
        if (effect.type === 'asset_add') effect.value.label = 'Asset';
        if (effect.type === 'opportunity_set')
          effect.value.title = 'Opportunity';
      }
    return copy;
  }
  if (hash(withoutLabels(original)) !== hash(withoutLabels(change.checkpoint)))
    throw Error(
      'Only asset and opportunity labels may be clarified; all other prose and executable facts stay exact',
    );
  const labels = new Map<string, string>();
  function same(key: string, label: string) {
    if (labels.has(key) && labels.get(key) !== label)
      throw Error(
        'One reference must retain one label throughout the checkpoint',
      );
    labels.set(key, label);
  }
  for (const asset of change.checkpoint.startingState.ownedAssets)
    same(asset.key, asset.label);
  for (const opportunity of change.checkpoint.startingState.opportunities)
    same(opportunity.key, opportunity.title);
  for (const option of change.checkpoint.decision.options)
    for (const effect of option.changes) {
      if (effect.type === 'asset_add')
        same(effect.value.key, effect.value.label);
      if (effect.type === 'opportunity_set')
        same(effect.value.key, effect.value.title);
    }
  return change.checkpoint;
}

export async function claimCatalogJob(
  tx: Database,
  userId: string,
  jobId: string,
  leaseToken: string,
) {
  // Exhaust the ordinary worker's lease-attempt allowance up front. A crashed
  // operator must never fall through to a worker using a different allowance.
  // This counter is a retry fence, not a count of actual provider calls.
  const [job] = await tx.query<LifeJob>(
    "UPDATE aw_jobs SET status='running',attempt=5,checkpoints=checkpoints||'{\"catalogOperatorLease\":true}'::jsonb,lease_token=$3,lease_until=now()+interval '15 minutes' WHERE id=$1 AND user_id=$2 AND status='queued' RETURNING *",
    [jobId, userId, leaseToken],
  );
  if (!job)
    throw Error('Catalog job must be claimed inside its creation transaction');
  return job;
}

const editorialBase = {
  at: z.iso.datetime(),
  actor: z.string().trim().min(3).max(200),
  reviewId: z.uuid(),
  privacyChecked: z.literal(true),
  contentChecked: z.literal(true),
  qualityChecked: z.literal(true),
  fictionalSourceChecked: z.literal(true),
  rightsChecked: z.literal(true),
  note: z.string().trim().min(30).max(3000),
};
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const catalogSourceEditorialSchema = z
  .object({
    ...editorialBase,
    templateHash: digest,
    reportHash: digest,
    meaningChecked: z.literal(true),
  })
  .strict();
export const catalogLifeEditorialSchema = z
  .object({
    ...editorialBase,
    contentHash: digest,
    reviewHash: digest,
    auditHash: digest,
    consistencyChecked: z.literal(true),
  })
  .strict();

export const catalogPublicationApprovalSchema = z
  .object({
    at: z.iso.datetime(),
    actor: z.string().trim().min(3).max(200),
    contentHash: digest,
    previewId: z.uuid(),
    previewHash: digest,
    snapshotHash: digest,
    editorialApprovalHash: digest,
    fullSnapshotReviewed: z.literal(true),
    privacyChecked: z.literal(true),
    fictionalSourceChecked: z.literal(true),
    rightsChecked: z.literal(true),
    betaOnly: z.literal(true),
    settings: z
      .object({
        visibility: z.literal('public'),
        authorMode: z.literal('anonymous'),
        indexable: z.literal(false),
      })
      .strict(),
    note: z.string().trim().min(30).max(3000),
  })
  .strict();
export function validateCatalogPublicationApproval(
  raw: unknown,
  source: {
    preview: {
      previewId: string;
      previewHash: string;
      snapshotHash: string;
      binding: { contentHash: string };
      settings: unknown;
    };
    editorial: unknown;
  },
) {
  const record = catalogPublicationApprovalSchema.parse(raw);
  const p = source.preview;
  if (
    record.contentHash !== p.binding.contentHash ||
    record.previewId !== p.previewId ||
    record.previewHash !== p.previewHash ||
    record.snapshotHash !== p.snapshotHash ||
    record.editorialApprovalHash !==
      hash(catalogLifeEditorialSchema.parse(source.editorial)) ||
    hash(record.settings) !== hash(p.settings)
  )
    throw Error(
      'Explicit publication approval must match the exact preview and separate full editorial decision',
    );
  return record;
}

export const catalogExecutionSchema = z
  .object({
    runId: z.uuid(),
    planHash: z.string().regex(/^[a-f0-9]{64}$/),
    window: z
      .object({ startsAt: z.iso.datetime(), endsAt: z.iso.datetime() })
      .strict(),
    seedCaps: z
      .object({ openaiUsd: z.literal(6), claudeUsd: z.literal(1) })
      .strict(),
    betaReserve: z
      .object({ openaiUsd: z.literal(2), claudeUsd: z.literal(1) })
      .strict(),
  })
  .strict()
  .refine(
    (e) =>
      Date.parse(e.window.endsAt) - Date.parse(e.window.startsAt) ===
      7 * 86400000,
    'Catalog window must be the original fixed seven-day window',
  );

export function assertCatalogExecutionMatches(
  raw: unknown,
  state: {
    runId: string;
    planHash: string;
    window: { startsAt: string; endsAt: string };
  },
) {
  const execution = catalogExecutionSchema.parse(raw);
  if (
    hash({
      runId: execution.runId,
      planHash: execution.planHash,
      window: execution.window,
    }) !==
    hash({ runId: state.runId, planHash: state.planHash, window: state.window })
  )
    throw Error(
      'Catalog execution changed: never reset or renew its budget window',
    );
  return execution;
}

// Only the accepted replacement allowance; old production/research approvals fail.
export const catalogApprovalSchema = z.object({
  totalUsd: z.literal(10),
  providerCaps: z.object({ openai: z.literal(8), anthropic: z.literal(2) }),
  catalog: z.object({
    officialLives: z.literal(15),
    scenarios: z.literal(5),
    periodsPerLife: z.literal(3),
    locale: z.literal('en'),
    claudeAuditEveryLife: z.literal(true),
  }),
  beta: z.object({ maximumUsers: z.literal(10) }),
  allocation: z.object({
    seed: z.object({ openaiUsd: z.literal(6), claudeUsd: z.literal(1) }),
    betaUsage: z.object({ openaiUsd: z.literal(2), claudeUsd: z.literal(1) }),
  }),
  fullCatalogDeferredUntilAfterClosedBeta: z.literal(true),
  fullPublicLaunchSeparate: z.literal(true),
  automaticRenewal: z.literal(false),
});
export const catalogTopics = [
  'career',
  'business',
  'buffer',
  'moving',
  'creative',
] as const;
export type CatalogTopic = (typeof catalogTopics)[number];
export const catalogVariants = {
  a: [0, 0],
  b: [0, 1],
  c: [1, 1],
} as const;
export type CatalogVariant = keyof typeof catalogVariants;
export const catalogModels = {
  writer: 'gpt-6.1-sol',
  auditor: 'claude-sonnet-5-5',
} as const;

function template(
  title: string,
  summary: string,
  category: ScenarioTemplate['goals'][number]['category'],
  goal: string,
  motivation: string,
  workDomain: string,
  skills: string[],
  opportunity: string,
  funds: number,
  hours: number,
  actor: ScenarioTemplate['startingState']['actors'][number],
): ScenarioTemplate {
  return scenarioTemplateSchema.parse({
    schemaVersion: 'scenario-1',
    contentLocale: 'en',
    title,
    summary,
    identity: { mode: 'alternate', label: null, ageBand: '35_44' },
    environment: {
      version: 'fictional-neutral-1',
      description:
        'An entirely fictional contemporary setting. Starting money and opportunities are simulation assumptions, not forecasts or promises. Ordinary effort, limited time and uncertain outcomes matter.',
    },
    goals: [
      {
        key: 'goal-1',
        category,
        description: goal,
        priority: 'primary',
        horizonMonths: 24,
        motivation,
        acceptableTradeoffs: ['Gradual progress', 'A smaller first attempt'],
        unacceptableTradeoffs: [
          'Taking on debt that cannot be managed',
          'Treating close relationships as expendable',
        ],
        status: 'active',
        note: null,
      },
    ],
    startingState: {
      effectiveAt: '2026-10-07',
      employment: { status: 'employed', employerLabel: null, workDomain },
      location: { country: 'US', region: null, housing: 'Rented apartment' },
      finance: { currency: 'USD', monthlyIncome: 2600, liquidFunds: funds },
      ownedAssets: [],
      actors: [actor],
      skills,
      opportunities: [
        {
          key: 'opportunity-1',
          title: opportunity,
          status: 'open',
          expiresAt: null,
        },
      ],
      resources: { energy: 55, availableHoursPerWeek: hours },
    },
    constraints: [
      {
        key: 'constraint-1',
        description:
          'Prefer to keep a modest financial buffer while making progress.',
        strength: 'soft',
        scope: 'life',
        validFrom: '2026-10-07',
        validUntil: null,
        predicate: {
          type: 'liquid_funds_at_least',
          currency: 'USD',
          amount: 1000,
        },
      },
    ],
  });
}

export function catalogTemplates(): Record<CatalogTopic, ScenarioTemplate> {
  return {
    career: template(
      'A new skill, without a clean break',
      'A steady administrative job pays the bills, but learning something new may open a different working life. The challenge is finding time before making a major commitment.',
      'education',
      'Develop practical data-analysis skills and test whether a career change fits.',
      'Have work that feels more engaging without gambling away stability.',
      'Office administration',
      ['Office administration', 'Basic spreadsheet use'],
      'An evening introductory data-analysis course',
      4200,
      8,
      { key: 'actor-1', label: 'A close friend', relationship: 'friend' },
    ),
    business: template(
      'The first small service',
      'A practical repair skill could become a small weekend service. There are no customers or business assets yet, and limited spare time makes the first commitment matter.',
      'business',
      'Test a small bicycle-repair service alongside a regular job.',
      'Learn whether independent work can be useful and sustainable.',
      'Customer support',
      ['Customer support', 'Basic bicycle maintenance'],
      'A low-cost introductory workshop on running a small service business',
      3600,
      6,
      { key: 'actor-1', label: 'A friend who cycles', relationship: 'friend' },
    ),
    buffer: template(
      'Room to breathe again',
      'A period of unexpected expenses has left little cash in reserve. Regular work continues, but rebuilding a buffer competes with time, fatigue and the wish for an ordinary social life.',
      'finance',
      'Rebuild a manageable financial buffer through realistic spending and work choices.',
      'Feel less exposed when an ordinary unexpected expense appears.',
      'Retail operations',
      ['Retail operations', 'Basic household budgeting'],
      'An optional extra shift at the current workplace',
      1300,
      5,
      { key: 'actor-1', label: 'A sibling', relationship: 'family' },
    ),
    moving: template(
      'A different city, the same people',
      'A possible move promises a change of scene, but there is no new job or home waiting. Exploring it means weighing money and unfamiliar routines against a valued relationship at home.',
      'lifestyle',
      'Explore a move to another city while maintaining a close friendship.',
      'Find a place and rhythm that fit without losing an important connection.',
      'Operations coordination',
      ['Scheduling', 'Operations coordination'],
      'A short exploratory visit to another city',
      4800,
      7,
      {
        key: 'actor-1',
        label: 'A long-standing friend',
        relationship: 'friend',
      },
    ),
    creative: template(
      'Making room for the unfinished work',
      'Creative writing has been pushed aside by a regular working week. Returning to it starts with unfinished ideas, limited energy and the awkward prospect of sharing work before it feels ready.',
      'personal_growth',
      'Build a sustainable writing habit and complete a small collection of original short pieces.',
      'Recover a part of life that matters beyond earning a living.',
      'Administrative support',
      ['Administrative support', 'Basic creative writing'],
      'A small local writing group accepting new members',
      3200,
      6,
      { key: 'actor-1', label: 'A supportive friend', relationship: 'friend' },
    ),
  };
}

export function approvedCatalogPlan(raw: unknown) {
  const approval = catalogApprovalSchema.parse(raw);
  const templates = catalogTemplates();
  return {
    approval,
    templates,
    planHash: hash({
      approval,
      templates,
      variants: catalogVariants,
      models: catalogModels,
    }),
  };
}
