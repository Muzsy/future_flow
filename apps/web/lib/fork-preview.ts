import { z } from 'zod';
import {
  forkCheckpointCandidateSchema,
  forkCheckpointViewSchema,
  type ForkCheckpoint,
  type ForkFactChange,
  type PublicPreviewRecord,
} from '@future-flow/contracts';

export type CheckpointCandidate = z.infer<typeof forkCheckpointCandidateSchema>;
export type CheckpointRecord = z.infer<typeof forkCheckpointViewSchema>;
function decisionMatches(
  checkpoint: ForkCheckpoint,
  preview: PublicPreviewRecord,
) {
  const decision = preview.snapshot.periods.find(
    (p) => p.decision.key === checkpoint.decision.key,
  )?.decision;
  if (
    !decision ||
    decision.prompt !== checkpoint.decision.prompt ||
    decision.options.length !== checkpoint.decision.options.length ||
    decision.options.some((option, i) => {
      const other = checkpoint.decision.options[i]!;
      return (
        option.key !== other.key ||
        option.label !== other.label ||
        option.description !== other.description
      );
    })
  )
    throw new Error('Decision details do not match the saved copy');
}
export function checkpointsForPreview(
  candidatesRaw: unknown,
  savedRaw: unknown,
  preview: PublicPreviewRecord,
) {
  const candidates = z
      .array(forkCheckpointCandidateSchema)
      .max(12)
      .parse(candidatesRaw),
    saved = z.array(forkCheckpointViewSchema).max(100).parse(savedRaw);
  if (
    candidates.length !== preview.snapshot.periods.length ||
    candidates.some(
      (candidate, i) =>
        candidate.decisionKey !== preview.snapshot.periods[i]!.decision.key ||
        (candidate.checkpoint === null) !==
          (candidate.unavailableReason !== null) ||
        (candidate.checkpoint &&
          candidate.checkpoint.decision.key !== candidate.decisionKey),
    )
  )
    throw new Error('Decision points do not match the saved copy');
  if (new Set(saved.map((record) => record.checkpointId)).size !== saved.length)
    throw new Error('Duplicate saved decision version');
  candidates.forEach((candidate) => {
    if (candidate.checkpoint) decisionMatches(candidate.checkpoint, preview);
  });
  saved.forEach((record) => {
    if (
      record.draftId !== preview.draftId ||
      record.snapshotHash !== preview.snapshotHash ||
      record.sourceRevision !== preview.sourceRevision
    )
      throw new Error('Saved decision details belong to another copy');
    decisionMatches(record.checkpoint, preview);
  });
  return { candidates, saved };
}

