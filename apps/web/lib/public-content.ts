import { z } from 'zod';
import {
  publicContentWorkspaceSchema,
  publicContentViewSchema,
  forkCheckpointViewSchema,
  type PublicPreviewRecord,
} from '@future-flow/contracts';
export function canonicalPublicContent(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, child]) => [key, normalize(child)]),
      );
    return item;
  };
  return JSON.stringify(normalize(value));
}
async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalPublicContent(value)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export { digest as publicContentHash };
export async function contentBundlesForPreview(
  raw: unknown,
  savedRaw: unknown,
  preview: PublicPreviewRecord,
) {
  const data = publicContentWorkspaceSchema.parse(raw),
    saved = z.array(forkCheckpointViewSchema).max(100).parse(savedRaw);
  const { snapshotKey: _id, ...snapshot } = preview.snapshot;
  for (const source of saved) {
    const period = preview.snapshot.periods.find(
      (p) => p.decision.key === source.checkpoint.decision.key,
    );
    if (
      !period ||
      source.draftId !== preview.draftId ||
      source.snapshotHash !== preview.snapshotHash ||
      source.sourceRevision !== preview.sourceRevision ||
      source.checkpointHash !== (await digest(source.checkpoint)) ||
      source.checkpoint.startingState.effectiveAt !== period.endDate ||
      source.checkpoint.decision.prompt !== period.decision.prompt ||
      canonicalPublicContent(
        source.checkpoint.decision.options.map((o) => ({
          key: o.key,
          label: o.label,
          description: o.description,
        })),
      ) !== canonicalPublicContent(period.decision.options)
    )
      throw new Error('Saved checkpoint binding failed');
  }
  if (
    new Set(data.bundles.map((b) => b.bundleId)).size !== data.bundles.length ||
    new Set(saved.map((c) => c.checkpointId)).size !== saved.length
  )
    throw new Error('Duplicate preparation');
  for (const bundle of data.bundles) {
    publicContentViewSchema.parse(bundle);
    if (
      bundle.draftId !== preview.draftId ||
      bundle.snapshotHash !== preview.snapshotHash ||
      bundle.sourceRevision !== preview.sourceRevision ||
      canonicalPublicContent(bundle.content.snapshot) !==
        canonicalPublicContent(snapshot) ||
      bundle.contentHash !== (await digest(bundle.content)) ||
      bundle.selection.length !== bundle.content.checkpoints.length ||
      new Set(bundle.selection.map((c) => c.decisionKey)).size !==
        bundle.selection.length
    )
      throw new Error('Content binding failed');
    let previous = -1;
    for (const [i, selected] of bundle.selection.entries()) {
      const point = bundle.content.checkpoints[i]!,
        source = saved.find((c) => c.checkpointId === selected.checkpointId),
        periodIndex = preview.snapshot.periods.findIndex(
          (p) => p.decision.key === selected.decisionKey,
        ),
        period = preview.snapshot.periods[periodIndex];
      if (
        !source ||
        !period ||
        periodIndex <= previous ||
        source.draftId !== preview.draftId ||
        source.snapshotHash !== preview.snapshotHash ||
        source.sourceRevision !== preview.sourceRevision ||
        source.checkpointHash !== selected.checkpointHash ||
        source.checkpointHash !== (await digest(point)) ||
        canonicalPublicContent(source.checkpoint) !==
          canonicalPublicContent(point) ||
        point.decision.key !== selected.decisionKey ||
        point.startingState.effectiveAt !== period.endDate ||
        point.decision.prompt !== period.decision.prompt ||
        canonicalPublicContent(
          point.decision.options.map((o) => ({
            key: o.key,
            label: o.label,
            description: o.description,
          })),
        ) !== canonicalPublicContent(period.decision.options)
      )
        throw new Error('Checkpoint binding failed');
      previous = periodIndex;
    }
  }
  return { data, saved };
}