export type CheckpointTextField = {
  path: (string | number)[];
  label: string;
  value: string;
  max: number;
  nullable: boolean;
};
// Explicit editable prose only. Typed facts, references and displayed options stay fixed.
export function checkpointTextFields(checkpoint: ForkCheckpoint) {
  const fields: CheckpointTextField[] = [];
  const add = (
    path: (string | number)[],
    label: string,
    value: string | null,
    max = 160,
    nullable = false,
  ) => fields.push({ path, label, value: value ?? '', max, nullable });
  add(
    ['identity', 'label'],
    'Fictional identity label',
    checkpoint.identity.label,
    160,
    true,
  );
  add(
    ['environment', 'description'],
    'General environment',
    checkpoint.environment.description,
    1000,
  );
  checkpoint.goals.forEach((goal, i) => {
    const root = ['goals', i],
      prefix = `Goal ${i + 1}`;
    add(
      [...root, 'description'],
      `${prefix} · description`,
      goal.description,
      500,
    );
    add(
      [...root, 'motivation'],
      `${prefix} · motivation`,
      goal.motivation,
      500,
      true,
    );
    add([...root, 'note'], `${prefix} · progress note`, goal.note, 400, true);
  });
  const employment = (
    root: (string | number)[],
    value: ForkCheckpoint['startingState']['employment'],
    prefix: string,
  ) =>
    add(
      [...root, 'employerLabel'],
      `${prefix} · workplace description`,
      value.employerLabel,
      160,
      true,
    );
  const location = (
    root: (string | number)[],
    value: ForkCheckpoint['startingState']['location'],
    prefix: string,
  ) => {
    add(
      [...root, 'region'],
      `${prefix} · general area`,
      value.region,
      160,
      true,
    );
    add(
      [...root, 'housing'],
      `${prefix} · housing description`,
      value.housing,
      160,
      true,
    );
  };
  employment(
    ['startingState', 'employment'],
    checkpoint.startingState.employment,
    'Starting employment',
  );
  location(
    ['startingState', 'location'],
    checkpoint.startingState.location,
    'Starting location',
  );
  checkpoint.startingState.ownedAssets.forEach((asset, i) =>
    add(
      ['startingState', 'ownedAssets', i, 'label'],
      `Asset ${i + 1} · description`,
      asset.label,
    ),
  );
  checkpoint.startingState.actors.forEach((actor, i) =>
    add(
      ['startingState', 'actors', i, 'label'],
      `Person ${i + 1} · description`,
      actor.label,
    ),
  );
  checkpoint.startingState.opportunities.forEach((opportunity, i) =>
    add(
      ['startingState', 'opportunities', i, 'title'],
      `Opportunity ${i + 1} · title`,
      opportunity.title,
    ),
  );
  checkpoint.constraints.forEach((constraint, i) =>
    add(
      ['constraints', i, 'description'],
      `Constraint ${i + 1} · description`,
      constraint.description,
      400,
    ),
  );
  checkpoint.decision.options.forEach((option, i) =>
    option.changes.forEach((change, n) => {
      const root = ['decision', 'options', i, 'changes', n, 'value'],
        prefix = `Option ${i + 1} · consequence ${n + 1}`;
      switch (change.type) {
        case 'employment_set':
          employment(root, change.value, prefix);
          break;
        case 'location_set':
          location(root, change.value, prefix);
          break;
        case 'asset_add':
        case 'actor_add':
          add(
            [...root, 'label'],
            `${prefix} · description`,
            change.value.label,
          );
          break;
        case 'opportunity_set':
          add(
            [...root, 'title'],
            `${prefix} · opportunity title`,
            change.value.title,
          );
          break;
        case 'goal_progress_set':
          add(
            [...root, 'note'],
            `${prefix} · progress note`,
            change.value.note,
            400,
            true,
          );
          break;
      }
    }),
  );
  return fields;
}
export function editCheckpointText(
  checkpoint: ForkCheckpoint,
  path: (string | number)[],
  text: string,
) {
  const field = checkpointTextFields(checkpoint).find(
    (field) => JSON.stringify(field.path) === JSON.stringify(path),
  );
  if (!field) throw new Error('This decision detail is not editable');
  const updated = structuredClone(checkpoint);
  let target = updated as unknown as Record<string, unknown>;
  for (const part of path.slice(0, -1))
    target = target[String(part)] as Record<string, unknown>;
  target[String(path.at(-1))] =
    field.nullable && text.trim() === '' ? null : text;
  return updated;
}

const text = (value: string | number | null) =>
  value === null ? 'Not specified' : String(value).replaceAll('_', ' ');
const money = (value: number | null, currency: string | null) =>
  value === null
    ? 'Not specified'
    : `${value.toLocaleString('en-US')} ${currency ?? '(currency not specified)'}`;
function referenceName(
  catalog: string[],
  key: string,
  kind: string,
  label: string,
) {
  return `${kind} ${catalog.indexOf(key) + 1}: ${label}`;
}
export function checkpointLabels(checkpoint: ForkCheckpoint) {
  const assets = new Map(
      checkpoint.startingState.ownedAssets.map((x) => [x.key, x.label]),
    ),
    actors = new Map(
      checkpoint.startingState.actors.map((x) => [x.key, x.label]),
    ),
    opportunities = new Map(
      checkpoint.startingState.opportunities.map((x) => [x.key, x.title]),
    );
  checkpoint.decision.options.forEach((option) =>
    option.changes.forEach((change) => {
      if (change.type === 'asset_add' && !assets.has(change.value.key))
        assets.set(change.value.key, change.value.label);
      if (change.type === 'actor_add' && !actors.has(change.value.key))
        actors.set(change.value.key, change.value.label);
      if (
        change.type === 'opportunity_set' &&
        !opportunities.has(change.value.key)
      )
        opportunities.set(change.value.key, change.value.title);
    }),
  );
  return {
    assets: new Map(
      [...assets].map(([key, label]) => [
        key,
        referenceName(
          checkpoint.referenceCatalog.assetKeys,
          key,
          'Asset',
          label,
        ),
      ]),
    ),
    actors: new Map(
      [...actors].map(([key, label]) => [
        key,
        referenceName(
          checkpoint.referenceCatalog.actorKeys,
          key,
          'Person',
          label,
        ),
      ]),
    ),
    opportunities: new Map(
      [...opportunities].map(([key, label]) => [
        key,
        referenceName(
          checkpoint.referenceCatalog.opportunityKeys,
          key,
          'Opportunity',
          label,
        ),
      ]),
    ),
  };
}
export function predicateDescription(
  predicate: ForkCheckpoint['constraints'][number]['predicate'],
  checkpoint: ForkCheckpoint,
) {
  switch (predicate.type) {
    case 'employment_status_is':
      return `Employment status: ${text(predicate.value)}`;
    case 'country_is':
      return `Country: ${text(predicate.value)}`;
    case 'asset_is_owned':
      return `${checkpointLabels(checkpoint).assets.get(predicate.assetKey) ?? referenceName(checkpoint.referenceCatalog.assetKeys, predicate.assetKey, 'Asset', 'not currently owned')} must ${predicate.owned ? 'be owned' : 'not be owned'}`;
    case 'liquid_funds_at_least':
      return `Liquid funds at least ${money(predicate.amount, predicate.currency)}`;
  }
}
function employmentDescription(
  value: ForkCheckpoint['startingState']['employment'],
) {
  return `Status: ${text(value.status)}; workplace: ${text(value.employerLabel)}; work area: ${text(value.workDomain)}`;
}
function locationDescription(
  value: ForkCheckpoint['startingState']['location'],
) {
  return `Country: ${text(value.country)}; area: ${text(value.region)}; housing: ${text(value.housing)}`;
}
function financeDescription(value: ForkCheckpoint['startingState']['finance']) {
  return `Currency: ${text(value.currency)}; monthly income: ${money(value.monthlyIncome, value.currency)}; liquid funds: ${money(value.liquidFunds, value.currency)}`;
}
function resourcesDescription(
  value: ForkCheckpoint['startingState']['resources'],
) {
  return `Energy: ${value.energy === null ? 'Not specified' : `${value.energy} / 100`}; available time: ${text(value.availableHoursPerWeek)} hours per week`;
}
export function changeDescription(
  change: ForkFactChange,
  checkpoint: ForkCheckpoint,
) {
  switch (change.type) {
    case 'employment_set':
      return `Employment becomes — ${employmentDescription(change.value)}`;
    case 'location_set':
      return `Location becomes — ${locationDescription(change.value)}`;
    case 'finance_set':
      return `Finances become — ${financeDescription(change.value)}`;
    case 'asset_add':
      return `Add ${referenceName(checkpoint.referenceCatalog.assetKeys, change.value.key, 'asset', change.value.label)}; kind: ${text(change.value.kind)}; ownership: ${change.value.sharePercent}%`;
    case 'asset_remove':
      return `Give up ownership: ${checkpointLabels(checkpoint).assets.get(change.assetKey) ?? 'An asset'}`;
    case 'actor_remove':
      return `Leaves the story: ${checkpointLabels(checkpoint).actors.get(change.actorKey) ?? 'A person'}`;
    case 'actor_add':
      return `Add ${referenceName(checkpoint.referenceCatalog.actorKeys, change.value.key, 'person', change.value.label)}; relationship: ${text(change.value.relationship)}`;
    case 'skill_add':
      return `Add skill: ${change.value}`;
    case 'goal_progress_set':
      return `Goal ${checkpoint.goals.findIndex((goal) => goal.key === change.value.goalKey) + 1} progress: ${checkpoint.goals.find((goal) => goal.key === change.value.goalKey)?.description ?? 'A goal'} — ${text(change.value.status)}; note: ${text(change.value.note)}`;
    case 'opportunity_set':
      return `${referenceName(checkpoint.referenceCatalog.opportunityKeys, change.value.key, 'Opportunity', change.value.title)}; status: ${text(change.value.status)}; expires: ${change.value.expiresAt ?? 'No expiry'}`;
    case 'resources_set':
      return `Resources become — ${resourcesDescription(change.value)}`;
  }
}
export function checkpointStateFacts(checkpoint: ForkCheckpoint) {
  const state = checkpoint.startingState,
    labels = checkpointLabels(checkpoint);
  return [
    ['Date', state.effectiveAt],
    [
      'Identity',
      `${checkpoint.identity.label ?? 'Fictional identity'}; age range: ${checkpoint.identity.ageBand.replace('_', '–')}`,
    ],
    ['Environment', checkpoint.environment.description],
    ['Employment', employmentDescription(state.employment)],
    ['Location', locationDescription(state.location)],
    ['Finances', financeDescription(state.finance)],
    ['Resources', resourcesDescription(state.resources)],
    ['Skills', state.skills.join(', ') || 'None recorded'],
    [
      'Assets',
      state.ownedAssets
        .map(
          (asset) =>
            `${labels.assets.get(asset.key)} (${text(asset.kind)}, ${asset.sharePercent}% owned)`,
        )
        .join('; ') || 'None recorded',
    ],
    [
      'People',
      state.actors
        .map(
          (actor) =>
            `${labels.actors.get(actor.key)} (${text(actor.relationship)})`,
        )
        .join('; ') || 'None recorded',
    ],
    [
      'Opportunities',
      state.opportunities
        .map(
          (opportunity) =>
            `${labels.opportunities.get(opportunity.key)} (${text(opportunity.status)}, expires: ${opportunity.expiresAt ?? 'No expiry'})`,
        )
        .join('; ') || 'None recorded',
    ],
  ];
}
